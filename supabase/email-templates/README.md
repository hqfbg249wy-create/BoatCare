# Supabase E-Mail-Templates

Versionierte Kopien der Auth-E-Mail-Templates. Supabase pflegt die
**aktiven** Templates nur im Dashboard — diese Dateien sind die
Referenz/Quelle, damit Änderungen nachvollziehbar bleiben.

## Einspielen

Dashboard → **Authentication → Email Templates** → jeweiliges Template
auswählen → HTML-Quelltext aus der entsprechenden Datei einfügen → **Save**.

| Datei            | Supabase-Template   | Subject-Vorschlag                  |
|------------------|---------------------|------------------------------------|
| `recovery.html`  | Reset Password      | `Skipily — Passwort zurücksetzen`  |

## Wichtig

- **Link-basiert, kein `{{ .Token }}`** (6-stelliger Code). Der Klick auf
  den Button authentifiziert über den Token in der `{{ .ConfirmationURL }}`.
  Ein separater Code wäre nur Verwirrung.
- Die `{{ .ConfirmationURL }}` führt zur in **URL Configuration → Redirect URLs**
  freigegebenen Zieladresse. Für Provider-Resets muss
  `https://provider.skipily.app/**` in der Allowlist stehen, sonst fällt
  Supabase auf die Site-URL (Eigner-Portal) zurück.

## Verfügbare Template-Variablen (Recovery)

| Variable               | Bedeutung                          |
|------------------------|------------------------------------|
| `{{ .ConfirmationURL }}` | Reset-Link inkl. Token           |
| `{{ .Token }}`         | 6-stelliger OTP-Code (hier ungenutzt) |
| `{{ .Email }}`         | Empfänger-Adresse                  |
| `{{ .SiteURL }}`       | Konfigurierte Site-URL             |
