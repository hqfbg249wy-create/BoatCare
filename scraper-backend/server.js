const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: production erlaubt ausschließlich die eigenen Admin-Origins,
// lokale Entwicklung weiter offen.
const ALLOWED_ORIGINS = [
    'https://admin.skipily.app',
    'https://boatcare-production.up.railway.app',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
    'http://localhost:3000'
];
app.use(cors({
    origin: (origin, cb) => {
        // Tools ohne Origin (curl, Health-Checks) erlauben
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS blocked: ${origin}`));
    }
}));
app.use(express.json());

// ============================================================
// KONFIGURATION
// ============================================================
const CONFIG = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY || 'AIzaSyDlH2R38FhvDJFdsQd-bk3pFt3CswgY5Yk',
    SUPABASE_URL: process.env.SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co',
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '', // Service Role Key für direkten DB-Zugriff
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjandseXFrZmtzenVtZHJmdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMDQ4NTksImV4cCI6MjA4NDY4MDg1OX0.VOlhRdvShU325xG18SSSTWdFfGEdyeX-7CAovE2vesQ'
};

// ============================================================
// BOATCARE APP-KATEGORIEN
// Entspricht genau den Keys in den Localizable.strings der App:
//   repair | motor_service | marine supplies | sailmaker
//   rigging | instruments | yard | surveyor | crane | painting | heating_climate
// (Marina wird NICHT gescraped - nur Servicebetriebe rund um Marinas)
// ============================================================

// Such-Keywords pro App-Kategorie, mehrsprachig
// Jede Kategorie hat spezifische Queries → gezielte, vollständige Suche
// Such-Keywords: präzise Begriffe die eindeutig auf Servicebetriebe hinweisen.
// BEWUSST KEINE generischen Begriffe wie "atelier nautique", "tienda náutica" etc.,
// die auch Tourismus- und Freizeitbetriebe liefern.
const CATEGORY_KEYWORDS = {
    repair: {
        en: ['boat repair workshop', 'yacht repair workshop', 'marine repair service', 'boat hull repair', 'GRP repair boat'],
        fr: ['atelier réparation bateau', 'réparation navale', 'chantier réparation bateaux', 'réparation coque bateau'],
        de: ['Bootsreparatur Werkstatt', 'Yachtreparatur', 'Bootswerft Reparatur', 'GFK Reparatur Boot'],
        es: ['taller reparación embarcaciones', 'reparación cascos barcos', 'taller náutico reparación'],
        it: ['officina riparazione barche', 'cantiere riparazione navale', 'riparazione scafi']
    },
    motor_service: {
        en: ['boat engine repair', 'outboard motor service', 'inboard engine repair', 'marine diesel repair', 'outboard engine workshop'],
        fr: ['réparation moteur hors-bord', 'service moteur marin', 'atelier moteur bateau', 'réparation moteur in-bord'],
        de: ['Außenbordmotor Reparatur', 'Innenborder Werkstatt', 'Bootsmotor Reparatur', 'Schiffsdiesel Service'],
        es: ['taller motores náuticos', 'reparación motor fuera borda', 'mecánico motores marinos'],
        it: ['officina motori marini', 'riparazione motore fuoribordo', 'meccanico nautico motori']
    },
    'marine supplies': {
        // "Ship Chandler" und "Accastillage" sind hier die magischen
        // Begriffe — sie sind so spezifisch, dass kein Baumarkt sie
        // im Namen oder Editorial fuehrt. Bewusst NICHT "Bootsbedarf
        // Laden" — das matcht oft Angelgeschaefte und Decathlon.
        en: ['ship chandler boat supplies', 'yacht chandlery shop',
             'marine chandlery store', 'boat parts dealer marine'],
        fr: ['shipchandler accastillage', 'magasin accastillage nautique',
             'shipchandler nautique', 'accastillage bateau'],
        de: ['Ship Chandler Yachtzubehör', 'Yachtausrüster Fachhandel',
             'Bootsbedarf Fachgeschäft Marine', 'Yachtbedarf Nautik'],
        es: ['shipchandler náutico tienda', 'accesorios náuticos marina',
             'tienda accastillage barcos'],
        it: ['shipchandler nautico negozio', 'accessori nautici barche',
             'forniture nautiche marina']
    },
    sailmaker: {
        en: ['sailmaker workshop', 'sail repair service', 'sails manufacturer', 'sail loft'],
        fr: ['voilerie atelier', 'réparation voiles atelier', 'fabrication voiles'],
        de: ['Segelmacher Werkstatt', 'Segelreparatur Atelier', 'Segel anfertigen'],
        es: ['velería taller', 'reparación velas taller', 'fabricación velas'],
        it: ['veleria atelier', 'riparazione vele laboratorio', 'produzione vele']
    },
    rigging: {
        en: ['rigging service', 'yacht rigging workshop', 'mast rigging specialist', 'standing rigging service'],
        fr: ['atelier gréement', 'service gréement bateau', 'gréeur professionnel'],
        de: ['Riggservice Werkstatt', 'Takelage Service', 'Mastbetrieb Rigging'],
        es: ['servicio aparejo náutico', 'taller jarcia barco', 'rigger profesional'],
        it: ['attrezzatura velica servizio', 'sartiame nautico officina', 'servizio alberatura']
    },
    instruments: {
        en: ['marine electronics dealer', 'nautical instruments service', 'chart plotter installation', 'boat electronics repair'],
        fr: ['électronique marine service', 'instruments nautiques installation', 'électronique bateau réparation'],
        de: ['Marine Elektronik Händler', 'Schiffselektronik Service', 'Nautische Instrumente Einbau'],
        es: ['electrónica marina servicio', 'instrumentos náuticos instalación', 'electrónica barco taller'],
        it: ['elettronica marina installazione', 'strumenti nautici servizio', 'elettronica barche riparazione']
    },
    yard: {
        en: ['boat yard service', 'yacht yard', 'boat builder yard', 'shipyard repair', 'boatyard maintenance'],
        fr: ['chantier naval réparation', 'chantier nautique entretien', 'constructeur naval'],
        de: ['Bootswerft Service', 'Schiffswerft Reparatur', 'Bootsbauer Werft'],
        es: ['astillero servicio', 'varadero reparación', 'astillero mantenimiento'],
        it: ['cantiere navale servizio', 'cantiere nautico riparazione', 'costruttore barche']
    },
    surveyor: {
        en: ['marine surveyor', 'yacht surveyor', 'boat survey specialist', 'boat condition survey'],
        fr: ['expert maritime bateau', 'expert nautique indépendant', 'expertise bateau achat'],
        de: ['Schiffsgutachter', 'Bootsgutachter', 'Marine Surveyor Gutachten'],
        es: ['perito naval marítimo', 'inspector náutico perito', 'tasador embarcaciones'],
        it: ['perito navale marittimo', 'ispettore nautico', 'perizia imbarcazioni']
    },
    crane: {
        // Bewusst sehr boots-spezifisch — generisches "crane service"
        // wuerde sonst Bau-/Auto-/Industriekraene mitziehen. Travel-Lift
        // ist ein Markenname fuer Boots-Portalkraene und ein sicherer
        // Treffer.
        en: ['travel lift boat yard', 'boat hoist marina', 'boat launching crane',
             'yacht crane marina', 'travelift boat'],
        fr: ['travel lift chantier nautique', 'grue mise à l\'eau bateau',
             'portique nautique', 'grue cale de halage'],
        de: ['Travelift Bootswerft', 'Bootskran Marina', 'Krananlage Yachthafen',
             'Bootslift Marina', 'Portalkran Bootswerft'],
        es: ['travel lift puerto deportivo', 'grúa botadura barcos',
             'pórtico náutico', 'varadero grúa'],
        it: ['travel lift porto turistico', 'gru varo barche cantiere',
             'alaggio barche', 'gru nautica marina']
    },
    heating_climate: {
        en: ['marine heating system', 'boat air conditioning', 'marine HVAC service', 'boat heater installation'],
        fr: ['chauffage bateau', 'climatisation bateau', 'chauffage marine', 'climatisation marine'],
        de: ['Bootsheizung', 'Klimaanlage Boot', 'Heizung Yacht', 'Klimatechnik Boot', 'Webasto Boot'],
        es: ['calefacción barco', 'aire acondicionado barco', 'climatización marina'],
        it: ['riscaldamento barca', 'climatizzazione barca', 'impianto climatizzazione nautico']
    },
    painting: {
        en: ['antifouling service', 'boat painting yard', 'osmosis treatment boat', 'hull painting service'],
        fr: ['antifouling application', 'peinture carène bateau', 'traitement osmose coque', 'carénage antifouling'],
        de: ['Antifouling Auftrag', 'Bootslackierung Werkstatt', 'Osmosebehandlung Boot', 'Unterwasserlack Service'],
        es: ['antifouling aplicación', 'pintura casco barco servicio', 'tratamiento osmosis barco'],
        it: ['antivegetativa applicazione', 'verniciatura carena', 'trattamento osmosi barche']
    }
};

// Alle Service-Kategorien (ohne Marina)
const SERVICE_CATEGORIES = Object.keys(CATEGORY_KEYWORDS);

/**
 * Mapping: Interne englische Kategorie → Deutsche Kategorie für die Datenbank.
 * Die englischen Keywords werden nur für die SUCHE/Zuordnung verwendet,
 * gespeichert wird immer der deutsche Begriff.
 */
const CATEGORY_TO_GERMAN = {
    'repair':          'Werkstatt',
    'motor_service':   'Motorservice',
    'marine supplies': 'Zubehör',
    'sailmaker':       'Segelmacher',
    'rigging':         'Rigg',
    'instruments':     'Instrumente',
    'yard':            'Bootsbauer',
    'surveyor':        'Gutachter',
    'crane':           'Kran',
    'painting':        'Lackiererei',
    'heating_climate': 'Heizung/Klima',
    'marina':          'Marina',
};

// Kategorien-Mapping: Google Places types → App-Kategorien
//
// WICHTIG: Hier NUR sehr eindeutig marine-spezifische Types eintragen.
// Generische Types wie 'hardware_store' (Bauhaus, OBI), 'general_contractor'
// (Bauunternehmer) oder 'sporting_goods_store' (Decathlon) wurden bewusst
// entfernt, weil Google die in der Naehe von Haefen gerne mit auswirft —
// das hat zu vielen Falsch-Positiven gefuehrt (Supermarkt, Baumarkt etc.).
//
// Bevor ein generischer Type wieder rein kommt: erst Name-Pruefung in
// placeToProvider() um sicherzustellen, dass es wirklich um Boote geht.
const CATEGORY_MAPPING = {
    // Werkstatt / Reparatur — nur Auto-Werkstaetten als Fallback,
    // weil die manchmal Boots-Motoren mitmachen. Name muss aber
    // weiterhin Boots-Bezug zeigen (siehe placeToProvider).
    'car_repair': 'repair',

    // Boots-Haendler — der eine wirklich eindeutige Type
    'boat_dealer': 'marine supplies',

    // Marinas (werden ohnehin gefiltert, kein Service)
    'marina': 'marina',
    'boat_rental': 'marina',
    'harbor': 'marina',

    // KEIN Default mehr — 'establishment' ist die generischste Google-
    // Kategorie ueberhaupt und matcht alles vom Briefkasten bis zum
    // Wahlbuero. Wenn primaryType nichts liefert, bleibt categoryHint
    // aus dem Such-Query (der ist explizit marine).
};

// Spracherkennung aus Ortsnamen/Länderbezeichnung
function detectLanguageForLocation(locationName) {
    const l = locationName.toLowerCase();
    if (/france|côte|bretagne|normandie|provence|languedoc|occitanie|méditerranée|mer du nord/.test(l)) return 'fr';
    if (/spain|españa|ibiza|mallorca|menorca|cataluña|andalucía|costa blanca|costa brava/.test(l)) return 'es';
    if (/italy|italia|sardegna|sicilia|toscana|liguria|adriatico|venezia/.test(l)) return 'it';
    if (/germany|deutschland|nordsee|ostsee|kiel|hamburg|rostock|flensburg/.test(l)) return 'de';
    if (/netherlands|nederland|holland|pays-bas/.test(l)) return 'nl';
    if (/croatia|hrvatska|dalmatia|split|dubrovnik|zadar/.test(l)) return 'hr';
    if (/greece|grèce|griechenland|aegean|ionian|corfu|rhodes/.test(l)) return 'el';
    return 'en';
}

/**
 * Gibt alle Such-Queries zurück: pro Kategorie in Landessprache + Englisch.
 * Marinas sind ausgeschlossen. Jede Query hat ein category-Tag damit
 * placeToProvider() die Kategorie direkt übernehmen kann.
 */
function getQueriesForLocation(locationName, forceLanguage = null) {
    const lang = forceLanguage || detectLanguageForLocation(locationName);
    const queries = [];

    for (const category of SERVICE_CATEGORIES) {
        const catKeywords = CATEGORY_KEYWORDS[category];
        // Landessprache (falls vorhanden), sonst Englisch
        const langKeys = catKeywords[lang] || catKeywords.en || [];
        const enKeys   = lang !== 'en' ? (catKeywords.en || []) : [];
        // Duplikate entfernen, dann als Query-Objekte
        const combined = [...new Set([...langKeys, ...enKeys])];
        for (const kw of combined) {
            queries.push({ query: kw, category });
        }
    }
    return queries;
}

// Fallback für /api/scrape ohne Kategorien (rückwärtskompatibel)
const MARINE_KEYWORDS = [
    'yacht service', 'boat repair', 'sailmaker', 'marine electronics',
    'shipchandler', 'rigging service', 'antifouling', 'boat yard', 'marine surveyor'
];

// ============================================================
// HELPER: HTTP Request (Promise-based)
// ============================================================
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`JSON parse error: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

function httpPost(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const data = JSON.stringify(body);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (url.startsWith('https') ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                ...headers
            }
        };

        const client = url.startsWith('https') ? https : http;
        const req = client.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(responseData) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: responseData });
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ============================================================
// GOOGLE PLACES API - Textsuche
// ============================================================
async function googlePlacesTextSearch(query, locationBias = null) {
    const url = `https://places.googleapis.com/v1/places:searchText`;

    const body = {
        textQuery: query,
        maxResultCount: 20,
        languageCode: 'de'
    };
    // HINWEIS: Falls 403-Fehler, muss "Places API (New)" in Google Cloud Console aktiviert werden:
    // https://console.cloud.google.com/apis/library/places.googleapis.com

    if (locationBias) {
        body.locationBias = {
            circle: {
                center: {
                    latitude: locationBias.lat,
                    longitude: locationBias.lng
                },
                radius: locationBias.radiusMeters || 30000
            }
        };
    }

    const headers = {
        'X-Goog-Api-Key': CONFIG.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.formattedAddress',
            'places.addressComponents',
            'places.location',
            'places.internationalPhoneNumber',
            'places.websiteUri',
            'places.photos',
            'places.types',
            'places.businessStatus',
            'places.regularOpeningHours',
            'places.primaryType',
            'places.editorialSummary',
            'places.reviews'
        ].join(',')
    };

    const result = await httpPost(url, body, headers);
    if (result.status === 403) {
        const msg = result.body?.error?.message || '';
        if (msg.includes('not been used') || msg.includes('disabled')) {
            throw new Error(
                'Places API (New) ist nicht aktiviert. Bitte aktiviere sie unter: ' +
                'https://console.cloud.google.com/apis/library/places.googleapis.com ' +
                '(Projekt-ID: ' + (msg.match(/project (\d+)/)?.[1] || 'unbekannt') + ')'
            );
        }
        throw new Error(`Places API Zugriff verweigert (403): ${JSON.stringify(result.body)}`);
    }
    if (result.status !== 200) {
        throw new Error(`Places API error ${result.status}: ${JSON.stringify(result.body)}`);
    }
    return result.body.places || [];
}

// ============================================================
// GOOGLE PLACES API - Details abrufen
// ============================================================
async function googlePlaceDetails(placeId) {
    const fields = [
        'id', 'displayName', 'formattedAddress', 'addressComponents',
        'location', 'internationalPhoneNumber', 'websiteUri',
        'rating', 'userRatingCount', 'types', 'regularOpeningHours',
        'editorialSummary', 'primaryType'
    ].join(',');

    const url = `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&languageCode=de&key=${CONFIG.GOOGLE_PLACES_API_KEY}`;
    return await httpGet(url);
}

// ============================================================
// GEOCODING - Ort zu Koordinaten
// Primär: Nominatim (OpenStreetMap, kostenlos, kein API-Key)
// Fallback: Google Geocoding API (benötigt aktivierte API)
// ============================================================
async function geocodeLocation(locationName) {
    // Primär: Nominatim (keine API-Aktivierung nötig)
    try {
        const encoded = encodeURIComponent(locationName);
        const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
        const data = await new Promise((resolve, reject) => {
            https.get(url, { headers: { 'User-Agent': 'BoatCare-Scraper/4.0' } }, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
            }).on('error', reject);
        });

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                formattedAddress: data[0].display_name
            };
        }
    } catch (e) {
        console.log(`   ⚠️  Nominatim Fehler: ${e.message}, versuche Google...`);
    }

    // Fallback: Google Geocoding (nur wenn aktiviert)
    try {
        const encoded = encodeURIComponent(locationName);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${CONFIG.GOOGLE_PLACES_API_KEY}`;
        const data = await httpGet(url);
        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const loc = data.results[0].geometry.location;
            return { lat: loc.lat, lng: loc.lng, formattedAddress: data.results[0].formatted_address };
        }
    } catch (e) {
        console.log(`   ⚠️  Google Geocoding Fehler: ${e.message}`);
    }

    return null;
}

// ============================================================
// KONVERTIERUNG: Google Place -> BoatCare ServiceProvider
// ============================================================
// ============================================================
// LEISTUNGEN & MARKEN AUS ECHTEN WEBSITE-DATEN ABLEITEN
// ============================================================

/**
 * Vollständige Schlüsselwort-Datenbank für Services (mehrsprachig).
 * Jeder Eintrag: { keywords: [...], label: 'Anzeigename' }
 * Das label wird als Service-Name in die DB geschrieben.
 */
const SERVICE_KEYWORDS_DB = [
    // ── Motor / Antrieb ─────────────────────────────────────────────────────
    { label: 'Motorrevision',        keywords: ['motorrevision', 'révision moteur', 'engine overhaul', 'revisione motore', 'revisión motor', 'révision de moteur'] },
    { label: 'Motorwartung',         keywords: ['motorwartung', 'entretien moteur', 'engine service', 'engine maintenance', 'manutenzione motore', 'mantenimiento motor', 'entretien de moteur'] },
    { label: 'Außenborder',          keywords: ['außenborder', 'außenbordmotor', 'outboard', 'hors-bord', 'fuoribordo', 'fueraborda', 'moteur hors bord'] },
    { label: 'Innenborder',          keywords: ['innenborder', 'innenbordmotor', 'inboard', 'in-bord', 'entrobordo', 'moteur in-bord', 'moteur inbord'] },
    { label: 'Diesel-Motoren',       keywords: ['diesel', 'dieselmotor', 'moteur diesel', 'diesel engine', 'motore diesel', 'motor diésel'] },
    { label: 'Motorenverkauf',       keywords: ['vente de moteurs', 'ventes de moteurs', 'vente moteur', 'engine sales', 'motorverkauf', 'vendita motori', 'venta de motores'] },
    { label: 'E-Antrieb',            keywords: ['elektroantrieb', 'e-motor', 'electric motor', 'moteur électrique', 'propulsion électrique', 'motore elettrico', 'electric drive', 'torqeedo', 'électrique'] },
    { label: 'Mechanik',             keywords: ['mécanique', 'meccanica', 'mecánica', 'mechanik', 'mécanique marine', 'mécanique bateau', 'mécanicien', 'mechanical'] },
    { label: 'Getriebe-Service',     keywords: ['getriebe', 'transmission', 'boîte de vitesse', 'gearbox', 'trasmissione'] },
    { label: 'Kühlsystem',           keywords: ['kühlsystem', 'kühlung', 'cooling system', 'système de refroidissement', 'raffreddamento', 'circuit de refroidissement'] },
    { label: 'Kraftstoffsystem',     keywords: ['kraftstoffsystem', 'einspritzung', 'injection', 'fuel system', 'système carburant', 'système d\'injection'] },
    { label: 'Steuerhydraulik',      keywords: ['steuerhydraulik', 'hydraulik', 'steering hydraulics', 'direction hydraulique', 'idraulica sterzo', 'barre hydraulique', 'hydraulique'] },
    { label: 'Mast setzen/nehmen',   keywords: ['matage', 'dématage', 'démâtage', 'mast stepping', 'mast raising', 'mast lowering', 'paso de mástil', 'impalatura', 'sbarco albero'] },

    // ── Reparatur / Werft ────────────────────────────────────────────────────
    { label: 'Rumpfreparatur',       keywords: ['rumpfreparatur', 'hull repair', 'réparation coque', 'riparazione carena', 'reparación casco', 'réparation de coque'] },
    { label: 'GFK-Reparatur',        keywords: ['gfk', 'fiberglas', 'fibreglass', 'polyester', 'fibre de verre', 'vetroresina', 'stratifié', 'composite'] },
    { label: 'Osmose-Behandlung',    keywords: ['osmose', 'osmosis', 'délaminage', 'trattamento osmosi', 'traitement osmose'] },
    { label: 'Gelcoat-Reparatur',    keywords: ['gelcoat', 'gel coat', 'gel-coat'] },
    { label: 'Montage / Installation', keywords: ['pose d\'équipement', 'installation équipement', 'equipment installation', 'montage', 'einbau', 'installation', 'installazione', 'instalación', 'pose équipement'] },
    { label: 'Anhänger / Remorque',  keywords: ['remorque', 'remorques', 'vente de remorques', 'trailer', 'bootstrailer', 'rimorchio', 'remolque', 'anhänger', 'bootsanhänger'] },
    { label: 'Winterlager',          keywords: ['winterlager', 'winterliegeplatz', 'wintering', 'hivernage', 'svernamento', 'invernada', 'stockage hivernage', 'maintenance hivernage'] },
    { label: 'Slipanlage',           keywords: ['slip', 'slipway', 'slipanlage', 'cale de halage', 'scalo', 'rampa', 'mise à sec', 'mise à l\'eau'] },
    { label: 'Kranen / Travel Lift', keywords: ['kranen', 'kran', 'crane', 'travelift', 'travel lift', 'travel-lift', 'grue', 'gru', 'grúa', 'portique', 'portique de manutention'] },
    { label: 'Bootstransport',       keywords: ['bootstransport', 'boat transport', 'transport bateau', 'trasporto barche', 'convoi exceptionnel'] },
    { label: 'Inox-Arbeiten',        keywords: ['inox', 'inoxydable', 'acier inoxydable', 'edelstahl', 'stainless steel', 'acero inoxidable', 'acciaio inox', 'cintrage', 'roulage tube', 'tube inox'] },
    { label: 'Sertissage / Câbles',  keywords: ['sertissage', 'sertisseuse', 'câble inox', 'câbles de gréement', 'wire rigging', 'edelstahlseile', 'cavi inox'] },

    // ── Segel ────────────────────────────────────────────────────────────────
    { label: 'Segel anfertigen',     keywords: ['segel anfertigen', 'segel herstellen', 'sailmaking', 'fabrication voiles', 'produzione vele', 'fabricación velas',
                                                 'confection voiles', 'création voiles', 'voiles sur mesure', 'voile sur mesure', 'fabrication de voile', 'voilier fabricant',
                                                 'voilerie', 'atelier de voilerie', 'atelier voilerie'] },
    { label: 'Segelreparatur',       keywords: ['segelreparatur', 'sail repair', 'réparation voiles', 'riparazione vele', 'reparación velas',
                                                 'réparation de voile', 'restauration voile', 'réparation voilure', 'nettoyage voile', 'réparation et nettoyage voile'] },
    { label: 'Großsegel',            keywords: ['großsegel', 'grand-voile', 'grand voile', 'mainsail', 'vela mayor', 'randa', 'randa mayor'] },
    { label: 'Genua / Fock',         keywords: ['genua', 'fock', 'génois', 'genois', 'headsail', 'jib', 'foque', 'fiocco', 'voile d\'avant', 'génois sur enrouleur', 'génois à mousquetons'] },
    { label: 'Spinnaker / Gennaker', keywords: ['spinnaker', 'spi', 'gennaker', 'gennaker', 'asymmetrisch', 'asymmetric', 'code 0', 'code zero', 'voile légère', 'voile de portant'] },
    { label: 'Trinquette / Solent',  keywords: ['trinquette', 'solent', 'storm jib', 'sturmfock', 'trinquet', 'vela de capa'] },
    { label: 'Persenning & Abdeckung', keywords: ['persenning', 'bâche', 'bache', 'housse', 'spray hood', 'copertura', 'funda', 'protection pour voile', 'protections pour voiles', 'chaussette de voile'] },
    { label: 'Bimini & Cockpitverdeck', keywords: ['bimini', 'bimini top', 'capote', 'cockpit-verdeck', 'cockpitverdeck', 'capote cockpit', 'capote de cockpit', 'bimini-capote', 'tent', 'taud'] },
    { label: 'Lazy Bag / Lazy Jack', keywords: ['lazy bag', 'lazy jack', 'chaussette', 'sac de grand-voile', 'fourreau de grande voile'] },
    { label: 'Segeltuche & Materialien', keywords: ['dacron', 'mylar', 'kevlar', 'dyneema', 'carbon', 'laminate', 'laminé', 'laminate sail', 'tissu voile', 'toile voile', 'contender', 'dimension polyant', 'challenge sails'] },
    { label: 'Sellerie / Polsterei', keywords: ['sellerie', 'sellier', 'polsterei', 'upholstery', 'tappezzeria', 'tapicería', 'coussin cockpit', 'matelas bateaux', 'garnissage', 'rembourrage'] },

    // ── Rigg & Takelage ──────────────────────────────────────────────────────
    { label: 'Rollreffanlage',       keywords: ['rollreffanlage', 'rollreffen', 'furling', 'enrouleur', 'emmagasineur', 'enrouleur de génois', 'enrouleur de foc',
                                                 'emmagasineur de spi', 'rollrofferente', 'rullino', 'furlex', 'profurl', 'facnor', 'karver'] },
    { label: 'Wanten & Stagen',      keywords: ['wanten', 'stagen', 'shrouds', 'stays', 'haubans', 'sartie', 'hauban', 'étai', 'gréement dormant', 'standing rigging'] },
    { label: 'Laufendes Gut',        keywords: ['laufendes gut', 'running rigging', 'gréement courant', 'manovre correnti', 'drisse', 'drissen', 'écoute', 'halyards', 'sheets'] },
    { label: 'Bäume & Masten',       keywords: ['bôme', 'bome', 'boom', 'mât', 'mast', 'sprit', 'bôme à ris', 'bôme standard', 'bout-dehors', 'bout dehors', 'bowsprit', 'tangon'] },
    { label: 'Blöcke & Beschläge',   keywords: ['poulie', 'poulies', 'block', 'blöcke', 'beschläge', 'winch', 'winsche', 'taquet', 'coinceur', 'clutch', 'renvoi de drisse'] },
    { label: 'Takelage komplett',     keywords: ['takelage', 'takelung', 'rigging', 'gréement', 'attrezzatura velica', 'aparejo', 'takelaż'] },

    // ── Elektronik / Navigation ───────────────────────────────────────────────
    { label: 'Navigationssysteme',   keywords: ['navigationssystem', 'système de navigation', 'sistema di navigazione', 'sistema de navegación', 'nav system'] },
    { label: 'Chartplotter',         keywords: ['chartplotter', 'chart plotter', 'plotter', 'traceur', 'tracciatore', 'gps plotter'] },
    { label: 'AIS',                  keywords: [' ais ', 'ais-', 'ais system', 'transponder ais', 'sistema ais', 'transpondeur ais'] },
    { label: 'Radar',                keywords: ['radar', 'radarsystem', 'marine radar'] },
    { label: 'VHF-Funk',             keywords: ['vhf', 'vhf radio', 'vhf-funk', 'vhf-gerät', 'radio vhf', 'poste vhf', 'dsc vhf'] },
    { label: 'Autopilot',            keywords: ['autopilot', 'pilote automatique', 'pilota automatico', 'piloto automático', 'pilote de barre', 'pilote automatique'] },
    { label: 'Bordnetz / Elektrik',  keywords: ['bordnetz', 'electrical', 'électricité bord', 'impianto elettrico', 'electricidad', 'câblage', 'elektrik', 'installation électrique'] },
    { label: 'Solarpanel',           keywords: ['solar', 'solarpanel', 'panneau solaire', 'pannello solare', 'panel solar', 'photovoltaïque'] },
    { label: 'Windgenerator',        keywords: ['windgenerator', 'wind generator', 'éolienne', 'generatore eolico', 'aérogénérateur'] },

    // ── Zubehör / Chandlery ───────────────────────────────────────────────────
    { label: 'Decksausrüstung',      keywords: ['decksausrüstung', 'deck equipment', 'équipement pont', 'attrezzatura coperta', 'accastillage'] },
    { label: 'Sicherheitsausrüstung',keywords: ['sicherheitsausrüstung', 'safety equipment', 'équipement sécurité', 'équipement de sécurité', 'safety gear'] },
    { label: 'Bekleidung',           keywords: ['bekleidung', 'vêtements', 'vêtement', 'vêtements nautiques', 'vêtement de navigation', 'vêtement de pont', 'abbigliamento nautico', 'ropa náutica', 'ciré', 'offshore clothing', 'clothing', 'vêtement marin'] },
    { label: 'Rettungsinsel',        keywords: ['rettungsinsel', 'life raft', 'radeau de survie', 'zattera di salvataggio', 'balsa salvavidas', 'radeau de sauvetage'] },
    { label: 'Anker & Kette',        keywords: ['anker', 'ankerkette', 'anchor', 'ancre', 'ancora', 'ancla', 'chaîne d\'ancre', 'mouillage'] },
    { label: 'Schiffszubehör',       keywords: ['schiffszubehör', 'bootszubehör', 'marine supplies', 'accastillage', 'accessori nautici', 'accesorios náuticos', 'chandlery', 'shipchandler', 'fournitures nautiques'] },

    // ── Antifouling / Lackierung ──────────────────────────────────────────────
    { label: 'Antifouling',          keywords: ['antifouling', 'antivegetativa', 'anti-fouling', 'peinture sous-marine', 'carénage antifouling'] },
    { label: 'Lackierung / Peinture',keywords: ['lackierung', 'lackierarbeiten', 'painting', 'peinture', 'verniciatura', 'pintura', 'vernis', 'peinture bateau', 'peinture de pont'] },
    { label: 'Rumpfpflege',          keywords: ['rumpfpflege', 'hull cleaning', 'nettoyage coque', 'pulizia carena', 'limpieza casco', 'nettoyage carène'] },
    { label: 'Polieren',             keywords: ['polieren', 'polish', 'polissage', 'lucidatura', 'pulido', 'polissage carène'] },

    // ── Gutachter / Surveyor ──────────────────────────────────────────────────
    { label: 'Gutachten',            keywords: ['gutachten', 'expertise', 'perizia', 'peritaje', 'rapport d\'expertise', 'expertise navale', 'survey report'] },
    { label: 'Kaufberatung',         keywords: ['kaufberatung', 'pre-purchase survey', 'inspection achat', 'ispezione acquisto', 'expertise avant achat'] },
    { label: 'Schadensbeurteilung',  keywords: ['schadensbeurteilung', 'damage survey', 'expertise sinistre', 'perizia danno', 'constat de dommages'] },
    { label: 'Versicherungsgutachten',keywords: ['versicherungsgutachten', 'insurance survey', 'expertise assurance', 'perizia assicurativa', 'expertise compagnie'] },

    // ── Heizung / Klimatechnik ─────────────────────────────────────────────────
    { label: 'Bootsheizung',        keywords: ['bootsheizung', 'heizung', 'boat heating', 'chauffage bateau', 'chauffage marine', 'riscaldamento barca', 'calefacción barco'] },
    { label: 'Klimaanlage',         keywords: ['klimaanlage', 'air conditioning', 'climatisation', 'climatizzazione', 'aire acondicionado', 'a/c marine', 'klima'] },
    { label: 'Wärmepumpe',          keywords: ['wärmepumpe', 'heat pump', 'pompe à chaleur', 'pompa di calore', 'bomba de calor'] },
    { label: 'Standheizung',        keywords: ['standheizung', 'parking heater', 'chauffage stationnaire', 'riscaldatore stazionario'] },
    { label: 'Lüftung / Ventilation', keywords: ['lüftung', 'ventilation', 'ventilazione', 'ventilación', 'belüftung', 'aération'] },

    // ── Diverses ──────────────────────────────────────────────────────────────
    { label: 'Unterwasserinspektion',keywords: ['unterwasserinspektion', 'underwater inspection', 'inspection sous-marine', 'ispezione subacquea', 'plongeur inspection'] },
    { label: 'Teakdeck',             keywords: ['teakdeck', 'teak deck', 'pont teck', 'ponte teak', 'teck', 'ponts en teck'] },
    { label: 'Holzarbeiten',         keywords: ['holzarbeiten', 'tischler', 'woodwork', 'menuiserie', 'falegnameria', 'carpintería', 'ébéniste', 'menuisier naval', 'charpentier naval'] },
    { label: 'Entmastung / Mastarbeiten', keywords: ['mastarbeiten', 'matage', 'dématage', 'démâtage', 'mast service', 'travaux de mât', 'lavori albero', 'mise en place mât'] },
];

/**
 * Schlüsselwörter zur Kategorie-Validierung: Welche Begriffe muss eine Website
 * eines echten Betriebs dieser Kategorie enthalten?
 */
const CATEGORY_VALIDATION_KEYWORDS = {
    repair: ['repair', 'reparatur', 'werkstatt', 'réparation', 'atelier', 'riparazione', 'officina', 'reparación', 'taller', 'service', 'wartung', 'maintenance', 'entretien', 'manutenzione'],
    motor_service: ['motor', 'engine', 'moteur', 'motore', 'outboard', 'inboard', 'außenborder', 'innenborder', 'hors-bord', 'fuoribordo', 'diesel', 'mechanical', 'meccanico', 'mécanicien'],
    'marine supplies': ['chandler', 'accastillage', 'accessori nautici', 'accesorios náuticos', 'supplies', 'zubehör', 'nautical', 'nautique', 'nautica', 'náutica', 'equipment', 'ausrüstung', 'shop', 'store', 'tienda', 'negozio', 'magasin'],
    sailmaker: ['sail', 'segel', 'voile', 'vela', 'sailmaker', 'segelmacher', 'voilier', 'veleria', 'velería', 'canvas', 'persenning'],
    rigging: ['rigging', 'takelage', 'gréement', 'attrezzatura velica', 'aparejo', 'mast', 'wante', 'shroud', 'stay', 'hauban', 'sartiame', 'rollreffen', 'furling', 'enrouleur'],
    instruments: ['electronic', 'elektronik', 'électronique', 'elettronica', 'electrónica', 'navigation', 'radar', 'plotter', 'chartplotter', 'autopilot', 'vhf', 'ais', 'garmin', 'raymarine', 'simrad', 'furuno'],
    yard: ['yard', 'werft', 'chantier', 'cantiere', 'astillero', 'shipyard', 'boatyard', 'bootsbauer', 'konstruktion', 'construction', 'neubau', 'building'],
    surveyor: ['survey', 'gutachter', 'gutachten', 'expertise', 'perito', 'inspector', 'inspection', 'certificat', 'zertifikat', 'class', 'classification'],
    crane: ['crane', 'kran', 'grue', 'gru', 'grúa', 'travelift', 'travel lift', 'hoist', 'lift', 'launching', 'slipway', 'slip'],
    heating_climate: ['heizung', 'heating', 'chauffage', 'riscaldamento', 'calefacción', 'klimaanlage', 'klimatechnik', 'air conditioning', 'climatisation', 'climatizzazione', 'hvac', 'webasto', 'eberspächer', 'truma', 'wärmepumpe', 'heat pump'],
    painting: ['antifouling', 'paint', 'lack', 'peinture', 'verniciatura', 'pintura', 'osmosis', 'osmose', 'gelcoat', 'hull', 'carénage', 'careening', 'varadero']
};

/**
 * Charter/Tourismus-Keywords für die Website-Analyse.
 * Wenn diese dominieren und Service-Keywords fehlen → Betrieb disqualifizieren.
 */
const WEBSITE_EXCLUSION_KEYWORDS = [
    // Charter / Vermietung
    'charter', 'boat rental', 'location de bateau', 'noleggio barche',
    'alquiler de barcos', 'bootsverleih', 'bootsmiete',
    'hire a boat', 'rent a boat', 'louez un bateau', 'noleggiate',
    // Ausflüge / Fahrten / Kreuzfahrten
    // HINWEIS: 'croisière' NICHT verwenden – bedeutet bei Seglern auch "Fahrtensegel"
    // Nur spezifische Tourismus-Kombinationen:
    'boat trip', 'boat tour', 'sortie en mer', 'promenade en mer',
    'gita in barca', 'paseo en barco', 'excursion en mer',
    'sea trip', 'sunset cruise', 'private cruise',
    'croisière en bateau', 'croisière côtière', 'location croisière',
    'day trip', 'half day trip', 'réservez votre croisière', 'réserver croisière',
    'crociera in barca', 'crucero en barco',
    // Tauchschulen
    'dive school', 'diving school', 'école de plongée', 'scuola sub',
    'escuela de buceo', 'tauchschule', 'scuba diving', 'padi',
    // Segelschulen
    'sailing school', 'école de voile', 'segelschule', 'sailing lessons',
    'cours de voile', 'sailing courses', 'lezioni di vela',
    // Wassersport-Freizeit
    'jet ski rental', 'jet ski hire', 'parasailing', 'flyboard',
    'water sports activities', 'activités nautiques de loisir',
    // Angelgeschäfte / Fischerei
    'fishing tackle', 'fishing rod', 'fishing reel', 'bait and tackle',
    'angelgeschäft', 'angelbedarf', 'angelladen', 'angelzubehör',
    'magasin de pêche', 'articles de pêche', 'matériel de pêche',
    'negozio pesca', 'articoli da pesca', 'tienda de pesca',
    'fishing supplies', 'fishing gear', 'fishing store',
    // Hotels / Restaurants / Unterkünfte
    'hotel', 'hôtel', 'albergo', 'hostel', 'pension', 'bed and breakfast', 'b&b',
    'restaurant', 'ristorante', 'trattoria', 'bistro', 'brasserie', 'pizzeria', 'gasthaus', 'gaststätte',
    'appartment', 'apartment', 'appartement', 'ferienwohnung', 'holiday rental',
    'vacation rental', 'gîte', 'gite', 'residence de vacances', 'résidence de vacances',
    'chambre d\'hôte', 'chambre d\'hotes',
    // Tankstellen / Fuel
    'fuel station', 'gas station', 'petrol station', 'tankstelle',
    'station-service', 'station essence',
    // Supermärkte
    'supermarket', 'supermarché', 'supermercato', 'supermarkt',
    // Haus-/Gartenpolsterei, Sonnenschutz (nicht Boot)
    'home upholstery', 'polstermöbel', 'gartenpolster', 'garden furniture',
    'sonnenschutz', 'markise', 'jalousie', 'awning', 'sunshade',
    // Superyacht
    'superyacht', 'super yacht', 'megayacht', 'mega yacht',
    // Berufsschifffahrt / kommerzielle Schifffahrt
    'berufsschifffahrt', 'binnenschifffahrt', 'commercial shipping',
    'cargo vessel', 'cargo ship', 'container ship', 'bulk carrier',
    'frachtschiff', 'handelsschifffahrt', 'inland waterway', 'inland shipping',
    'freight vessel', 'navigation commerciale', 'transport fluvial',
    'péniche', 'remorqueur', 'navigazione commerciale', 'chiatta',
    'navegación comercial', 'barcaza', 'binnenvaart', 'vrachtschip',
    'offshore platform', 'oil rig', 'dredging', 'baggerschiff',
];

/**
 * Service-Pflicht-Keywords für die Website-Validierung.
 * Bewusst breit und mehrsprachig – ein echter Servicebetrieb trifft mindestens 2.
 */
const WEBSITE_SERVICE_REQUIRED = [
    // Reparatur / Werkstatt
    'repair', 'reparatur', 'réparation', 'riparazione', 'reparación',
    'service', 'wartung', 'maintenance', 'entretien', 'manutenzione',
    'workshop', 'werkstatt', 'atelier', 'officina', 'taller',
    // Mechanik / Motor
    'mécanique', 'meccanica', 'mecánica', 'mechanik', 'mécanicien',
    'moteur', 'motore', 'engine',
    'révision moteur', 'engine overhaul', 'motorrevision',
    'hors-bord', 'in-bord', 'outboard',
    'vente de moteurs', 'ventes de moteurs',
    // Segelmacher — Fachbegriffe (FR/DE/EN/IT/ES)
    'voilerie', 'veleria', 'velería', 'sailmaker', 'segelmacher',
    'fabrication voiles', 'voiles sur mesure', 'voile sur mesure',
    'confection voiles', 'fabrication de voile',
    'grand-voile', 'grand voile', 'génois', 'genois',
    'spinnaker', 'gennaker', 'trinquette',
    'enrouleur', 'emmagasineur', 'bimini', 'capote',
    'lazy bag', 'persenning', 'sellerie',
    'gréement', 'takelage', 'rigging',
    'matage', 'dématage', 'sertissage', 'inox',
    // Chandlery / Zubehör
    'chandler', 'accastillage', 'fournitures nautiques',
    'shipchandler', 'ship chandler', 'équipement nautique',
    // Montage / Installation
    'pose d\'équipement', 'installation', 'montage', 'einbau',
    // Remorque / Anhänger
    'remorque', 'trailer', 'bootstrailer', 'anhänger',
    // Antifouling
    'antifouling', 'osmose', 'osmosis', 'gelcoat', 'carénage',
    // Werft
    'travelift', 'travel lift', 'slipway', 'mise à sec', 'hivernage', 'winterlager',
    'chantier naval', 'chantier nautique', 'cantiere navale',
    // Surveyor
    'surveyor', 'gutachter', 'expert maritime', 'expertise',
    // Elektronik
    'électronique', 'elektronik', 'electronics', 'elettronica',
    // Lackierung
    'lackierung', 'peinture', 'verniciatura',
    // Hydraulik
    'hydraulique', 'hydraulik', 'hydraulics',
];

/**
 * Helper: HTML-Entities dekodieren
 */
function decodeHtmlEntities(text) {
    return text
        .replace(/&agrave;/g, 'à').replace(/&acirc;/g, 'â').replace(/&auml;/g, 'ä')
        .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&ecirc;/g, 'ê')
        .replace(/&euml;/g, 'ë').replace(/&icirc;/g, 'î').replace(/&iuml;/g, 'ï')
        .replace(/&ocirc;/g, 'ô').replace(/&ouml;/g, 'ö').replace(/&ucirc;/g, 'û')
        .replace(/&uuml;/g, 'ü').replace(/&ntilde;/g, 'ñ').replace(/&ccedil;/g, 'ç')
        .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
}

/**
 * Helper: Extrahiert prominente Textbereiche aus HTML für gewichtete Analyse.
 * Gibt { title, metaDescription, metaKeywords, headings, altTexts, jsonLd, bodyText } zurück.
 */
function extractHtmlSections(html) {
    const decoded = decodeHtmlEntities(html);

    // Title
    const titleMatch = decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = (titleMatch ? titleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '').toLowerCase();

    // Meta description
    const metaDescMatch = decoded.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*?)["']/i)
                       || decoded.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']description["']/i);
    const metaDescription = (metaDescMatch ? metaDescMatch[1].trim() : '').toLowerCase();

    // Meta keywords
    const metaKwMatch = decoded.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*?)["']/i)
                     || decoded.match(/<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']keywords["']/i);
    const metaKeywords = (metaKwMatch ? metaKwMatch[1].trim() : '').toLowerCase();

    // OG description
    const ogDescMatch = decoded.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*?)["']/i);
    const ogDescription = (ogDescMatch ? ogDescMatch[1].trim() : '').toLowerCase();

    // Headings (h1-h3)
    const headingMatches = decoded.match(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi) || [];
    const headings = headingMatches.map(h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).join(' ').toLowerCase();

    // img alt texts (hilft bei Markenlogos)
    const altMatches = decoded.match(/alt=["']([^"']*?)["']/gi) || [];
    const altTexts = altMatches.map(a => {
        const m = a.match(/alt=["']([^"']*?)["']/i);
        return m ? m[1].trim() : '';
    }).join(' ').toLowerCase();

    // JSON-LD Structured Data
    const jsonLdMatches = decoded.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    let jsonLdText = '';
    for (const block of jsonLdMatches) {
        const content = block.replace(/<script[^>]*>|<\/script>/gi, '').trim();
        try {
            const data = JSON.parse(content);
            jsonLdText += ' ' + JSON.stringify(data);
        } catch { /* ignore malformed JSON-LD */ }
    }
    jsonLdText = jsonLdText.toLowerCase();

    // Body text (Scripts, Styles, Kommentare entfernt)
    const bodyText = decoded
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .toLowerCase();

    return {
        title,
        metaDescription: metaDescription + ' ' + ogDescription,
        metaKeywords,
        headings,
        altTexts,
        jsonLdText,
        bodyText
    };
}

/**
 * Helper: Prüft ob ein Keyword in einem Text vorkommt (kurze Wörter als ganzes Wort).
 */
function keywordInText(kw, text) {
    if (kw.length < 5) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|\\s|[^a-zà-ÿ])${escaped}($|\\s|[^a-zà-ÿ])`, 'i').test(text);
    }
    return text.includes(kw);
}

