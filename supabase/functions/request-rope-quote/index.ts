// Edge Function: request-rope-quote
//
// Sendet eine Tauwerk-Angebotsanfrage an ALLE Tauwerk-Anbieter: legt je Anbieter
// eine service_inquiries-Anfrage an (bestehendes Anfrage-/Antwort-System) und
// benachrichtigt ihn per E-Mail. Tauwerk-Anbieter = Provider mit aktiven
// Produkten in den Tauwerk-Kategorien (Tauwerk / Festmacher & Leinen / Fallen &
// Schoten).
//
// Body: { boat_id?: string, subject: string, message: string }
// Auth: Bearer <user-jwt> des Kaeufers (Eigner).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { emailTo } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Tauwerk-Anbieter erkennt man an ihren Leistungen/Kategorie (Segelmacher,
// Rigger, "Laufendes Gut", "Takelage", "Spleiss" ...). Die Shop-Produkte
// (metashop_products) sind ueberwiegend Elektronik und taugen dafuer nicht.
const ROPE_SERVICE_KEYWORDS = [
  "tauwerk", "laufendes gut", "takelage", "rigg", "spleiss", "spleiß",
  "leine", "festmacher", "running rigging", "cordage",
];
const ROPE_CATEGORY_KEYWORDS = ["segelmacher", "takler", "rigger", "sailmaker"];

function isRopeProvider(p: { category?: string | null; services?: unknown }): boolean {
  const cat = String(p.category ?? "").toLowerCase();
  const services = Array.isArray(p.services) ? (p.services as unknown[]).map((s) => String(s)) : [];
  const hay = [cat, ...services].join(" ").toLowerCase();
  return ROPE_SERVICE_KEYWORDS.some((k) => hay.includes(k)) ||
    ROPE_CATEGORY_KEYWORDS.some((k) => cat.includes(k));
}

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

    const { boat_id, subject, message } = await req.json();
    if (!subject || !message) return json({ error: "subject und message erforderlich" }, 400);

    // Optional: boat_id muss dem Nutzer gehoeren.
    let safeBoatId: string | null = null;
    if (boat_id) {
      const { data: boat } = await svc
        .from("boats").select("id, owner_id").eq("id", boat_id).maybeSingle();
      if (boat && boat.owner_id === user.id) safeBoatId = boat.id;
    }

    // ── Tauwerk-Anbieter finden (ueber Leistungen/Kategorie) ──
    const { data: allProviders } = await svc
      .from("service_providers")
      .select("id, name, email, category, services")
      .limit(10000);
    const providers = (allProviders || []).filter(isRopeProvider);

    if (providers.length === 0) {
      return json({ ok: true, count: 0, note: "Keine Tauwerk-Anbieter gefunden" });
    }

    const buyerName = (await svc.from("profiles").select("full_name").eq("id", user.id).maybeSingle())
      .data?.full_name ?? "";

    const subj = String(subject).slice(0, 200);
    const msg = String(message).slice(0, 4000);

    // ── Je Anbieter: Anfrage anlegen + E-Mail ──
    let count = 0;
    for (const p of providers || []) {
      try {
        await svc.from("service_inquiries").insert({
          owner_id: user.id,
          provider_id: p.id,
          boat_id: safeBoatId,
          subject: subj,
          message: msg,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
        count++;
        if (p.email) {
          await emailTo(
            p.email,
            "Angebotsanfrage Tauwerk" + (buyerName ? " von " + buyerName : ""),
            `${msg}\n\nBitte antworte direkt auf diese Anfrage in deinem Anbieter-Portal ` +
              `(Bereich Anfragen).\n\nDein Skipily-Team`,
          );
        }
      } catch (e) {
        console.error("request-rope-quote insert failed for", p.id, (e as Error).message);
      }
    }

    return json({ ok: true, count });
  } catch (err) {
    console.error("request-rope-quote FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
