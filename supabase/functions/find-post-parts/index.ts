// =====================================================================
// find-post-parts — Findet zu einem Eigner-Lösungsbeitrag die darin
// erwähnten Artikel/Ersatzteile (z. B. "Temperatursensor") im Skipily-Shop.
//
// Ablauf:
//   1) KI (Claude Haiku) extrahiert bis zu 6 konkrete Artikel/Suchbegriffe
//      aus Titel + Ausrüstung + Text des Beitrags.
//   2) Für jeden Begriff Shop-Suche (RPC search_products).
//   3) Begriffe OHNE Shop-Treffer: NUR für zahlende Abonnenten liefert die
//      KI einen Ersatz (Artikelnummer + Beschreibung). Free-Nutzer sehen
//      stattdessen einen Abo-Hinweis.
//
// KI-Budget: EIN checkAiQuota (feature "chat") deckt Extraktion + Ersatz;
// Verbrauch wird einmal über recordAiUsage verbucht (Nutzerwunsch: Budget).
//
// Input:  { post_id }
// Output: { items: [{ query, matches: [...], fallback: {article_number, description}|null }],
//           paid: bool, quota_exhausted?: bool, upgrade_hint?: string }
// =====================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkAiQuota, recordAiUsage } from "../_shared/aiQuota.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5";

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

interface Match {
  id: string; name: string; manufacturer: string; part_number: string;
  price: number | null; currency: string; image: string | null; provider_id: string | null;
}
interface Item { query: string; matches: Match[]; fallback: { article_number: string; description: string; confidence: string; installed_match: boolean } | null; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Nicht authentifiziert" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: ud } = await userClient.auth.getUser();
    const userId = ud.user?.id;
    if (!userId) return json({ error: "Nicht authentifiziert" }, 401);

    const b = await req.json().catch(() => ({}));
    const postId = str(b.post_id);
    if (!postId) return json({ error: "post_id fehlt" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: post } = await admin.from("news_posts")
      .select("title, subtitle, equipment_ref, body").eq("id", postId).maybeSingle();
    if (!post) return json({ error: "Beitrag nicht gefunden" }, 404);

    // ── Installierte Ausrüstung des Betrachters laden (zum Abgleich, welcher
    // Artikel am wahrscheinlichsten der tatsächlich verbaute ist).
    let installed: Array<{ name: string; manufacturer: string; model: string; part_number: string; item_description: string }> = [];
    {
      const { data: boats } = await admin.from("boats").select("id").eq("owner_id", userId);
      const boatIds = (boats ?? []).map((r: { id: string }) => r.id);
      if (boatIds.length > 0) {
        const { data: eqRows } = await admin.from("equipment")
          .select("name, manufacturer, model, part_number, item_description")
          .in("boat_id", boatIds).limit(120);
        installed = (eqRows ?? []).map((r: Record<string, unknown>) => ({
          name: str(r.name), manufacturer: str(r.manufacturer), model: str(r.model),
          part_number: str(r.part_number), item_description: str(r.item_description),
        })).filter((e) => e.name || e.manufacturer || e.model);
      }
    }
    const installedText = installed.slice(0, 40).map((e) =>
      [e.name, e.manufacturer, e.model, e.part_number ? `Art.: ${e.part_number}` : "", e.item_description]
        .filter(Boolean).join(" · ")).join("\n");

    // ── KI-Budget (einmal). Deckt Extraktion + optionalen Ersatz.
    const quota = await checkAiQuota({ userId, providerId: null, feature: "chat" });
    if (!quota.allowed) {
      return json({
        items: [], paid: false, quota_exhausted: true,
        upgrade_hint: quota.upgradeHint ?? "Die Artikelsuche ist mit einem Skipily-Abo möglich.",
      });
    }
    const source = quota.source ?? "free";
    const paid = source === "basic" || source === "plus" || source === "provider_quota";
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    let usedTokens = 0;

    // ── 1) Artikel/Suchbegriffe extrahieren
    let queries: string[] = [];
    if (apiKey) {
      const prompt = `A boat owner wrote a repair/solution post. Extract the concrete
SPARE PARTS the owner actually needed/replaced according to the post. Rules:
- Focus on the part(s) the BODY describes as defective, replaced or needed
  (e.g. if the body says the CABIN temperature sensor was defective, return that
  specific sensor, NOT every related sensor variant).
- Return AT MOST 3 entries, the single most relevant first.
- Do NOT include the whole appliance/device itself (e.g. the complete heater) as
  a part unless the post is about replacing the whole unit.
- Each entry must be a DIFFERENT physical component. No translations, synonyms or
  minor wording variants of the same part.
- Write every entry in GERMAN. Keep brand/model names as written.
Return ONLY a JSON array of short German search strings, no duplicates.
Title: ${str(post.title)}
Equipment: ${str(post.equipment_ref)}
Body: ${str(post.body).slice(0, 2000)}`;
      try {
        const resp = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
        });
        if (resp.ok) {
          const data = await resp.json();
          usedTokens += (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
          const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
          const arr = JSON.parse(txt);
          if (Array.isArray(arr)) queries = arr.map((x) => str(x)).filter(Boolean);
        } else {
          console.error("extract status:", resp.status, (await resp.text()).slice(0, 200));
        }
      } catch (e) { console.error("extract error:", e); }
    }
    // Hinweis: Das Ausrüstungs-Feld (z. B. das ganze Heizgerät) wird NICHT als
    // eigener Treffer aufgenommen — gesucht werden nur die erwähnten Ersatzteile.
    const eq = str(post.equipment_ref);
    // Dedupe über einen normalisierten Schlüssel (Reihenfolge-/Zeichen-unabhängig),
    // damit "Webasto EVO55 Temperatursensor" und "Temperatursensor Webasto EVO55"
    // nicht doppelt erscheinen. Danach auf 4 begrenzen.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ")
      .split(/\s+/).filter((w) => w.length > 1).sort().join(" ");
    const seenKey = new Set<string>();
    queries = queries.filter((q) => { const k = norm(q); if (!k || seenKey.has(k)) return false; seenKey.add(k); return true; }).slice(0, 4);
    if (queries.length === 0) return json({ items: [], paid });