/**
 * Extrahiert die Logo-URL aus dem HTML einer Website.
 * Sucht in folgender Priorität:
 * 1. <link rel="icon"> / <link rel="apple-touch-icon"> (bevorzugt große Icons)
 * 2. og:image Meta-Tag
 * 3. JSON-LD logo/image
 * 4. <img> mit "logo" im src, alt, class oder id
 */
function extractLogoUrl(html, websiteUrl) {
    if (!html || !websiteUrl) return null;

    // Basis-URL für relative Pfade
    let baseUrl;
    try {
        baseUrl = new URL(websiteUrl);
    } catch { return null; }

    function resolveUrl(src) {
        if (!src || src.startsWith('data:')) return null;
        try {
            return new URL(src, baseUrl.origin).href;
        } catch { return null; }
    }

    // 1. Apple Touch Icon (meist hochauflösendes Logo)
    const appleTouchMatch = html.match(/<link[^>]*rel=["']apple-touch-icon[^"']*["'][^>]*href=["']([^"']+)["']/i)
                         || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']apple-touch-icon[^"']*["']/i);
    if (appleTouchMatch) {
        const url = resolveUrl(appleTouchMatch[1]);
        if (url) return url;
    }

    // 2. og:image (oft ein Logo oder repräsentatives Bild)
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
                      || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
        const url = resolveUrl(ogImageMatch[1]);
        if (url) return url;
    }

    // 3. JSON-LD "logo" Feld
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of jsonLdMatches) {
        const content = block.replace(/<script[^>]*>|<\/script>/gi, '').trim();
        try {
            const data = JSON.parse(content);
            const logoField = data.logo || data.image;
            if (logoField) {
                const logoSrc = typeof logoField === 'string' ? logoField : (logoField.url || logoField[0]);
                if (logoSrc) {
                    const url = resolveUrl(logoSrc);
                    if (url) return url;
                }
            }
        } catch { /* ignore */ }
    }

    // 4. <img> mit "logo" im Attribut (src, alt, class, id)
    const imgMatches = html.match(/<img[^>]+>/gi) || [];
    for (const imgTag of imgMatches) {
        const tagLower = imgTag.toLowerCase();
        // Prüfe ob "logo" in class, id, alt oder src vorkommt
        if (tagLower.includes('logo')) {
            const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
            if (srcMatch) {
                const url = resolveUrl(srcMatch[1]);
                // Nur vernünftige URLs (keine Tracking-Pixel, min. 10 Zeichen Pfad)
                if (url && !url.includes('1x1') && !url.includes('pixel') && !url.includes('tracking')) {
                    return url;
                }
            }
        }
    }

    // 5. Großes Favicon als letzter Fallback
    const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["'][^>]*sizes=["'](\d+)/i);
    if (iconMatch) {
        const size = parseInt(iconMatch[2]);
        if (size >= 64) {
            const url = resolveUrl(iconMatch[1]);
            if (url) return url;
        }
    }

    return null;
}

