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

    const { keywords, countries, limit } = await req.json().catch(() => ({}));
    const kws: string[] = Array.isArray(keywords)
      ? keywords.map((k) => String(k).toLowerCase()).filter(Boolean) : [];
    const cts: string[] = Array.isArray(countries)
      ? countries.map((c) => String(c)) : [];
    const cap = Math.max(1, Math.min(1000, Number(limit) || 500));

    const { data: rows } = await svc
      .from("service_providers")
      .select("id, name, city, country, email, category, categories, category2, category3, services")
      .limit(10000);

    const hay = (p: Record<string, unknown>): string => {
      const parts: string[] = [];
      for (const f of ["category", "category2", "category3"]) {
        if (p[f]) parts.push(String(p[f]));
      }
      for (const f of ["categories", "services"]) {
        const v = p[f];
        if (Array.isArray(v)) parts.push(...v.map((x) => String(x)));
        else if (v) parts.push(String(v));
      }
      return parts.join(" ").toLowerCase();
    };

    let list = (rows || []).filter((p) => {
      if (cts.length && !cts.includes(String(p.country ?? ""))) return false;
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
