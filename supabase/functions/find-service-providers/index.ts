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
    const { keywords, countries, limit, category_allow, service_terms, name_terms } = body;
    // Strukturiertes Matching (bevorzugt): Betrieb passt, wenn sein NAME einen
    // starken Begriff enthaelt (z.B. "tauwerk"/"ropes"), ODER ein Service-Tag
    // einen der service_terms, ODER die PRIMAER-Kategorie in category_allow liegt.
    // Ranking danach: Name-Treffer zuerst, dann Service, dann Kategorie.
    const catAllow = new Set(
      (Array.isArray(category_allow) ? category_allow : []).map((c) => String(c).trim().toLowerCase()),
    );
    const svcTerms: string[] = (Array.isArray(service_terms) ? service_terms : [])
      .map((s) => String(s).toLowerCase()).filter(Boolean);
    const nameTerms: string[] = (Array.isArray(name_terms) ? name_terms : [])
      .map((s) => String(s).toLowerCase()).filter(Boolean);
    const structured = catAllow.size > 0 || svcTerms.length > 0 || nameTerms.length > 0;

    // Legacy: freies Keyword-Matching ueber alle Felder (fuer aeltere Clients).
    const kws: string[] = Array.isArray(keywords)
      ? keywords.map((k) => String(k).toLowerCase()).filter(Boolean) : [];
    const cts: string[] = Array.isArray(countries)
      ? countries.map((c) => String(c)) : [];
    const cap = Math.max(1, Math.min(1000, Number(limit) || 800));

    const { data: rows } = await svc
      .from("service_providers")
      .select("id, name, city, country, email, category, categories, category2, category3, services, rating")
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

    // Relevanz-Score: Name-Treffer (starkes Signal fuer dedizierte Betriebe,
    // z.B. "Tauwerk-Discount", "Premiumropes") ganz oben, dann Service-Tag,
    // dann Kategorie. 0 = kein Treffer (fliegt raus).
    const scoreOf = (p: Record<string, unknown>): number => {
      let s = 0;
      const nm = String(p.name ?? "").toLowerCase();
      if (nameTerms.length && nameTerms.some((t) => nm.includes(t))) s += 100;
      if (svcTerms.length && provServices(p).some((sv) => svcTerms.some((t) => sv.includes(t)))) s += 50;
      if (catAllow.size && provCats(p).some((c) => catAllow.has(c))) s += 10;
      return s;
    };

    let scored = (rows || [])
      .filter((p) => !(cts.length && !cts.includes(String(p.country ?? ""))))
      .map((p) => ({ p, score: structured ? scoreOf(p) : (kws.length ? (kws.some((k) => hay(p).includes(k)) ? 10 : 0) : 1) }))
      .filter((x) => x.score > 0);

    // Sortierung: Score desc, dann Bewertung desc, dann Name.
    scored.sort((a, b) =>
      b.score - a.score ||
      (Number(b.p.rating ?? 0) - Number(a.p.rating ?? 0)) ||
      String(a.p.name ?? "").localeCompare(String(b.p.name ?? "")));
    const total = scored.length;
    let list = scored.slice(0, cap).map((x) => x.p);

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
