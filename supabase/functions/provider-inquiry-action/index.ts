// Edge Function: provider-inquiry-action
//
// Aktionen des Anbieters auf eine Anfrage: 'decline' (ablehnen) oder 'archive'
// (aus der eigenen Liste entfernen). Aufruf aus dem Anbieter-Portal.
//
// Body: { inquiry_id, action: 'decline' | 'archive' }
// Auth: Bearer <user-jwt> eines Mitglieds/Owners des Betriebs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";
import { pushToUser, emailTo } from "../_shared/notify.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

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
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await svc.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return json({ error: "Invalid token" }, 401);

    const { inquiry_id, action } = await req.json();
    if (!inquiry_id || !["decline", "archive"].includes(action)) {
      return json({ error: "inquiry_id und action ('decline'|'archive') erforderlich" }, 400);
    }

    const { data: inq } = await svc
      .from("service_inquiries")
      .select("id, provider_id, owner_id, subject, order_id, offer_status")
      .eq("id", inquiry_id).maybeSingle();
    if (!inq) return json({ error: "Anfrage nicht gefunden" }, 404);

    const { data: isMember } = await userClient.rpc("provider_is_member", { pid: inq.provider_id });
    if (isMember !== true) return json({ error: "Keine Berechtigung fuer diese Anfrage" }, 403);

    if (action === "archive") {
      await svc.from("service_inquiries").update({ provider_archived: true }).eq("id", inquiry_id);
      return json({ ok: true });
    }

    // decline
    if (inq.order_id) {
      return json({ error: "Angebot wurde bereits angenommen, Ablehnung nicht moeglich", code: "already_ordered" }, 409);
    }
    await svc.from("service_inquiries").update({
      offer_status: "declined",
      status: "closed",
      replied_at: new Date().toISOString(),
    }).eq("id", inquiry_id);

    // Kunde informieren (best-effort).
    const ref = inq.subject ? `„${inq.subject}"` : "deine Anfrage";
    await pushToUser(inq.owner_id, "Anfrage abgelehnt",
      `Der Anbieter kann ${ref} leider nicht anbieten.`);
    const { data: buyer } = await svc.from("profiles").select("email, full_name").eq("id", inq.owner_id).maybeSingle();
    if (buyer?.email) {
      await emailTo(buyer.email, "Antwort auf deine Anfrage",
        `Hallo${buyer.full_name ? " " + buyer.full_name : ""},\n\n` +
          `der Anbieter kann ${ref} leider nicht anbieten. Du kannst gerne weitere ` +
          `Betriebe anfragen.\n\nDein Skipily-Team`);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("provider-inquiry-action FAILED:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
