# Skipily — CleverReach Mailing-Vorlagen

Vorlagen für die ersten Aussende-Kampagnen an Marine-Service-Provider.

## Dateien

| Datei | Sprache | Verwendung |
|---|---|---|
**Service-Provider Launch-Mailing** — alle Werften / Werkstätten / Segelmacher etc.:

| `de-launch.html` / `.txt` | 🇩🇪 Deutsch | DE-, AT-, CH-Listen |
| `en-launch.html` / `.txt` | 🇬🇧 English | GB-, US-, IE-, internationale Liste |
| `fr-launch.html` / `.txt` | 🇫🇷 Français | FR-, BE- (Wallonien), LU-, MC-Listen |
| `it-launch.html` / `.txt` | 🇮🇹 Italiano | IT-, SM-, VA-Liste |
| `es-launch.html` / `.txt` | 🇪🇸 Español | ES-, AD-Liste, LatAm |
| `nl-launch.html` / `.txt` | 🇳🇱 Nederlands | NL-, BE- (Flandern)-Liste |

**Shop-Anbindung** — für Online-Händler / Bootszubehör-Shops (KI-Matching-Pitch):

| `de-shop.html` / `.txt` | 🇩🇪 Deutsch | Marketplace-Pitch DE-Region |
| `en-shop.html` | 🇬🇧 English | International Online-Shops |

| `SUBJECTS.md` | alle | Betreffzeilen + Preheader-Texte (6 Sprachen) |

## Personalisierungs-Variablen

In den Templates verwendete CleverReach-Variablen — werden aus der CSV
übernommen, die du im Admin-Panel exportierst:

| Variable | Quelle | Beispiel |
|---|---|---|
| `{$company}` | CSV-Spalte `company` | „Bottsand Bootsbau GmbH" |
| `{$city}` | CSV-Spalte `city` | „Heikendorf" |
| `{$category}` | CSV-Spalte `category` | „Bootsbauer" |
| `{$website}` | CSV-Spalte `website` | https://bottsand-bootsbau.de |
| `{$unsubscribe}` | CleverReach automatisch | (Abmelde-Link) |

CleverReach füllt diese Platzhalter automatisch aus, wenn die CSV
beim Import korrekt gemappt wurde.

## Setup in CleverReach (Schritt für Schritt)

### 1. Mailing erstellen

1. CleverReach Dashboard → **Mailings → Neues Mailing**
2. **„Source-Code-Editor"** wählen (nicht „Drag & Drop", damit unser
   HTML 1:1 übernommen wird)
3. **Empfängerliste** auswählen, z. B. „Skipily DE-Provider"

### 2. Subject + Preheader

Aus `SUBJECTS.md` für die jeweilige Sprache:
- Subject Line einsetzen (Variante A oder per A/B-Test mehrere)
- Preheader-Text einsetzen

### 3. HTML einfügen

1. Inhalt von z. B. `de-launch.html` öffnen
2. Komplett kopieren
3. Im Source-Editor von CleverReach einfügen
4. **Vorschau** → checken ob Variablen wie `{$company}` korrekt erkannt
   werden (CleverReach zeigt mit Beispiel-Daten aus der Liste)

### 4. Text-Version (Pflicht für gute Spam-Werte)

Aus z. B. `de-launch.txt` kopieren → in den **Plain-Text-Tab** im
Mailing-Editor einfügen.

### 5. Versand-Einstellungen

- **Absender**: dein Skipily-Mailbox (z. B. info@skipily.app)
- **Absender-Name**: „Skipily Team"
- **Reply-To**: gleiche Adresse oder support@skipily.app
- **Versand-Zeitfenster**: Di–Do, 10–12 Uhr Ortszeit der Liste
  (B2B-Best-Practice)

### 6. A/B-Test (optional aber empfohlen)

CleverReach → Subject-Line-Split:
- 20% der Liste bekommt Subject A
- 20% bekommt Subject B
- Nach 4 Stunden: die Variante mit höherer Open-Rate geht an die
  restlichen 60%

### 7. Test-Versand vor Live-Versand

**Pflicht-Check**: Mailing an dich selbst senden + 1-2 Kollegen:
- Variablen korrekt befüllt? `{$company}` → „Bottsand Bootsbau GmbH"
- Logo lädt?
- Buttons funktionieren? (App-Store-Link, Provider-Portal-Link)
- Abmelde-Link funktioniert?
- Spam-Tests in CleverReach (Spam-Score < 5)

## Versand-Strategie

### Empfohlene Reihenfolge

1. **Test-Mailing** an dich selbst (kleine Liste mit 5 eigenen
   Adressen)
2. **Soft-Launch DE** mit 50 Empfängern → Open-Rate + Bounce-Rate
   checken (Ziel: Open > 20%, Bounce < 2%)
3. Falls Werte gut → **vollständiger DE-Versand**
4. Eine Woche später: **EN-Versand**
5. Danach FR/IT/ES/NL je nach Volumen

### Frequenz

- **Launch-Mailing**: einmalig pro Liste
- **Follow-up nach 2 Wochen**: an die, die nicht geöffnet haben
  (CleverReach „Segment: nicht geöffnet")
- **Monatlicher Newsletter**: erst nach erstem Profil-Claim-Erfolg
  (nicht im B2B-Cold-Reach-Modus)

## DSGVO / B2B-Hinweise

Die Templates enthalten den DSGVO-Hinweis nach Art. 6 (1) (f):
"berechtigtes Interesse an B2B-Branchenkommunikation".

**Wichtig:**
- Adressen müssen **vorab verifiziert** sein (über das E-Mail-Check-Tool)
- Abmelde-Link in **jeder Mail** prominent
- **Bei Abmeldung**: sofortige Aufnahme in CleverReach-Blocklist (automatisch)
- **Keine Privat-Mails** (gmx, web.de, gmail) — nur Firmen-Domains
  → in der CSV-Export-Logik bereits berücksichtigt
- **Impressum-Link** in jeder Mail

## Skipily-Brand-Elemente in den Templates

- **Farben**: Navy `#0B1D3A`, Orange `#f97316`
- **Logo**: `https://skipily.app/wp-content/uploads/2024/skipily-icon.png`
- **Tagline**: „ALWAYS · SAFE · READY TO SAIL"
- **App-Store-URL**: `https://apps.apple.com/app/id6757314378`
- **Provider-Claim-URL**: `https://provider.skipily.app/claim?source=newsletter`