/**
 * Extrahiert echte Services und Brands aus dem HTML einer Website.
 * Verbesserte Version: Analysiert Meta-Tags, Headings, JSON-LD, Alt-Texte
 * und gewichtet Treffer in prominenten Bereichen höher.
 * Gibt { services, brands, logoUrl, categoryScore, categoryValid, disqualified, reason } zurück.
 */
function extractFromWebsiteHtml(html, category, websiteUrl) {
    const sections = extractHtmlSections(html);
    // Kombinierter Text für Basis-Suche (wie bisher)
    const cleanedHtml = sections.bodyText;
    // Prominenter Text = höherwertige Treffer (Title, Meta, Headings, JSON-LD)
    const prominentText = [sections.title, sections.metaDescription, sections.metaKeywords, sections.headings, sections.jsonLdText].join(' ');
    // Alt-Texte separat (für Markenlogos)
    const altTexts = sections.altTexts;

    // --- SCHRITT 1: Charter/Tourismus-Disqualifikation ---
    const exclusionHits = WEBSITE_EXCLUSION_KEYWORDS.filter(kw => cleanedHtml.includes(kw));
    const serviceHits   = WEBSITE_SERVICE_REQUIRED.filter(kw => cleanedHtml.includes(kw));
    // Prominent erwähnte Services zählen doppelt als Gegenbeweis
    const prominentServiceHits = WEBSITE_SERVICE_REQUIRED.filter(kw => prominentText.includes(kw));

    if (exclusionHits.length >= 2 && (serviceHits.length + prominentServiceHits.length) < 2) {
        return {
            services: null, brands: null, categoryScore: 0,
            categoryValid: false, disqualified: true,
            reason: `Website zeigt primär Charter/Tourismus (${exclusionHits.slice(0,3).join(', ')})`
        };
    }

    // --- SCHRITT 2: Kategorie-Validierung (prominente Treffer zählen doppelt) ---
    const validationKeywords = CATEGORY_VALIDATION_KEYWORDS[category] || [];
    const bodyHits = validationKeywords.filter(kw => cleanedHtml.includes(kw)).length;
    const prominentHits = validationKeywords.filter(kw => prominentText.includes(kw)).length;
    const categoryScore = bodyHits + prominentHits; // Prominente Treffer addieren sich

    const categoryValid = categoryScore >= 2;

    if (!categoryValid) {
        return {
            services: null, brands: null, categoryScore,
            categoryValid: false, disqualified: false,
            reason: `Kategorie '${category}' nicht bestätigt (nur ${categoryScore} von 2 nötigen Keywords)`
        };
    }

    // --- SCHRITT 3: Services extrahieren (verbessert: auch Meta, Headings, JSON-LD) ---
    const TOO_GENERIC = ['service', 'diesel', 'solar', 'radar', 'motor', 'anchor', 'spi', 'mast'];
    const foundServices = [];
    const allSearchTexts = [cleanedHtml, prominentText, sections.jsonLdText];

    for (const entry of SERVICE_KEYWORDS_DB) {
        const matched = entry.keywords.some(kw => {
            if (TOO_GENERIC.includes(kw)) return false;
            // Suche in allen Textbereichen
            return allSearchTexts.some(text => keywordInText(kw, text));
        });
        if (matched && !foundServices.includes(entry.label)) {
            foundServices.push(entry.label);
        }
    }

    // --- SCHRITT 4: Brands extrahieren (verbessert: + Alt-Texte, Kontext-Erkennung) ---
    const foundBrands = [];
    // Texte in denen Marken gesucht werden: Body + Alt-Texte + Meta + JSON-LD
    const brandSearchTexts = [cleanedHtml, altTexts, prominentText, sections.jsonLdText];
    // Kontext-Phrasen die auf Marken-Partnerschaft hinweisen
    const BRAND_CONTEXT_PATTERNS = [
        'authorized dealer', 'authorized distributor', 'official dealer',
        'distributeur agréé', 'revendeur agréé', 'concessionnaire',
        'vertragshändler', 'autorisierter händler', 'fachhändler',
        'distributore autorizzato', 'rivenditore autorizzato',
        'distribuidor autorizado', 'concesionario',
        'partner', 'partenaire', 'certified', 'certifié'
    ];
    const hasDealerContext = BRAND_CONTEXT_PATTERNS.some(p => cleanedHtml.includes(p) || prominentText.includes(p));

    for (const brand of ALL_BRANDS) {
        const brandLower = brand.toLowerCase();
        const escaped = brandLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Kurze Brands (< 4 Zeichen) nur als ganzes Wort matchen
        const pattern = brandLower.length < 4
            ? new RegExp(`(^|\\s|[^a-z])${escaped}($|\\s|[^a-z])`)
            : null;

        const found = brandSearchTexts.some(text => {
            return pattern ? pattern.test(text) : text.includes(brandLower);
        });

        if (found && !foundBrands.includes(brand)) {
            foundBrands.push(brand);
        }
    }

    // Bonus: Wenn Dealer/Partner-Kontext vorhanden und Marke nur in altText oder prominent →
    // trotzdem aufnehmen (z.B. Logo auf der Seite mit "Authorized Dealer" Text)
    if (hasDealerContext && foundBrands.length === 0) {
        // Nochmal lockerer suchen: auch Teilstrings > 5 Zeichen in Alt-Texten
        for (const brand of ALL_BRANDS) {
            const brandLower = brand.toLowerCase();
            if (brandLower.length >= 5 && altTexts.includes(brandLower) && !foundBrands.includes(brand)) {
                foundBrands.push(brand);
            }
        }
    }

    // --- SCHRITT 5: Logo-URL extrahieren ---
    const logoUrl = extractLogoUrl(html, websiteUrl);

    return {
        services: foundServices.length > 0 ? foundServices.slice(0, 15) : null,
        brands: foundBrands.length > 0 ? foundBrands : null,
        logoUrl,
        categoryScore,
        categoryValid: true,
        disqualified: false,
        reason: null
    };
}

/**
 * Vollständige Brand-Datenbank (wird auch von extractRealBrandsFromPlace genutzt).
 */
const ALL_BRANDS = [
    // Motorenhersteller
    'Volvo Penta', 'Yanmar', 'Mercury', 'Yamaha', 'Suzuki',
    'Honda', 'Tohatsu', 'Evinrude', 'Johnson',
    'Mercruiser', 'Cummins', 'Caterpillar', 'Nanni',
    'Beta Marine', 'Vetus', 'Lombardini', 'Torqeedo', 'Rolls-Royce Marine',
    'ZF Marine', 'Hurth', 'Technodrive', 'MAN Marine',
    // Segelausrüstung / Beschläge
    'Harken', 'Lewmar', 'Ronstan', 'Spinlock', 'Antal',
    'Wichard', 'Tylaska', 'Selden', 'Sparcraft', 'Z-Spar',
    // Rigg
    'Furlex', 'Profurl', 'Facnor', 'Karver', 'Navtec',
    'Dyneema', 'Spectra', 'Amsteel', 'Dyform', 'Liros',
    'Marlow', 'Samson', 'Yale Cordage',
    // Segel
    'North Sails', 'Elvstrøm Sails', 'Quantum Sails',
    'Doyle Sails', 'Ullman Sails', 'Hyde Sails',
    'UK Sailmakers', 'Pineapple Sails', 'Contender Sailcloth',
    // Navigation & Elektronik
    'Garmin', 'Raymarine', 'Simrad', 'B&G', 'Furuno',
    'Icom', 'Standard Horizon', 'Navionics', 'Vesper Marine',
    'Humminbird', 'Lowrance', 'Koden', 'JRC', 'Intellian',
    'Cobra', 'Uniden', 'Shakespeare', 'Glomex',
    // Rettungsausrüstung / Sicherheit
    'Plastimo', 'Zodiac', 'Survitec', 'Viking', 'Secumar',
    'Mullion', 'Crewsaver', 'McMurdo', 'Ocean Signal',
    // Bekleidung / Ausrüstung
    'Musto', 'Henri Lloyd', 'Helly Hansen', 'Gill', 'Zhik',
    'Magic Marine', 'Marinepool', 'Dubarry', 'Slam', 'Guy Cotten',
    // Pumpen / Lüfter / Sanitär
    'Jabsco', 'Rule', 'Whale', 'Munster Simms', 'Attwood',
    'Gusher', 'Henderson', 'Lavac', 'TMC', 'Raritan',
    // Kraftstoff
    'Shell', 'BP', 'Total', 'Esso', 'Q8', 'Aral',
    'TotalEnergies', 'Repsol', 'Agip',
    // Farben & Antifouling
    'Hempel', 'International Paint', 'Jotun', 'Epifanes',
    'Awlgrip', 'Toplac', 'Blakes', 'Veneziani', 'Pettit',
    'Boero', 'Seajet',
    // Heizung / Klima
    'Webasto', 'Eberspächer', 'Truma', 'Wallas', 'Dometic',
    'Cruisair', 'Marine Air', 'Climma', 'Indel Marine', 'Flagship Marine',
    // Kran / Werft
    'TravelLift', 'Marine Travelift', 'Hiab', 'Palfinger', 'Roodberg',
    // Klassifikationsgesellschaften (Surveyor)
    "Lloyd's Register", 'Bureau Veritas', 'DNV', 'RINA',
    'Germanischer Lloyd', 'DEKRA',
    // Ankerwinden / Hardware
    'Lofrans', 'Muir', 'Maxwell', 'Quick',
    'Rocna', 'Delta Anchor', 'CQR', 'Spade',
    // Bootsmarken (oft in Werft-Reviews genannt)
    'Beneteau', 'Jeanneau', 'Hanse', 'Bavaria', 'X-Yachts',
    'Dehler', 'Elan', 'Dufour', 'Hallberg-Rassy', 'Oyster',
    'Contest', 'Najad', 'Grand Soleil', 'Westerly', 'Catalina',
    'Hunter', 'Lagoon', 'Leopard', 'Fountaine Pajot', 'Privilege'
];

/**
 * Extrahiert angebotene Leistungen aus Google Places Daten (Name + Editorial + Reviews).
 * Wird als Fallback genutzt, wenn keine Website verfügbar ist.
 */
function extractServicesFromPlaceText(place, category) {
    const name = (place.displayName?.text || '').toLowerCase();
    const editorial = (place.editorialSummary?.text || '').toLowerCase();
    const reviewTexts = (place.reviews || [])
        .map(r => r.text?.text || r.originalText?.text || '')
        .join(' ').toLowerCase();

    const combinedText = `${name} ${editorial} ${reviewTexts}`;
    const services = new Set();

    // Zu generische Begriffe ignorieren (matchen in fast jedem Text)
    const TOO_GENERIC_PLACES = ['service', 'diesel', 'solar', 'radar', 'motor', 'anchor', 'spi', 'mast'];

    // Services aus Keyword-DB extrahieren
    for (const entry of SERVICE_KEYWORDS_DB) {
        const matched = entry.keywords.some(kw => {
            if (TOO_GENERIC_PLACES.includes(kw)) return false;
            if (kw.length < 5) {
                const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp(`(^|\\s|[^a-zà-ÿ])${escaped}($|\\s|[^a-zà-ÿ])`, 'i').test(combinedText);
            }
            return combinedText.includes(kw);
        });
        if (matched) services.add(entry.label);
    }

    const result = [...services];
    return result.length > 0 ? result.slice(0, 8) : null;
}

/**
 * Extrahiert Services+Brands sofort aus Google Places Textdaten (Name, Editorial, Reviews).
 * SCHNELL – kein Website-Fetch, kein Netzwerkaufruf.
 * Website-Anreicherung erfolgt später asynchron via enrichProviderFromWebsite().
 */
function extractServices(place, category) {
    // Fallback: Google Places Textdaten (Name, Editorial, Reviews)
    const services = extractServicesFromPlaceText(place, category);

    // Brands aus Places-Text extrahieren
    const reviewTexts = (place.reviews || [])
        .map(r => r.text?.text || r.originalText?.text || '')
        .join(' ');
    const combinedText = [
        place.displayName?.text || '',
        place.editorialSummary?.text || '',
        reviewTexts
    ].join(' ').toLowerCase();

    const brands = ALL_BRANDS.filter(b => {
        const bl = b.toLowerCase();
        // Kurze Brands (< 4 Zeichen) nur als ganzes Wort matchen
        if (bl.length < 4) {
            const escaped = bl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`(^|\\s|[^a-zà-ÿ])${escaped}($|\\s|[^a-zà-ÿ])`, 'i').test(combinedText);
        }
        return combinedText.includes(bl);
    });

    return {
        services: services,
        brands: brands.length > 0 ? brands : null,
        source: 'places_text'
    };
}

/**
 * Reichert einen bereits importierten Provider mit echten Website-Daten an.
 * Liest die Website, extrahiert Services+Brands+Kategorie-Score und patcht Supabase.
 * Wird NACH dem Import asynchron im Hintergrund aufgerufen.
 */
async function enrichProviderFromWebsite(provider, authKey) {
    if (!provider.website) return null;

    try {
        const html = await fetchWebpage(provider.website);
        const { services, brands, logoUrl, categoryScore, categoryValid, disqualified, reason } =
            extractFromWebsiteHtml(html, provider.category, provider.website);

        // Website zeigt primär Charter/Tourismus oder Kategorie nicht bestätigt
        // → Provider komplett aus DB entfernen (war ein Fehlimport)
        if (disqualified || !categoryValid) {
            console.log(`   ⚠️  ${provider.name}: ${reason}`);
            if (provider.id) {
                await supabaseDelete('service_providers', provider.id, authKey);
                console.log(`   🗑️  ${provider.name}: Aus DB entfernt (Website bestätigt nicht: ${reason})`);
            }
            return { status: 'disqualified', provider: provider.name, reason };
        }

        const patch = {};
        if (services && services.length > 0) patch.services = services;
        if (brands   && brands.length   > 0) patch.brands   = brands;
        if (logoUrl) patch.logo_url = logoUrl;  // Echtes Firmenlogo von Website

        // Website erreichbar aber KEINE konkreten Services gefunden
        // → Provider entfernen, da Leistungen nicht verifizierbar
        if (!patch.services) {
            console.log(`   ⚠️  ${provider.name}: Website liefert keine verifizierbaren Leistungen`);
            if (provider.id) {
                await supabaseDelete('service_providers', provider.id, authKey);
                console.log(`   🗑️  ${provider.name}: Aus DB entfernt (keine verifizierbaren Leistungen)`);
            }
            return { status: 'no_services', provider: provider.name, reason: 'Keine verifizierbaren Leistungen auf Website' };
        }

        if (provider.id) {
            await supabasePatch('service_providers', provider.id, patch, authKey);
        }

        return {
            status: 'enriched',
            provider: provider.name,
            services: patch.services || null,
            brands: patch.brands || null,
            logoUrl: patch.logo_url || null,
            categoryScore
        };
    } catch (err) {
        // Website nicht erreichbar → Provider entfernen (keine Verifizierung möglich)
        if (provider.id) {
            await supabaseDelete('service_providers', provider.id, authKey);
            console.log(`   🗑️  ${provider.name}: Aus DB entfernt (Website nicht erreichbar: ${err.message})`);
        }
        return { status: 'website_error', provider: provider.name, error: err.message };
    }
}

// ============================================================
// AUSSCHLUSS-FILTER: Betriebe die KEINE ServiceProvider sind
// ============================================================

/**
 * Schlüsselwörter die auf einen Tourismusbetrieb / kein Serviceunternehmen hinweisen.
 * Werden in Name, Editorial und Reviews geprüft.
 * Ein Treffer → Betrieb wird ausgeschlossen, AUSSER Service-Gegenbeweise vorhanden.
 */
