// Edge Function: check-ai-quota
//
// Standalone Endpoint zum Vorab-Check des AI-Quotas. Wird vom Frontend
// genutzt um UI-Hinweise zu setzen ("Du hast noch 78/100 Calls") und
// das Upgrade-Sheet zu triggern.
//
// POST { feature, provider_id? }
// → { allowed, source, remaining, limit, reason?, upgradeHint? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { checkAiQuota } from "../_shared/aiQuota.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Invalid token" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const feature = body.feature || "chat";
    const providerId = body.provider_id || null;

    const result = await checkAiQuota({
      userId:     user.id,
      providerId,
      feature,
    });

    return json(result);
  } catch (err) {
    console.error("check-ai-quota error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
