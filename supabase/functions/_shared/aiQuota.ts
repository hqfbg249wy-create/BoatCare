// Shared Helper: AI-Quota-Check + Verbrauch buchen
//
// Wird von allen AI-Edge-Functions (ai-chat, suggest-equipment, translate-*)
// genutzt, um vor dem teuren API-Aufruf zu prüfen, ob der User noch Quota hat.
//
// Reihenfolge der Quellen (zuerst kommt zuerst zum Zug):
//   1) plus            — User hat aktive Skipily-Plus-Subscription
//   2) provider_quota  — Provider hat im Pool noch Calls übrig
//   3) free            — User hat seinen 5-Calls/Monat-Free-Tier noch übrig
//
// Wenn keine Quelle Calls hat → { allowed: false, reason }

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const FREE_TIER_LIMIT = 5;

export interface QuotaCheckResult {
  allowed: boolean;
  source?: "free" | "plus" | "provider_quota";
  remaining?: number;
  limit?: number;
  reason?: string;
  upgradeHint?: string;
}

export interface QuotaCheckParams {
  userId: string;
  providerId?: string | null;
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

  // 1) Plus-Subscription?
  const { data: sub } = await sb
    .from("user_subscriptions")
    .select("status, expires_at")
    .eq("user_id", p.userId)
    .maybeSingle();

  const plusActive = sub
    && sub.status === "active"
    && (!sub.expires_at || new Date(sub.expires_at) > new Date());

  if (plusActive) {
    return { allowed: true, source: "plus", remaining: Infinity, limit: Infinity };
  }

  // 2) Provider-Quota? (nur wenn der Call in einem Provider-Kontext steht)
  if (p.providerId) {
    const { data: quotaRow } = await sb.rpc("provider_ai_quota", { p_provider_id: p.providerId });
    const limit = (typeof quotaRow === "number" ? quotaRow : 0);
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
        return { allowed: true, source: "provider_quota", remaining: limit - usedCount, limit };
      }
    }
  }

  // 3) Free-Tier (persönlicher Counter)
  const { data: personalUsed } = await sb
    .from("ai_monthly_usage")
    .select("call_count")
    .eq("user_id", p.userId)
    .eq("year_month", yearMonth)
    .is("provider_id", null)
    .maybeSingle();
  const personalCount = personalUsed?.call_count ?? 0;

  if (personalCount < FREE_TIER_LIMIT) {
    return {
      allowed:   true,
      source:    "free",
      remaining: FREE_TIER_LIMIT - personalCount,
      limit:     FREE_TIER_LIMIT,
    };
  }

  // Alle Quellen leer
  return {
    allowed:     false,
    reason:      "Du hast dein KI-Kontingent für diesen Monat aufgebraucht.",
    upgradeHint: p.providerId
      ? "Bitte deinen Provider, auf Pro oder Enterprise upzugraden — oder hole dir Skipily Plus für unbegrenzte Nutzung."
      : "Hole dir Skipily Plus in der iOS-App für unbegrenzte KI-Nutzung.",
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
  source: "free" | "plus" | "provider_quota";
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
    // Verbuchung fehlgeschlagen → loggen, aber den eigentlichen Response nicht blockieren.
    console.error("recordAiUsage failed:", err);
  }
}
