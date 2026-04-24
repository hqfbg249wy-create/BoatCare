# Admin-Leitfaden - ServiceProvider Änderungen

## Übersicht

Benutzer können Änderungsvorschläge für ServiceProvider einreichen, die von einem Administrator geprüft und genehmigt werden müssen.

## Admin werden

Um als Admin Änderungen genehmigen zu können, muss Ihr Profil in der Datenbank die Rolle `admin` haben:

```sql
-- In Supabase SQL Editor ausführen:
UPDATE profiles
SET role = 'admin'
WHERE email = 'ihre-email@example.com';
```

## Änderungsvorschläge prüfen

### Schritt 1: Zugriff auf Admin-Bereich
1. Öffnen Sie die App
2. Gehen Sie zum **Profil**-Tab
3. Wenn Sie Admin-Rechte haben, sehen Sie den Bereich **"Admin-Bereich"**
4. Tippen Sie auf **"Änderungsvorschläge prüfen"**

### Schritt 2: Vorschläge ansehen
- Sie sehen eine Liste aller ausstehenden Änderungsvorschläge
- Jeder Eintrag zeigt:
  - Name des Betriebs
  - Welche Felder geändert werden sollen
  - Zeitpunkt der Einreichung

### Schritt 3: Vorschlag prüfen
1. Tippen Sie auf einen Vorschlag
2. Sie sehen eine Detailansicht mit:
   - Alten Werten (rot durchgestrichen)
   - Neuen vorgeschlagenen Werten (grün)
3. Prüfen Sie die Änderungen sorgfältig

### Schritt 4: Entscheidung treffen

#### Genehmigen
- Tippen Sie auf **"Genehmigen"** (grüner Button)
- Die Änderungen werden sofort im ServiceProvider übernommen
- Der Status wird auf "approved" gesetzt

#### Ablehnen
- Tippen Sie auf **"Ablehnen"** (roter Button)
- Optional: Geben Sie einen Ablehnungsgrund ein
- Der Vorschlag wird als "rejected" markiert
- Die ursprünglichen Daten bleiben unverändert

## Änderbare Felder

Benutzer können folgende Felder vorschlagen zu ändern:
- ✏️ Name
- ✏️ Beschreibung
- ✏️ Adresse (Straße, Stadt, PLZ, Land)
- ✏️ Kontaktdaten (Telefon, E-Mail, Website)
- ✏️ Kategorie (mit Auswahl oder eigene Kategorie)
- ✏️ Leistungen & Produkte
- ✏️ Vertretene Marken

## Datenbank-Struktur

### Tabelle: `provider_edit_suggestions`

```sql
- id: UUID (Primary Key)
- provider_id: UUID (Referenz auf service_providers)
- suggested_by: UUID (User der den Vorschlag gemacht hat)
- suggested_*: Optional geänderte Felder
- status: 'pending' | 'approved' | 'rejected'
- reviewed_by: UUID (Admin der geprüft hat)
- reviewed_at: TIMESTAMPTZ
- rejection_reason: TEXT
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ
```

## Workflow

```
User macht Änderung
    ↓
Vorschlag wird erstellt (status: pending)
    ↓
Admin sieht Vorschlag im Admin-Bereich
    ↓
Admin prüft Änderungen
    ↓
    ├─→ Genehmigen → Daten werden aktualisiert (status: approved)
    └─→ Ablehnen → Keine Änderung (status: rejected, + Grund)
```

## Best Practices

### Vor dem Genehmigen prüfen:
- ✅ Sind die Informationen korrekt?
- ✅ Ist die Formatierung konsistent?
- ✅ Gibt es Duplikate?
- ✅ Sind Links/E-Mails/Telefonnummern gültig?
- ✅ Passt die Kategorie zum Betrieb?

### Ablehnungsgründe dokumentieren:
- Ungenaue oder falsche Informationen
- Spam oder Missbrauch
- Unvollständige Daten
- Duplikate
- Formatierungsprobleme

## Technische Details

### RLS Policies
- **SELECT**: Jeder kann Vorschläge sehen
- **INSERT**: Nur authentifizierte User können Vorschläge erstellen
- **UPDATE**: Nur Admins können Status ändern

### Code-Dateien
- `AdminSuggestionsView.swift` - Admin-Oberfläche
- `EditServiceProviderView.swift` - Bearbeitungsformular
- `ProviderEditSuggestion.swift` - Datenmodel
- `007_provider_edit_suggestions.sql` - Datenbank-Schema

## Troubleshooting

### "Keine ausstehenden Vorschläge" obwohl welche existieren
- Prüfen Sie Ihre Admin-Rolle in der Datenbank
- Stellen Sie sicher, dass das SQL-Script ausgeführt wurde

### Genehmigung funktioniert nicht
- Prüfen Sie die RLS Policies in Supabase
- Überprüfen Sie die Logs in Xcode Console

### User kann keinen Vorschlag einreichen
- Fehler "row-level security policy": SQL-Script 007 noch nicht ausgeführt
- User ist nicht eingeloggt