const EXCLUSION_KEYWORDS = [
    // Charter / Vermietung
    'charter', 'chartering', 'affrètement', 'noleggio', 'alquiler de barcos',
    'boat rental', 'location de bateau', 'noleggio barche', 'alquiler embarcaciones',
    'hire', 'boat hire', 'location bateau', 'miete', 'bootsverleih',
    // Ausflüge / Fahrten
    'excursion', 'ausflug', 'bootsausflug', 'boat trip', 'boat tour',
    'sortie en mer', 'promenade en mer', 'gita in barca', 'paseo en barco',
    'sea trip', 'cruise', 'croisière', 'crociera', 'crucero',
    'day trip', 'journée en mer', 'giornata in barca',
    'dolphin', 'whale watching', 'sightseeing',
    // Tauchschulen / Tauchen
    'dive school', 'diving school', 'école de plongée', 'scuola sub', 'escuela de buceo',
    'tauchschule', 'tauchbasis', 'scuba', 'padi', 'ssi certification',
    // Segelschulen
    'sailing school', 'école de voile', 'scuola di vela', 'escuela de vela',
    'segelschule', 'segelkurs', 'sailing course', 'cours de voile',
    'segelunterricht', 'skipperausbildung',
    // Wassersport / Freizeit
    'jet ski', 'jetski', 'water ski', 'wakeboard', 'parasailing', 'flyboard',
    'kitesurf', 'windsurf', 'paddle board', 'sup rental',
    // Fischerei-Ausflüge & Angelgeschäfte
    'fishing trip', 'sortie pêche', 'escursione pesca', 'pesca deportiva',
    'sea fishing', 'pêche en mer', 'fishing tackle', 'fishing rod', 'fishing reel',
    'angelgeschäft', 'angelbedarf', 'angelladen', 'angelzubehör', 'angelshop',
    'magasin de pêche', 'articles de pêche', 'matériel de pêche',
    'negozio pesca', 'articoli da pesca', 'tienda de pesca',
    'bait shop', 'bait and tackle', 'appâts', 'canne à pêche',
    'fishing supplies', 'fishing gear', 'fishing store',
    // Hotels / Restaurants / Unterkünfte
    'hotel', 'hôtel', 'albergo', 'hostel', 'pension', 'bed and breakfast',
    'restaurant', 'ristorante', 'trattoria', 'bistro', 'brasserie', 'pizzeria', 'gasthaus', 'gaststätte',
    'appartment', 'apartment', 'appartement', 'ferienwohnung', 'holiday rental',
    'vacation rental', 'gîte', 'gite', 'résidence de vacances',
    'chambre d\'hôte', 'chambre d\'hotes',
    // Tankstellen / Fuel
    'fuel', 'fuel station', 'gas station', 'petrol station', 'tankstelle',
    'station-service', 'station essence', 'distributore carburante', 'gasolinera',
    // Supermärkte / Lebensmittel
    'supermarket', 'supermarché', 'supermercato', 'supermercado', 'supermarkt',
    'grocery', 'épicerie', 'alimentari', 'lebensmittel',
    // Polstereien / Möbel für Haus und Garten (nicht Boot)
    'home upholstery', 'polsterei', 'polstermöbel', 'gartenpolster', 'garden furniture',
    'mobilier de jardin', 'tapisserie d\'ameublement', 'tappezzeria',
    'outdoor furniture', 'patio furniture', 'gartenmöbel',
    // Sonnenschutz / Markisen (nicht Boot)
    'sonnenschutz', 'markise', 'jalousie', 'rollo', 'rollladen',
    'store banne', 'awning', 'sunshade', 'persiana', 'toldo',
    // Bootstouren / Transfers
    'boat tour', 'bootstour', 'boottocht', 'giro in barca',
    'boat transfer', 'taxi boat', 'water taxi', 'wassertaxi',
    // Superyacht-Service (Luxus-Segment)
    'superyacht', 'super yacht', 'megayacht', 'mega yacht',
    // Berufsschifffahrt / kommerzielle Schifffahrt
    'berufsschifffahrt', 'binnenschifffahrt', 'frachtschiff', 'frachter',
    'handelsschifffahrt', 'commercial shipping', 'cargo vessel', 'cargo ship',
    'container ship', 'bulk carrier', 'tanker vessel', 'barge', 'tug boat', 'tugboat',
    'schlepper', 'lastkahn', 'binnenschiff', 'frachtverkehr',
    'inland waterway', 'inland shipping', 'freight vessel', 'cargo transport',
    'navigation commerciale', 'transport fluvial', 'transport maritime',
    'péniche', 'barge fluviale', 'remorqueur',
    'navigazione commerciale', 'trasporto marittimo', 'chiatta', 'rimorchiatore',
    'navegación comercial', 'transporte marítimo', 'barcaza', 'remolcador',
    'binnenvaart', 'vrachtschip', 'sleepboot', 'binnenscheepvaart',
    'shipbuilding', 'schiffbau', 'construction navale industrielle',
    'offshore', 'oil rig', 'platform supply', 'dredging', 'baggerschiff',
    'pilot boat', 'lotsenboot', 'bateau pilote',
    // Werften fuer Marineindustrie / militaer / Stahlbau-Schiffe
    'shipyard industrial', 'werft industriell', 'marine industrielle',
    'cantieri industriali', 'schiffsbauindustrie', 'naval industrial',

    // Bau-/Industriekraene (NICHT Bootskraene!)
    'baukran', 'tower crane', 'mobile crane', 'autokran', 'lkw-kran',
    'kranverleih', 'kranservice bau', 'crane rental', 'construction crane',
    'grue de chantier', 'location de grue', 'gru edile', 'noleggio gru',
    'grúa de construcción', 'alquiler grúa',
    'turmkran', 'crawler crane', 'raupenkran', 'fahrzeugkran',
    'hochbau', 'tiefbau', 'erdbau', 'baufirma', 'bauunternehmen',
    'general construction', 'civil engineering', 'entreprise de construction',
    'impresa edile', 'empresa constructora',

    // Baumärkte / Hardware-Stores
    'baumarkt', 'hardware store', 'home improvement', 'diy store',
    'magasin de bricolage', 'brico', 'leroy merlin', 'bauhaus',
    'obi markt', 'hornbach', 'toom baumarkt', 'castorama',
    'bricomarché', 'bricoman', 'magasin de bricolage',
    'ferramenta', 'utensilería', 'ferretería', 'tienda bricolaje',

    // Garten / Landschaftsbau
    'gartencenter', 'garden center', 'jardinerie', 'gartenbau',
    'landscaping', 'landschaftsbau', 'paysagiste', 'giardinaggio',

    // Auto / KFZ (allgemein, ohne Marine-Bezug)
    'kfz werkstatt allgemein', 'autohaus', 'car dealership',
    'concessionnaire automobile', 'concessionario auto',
];

/**
 * Gegenbeweise: Diese Keywords zeigen, dass trotz Charter-Verdacht
 * echte Serviceleistungen angeboten werden.
 * Brauchen mindestens 2 Treffer, um Charter-Keywords zu überstimmen.
 */
const SERVICE_EVIDENCE_KEYWORDS = [
    'repair', 'reparatur', 'réparation', 'riparazione', 'reparación',
    'workshop', 'werkstatt', 'atelier', 'officina', 'taller',
    'service center', 'servicecenter', 'centre de service',
    'chandler', 'accastillage', 'ship chandler', 'marine supplies',
    'antifouling', 'osmose', 'osmosis', 'gelcoat',
    'motorrevision', 'engine overhaul', 'révision moteur',
    'segelmacher', 'sailmaker', 'voilerie',
    'rigging', 'takelage', 'gréement',
    'winterlager', 'hivernage', 'wintering',
    'travelift', 'travel lift', 'slipway', 'slipanlage',
    'surveyor', 'gutachter',
];

/**
 * Prüft ob ein Google Place ausgeschlossen werden soll.
 * Ersetzt die frühere isMarina()-Funktion und deckt jetzt auch
 * Charter, Bootsfahrten, Tauchschulen, Segelschulen ab.
 */
function isExcluded(place) {
    const types = place.types || [];
    const primaryType = place.primaryType || '';
    const name = (place.displayName?.text || '').toLowerCase();
    const editorial = (place.editorialSummary?.text || '').toLowerCase();
    const reviewText = (place.reviews || [])
        .map(r => r.text?.text || r.originalText?.text || '').join(' ').toLowerCase();
    const combinedText = `${name} ${editorial} ${reviewText}`;

    // 1. Google Places Typ-Check: alles ausschliessen was kein
    //    Bootsservice ist — selbst wenn der Name "marine" enthaelt.
    const excludedTypes = [
        // Marinas / Hafenbetriebe (sind keine Service-Anbieter)
        'marina', 'harbor', 'boat_rental', 'fishing_charter',
        // Tourismus / Freizeit
        'tourist_attraction', 'travel_agency', 'amusement_park',
        'fishing_store', 'scuba_diving',
        // Beherbergung / Gastronomie
        'hotel', 'motel', 'resort_hotel', 'lodging', 'campground',
        'restaurant', 'meal_delivery', 'meal_takeaway', 'bar', 'cafe',
        'apartment_building', 'apartment_complex',
        // Einzelhandel ohne Marine-Bezug
        'gas_station', 'fuel_station', 'supermarket', 'grocery_store',
        'convenience_store', 'shopping_mall', 'department_store',
        'furniture_store', 'home_goods_store', 'home_improvement_store',
        'hardware_store', 'sporting_goods_store',
        // Transport / Logistik (Berufsschifffahrt)
        'moving_company', 'trucking_company', 'freight_depot',
        'storage', 'self_storage',
        // Bauindustrie (NICHT Bootsbau)
        'construction_company', 'roofing_contractor', 'electrical_contractor',
        // Gesundheit / Bildung
        'hospital', 'doctor', 'dentist', 'pharmacy',
        'school', 'university', 'primary_school', 'secondary_school',
        // Finanzen / Aemter
        'bank', 'atm', 'insurance_agency', 'real_estate_agency',
        'local_government_office', 'post_office',
    ];
    if (excludedTypes.includes(primaryType)) return true;
    if (types.some(t => excludedTypes.includes(t))) return true;

    // 2. Name enthält klare Marina/Hafen-Bezeichnung ohne Service-Kontext
    if (/\b(marina|port de plaisance|yacht club|hafen)\b/.test(name) &&
        !/(service|repair|chandl|supply|electronic|rigg|sail|motor|antifouling|werft|chantier)/.test(name)) {
        return true;
    }

    // 2b. Name enthält Berufsschifffahrt / kommerzielle Schifffahrt
    if (/\b(spedition|logistik|logistics|freight|fracht|cargo|container|shipping company|reederei|scheepvaart|transport maritim|binnenschif)/i.test(name)) {
        console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (Berufsschifffahrt)`);
        return true;
    }

    // 2c. Bau-/Industriekraene ausschliessen, wenn kein Boots-Bezug im Namen
    //     (Kran-Suche ist die haeufigste Quelle fuer Falsch-Positive)
    if (/\b(kran|crane|grue|gru|grúa)\b/i.test(name) &&
        !/\b(boot|yacht|marine|nautic|naval|chantier|werft|cantiere|astillero|marina|travel.?lift|portique nautique|port[oa] turistico|cale de halage|hafen)\b/i.test(name)) {
        // Generisches "Kran"/"Crane" ohne Marine-Begriff → Bau-/Industriekran
        console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (vermutlich Bau-/Industriekran, kein Boots-Bezug im Namen)`);
        return true;
    }

    // 2d. Baumarkt-/Baufirma-Namen erkennen
    if (/\b(bauhaus|obi|hornbach|toom|leroy merlin|castorama|brico|home depot|baumarkt|hardware store)\b/i.test(name)) {
        console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (Baumarkt)`);
        return true;
    }
    if (/\b(bau ?gmbh|bauunternehmen|baufirma|construction company|entreprise de construction|impresa edile)\b/i.test(name) &&
        !/\b(boot|yacht|marine|chantier naval|cantiere nautico|werft)\b/i.test(name)) {
        console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (Bauunternehmen ohne Boots-Bezug)`);
        return true;
    }

    // 2e. Werft-Namen mit Industrie-Verdacht (Stahlbau, Schiffbau)
    if (/\b(werft|shipyard|chantier naval|cantiere navale|astillero)\b/i.test(name) &&
        /\b(industri|industrial|stahlbau|steel construction|naval construction industrielle|cantiere navale industriale)\b/i.test(name)) {
        console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (Industriewerft / Berufsschifffahrt)`);
        return true;
    }

    // 3. Ausschluss-Keywords im kombinierten Text prüfen
    const exclusionHits = EXCLUSION_KEYWORDS.filter(kw => combinedText.includes(kw));
    if (exclusionHits.length === 0) return false;  // Kein Ausschluss-Keyword → behalten

    // 4. Gegenbeweise prüfen: Hat der Betrieb trotzdem echte Serviceleistungen?
    const serviceHits = SERVICE_EVIDENCE_KEYWORDS.filter(kw => combinedText.includes(kw));

    // Ausschluss wenn: Mehr Ausschluss-Treffer als Service-Gegenbeweise
    // (braucht mindestens 2 Service-Gegenbeweise um Charter-Keywords zu überstimmen)
    if (serviceHits.length < 2) {
        console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (Charter/Tourismus: ${exclusionHits.slice(0,3).join(', ')})`);
        return true;
    }

    return false;  // Hat genug Service-Gegenbeweise → behalten
}

/**
 * Konvertiert einen Google Place zu einem BoatCare ServiceProvider.
 * Nutzt Google Places Textdaten für Services+Brands (schnell, kein Website-Fetch).
 * Website-Anreicherung erfolgt danach via enrichProviderFromWebsite().
 * @param {object} place - Google Place Objekt
 * @param {string|null} categoryHint - Kategorie-Hinweis aus dem Suchquery
 */
