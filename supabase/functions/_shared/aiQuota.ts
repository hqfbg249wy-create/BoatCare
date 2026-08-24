// Shared Helper: AI-Quota-Check + Verbrauch buchen
//
// Wird von allen AI-Edge-Functions (ai-chat, suggest-equipment, translate-*)
// genutzt, um vor dem teuren API-Aufruf zu prüfen, ob der User noch Quota hat.
//
// Quoten:
//   plus            → Skipily Plus / Family / Fleet / Enterprise → unbegrenzt
//   provider_quota  → Provider-Pool (für provider-initiierte Calls; aktuell noch ungenutzt)
//   free            → 10 Calls/Monat — gemeinsamer Topf für chat, suggest,
//                     photo. Wenn aufgebraucht → Upgrade-Hint im Response.
//
// Features die KEIN User-Quota verbrauchen:
//   translate_*         → Skipily-intern, läuft immer durch

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Phase-1-Preismodell (Bootseigner):
//   Free  → 10 KI-Fragen EINMALIG (lifetime, Summe über alle Monate)
//   Basic → 5 Fragen/Tag   (Sonnet)
//   Plus  → 15 Fragen/Tag  (Opus — Modellwahl passiert in ai-chat)
const FREE_LIFETIME_LIMIT = 10;
const BASIC_DAILY_LIMIT   = 5;
const PLUS_DAILY_LIMIT    = 15;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);   // UTC-Tag, passt zu CURRENT_DATE
}

export interface QuotaCheckResult {
  allowed: boolean;
  source?: "free" | "basic" | "plus" | "provider_quota";
  tier?: "free" | "basic" | "plus";   // KI-Stufe des Users (für Modellwahl in ai-chat)
  remaining?: number;
  limit?: number;
  reason?: string;
  upgradeHint?: string;
  requiresPlus?: boolean;       // True → Frontend zeigt Upgrade-Button statt Fehler
}

export interface QuotaCheckParams {
  userId: string;
  providerId?: string | null;
  boatId?: string | null;        // wichtig für Family/Fleet-Plus
  feature: "chat" | "photo_analysis" | "suggest_equipment"
         | "translate_text" | "translate_product" | "translate_provider";
}

