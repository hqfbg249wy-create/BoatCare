// Edge Function: find-service-providers
//
// Liefert Betriebe zur AUSWAHL fuer eine Angebots-/Service-Anfrage. Optional
// gefiltert nach Stichworten (Kategorie/Leistungen) und Laendern. Der Nutzer
// waehlt danach in der App einzeln oder alle aus und sendet die Anfrage
// (request-quote).
//
// Body: { keywords?: string[], countries?: string[], limit?: number }
// Auth: Bearer <user-jwt> (authenticated).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const svc = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const body = await req.json().catch(() => ({}));
    const { keywords, countries, limit, category_allow, service_terms } = body;
    // Strukturiertes Matching (bevorzugt): Betrieb passt, wenn seine PRIMAER-
    // Kategorie in category_allow liegt (exakt) ODER ein Service-Tag einen der
    // service_terms enthaelt. Das trifft z.B. bei Tauwerk Rigger, Segelmacher
    // UND Chandler, ohne die greedy Teilstring-Treffer der Kategorie "Rigg".
    const catAllow = new Set(
      (Array.isArray(category_allow) ? category_allow : []).map((c) => String(c).trim().toLowerCase()),
    );
    const svcTerms: string[] = (Array.isArray(service_terms) ? service_terms : [])
      .map((s) => String(s).toLowerCase()).filter(Boolean);
    const structured = catAllow.size > 0 || svcTerms.length > 0;

    // Legacy: freies Keyword-Matching ueber alle Felder (fuer aeltere Clients).
    const kws: string[] = Array.isArray(keywords)
      ? keywords.map((k) => String(k).toLowerCase()).filter(Boolean) : [];
    const cts: string[] = Array.isArray(countries)
      ? countries.map((c) => String(c)) : [];
    const cap = Math.max(1, Math.min(1000, Number(limit) || 800));

    const { data: rows } = await svc
      .from("service_providers")
      .select("id, name, city, country, email, category, categories, category2, category3, services")
      .limit(10000);

    const provCats = (p: Record<string, unknown>): string[] => {
      const out: string[] = [];
      for (const f of ["category", "category2", "category3"]) {
        if (p[f]) out.push(String(p[f]).trim().toLowerCase());
      }
      const v = p["categories"];
      if (Array.isArray(v)) out.push(...v.map((x) => String(x).trim().toLowerCase()));
      return out;
    };
    const provServices = (p: Record<string, unknown>): string[] => {
      const v = p["services"];
      if (Array.isArray(v)) return v.map((x) => String(x).toLowerCase());
      return v ? [String(v).toLowerCase()] : [];
    };
    const hay = (p: Record<string, unknown>): string =>
      [...provCats(p), ...provServices(p)].join(" ");

    let list = (rows || []).filter((p) => {
      if (cts.length && !cts.includes(String(p.country ?? ""))) return false;
      if (structured) {
        const inCat = catAllow.size > 0 && provCats(p).some((c) => catAllow.has(c));
        const inSvc = svcTerms.length > 0 &&
          provServices(p).some((s) => svcTerms.some((t) => s.includes(t)));
        return inCat || inSvc;
      }
      if (kws.length) {
        const h = hay(p);
        if (!kws.some((k) => h.includes(k))) return false;
      }
      return true;
    });

    // Nach Land, dann Name sortieren; auf cap begrenzen.
    list.sort((a, b) =>
      String(a.country ?? "").localeCompare(String(b.country ?? "")) ||
      String(a.name ?? "").localeCompare(String(b.name ?? "")));
    const total = list.length;
    list = list.slice(0, cap);

    // Verfuegbare Laender (fuer den Filter im UI) aus dem Keyword-Treffer-Set.
    const countryCounts: Record<string, number> = {};
    for (const p of list) {
      const c = String(p.country ?? "");
      if (c) countryCounts[c] = (countryCounts[c] || 0) + 1;
    }

    return json({
      ok: true,
      total,
      countries: Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([country, count]) => ({ country, count })),
      providers: list.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city ?? null,
        country: p.country ?? null,
        category: p.category ?? null,
        has_email: !!p.email,
      })),
    });
  } catch (err) {
    console.error("find-service-providers FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