    // ── 2) Shop-Suche je Begriff (jedes Produkt nur EINMAL im gesamten Ergebnis)
    // Relevanzfilter: search_products ist unscharf (Synonyme/Tippfehler) und
    // liefert auch lose verwandte Produkte. Wir behalten nur Treffer, die die
    // AUSSAGEKRÄFTIGEN Begriffe (Marke/Modell wie "PICO") tatsächlich enthalten,
    // oder deren Artikelnummer zum Begriff passt. So erscheinen keine fremden
    // Shop-Artikel, sondern nur passende Produkte + konkrete Ergänzungen.
    const STOP = new Set([
      "standard","system","set","kit","komplett","complete","pro","basic","plus",
      "original","oem","ersatz","ersatzteil","teil","teile","part","parts","the",
      "and","und","mit","für","fuer","von","der","die","das","eine","einen","zum",
      "boot","marine","neu","new",
    ]);
    const tokensOf = (q: string): string[] =>
      Array.from(new Set(
        q.toLowerCase().replace(/[^a-z0-9äöüß ]/g, " ").split(/\s+/)
          .filter((w) => w.length >= 3 && !STOP.has(w)),
      ));
    const haystackOf = (r: Record<string, unknown>): string =>
      [r.name, r.manufacturer, r.part_number, r.description,
        Array.isArray(r.tags) ? (r.tags as unknown[]).join(" ") : ""]
        .map((x) => String(x ?? "")).join(" ").toLowerCase();
    const relevant = (q: string, r: Record<string, unknown>): boolean => {
      const toks = tokensOf(q);
      if (toks.length === 0) return true; // nichts Distinktives -> RPC-Ranking vertrauen
      const pn = String(r.part_number ?? "").toLowerCase().replace(/\s+/g, "");
      if (pn.length >= 4 && toks.some((t) => {
        const tt = t.replace(/\s+/g, "");
        return tt.length >= 4 && (pn.includes(tt) || tt.includes(pn));
      })) return true; // Artikelnummer-Bezug zählt immer
      const hay = haystackOf(r);
      const hit = toks.filter((t) => hay.includes(t)).length;
      // mindestens die Hälfte der aussagekräftigen Begriffe muss vorkommen.
      return hit >= Math.max(1, Math.ceil(toks.length * 0.5));
    };

