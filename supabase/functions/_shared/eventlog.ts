// Gemeinsames Zustell-/Ereignis-Log (Tabelle platform_events, Migration 151).
// Jede Edge Function, die eine E-Mail/Push/Benachrichtigung ausloest, schreibt
// hier eine Zeile. So wird im Admin-Panel sichtbar, was die Plattform getan hat
// und wo etwas haengt. Fehler beim Loggen sind bewusst non-fatal (nie den
// eigentlichen Versand blockieren).

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface EventLog {
  event_type: string;              // z. B. 'inquiry_sent'
  channel?: string;                // 'email' | 'push' | 'inapp' (default 'email')
  status?: string;                 // 'sent' | 'failed' | 'skipped' | ...
  provider_id?: string | null;
  user_id?: string | null;
  inquiry_id?: string | null;
  order_id?: string | null;
  recipient?: string | null;
  subject?: string | null;
  provider_message_id?: string | null;  // Resend-Message-ID
  error?: string | null;
  meta?: Record<string, unknown>;
}

/** Schreibt eine Ereigniszeile. Liefert die id oder null (bei Log-Fehler). */
export async function logEvent(supabase: Supa, e: EventLog): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("platform_events")
      .insert({
        event_type: e.event_type,
        channel: e.channel ?? "email",
        status: e.status ?? "triggered",
        provider_id: e.provider_id ?? null,
        user_id: e.user_id ?? null,
        inquiry_id: e.inquiry_id ?? null,
        order_id: e.order_id ?? null,
        recipient: e.recipient ?? null,
        subject: e.subject ?? null,
        provider_message_id: e.provider_message_id ?? null,
        error: e.error ?? null,
        meta: e.meta ?? {},
      })
      .select("id")
      .single();
    if (error) {
      console.error("logEvent failed:", error.message);
      return null;
    }
    return data.id as string;
  } catch (err) {
    console.error("logEvent threw:", (err as Error).message);
    return null;
  }
}
