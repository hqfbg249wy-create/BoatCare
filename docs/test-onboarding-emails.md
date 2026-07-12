# Test-Checkliste: Provider-Onboarding-Mails

Deckt beide transaktionalen Mails ab:
- **(A)** Willkommens-/AGB-Bestätigungsmail beim Provider-Signup
- **(B)** „Abo aktiv"-Mail nach Abschluss des Pro-/Enterprise-Abos

Technik: Resend (`noreply@skipily.app`). Ausgelöst durch DB-Trigger (Migration
`database/105_provider_welcome_emails.sql`) bzw. den `stripe-webhook`.
Beteiligte Functions: `provider-welcome-email`, `stripe-webhook`.

---

## Vorbereitung
- [ ] Eigene E-Mail-Adresse bereithalten (auch **Spam-Ordner** prüfen).
- [ ] Supabase offen: **Edge Functions → Logs** (`provider-welcome-email`, `stripe-webhook`) + **SQL-Editor**.

## A) Willkommens-/AGB-Mail
- [ ] Im **Provider-Portal** (`provider.skipily.app`) neu registrieren, **AGB akzeptieren**.
- [ ] Postfach: Mail „Willkommen bei Skipily…" von `noreply@skipily.app` kommt an.
- [ ] In der Mail prüfen: **AGB-Version + Zeitpunkt** stimmen; Buttons „AGB ansehen" (`skipily.app/agb`) und „Zum Anbieter-Portal" funktionieren.
- [ ] DB-Check:
  ```sql
  select name, email, agb_accepted_version, agb_accepted_at, welcome_email_sent_at
  from service_providers where email = 'DEINE@mail';
  ```
  → `welcome_email_sent_at` ist **gesetzt** (Mail raus, Idempotenz aktiv).
- [ ] Logs `provider-welcome-email`: Eintrag mit Resend-`email_id`, kein 403/404.

## B) „Abo aktiv"-Mail (Pro/Enterprise)
- [ ] Im Portal das **Pro-Abo** abschließen. Stripe im **Testmodus**: Testkarte `4242 4242 4242 4242`, beliebiges Datum/CVC.
- [ ] Postfach: Mail „Dein Skipily Pro-Abo ist aktiv 🎉"; Button „Rechnungen verwalten" öffnet das Billing-Portal.
- [ ] Wenn der **Stripe-Schalter** (Settings → Customer emails) aktiv ist: zusätzlich kommt die **echte Rechnung von Stripe**.
- [ ] DB-Check:
  ```sql
  select subscription_status, subscription_tier, pro_welcome_email_sent_at
  from service_providers where email = 'DEINE@mail';
  ```
  → `active` / `professional` / `pro_welcome_email_sent_at` gesetzt.
- [ ] Logs `stripe-webhook`: `Pro-Willkommensmail gesendet: … → DEINE@mail`.

## Re-Test (Mails erneut auslösen)
```sql
-- Willkommensmail nochmal: Flag löschen + AGB-Annahme "antippen"
update service_providers
   set welcome_email_sent_at = null,
       agb_accepted_at = now()
 where email = 'DEINE@mail';

-- Abo-Mail nochmal: Flag löschen (feuert beim nächsten Subscription-Event)
update service_providers
   set pro_welcome_email_sent_at = null
 where email = 'DEINE@mail';
```
Für die Abo-Mail zusätzlich das Abo neu triggern — Admin-Panel: Button
**„🗑 Stripe-Abo (Test) zurücksetzen"**.

## Aufräumen
- [ ] Test-Provider löschen bzw. deaktivieren, damit er nicht in der Live-Anbieterliste auftaucht.

---

## Stolpersteine
- **Domain-Verifikation:** `skipily.app` ist in Resend verifiziert → Prod-Sends gehen an beliebige Adressen. Nur im Resend-Sandbox-Modus kämen Mails nur an verifizierte Adressen.
- **Stripe-Modus:** Testkarte funktioniert nur mit Stripe-Keys im **Testmodus**. Test- und Live-Webhook-Secret sind beide hinterlegt; der Webhook nimmt automatisch das passende.
- **Secret-Rotation:** Gate-Secret bei Bedarf rotieren — neuer Wert **identisch** in Vault (`welcome_email_secret`) **und** per `supabase secrets set WELCOME_EMAIL_SECRET=<neu> --project-ref vcjwlyqkfkszumdrfvtm`.

## Deploy-Referenz (bereits erledigt)
- Migration 105 eingespielt · Vault-Secret `welcome_email_secret` gesetzt · Edge-Env `WELCOME_EMAIL_SECRET` gesetzt · Functions `provider-welcome-email` + `stripe-webhook` deployed.
- **Offen:** Stripe-Dashboard → Settings → Customer emails: „Successful payments" + „Invoices" aktivieren (echte Rechnung per Mail).

Siehe auch Memory `provider-onboarding-emails`.