    const items: Item[] = [];
    const shownProducts = new Set<string>();
    for (const q of queries) {
      const { data: rows } = await admin.rpc("search_products", { q, p_limit: 8, p_offset: 0 });
      const matches: Match[] = (rows ?? [])
        .filter((r: Record<string, unknown>) => relevant(q, r))
        .filter((r: Record<string, unknown>) => {
          const id = String(r.id);
          if (shownProducts.has(id)) return false;
          shownProducts.add(id);
          return true;
        })
        .slice(0, 4)
        .map((r: Record<string, unknown>) => ({
          id: String(r.id),
          name: str(r.name),
          manufacturer: str(r.manufacturer),
          part_number: str(r.part_number),
          price: typeof r.price === "number" ? r.price : (r.price != null ? Number(r.price) : null),
          currency: str(r.currency) || "€",
          image: Array.isArray(r.images) && r.images.length > 0 ? String(r.images[0]) : null,
          provider_id: r.provider_id ? String(r.provider_id) : null,
        }));
      items.push({ query: q, matches, fallback: null });
    }

    // ── 3) KI-Ersatz (Artikelnummer + Beschreibung) für ALLE mit freiem/bezahltem
    // Kontingent (Free: innerhalb der 10 kostenlosen Anfragen). Erst wenn das
    // Kontingent erschöpft ist, greift oben der quota_exhausted-Hinweis.
    const unmatched = items.filter((it) => it.matches.length === 0);
    if (apiKey && unmatched.length > 0) {
      const prompt = `For each boat spare part below, identify the SINGLE most likely
OEM/article number for THIS owner's actually installed equipment, plus a concise
1-2 sentence German description that helps identify and source it.
Use the owner's installed equipment list to disambiguate when several article
numbers exist (e.g. exhaust vs. cabin temperature sensor): pick the variant that
best matches what the owner has installed. If still ambiguous, choose the most
common one and briefly name the alternative in the description.
Return ONLY a JSON array in the same order, each:
{"article_number":"","description":"","confidence":"high|medium|low","installed_match":true|false}
- "confidence": how sure the article number is.
- "installed_match": true only if the owner's installed equipment clearly supports this exact variant.
- Use empty "article_number" if you are not reasonably sure.
Owner's installed equipment:
${installedText || "(keine Angaben)"}
Context (post equipment): ${eq}
Parts: ${JSON.stringify(unmatched.map((u) => u.query))}`;
      try {
        const resp = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODEL, max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
        });
        if (resp.ok) {
          const data = await resp.json();
          usedTokens += (data?.usage?.input_tokens ?? 0) + (data?.usage?.output_tokens ?? 0);
          const txt = (data?.content?.[0]?.text ?? "").replace(/```json\s*|\s*```/g, "").trim();
          const arr = JSON.parse(txt);
          if (Array.isArray(arr)) {
            unmatched.forEach((u, i) => {
              const f = arr[i];
              if (f) u.fallback = {
                article_number: str(f.article_number),
                description: str(f.description),
                confidence: ["high", "medium", "low"].includes(str(f.confidence)) ? str(f.confidence) : "low",
                installed_match: f.installed_match === true,
              };
            });
          }
        }
      } catch (e) { console.error("fallback error:", e); }
    }

    // ── KI-Nutzung einmal verbuchen
    recordAiUsage({
      platform: req.headers.get("x-skipily-platform"),
      userId, providerId: null, feature: "chat",
      source: source as "free" | "basic" | "plus" | "provider_quota",
      costTokens: usedTokens, metadata: { kind: "find_post_parts", post: postId },
      model: MODEL, inputTokens: 0, outputTokens: usedTokens,
    }).catch(() => null);

    // Kein sofortiger Abo-Hinweis mehr: Free-Nutzer bekommen das volle Ergebnis
    // innerhalb ihrer 10 kostenlosen Anfragen. Der Hinweis kommt oben erst,
    // wenn das Kontingent erschöpft ist (quota_exhausted).
    return json({ items, paid });
  } catch (err) {
    console.error("find-post-parts error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
