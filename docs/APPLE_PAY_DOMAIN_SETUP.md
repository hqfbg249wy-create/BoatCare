# Apple-Pay Domain-Verifizierung für Stripe-Checkout

Wenn ein Provider auf `provider.skipily.app` auf "Auf Professional upgraden"
klickt, öffnet sich Stripe Checkout. Der **Apple-Pay-Button** oben im Sheet
funktioniert nur, wenn die Domain bei Apple verifiziert ist.

Aktuell führt ein Klick auf Apple-Pay zu:
```
"Safari kann die Seite nicht öffnen, da die Adresse ungültig ist."
```

## So fixen — 5 Minuten Arbeit

### 1. Stripe Dashboard öffnen

→ <https://dashboard.stripe.com/settings/payment_method_domains>

(Wenn nicht direkt aufrufbar: **Settings** → **Payment methods** →
**Apple Pay** → **Add a new domain**)

### 2. Domains hinzufügen

Für jede Domain die Stripe-Checkout serviert:

| Domain | Wo wird Stripe-Checkout aufgerufen? |
|---|---|
| `provider.skipily.app` | Provider-Portal → Abo-Upgrade |
| `app.skipily.app`      | Owner-Portal (falls dort Käufe stattfinden) |
| `skipily.app`          | Marketing-Site (falls Käufe von dort starten) |

### 3. Verifizierungs-Datei hosten

Stripe gibt dir pro Domain eine Datei zum Download — z.B.
`apple-developer-merchantid-domain-association`. Die muss erreichbar sein unter:

```
https://<deine-domain>/.well-known/apple-developer-merchantid-domain-association
```

**Bei Vercel-deployten Portalen** (provider/owner-portal):
- Datei ins `public/.well-known/` Verzeichnis legen
- Commit + Push → Vercel deployt automatisch
- Stripe → "Verify" klicken

**Bei IONOS/WordPress** (skipily.app):
- Datei per FTP/SFTP hochladen oder via WordPress-Plugin "WP-Content-Static"
- Sicherstellen dass kein 301-Redirect auf andere Pfade

### 4. Testen

In Safari/iOS (NICHT Chrome!) den Stripe-Checkout öffnen — der Apple-Pay-Button
sollte nun ohne Fehler eine Touch-ID/Face-ID-Auth triggern.

## Was passiert ohne Domain-Verifizierung?

- Apple-Pay-Button **wird trotzdem angezeigt** (das wirkt verwirrend)
- Klick → "Adresse ungültig" Fehler in Safari
- Andere Zahlmethoden (Karte, SEPA, PayPal) funktionieren weiter

→ Für Production-Launch: zwingend einrichten.

## Apple-Pay aus dem Checkout entfernen (Alternative)

Falls Apple Pay nicht gewünscht ist, kann es im Stripe-Dashboard pro Account
deaktiviert werden:

→ Settings → Payment Methods → **Apple Pay** → **Disable**

Dann zeigt Stripe-Checkout den Button gar nicht mehr.

## Notiz für später: Native iOS-Integration

Die Skipily iOS-App nutzt Stripe-Native (`PaymentSheet`), nicht
Stripe-Checkout-Web. Dort gilt Apple-Pay-Domain-Verifizierung **nicht** — der
native PaymentSheet ist immer Apple-Pay-ready, sofern in der iOS-App das
`com.apple.developer.in-app-payments` Entitlement gesetzt ist.
