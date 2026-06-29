# skipily.app — Migration WordPress → statische Seite (Astro/Vercel)

Ziel: Die Marketing-Website komplett aus WordPress herauslösen und wie die
übrigen Frontends als statische Seite auf Vercel betreiben. Eine Quelle,
ein Deploy-Flow, beste SEO, FAQ live aus Supabase, kein WP-/Plugin-Ballast.

## 1. Tech-Stack
- **Astro** (Static-Site-Generator) → liefert echtes statisches HTML (Top-SEO),
  i18n eingebaut, kann FAQ beim Build aus Supabase ziehen, minimal JS.
  (Bewusst NICHT die Vite-SPA der Portale — die sind client-gerendert und für
  öffentliche SEO-Seiten ungeeignet.)
- **Vercel** Hosting (neues Projekt `skipily-web`), DNS später auf Vercel.
- **CSS:** `website-skipily/skipily-style.css` wird 1:1 übernommen (enthält
  alle `sk-*`-Klassen + `:root`-Tokens). Kein Redesign nötig.

## 2. Seiten & i18n
Inhalte liegen bereits vor:
| Seite | Quelle | Slug DE | Slug EN |
|---|---|---|---|
| Home | `skipily-home.html` / `en/skipily-home.html` | `/` | `/en/` |
| FAQ | aus Supabase `app_faqs` (Migration 095) | `/faq` | `/en/faq` |
| Impressum | `skipily-impressum.html` / `en/` | `/impressum` | `/en/imprint` |
| Datenschutz | `skipily-datenschutz.html` / `en/` | `/datenschutz` | `/en/privacy` |
| AGB | `skipily-agb.html` / `en/` | `/agb` | `/en/terms` |
| Konto löschen | `account-deletion.html` | `/account-deletion` | (zweisprachig) |

- **i18n:** Start mit **DE (Standard) + EN**; Struktur offen für FR/IT/ES/NL
  (Astro `i18n`-Routing, später Sprachen ergänzen). Sprachumschalter wie bei
  der Link-in-Bio-Seite.
- ⚠️ **Rechtstext-Slugs DE müssen gleich bleiben** (`/datenschutz`, `/impressum`,
  `/agb`) — sie sind extern verlinkt (siehe Redirects).

## 3. Bilder/Assets migrieren (WICHTIG)
Die Homepage lädt aktuell Bilder von `https://skipily.app/wp-content/uploads/…`
(Logo + Screenshots: `screenshot-karte.png`, `screenshot-ersatzteile-scaled.png`,
`screenshot-anfrage-scaled.png`, `screenshot-wartung-scaled.png`,
`screenshot-ki-scaled.png`, `screenshot-bewertungen-scaled.png`, Icon).
→ Diese **in die neue Seite** (`/assets/`) übernehmen, sonst brechen sie beim
WP-Abbau. Quellen: teils im Repo (`Skipily Go/…`, `marketing/playstore/`),
sonst vor dem Abschalten aus der WP-Mediathek herunterladen.
→ Im HTML die `wp-content/uploads`-URLs auf `/assets/…` umstellen.

## 4. FAQ aus Supabase (statt Copy-Paste)
- Tabelle `app_faqs` (Migration 095) ist die Quelle, gepflegt im **Admin-Panel**
  (neue Rubrik „Website-/App-FAQ", spiegelt die Provider-FAQ-Oberfläche).
- Astro holt die veröffentlichten FAQ **beim Build** (anon-Read-Policy) und
  rendert sie als statisches Accordion **inkl. `FAQPage`-JSON-LD** (SEO-Rich-Results).
- Aktualisierung: kurzer Re-Build/Deploy (oder Vercel Deploy Hook nach FAQ-Änderung).

## 5. Newsletter-Formular
WP-Shortcode entfällt → Ersatz nötig:
- Formular postet an euren ESP (**CleverReach**, ihr nutzt es schon) per
  Einbettungs-Formular oder über eine kleine Vercel-Serverless-Function
  (CleverReach-API). Double-Opt-in beibehalten.

## 6. Deploy (ohne Risiko)
1. Neues Vercel-Projekt **`skipily-web`** anlegen, **Preview-URL** testen.
2. WordPress bleibt **online**, bis die neue Seite vollständig & geprüft ist
   (kein Downtime, kein SEO-Bruch).
3. Erst dann DNS-Cutover.

## 7. DNS-Cutover + Redirects (KRITISCH)
- `skipily.app` (A/ALIAS) von IONOS/Apache auf **Vercel** umstellen.
- **301-Redirects** für alle bisherigen WP-URLs auf die neuen — v. a.:
  - `/datenschutz`, `/impressum`, `/agb` **müssen erreichbar bleiben**
    (Datenschutz-URL steht in **App Store & Play Store** → darf NICHT brechen!).
  - Alte WP-Pfade (`/wp-content/…`, evtl. `?p=`-Permalinks) sinnvoll weiterleiten.
- `vercel.json` mit `redirects`/`rewrites` pflegen.

## 8. SEO-Kontinuität
- `sitemap.xml` + `robots.txt` neu generieren (Astro-Integration).
- `hreflang`-Tags je Sprache, `canonical`-URLs.
- Open-Graph/Twitter-Cards übernehmen.
- `FAQPage`-Schema auf der FAQ-Seite.
- Nach Cutover in der **Google Search Console** neue Sitemap einreichen,
  Indexierung beobachten.

## 9. Reihenfolge / Phasen
1. **Phase 0 (jetzt):** FAQ-Backend `app_faqs` (Migration 095) ✅ + Admin-Rubrik.
2. **Phase 1:** Astro-Projekt `skipily-web` scaffolden, `skipily-style.css` +
   Home (DE/EN) portieren, Bilder nach `/assets/`, Preview-Deploy.
3. **Phase 2:** FAQ-Seite (Build aus Supabase + Schema), Rechtstexte, Konto-Löschen.
4. **Phase 3:** Newsletter-Formular (CleverReach), Sitemap/SEO, Sprachumschalter.
5. **Phase 4:** DNS-Cutover + 301-Redirects, Search Console, WP abschalten.

## 10. Wichtig fürs Timing
- Blockiert den **App-Launch nicht** — läuft parallel.
- Der **Datenschutz-Link in den Stores** muss über den ganzen Umzug erreichbar
  bleiben (notfalls vorab auf eine stabile URL setzen).
