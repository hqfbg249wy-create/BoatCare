// Shared Helper: Tages-Deckel fuer SYSTEM-getriggerte KI-Calls.
//
// Uebersetzungen und andere nicht an ein Nutzer-Kontingent gebundene KI-Aufrufe
// koennten bei Massenvorgaengen (Katalog-Import, Cron) unkontrolliert Kosten
// verursachen. Vor jedem solchen Call `reserveSystemAiCall()` aufrufen; liefert
// false, sobald das Tageslimit erreicht ist -> Call ueberspringen (Fallback:
// Originaltext ausliefern statt uebersetzen).
//
// Limit ueber Env SYSTEM_AI_DAILY_CAP steuerbar (Default 800).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_CAP = 800;

export function systemAiDailyCap(): number {
  const raw = Deno.env.get("SYSTEM_AI_DAILY_CAP");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

/**
 * Reserviert einen System-KI-Call fuer heute (atomar hochzaehlen). Liefert
 * true, wenn noch Budget da ist, sonst false. Bei Fehlern konservativ false
 * (lieber nicht uebersetzen als Budget riskieren) — ausser der Aufrufer
 * entscheidet anders.
 */
export async function reserveSystemAiCall(cap = systemAiDailyCap()): Promise<boolean> {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await sb.rpc("bump_system_ai", { p_max: cap });
    if (error) { console.error("reserveSystemAiCall error:", error.message); return false; }
    return data === true;
  } catch (e) {
    console.error("reserveSystemAiCall failed:", (e as Error).message);
    return false;
  }
}