function placeToProvider(place, categoryHint = null) {
    // Adresskomponenten extrahieren
    let street = '';
    let streetNumber = '';
    let postalCode = '';
    let city = '';
    let country = '';

    if (place.addressComponents) {
        for (const comp of place.addressComponents) {
            const types = comp.types || [];
            if (types.includes('street_number')) streetNumber = comp.longText || '';
            if (types.includes('route')) street = comp.longText || '';
            if (types.includes('postal_code')) postalCode = comp.longText || '';
            if (types.includes('locality') || types.includes('postal_town')) city = city || comp.longText || '';
            if (types.includes('administrative_area_level_2') && !city) city = comp.longText || '';
            if (types.includes('country')) country = comp.longText || '';
        }
    }

    const fullStreet = streetNumber ? `${street} ${streetNumber}`.trim() : street;

    // Kategorie bestimmen: Query-Hint hat höchste Priorität
    const types = place.types || [];
    const primaryType = place.primaryType || '';
    const name = (place.displayName?.text || '').toLowerCase();

    let category = categoryHint || 'repair';

    // Name-basierte Verfeinerung (überschreibt Hint nur bei klaren Treffern)
    if (/\bsailmak|voilerie|segelmach|veleri[ae]\b/.test(name)) category = 'sailmaker';
    else if (/\b(elektr|electronic|instrument|chartplott|navioni)\b/.test(name)) category = 'instruments';
    else if (/\b(chandl|accastillage|shipchandler|ausrüst|accessori nautici)\b/.test(name)) category = 'marine supplies';
    else if (/\b(survey|gutachter|expert maritime|perito naval)\b/.test(name)) category = 'surveyor';
    else if (/\b(kran|crane|travel.?lift|travelift)\b/.test(name)) category = 'crane';
    else if (/\b(rigg|gréeur|rigger|takelage|sartiame)\b/.test(name)) category = 'rigging';
    else if (/\b(antifouling|carénage|lackier|peinture bateau|verniciatura)\b/.test(name)) category = 'painting';
    else if (/\b(werft|chantier naval|cantiere navale|astillero|shipyard|boat.?build)\b/.test(name)) category = 'yard';
    else if (!categoryHint) {
        // Nur ohne Hint: Type-basierter Fallback
        for (const t of [primaryType, ...types]) {
            if (CATEGORY_MAPPING[t]) {
                category = CATEGORY_MAPPING[t];
                break;
            }
        }
    }

    // Öffnungszeiten konvertieren
    let openingHours = null;
    if (place.regularOpeningHours?.weekdayDescriptions) {
        openingHours = place.regularOpeningHours.weekdayDescriptions.join('\n');
    }

    // Leistungen und Marken aus Google Places Textdaten (schnell, kein Website-Fetch)
    // Website-Anreicherung erfolgt nach dem Import im Hintergrund
    const { services, brands, source } = extractServices(place, category);

    // Cover-Bild (Geschäfts-/Gebäudefoto) aus Google Places Photos API
    // ACHTUNG: Das ist KEIN Firmenlogo, sondern ein Foto des Betriebs!
    // Echte Logos werden per Website-Enrichment extrahiert.
    let cover_image_url = null;
    if (place.photos && place.photos.length > 0) {
        const photoName = place.photos[0].name;
        cover_image_url = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${CONFIG.GOOGLE_PLACES_API_KEY}`;
    }

    // Kategorie auf Deutsch übersetzen für die Datenbank
    const germanCategory = CATEGORY_TO_GERMAN[category] || 'Sonstige';

    return {
        name: place.displayName?.text || 'Unbekannt',
        category: germanCategory,
        street: fullStreet || null,
        postal_code: postalCode || null,
        city: city || null,
        country: country || null,
        latitude: place.location?.latitude || 0,
        longitude: place.location?.longitude || 0,
        phone: place.internationalPhoneNumber || null,
        email: null,
        website: place.websiteUri || null,
        description: place.editorialSummary?.text || null,
        logo_url: null,              // Echtes Logo – wird per Website-Enrichment befüllt
        cover_image_url: cover_image_url,  // Geschäftsfoto von Google Places
        opening_hours: openingHours,
        services: services,
        brands: brands,
        // Metadaten für Import-Review (werden vor DB-Insert entfernt)
        _google_place_id: place.id,
        _google_types: types.join(', '),
        _source: 'google_places',
        _data_source: source   // 'places_text' — Website-Anreicherung folgt nach Import
    };
}

// ============================================================
// SUPABASE INSERT
// ============================================================
async function insertToSupabase(providers, authKey) {
    const key = authKey || CONFIG.SUPABASE_SERVICE_KEY || CONFIG.SUPABASE_ANON_KEY;
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers`;

    // Entferne alle internen _Felder (werden nicht in DB gespeichert)
    const cleanProviders = providers.map(p => {
        const clean = { ...p };
        Object.keys(clean).filter(k => k.startsWith('_')).forEach(k => delete clean[k]);
        return clean;
    });

    const result = await httpPost(url, cleanProviders, {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation,resolution=ignore-duplicates'
    });

    return result;
}

// ============================================================
// FUZZY-DUPLIKATERKENNUNG
// ============================================================

/** Normalisiert Firmennamen für Vergleich */
function normalizeProviderName(name) {
    return (name || '')
        .toLowerCase()
        .replace(/[^a-z0-9àáâãäåèéêëìíîïòóôõöùúûüñçß\s]/g, '')
        .replace(/\b(gmbh|sarl|sas|srl|ltd|inc|ag|ek|ohg|kg|co|ug|se|sa|spa|bv|nv|plc)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Fuzzy-Match: erkennt "Yacht Service X" ≈ "X Yachtservice" */
function fuzzyNameMatch(name1, name2) {
    const n1 = normalizeProviderName(name1);
    const n2 = normalizeProviderName(name2);
    if (!n1 || !n2) return false;

    // Exakter Match nach Normalisierung
    if (n1 === n2) return true;

    // Einer enthält den anderen
    if (n1.length > 3 && n2.length > 3 && (n1.includes(n2) || n2.includes(n1))) return true;

    // Wort-Überlappung: mind. 2 signifikante Wörter identisch
    const words1 = new Set(n1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(n2.split(' ').filter(w => w.length > 2));
    const overlap = [...words1].filter(w => words2.has(w));
    if (overlap.length >= 2) return true;

    // Levenshtein für kurze Namen (< 25 Zeichen)
    if (n1.length < 25 && n2.length < 25) {
        const maxLen = Math.max(n1.length, n2.length);
        if (maxLen > 0 && levenshteinDistance(n1, n2) / maxLen < 0.25) return true;
    }

    return false;
}

/** Teilweiser Match: mindestens 1 signifikantes Wort */
function partialNameMatch(name1, name2) {
    const w1 = normalizeProviderName(name1).split(' ').filter(w => w.length > 3);
    const w2 = normalizeProviderName(name2).split(' ').filter(w => w.length > 3);
    return w1.some(w => w2.includes(w));
}

/** Levenshtein-Distanz */
function levenshteinDistance(a, b) {
    const m = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
            m[i][j] = a[i - 1] === b[j - 1]
                ? m[i - 1][j - 1]
                : Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + 1);
    return m[a.length][b.length];
}

/** Haversine-Distanz in Metern */
function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Duplikat-Prüfung mit Fuzzy-Name-Matching + Geo-Distanz.
 * Lädt bestehende Provider der betroffenen Städte in einem Batch.
 */
async function checkDuplicates(providers, authKey) {
    const key = authKey || CONFIG.SUPABASE_ANON_KEY;
    const duplicates = [];
    const unique = [];

    // Batch: alle relevanten Städte auf einmal abfragen
    const cities = [...new Set(providers.map(p => p.city).filter(Boolean))];
    let existingProviders = [];

    for (const city of cities) {
        const encoded = encodeURIComponent(city);
        try {
            const result = await supabaseGet(
                `service_providers?city=eq.${encoded}&select=id,name,city,latitude,longitude`,
                key
            );
            if (Array.isArray(result)) existingProviders.push(...result);
        } catch (e) { /* weiter */ }
    }

    console.log(`   🔍 Fuzzy-Duplikatcheck: ${providers.length} neue vs. ${existingProviders.length} bestehende Provider`);

    for (const p of providers) {
        const isDupe = existingProviders.some(existing => {
            // 1. Fuzzy Name Match (gleiche Stadt implizit durch Query)
            if (fuzzyNameMatch(p.name, existing.name)) return true;
            // 2. Partieller Name + innerhalb 200m
            if (existing.latitude && p.latitude &&
                partialNameMatch(p.name, existing.name) &&
                haversineMeters(p.latitude, p.longitude, existing.latitude, existing.longitude) < 200) {
                return true;
            }
            return false;
        });

        if (isDupe) {
            duplicates.push({ ...p, _isDuplicate: true });
        } else {
            unique.push(p);
            // Neuen Provider auch zur Referenz hinzufügen (gegen sich selbst de-dupen)
            existingProviders.push({ name: p.name, city: p.city, latitude: p.latitude, longitude: p.longitude });
        }
    }

    return { unique, duplicates };
}

// ============================================================
// HAUPT-PIPELINE: Ort scrapen — alle Servicekategorien
// ============================================================
/**
 * Extrahiert Logos von Websites fuer eine Liste von Providern (parallel, max 5 gleichzeitig).
 * Modifiziert die Provider in-place: setzt logo_url wenn gefunden.
 */
async function extractLogosForProviders(providers) {
    const CONCURRENCY = 5;
    let idx = 0;

    async function worker() {
        while (idx < providers.length) {
            const i = idx++;
            const p = providers[i];
            if (!p.website) continue;
            try {
                const html = await fetchWebpage(p.website);
                const logoUrl = extractLogoUrl(html, p.website);
                if (logoUrl) {
                    p.logo_url = logoUrl;
                    console.log(`   🖼️  [${i + 1}/${providers.length}] ${p.name}: Logo gefunden`);
                }
            } catch (e) {
                // Website nicht erreichbar → kein Logo, kein Problem
            }
        }
    }

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, providers.length); w++) {
        workers.push(worker());
    }
    await Promise.all(workers);
}

async function scrapeLocation(locationName, options = {}) {
    const {
        radiusKm = 20,
        language = null,    // null = auto-detect aus Ortsnamen
        categories = null,  // null = alle SERVICE_CATEGORIES
        customKeywords = [],    // Zusätzliche Suchbegriffe vom User
        customExclusions = []   // Zusätzliche Ausschlussbegriffe vom User
    } = options;

    const detectedLang = language || detectLanguageForLocation(locationName);

    // Zusätzliche Ausschlussbegriffe (vom User über UI) zusammenführen
    const activeExclusionKeywords = [...EXCLUSION_KEYWORDS, ...customExclusions.map(e => e.toLowerCase().trim()).filter(Boolean)];
    const activeWebsiteExclusions = [...WEBSITE_EXCLUSION_KEYWORDS, ...customExclusions.map(e => e.toLowerCase().trim()).filter(Boolean)];

    // Kategorie-spezifische Queries generieren (ohne Marina)
    const allQueries = options.queries || getQueriesForLocation(locationName, detectedLang);

    // Zusätzliche benutzerdefinierte Suchbegriffe anhängen (Kategorie 'repair' als Default)
    for (const kw of customKeywords) {
        const trimmed = kw.trim();
        if (trimmed) allQueries.push({ query: trimmed, category: 'repair' });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🌍 Starte Scraping für: "${locationName}" [Sprache: ${detectedLang}]`);
    console.log(`🔑 ${allQueries.length} Queries für ${SERVICE_CATEGORIES.length} Kategorien`);
    if (customKeywords.length > 0) console.log(`   ➕ ${customKeywords.length} zusätzliche Suchbegriffe`);
    if (customExclusions.length > 0) console.log(`   🚫 ${customExclusions.length} zusätzliche Ausschlüsse`);
    console.log(`🚫 Marinas/Charter/Angel/Tourismus werden ausgeschlossen`);
    console.log(`${'='.repeat(60)}`);

    // 1. Geocode
    console.log(`\n📍 Geocoding "${locationName}"...`);
    const coords = await geocodeLocation(locationName);
    if (!coords) {
        throw new Error(`Ort "${locationName}" konnte nicht gefunden werden`);
    }
    console.log(`   ✅ ${coords.formattedAddress}: ${coords.lat}, ${coords.lng}`);

    const locationBias = {
        lat: coords.lat,
        lng: coords.lng,
        radiusMeters: radiusKm * 1000
    };

    // 2. Suche mit kategorie-spezifischen Queries
    // Speichert: placeId → { place, category } (erster Treffer gewinnt)
    const allPlaces = new Map();
    let totalSearches = 0;
    let skippedMarinas = 0;

    // Lokale isExcluded-Variante mit zusammengeführten Ausschlüssen
    function isExcludedLocal(place) {
        const types = place.types || [];
        const primaryType = place.primaryType || '';
        const name = (place.displayName?.text || '').toLowerCase();
        const editorial = (place.editorialSummary?.text || '').toLowerCase();
        const reviewText = (place.reviews || [])
            .map(r => r.text?.text || r.originalText?.text || '').join(' ').toLowerCase();
        const combinedText = `${name} ${editorial} ${reviewText}`;

        const excludedTypes = ['marina', 'harbor', 'boat_rental', 'tourist_attraction',
                               'travel_agency', 'amusement_park', 'fishing_store',
                               'fishing_charter', 'scuba_diving'];
        if (excludedTypes.includes(primaryType)) return true;
        if (types.some(t => excludedTypes.includes(t))) return true;

        if (/\b(marina|port de plaisance|yacht club|hafen)\b/.test(name) &&
            !/(service|repair|chandl|supply|electronic|rigg|sail|motor|antifouling|werft|chantier)/.test(name)) {
            return true;
        }

        const exclusionHits = activeExclusionKeywords.filter(kw => combinedText.includes(kw));
        if (exclusionHits.length === 0) return false;

        const serviceHits = SERVICE_EVIDENCE_KEYWORDS.filter(kw => combinedText.includes(kw));
        if (serviceHits.length < 2) {
            console.log(`   🚫 Ausgeschlossen: "${place.displayName?.text}" (${exclusionHits.slice(0,3).join(', ')})`);
            return true;
        }
        return false;
    }

    for (const { query, category } of allQueries) {
        const fullQuery = `${query} near ${locationName}`;
        console.log(`\n🔍 [${category}] "${query}"`);

        try {
            const places = await googlePlacesTextSearch(fullQuery, locationBias);
            let newCount = 0;

            for (const place of places) {
                // Marinas, Charter, Bootsfahrten, Tauchschulen, Angelgeschäfte ausschließen
                if (isExcludedLocal(place)) {
                    skippedMarinas++;
                    continue;
                }
                if (!allPlaces.has(place.id)) {
                    allPlaces.set(place.id, { place, category });
                    newCount++;
                }
            }

            console.log(`   ✅ ${places.length} Ergebnisse (${newCount} neu, ${places.length - newCount} gefiltert/doppelt)`);
            totalSearches++;

            // Pause zwischen API-Anfragen (Rate Limiting)
            await new Promise(r => setTimeout(r, 200));

        } catch (err) {
            console.log(`   ⚠️  Fehler: ${err.message}`);
        }
    }

    console.log(`\n📊 Gesamt: ${allPlaces.size} Servicebetriebe aus ${totalSearches} Suchen`);
    console.log(`   🚫 ${skippedMarinas} Marinas/Charter/Angel/Tourismus übersprungen`);

    // 3. Konvertiere zu BoatCare Format — mit Kategorie-Hint (synchron, schnell)
    const providers = Array.from(allPlaces.values())
        .map(({ place, category }) => placeToProvider(place, category));

    // Filtere Einträge ohne Koordinaten und ohne Website (doppelte Sicherheit)
    // Provider ohne Website können nicht verifiziert werden → ausschließen
    const withoutWebsite = providers.filter(p => !p.website);
    const validProviders = providers.filter(p =>
        p.latitude !== 0 && p.longitude !== 0 && p.category !== 'marina' && p.website
    );
    if (withoutWebsite.length > 0) {
        console.log(`   🚫 ${withoutWebsite.length} ohne Website übersprungen (keine Verifizierung möglich)`);
    }
    console.log(`   ✅ ${validProviders.length} valide Servicebetriebe (mit Website)`);

    // 4. Logos von Websites extrahieren (parallel, max 5 gleichzeitig)
    console.log(`\n🖼️  Logo-Extraktion: ${validProviders.length} Websites...`);
    await extractLogosForProviders(validProviders);
    const withLogo = validProviders.filter(p => p.logo_url).length;
    console.log(`   ✅ ${withLogo} Logos gefunden, ${validProviders.length - withLogo} ohne Logo`);

    return {
        location: coords.formattedAddress,
        coordinates: { lat: coords.lat, lng: coords.lng },
        providers: validProviders,
        stats: {
            total: validProviders.length,
            searches: totalSearches,
            skippedMarinas,
            categories: validProviders.reduce((acc, p) => {
                acc[p.category] = (acc[p.category] || 0) + 1;
                return acc;
            }, {})
        }
    };
}

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * Reichert importierte Provider im Hintergrund mit echten Website-Daten an.
 * Läuft NACH der HTTP-Antwort an den Client (via setImmediate).
 * Patcht services + brands direkt in Supabase.
 */
async function runWebsiteEnrichment(providers, authKey) {
    const withWebsite = providers.filter(p => p.website);
    if (withWebsite.length === 0) return;

    console.log(`\n🌐 Hintergrund: Website-Verifizierung & Anreicherung für ${withWebsite.length} Betriebe...`);
    console.log(`   → Provider ohne verifizierbare Leistungen werden entfernt`);
    let enriched = 0, removed = 0, errors = 0;

    for (let i = 0; i < withWebsite.length; i++) {
        const prov = withWebsite[i];
        // Rate-Limiting: 500ms zwischen Website-Fetches
        if (i > 0) await new Promise(r => setTimeout(r, 500));

        try {
            const result = await enrichProviderFromWebsite(prov, authKey);
            if (!result) { removed++; continue; }
            if (result.status === 'enriched') {
                enriched++;
                console.log(`   ✅ ${prov.name}: ${result.services?.length || 0} Services, ${result.brands?.length || 0} Brands${result.logoUrl ? ', 🖼️ Logo gefunden' : ''}`);
            } else if (result.status === 'disqualified' || result.status === 'no_services' || result.status === 'website_error') {
                removed++;
            } else {
                removed++;
            }
        } catch (e) {
            errors++;
            console.log(`   ❌ ${prov.name}: ${e.message}`);
        }
    }
    console.log(`\n✅ Website-Verifizierung abgeschlossen: ${enriched} bestätigt, ${removed} entfernt, ${errors} Fehler`);
}

/**
 * POST /api/scrape
 * Scraped maritime Betriebe für einen Ort/Region
 * Body: {
 *   location: "Cap d'Agde, France",
 *   radiusKm: 20,
 *   autoImport: true,    // direkt in Supabase importieren
 *   authKey: "..."       // optional: Supabase Service Role Key
 * }
 */
app.post('/api/scrape', async (req, res) => {
    const {
        location,
        radiusKm = 20,
        autoImport = false,
        authKey,
        keywords,
        customKeywords = [],
        customExclusions = []
    } = req.body;

    if (!location) {
        return res.status(400).json({ error: 'location parameter required' });
    }

    try {
        // Scrape
        const result = await scrapeLocation(location, {
            radiusKm,
            keywords: keywords || MARINE_KEYWORDS,
            customKeywords,
            customExclusions
        });

        let importResult = null;

        // Duplikat-Check immer durchführen (für Preview-Flags)
        console.log(`\n🔍 Prüfe Duplikate...`);
        const { unique, duplicates } = await checkDuplicates(result.providers, authKey);
        console.log(`   📋 ${unique.length} neue, ${duplicates.length} bereits vorhanden`);

        // Alle Provider mit Duplikat-Flag zurückgeben (Duplikate markiert)
        const allProvidersWithFlags = [...unique.map(p => ({ ...p, _isDuplicate: false })), ...duplicates];

        if (autoImport && unique.length > 0) {
            console.log(`\n💾 Importiere ${unique.length} Betriebe in Supabase...`);
            const supabaseResult = await insertToSupabase(unique, authKey);
            console.log(`   ✅ Import-Status: ${supabaseResult.status}`);

            // Importierte Provider mit IDs aus Supabase-Antwort
            const importedProviders = Array.isArray(supabaseResult.body) ? supabaseResult.body : [];

            importResult = {
                imported: importedProviders.length || unique.length,
                skipped: duplicates.length,
                status: supabaseResult.status,
                error: supabaseResult.status >= 400 ? JSON.stringify(supabaseResult.body) : null,
                enriching: importedProviders.filter(p => p.website).length > 0
                    ? `Website-Anreicherung läuft im Hintergrund für ${importedProviders.filter(p => p.website).length} Betriebe`
                    : null
            };

            // Website-Anreicherung im Hintergrund starten (NACH der Antwort an den Client)
            if (importedProviders.length > 0) {
                setImmediate(() => runWebsiteEnrichment(importedProviders, authKey));
            }
        } else if (autoImport) {
            importResult = { imported: 0, skipped: duplicates.length, message: 'Alle bereits vorhanden' };
        }

        res.json({
            success: true,
            location: result.location,
            coordinates: result.coordinates,
            count: result.providers.length,
            stats: result.stats,
            providers: allProvidersWithFlags,
            import: importResult
        });

    } catch (error) {
        console.error('❌ Scraping error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/scrape-multiple
 * Scraped mehrere Orte nacheinander
 * Body: {
 *   locations: ["Cap d'Agde", "Gruissan", "Sète"],
 *   radiusKm: 15,
 *   autoImport: true
 * }
 */
app.post('/api/scrape-multiple', async (req, res) => {
    const {
        locations,
        radiusKm = 15,
        autoImport = false,
        authKey,
        pauseSeconds = 3,
        customKeywords = [],
        customExclusions = []
    } = req.body;

    if (!locations || !Array.isArray(locations) || locations.length === 0) {
        return res.status(400).json({ error: 'locations array required' });
    }

    console.log(`\n🌍 Multi-Scraping: ${locations.length} Orte`);
    if (customKeywords.length > 0) console.log(`   ➕ ${customKeywords.length} zusätzliche Suchbegriffe`);
    if (customExclusions.length > 0) console.log(`   🚫 ${customExclusions.length} zusätzliche Ausschlüsse`);
    const results = [];
    let totalImported = 0;
    let totalSkipped = 0;
    const allImportedProviders = [];  // Für spätere Website-Anreicherung

    for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        console.log(`\n[${i + 1}/${locations.length}] ${loc}`);

        try {
            const result = await scrapeLocation(loc, { radiusKm, customKeywords, customExclusions });

            let importResult = null;
            let providersWithFlags = result.providers;

            // Duplikat-Prüfung immer durchführen (für Flags in der Vorschau-Tabelle)
            if (result.providers.length > 0) {
                const { unique, duplicates } = await checkDuplicates(result.providers, authKey);
                providersWithFlags = [
                    ...unique.map(p => ({ ...p, _isDuplicate: false })),
                    ...duplicates
                ];

                if (autoImport && unique.length > 0) {
                    const supabaseResult = await insertToSupabase(unique, authKey);
                    const importedProviders = Array.isArray(supabaseResult.body) ? supabaseResult.body : [];
                    importResult = {
                        imported: importedProviders.length || unique.length,
                        skipped: duplicates.length,
                        status: supabaseResult.status,
                        error: supabaseResult.status >= 400 ? JSON.stringify(supabaseResult.body) : null
                    };
                    totalImported += importResult.imported;
                    totalSkipped  += duplicates.length;
                    allImportedProviders.push(...importedProviders);
                } else if (autoImport) {
                    importResult = { imported: 0, skipped: duplicates.length };
                    totalSkipped += duplicates.length;
                }
            }

            results.push({
                location: loc,
                formattedLocation: result.location,
                count: result.providers.length,
                providers: providersWithFlags,
                stats: result.stats,
                import: importResult
            });

        } catch (err) {
            console.error(`   ❌ Fehler für ${loc}: ${err.message}`);
            results.push({ location: loc, error: err.message });
        }

        // Pause zwischen Orten
        if (i < locations.length - 1) {
            console.log(`   ⏳ Pause ${pauseSeconds}s...`);
            await new Promise(r => setTimeout(r, pauseSeconds * 1000));
        }
    }

    // Website-Anreicherung im Hintergrund starten (NACH der Antwort an den Client)
    if (allImportedProviders.length > 0) {
        setImmediate(() => runWebsiteEnrichment(allImportedProviders, authKey));
    }

    res.json({
        success: true,
        processedLocations: locations.length,
        results,
        totalSummary: {
            imported: totalImported,
            skipped: totalSkipped
        }
    });
});

/**
 * POST /api/import
 * Importiert manuell erstellte Provider-Liste direkt in Supabase
 * Body: {
 *   providers: [...],
 *   authKey: "...",
 *   skipDuplicateCheck: false
 * }
 */
app.post('/api/import', async (req, res) => {
    const { providers, authKey, skipDuplicateCheck = false } = req.body;

    if (!providers || !Array.isArray(providers)) {
        return res.status(400).json({ error: 'providers array required' });
    }

    try {
        let toImport = providers;
        let duplicates = [];

        if (!skipDuplicateCheck) {
            const checked = await checkDuplicates(providers, authKey);
            toImport = checked.unique;
            duplicates = checked.duplicates;
        }

        const result = await insertToSupabase(toImport, authKey);

        res.json({
            success: result.status < 400,
            imported: toImport.length,
            skipped: duplicates.length,
            supabaseStatus: result.status,
            error: result.status >= 400 ? result.body : null
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/categories
 * Gibt alle verfügbaren Kategorien zurück
 */
app.get('/api/categories', (req, res) => {
    res.json({
        categories: [
            { value: 'repair', label: 'Werkstatt / Reparatur', icon: '🔧' },
            { value: 'motor_service', label: 'Motorservice', icon: '⚙️' },
            { value: 'marine supplies', label: 'Zubehör & Ausrüstung', icon: '🛒' },
            { value: 'sailmaker', label: 'Segelmacher', icon: '⛵' },
            { value: 'rigging', label: 'Rigg Service', icon: '🔩' },
            { value: 'instruments', label: 'Marine Elektronik', icon: '🔌' },
            { value: 'yard', label: 'Bootsbauer / Werft', icon: '🏗️' },
            { value: 'surveyor', label: 'Gutachter', icon: '📋' },
            { value: 'crane', label: 'Kran / Travel Lift', icon: '🏗️' },
            { value: 'painting', label: 'Lackierung / Antifouling', icon: '🎨' },
            { value: 'heating_climate', label: 'Heizung / Klimatechnik', icon: '🌡️' }
        ]
    });
});

/**
 * GET /health
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'boatcare-places-scraper',
        version: '4.0.0',
        features: ['google-places-discovery', 'supabase-direct-import', 'duplicate-check']
    });
});

// ============================================================
// SUPABASE HTTP GET (für enrich-brands)
// ============================================================
async function supabaseGet(path, authKey) {
    const key = authKey || CONFIG.SUPABASE_SERVICE_KEY || CONFIG.SUPABASE_ANON_KEY;
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${path}`;
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Accept': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
            });
        }).on('error', reject);
    });
}

