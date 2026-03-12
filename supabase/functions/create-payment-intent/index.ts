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

    if (profile?.stripe_customer_id) {
      customerId = profile.stripe_customer_id;
    } else {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email || profile?.email,
        name: profile?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      // Save customer ID to profile
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
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

    // If there's a single provider with a connected account, use direct transfer
    if (orders && orders.length === 1) {
      const order = orders[0];
      const stripeAccountId = (order as any).service_providers?.stripe_account_id;
      if (stripeAccountId) {
        const transferAmount = Math.round((order.total - (order.commission_amount || 0)) * 100);
        paymentIntentParams.transfer_data = {
          destination: stripeAccountId,
          amount: transferAmount,
        };
      }
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

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
    console.error("Error creating payment intent:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
