<?php
/**
 * Code Snippet fuer skipily.app/clip — Landing-Page mit
 * Geolokalisierung und Provider-Liste in der Naehe.
 *
 * Installation:
 *   WordPress-Admin → Snippets → Neu hinzufuegen → kompletten
 *   Code aus diesem File einfuegen → Save Changes and Activate.
 *
 * Aufruf:
 *   https://skipily.app/clip      → vollstaendige Landing-Page
 *   https://skipily.app/clip?lang=en  → erzwingt englisches UI
 *
 * Funktionsweise:
 *   - Faengt /clip und /clip/* vor dem WordPress-Routing ab
 *   - Rendert eine schlanke responsive HTML-Page
 *   - Browser-JS fragt nach Geolocation
 *   - Holt Provider via Supabase REST (anon key, public read)
 *   - Zeigt Liste mit Distanz + Karten-Link
 */

add_action('init', function () {
    $uri = $_SERVER['REQUEST_URI'] ?? '';
    $path = parse_url($uri, PHP_URL_PATH);

    if ($path !== '/clip' && strpos($path, '/clip/') !== 0) {
        return;
    }

    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache, must-revalidate');

    // Sprach-Erkennung: Query-Param hat Vorrang, sonst Accept-Language.
    $lang = isset($_GET['lang']) ? substr(strtolower($_GET['lang']), 0, 2) : '';
    if (!in_array($lang, ['de','en','fr','it','es','nl'])) {
        $acc = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';
        $first = strtolower(substr($acc, 0, 2));
        $lang = in_array($first, ['de','en','fr','it','es','nl']) ? $first : 'en';
    }

    $t = [
        'de' => [
            'title'   => 'Bootsservice in Deiner Nähe',
            'sub'     => 'Werften, Motorservice, Zubehör, Segelmacher und vieles mehr in Deiner Umgebung',
            'allow'   => 'Standort erlauben, um Anbieter zu sehen',
            'loading' => 'Anbieter werden geladen …',
            'denied'  => 'Standortzugriff verweigert. Bitte erlauben.',
            'none'    => 'Keine Skipily-Anbieter im 50-km-Umkreis gefunden.',
            'route'   => 'Route',
            'unrated' => 'Keine Bewertung',
            'services'=> 'Leistungen',
            'cta'     => 'Hol dir Skipily im App Store, um alle Funktionen zu nutzen.',
            'badge'   => 'Lade aus dem App Store',
            'sticky_title' => 'Skipily kostenlos laden',
            'sticky_sub'   => 'Wartung, KI-Assistent, Ersatzteile',
            'sticky_cta'   => 'Öffnen',
            'meters'  => 'm',
            'km'      => 'km',
        ],
        'en' => [
            'title'   => 'Marine services near you',
            'sub'     => 'Boatyards, engine service, supplies, sailmakers and much more around you',
            'allow'   => 'Allow location to see providers',
            'loading' => 'Loading providers …',
            'denied'  => 'Location denied. Please allow access.',
            'none'    => 'No Skipily providers within 50 km.',
            'route'   => 'Directions',
            'unrated' => 'Not yet rated',
            'services'=> 'Services',
            'cta'     => 'Get Skipily on the App Store for the full experience.',
            'badge'   => 'Download on the App Store',
            'sticky_title' => 'Get Skipily — free',
            'sticky_sub'   => 'Maintenance, AI assistant, spare parts',
            'sticky_cta'   => 'Open',
            'meters'  => 'm',
            'km'      => 'km',
        ],
        'fr' => [
            'title'   => 'Services nautiques près de chez vous',
            'sub'     => 'Chantiers, mécanique, accessoires, voileries et bien plus autour de vous',
            'allow'   => 'Autorisez la localisation pour voir les services',
            'loading' => 'Chargement des prestataires …',
            'denied'  => 'Accès à la localisation refusé.',
            'none'    => 'Aucun prestataire Skipily dans un rayon de 50 km.',
            'route'   => 'Itinéraire',
            'unrated' => 'Sans avis',
            'services'=> 'Services',
            'cta'     => 'Téléchargez Skipily sur l\'App Store pour toutes les fonctionnalités.',
            'badge'   => 'Télécharger dans l\'App Store',
            'sticky_title' => 'Skipily — gratuit',
            'sticky_sub'   => 'Maintenance, assistant IA, pièces',
            'sticky_cta'   => 'Ouvrir',
            'meters'  => 'm',
            'km'      => 'km',
        ],
        'it' => [
            'title'   => 'Servizi nautici vicino a te',
            'sub'     => 'Cantieri, meccanica, accessori, velerie e molto altro intorno a te',
            'allow'   => 'Consenti la posizione per vedere i fornitori',
            'loading' => 'Caricamento fornitori …',
            'denied'  => 'Accesso alla posizione negato.',
            'none'    => 'Nessun fornitore Skipily entro 50 km.',
            'route'   => 'Indicazioni',
            'unrated' => 'Senza recensioni',
            'services'=> 'Servizi',
            'cta'     => 'Scarica Skipily dall\'App Store per l\'esperienza completa.',
            'badge'   => 'Scarica dall\'App Store',
            'sticky_title' => 'Skipily — gratis',
            'sticky_sub'   => 'Manutenzione, assistente IA, ricambi',
            'sticky_cta'   => 'Apri',
            'meters'  => 'm',
            'km'      => 'km',
        ],
        'es' => [
            'title'   => 'Servicios náuticos cerca de ti',
            'sub'     => 'Astilleros, mecánica, accesorios, velerías y mucho más a tu alrededor',
            'allow'   => 'Permite la ubicación para ver proveedores',
            'loading' => 'Cargando proveedores …',
            'denied'  => 'Acceso a la ubicación denegado.',
            'none'    => 'No hay proveedores Skipily en un radio de 50 km.',
            'route'   => 'Cómo llegar',
            'unrated' => 'Sin valoración',
            'services'=> 'Servicios',
            'cta'     => 'Descarga Skipily en el App Store para la experiencia completa.',
            'badge'   => 'Descargar en el App Store',
            'sticky_title' => 'Skipily — gratis',
            'sticky_sub'   => 'Mantenimiento, asistente IA, repuestos',
            'sticky_cta'   => 'Abrir',
            'meters'  => 'm',
            'km'      => 'km',
        ],
        'nl' => [
            'title'   => 'Botenservice bij jou in de buurt',
            'sub'     => 'Werven, motorservice, accessoires, zeilmakers en veel meer in jouw omgeving',
            'allow'   => 'Geef toestemming voor locatie',
            'loading' => 'Aanbieders worden geladen …',
            'denied'  => 'Locatietoegang geweigerd.',
            'none'    => 'Geen Skipily-aanbieders binnen 50 km.',
            'route'   => 'Route',
            'unrated' => 'Nog niet beoordeeld',
            'services'=> 'Diensten',
            'cta'     => 'Haal Skipily uit de App Store voor de volledige ervaring.',
            'badge'   => 'Downloaden in de App Store',
            'sticky_title' => 'Skipily — gratis',
            'sticky_sub'   => 'Onderhoud, AI-assistent, onderdelen',
            'sticky_cta'   => 'Openen',
            'meters'  => 'm',
            'km'      => 'km',
        ],
    ][$lang];

    $supabase_url  = 'https://vcjwlyqkfkszumdrfvtm.supabase.co';
    $supabase_anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ';

    ?><!doctype html>
<html lang="<?= esc_attr($lang) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Skipily — <?= esc_html($t['title']) ?></title>
<meta name="theme-color" content="#f97316">
<!--
  Apple Smart App Banner — iOS Safari zeigt damit automatisch oben einen
  Banner mit "Öffnen / Im App Store anschauen". Setzt voraus, dass die
  App-ID nach App-Store-Launch eingetragen wird.
  Vor Launch: bleibt ohne Banner, kein Fehler.
-->
<meta name="apple-itunes-app"
      content="app-id=6757314378, app-clip-bundle-id=Boating.Skipily.Clip">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%; font-family: -apple-system, "SF Pro Display",
      "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    background: #fafafa; color: #0B1D3A;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 560px; margin: 0 auto; padding: 24px 20px 110px; }
  header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
  }
  header img { width: 56px; height: 56px; border-radius: 12px; }
  header h1 {
    font-size: 1.5rem; font-weight: 800; letter-spacing: 1px;
  }
  header p {
    color: #64748b; font-size: 0.92rem; margin-top: 2px;
  }
  .hero {
    background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
    color: #fff; padding: 18px 18px 22px; border-radius: 16px;
    margin-bottom: 18px; box-shadow: 0 4px 16px rgba(249,115,22,0.25);
  }
  .hero h2 { font-size: 1.15rem; font-weight: 700; }
  .hero p { font-size: 0.9rem; opacity: 0.92; margin-top: 6px; }

  .status {
    text-align: center; padding: 16px; color: #64748b;
    font-size: 0.95rem;
  }
  .provider {
    display: flex; gap: 14px; padding: 16px;
    background: #fff; border: 1px solid #e2e8f0;
    border-radius: 14px; margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  /* Provider-Icon — neutraler heller Untergrund, damit das Profession-Symbol
     gut lesbar bleibt. Bewertung wandert in den Sterne-Badge unter dem Namen. */
  .pin {
    width: 48px; height: 48px; border-radius: 12px;
    background: #fff7ed; color: #0B1D3A;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; flex-shrink: 0;
    border: 1px solid #fde4c4;
  }

  .info { flex: 1; min-width: 0; }
  .info .name { font-weight: 700; font-size: 1.02rem; line-height: 1.25; }
  .info .meta { color: #64748b; font-size: 0.82rem; margin-top: 3px; }

  .rating {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 6px; font-size: 0.85rem;
    padding: 3px 9px; border-radius: 999px;
    background: #f1f5f9; color: #475569;
  }
  .rating .stars { color: #f59e0b; letter-spacing: 0px; }
  .rating .num { font-weight: 700; }
  .rating .none { color: #94a3b8; font-style: italic; }

  /* Bewertungs-Farbcode: gruen >=4.5, gelb >=3.5, rot <3.5, sonst blau (unrated) */
  .rating.r-green  { background: #dcfce7; color: #166534; }
  .rating.r-yellow { background: #fef9c3; color: #854d0e; }
  .rating.r-red    { background: #fee2e2; color: #991b1b; }
  .rating.r-blue   { background: #dbeafe; color: #1e40af; }

  .chips {
    display: flex; flex-wrap: wrap; gap: 5px;
    margin-top: 6px;
  }
  .chip {
    background: #f1f5f9; color: #475569;
    padding: 2px 8px; border-radius: 10px;
    font-size: 0.72rem; line-height: 1.5;
  }
  .chip.cat {
    background: #fff7ed; color: #c2410c; font-weight: 600;
  }

  .row-foot {
    display: flex; align-items: center; justify-content: space-between;
    margin-top: 10px; padding-top: 9px;
    border-top: 1px solid #f1f5f9;
  }
  .dist {
    color: #f97316; font-size: 0.86rem; font-weight: 700;
    display: flex; align-items: center; gap: 4px;
  }
  .route {
    padding: 8px 14px;
    background: #f97316; border: 1px solid #f97316;
    color: #fff; border-radius: 8px;
    font-size: 0.84rem; font-weight: 600;
    text-decoration: none; white-space: nowrap;
  }
  .route:active { background: #ea580c; }
  .footer {
    margin-top: 28px; padding: 18px 16px;
    background: #fff; border: 1px solid #e2e8f0;
    border-radius: 12px; text-align: center;
  }
  .footer p { color: #475569; font-size: 0.88rem; line-height: 1.4; }
  .appstore {
    display: inline-block; margin-top: 10px;
    padding: 10px 14px; background: #000; color: #fff;
    border-radius: 8px; text-decoration: none;
    font-size: 0.9rem; font-weight: 600;
  }
  .legal {
    margin-top: 16px; text-align: center;
    font-size: 0.74rem; color: #94a3b8;
  }
  .legal a { color: #94a3b8; margin: 0 6px; }

  /* Sticky Install-Bar — immer sichtbar unten */
  .sticky {
    position: fixed; left: 0; right: 0; bottom: 0;
    background: #0B1D3A; color: #fff;
    padding: 12px 16px 14px;
    padding-bottom: calc(14px + env(safe-area-inset-bottom));
    display: flex; align-items: center; gap: 12px;
    box-shadow: 0 -4px 16px rgba(0,0,0,0.2);
    z-index: 100;
  }
  .sticky-icon {
    width: 42px; height: 42px; border-radius: 10px;
    flex-shrink: 0; background: #fff;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .sticky-icon img { width: 100%; height: 100%; object-fit: cover; }
  .sticky-text { flex: 1; min-width: 0; }
  .sticky-text .t { font-size: 0.95rem; font-weight: 700; }
  .sticky-text .s { font-size: 0.78rem; opacity: 0.75; margin-top: 2px; }
  .sticky-cta {
    background: #f97316; color: #fff;
    padding: 9px 16px; border-radius: 8px;
    font-size: 0.92rem; font-weight: 700;
    text-decoration: none; white-space: nowrap;
  }
  .sticky-cta:active { background: #ea580c; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <img src="/wp-content/uploads/2024/skipily-icon.png"
         onerror="this.style.display='none'"
         alt="Skipily">
    <div>
      <h1>SKIPILY</h1>
      <p>IMMER · SICHER · SEEKLAR</p>
    </div>
  </header>

  <div class="hero">
    <h2><?= esc_html($t['title']) ?></h2>
    <p><?= esc_html($t['sub']) ?></p>
  </div>

  <div id="status" class="status"><?= esc_html($t['allow']) ?></div>
  <div id="list"></div>

  <div class="footer">
    <p><?= esc_html($t['cta']) ?></p>
    <a class="appstore" href="https://apps.apple.com/app/id6757314378" target="_blank">
      📱 <?= esc_html($t['badge']) ?>
    </a>
  </div>

  <div class="legal">
    <a href="/agb">AGB</a> ·
    <a href="/impressum">Impressum</a> ·
    <a href="/datenschutz">Datenschutz</a>
  </div>
</div>

<!-- Sticky CTA-Bar — immer sichtbar, primärer Install-Trigger -->
<a class="sticky" href="https://apps.apple.com/app/id6757314378" target="_blank" rel="noopener">
  <div class="sticky-icon">
    <img src="/wp-content/uploads/2024/skipily-icon.png"
         onerror="this.parentNode.innerHTML='⛵'"
         alt="">
  </div>
  <div class="sticky-text">
    <div class="t"><?= esc_html($t['sticky_title']) ?></div>
    <div class="s"><?= esc_html($t['sticky_sub']) ?></div>
  </div>
  <span class="sticky-cta"><?= esc_html($t['sticky_cta']) ?></span>
</a>

<script>
(async function () {
  const T = <?= json_encode($t, JSON_UNESCAPED_UNICODE) ?>;
  const SUPABASE_URL = <?= json_encode($supabase_url) ?>;
  const ANON_KEY = <?= json_encode($supabase_anon) ?>;
  const status = document.getElementById('status');
  const list = document.getElementById('list');

  function setStatus(msg) { status.textContent = msg; }

  function distance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function fmtDistance(m) {
    if (m < 1000) return Math.round(m) + ' ' + T.meters;
    return (m / 1000).toFixed(1) + ' ' + T.km;
  }

  /**
   * Icon-Bestimmung aus Kategorie + Services + Provider-Name.
   * Reihenfolge: spezifische Treffer zuerst, generische zuletzt.
   */
  function iconFor(provider) {
    const tokens = [
      provider.category || '',
      ...(Array.isArray(provider.categories) ? provider.categories : []),
      ...(Array.isArray(provider.services) ? provider.services : []),
      provider.name || ''
    ].join(' ').toLowerCase();

    const has = (...words) => words.some(w => tokens.includes(w));

    if (has('tankstelle','fuel','bunker')) return '⛽';
    if (has('segelmacher','sailmaker','segelmacherei','segel ','sails')) return '🪡';
    if (has('rigg','rigging','rigger','mast','tauwerk')) return '🪢';
    if (has('motor','antrieb','engine','yanmar','volvo penta')) return '⚙️';
    if (has('elektronik','elektrik','electronics','navigation','antenne','nmea')) return '📡';
    if (has('lackier','painter','painting','farbe','antifouling')) return '🎨';
    if (has('marina','liegeplatz','hafen','harbor','port ')) return '⚓';
    if (has('charter','verleih','rental','vermietung')) return '🛥️';
    if (has('shop','ersatzteil','versorgung','supplies','zubehör','accessor')) return '🛒';
    if (has('werkstatt','werft','repair','reparatur','bootsbau','boatyard','autowerkstatt','service')) return '🔧';
    if (has('yacht','sail','sailing','marine','nautic')) return '⛵';
    return '⛵';
  }

  function ratingClass(rating) {
    if (rating == null || rating === 0) return 'r-blue';
    if (rating >= 4.0) return 'r-green';
    if (rating <= 2.0) return 'r-red';
    return 'r-yellow';
  }

  function ratingStars(rating) {
    if (rating == null || rating === 0) {
      return `<span class="none">${T.unrated}</span>`;
    }
    const full = Math.floor(rating);
    const half = (rating - full) >= 0.25 && (rating - full) < 0.75;
    let stars = '';
    for (let i = 0; i < full; i++) stars += '★';
    if (half) stars += '⯨';
    while (stars.replace(/⯨/g, '').length + (half ? 1 : 0) < 5) stars += '☆';
    return `<span class="stars">${stars}</span>
            <span class="num">${rating.toFixed(1)}</span>`;
  }

  function chipsFor(services) {
    if (!Array.isArray(services) || services.length === 0) return '';
    return `<div class="chips">` +
      services.slice(0, 3).map(s => `<span class="chip">${escapeHtml(s)}</span>`).join('') +
      `</div>`;
  }

  if (!navigator.geolocation) {
    setStatus(T.denied);
    return;
  }

  navigator.geolocation.getCurrentPosition(async pos => {
    setStatus(T.loading);
    const { latitude, longitude } = pos.coords;
    const dLat = 50 / 111;
    const dLon = 50 / (111 * Math.cos(latitude * Math.PI / 180));

    const params = new URLSearchParams();
    params.append('select', 'id,name,city,street,latitude,longitude,rating,category,categories,services,logo_url');
    params.append('latitude', 'gte.' + (latitude - dLat));
    params.append('latitude', 'lte.' + (latitude + dLat));
    params.append('longitude', 'gte.' + (longitude - dLon));
    params.append('longitude', 'lte.' + (longitude + dLon));
    params.append('limit', '50');

    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/service_providers?' + params, {
        headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const providers = await res.json();
      const withDist = providers
        .map(p => ({ ...p, _d: distance(latitude, longitude, p.latitude, p.longitude) }))
        .filter(p => p._d <= 50000)
        .sort((a, b) => a._d - b._d)
        .slice(0, 20);

      if (withDist.length === 0) {
        setStatus(T.none);
        return;
      }
      setStatus('');

      list.innerHTML = withDist.map(p => {
        const cat = (p.categories && p.categories[0]) || p.category || '';
        const mapsUrl = 'https://maps.apple.com/?daddr=' + p.latitude + ',' + p.longitude;
        const pinCls = ratingClass(p.rating);
        const address = [p.street, p.city].filter(Boolean).join(', ');
        return `
          <div class="provider">
            <div class="pin">${iconFor(p)}</div>
            <div class="info">
              <div class="name">${escapeHtml(p.name || '')}</div>
              ${address ? `<div class="meta">${escapeHtml(address)}</div>` : ''}
              <div class="rating ${pinCls}">${ratingStars(p.rating)}</div>
              ${cat ? `<div class="chips"><span class="chip cat">${escapeHtml(cat)}</span></div>` : ''}
              ${chipsFor(p.services)}
              <div class="row-foot">
                <span class="dist">📍 ${fmtDistance(p._d)}</span>
                <a class="route" href="${mapsUrl}" target="_blank" rel="noopener">${T.route}</a>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      setStatus(T.none);
      console.error(err);
    }
  }, () => setStatus(T.denied), { timeout: 8000, maximumAge: 60000 });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }
})();
</script>
</body>
</html>
<?php
    exit;
}, 0);
