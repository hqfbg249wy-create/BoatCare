// Shared Stripe client for Edge Functions
// IMPORTANT: Set STRIPE_SECRET_KEY in Supabase Dashboard > Settings > Edge Functions > Secrets

import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

if (!stripeKey) {
  console.warn("WARNING: STRIPE_SECRET_KEY not set. Stripe operations will fail.");
}

export const stripe = new Stripe(stripeKey, {
  apiVersion: "2024-04-10",
  httpClient: Stripe.createFetchHttpClient(),
});
