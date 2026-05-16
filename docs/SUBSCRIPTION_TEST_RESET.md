# Abos zurücksetzen für Tests

Schritt-für-Schritt-Anleitung wie man Test-Accounts vom Abo befreit, damit
man den ganzen Flow erneut durchspielen kann.

Es gibt drei Stellen wo ein Abo "leben" kann, und alle drei müssen
zurückgesetzt werden:

| # | Stelle | Wann relevant? |
|---|---|---|
| 1 | **Supabase DB** (`user_subscriptions` / `service_providers`) | immer |
| 2 | **Stripe** | wenn Provider-Pro/Enterprise per Stripe-Web bezahlt hat |
| 3 | **Apple Sandbox** | wenn Endkunden-Plus per StoreKit gekauft hat |

---

## 1. Supabase DB zurücksetzen — easy

### Plus-Abo (Endkunden)

Im Admin: User-Liste → bei dem Test-User auf **🗑 Plus** → Bestätigen.

Hintergrund: Ruft `admin_revoke_plus_subscription(p_user_id)`. Setzt den
`user_subscriptions`-Eintrag auf `status='revoked'` und `expires_at=NOW()`.
Der User gilt sofort wieder als Free.

### Provider-Abo (Stripe Pro/Enterprise)

Im Admin: Provider-Modal öffnen → **🗑 Stripe-Abo (Test)** → Bestätigen.

Hintergrund: Ruft `admin_reset_provider_subscription(p_provider_id)`. Setzt
`subscription_tier='standard'` und nullt alle Stripe-Felder. Der Provider
sieht sofort wieder die Plan-Picker-Karten im /profile.

---

## 2. Stripe-Seite zurücksetzen — wichtig damit Stripe nicht weiter abbucht

Die DB-Funktion oben **kündigt NICHT bei Stripe**. Damit der Test-Customer
nicht weiter monatlich belastet wird (auch im Test-Mode wird's gebucht),
musst du das Abo im Stripe-Dashboard kündigen:

1. https://dashboard.stripe.com/test/customers
2. Den Customer suchen (E-Mail vom Test-Provider)
3. Im Tab **Subscriptions** das aktive Abo öffnen
4. Rechts oben **"…" → Cancel subscription** → "Cancel immediately"

Alternativ über die API:
```bash
stripe subscriptions cancel sub_xxxxx --api-key sk_test_xxx
```

---

## 3. Apple Sandbox-Abo zurücksetzen — Pflicht für IAP-Test

Wenn du als Endkunden-User per StoreKit gekauft hast (Sandbox-Account auf
dem iPhone), läuft das Abo **alle 5 Minuten erneut** (so testet Apple
Renewal-Flows). Damit der Sandbox-User wieder "Free" ist:

### Auf dem iPhone

1. **Settings** öffnen
2. ganz oben Apple-ID-Karte antippen
3. **Abonnements** auswählen
4. Das Skipily-Plus-Abo öffnen
5. **"Abonnement kündigen"** ganz unten
6. Bestätigen

Wichtig: Das ist der **Sandbox-Account**, nicht dein echter Apple-Account.
Falls beides parallel: Settings → App Store → **Sandbox Account** —
da steht der Test-Account separat.

### Sandbox-Subscription komplett zurücksetzen (für Cycle-Tests)

Wenn du den **Erstkauf** erneut testen willst (also "frischer User" simulieren),
musst du den Sandbox-Account austauschen:

1. https://appstoreconnect.apple.com → Benutzer und Zugriff → **Sandbox**
2. **+ Neuer Sandbox-User** anlegen mit einer Wegwerf-E-Mail
3. Auf dem iPhone unter Settings → App Store → Sandbox Account abmelden +
   neuen Sandbox-User einloggen
4. App neu starten → frischer Zustand

Apple recyclet Sandbox-Subscriptions nicht zuverlässig — wenn man einen
schon mal verbraucht hat, gibt's manchmal merkwürdige Renewal-Zustände.
Ein neuer Sandbox-User ist immer der saubere Weg.

---

## Quick-Reset für die häufigste Situation

**"Ich will mein Provider-Test-Konto wieder als Standard sehen, damit ich
den Upgrade-Flow erneut durchgehe":**

1. Admin → Provider → den Test-Provider öffnen → 🗑 Stripe-Abo (Test)
2. Stripe-Dashboard → Customer suchen → Subscription Cancel immediately

**"Ich will meinen Sandbox-User wieder als Free sehen":**

1. Admin → Benutzer → 🗑 Plus
2. iPhone → Settings → Apple-ID → Abos → Skipily Plus → Kündigen
