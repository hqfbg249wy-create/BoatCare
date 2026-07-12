// Edge Function: sendcloud-connect
//
// Verbindet das Sendcloud-Konto eines Providers per API-Schlüssel
// (Public + Secret Key). Der Provider erzeugt die Schlüssel in seinem
// Sendcloud-Konto unter Einstellungen → Integrationen → Sendcloud API.
//
// Actions (POST body { provider_id, action, public_key?, secret_key? }):
//   • "connect"    — Schlüssel gegen die Sendcloud-API prüfen und speichern
//   • "test"       — bestehende Verbindung erneut prüfen
//   • "disconnect" — Schlüssel entfernen, Status auf 'disconnected'
//
// Sicherheit: Der Secret Key wird NUR hier (service_role) verarbeitet und nie
// an den Client zurückgegeben. Nur Owner/Admin des Betriebs dürfen verbinden.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl        = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Sendcloud REST-API. Der /user-Endpoint eignet sich zur Schlüssel-Prüfung:
// gültige Keys → 200 mit Kontodaten, ungültige → 401.
const SENDCLOUD_API = "https://panel.sendcloud.sc/api/v2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Prüft die Schlüssel gegen Sendcloud und liefert Kontodaten zurück.
async function verifySendcloud(publicKey: string, secretKey: string) {
  const auth = btoa(`${publicKey}:${secretKey}`);
  const res = await fetch(`${SENDCLOUD_API}/user`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    return { ok: false as const, reason: "invalid" };
  }
  if (!res.ok) {
    const txt = (await res.text()).slice(0, 200);
    return { ok: false as const, reason: "api_error", detail: `${res.status} ${txt}` };
  }
  const data = await res.json().catch(() => ({}));
  const u = data?.user ?? {};
  return {
    ok: true as const,
    account_name: u.company_name || u.username || u.name || null,
    account_email: u.email || null,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const accessToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!accessToken) return json({ error: "Nicht authentifiziert" }, 401);

    const body = await req.json().catch(() => ({}));
    const providerId: string | undefined = body.provider_id;
    const action: string = body.action || "status";
    if (!providerId) return json({ error: "provider_id fehlt" }, 400);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) User verifizieren
    const { data: { user }, error: userErr } = await supabase.auth.getUser(accessToken);
    if (userErr || !user) return json({ error: "User-Verifizierung fehlgeschlagen" }, 401);

    // 2) Berechtigung: nur Owner oder Admin des Betriebs darf verbinden/trennen.
    const { data: provider, error: provErr } = await supabase
      .from("service_providers")
      .select("id, user_id")
      .eq("id", providerId)
      .single();
    if (provErr || !provider) return json({ error: "Provider nicht gefunden" }, 404);

    let isOwnerOrAdmin = provider.user_id === user.id;
    if (!isOwnerOrAdmin) {
      const { data: member } = await supabase
        .from("provider_members")
        .select("role")
        .eq("provider_id", providerId)
        .eq("user_id", user.id)
        .maybeSingle();
      isOwnerOrAdmin = member?.role === "owner" || member?.role === "admin";
    }
    if (!isOwnerOrAdmin) return json({ error: "Keine Berechtigung" }, 403);

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    if (action === "disconnect") {
      const { error } = await supabase
        .from("provider_sendcloud")
        .upsert({
          provider_id: providerId,
          public_key: null,
          secret_key: null,
          account_name: null,
          account_email: null,
          status: "disconnected",
          connected_at: null,
          last_checked_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "provider_id" });
      if (error) throw error;
      return json({ status: "disconnected" });
    }

    // ── TEST (bestehende Schlüssel erneut prüfen) ──────────────────────────────
    if (action === "test") {
      const { data: row } = await supabase
        .from("provider_sendcloud")
        .select("public_key, secret_key")
        .eq("provider_id", providerId)
        .maybeSingle();
      if (!row?.public_key || !row?.secret_key) {
        return json({ status: "disconnected", error: "Keine Schlüssel hinterlegt" }, 200);
      }
      const check = await verifySendcloud(row.public_key, row.secret_key);
      const nowIso = new Date().toISOString();
      if (!check.ok) {
        await supabase.from("provider_sendcloud").update({
          status: "error", last_checked_at: nowIso,
          last_error: check.reason === "invalid" ? "invalid_keys" : (check.detail || "api_error"),
        }).eq("provider_id", providerId);
        return json({ status: "error", reason: check.reason });
      }
      await supabase.from("provider_sendcloud").update({
        status: "connected", last_checked_at: nowIso, last_error: null,
        account_name: check.account_name, account_email: check.account_email,
      }).eq("provider_id", providerId);
      return json({
        status: "connected",
        account_name: check.account_name,
        account_email: check.account_email,
      });
    }

    // ── CONNECT (neue Schlüssel prüfen + speichern) ────────────────────────────
    if (action === "connect") {
      const publicKey = (body.public_key || "").toString().trim();
      const secretKey = (body.secret_key || "").toString().trim();
      if (!publicKey || !secretKey) return json({ error: "missing_keys" }, 400);

      const check = await verifySendcloud(publicKey, secretKey);
      if (!check.ok) {
        if (check.reason === "invalid") return json({ error: "invalid_keys" }, 400);
        return json({ error: "api_error", detail: check.detail }, 502);
      }

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("provider_sendcloud")
        .upsert({
          provider_id: providerId,
          public_key: publicKey,
          secret_key: secretKey,
          account_name: check.account_name,
          account_email: check.account_email,
          status: "connected",
          connected_at: nowIso,
          last_checked_at: nowIso,
          last_error: null,
        }, { onConflict: "provider_id" });
      if (error) throw error;

      return json({
        status: "connected",
        account_name: check.account_name,
        account_email: check.account_email,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("sendcloud-connect error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
