// Edge Function: create-payment-intent
// Creates a Stripe PaymentIntent with split payments for connected accounts
//
// Request body: { amount: number (cents), currency: string, order_ids: string[] }
// Returns: { client_secret, ephemeral_key, customer_id, publishable_key }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const stripePublishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
// Feature-Flag: true → Direct Charges, Händler trägt die Stripe-/Apple-Pay-
// Gebühren (Skipily nimmt nur Provision). Default false = bisheriges Modell.
const MERCHANT_PAYS_FEES = (Deno.env.get("MERCHANT_PAYS_FEES") ?? "false").toLowerCase() === "true";

serve(async (req: Request) => {
  // Handle CORS
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

    // Get user from Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { amount, currency, order_ids, metadata } = await req.json();

    if (!amount || !order_ids || order_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: amount, order_ids" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    let customerId: string;
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email, full_name")
      .eq("id", user.id)
      .single();

    // Helper: legt neuen Stripe-Customer an + speichert ID in der DB
    const createAndStoreCustomer = async (): Promise<string> => {
      const customer = await stripe.customers.create({
        email: user.email || profile?.email,
        name:  profile?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("id", user.id);
      return customer.id;
    };

    if (profile?.stripe_customer_id) {
      // Existierende ID ist möglicherweise verwaist (Test/Live-Mix,
      // Customer in Stripe gelöscht, Account-Wechsel etc.) — wir verifizieren
      // sie aktiv und legen bei "No such customer" einen neuen an.
      try {
        const existing = await stripe.customers.retrieve(profile.stripe_customer_id);
        if ((existing as { deleted?: boolean }).deleted) {
          customerId = await createAndStoreCustomer();
        } else {
          customerId = profile.stripe_customer_id;
        }
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "resource_missing") {
          console.warn(`Stripe-Customer ${profile.stripe_customer_id} existiert nicht mehr — lege neuen an`);
          customerId = await createAndStoreCustomer();
        } else {
          throw e;
        }
      }
    } else {
      customerId = await createAndStoreCustomer();
    }

    // Create ephemeral key for the customer
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2024-04-10" }
    );

    // Fetch orders to calculate split payments
    const { data: orders } = await supabase
      .from("orders")
      .select("id, provider_id, total, commission_amount, service_providers(stripe_account_id)")
      .in("id", order_ids);

    // Build transfer data for connected accounts
    // For simplicity, we create a single PaymentIntent and handle transfers via webhook
    let directChargeAccount: string | null = null; // gesetzt bei Direct Charge
    const paymentIntentParams: any = {
      amount: amount,
      currency: currency || "eur",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_ids: order_ids.join(","),
        buyer_id: user.id,
        ...metadata,
      },
    };

    // If there's a single provider with a connected account, use direct transfer.
    // Defensiv: wir prüfen ob der Connect-Account in Stripe tatsächlich existiert
    // (Test/Live-Wechsel oder gelöschter Account würden sonst die Zahlung
    // mit "destination account does not exist" abschießen).
    if (orders && orders.length === 1) {
      const order = orders[0];
      const stripeAccountId = (order as any).service_providers?.stripe_account_id;
      if (stripeAccountId) {
        let accountValid = false;
        try {
          const acct = await stripe.accounts.retrieve(stripeAccountId);
          accountValid = (acct as { charges_enabled?: boolean }).charges_enabled === true;
          if (!accountValid) {
            console.warn(`Connect-Account ${stripeAccountId} existiert, aber charges_enabled=false → ohne Transfer fortsetzen`);
          }
        } catch (e) {
          const code = (e as { code?: string })?.code;
          if (code === "account_invalid" || code === "resource_missing") {
            console.warn(`Connect-Account ${stripeAccountId} ungültig (${code}) → ohne Transfer fortsetzen`);
          } else {
            console.warn(`Connect-Account-Check failed: ${(e as Error).message} → ohne Transfer fortsetzen`);
          }
        }

        if (accountValid) {
          // MERCHANT_PAYS_FEES=true → DIRECT CHARGE: die Zahlung wird AUF dem
          // Connect-Account des Händlers erstellt; Stripe zieht die
          // Bearbeitungsgebühr (inkl. Apple Pay) vom HÄNDLER ab, Skipily nimmt
          // nur application_fee_amount (= Provision). on_behalf_of macht den
          // Händler zum Merchant of Record.
          //
          // ⚠️ NUR Single-Provider-Bestellungen. Vor Live-Einsatz in Stripe
          // TEST-Mode validieren (Apple-Pay-Domain ggf. pro Account).
          if (MERCHANT_PAYS_FEES) {
            directChargeAccount = stripeAccountId;
            paymentIntentParams.on_behalf_of = stripeAccountId;
            paymentIntentParams.transfer_data = { destination: stripeAccountId };
            paymentIntentParams.application_fee_amount = Math.round((order.commission_amount || 0) * 100);
            // customer/ephemeralKey gehören zum Plattform-Account; bei Direct
            // Charge auf dem Connected-Account dürfen sie NICHT mitgesendet werden.
            delete paymentIntentParams.customer;
          } else {
            // Bisheriges Modell: Destination Charge, Plattform trägt die Gebühren.
            const transferAmount = Math.round((order.total - (order.commission_amount || 0)) * 100);
            paymentIntentParams.transfer_data = { destination: stripeAccountId, amount: transferAmount };
          }
        }
      }
    }

    // Direct Charge → PaymentIntent auf dem Connected-Account erzeugen
    const paymentIntent = directChargeAccount
      ? await stripe.paymentIntents.create(paymentIntentParams, { stripeAccount: directChargeAccount })
      : await stripe.paymentIntents.create(paymentIntentParams);

    // Save PaymentIntent ID to orders
    for (const orderId of order_ids) {
      await supabase
        .from("orders")
        .update({ stripe_payment_intent_id: paymentIntent.id })
        .eq("id", orderId);
    }

    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        ephemeral_key: ephemeralKey.secret,
        customer_id: customerId,
        publishable_key: stripePublishableKey,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    // Detaillierte Fehler-Diagnose für die Function-Logs
    const errAny = err as any;
    const diag = {
      message: errAny?.message ?? "unknown",
      type:    errAny?.type ?? errAny?.name ?? "Error",
      code:    errAny?.code ?? null,
      stripe_request_id: errAny?.requestId ?? null,
      stripe_status:     errAny?.statusCode ?? null,
      stack: typeof errAny?.stack === "string" ? errAny.stack.split("\n").slice(0, 3).join(" | ") : null,
    };
    console.error("create-payment-intent FAILED:", JSON.stringify(diag, null, 2));

    // Einige typische Stripe-Fehler in nutzerfreundlichen Klartext übersetzen
    let friendly = diag.message;
    if (diag.code === "secret_key_required" || diag.message?.includes("Invalid API Key")) {
      friendly = "STRIPE_SECRET_KEY ist nicht (korrekt) gesetzt. Bitte im Supabase Dashboard prüfen.";
    } else if (diag.code === "resource_missing" && diag.message?.includes("acct_")) {
      friendly = "Provider hat eine Stripe-Account-ID die in deinem Stripe-Account nicht existiert. Test- vs Live-Modus verwechselt?";
    } else if (diag.message?.includes("account") && diag.message?.includes("transfer")) {
      friendly = "Stripe-Connect-Konto des Providers ist nicht für Transfers freigeschaltet.";
    } else if (diag.code === "resource_missing" && diag.message?.includes("customer")) {
      friendly = "Stripe-Customer in der DB ist verwaist (vermutlich Test/Live-Mode-Wechsel). Der nächste Checkout-Versuch legt automatisch einen neuen an.";
    }

    return new Response(
      JSON.stringify({ error: friendly, diag }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
