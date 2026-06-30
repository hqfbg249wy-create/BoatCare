// Edge Function: admin-market-report-ai
//
// Formuliert aus den Marktbericht-Daten (RPC admin_market_report) einen
// fertigen Text — wahlweise als Provider-Newsletter/E-Mail (B2B) oder als
// Pressemeldung (PR), um die Marktbedeutung von Skipily zu steigern.
//
// Body: { report: <jsonb aus admin_market_report>, target: 'provider'|'press', lang?: 'de' }
// Response: { text: string }
//
// Auth: muss eingeloggter Voll-Admin sein (profiles.role = 'admin').

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1600;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: { user }, error: authErr } = await sb.auth.getUser();
    if (authErr || !user) return json({ error: "Ungültiger Token" }, 401);

    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (!prof || prof.role !== "admin") return json({ error: "forbidden: full admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const report = body?.report;
    const target = body?.target === "press" ? "press" : "provider";
    if (!report || typeof report !== "object") return json({ error: "report fehlt" }, 400);

    // ── Kompakte Faktenbasis aus dem Bericht extrahieren
    const num = (n: unknown) => Number(n || 0);
    const kpiEnd = (m: string) => num((report.kpis || []).find((k: any) => k.metric === m)?.end);
    const demand: any[] = report.demand || [];
    const repl: any[] = report.replacement || [];
    const maint: any[] = report.maintenance || [];
    const totals = report.totals || {};

    const risers = demand.filter((x) => num(x.delta) > 0).sort((a, b) => b.delta - a.delta).slice(0, 5)
      .map((x) => `${x.label}: +${num(x.delta)} (${num(x.start)}→${num(x.end)})`);
    const fallers = demand.filter((x) => num(x.delta) < 0).sort((a, b) => a.delta - b.delta).slice(0, 5)
      .map((x) => `${x.label}: ${num(x.delta)} (${num(x.start)}→${num(x.end)})`);
    const replTop = [...repl].sort((a, b) => num(b.ref?.m12) - num(a.ref?.m12)).slice(0, 5)
      .map((r) => `${r.label}: ${num(r.ref?.m12)} Geräte fällig ≤12 Mon. (Ø Alter ${r.avg_age_years ?? "?"} J., Lebensdauer Ref. ${r.ref_lifespan ?? "?"} J.)`);
    const maintTop = [...maint].sort((a, b) => num(b.overdue) - num(a.overdue)).slice(0, 5)
      .map((m) => `${m.label}: ${num(m.overdue)} überfällig, ${num(m.due_12m)} fällig ≤12 Mon.`);

    const facts = [
      `Zeitraum: ${report.meta?.label ?? "?"}`,
      `Boote in der Flotte: ${kpiEnd("boats_total")}`,
      `Nutzer: ${kpiEnd("users_total")}, Anbieter: ${kpiEnd("providers_total")}, aktive Shops: ${kpiEnd("shops_active_total")}`,
      `Equipment gesamt: ${num(totals.equipment)}`,
      `Wartungen überfällig: ${num(totals.maint_overdue)}, fällig ≤12 Mon.: ${num(totals.maint_due_12m)}`,
      `Altersbedingter Ersatz ≤12 Mon. (Referenz): ${num(totals.repl_ref_12m)}, bereits überfällig: ${num(totals.repl_ref_overdue)}`,
      `Steigende Nachfrage:\n  ${risers.join("\n  ") || "—"}`,
      `Sinkende Nachfrage:\n  ${fallers.join("\n  ") || "—"}`,
      `Ersatz-Prognose (Top):\n  ${replTop.join("\n  ") || "—"}`,
      `Wartungsbedarf (Top):\n  ${maintTop.join("\n  ") || "—"}`,
    ].join("\n");

    const systemProvider = `Du bist Marketing-/Vertriebs-Texter für Skipily, eine Plattform für Bootseigner, Werften, Service-Betriebe und Händler. Verfasse einen B2B-Newsletter-/E-Mail-Text an Service-Anbieter und Shops. Ziel: aus den Marktdaten KONKRETE, umsetzbare Handlungsempfehlungen ableiten (was bevorraten, welche Services aktiv anbieten, welche Ersatz-/Wartungswellen vorbereiten). Ton: partnerschaftlich, kompetent, knapp. Struktur: kurze Einleitung, 3–5 konkrete Empfehlungen mit Begründung aus den Zahlen, motivierender Abschluss. Keine erfundenen Zahlen — nutze nur die gelieferten Fakten. Sprache: Deutsch. Gib NUR den fertigen Text aus (keine Vorrede, kein Markdown-Codeblock).`;

    const systemPress = `Du bist PR-/Pressetexter für Skipily, eine Plattform für Bootseigner, Werften, Service-Betriebe und Händler. Verfasse eine kurze, zitierfähige Pressemeldung, die Skipily als datengestützte Marktautorität in der Freizeitschifffahrt positioniert. Struktur: Schlagzeile, Dachzeile, 2–3 Absätze Fließtext mit den aussagekräftigsten Marktdaten, ein Zitat (z. B. der Geschäftsführung), Boilerplate-Absatz „Über Skipily". Seriös, faktenbasiert, keine Übertreibung, keine erfundenen Zahlen — nutze nur die gelieferten Fakten. Wo die Datenbasis noch klein ist, formuliere vorsichtig ("erste Daten zeigen"). Sprache: Deutsch. Gib NUR die fertige Pressemeldung aus.`;

    const userPrompt = `Hier die aggregierten, anonymisierten Marktdaten aus Skipily:\n\n${facts}\n\nBitte erstelle den Text wie in deiner Rolle beschrieben.`;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "AI-Service nicht konfiguriert" }, 500);

    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: target === "press" ? systemPress : systemProvider,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: `AI-Fehler (${resp.status}): ${errText.substring(0, 200)}` }, 502);
    }
    const result = await resp.json();
    const text = result.content?.[0]?.text?.trim() ?? "";
    return json({ text, target });

  } catch (err) {
    console.error("admin-market-report-ai error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
