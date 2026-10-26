// =====================================================================
// create-ad-checkout — Provider bewirbt einen Produkt-News-Beitrag.
// Innerhalb des Gratis-Kontingents (Pro 2/Woche, Enterprise 4/Woche) wird die
// Kampagne sofort aktiv (kostenlos). Darüber hinaus: Tagesbudget-Vorkasse via
// Stripe Checkout (Zeitraum × Tagesbudget, ab 10 €/Tag).
//
// Input:  { post_id, daily_budget_cents, start_date, end_date, preferred_hour? }
// Output: { mode: 'free', campaign_id } | { mode: 'checkout', url, campaign_id }
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripe } from "../_shared/stripe.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROVIDER_BASE    = (Deno.env.get("PROVIDER_PORTAL_URL") ?? "https://provider.skipily.app").replace(/\/$/, "");

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a + "T00:00:00Z").getTime();
  const d2 = new Date(b + "T00:00:00Z").getTime();
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
  return Math.max(1, Math.round((d2 - d1) / 864e5) + 1);
}

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
    const postId = typeof b.post_id === "string" ? b.post_id : "";
    const dailyBudget = Math.max(1000, parseInt(String(b.daily_budget_cents ?? 1000), 10) || 1000);
    const startDate = typeof b.start_date === "string" ? b.start_date : "";
    const endDate = typeof b.end_date === "string" ? b.end_date : "";
    const preferredHour = (b.preferred_hour === null || b.preferred_hour === undefined)
      ? null : Math.min(23, Math.max(0, parseInt(String(b.preferred_hour), 10) || 0));
    if (!postId || !startDate || !endDate) return json({ error: "Pflichtfelder fehlen" }, 400);
    const days = daysBetween(startDate, endDate);
    const totalCents = days * dailyBudget;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Beitrag + Anbieter prüfen
    const { data: post } = await admin.from("news_posts")
      .select("id, provider_id, kind").eq("id", postId).maybeSingle();
    if (!post || post.kind !== "product" || !post.provider_id) return json({ error: "Beitrag nicht gefunden" }, 404);
    const providerId = post.provider_id as string;

    // Mitgliedschaft prüfen (Mitglied ODER Eigentümer)
    const { data: mem } = await admin.from("provider_members")
      .select("provider_id").eq("provider_id", providerId).eq("user_id", userId).maybeSingle();
    let prov: { id: string; subscription_plan: string | null; stripe_customer_id: string | null; name: string | null; email: string | null } | null = null;
    {
      const { data } = await admin.from("service_providers")
        .select("id, subscription_plan, stripe_customer_id, name, email, user_id, owner_id")
        .eq("id", providerId).maybeSingle();
      prov = data as typeof prov;
      if (!prov) return json({ error: "Anbieter nicht gefunden" }, 404);
      if (!mem) {
        const d = data as Record<string, unknown>;
        if (d.user_id !== userId && d.owner_id !== userId) return json({ error: "Kein Zugriff" }, 403);
      }
    }

    const plan = String(prov!.subscription_plan ?? "");
    const freeLimit = plan.startsWith("ent") ? 4 : plan.startsWith("pro") ? 2 : 0;
    if (freeLimit === 0) return json({ error: "Anzeigen sind Pro/Enterprise-Anbietern vorbehalten.", not_eligible: true }, 402);

    // Aktive Kampagnen dieser Woche zählen
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { count: activeThisWeek } = await admin.from("news_ad_campaigns")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId).eq("status", "active").gte("created_at", weekAgo);
    const withinFree = (activeThisWeek ?? 0) < freeLimit;

    // Kampagne anlegen
    const { data: camp, error: cErr } = await admin.from("news_ad_campaigns").insert({
      post_id: postId, provider_id: providerId, created_by: userId,
      daily_budget_cents: dailyBudget, start_date: startDate, end_date: endDate,
      preferred_hour: preferredHour, days, total_cents: withinFree ? 0 : totalCents,
      is_paid: false, status: withinFree ? "active" : "pending_payment",
    }).select("id").single();
    if (cErr) throw cErr;

    if (withinFree) return json({ mode: "free", campaign_id: camp.id });

    // Stripe-Customer sicherstellen
    let customerId = prov!.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: prov!.name ?? undefined, email: prov!.email ?? undefined,
        metadata: { provider_id: providerId, supabase_user_id: userId },
      });
      customerId = customer.id;
      await admin.from("service_providers").update({ stripe_customer_id: customerId }).eq("id", providerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: totalCents,
          product_data: { name: `Skipily News-Anzeige (${days} Tage × ${(dailyBudget / 100).toFixed(2)} €)` },
        },
      }],
      success_url: `${PROVIDER_BASE}/news?ad=ok`,
      cancel_url: `${PROVIDER_BASE}/news?ad=cancel`,
      metadata: { ad_campaign_id: camp.id, provider_id: providerId },
      payment_intent_data: { metadata: { ad_campaign_id: camp.id, provider_id: providerId } },
    });

    await admin.from("news_ad_campaigns").update({ stripe_session_id: session.id }).eq("id", camp.id);
    return json({ mode: "checkout", url: session.url, campaign_id: camp.id });
  } catch (err) {
    console.error("create-ad-checkout error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
