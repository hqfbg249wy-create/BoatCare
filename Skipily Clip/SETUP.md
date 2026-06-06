# Skipily App Clip — Setup-Anleitung

Code für ein **Standalone App-Clip-Target**, das die Marina-Discovery-Experience umsetzt:
QR-Scan im Hafen → öffnet den Clip → zeigt Skipily-Provider in der Nähe auf einer Karte
mit Tipp-fähigen Markern und „Route"-Button → Apple bietet automatisch unten den
„Skipily App laden"-Banner an.

Code ist bewusst **ohne** Supabase-Swift-SDK und Stripe-iOS gebaut (REST + URLSession),
damit das Clip-Bundle unter dem Apple-Limit von **15 MB** bleibt.

## 1. Xcode-Target anlegen

1. Xcode → **File → New → Target**
2. **App Clip** auswählen → Next
3. **Product Name:** `Skipily Clip`
   **Bundle Identifier:** `Boating.Skipily.Clip`
   **Interface:** SwiftUI · **Language:** Swift
4. **Embed in Application:** Skipily (die Haupt-App)
5. Finish.

Xcode legt dir einen Default-Ordner an. **Lösche die Default-Files** und ersetze sie
durch den Inhalt dieses `Skipily Clip/`-Ordners (alle `.swift`-Files, `Info.plist`,
`SkipilyClip.entitlements`).

Wenn dein Projekt auf **synchronized folders** läuft (modernes Xcode 16): einfach die
`Skipily Clip/`-Ordner im Project Navigator droppen — Files werden automatisch dem
neuen Target zugewiesen.

## 2. Bundle-ID + Entitlements verknüpfen

Im Target-Settings des **Skipily Clip**-Targets:

- **General → Identity → Bundle Identifier:** `Boating.Skipily.Clip`
- **Signing & Capabilities:**
  - „+ Capability" → **App Clips** (sollte schon automatisch da sein)
  - „+ Capability" → **Associated Domains** → eintragen: `appclips:skipily.app`
- **Build Settings → Code Signing Entitlements:**
  `Skipily Clip/SkipilyClip.entitlements`
- **Build Settings → Info.plist File:**
  `Skipily Clip/Info.plist`

## 3. Im Apple Developer Console (sollte automatisch passieren)

Xcode legt beim Build automatisch die App-ID `Boating.Skipily.Clip` an und
verknüpft sie als „App Clip" zur Parent-App-ID `Boating.Skipily`. Falls nicht:

1. https://developer.apple.com/account → **Identifiers**
2. Parent-App-ID `Boating.Skipily` anklicken → Capability **App Clips** anhaken → Save
3. Neue App-ID `Boating.Skipily.Clip` als Typ „App Clip" anlegen, Parent: `Boating.Skipily`

## 4. AASA-Datei hosten (kritisch!)

iOS prüft `https://skipily.app/.well-known/apple-app-site-association` bevor es
einen Clip startet. **Ohne diese Datei funktioniert NICHTS.**

Datei liegt unter `website-skipily/.well-known/apple-app-site-association` —
**genau in dieser Schreibweise**, ohne `.json`-Endung, ohne BOM.

Hosting-Anforderungen:
- **HTTPS** (Pflicht)
- **Content-Type:** `application/json`
- **Kein Redirect** (302/301 verboten)
- Erreichbar unter `https://skipily.app/.well-known/apple-app-site-association`
  UND optional `https://skipily.app/apple-app-site-association`

Beispiel Apache `.htaccess`:
```
<Files "apple-app-site-association">
  ForceType "application/json"
  Header set Content-Type "application/json"
</Files>
```

Vercel/Netlify: in `vercel.json` ergänzen:
```json
{
  "headers": [
    { "source": "/.well-known/apple-app-site-association",
      "headers": [{ "key": "Content-Type", "value": "application/json" }] }
  ]
}
```

**Validieren** nach Deploy:
```bash
curl -I https://skipily.app/.well-known/apple-app-site-association
# Sollte: HTTP/2 200, Content-Type: application/json
```

Apple's offizieller Validator: https://search.developer.apple.com/appsearch-validation-tool/

## 5. App Store Connect Experience anlegen

1. App Store Connect → deine App **Skipily** → **App Clip** Tab
2. **„App Clip Experience hinzufügen"**
3. **Default URL:** `https://skipily.app/clip`
4. **Header Image:** 1800×1200 PNG (Hero-Bild für den Clip-Banner)
5. **Titel:** `Anbieter in der Nähe`
6. **Subtitle:** `Bootsservice und Werften live auf der Karte`
7. **Action:** `View` (Deutsch: „Anschauen")
8. **Save**

## 6. QR-Codes generieren

Du hast zwei Optionen:

**A) Standard-QR-Code** (jeder QR-Generator):
- URL einbetten: `https://skipily.app/clip?marina=keil-hafen`
- iOS Camera erkennt URL → bietet „Skipily App Clip öffnen" an

**B) App Clip Codes** (Apple-eigenes Design, runder Code mit Logo):
- Xcode → Edit Scheme → Arguments tab → Environment Variables
  - Name: `_XCAppClipURL`  Value: `https://skipily.app/clip?marina=test`
- App Clip Code Generator: https://developer.apple.com/app-clips/app-clip-codes/
- Tool macht aus deiner URL einen runden „Skipily"-Branded-Code mit NFC-Tag-Support

## 7. Testen

- **Im Simulator:** Edit Scheme → Run → Arguments → `_XCAppClipURL` setzen → Run
- **Auf echtem iPhone:**
  1. Build & Run auf das Gerät
  2. Schick dir per iMessage einen Link: `https://skipily.app/clip`
  3. Tippen → iOS zeigt App Clip Card
  4. „Öffnen" tippen → dein Clip startet
- **Per Safari:** `skipily.app/clip` direkt aufrufen → Safari zeigt Smart-Banner

## 8. Updates pushen

Der Clip wird zusammen mit der Haupt-App im selben Archive ausgeliefert.
- Archive → App Store Connect Upload (wie immer)
- App Clip wird zusammen mit der App reviewed
- Experience-Konfiguration im App Store Connect kann jederzeit separat aktualisiert
  werden (z. B. neue Header-Images, andere Default-URLs)

## Wichtige Constraints

- **Max 15 MB komprimiert** — wenn du SDK hinzufügst, im Anschluss prüfen:
  `xcrun bundletool size --bundle=path/to/Clip.ipa`
- **iOS 14+** Pflicht-Mindestversion
- **Kein lokaler Speicher über Clip-Restart hinaus** — UserDefaults wird gelöscht,
  wenn der User den Clip schließt und 8h+ nicht zurückkommt
- **Keine Background-Tasks**, **kein Push**, **kein HealthKit**, **kein WebKit-WKWebView**
- **Stripe-Käufe** funktionieren via Stripe-iOS (nicht in diesem MVP enthalten — Clip soll discovery, nicht checkout)
