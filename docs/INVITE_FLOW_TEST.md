# Provider-Invite-Flow — Test-Checkliste

Vollständige Test-Sequenz für den hybriden Onboarding-Flow
(CleverReach + Mailto). Abhaken nach jedem Schritt.

## A. Vor dem ersten Test — Setup

### A1. Edge Function deployen
```bash
supabase functions deploy invite-existing-provider
```
- [ ] Deploy ohne Fehler durchgelaufen
- [ ] Im Supabase Dashboard → Edge Functions → invite-existing-provider:
      Last deployed-Timestamp ist aktuell

### A2. Edge Function Secrets setzen
Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- [ ] `CLEVERREACH_CLIENT_ID`
- [ ] `CLEVERREACH_CLIENT_SECRET`
- [ ] `CLEVERREACH_GROUP_PROVIDER_ONBOARDING` (ID aus CR — Schritt A3)
- [ ] `PROVIDER_PORTAL_URL` *(optional, Default = https://provider.skipily.app)*

> Diese Secrets sind separat von den scraper-backend-Env-Vars. Selbst wenn
> CleverReach im scraper-backend schon läuft, brauchen die Edge Functions
> ihren eigenen Satz.

### A3. CleverReach konfigurieren

1. **Group anlegen**
   - CR → Empfänger → Empfängergruppen → "Group hinzufügen"
   - Name: `Provider Onboarding`
   - Group-ID (zweistellig oder mehr) merken → in `CLEVERREACH_GROUP_PROVIDER_ONBOARDING` eintragen

2. **Custom Attribute der Group ergänzen**
   - In der neuen Group → Einstellungen → Empfänger-Felder
   - Felder hinzufügen (alle als Text):
     - [ ] `company`
     - [ ] `city`
     - [ ] `country`
     - [ ] `category`
     - [ ] `claim_link`
     - [ ] `provider_id`

3. **Auto-Responder erstellen**
   - CR → Mailings → "Mailing erstellen" → Auto-Responder
   - Trigger: "Empfänger wird zur Group hinzugefügt" → Group: `Provider Onboarding`
   - Verzögerung: `sofort` (0 Minuten)
   - Template anlegen mit Platzhaltern `{COMPANY}` und `{CLAIM_LINK}`
   - Beispiel-Body:
     ```
     Hallo {COMPANY},

     willkommen bei Skipily — der Plattform, über die Bootseigner
     direkt mit Werften, Riggern und Service-Betrieben zusammenfinden.

     Hier ist Euer persönlicher Zugang zum Provider-Portal:
     {CLAIM_LINK}

     Beim ersten Klick könnt Ihr ein Passwort vergeben und Euer Profil
     übernehmen.

     Schöne Grüße
     Das Skipily-Team
     ```
   - Mailing aktivieren ("Senden"-Status auf "aktiv")
   - [ ] Auto-Responder ist aktiv

### A4. Supabase Auth-Templates leeren
Damit auch in jedem anderen Auth-Flow keine zweite Mail rausgeht:

Supabase Dashboard → Authentication → Email Templates:
- [ ] **Confirm signup**: Subject + Body leeren ODER mit kurzem Hinweis "Mail kommt über Skipily / CleverReach" ersetzen
- [ ] **Magic Link**: dito
- [ ] **Reset Password**: dito *(Vorsicht: dann muss `/forgot-password` im Portal manuell den Link generieren — derzeit funktioniert das im Provider-Portal schon)*
- [ ] **Invite user**: dito

## B. Test-Provider vorbereiten

In Supabase SQL-Editor:
```sql
-- Provider finden, der noch nicht beansprucht ist
SELECT id, name, email, user_id, claimed_at, claim_token
FROM service_providers
WHERE user_id IS NULL
  AND claimed_at IS NULL
  AND email IS NOT NULL
LIMIT 5;
```
- [ ] Mindestens einen Test-Provider ohne Account gefunden → ID notieren

Alternativ: Test-Provider anlegen
```sql
INSERT INTO service_providers (name, email, category, city, country)
VALUES ('Test Werft', 'dein-test+skipily@example.com', 'repair', 'Bonn', 'DE')
RETURNING id, claim_token;
```
- [ ] Test-Provider erstellt → ID + claim_token notieren

## C. UI-Test im Admin

1. **Admin-Web mit Hard-Reload öffnen**: Cmd+Shift+R
   - [ ] DevTools Console offen, `typeof openInviteMailDialog` → `"function"`

2. **Test-Provider im Bearbeiten-Modal öffnen**
   - [ ] Zugangsdaten-Sektion zeigt "Noch kein Account"
   - [ ] **Beide Buttons sichtbar** und aktiviert:
     - ✉️ Willkommensmail via CleverReach
     - 📧 Nachfassen per Mail

### C1. Pfad "Nachfassen per Mail" (sicherer Pfad — testet keinen externen Versand)
- [ ] Klick auf **📧 Nachfassen per Mail**
- [ ] Dialog öffnet sich mit Betreff + editierbarem Body
- [ ] Body enthält den Claim-Link in der Form `https://provider.skipily.app/claim/<uuid>`
- [ ] **Vorlage speichern**-Test: Body kurz ändern → Speichern → Dialog schließen → erneut klicken → geänderter Text ist da
- [ ] **Zurücksetzen**-Test: → Default-Text ist wieder da
- [ ] **Im Mailprogramm öffnen** → Mac öffnet Mail.app / Outlook mit allen Feldern befüllt
- [ ] **In DB prüfen**: Provider hat noch keinen `user_id` (nur Link wurde generiert, kein Versand stattgefunden)

### C2. Claim-Link einlösen (testet Provider-Portal)
- [ ] Claim-URL im Browser öffnen (Inkognito-Tab empfohlen)
- [ ] `/claim/<token>`-Seite zeigt Provider-Daten
- [ ] Passwort setzen → erfolgreicher Login ins Provider-Portal
- [ ] In Admin-Modal neu öffnen: Zugangsdaten-Sektion zeigt jetzt
      "✅ Account verknüpft" — beide Buttons sind **disabled**

### C3. Pfad "CleverReach"
**⚠️ Achtung: schickt eine echte Mail!** Vorher Provider-Email auf Test-Inbox umstellen.

- [ ] Anderen ungeclaimten Provider auswählen (oder neuen anlegen, siehe B)
- [ ] Im Modal: Versand-Adresse auf eigene Test-Mail überschreiben
- [ ] Klick auf **✉️ Willkommensmail via CleverReach**
- [ ] Grüne Erfolgsmeldung erscheint
- [ ] **In CleverReach prüfen**: Empfängergruppen → Provider Onboarding → neuer Eintrag mit `company`, `claim_link` etc.
- [ ] **In Test-Inbox**: Auto-Responder-Mail mit korrektem Firmennamen + Link
- [ ] Link aus der Mail klicken → /claim-Seite öffnet → Passwort setzen
- [ ] Provider ist jetzt geclaimt → beide Admin-Buttons disabled

## D. Edge Function direkt testen (Curl)
Siehe `scripts/test-invite-flow.sh`:
```bash
export ADMIN_JWT="<aus localStorage>"
export TEST_PROVIDER_ID="<uuid>"
export TEST_EMAIL_OVERRIDE="dein-test+cr@example.com"
bash scripts/test-invite-flow.sh
```
- [ ] Test 1 (mailto): `mode: "mailto"`, gültige `claim_url`
- [ ] Test 2 (cleverreach): `mode: "cleverreach"`, Mail in Test-Inbox
- [ ] Test 3 (bereits geclaimt): HTTP 409

## E. Edge-Cases

- [ ] Provider ohne `email` in DB + ohne Override → klare Fehlermeldung
- [ ] Override-Mail wird in DB persistiert (`service_providers.email` aktualisiert)
- [ ] Bei CR-Konfigurations-Fehler (falsche Group-ID) → 502 mit klarem Hinweis
- [ ] Bei Supabase-Outage / Network-Fail → kein halber State (kein User ohne verknüpften Provider)

## F. Ausstieg / Rollback

Wenn etwas grundlegend nicht passt:
```bash
git revert 4031276
supabase functions deploy invite-existing-provider
```
Damit ist der alte `inviteUserByEmail`-Flow zurück.
