// ════════════════════════════════════════════════════════════════════
// CleverReach Helper für Edge Functions
//
// Stellt OAuth-Token-Caching, Receiver-Upsert in eine Group und einen
// expliziten Mailing-Trigger bereit. Wird vom Provider-Invite-Flow und
// künftig auch von Order-/Inquiry-Mails genutzt.
//
// Konfiguration (Supabase Edge Function Secrets):
//   CLEVERREACH_CLIENT_ID                  → OAuth Client-ID
//   CLEVERREACH_CLIENT_SECRET              → OAuth Client-Secret
//   CLEVERREACH_GROUP_PROVIDER_ONBOARDING  → Group-ID für Provider-Welcomes
//   CLEVERREACH_PROVIDER_WELCOME_FORM_ID   → (optional) Form-ID für Form-Mailing
//
// CleverReach-Setup (manuell im CR-Dashboard):
//   1. Group "Provider Onboarding" anlegen
//   2. Auto-Responder erstellen, getriggert beim "Receiver added"
//   3. Im Template Platzhalter {COMPANY} und {CLAIM_LINK} aus den
//      receiver-Attributen ziehen
// ════════════════════════════════════════════════════════════════════

const CR_API = "https://rest.cleverreach.com";
const CR_OAUTH = "https://rest.cleverreach.com/oauth/token.php";

let _token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Token wiederverwenden, solange noch 60s Restlaufzeit
  if (_token && Date.now() < _token.expiresAt - 60_000) {
    return _token.value;
  }

  const clientId     = Deno.env.get("CLEVERREACH_CLIENT_ID");
  const clientSecret = Deno.env.get("CLEVERREACH_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "CleverReach Credentials fehlen — CLEVERREACH_CLIENT_ID / CLEVERREACH_CLIENT_SECRET in Supabase Edge Function Secrets setzen.",
    );
  }

  const res = await fetch(CR_OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `CleverReach OAuth fehlgeschlagen (${res.status}): ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  _token = {
    value:     body.access_token,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
  };
  return _token.value;
}

export interface CrReceiver {
  email: string;
  attributes?: Record<string, string | number | null | undefined>;
  source?: string;
  /** Wenn true: ohne Double-Opt-In aktiv setzen (nur für vertragliche Mails, z.B. Onboarding). */
  activatedImmediately?: boolean;
}

/**
 * Fügt einen Receiver einer Group hinzu oder aktualisiert ihn.
 * Bei aktivem Auto-Responder in CleverReach löst der Insert automatisch
 * den Mailversand aus. CR macht hier Upsert: gleiche Mail in gleicher
 * Group wird aktualisiert statt dupliziert.
 */
export async function upsertReceiver(
  groupId: string,
  receiver: CrReceiver,
): Promise<void> {
  if (!groupId) {
    throw new Error("CleverReach Group-ID fehlt (z.B. CLEVERREACH_GROUP_PROVIDER_ONBOARDING).");
  }
  const token = await getAccessToken();
  const now   = Math.floor(Date.now() / 1000);

  // Attribute auf string normalisieren — CR akzeptiert primitive Werte.
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(receiver.attributes ?? {})) {
    if (v === undefined || v === null) continue;
    attrs[k] = String(v);
  }

  const payload = {
    email:      receiver.email,
    registered: now,
    activated:  receiver.activatedImmediately ? now : 0,
    source:     receiver.source || "Skipily Provider-Onboarding",
    attributes: attrs,
  };

  const res = await fetch(
    `${CR_API}/v3/groups.json/${encodeURIComponent(groupId)}/receivers/insert`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `CleverReach Receiver-Insert failed (${res.status}): ${errBody.slice(0, 300)}`,
    );
  }
}

/**
 * Triggert ein Form-Mailing für eine bestimmte E-Mail.
 * Nutzbar, wenn man statt Auto-Responder ein konkretes Form-Mailing
 * ansteuern will. Die Mailing-/Form-ID kommt aus dem CR-Dashboard.
 */
export async function sendFormMail(
  formId: string,
  email: string,
  data: Record<string, string> = {},
): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(
    `${CR_API}/v3/forms.json/${encodeURIComponent(formId)}/send/activate`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        email,
        doidata: { user_ip: "0.0.0.0", referer: "skipily-edge", user_agent: "skipily-edge" },
        ...data,
      }),
    },
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`CleverReach send-form failed (${res.status}): ${errBody.slice(0, 300)}`);
  }
}