function ym(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Prüft ob ein User für ein Feature noch Quota hat. Inkrementiert NICHT —
 * dafür gibt es `recordAiUsage` das nach erfolgreichem API-Call gerufen wird.
 */
export async function checkAiQuota(p: QuotaCheckParams): Promise<QuotaCheckResult> {
  const sb = adminClient();
  const yearMonth = ym();

  // ── KI-Tier bestimmen: 'plus' | 'basic' | 'free'
  const { data: tierData } = await sb.rpc("user_ai_tier", {
    p_user_id: p.userId,
    p_boat_id: p.boatId ?? null,
  });
  const tier: "free" | "basic" | "plus" =
    tierData === "plus" ? "plus" : tierData === "basic" ? "basic" : "free";

  // Foto-/Video-Schadensanalyse ist erst ab Basic verfügbar
  if (p.feature === "photo_analysis" && tier === "free") {
    return {
      allowed: false, tier, requiresPlus: true,
      reason:      "Die Foto-/Video-Schadensanalyse ist ab Skipily Basic verfügbar.",
      upgradeHint: "Schon mit Skipily Basic (1,99 €/Monat) bekommst du die Schadens-Foto-Analyse und 5 KI-Fragen pro Tag.",
    };
  }

  // ── Bezahlte Tarife: Fair-Use-Deckel pro Tag
  if (tier === "plus" || tier === "basic") {
    const limit = tier === "plus" ? PLUS_DAILY_LIMIT : BASIC_DAILY_LIMIT;
    const { data: today } = await sb
      .from("ai_daily_usage")
      .select("call_count")
      .eq("user_id", p.userId)
      .eq("day", todayISO())
      .maybeSingle();
    const used = today?.call_count ?? 0;
    if (used < limit) {
      return { allowed: true, source: tier, tier, remaining: limit - used, limit };
    }
    return {
      allowed: false, source: tier, tier, remaining: 0, limit,
      requiresPlus: tier === "basic",
      reason: tier === "plus"
        ? `Du hast dein heutiges Limit von ${PLUS_DAILY_LIMIT} KI-Fragen erreicht — morgen geht es weiter.`
        : `Du hast dein heutiges Limit von ${BASIC_DAILY_LIMIT} KI-Fragen erreicht.`,
      upgradeHint: tier === "basic"
        ? `Mit Skipily Plus (4,99 €/Monat) bekommst du ${PLUS_DAILY_LIMIT} Fragen pro Tag und die stärkere KI für tiefergehende Analysen.`
        : undefined,
    };
  }

  // ── Provider-Quota (provider-initiierte Calls — selten genutzt)
  if (p.providerId) {
    const { data: quotaLimit } = await sb.rpc("provider_ai_quota", { p_provider_id: p.providerId });
    const limit = (typeof quotaLimit === "number" ? quotaLimit : 0);
    if (limit > 0) {
      const { data: used } = await sb
        .from("ai_monthly_usage")
        .select("call_count")
        .eq("provider_id", p.providerId)
        .eq("year_month", yearMonth)
        .is("user_id", null)
        .maybeSingle();
      const usedCount = used?.call_count ?? 0;
      if (usedCount < limit) {
        return { allowed: true, source: "provider_quota", tier, remaining: limit - usedCount, limit };
      }
    }
  }

  // ── Free-Tier: 10 KI-Fragen EINMALIG (lifetime, Summe über alle Monate)
  const { data: rows } = await sb
    .from("ai_monthly_usage")
    .select("call_count")
    .eq("user_id", p.userId)
    .is("provider_id", null);
  const lifetimeUsed = (rows ?? []).reduce(
    (s: number, r: { call_count: number | null }) => s + (r.call_count ?? 0), 0);

  if (lifetimeUsed < FREE_LIFETIME_LIMIT) {
    return {
      allowed: true, source: "free", tier: "free",
      remaining: FREE_LIFETIME_LIMIT - lifetimeUsed, limit: FREE_LIFETIME_LIMIT,
    };
  }

  // Free aufgebraucht → Upgrade-Button (kein Fehler)
  return {
    allowed: false, tier: "free", requiresPlus: true,
    reason:      `Du hast deine ${FREE_LIFETIME_LIMIT} kostenlosen KI-Fragen aufgebraucht.`,
    upgradeHint: `Schon ab Skipily Basic (1,99 €/Monat) bekommst du 5 KI-Fragen pro Tag — mit Skipily Plus (4,99 €) sogar 15 und die stärkere KI.`,
  };
}

/**
 * Verbucht einen erfolgreich abgewickelten KI-Call. Diese Funktion sollte
 * NACH der API-Antwort gerufen werden, damit fehlgeschlagene Calls (z.B.
 * API-Timeout) das Quota nicht verbrauchen.
 */
export async function recordAiUsage(args: {
  userId: string;
  providerId?: string | null;
  feature: QuotaCheckParams["feature"];
  source: "free" | "basic" | "plus" | "provider_quota";
  costTokens?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sb = adminClient();
  try {
    await sb.rpc("increment_ai_usage", {
      p_user_id:      args.userId,
      p_provider_id:  args.providerId ?? null,
      p_feature:      args.feature,
      p_source:       args.source,
      p_cost_tokens:  args.costTokens ?? 0,
      p_metadata:     args.metadata ?? null,
    });
  } catch (err) {
    console.error("recordAiUsage failed:", err);
  }
  // Tageszähler für die Fair-Use-Deckel (Basic/Plus). Provider-Pool-Calls
  // zählen nicht gegen ein User-Tageslimit.
  if (args.source !== "provider_quota") {
    try {
      await sb.rpc("increment_ai_daily_usage", { p_user_id: args.userId });
    } catch (err) {
      console.error("increment_ai_daily_usage failed:", err);
    }
  }
}