// PATCH einen einzelnen Datensatz in Supabase
async function supabasePatch(table, id, patch, authKey) {
    const key = authKey || CONFIG.SUPABASE_SERVICE_KEY || CONFIG.SUPABASE_ANON_KEY;
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    const data = JSON.stringify(patch);
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'PATCH',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'Prefer': 'return=minimal'
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// DELETE einen einzelnen Datensatz in Supabase
async function supabaseDelete(table, id, authKey) {
    const key = authKey || CONFIG.SUPABASE_SERVICE_KEY || CONFIG.SUPABASE_ANON_KEY;
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'DELETE',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Prefer': 'return=minimal'
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve({ status: res.statusCode, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

/**
 * Sucht einen Betrieb in Google Places anhand von Name + Stadt.
 * Gibt das erste Ergebnis zurück oder null.
 */
async function findPlaceForProvider(provider) {
    const query = [provider.name, provider.city, provider.country]
        .filter(Boolean).join(', ');

    const body = {
        textQuery: query,
        maxResultCount: 1,
        languageCode: 'de'
    };

    // Koordinaten als Suchbias nutzen wenn vorhanden
    if (provider.latitude && provider.longitude &&
        provider.latitude !== 0 && provider.longitude !== 0) {
        body.locationBias = {
            circle: {
                center: { latitude: provider.latitude, longitude: provider.longitude },
                radius: 500  // 500m Radius — wir suchen genau diesen Betrieb
            }
        };
    }

    const headers = {
        'X-Goog-Api-Key': CONFIG.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.editorialSummary',
            'places.reviews'
        ].join(',')
    };

    const result = await httpPost(
        'https://places.googleapis.com/v1/places:searchText',
        body, headers
    );
    const places = result.body?.places || [];
    return places.length > 0 ? places[0] : null;
}

/**
 * Extrahiert echte Brands aus dem Freitext eines konkreten Google-Place-Ergebnisses.
 * Nutzt ausschließlich editorialSummary + reviews — kein Kategorie-Fallback.
 * Gibt null zurück wenn nichts gefunden wurde.
 * Nutzt die globale ALL_BRANDS-Konstante.
 */
function extractRealBrandsFromPlace(place, category) {
    const reviewTexts = (place.reviews || [])
        .map(r => r.text?.text || r.originalText?.text || '')
        .join(' ');

    const textLower = [
        place.displayName?.text || '',
        place.editorialSummary?.text || '',
        reviewTexts
    ].join(' ').toLowerCase();

    const found = [];
    for (const brand of ALL_BRANDS) {
        if (textLower.includes(brand.toLowerCase()) && !found.includes(brand)) {
            found.push(brand);
        }
    }

    return found.length > 0 ? found : null;
}

/**
 * POST /api/enrich-brands
 * Liest alle service_providers ohne Brands aus der DB,
 * sucht jeden via Google Places Text Search,
 * extrahiert echte Brands aus Editorial + Reviews,
 * und schreibt sie per PATCH zurück in die DB.
 *
 * Body: {
 *   authKey: "...",        // Supabase Service Role Key (empfohlen) oder Anon Key
 *   limit: 50,             // max. Anzahl Betriebe (Standard: 50, da API-Kosten)
 *   dryRun: false          // true = nur anzeigen ohne DB-Update
 * }
 */
app.post('/api/enrich-brands', async (req, res) => {
    const {
        authKey,
        limit = 50,
        dryRun = false
    } = req.body || {};

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏷️  Starte Brands-Anreicherung (dryRun=${dryRun}, limit=${limit})`);
    console.log(`${'='.repeat(60)}`);

    try {
        // 1. Alle Provider ohne Brands aus Supabase laden
        const path = `service_providers?select=id,name,category,city,country,latitude,longitude&brands=is.null&limit=${limit}`;
        const providers = await supabaseGet(path, authKey);

        if (!Array.isArray(providers) || providers.length === 0) {
            return res.json({
                success: true,
                message: 'Keine Betriebe ohne Brands gefunden',
                processed: 0
            });
        }

        console.log(`📋 ${providers.length} Betriebe ohne Brands gefunden`);

        const results = [];
        let updated = 0;
        let notFound = 0;
        let noBrands = 0;

        for (let i = 0; i < providers.length; i++) {
            const provider = providers[i];
            console.log(`\n[${i + 1}/${providers.length}] ${provider.name} (${provider.city || '?'})`);

            try {
                // 2. Betrieb in Google Places suchen
                const place = await findPlaceForProvider(provider);

                if (!place) {
                    console.log(`   ⚠️  Nicht in Google Places gefunden`);
                    notFound++;
                    results.push({
                        id: provider.id,
                        name: provider.name,
                        status: 'not_found',
                        brands: null
                    });
                    // Pause trotzdem (Rate Limiting)
                    await new Promise(r => setTimeout(r, 300));
                    continue;
                }

                console.log(`   ✅ Gefunden: "${place.displayName?.text}"`);

                // 3. Echte Brands aus Text extrahieren
                const brands = extractRealBrandsFromPlace(place, provider.category);

                if (!brands) {
                    console.log(`   ℹ️  Keine Brands im Text erwähnt`);
                    noBrands++;
                    results.push({
                        id: provider.id,
                        name: provider.name,
                        status: 'no_brands_in_text',
                        brands: null
                    });
                } else {
                    console.log(`   🏷️  Brands gefunden: ${brands.join(', ')}`);

                    // 4. In Supabase updaten (wenn kein dryRun)
                    if (!dryRun) {
                        const patchResult = await supabasePatch(
                            'service_providers',
                            provider.id,
                            { brands: brands },
                            authKey
                        );
                        if (patchResult.status < 300) {
                            console.log(`   💾 Gespeichert (HTTP ${patchResult.status})`);
                            updated++;
                        } else {
                            console.log(`   ❌ DB-Fehler: ${patchResult.status} ${patchResult.body}`);
                        }
                    } else {
                        console.log(`   🔍 dryRun — kein DB-Update`);
                        updated++;
                    }

                    results.push({
                        id: provider.id,
                        name: provider.name,
                        status: dryRun ? 'dry_run' : 'updated',
                        brands: brands
                    });
                }

            } catch (err) {
                console.log(`   ❌ Fehler: ${err.message}`);
                results.push({
                    id: provider.id,
                    name: provider.name,
                    status: 'error',
                    error: err.message
                });
            }

            // Rate Limiting: 300ms Pause zwischen Anfragen
            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ Fertig: ${updated} aktualisiert, ${notFound} nicht gefunden, ${noBrands} keine Brands im Text`);

        res.json({
            success: true,
            dryRun,
            processed: providers.length,
            updated,
            notFound,
            noBrands,
            results
        });

    } catch (error) {
        console.error(`❌ Enrich-Brands Fehler: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// WEBSITE-SCRAPER: E-Mail + Ansprechpartner von Webseite
// ============================================================

/** Lädt eine Webseite per HTTPS GET (max 500KB, 8s Timeout) */
/**
 * Laedt eine Webseite und gibt das rohe HTML zurueck.
 *
 * Wichtig fuer Email-Scraping:
 *  - User-Agent muss echt aussehen — viele Werften haben einen
 *    schlanken Cloudflare-Bot-Block, der "BoatCareBot" ablehnt
 *  - Accept-Header dazugeben, sonst senden manche Server 406
 *  - Accept-Encoding: identity — wir wollen kein gzipped HTML
 *  - Folge bis zu 5 Redirects (war 3, manche WP-Sites brauchen mehr)
 *  - Relative Location-Header korrekt aufloesen
 */
function fetchWebpage(url, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const timeout = setTimeout(() => reject(new Error('Timeout nach 10s')), 10000);

        const req = lib.get(url, {
            headers: {
                // Realistischer Browser-User-Agent — fast alle Sites lassen
                // diesen durch. Bot-Detection-Plugins (Cloudflare, Sucuri)
                // sehen das aber natuerlich. Fuer schwere Faelle muesste
                // crawl4ai-Backend ran (Playwright mit echtem Browser).
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
                'Accept-Encoding': 'identity',
                'Cache-Control': 'no-cache',
            }
        }, (res) => {
            // Redirect folgen — Location-Header kann relativ sein
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                clearTimeout(timeout);
                if (redirectsLeft <= 0) {
                    return reject(new Error('Zu viele Redirects'));
                }
                let nextUrl = res.headers.location;
                if (!nextUrl.startsWith('http')) {
                    try {
                        nextUrl = new URL(nextUrl, url).toString();
                    } catch {
                        return reject(new Error('Ungueltige Redirect-URL'));
                    }
                }
                return fetchWebpage(nextUrl, redirectsLeft - 1).then(resolve).catch(reject);
            }
            // HTTP-Fehler (z.B. 404, 403, 500) explizit melden
            if (res.statusCode >= 400) {
                clearTimeout(timeout);
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            let data = '';
            let bytes = 0;
            res.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > 1500000) {
                    res.destroy();
                    clearTimeout(timeout);
                    reject(new Error('Seite zu groß'));
                    return;
                }
                data += chunk;
            });
            res.on('end', () => { clearTimeout(timeout); resolve(data); });
            res.on('error', (e) => { clearTimeout(timeout); reject(e); });
        });
        req.on('error', (e) => { clearTimeout(timeout); reject(e); });
        req.setTimeout(10000, () => { req.destroy(); clearTimeout(timeout); reject(new Error('Socket-Timeout')); });
    });
}

/**
 * Extrahiert E-Mail-Adressen aus HTML — auch verschleierte Varianten.
 *
 * Erkennt:
 *  - Standard-Mails: info@firma.de
 *  - mailto:-Hrefs (auch wenn der sichtbare Text anders ist)
 *  - HTML-Entities: &#64; → @, &#46; → .
 *  - Obfuskation: info[at]firma.de, info (at) firma.de, info AT firma DOT de
 *  - JavaScript-Konkatenation: "info" + "@" + "firma.de"
 *  - JSON-LD <script type="application/ld+json"> mit "email"-Feld
 *  - data-email / data-mail Attribute
 */
function extractEmailFromHtml(html) {
    if (!html) return [];
    const found = new Set();
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

    // 1. mailto:-Hrefs (zuverlaessigste Quelle, ueberlebt auch JS-Render)
    const mailtoHrefRegex = /href\s*=\s*["']\s*mailto\s*:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
    for (const m of html.matchAll(mailtoHrefRegex)) {
        found.add(m[1].toLowerCase());
    }

    // 2. data-email / data-mail / data-contact-email
    const dataAttrRegex = /data-(?:email|mail|contact-email)\s*=\s*["']([^"']+)["']/gi;
    for (const m of html.matchAll(dataAttrRegex)) {
        for (const e of m[1].matchAll(emailRegex)) found.add(e[0].toLowerCase());
    }

    // 3. JSON-LD strukturierte Daten
    const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    for (const m of html.matchAll(jsonLdRegex)) {
        try {
            const data = JSON.parse(m[1].trim());
            const items = Array.isArray(data) ? data : [data];
            const collect = (node) => {
                if (!node || typeof node !== 'object') return;
                for (const k of ['email', 'contactEmail', 'customerServiceEmail']) {
                    if (typeof node[k] === 'string' && node[k].includes('@')) {
                        found.add(node[k].toLowerCase().trim());
                    }
                }
                for (const v of Object.values(node)) {
                    if (Array.isArray(v)) v.forEach(collect);
                    else if (v && typeof v === 'object') collect(v);
                }
            };
            items.forEach(collect);
        } catch { /* invalid JSON */ }
    }

    // 4. Rest: Skripte/Styles/Kommentare raus, dann auf gesamtem Text suchen
    let cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');

    // HTML-Entities dekodieren: &#64; → @, &#46; → .
    cleaned = cleaned
        .replace(/&#64;|&#x40;/gi, '@')
        .replace(/&#46;|&#x2e;/gi, '.')
        .replace(/&amp;/gi, '&')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

    // Obfuskation normalisieren
    const normalized = cleaned
        .replace(/\s*[\[(\{<«]\s*at\s*[\])}>»]\s*/gi, '@')
        .replace(/(?<=\S)\s+at\s+(?=\S)/gi, '@')
        .replace(/\s*[\[(\{<«]\s*dot\s*[\])}>»]\s*/gi, '.')
        .replace(/(?<=\S)\s+dot\s+(?=\S)/gi, '.')
        .replace(/\s*[\[(\{<«]\s*punkt\s*[\])}>»]\s*/gi, '.')
        .replace(/(?<=\S)\s+punkt\s+(?=\S)/gi, '.')
        .replace(/_at_/gi, '@').replace(/-at-/gi, '@');

    for (const m of normalized.matchAll(emailRegex)) {
        found.add(m[0].toLowerCase());
    }

    // 5. JavaScript-Konkatenation: "info" + "@" + "domain.de"
    const jsConcat = /['"]([a-zA-Z0-9._%+\-]+)['"]\s*\+\s*['"]@['"]\s*\+\s*['"]([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})['"]/g;
    for (const m of html.matchAll(jsConcat)) {
        found.add((m[1] + '@' + m[2]).toLowerCase());
    }

    // Filter: System-Mails, Tracker, Image-Endungen, Webagenturen, Hoster
    const excluded = /\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf|eot|ico|webp)$/i;
    const sysMailbox = /^(noreply|no-reply|mailer-daemon|postmaster|donotreply|do-not-reply|webmaster|hostmaster|abuse|root|admin|administrator|sysadmin|nameserver|dns|noc|wp-?admin|bounce|listserv|newsletter|test|spam)@/i;
    const blacklist = /example\.com|wixpress|sentry\.io|schema\.org|wordpress\.com|gravatar|cloudflare|@2x|googletagmanager|facebook\.com|twitter\.com|youtube\.com/i;

    // Webagentur-/Hoster-Domains (Mail dort ist nicht vom Betrieb)
    const agencyDomain = /@(jimdo\.com|jimdo\.de|wix\.com|wixsite\.com|wordpress\.com|squarespace\.com|webflow\.io|webnode\.|weebly\.com|site123\.com|strikingly\.com|ionos\.de|ionos\.com|one\.com|1und1\.de|strato\.de|hosteurope\.de|all-inkl\.com|hostinger\.com|hostgator\.com|godaddy\.com|namecheap\.com|ovh\.(com|de|fr)|gandi\.net)$/i;

    // Webdesigner-Domains (Hinweis-Strings im Domain-Teil)
    const webdesigner = /@[^@]*(webdesign|webagentur|webagency|werbeagentur|werbeagentur|softwareentwicklung|webentwicklung|agence-?web|agenzia-?web|agencia-?web|seo-?agentur)[^@]*$/i;

    return [...found]
        .filter(e =>
            !excluded.test(e) &&
            !sysMailbox.test(e) &&
            !blacklist.test(e) &&
            !agencyDomain.test(e) &&
            !webdesigner.test(e)
        )
        .slice(0, 5);
}

/** Extrahiert Ansprechpartner aus HTML */
function extractContactFromHtml(html) {
    const cleaned = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const patterns = [
        /(?:inhaber|geschäftsführer|geschäftsleitung|eigentümer)[:\s]+([A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+)/i,
        /(?:ansprechpartner|kontaktperson|your contact|contact person)[:\s]+([A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+)/i,
        /(?:gérant|directeur|responsable|propriétaire)[:\s]+([A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ][a-zàâäéèêëïîôùûüÿç]+\s+[A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ][a-zàâäéèêëïîôùûüÿç]+)/i,
        /(?:owner|manager|director)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    ];
    for (const p of patterns) {
        const m = cleaned.match(p);
        if (m) return m[1].trim();
    }
    return null;
}

/**
 * POST /api/scrape-website
 * Scraped E-Mail + Ansprechpartner von einer Website
 */
app.post('/api/scrape-website', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    try {
        const html = await fetchWebpage(url);
        const emails = extractEmailFromHtml(html);
        const contact = extractContactFromHtml(html);

        // Auch das rohe HTML zurueckliefern — der Client (admin-web)
        // hat deutlich schlauere Extractor (JSON-LD, mailto-Hrefs, Meta,
        // hCard-Microformats, obfuscierte Mails mit [at]/[dot], JS-
        // Konkatenation, HTML-Entities). Ohne HTML fallen die alle
        // flach und wir verlieren ~60% der echten Treffer.
        //
        // Cap auf 600 KB, damit grosse Single-Page-Apps keine zu grossen
        // Responses erzeugen. Die kompletten 1.2 MB aus fetchWebpage
        // brauchen wir nicht — Mail-Adressen kommen praktisch immer in
        // den ersten paar 100 KB.
        const htmlClipped = html.length > 600_000
            ? html.substring(0, 600_000)
            : html;

        // Extrahiere Markdown-aehnlichen Roh-Text fuer den Fallback-
        // Regex auf dem Client (extractEmailsFromText scannt darin
        // auch obfuscierte Mails). Style+Script vorher rauswerfen.
        const rawText = html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .substring(0, 400_000);

        res.json({
            success: true,
            emails,
            contact,
            email: emails[0] || null,
            html: htmlClipped,
            raw_text: rawText,
        });
    } catch (err) {
        res.json({ success: false, emails: [], contact: null, email: null, error: err.message });
    }
});

// ============================================================
// ENRICH-PROVIDERS: Fehlende Daten ergänzen (Services, Brands, etc.)
// ============================================================

/** Erweiterte Google-Places-Suche für Anreicherung (mehr Felder) */
async function findPlaceForProviderExtended(provider) {
    const query = [provider.name, provider.city, provider.country].filter(Boolean).join(', ');
    const body = { textQuery: query, maxResultCount: 1, languageCode: 'de' };

    if (provider.latitude && provider.longitude && provider.latitude !== 0 && provider.longitude !== 0) {
        body.locationBias = {
            circle: { center: { latitude: provider.latitude, longitude: provider.longitude }, radius: 500 }
        };
    }

    const headers = {
        'X-Goog-Api-Key': CONFIG.GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': [
            'places.id', 'places.displayName', 'places.editorialSummary', 'places.reviews',
            'places.internationalPhoneNumber', 'places.websiteUri', 'places.types', 'places.primaryType'
        ].join(',')
    };

    const result = await httpPost('https://places.googleapis.com/v1/places:searchText', body, headers);
    const places = result.body?.places || [];
    return places.length > 0 ? places[0] : null;
}

/**
 * POST /api/enrich-providers
 * Sucht bestehende Provider in Google Places und ergänzt fehlende Daten.
 * Body: { filter, limit, dryRun, providerIds, authKey }
 */
app.post('/api/enrich-providers', async (req, res) => {
    const { authKey, limit = 25, dryRun = true, filter = 'missing_any', providerIds = null } = req.body || {};

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 Enrich-Providers: filter=${filter}, limit=${limit}, dryRun=${dryRun}`);
    console.log(`${'='.repeat(60)}`);

    try {
        // 1. Provider aus DB laden
        let path;
        if (providerIds && providerIds.length > 0) {
            const ids = providerIds.map(id => `"${id}"`).join(',');
            path = `service_providers?select=id,name,category,city,country,latitude,longitude,phone,email,website,services,brands,logo_url&id=in.(${ids})&limit=${limit}`;
        } else {
            const base = 'service_providers?select=id,name,category,city,country,latitude,longitude,phone,email,website,services,brands,logo_url';
            switch (filter) {
                case 'missing_services': path = `${base}&or=(services.is.null,services.eq.{})&limit=${limit}`; break;
                case 'missing_brands':   path = `${base}&or=(brands.is.null,brands.eq.{})&limit=${limit}`; break;
                case 'missing_logo':     path = `${base}&logo_url=is.null&limit=${limit}`; break;
                case 'missing_any':      path = `${base}&or=(services.is.null,services.eq.{},brands.is.null,brands.eq.{},logo_url.is.null)&limit=${limit}`; break;
                case 'all':              path = `${base}&limit=${limit}`; break;
                default:                 path = `${base}&or=(services.is.null,brands.is.null)&limit=${limit}`;
            }
        }

        const providers = await supabaseGet(path, authKey);
        if (!Array.isArray(providers) || providers.length === 0) {
            return res.json({ success: true, message: 'Keine passenden Betriebe', processed: 0, results: [] });
        }

        console.log(`📋 ${providers.length} Betriebe geladen`);

        const results = [];
        let enriched = 0;

        for (let i = 0; i < providers.length; i++) {
            const prov = providers[i];
            console.log(`[${i + 1}/${providers.length}] ${prov.name} (${prov.city || '?'})`);

            try {
                const place = await findPlaceForProviderExtended(prov);
                if (!place) {
                    console.log(`   ⚠️  Nicht gefunden`);
                    results.push({ id: prov.id, name: prov.name, city: prov.city, category: prov.category, status: 'not_found', diff: null });
                    await new Promise(r => setTimeout(r, 300));
                    continue;
                }

                console.log(`   ✅ Gefunden: "${place.displayName?.text}"`);

                // Daten extrahieren: Website hat Vorrang (direkt fetchen), dann Places-Text
                let newServices = null, newBrands = null;
                const newPhone = place.internationalPhoneNumber || null;
                const newWebsite = place.websiteUri || prov.website || null;

                let newLogoUrl = null;
                if (newWebsite) {
                    try {
                        const html = await fetchWebpage(newWebsite);
                        const webData = extractFromWebsiteHtml(html, prov.category, newWebsite);
                        newServices = webData.services;
                        newBrands   = webData.brands;
                        newLogoUrl  = webData.logoUrl;
                        if (!webData.categoryValid) console.log(`   ⚠️  Kategorie '${prov.category}' nicht durch Website bestätigt`);
                        console.log(`   🌐 Website: ${newServices?.length || 0} Services, ${newBrands?.length || 0} Brands${newLogoUrl ? ', 🖼️ Logo' : ''}`);
                    } catch(e) {
                        console.log(`   ⚠️  Website nicht erreichbar: ${e.message}`);
                    }
                }
                // Fallback: Places-Text wenn Website keine Daten lieferte
                if (!newServices) {
                    const extracted = extractServices(place, prov.category);
                    newServices = extracted.services;
                    if (!newBrands) newBrands = extracted.brands;
                }
                if (!newBrands) newBrands = extractRealBrandsFromPlace(place, prov.category);

                // Diff berechnen — nur fehlende Felder ergänzen (außer filter=all)
                const diff = {};
                const isEmpty = v => !v || (Array.isArray(v) && v.length === 0);

                if (isEmpty(prov.services) && newServices && newServices.length > 0)
                    diff.services = { old: prov.services, new: newServices };
                if (isEmpty(prov.brands) && newBrands && newBrands.length > 0)
                    diff.brands = { old: prov.brands, new: newBrands };
                if (!prov.phone && newPhone) diff.phone = { old: null, new: newPhone };
                if (!prov.website && newWebsite) diff.website = { old: null, new: newWebsite };
                if (!prov.logo_url && newLogoUrl) diff.logo_url = { old: null, new: newLogoUrl };

                // Bei filter=all auch bestehende Daten überschreiben
                if (filter === 'all') {
                    if (newServices && newServices.length > 0 && JSON.stringify(newServices) !== JSON.stringify(prov.services))
                        diff.services = { old: prov.services, new: newServices };
                    if (newBrands && newBrands.length > 0 && JSON.stringify(newBrands) !== JSON.stringify(prov.brands))
                        diff.brands = { old: prov.brands, new: newBrands };
                    if (newLogoUrl && newLogoUrl !== prov.logo_url)
                        diff.logo_url = { old: prov.logo_url, new: newLogoUrl };
                }

                const hasDiff = Object.keys(diff).length > 0;

                if (hasDiff) {
                    for (const [k, v] of Object.entries(diff))
                        console.log(`   📝 ${k}: ${JSON.stringify(v.old)} → ${JSON.stringify(v.new)}`);

                    if (!dryRun) {
                        const patch = {};
                        for (const [k, v] of Object.entries(diff)) patch[k] = v.new;
                        const pr = await supabasePatch('service_providers', prov.id, patch, authKey);
                        if (pr.status < 300) { console.log(`   💾 Gespeichert`); enriched++; }
                        else console.log(`   ❌ DB-Fehler: ${pr.status}`);
                    } else {
                        enriched++;
                    }
                } else {
                    console.log(`   ℹ️  Keine Änderungen`);
                }

                results.push({
                    id: prov.id, name: prov.name, city: prov.city, category: prov.category,
                    status: hasDiff ? (dryRun ? 'preview' : 'updated') : 'no_changes',
                    diff: hasDiff ? diff : null
                });

            } catch (err) {
                console.log(`   ❌ ${err.message}`);
                results.push({ id: prov.id, name: prov.name, status: 'error', error: err.message, diff: null });
            }

            await new Promise(r => setTimeout(r, 300));
        }

        console.log(`\n✅ Fertig: ${enriched} mit Änderungen von ${providers.length} geprüften`);

        res.json({ success: true, dryRun, filter, processed: providers.length, enriched, results });
    } catch (error) {
        console.error(`❌ Enrich-Providers Fehler: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// Legacy-Kompatibilität
app.post('/api/google-search', async (req, res) => {
    res.status(410).json({ error: 'Veraltet. Verwende POST /api/scrape' });
});

// ============================================================
// ONLINE-SHOP-VERIFIZIERUNG
// ============================================================
//
// Prueft ob eine Provider-Website ein echter Online-Shop ist. Wichtig
// fuer das Shop-Onboarding-Mailing: wir wollen Werften mit nur
// statischer Firmen-Website nicht mit Marketplace-Pitch nerven.
//
// Erkennung in zwei Stufen:
//   1. Shop-Plattform anhand technischer Signaturen (Shopify-CDN,
//      WooCommerce-Pfade, Magento-Variablen etc.) → hoechste Konfidenz
//   2. Generische Shop-Indikatoren (Schema.org Product, "Warenkorb",
//      Checkout-Buttons, Preis-Angaben, Versand-Erklaerungen)
//
// Score-System (0-100):
//   ≥ 50 → online_shop
//   25-49 → maybe_shop (manuell pruefen)
//   < 25 → website_only
//   HTML leer / Fehler → unreachable

/**
 * Erkennt Shop-Plattform anhand technischer Fingerprints.
 * Sehr zuverlaessig, weil diese Marker im Markup oder Asset-URLs
 * immer auftauchen wenn die Plattform genutzt wird.
 */
function detectShopPlatform(html) {
    const checks = [
        { id: 'shopify', score: 50, patterns: [
            /cdn\.shopify\.com/i, /myshopify\.com/i,
            /<meta\s+name=["']shopify-/i, /Shopify\.Checkout/i,
            /shopify-section/i, /\.shopifycdn\.com/i,
        ]},
        { id: 'woocommerce', score: 50, patterns: [
            /\/wp-content\/plugins\/woocommerce/i, /\bwoocommerce-page\b/i,
            /woocommerce_params/i, /class=["'][^"']*woocommerce[^"']*["']/i,
            /\/?add-to-cart=/i, /woocommerce-product/i,
        ]},
        { id: 'magento', score: 50, patterns: [
            /Mage\.Cookies/, /var\s+BASE_URL\s*=/i, /\/skin\/frontend\/(?:base|default)/i,
            /Magento_/i, /mage\/cookies\.js/i, /static\/version\d+\/frontend/i,
        ]},
        { id: 'prestashop', score: 50, patterns: [
            /prestashop/i, /\/modules\/blockcart/i, /var\s+prestashop\s*=/i,
        ]},
        { id: 'shopware', score: 45, patterns: [
            /shopware/i, /\/themes\/Frontend\/Responsive/i, /sw-emotion-grid/i,
            /shopware-?(5|6)/i,
        ]},
        { id: 'jtl', score: 45, patterns: [
            /\bjtl-shop\b/i, /\/Shop\/templates_c\//i, /jtl-?shop/i,
        ]},
        { id: 'oxid', score: 40, patterns: [
            /\boxid(?:eshop|esales)/i, /\/source\/out\/azure/i,
        ]},
        { id: 'plentymarkets', score: 40, patterns: [
            /plentymarkets/i, /ceres\.js/i, /\/ceres-/i,
        ]},
        { id: 'webflow_ecommerce', score: 35, patterns: [
            /w-commerce-/i, /webflow\.com\/ecommerce/i,
        ]},
        { id: 'wix_stores', score: 35, patterns: [
            /wix-?stores/i, /<meta\s+property=["']og:type["']\s+content=["']product/i,
        ]},
        { id: 'squarespace_commerce', score: 30, patterns: [
            /squarespace-commerce/i, /sqs-block-product/i,
        ]},
    ];

    for (const c of checks) {
        for (const re of c.patterns) {
            if (re.test(html)) return { platform: c.id, platformScore: c.score };
        }
    }
    return { platform: null, platformScore: 0 };
}

/**
 * Generische Shop-Signale die auch bei selbstgebauten Shops zaehlen.
 * Jeder Treffer addiert Punkte — gedeckelt damit unwichtige Signale
 * nicht das ganze Ergebnis kippen.
 */
function detectShopSignals(html) {
    const signals = [];
    let score = 0;

    // 1. Schema.org Product / Offer markup (sehr starkes Signal)
    if (/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?"@type"\s*:\s*"(?:Product|Offer|AggregateOffer)"/i.test(html)) {
        score += 25; signals.push('Schema.org Product');
    }
    // 2. OpenGraph product type
    if (/<meta[^>]+property=["']og:type["'][^>]+content=["']product["']/i.test(html)) {
        score += 15; signals.push('og:type=product');
    }
    // 3. Warenkorb-Indikator (mehrsprachig)
    if (/(?:warenkorb|add[- ]?to[- ]?cart|in den warenkorb|panier|carrito|carrello|winkelwagen|in.den.einkaufswagen)/i.test(html)) {
        score += 12; signals.push('Warenkorb-Button');
    }
    // 4. Checkout / Kasse
    if (/(?:\b(?:checkout|kasse|bezahlen|zur kasse|panier\/payment|finalizar compra|cassa|afrekenen)\b)/i.test(html)) {
        score += 8; signals.push('Checkout-Begriff');
    }
    // 5. Preis-Auszeichnung (klares Online-Shop-Indiz)
    if (/(?:itemprop=["']price["']|data-price=|class=["'][^"']*\bprice\b[^"']*["']|<span[^>]+price)/i.test(html)) {
        score += 10; signals.push('Preis-Markup');
    }
    // 6. Versand-/Lieferzeit-Information
    if (/(?:versandkosten|lieferzeit|shipping cost|delivery time|frais de port|gastos de envío|spese di spedizione|verzendkosten)/i.test(html)) {
        score += 8; signals.push('Versand-Info');
    }
    // 7. Produkt-URL-Pattern im HTML (links auf eigene /product/, /produkt/, /shop/ Seiten)
    if (/href=["'][^"']*\/(?:product|produkt|shop|store|kaufen|buy)\//i.test(html)) {
        score += 8; signals.push('Shop-URL-Pfade');
    }
    // 8. Bezahl-/Payment-Provider erwaehnt
    if (/(?:paypal|klarna|amazon pay|stripe|apple pay|google pay|sofortueberweisung|sofort\.com|rechnungskauf)/i.test(html)) {
        score += 5; signals.push('Payment-Provider erwaehnt');
    }
    // 9. AGB/Widerruf — sehr typisch fuer DE-Shops
    if (/(?:widerrufsbelehrung|widerrufsrecht|rueckgaberecht|allgemeine geschaeftsbedingungen)/i.test(html)) {
        score += 4; signals.push('AGB/Widerruf');
    }

    // Cap bei 60 Punkten — Plattform-Erkennung soll die finale
    // Differenzierung machen.
    return { signalScore: Math.min(score, 60), signals };
}

async function verifyShop(website) {
    const result = {
        status: 'unverified',
        score: 0,
        platform: null,
        signals: [],
        note: '',
    };

    if (!website || typeof website !== 'string') {
        result.note = 'Keine Website hinterlegt';
        return result;
    }

    try {
        const html = await fetchWebpage(website);
        if (!html || html.length < 500) {
            result.status = 'unreachable';
            result.note = 'Antwort zu kurz / leer';
            return result;
        }

        // Plattform-Erkennung (starke Signale, eigener Score)
        const platformResult = detectShopPlatform(html);
        const signalResult   = detectShopSignals(html);

        // Gesamt-Score: Plattform-Score (max 50) + Signal-Score (max 60)
        // → max 110, gedeckelt bei 100
        const totalScore = Math.min(
            platformResult.platformScore + signalResult.signalScore,
            100
        );

        result.score = totalScore;
        result.platform = platformResult.platform;
        result.signals = signalResult.signals;

        if (totalScore >= 50) {
            result.status = 'online_shop';
            result.note = platformResult.platform
                ? `Plattform: ${platformResult.platform}. Signale: ${signalResult.signals.join(', ') || 'keine generischen'}`
                : `Generischer Shop erkannt. Signale: ${signalResult.signals.join(', ')}`;
        } else if (totalScore >= 25) {
            result.status = 'maybe_shop';
            result.note = `Score ${totalScore}. Signale: ${signalResult.signals.join(', ') || 'keine'}. Manuell pruefen.`;
        } else {
            result.status = 'website_only';
            result.note = signalResult.signals.length > 0
                ? `Score ${totalScore} (zu niedrig). Schwache Signale: ${signalResult.signals.join(', ')}`
                : `Score 0 — keine Shop-Indikatoren gefunden. Nur Firmen-Webseite.`;
        }

        return result;
    } catch (err) {
        result.status = 'unreachable';
        result.note = `Website nicht erreichbar: ${err.message}`;
        return result;
    }
}

/**
 * POST /api/verify-shop
 * Body: { website, providerId? }
 */
app.post('/api/verify-shop', async (req, res) => {
    const { website, providerId } = req.body || {};
    if (!website) return res.status(400).json({ error: 'website erforderlich' });

    const result = await verifyShop(website);

    if (providerId && CONFIG.SUPABASE_SERVICE_KEY) {
        try {
            await persistShopVerificationResult(providerId, result);
        } catch (e) {
            console.warn('Persist fehlgeschlagen:', e.message);
        }
    }

    res.json({ success: true, website, ...result });
});

/**
 * POST /api/verify-shops-batch
 * Body: { filter, limit }
 *
 * filter:
 *   - 'never_checked'  — Provider mit Website die noch nicht geprueft wurden (default)
 *   - 'older_than_30d' — Provider mit Check aelter als 30 Tage
 *   - 'category_supplies' — nur Kategorie "Zubehoer" / Marine Supplies
 *   - 'all'            — alle mit Website
 */
app.post('/api/verify-shops-batch', async (req, res) => {
    const { filter = 'never_checked', limit = 25 } = req.body || {};

    if (!CONFIG.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY fehlt.' });
    }

    try {
        const providers = await loadProvidersForShopCheck(filter, limit);
        console.log(`\n🛒 Shop-Verify: ${providers.length} Provider, filter=${filter}`);

        const results = [];
        const counts = { online_shop: 0, maybe_shop: 0, website_only: 0, unreachable: 0 };

        for (const p of providers) {
            const r = await verifyShop(p.website);
            counts[r.status] = (counts[r.status] || 0) + 1;
            try {
                await persistShopVerificationResult(p.id, r);
            } catch (e) {
                console.warn(`Persist fuer ${p.id} fehlgeschlagen:`, e.message);
            }
            results.push({
                id: p.id, name: p.name, website: p.website,
                ...r,
            });
            const icon = r.status === 'online_shop' ? '🛒' :
                         r.status === 'maybe_shop' ? '🤔' :
                         r.status === 'website_only' ? '📄' : '⚠️';
            console.log(`  ${icon} ${p.name} → ${r.status} (Score ${r.score}, ${r.platform || 'no platform'})`);
        }

        res.json({ success: true, totalChecked: providers.length, counts, results });
    } catch (err) {
        console.error('Shop-Verify-Batch-Error:', err);
        res.status(500).json({ error: err.message });
    }
});

async function loadProvidersForShopCheck(filter, limit) {
    let filterClause = '&website=not.is.null&website=neq.';
    const now = new Date();
    switch (filter) {
        case 'never_checked':
            filterClause += `&shop_verified_at=is.null`;
            break;
        case 'older_than_30d':
            {
                const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                filterClause += `&or=(shop_verified_at.is.null,shop_verified_at.lt.${d})`;
            }
            break;
        case 'category_supplies':
            filterClause += `&category=in.(Zubehör,Zubehor,supplies,marine_supplies,Ship Chandler)&shop_verified_at=is.null`;
            break;
        case 'all':
        default:
            break;
    }
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers?select=id,name,website,category,shop_verified_at,shop_check_status${filterClause}&order=shop_verified_at.asc.nullsfirst&limit=${limit}`;

    return await new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
            }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const arr = JSON.parse(d);
                    if (Array.isArray(arr)) resolve(arr);
                    else reject(new Error('Supabase: ' + d.substring(0, 200)));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
    });
}

async function persistShopVerificationResult(providerId, result) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers?id=eq.${encodeURIComponent(providerId)}`;
    const payload = JSON.stringify({
        shop_verified_at: new Date().toISOString(),
        shop_check_status: result.status,
        shop_check_score: result.score || 0,
        shop_platform: result.platform || null,
        shop_check_note: result.note ? result.note.substring(0, 500) : null,
    });

    await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'PATCH',
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                Prefer: 'return=minimal',
            }
        }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve();
            else {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${d}`)));
            }
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ============================================================
// CLEVERREACH NEWSLETTER-SYNC
// ============================================================
//
// Pusht Provider mit verifizierten E-Mail-Adressen in CleverReach-
// Listen. Wir splitten nach Land (DE, FR, IT, ES, NL, GB, ...) damit
// die Newsletter sprach-/regionsgerecht versendet werden koennen.
//
// CleverReach REST API:
//   - Auth via OAuth2 client_credentials
//   - https://rest.cleverreach.com/v3/
//   - Receivers werden in "Groups" (= Listen) gehalten
//
// Required ENV-Vars:
//   CLEVERREACH_CLIENT_ID
//   CLEVERREACH_CLIENT_SECRET
//   CLEVERREACH_GROUP_DE   ← Group-ID fuer deutsche Provider
//   CLEVERREACH_GROUP_FR   ← Frankreich
//   CLEVERREACH_GROUP_IT   ← Italien
//   CLEVERREACH_GROUP_ES   ← Spanien
//   CLEVERREACH_GROUP_NL   ← Niederlande
//   CLEVERREACH_GROUP_GB   ← Grossbritannien
//   CLEVERREACH_GROUP_DEFAULT ← Fallback fuer unbekannte/sonstige

