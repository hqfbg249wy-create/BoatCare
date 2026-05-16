// Shared Helper: AI-Quota-Check + Verbrauch buchen
//
// Wird von allen AI-Edge-Functions (ai-chat, suggest-equipment, translate-*)
// genutzt, um vor dem teuren API-Aufruf zu prüfen, ob der User noch Quota hat.
//
// Quoten:
//   plus            → Skipily Plus / Family / Fleet / Enterprise → unbegrenzt
//   provider_quota  → Provider-Pool (für provider-initiierte Calls; aktuell noch ungenutzt)
//   free            → 2 Calls/Monat für Bootseigner, NUR für chat-Feature
//
// Plus-Only Features:
//   photo_analysis      — Schadens-Fotos analysieren
//   suggest_equipment   — Ausrüstungsvorschläge
//   → diese verbrauchen IMMER aus Plus, niemals aus Free-Tier
//
// Features die Free dürfen:
//   chat                → 2/M frei
//   translate_*         → Skipily-intern, kein User-Quota

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const FREE_TIER_LIMIT = 5;

// Welche Features sind Plus-exklusiv (keine Free-Tier-Option)?
const PLUS_ONLY_FEATURES = new Set([
  "photo_analysis",
  "suggest_equipment",
]);

export interface QuotaCheckResult {
  allowed: boolean;
  source?: "free" | "plus" | "provider_quota";
  remaining?: number;
  limit?: number;
  reason?: string;
  upgradeHint?: string;
  requiresPlus?: boolean;       // True wenn das Feature nur mit Plus läuft
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
  const isPlusOnly = PLUS_ONLY_FEATURES.has(p.feature);

  // 1) Plus-Zugang? (per RPC, berücksichtigt Individual/Family/Fleet/Enterprise + Boat-Match)
  const { data: hasPlus } = await sb.rpc("user_has_plus", {
    p_user_id: p.userId,
    p_boat_id: p.boatId ?? null,
  });

  if (hasPlus === true) {
    return { allowed: true, source: "plus", remaining: Infinity, limit: Infinity };
  }

  // 2) Provider-Quota? (nur bei provider-initiierten Calls — aktuell selten genutzt)
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
        return { allowed: true, source: "provider_quota", remaining: limit - usedCount, limit };
      }
    }
  }

  // 3) Plus-only Feature ohne Plus → 402
  if (isPlusOnly) {
    return {
      allowed:     false,
      requiresPlus: true,
      reason:      "Dieses Feature ist Skipily Plus vorbehalten.",
      upgradeHint: "Hole dir Skipily Plus für unbegrenzte KI, Schadens-Foto-Analyse und Ausrüstungs-Empfehlungen.",
    };
  }

  // 4) Free-Tier (nur für chat)
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

  // Alle Quellen leer — UX-relevant: das iOS-Frontend muss dies in einen
  // Upgrade-Button verwandeln, nicht als Fehlermeldung anzeigen.
  return {
    allowed:     false,
    requiresPlus: true,
    reason:      `Du hast deine ${FREE_TIER_LIMIT} kostenlosen KI-Anfragen für diesen Monat aufgebraucht.`,
    upgradeHint: "Mit Skipily Plus bekommst du unbegrenzte KI, Schadens-Foto-Analyse und Ausrüstungs-Empfehlungen.",
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
    console.error("recordAiUsage failed:", err);
  }
}
