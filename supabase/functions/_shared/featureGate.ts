// Shared Helper: Paywall-Gate über die DB (Migration 215, feature_gates).
//
// Fragt feature_access_for_user() ab. Ist die Funktion für den Nutzer nicht
// freigeschaltet, liefert die DB eine kurze Meldung in seiner Sprache, was mit
// Skipily Basic bzw. Plus möglich wird. Antwortform passt zu den bestehenden
// Clients (iOS + Web lesen `error` / `upgrade_hint` / `requires_plus`).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type GatedFeature =
  | "photo_analysis" | "equipment_photo" | "auto_translate"
  | "boat_transfer" | "maintenance_pdf" | "strong_ai" | "excel_import";

export interface FeatureAccess {
  allowed: boolean;
  feature: string;
  tier?: "free" | "basic" | "plus";
  required_tier?: "basic" | "plus";
  message?: string | null;
}

/** Sprache aus Body-Wert oder Accept-Language ableiten (Fallback de). */
export function gateLang(req: Request, bodyLang?: unknown): string {
  const raw = (typeof bodyLang === "string" && bodyLang.trim())
    ? bodyLang
    : (req.headers.get("accept-language") ?? "de");
  return raw.split(",")[0].split(/[-_;]/)[0].trim().toLowerCase() || "de";
}

export async function checkFeature(
  userId: string,
  feature: GatedFeature,
  lang = "de",
  boatId: string | null = null,
): Promise<FeatureAccess> {
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await sb.rpc("feature_access_for_user", {
    p_user_id: userId, p_feature: feature, p_lang: lang, p_boat_id: boatId,
  });
  // Fail-open: ein DB-Ausfall darf zahlende Nutzer nicht aussperren.
  if (error || !data) {
    console.error("feature_access_for_user failed:", error);
    return { allowed: true, feature };
  }
  return data as FeatureAccess;
}

/** Einheitlicher 402-Body für gesperrte Funktionen. */
export function gateBody(a: FeatureAccess): Record<string, unknown> {
  return {
    error: a.message ?? "Diese Funktion ist mit einem Skipily-Abo verfügbar.",
    upgrade_hint: a.message ?? undefined,
    requires_plus: true,
    required_tier: a.required_tier,
    feature: a.feature,
  };
}