const CLEVERREACH_CONFIG = {
    CLIENT_ID: process.env.CLEVERREACH_CLIENT_ID || '',
    CLIENT_SECRET: process.env.CLEVERREACH_CLIENT_SECRET || '',
    GROUPS: {
        // ISO-2 Country-Code → CleverReach Group ID (alter Pro-Land-Modus)
        DE: process.env.CLEVERREACH_GROUP_DE || '',
        AT: process.env.CLEVERREACH_GROUP_DE || '',  // Oesterreich oft im DE-Newsletter
        CH: process.env.CLEVERREACH_GROUP_DE || '',  // Schweiz auch
        FR: process.env.CLEVERREACH_GROUP_FR || '',
        IT: process.env.CLEVERREACH_GROUP_IT || '',
        ES: process.env.CLEVERREACH_GROUP_ES || '',
        NL: process.env.CLEVERREACH_GROUP_NL || '',
        BE: process.env.CLEVERREACH_GROUP_NL || '',  // Belgien (NL-sprachiger Teil)
        GB: process.env.CLEVERREACH_GROUP_GB || '',
        UK: process.env.CLEVERREACH_GROUP_GB || '',
        DEFAULT: process.env.CLEVERREACH_GROUP_DEFAULT || '',
    },
    // ── NEU: Sprach-Gruppen (6 Sprachen × 2 Typen = 12 Groups) ──
    // Sync nach App-Sprache statt Land. Provider = Nicht-Shops,
    // Shop = shop_check_status='online_shop'. Fehlende Mappings → 'en'.
    LANG_GROUPS: {
        provider: {
            de: process.env.CLEVERREACH_GROUP_PROVIDER_DE || '',
            en: process.env.CLEVERREACH_GROUP_PROVIDER_EN || '',
            fr: process.env.CLEVERREACH_GROUP_PROVIDER_FR || '',
            it: process.env.CLEVERREACH_GROUP_PROVIDER_IT || '',
            es: process.env.CLEVERREACH_GROUP_PROVIDER_ES || '',
            nl: process.env.CLEVERREACH_GROUP_PROVIDER_NL || '',
        },
        shop: {
            de: process.env.CLEVERREACH_GROUP_SHOP_DE || '',
            en: process.env.CLEVERREACH_GROUP_SHOP_EN || '',
            fr: process.env.CLEVERREACH_GROUP_SHOP_FR || '',
            it: process.env.CLEVERREACH_GROUP_SHOP_IT || '',
            es: process.env.CLEVERREACH_GROUP_SHOP_ES || '',
            nl: process.env.CLEVERREACH_GROUP_SHOP_NL || '',
        },
    },
};

let _crAccessToken = null;
let _crTokenExpiry = 0;

/**
 * Holt einen Access-Token via OAuth2 client_credentials. Cached den
 * Token bis kurz vor Ablauf damit wir nicht bei jedem Receiver-Push
 * neu authentifizieren.
 */
async function cleverreachToken() {
    if (_crAccessToken && Date.now() < _crTokenExpiry - 60_000) {
        return _crAccessToken;
    }
    if (!CLEVERREACH_CONFIG.CLIENT_ID || !CLEVERREACH_CONFIG.CLIENT_SECRET) {
        throw new Error('CleverReach Credentials nicht konfiguriert. Setze CLEVERREACH_CLIENT_ID und CLEVERREACH_CLIENT_SECRET als Env-Vars.');
    }

    const body = JSON.stringify({
        grant_type: 'client_credentials',
        client_id: CLEVERREACH_CONFIG.CLIENT_ID,
        client_secret: CLEVERREACH_CONFIG.CLIENT_SECRET,
    });
    const result = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'rest.cleverreach.com',
            path: '/oauth/token.php',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { reject(new Error('Token parse: ' + data.substring(0, 200))); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });

    if (result.status !== 200 || !result.body.access_token) {
        throw new Error('CleverReach OAuth fehlgeschlagen: ' + JSON.stringify(result.body));
    }
    _crAccessToken = result.body.access_token;
    _crTokenExpiry = Date.now() + (result.body.expires_in || 3600) * 1000;
    return _crAccessToken;
}

/**
 * Fuegt einen Receiver einer Group hinzu (oder aktualisiert ihn).
 * CleverReach upsert-Verhalten: gleiche Mail in gleicher Group wird
 * automatisch aktualisiert statt Duplikat angelegt.
 */
async function cleverreachUpsertReceiver(groupId, provider) {
    const token = await cleverreachToken();

    const payload = JSON.stringify({
        email: provider.email,
        registered: Math.floor(Date.now() / 1000),
        activated: Math.floor(Date.now() / 1000),  // Double-Opt-In hier umgangen — siehe Hinweis
        source: 'Skipily Import',
        // CleverReach erlaubt benutzerdefinierte Attribute, die du im
        // Newsletter-Template als Platzhalter nutzen kannst ({{COMPANY}})
        attributes: {
            company: provider.name || '',
            city: provider.city || '',
            country: provider.country || '',
            category: provider.category || '',
            website: provider.website || '',
            language: countryToLanguage(provider.country),
        }
    });

    const result = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'rest.cleverreach.com',
            path: `/v3/groups.json/${encodeURIComponent(groupId)}/receivers/insert`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: data });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });

    if (result.status >= 200 && result.status < 300) {
        return { ok: true };
    }
    throw new Error(`CleverReach upsert (${result.status}): ${result.body.substring(0, 200)}`);
}

/**
 * Mapping Country-Code → Sprach-Tag (fuer Newsletter-Personalisierung).
 */
function countryToLanguage(country) {
    const c = normalizeCountryCode(country);
    const map = {
        DE: 'de', AT: 'de', CH: 'de',
        FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr',
        IT: 'it', SM: 'it', VA: 'it',
        ES: 'es', AD: 'es',
        NL: 'nl',
        GB: 'en', UK: 'en', IE: 'en', US: 'en',
    };
    return map[c] || 'en';
}

/**
 * Normalisiert verschiedene Country-Schreibweisen auf ISO-2-Codes.
 *
 * In der DB stehen Werte gemischt: "DE" / "Deutschland" / "Germany",
 * "FR" / "France" / "Frankreich", "Niederlande" / "NL" / "Netherlands".
 * Wir mappen alle Varianten auf das ISO-2-Format (DE, FR, NL, ...).
 */
function normalizeCountryCode(country) {
    if (!country) return '';
    const raw = country.toString().trim();
    if (raw.length === 2) return raw.toUpperCase();

    const lower = raw.toLowerCase();
    const map = {
        // Deutsch
        'deutschland': 'DE', 'germany': 'DE', 'allemagne': 'DE', 'germania': 'DE', 'alemania': 'DE',
        'oesterreich': 'AT', 'österreich': 'AT', 'austria': 'AT', 'autriche': 'AT',
        'schweiz': 'CH', 'switzerland': 'CH', 'suisse': 'CH', 'svizzera': 'CH',

        // Romanisch
        'frankreich': 'FR', 'france': 'FR', 'francia': 'FR',
        'italien': 'IT', 'italy': 'IT', 'italia': 'IT', 'italie': 'IT',
        'spanien': 'ES', 'spain': 'ES', 'españa': 'ES', 'espana': 'ES', 'espagne': 'ES', 'spagna': 'ES',
        'portugal': 'PT',
        'monaco': 'MC',

        // Nord-/Westeuropa
        'niederlande': 'NL', 'netherlands': 'NL', 'nederland': 'NL', 'pays-bas': 'NL',
        'belgien': 'BE', 'belgium': 'BE', 'belgique': 'BE', 'belgië': 'BE',
        'luxemburg': 'LU', 'luxembourg': 'LU',
        'daenemark': 'DK', 'dänemark': 'DK', 'denmark': 'DK', 'danemark': 'DK',
        'schweden': 'SE', 'sweden': 'SE', 'sverige': 'SE', 'suede': 'SE', 'suède': 'SE',
        'norwegen': 'NO', 'norway': 'NO', 'norge': 'NO',
        'finnland': 'FI', 'finland': 'FI', 'suomi': 'FI',
        'island': 'IS', 'iceland': 'IS',
        'irland': 'IE', 'ireland': 'IE', 'eire': 'IE',
        'grossbritannien': 'GB', 'großbritannien': 'GB', 'great britain': 'GB',
        'vereinigtes koenigreich': 'GB', 'vereinigtes königreich': 'GB',
        'united kingdom': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',

        // Suedeuropa / Mittelmeer
        'griechenland': 'GR', 'greece': 'GR', 'ελλάδα': 'GR',
        'kroatien': 'HR', 'croatia': 'HR', 'hrvatska': 'HR',
        'slowenien': 'SI', 'slovenia': 'SI', 'slovenija': 'SI',
        'malta': 'MT',
        'zypern': 'CY', 'cyprus': 'CY',
        'tuerkei': 'TR', 'türkei': 'TR', 'turkey': 'TR',

        // Atlantik
        'usa': 'US', 'united states': 'US', 'vereinigte staaten': 'US', 'amerika': 'US',
        'kanada': 'CA', 'canada': 'CA',

        // Gemischte
        'sp': 'ES',  // "Spain" abgekuerzt zu SP — kommt in den Daten vor
    };
    return map[lower] || raw.substring(0, 2).toUpperCase();
}

/**
 * POST /api/cleverreach-sync
 * Body: { limit?, dryRun?, onlyVerified?, country? }
 *
 * Pusht Provider nach CleverReach. Filter:
 *   - onlyVerified: nur Provider mit email_check_status='valid' (Default: true)
 *   - country: Optional ISO-2 Code um nur ein Land zu synchronisieren
 *   - dryRun: Trockenlauf — listet nur was synchronisiert WUERDE
 */
