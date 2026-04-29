// Edge Function: create-connect-account
// Creates a Stripe Connect Express account for a provider and returns onboarding URL
//
// Request body: { provider_id: string }
// Returns: { account_id, onboarding_url }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const portalBaseUrl = Deno.env.get("PROVIDER_PORTAL_URL") ?? "http://localhost:5173";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { provider_id } = await req.json();

    if (!provider_id) {
      return new Response(
        JSON.stringify({ error: "Missing provider_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns this provider
    const { data: provider, error: providerError } = await supabase
      .from("service_providers")
      .select("id, name, email, stripe_account_id, user_id")
      .eq("id", provider_id)
      .single();

    if (providerError || !provider) {
      return new Response(
        JSON.stringify({ error: "Provider not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (provider.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accountId = provider.stripe_account_id;
    let account: any = null;

    // 1) Falls schon eine Account-ID hängt, prüfen ob sie in Stripe noch existiert.
    //    "No such account" passiert bei Test-↔-Live-Wechseln oder gelöschten
    //    Konten. Dann Account-ID verwerfen und unten neu anlegen.
    if (accountId) {
      try {
        account = await stripe.accounts.retrieve(accountId);
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        const code = err?.code ?? err?.raw?.code;
        const isMissing = code === "account_invalid" || /No such account/i.test(msg);
        if (isMissing) {
          console.warn(`Stripe-Account ${accountId} existiert nicht mehr — wird zurückgesetzt.`);
          await supabase
            .from("service_providers")
            .update({ stripe_account_id: null })
            .eq("id", provider_id);
          accountId = null;
          account   = null;
        } else {
          throw err;
        }
      }
    }

    // 2) Neu anlegen falls keine (gültige) ID vorhanden
    if (!accountId) {
      account = await stripe.accounts.create({
        type: "express",
        country: "DE",
        email: provider.email || user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers:     { requested: true },
          sepa_debit_payments: { requested: true },
        },
        business_type: "company",
        metadata: {
          provider_id:      provider_id,
          supabase_user_id: user.id,
        },
      });
      accountId = account.id;

      await supabase
        .from("service_providers")
        .update({ stripe_account_id: accountId })
        .eq("id", provider_id);
    }

    // 3) Onboarding-Link erstellen
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${portalBaseUrl}/profile?stripe=refresh`,
      return_url:  `${portalBaseUrl}/profile?stripe=success`,
      type:        "account_onboarding",
    });

    return new Response(
      JSON.stringify({
        account_id: accountId,
        onboarding_url: accountLink.url,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error creating connect account:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