app.post('/api/cleverreach-sync', async (req, res) => {
    const {
        limit = 100,
        dryRun = false,
        onlyVerified = true,
        country = null,
        groupMode = 'country',   // 'country' (alt) oder 'language' (12 Sprach-Gruppen)
    } = req.body || {};

    if (!CONFIG.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY fehlt.' });
    }

    // ── NEU: Sprach-Modus — 6 Provider + 6 Shop Gruppen ──
    if (groupMode === 'language') {
        try {
            const providers = await loadAllProvidersForLanguageSync({ onlyVerified, includeSynced: true });
            console.log(`\n🌍 CleverReach Sprach-Sync: ${providers.length} Provider, dryRun=${dryRun}`);

            const counts = { synced: 0, skipped: 0, errors: 0 };
            const perGroup = {}; // key: "provider:de" etc.
            const results = [];

            for (const p of providers) {
                const lang = countryToLanguage(p.country);                       // de/en/fr/it/es/nl
                const type = p.shop_check_status === 'online_shop' ? 'shop' : 'provider';
                const key = `${type}:${lang}`;
                const groupId = (CLEVERREACH_CONFIG.LANG_GROUPS[type] || {})[lang] || '';

                perGroup[key] = perGroup[key] || { group: key, type, lang, total: 0, synced: 0, errors: 0, skipped: 0 };
                perGroup[key].total++;

                if (!groupId) {
                    counts.skipped++; perGroup[key].skipped++;
                    continue;
                }
                if (dryRun) {
                    counts.synced++; perGroup[key].synced++;
                    continue;
                }
                try {
                    await cleverreachUpsertReceiver(groupId, p);
                    counts.synced++; perGroup[key].synced++;
                    await persistCleverReachResult(p.id, groupId, 'subscribed', null);
                } catch (err) {
                    counts.errors++; perGroup[key].errors++;
                    await persistCleverReachResult(p.id, null, 'error', err.message.substring(0, 500));
                    results.push({ id: p.id, name: p.name, group: key, status: 'error', error: err.message });
                }
            }

            return res.json({
                success: true,
                groupMode: 'language',
                counts,
                perGroup: Object.values(perGroup).sort((a, b) => b.total - a.total),
                results,
            });
        } catch (err) {
            console.error('CleverReach Sprach-Sync-Error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    try {
        const providers = await loadProvidersForCleverReach({ limit, onlyVerified, country });
        console.log(`\n📧 CleverReach-Sync: ${providers.length} Provider, dryRun=${dryRun}`);

        const results = [];
        const counts = { synced: 0, skipped: 0, errors: 0 };
        const perCountry = {};

        for (const p of providers) {
            const cc = normalizeCountryCode(p.country) || 'DEFAULT';
            const groupId = CLEVERREACH_CONFIG.GROUPS[cc] || CLEVERREACH_CONFIG.GROUPS.DEFAULT;

            perCountry[cc] = perCountry[cc] || { country: cc, total: 0, synced: 0, errors: 0 };
            perCountry[cc].total++;

            if (!groupId) {
                counts.skipped++;
                results.push({ id: p.id, name: p.name, country: cc, status: 'no_group', note: `Keine Group-ID fuer ${cc}` });
                continue;
            }

            if (dryRun) {
                counts.synced++;
                perCountry[cc].synced++;
                results.push({ id: p.id, name: p.name, country: cc, status: 'dry_run', groupId });
                continue;
            }

            try {
                await cleverreachUpsertReceiver(groupId, p);
                counts.synced++;
                perCountry[cc].synced++;
                await persistCleverReachResult(p.id, groupId, 'subscribed', null);
                results.push({ id: p.id, name: p.name, country: cc, status: 'subscribed', groupId });
            } catch (err) {
                counts.errors++;
                perCountry[cc].errors++;
                await persistCleverReachResult(p.id, null, 'error', err.message.substring(0, 500));
                results.push({ id: p.id, name: p.name, country: cc, status: 'error', error: err.message });
            }
        }

        res.json({
            success: true,
            counts,
            perCountry: Object.values(perCountry).sort((a, b) => b.total - a.total),
            results,
        });
    } catch (err) {
        console.error('CleverReach-Sync-Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Statistik-Endpoint: zeigt wie viele Provider pro Land synchronisiert
 * wurden / synchronisiert werden koennten.
 */
app.get('/api/cleverreach-stats', async (req, res) => {
    if (!CONFIG.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY fehlt.' });
    }
    try {
        // Aggregation in JS. WICHTIG: PostgREST deckelt jede Antwort (häufig
        // auf 1000 Zeilen), egal welches limit gesetzt ist. Wir paginieren
        // deshalb mit Range-Header in 1000er-Seiten, bis alles geladen ist —
        // sonst zeigt die Tabelle nur ~1000 von tausenden Providern.
        const fetchPage = (offset, pageSize) => new Promise((resolve, reject) => {
            const path = `/rest/v1/service_providers?select=country,email,email_check_status,cleverreach_synced_at,cleverreach_status&email=not.is.null&email=neq.&order=id.asc`;
            const u = new URL(CONFIG.SUPABASE_URL);
            https.get({
                hostname: u.hostname, path,
                headers: {
                    apikey: CONFIG.SUPABASE_SERVICE_KEY,
                    Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
                    Range: `${offset}-${offset + pageSize - 1}`,
                    'Range-Unit': 'items',
                }
            }, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
            }).on('error', reject);
        });

        const PAGE = 1000;
        let list = [];
        for (let offset = 0; ; offset += PAGE) {
            const page = await fetchPage(offset, PAGE);
            if (!Array.isArray(page)) throw new Error('Supabase: ' + JSON.stringify(page).substring(0, 200));
            list = list.concat(page);
            if (page.length < PAGE) break;
        }

        const stats = {};
        for (const p of list) {
            const cc = normalizeCountryCode(p.country) || '??';
            if (!stats[cc]) stats[cc] = { country: cc, totalWithMail: 0, verified: 0, synced: 0, groupConfigured: false };
            stats[cc].totalWithMail++;
            if (p.email_check_status === 'valid') stats[cc].verified++;
            if (p.cleverreach_synced_at) stats[cc].synced++;
        }
        // Markieren welche Laender eine konfigurierte Group haben
        for (const cc of Object.keys(stats)) {
            stats[cc].groupConfigured = !!(CLEVERREACH_CONFIG.GROUPS[cc] || CLEVERREACH_CONFIG.GROUPS.DEFAULT);
        }
        res.json({
            success: true,
            perCountry: Object.values(stats).sort((a, b) => b.totalWithMail - a.totalWithMail),
            configured: {
                hasCredentials: !!(CLEVERREACH_CONFIG.CLIENT_ID && CLEVERREACH_CONFIG.CLIENT_SECRET),
                groups: Object.fromEntries(
                    Object.entries(CLEVERREACH_CONFIG.GROUPS)
                          .filter(([_, v]) => !!v)
                          .map(([k]) => [k, true])
                ),
                langGroups: {
                    provider: Object.fromEntries(Object.entries(CLEVERREACH_CONFIG.LANG_GROUPS.provider).map(([k, v]) => [k, !!v])),
                    shop:     Object.fromEntries(Object.entries(CLEVERREACH_CONFIG.LANG_GROUPS.shop).map(([k, v]) => [k, !!v])),
                },
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Lädt ALLE (paginiert) Provider mit E-Mail für den Sprach-Sync —
 * inkl. shop_check_status, um Provider vs. Shop zu trennen.
 * onlyVerified: nur email_check_status='valid'.
 * includeSynced: auch bereits synchronisierte erneut pushen (Upsert ist idempotent).
 */
async function loadAllProvidersForLanguageSync({ onlyVerified = true, includeSynced = true } = {}) {
    let filter = 'email=not.is.null&email=neq.';
    if (onlyVerified) filter += '&email_check_status=eq.valid';
    if (!includeSynced) filter += '&cleverreach_synced_at=is.null';

    const fetchPage = (offset, pageSize) => new Promise((resolve, reject) => {
        const u = new URL(CONFIG.SUPABASE_URL);
        const path = `/rest/v1/service_providers?select=id,name,email,city,country,category,website,shop_check_status&${filter}&order=id.asc`;
        https.get({
            hostname: u.hostname, path,
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
                Range: `${offset}-${offset + pageSize - 1}`,
                'Range-Unit': 'items',
            }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });

    const PAGE = 1000;
    let all = [];
    for (let offset = 0; ; offset += PAGE) {
        const page = await fetchPage(offset, PAGE);
        if (!Array.isArray(page)) throw new Error('Supabase: ' + JSON.stringify(page).substring(0, 200));
        all = all.concat(page);
        if (page.length < PAGE) break;
    }
    return all;
}

async function loadProvidersForCleverReach({ limit, onlyVerified, country }) {
    // Wir filtern den Country-Filter NICHT direkt in der DB-Query, weil
    // die DB gemischte Schreibweisen hat ("DE" / "Deutschland" / "Germany").
    // Stattdessen laden wir mit grosszuegigem Limit und filtern in JS
    // ueber normalizeCountryCode, sodass alle Varianten gemappt werden.
    let filterClause = '&email=not.is.null&email=neq.';
    if (onlyVerified) {
        filterClause += '&email_check_status=eq.valid';
    }
    filterClause += '&cleverreach_synced_at=is.null';

    // Wenn ein Country-Filter gesetzt ist, holen wir mehr Daten und
    // filtern nach normalisierung — sonst koennten wir die DE-Provider
    // verpassen die als "Deutschland" gespeichert sind.
    const dbLimit = country ? Math.max(limit * 5, 500) : limit;
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers?select=id,name,email,city,country,category,website&${filterClause.substring(1)}&order=country&limit=${dbLimit}`;

    const raw = await new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
            }
        }, (res) => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const arr = JSON.parse(d);
                    if (Array.isArray(arr)) resolve(arr);
                    else reject(new Error('Supabase: ' + d.substring(0, 200)));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
    });

    if (!country) return raw.slice(0, limit);

    // Country-Filter nach Normalisierung anwenden
    const wantCC = country.toUpperCase();
    return raw
        .filter(p => normalizeCountryCode(p.country) === wantCC)
        .slice(0, limit);
}

async function persistCleverReachResult(providerId, groupId, status, errorNote) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers?id=eq.${encodeURIComponent(providerId)}`;
    const payload = JSON.stringify({
        cleverreach_synced_at: status === 'subscribed' ? new Date().toISOString() : null,
        cleverreach_group_id: groupId,
        cleverreach_status: status,
    });

    await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'PATCH',
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                Prefer: 'return=minimal',
            }
        }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve();
            else {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${d}`)));
            }
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

// ============================================================
// EMAIL-VERIFIZIERUNG
// ============================================================
//
// Prueft regelmaessig ob hinterlegte Provider-E-Mails noch real sind.
// Statt eines SMTP-Probes (port 25 outbound ist auf Fly/Render eh
// gesperrt) machen wir zwei kostenlose, zuverlaessige Checks:
//
//  1. MX-Lookup via Cloudflare DNS-over-HTTPS:
//     Hat die Domain ueberhaupt einen Mail-Server?
//     → Nein: Domain ist tot, Adresse mit Sicherheit invalid
//
//  2. Website-Recheck:
//     Erscheint die E-Mail noch auf der aktuellen Website (Homepage
//     + Impressum + Kontakt + Sitemap)?
//     → Ja: Adresse ist mit hoher Wahrscheinlichkeit aktuell
//     → Nein: Adresse ist verdaechtig (vielleicht entfernt/geaendert)
//
// Kombiniert ergibt das einen sinnvollen Status:
//   - valid       — MX OK + auf Website gefunden  → grueneste Ampel
//   - mx_only     — MX OK, nicht auf Website      → gelb
//   - not_on_site — MX OK, aber Site existiert    → gelb-orange
//                   und Mail nicht mehr drin
//   - domain_dead — kein MX-Record                → rot
//   - website_dead— Website unerreichbar           → unklar

/**
 * MX-Record-Check via Cloudflare DoH (kostenlos, kein API-Key).
 */
const _verifyMxCache = new Map();
async function checkDomainMx(domain) {
    if (!domain) return false;
    if (_verifyMxCache.has(domain)) return _verifyMxCache.get(domain);
    try {
        const result = await new Promise((resolve, reject) => {
            const req = https.get(
                `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
                { headers: { Accept: 'application/dns-json' } },
                (res) => {
                    let data = '';
                    res.on('data', c => data += c);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); }
                        catch { reject(new Error('DoH parse error')); }
                    });
                }
            );
            req.on('error', reject);
            req.setTimeout(5000, () => { req.destroy(); reject(new Error('DoH timeout')); });
        });
        const hasMx = Array.isArray(result?.Answer) && result.Answer.length > 0;
        _verifyMxCache.set(domain, hasMx);
        return hasMx;
    } catch {
        // Im Zweifel "true" liefern, damit kein false-positive entsteht
        _verifyMxCache.set(domain, true);
        return true;
    }
}

/**
 * Verifiziert eine einzelne E-Mail-Adresse.
 *
 * @param {string} email
 * @param {string|null} website Optional die Website des Providers,
 *        um zu pruefen ob die Mail dort noch erscheint.
 * @returns {Promise<{status, mxOk, foundOnSite, note}>}
 */
async function verifyEmail(email, website = null) {
    const result = {
        status: 'unverified',
        mxOk: null,
        foundOnSite: null,
        note: '',
    };

    if (!email || !email.includes('@')) {
        result.status = 'unverified';
        result.note = 'Keine E-Mail-Adresse angegeben';
        return result;
    }

    const domain = email.split('@')[1].toLowerCase().trim();

    // 1. MX-Check
    try {
        result.mxOk = await checkDomainMx(domain);
    } catch (e) {
        result.mxOk = null;
    }

    if (result.mxOk === false) {
        result.status = 'domain_dead';
        result.note = `Domain ${domain} hat keinen MX-Record — kann keine Mails empfangen`;
        return result;
    }

    // 2. Website-Recheck (nur wenn Website bekannt)
    if (website) {
        try {
            const html = await fetchWebpage(website);
            const emailsOnSite = extractEmailFromHtml(html).map(e => e.toLowerCase());
            result.foundOnSite = emailsOnSite.includes(email.toLowerCase());

            if (result.foundOnSite) {
                result.status = 'valid';
                result.note = `Auf ${website} gefunden, Domain hat MX`;
                return result;
            }

            // Mail nicht direkt auf Homepage — vielleicht im Impressum?
            // Wir versuchen ein paar Subpages, aber ohne grossen Aufwand.
            const subpages = ['/impressum', '/kontakt', '/contact', '/imprint', '/legal'];
            const baseUrl = website.replace(/\/+$/, '');
            for (const sub of subpages) {
                try {
                    const subHtml = await fetchWebpage(baseUrl + sub);
                    const subEmails = extractEmailFromHtml(subHtml).map(e => e.toLowerCase());
                    if (subEmails.includes(email.toLowerCase())) {
                        result.foundOnSite = true;
                        result.status = 'valid';
                        result.note = `Auf ${baseUrl}${sub} gefunden, Domain hat MX`;
                        return result;
                    }
                } catch { /* sub-page nicht erreichbar */ }
            }

            // Weder Homepage noch Sub-Pages haben die Mail
            result.status = 'not_on_site';
            result.note = `Domain hat MX, aber E-Mail nicht (mehr) auf der Website gefunden`;
            return result;
        } catch (err) {
            // Website nicht erreichbar
            result.status = 'website_dead';
            result.note = `Website ${website} nicht erreichbar: ${err.message}. Domain hat MX.`;
            return result;
        }
    }

    // Nur MX-Check moeglich (keine Website hinterlegt)
    result.status = 'mx_only';
    result.note = `Domain ${domain} hat MX-Record. Website-Check nicht moeglich (keine Website hinterlegt).`;
    return result;
}

/**
 * POST /api/verify-email
 * Body: { email, website?, providerId? }
 *
 * Wenn providerId angegeben, wird das Ergebnis in der DB persistiert.
 */
app.post('/api/verify-email', async (req, res) => {
    const { email, website, providerId } = req.body || {};
    if (!email) {
        return res.status(400).json({ error: 'email required' });
    }

    const result = await verifyEmail(email, website);

    if (providerId && CONFIG.SUPABASE_SERVICE_KEY) {
        try {
            await persistVerificationResult(providerId, result);
        } catch (e) {
            console.warn('Persist fehlgeschlagen:', e.message);
        }
    }

    res.json({ success: true, email, ...result });
});

/**
 * POST /api/verify-emails-batch
 * Body: { filter, limit, providerIds? }
 *
 * filter:
 *   - 'never_checked'  — Provider die noch nie geprueft wurden (default)
 *   - 'older_than_30d' — Provider mit Check aelter als 30 Tage
 *   - 'older_than_90d' — Provider mit Check aelter als 90 Tage
 *   - 'invalid_only'   — nur Provider mit Problem-Status
 *   - 'all'            — alle die eine E-Mail haben
 */
app.post('/api/verify-emails-batch', async (req, res) => {
    const { filter = 'never_checked', limit = 25, providerIds = null } = req.body || {};

    if (!CONFIG.SUPABASE_SERVICE_KEY) {
        return res.status(500).json({
            error: 'SUPABASE_SERVICE_KEY ist nicht konfiguriert'
        });
    }

    try {
        const providers = await loadProvidersForCheck(filter, limit, providerIds);

        console.log(`\n📧 Email-Verify: ${providers.length} Provider, filter=${filter}`);

        const results = [];
        let counts = { valid: 0, mx_only: 0, not_on_site: 0, domain_dead: 0, website_dead: 0 };

        for (const p of providers) {
            const r = await verifyEmail(p.email, p.website);
            counts[r.status] = (counts[r.status] || 0) + 1;
            try {
                await persistVerificationResult(p.id, r);
            } catch (e) {
                console.warn(`Persist fuer ${p.id} fehlgeschlagen:`, e.message);
            }
            results.push({
                id: p.id,
                name: p.name,
                email: p.email,
                website: p.website,
                ...r,
            });
            console.log(`  ${r.status === 'valid' ? '✅' : r.status === 'domain_dead' ? '❌' : '⚠️'} ${p.name} → ${r.status}`);
        }

        res.json({ success: true, totalChecked: providers.length, counts, results });
    } catch (err) {
        console.error('Batch-Verify-Error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Laedt Provider die geprueft werden sollen.
 */
async function loadProvidersForCheck(filter, limit, providerIds) {
    const base = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers`;
    const select = 'id,name,email,website,last_email_check_at,email_check_status';

    let url;
    if (providerIds && Array.isArray(providerIds) && providerIds.length > 0) {
        const ids = providerIds.map(i => `"${i}"`).join(',');
        url = `${base}?select=${select}&id=in.(${ids})&limit=${limit}`;
    } else {
        let filterClause = '&email=not.is.null&email=neq.';
        const now = new Date();
        switch (filter) {
            case 'never_checked':
                filterClause += `&last_email_check_at=is.null`;
                break;
            case 'older_than_30d':
                {
                    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    filterClause += `&or=(last_email_check_at.is.null,last_email_check_at.lt.${d})`;
                }
                break;
            case 'older_than_90d':
                {
                    const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
                    filterClause += `&or=(last_email_check_at.is.null,last_email_check_at.lt.${d})`;
                }
                break;
            case 'invalid_only':
                filterClause += `&email_check_status=in.(domain_dead,not_on_site,website_dead)`;
                break;
            case 'all':
            default:
                break;
        }
        url = `${base}?select=${select}${filterClause}&order=last_email_check_at.asc.nullsfirst&limit=${limit}`;
    }

    const r = await new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
                Prefer: 'count=exact',
            }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Supabase parse: ' + e.message)); }
            });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Supabase timeout')); });
    });
    if (!Array.isArray(r)) {
        throw new Error('Supabase Response: ' + JSON.stringify(r).substring(0, 200));
    }
    return r.filter(p => p.email && p.email.includes('@'));
}

/**
 * Persistiert das Ergebnis einer Verifizierung in der DB.
 */
async function persistVerificationResult(providerId, result) {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/service_providers?id=eq.${encodeURIComponent(providerId)}`;
    const payload = JSON.stringify({
        last_email_check_at: new Date().toISOString(),
        email_check_status: result.status,
        email_check_note: result.note ? result.note.substring(0, 500) : null,
    });

    await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'PATCH',
            headers: {
                apikey: CONFIG.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${CONFIG.SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                Prefer: 'return=minimal',
            }
        }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve();
            else {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${data}`)));
            }
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Skipily Places Scraper v4.0 läuft auf Port ${PORT}`);
    console.log(`\n📡 Endpoints:`);
    console.log(`   POST /api/scrape             - Einen Ort scrapen`);
    console.log(`   POST /api/scrape-multiple     - Mehrere Orte nacheinander`);
    console.log(`   POST /api/import              - Manuelle Liste importieren`);
    console.log(`   GET  /api/categories          - Verfügbare Kategorien`);
    console.log(`   POST /api/verify-email        - E-Mail-Adresse pruefen`);
    console.log(`   POST /api/verify-emails-batch - Mehrere E-Mails pruefen`);
    console.log(`   GET  /health                  - Status`);
    console.log(`\n🗝️  Google Places API: ${CONFIG.GOOGLE_PLACES_API_KEY ? '✅ Konfiguriert' : '❌ Fehlt!'}`);
    console.log(`🗄️  Supabase URL: ${CONFIG.SUPABASE_URL}`);
    console.log(`\n💡 Beispiel:`);
    console.log(`   curl -X POST http://localhost:${PORT}/api/scrape \\`);
    console.log(`     -H "Content-Type: application/json" \\`);
    console.log(`     -d '{"location":"Cap d\\'Agde, France","radiusKm":20,"autoImport":true}'`);
});
