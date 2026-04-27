// BoatCare Admin Panel - Main Application

var supabaseClient;
let currentUser = null;

// Kategorien aus der App (MapScreen.swift) - ERWEITERT und angeglichen an Backend
const PROVIDER_CATEGORIES = [
    { value: 'Alle', label: 'Alle' },
    { value: 'Werkstatt', label: 'Werkstatt' },
    { value: 'Motorservice', label: 'Motorservice' },
    { value: 'Zubehör', label: 'Zubehör' },
    { value: 'Segelmacher', label: 'Segelmacher' },
    { value: 'Rigg', label: 'Rigg' },
    { value: 'Instrumente', label: 'Instrumente' },
    { value: 'Marina', label: 'Marina' },
    { value: 'Winterlager', label: 'Winterlager' },
    { value: 'Lackiererei', label: 'Lackiererei' },
    { value: 'Bootsbauer', label: 'Bootsbauer' },
    { value: 'Gutachter', label: 'Gutachter' },
    { value: 'Kran', label: 'Kran / Travel Lift' },
    { value: 'Heizung/Klima', label: 'Heizung/Klima' },
    { value: 'Sonstige', label: 'Sonstige' }
];

// Mapping: Backend-Kategorie (englisch) → Frontend-Kategorie (deutsch)
const BACKEND_TO_FRONTEND_CATEGORY = {
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

// Kategorie-Icons (Emoji-Fallback wenn kein Logo/Cover-Bild vorhanden)
const CATEGORY_ICONS = {
    'Werkstatt':      '🔧',
    'Motorservice':   '⚙️',
    'Zubehör':        '🛒',
    'Segelmacher':    '⛵',
    'Rigg':           '🔗',
    'Instrumente':    '📡',
    'Bootsbauer':     '🚢',
    'Gutachter':      '🔍',
    'Kran':           '🏗️',
    'Lackiererei':    '🎨',
    'Heizung/Klima':  '🌡️',
    'Marina':         '⚓',
    'Winterlager':    '❄️',
    'Sonstige':       '🏢',
};

function getCategoryIcon(category) {
    return CATEGORY_ICONS[category] || '🏢';
}

// Google Search Scraping Konfiguration
const USE_GOOGLE_SEARCH_FALLBACK = true; // Feature-Flag
// Scraper-Backend: lokal auf 3001, produktiv auf Railway.
// Override per window.SCRAPER_BACKEND_URL in config.js möglich.
const GOOGLE_SCRAPER_BACKEND_URL =
    (typeof window !== 'undefined' && window.SCRAPER_BACKEND_URL)
        ? window.SCRAPER_BACKEND_URL
        : (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
            ? 'http://localhost:3001'
            : 'https://boatcare-production.up.railway.app';

// App-Kategorien (entspricht Localizable.strings — ohne Marina)
// Der Scraper sucht automatisch alle Kategorien pro Ort
const APP_SERVICE_CATEGORIES = [
    { key: 'repair',          label: 'Workshop / Repair' },
    { key: 'motor_service',   label: 'Motor Service' },
    { key: 'marine supplies', label: 'Marine Supplies' },
    { key: 'sailmaker',       label: 'Sailmaker' },
    { key: 'rigging',         label: 'Rigging' },
    { key: 'instruments',     label: 'Marine Electronics' },
    { key: 'yard',            label: 'Yard / Boat Builder' },
    { key: 'surveyor',        label: 'Surveyor' },
    { key: 'crane',           label: 'Crane / Travel Lift' },
    { key: 'painting',        label: 'Painting / Antifouling' },
    { key: 'heating_climate', label: 'Heizung / Klimatechnik' }
];

// Initialisierung
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Admin Panel wird initialisiert...');
    console.log('📡 Supabase URL:', SUPABASE_CONFIG.url);
    console.log('📄 DOM Content Loaded Event gefeuert');

    try {
        // Warte einen Moment damit DOM sicher geladen ist
        await new Promise(resolve => setTimeout(resolve, 100));

        // Supabase initialisieren
        const { createClient } = window.supabase;
        supabaseClient = createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey
        );
        console.log('✅ Supabase Client erstellt');

        // Auth Check
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (sessionError) {
            console.error('❌ Session Fehler:', sessionError);
            showLogin();
            return;
        }

        if (!session) {
            console.log('ℹ️ Keine aktive Session - zeige Login');
            showLogin();
            return;
        }

        console.log('✅ Session gefunden:', session.user.email);
        currentUser = session.user;

        await checkAdminRole();

        // Warte nochmal kurz vor initApp
        await new Promise(resolve => setTimeout(resolve, 100));

        initApp();
    } catch (error) {
        console.error('❌ Initialisierungs-Fehler:', error);
        alert('Fehler beim Laden der App: ' + error.message);
    }
});

// Admin-Rolle prüfen
async function checkAdminRole() {
    console.log('🔐 Prüfe Admin-Rolle für User:', currentUser.id);

    try {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('role, email, full_name')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            console.error('❌ Fehler beim Laden des Profils:', error);
            throw error;
        }

        console.log('👤 Profil geladen:', profile);

        if (!profile || (profile.role !== 'admin' && profile.role !== 'admin_readonly')) {
            console.warn('⚠️ Keine Admin-Berechtigung:', profile);
            alert('Sie haben keine Admin-Berechtigung!\nRolle: ' + (profile?.role || 'keine'));
            await supabaseClient.auth.signOut();
            window.location.reload();
            return;
        }

        // Rolle global merken; UI nutzt das, um Schreibaktionen für admin_readonly auszublenden.
        window.currentAdminRole = profile.role;
        document.body.dataset.adminRole = profile.role;
        if (profile.role === 'admin_readonly') {
            console.log('👁️ Read-only Admin – Schreibaktionen sind deaktiviert');
        }

        console.log('✅ Admin-Berechtigung bestätigt:', profile.role);
    } catch (error) {
        console.error('❌ Fehler bei Admin-Check:', error);
        alert('Fehler beim Prüfen der Berechtigung: ' + error.message);
        await supabaseClient.auth.signOut();
        window.location.reload();
    }
}

// App initialisieren
function initApp() {
    console.log('🎯 initApp() wird ausgeführt...');

    // Prüfe ob DOM-Elemente vorhanden sind
    const navItems = document.querySelectorAll('.nav-item');
    console.log('Gefundene Navigation Items:', navItems.length);

    const logoutBtn = document.getElementById('logout-btn');
    console.log('Logout Button gefunden:', !!logoutBtn);

    if (navItems.length === 0) {
        console.error('❌ Keine Navigation Items gefunden! HTML möglicherweise nicht geladen.');
        return;
    }

    try {
        setupNavigation();
        setupEventListeners();
        loadDashboard();
        console.log('✅ App vollständig initialisiert');
    } catch (error) {
        console.error('❌ Fehler beim Initialisieren der App:', error);
        alert('Fehler beim Initialisieren: ' + error.message);
    }
}

// Navigation Setup
function setupNavigation() {
    console.log('🧭 Setup Navigation...');
    const navItems = document.querySelectorAll('.nav-item');

    if (navItems.length === 0) {
        console.error('❌ Keine nav-items gefunden!');
        throw new Error('Keine Navigation-Elemente gefunden');
    }

    console.log(`Binde Event Listener für ${navItems.length} Navigation Items...`);

    navItems.forEach((item, index) => {
        const page = item.dataset.page;
        console.log(`  [${index}] Binde Listener für: ${page}`);

        item.addEventListener('click', () => {
            console.log(`🖱️ Navigation geklickt: ${page}`);
            try {
                navigateToPage(page);
            } catch (error) {
                console.error(`❌ Fehler beim Navigieren zu ${page}:`, error);
            }
        });
    });

    console.log('✅ Navigation Setup abgeschlossen');
}

function navigateToPage(pageName) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    // Show page
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`${pageName}-page`).classList.add('active');

    // Load page data
    switch(pageName) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'new-providers':
            loadNewProviders();
            // Scraping-Ergebnisse erhalten und anzeigen (falls vorhanden)
            if (scrapingTableData && scrapingTableData.length > 0) {
                const scrapingSection = document.getElementById('scraping-results-section');
                if (scrapingSection) scrapingSection.style.display = 'block';
                renderScrapingTable();
            }
            break;
        case 'suggestions':
            loadSuggestions();
            break;
        case 'providers':
            loadProviders();
            break;
        case 'search-automation':
            checkScraperStatus();
            break;
        case 'update-search':
            checkScraperStatus();
            break;
        case 'map':
            loadMapPage();
            break;
        case 'reviews':
            loadReviews();
            break;
        case 'shop-management':
            loadShopManagement();
            break;
        case 'payments':
            loadPayments();
            break;
        case 'admin-orders':
            loadAdminOrders();
            break;
        case 'admin-promotions':
            loadAdminPromotions();
            break;
        case 'api-monitoring':
            loadApiMonitoring();
            break;
    }
}

// Event Listeners
function setupEventListeners() {
    console.log('🎧 Setup Event Listeners...');

    try {
        // Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                console.log('🚪 Logout geklickt');
                await supabaseClient.auth.signOut();
                window.location.reload();
            });
            console.log('  ✅ Logout Button');
        } else {
            console.warn('  ⚠️ Logout Button nicht gefunden');
        }

        // Provider Form
        const addProviderForm = document.getElementById('add-provider-form');
        if (addProviderForm) {
            addProviderForm.addEventListener('submit', handleAddProvider);
            console.log('  ✅ Add Provider Form');
        }

        const geocodeBtn = document.getElementById('geocode-btn');
        if (geocodeBtn) {
            geocodeBtn.addEventListener('click', geocodeAddress);
            console.log('  ✅ Geocode Button');
        }

        // Provider Search
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', searchProviders);
            console.log('  ✅ Search Button');
        }

        const providerSearch = document.getElementById('provider-search');
        if (providerSearch) {
            providerSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchProviders();
            });
            console.log('  ✅ Provider Search Input');
        }

        // Suggestion Filters
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                console.log('🔽 Filter geklickt:', this.dataset.filter);
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                loadSuggestions(this.dataset.filter);
            });
        });
        console.log(`  ✅ ${filterBtns.length} Filter Buttons`);

        // Auto Search
        const startSearchBtn = document.getElementById('start-search-btn');
        if (startSearchBtn) {
            startSearchBtn.addEventListener('click', startAutoSearch);
            console.log('  ✅ Start Search Button');
        }

        // Marina-zentrierte Suche Checkbox
        const marinaCenteredCheckbox = document.getElementById('marina-centered-search');
        if (marinaCenteredCheckbox) {
            marinaCenteredCheckbox.addEventListener('change', function() {
                console.log('⚓ Marina-zentrierte Suche geändert:', this.checked);
                // Wenn Ergebnisse vorhanden sind, neu anzeigen
                if (scrapingResults && scrapingResults.length > 0) {
                    displaySearchResults(scrapingResults);
                }
            });
            console.log('  ✅ Marina-zentrierte Suche Checkbox');
        }

        // Modal Close
        const closeBtns = document.querySelectorAll('.close');
        closeBtns.forEach(closeBtn => {
            closeBtn.addEventListener('click', () => {
                closeBtn.closest('.modal').classList.remove('active');
            });
        });
        console.log(`  ✅ ${closeBtns.length} Modal Close Buttons`);

        console.log('✅ Event Listeners Setup abgeschlossen');

    } catch (error) {
        console.error('❌ Fehler beim Setup Event Listeners:', error);
        throw error;
    }
}

// ============================================
// DASHBOARD
// ============================================

async function loadDashboard() {
    console.log('📊 Lade Dashboard...');

    try {
        // Lade Statistics
        console.log('📈 Lade Statistiken...');

        const [providers, suggestions, approvedToday, newProviders] = await Promise.all([
            supabaseClient.from('service_providers').select('id', { count: 'exact', head: true }),
            supabaseClient.from('provider_edit_suggestions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
            supabaseClient.from('provider_edit_suggestions').select('id', { count: 'exact', head: true })
                .eq('status', 'approved')
                .gte('reviewed_at', new Date().toISOString().split('T')[0]),
            supabaseClient.from('service_providers').select('id', { count: 'exact', head: true })
                .not('user_id', 'is', null)   // Nur User-Einreichungen
        ]);

        console.log('✅ Statistiken geladen:', {
            providers: providers.count,
            suggestions: suggestions.count,
            approvedToday: approvedToday.count,
            newProviders: newProviders.count
        });

        // Fehlerprüfung
        if (providers.error) console.error('Providers Error:', providers.error);
        if (suggestions.error) console.error('Suggestions Error:', suggestions.error);
        if (approvedToday.error) console.error('ApprovedToday Error:', approvedToday.error);
        if (newProviders.error) console.error('NewProviders Error:', newProviders.error);

        document.getElementById('total-providers').textContent = providers.count || 0;
        document.getElementById('pending-suggestions').textContent = suggestions.count || 0;
        document.getElementById('suggestions-badge').textContent = suggestions.count || 0;
        document.getElementById('approved-today').textContent = approvedToday.count || 0;

        const newCount = newProviders.count || 0;
        document.getElementById('new-providers-count').textContent = newCount;
        document.getElementById('new-providers-badge').textContent = newCount;

        // Lade letzte Aktivitäten
        await loadRecentActivity();
    } catch (error) {
        console.error('❌ Dashboard Fehler:', error);
        alert('Fehler beim Laden des Dashboards: ' + error.message);
    }
}

// ============================================
// NEUE BETRIEBE (von Nutzern eingereicht: user_id IS NOT NULL)
// ============================================

async function loadNewProviders() {
    console.log('🆕 Lade neu eingereichte Betriebe (user_id IS NOT NULL)...');

    // Scraping-Ergebnisse erhalten (falls vorhanden) — NICHT zurücksetzen
    if (scrapingTableData && scrapingTableData.length > 0) {
        const scrapingSection = document.getElementById('scraping-results-section');
        if (scrapingSection) {
            scrapingSection.style.display = 'block';
            console.log(`📋 ${scrapingTableData.length} Scraping-Ergebnisse bleiben sichtbar`);
        }
    }

    const container = document.getElementById('new-providers-list');
    if (!container) return;
    container.innerHTML = '<p>Wird geladen...</p>';

    try {
        // NUR User-Einreichungen: user_id IS NOT NULL
        // Admin-importierte Provider haben user_id = NULL
        const { data, error } = await supabaseClient
            .from('service_providers')
            .select('id, name, category, street, city, phone, email, website, latitude, longitude, brands, description, user_id, created_at')
            .not('user_id', 'is', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Badge aktualisieren
        const newCount = data ? data.length : 0;
        const badge = document.getElementById('new-providers-badge');
        const countEl = document.getElementById('new-providers-count');
        if (badge) badge.textContent = newCount;
        if (countEl) countEl.textContent = newCount;

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color:#6b7280;">Keine ausstehenden Einreichungen von Nutzern.</p>';
            return;
        }

        console.log(`✅ ${data.length} eingereichte Betriebe gefunden`);

        let html = '';
        for (const p of data) {
            const createdAt = p.created_at ? new Date(p.created_at).toLocaleDateString('de-DE') : '–';
            html += `
            <div class="suggestion-card" style="margin-bottom:16px; padding:20px; background:white; border-radius:8px; border:2px solid #f59e0b;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                    <h3 style="margin:0;">${p.name || '–'}</h3>
                    <span style="font-size:12px; color:#9ca3af;">Eingereicht: ${createdAt}</span>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:14px; margin-bottom:16px;">
                    <div>📂 <strong>Kategorie:</strong> ${[p.category, p.category2, p.category3].filter(Boolean).join(', ') || '–'}</div>
                    <div>📍 <strong>Adresse:</strong> ${p.street || '–'}</div>
                    <div>🌍 <strong>Stadt:</strong> ${p.city || '–'}</div>
                    <div>📞 <strong>Telefon:</strong> ${p.phone || '–'}</div>
                    <div>✉️ <strong>E-Mail:</strong> ${p.email || '–'}</div>
                    <div>🌐 <strong>Website:</strong> ${p.website ? `<a href="${p.website}" target="_blank">${p.website}</a>` : '–'}</div>
                    <div>🗺️ <strong>Koordinaten:</strong> ${p.latitude?.toFixed(5)}, ${p.longitude?.toFixed(5)}</div>
                    <div>🏷️ <strong>Marken:</strong> ${p.brands ? p.brands.join(', ') : '–'}</div>
                </div>
                ${p.description ? `<p style="margin:0 0 16px 0; color:#374151;">${p.description}</p>` : ''}
                <div style="display:flex; gap:10px;">
                    <button class="btn-primary" onclick="approveNewProvider('${p.id}')">✅ Genehmigen</button>
                    <button class="btn-secondary" style="background:#ef4444; color:white;" onclick="rejectNewProvider('${p.id}')">❌ Ablehnen & Löschen</button>
                </div>
            </div>`;
        }
        container.innerHTML = html;
    } catch (error) {
        console.error('❌ Fehler beim Laden neuer Betriebe:', error);
        container.innerHTML = `<p style="color:red;">Fehler: ${error.message}</p>`;
    }
}

async function approveNewProvider(providerId) {
    if (!confirm('Betrieb genehmigen? Er bleibt auf der Karte sichtbar und verschwindet aus dieser Liste.')) return;
    try {
        // user_id auf null setzen → verschwindet aus "Neue Betriebe"-Liste, bleibt auf Karte
        const { error } = await supabaseClient
            .from('service_providers')
            .update({ user_id: null })
            .eq('id', providerId);
        if (error) throw error;
        console.log(`✅ Betrieb ${providerId} genehmigt`);
        await loadNewProviders();
        await loadDashboard();
    } catch (error) {
        console.error('❌ Fehler beim Genehmigen:', error);
        alert('Fehler: ' + error.message);
    }
}

async function rejectNewProvider(providerId) {
    if (!confirm('Diesen Betrieb ablehnen und dauerhaft löschen?')) return;
    try {
        const { error } = await supabaseClient
            .from('service_providers')
            .delete()
            .eq('id', providerId);
        if (error) throw error;
        console.log(`🗑️ Betrieb ${providerId} abgelehnt und gelöscht`);
        await loadNewProviders();
        await loadDashboard();
    } catch (error) {
        console.error('❌ Fehler beim Löschen:', error);
        alert('Fehler: ' + error.message);
    }
}

// ============================================

async function loadRecentActivity() {
    const { data: activities } = await supabaseClient
        .from('provider_edit_suggestions')
        .select('*, service_providers(name)')
        .order('created_at', { ascending: false })
        .limit(5);

    const activityList = document.getElementById('recent-activity-list');
    activityList.innerHTML = '';

    if (!activities || activities.length === 0) {
        activityList.innerHTML = '<p>Keine Aktivitäten</p>';
        return;
    }

    activities.forEach(activity => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <div class="activity-time">${formatDate(activity.created_at)}</div>
            <div><strong>${activity.service_providers?.name || 'Unbekannt'}</strong></div>
            <div class="list-item-status status-${activity.status}">${getStatusText(activity.status)}</div>
        `;
        activityList.appendChild(item);
    });
}

// ============================================
// SUGGESTIONS (Änderungsanfragen)
// ============================================

async function loadSuggestions(filter = 'pending') {
    try {
        let query = supabaseClient
            .from('provider_edit_suggestions')
            .select('*, service_providers(name)')
            .order('created_at', { ascending: false });

        if (filter !== 'all') {
            query = query.eq('status', filter);
        }

        const { data: suggestions, error } = await query;

        if (error) throw error;

        displaySuggestions(suggestions);
    } catch (error) {
        console.error('Fehler beim Laden:', error);
        alert('Fehler beim Laden der Vorschläge');
    }
}

function displaySuggestions(suggestions) {
    const list = document.getElementById('suggestions-list');
    list.innerHTML = '';

    if (!suggestions || suggestions.length === 0) {
        list.innerHTML = '<p>Keine Vorschläge gefunden</p>';
        return;
    }

    suggestions.forEach(suggestion => {
        const changes = getChangesDescription(suggestion);
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-header">
                <span class="list-item-title">${suggestion.service_providers?.name || 'Unbekannt'}</span>
                <span class="list-item-status status-${suggestion.status}">${getStatusText(suggestion.status)}</span>
            </div>
            <div class="list-item-content">${changes}</div>
            <div class="list-item-meta">
                <span>📅 ${formatDate(suggestion.created_at)}</span>
            </div>
        `;
        item.addEventListener('click', () => showSuggestionDetails(suggestion));
        list.appendChild(item);
    });
}

function getChangesDescription(suggestion) {
    const changes = [];
    if (suggestion.suggested_name) changes.push('Name');
    if (suggestion.suggested_description) changes.push('Beschreibung');
    if (suggestion.suggested_address || suggestion.suggested_street || suggestion.suggested_city) changes.push('Adresse');
    if (suggestion.suggested_phone || suggestion.suggested_email) changes.push('Kontakt');
    if (suggestion.suggested_category) changes.push('Kategorie');
    if (suggestion.suggested_category2 !== undefined && suggestion.suggested_category2 !== null) changes.push('Kategorie 2');
    if (suggestion.suggested_category3 !== undefined && suggestion.suggested_category3 !== null) changes.push('Kategorie 3');
    if (suggestion.suggested_services) changes.push('Leistungen');
    if (suggestion.suggested_brands) changes.push('Marken');
    if (suggestion.suggested_opening_hours) changes.push('Öffnungszeiten');
    return changes.length ? `Änderungen: ${changes.join(', ')}` : 'Keine Änderungen';
}

// Globale Variable fuer aktuellen Suggestion-Kontext (Edit-Modus)
let currentSuggestionContext = null;

async function showSuggestionDetails(suggestion) {
    const modal = document.getElementById('suggestion-modal');
    const details = document.getElementById('suggestion-details');

    // Lade Provider Details
    const { data: provider } = await supabaseClient
        .from('service_providers')
        .select('*')
        .eq('id', suggestion.provider_id)
        .single();

    // Kontext speichern fuer Edit-Modus
    currentSuggestionContext = { suggestion, provider };

    let html = `
        <h2>Änderungsvorschlag prüfen</h2>
        <h3>${provider?.name || 'Unbekannt'}</h3>
        <div id="suggestion-changes" style="margin: 20px 0;">
    `;

    // Zeige alle Änderungen
    if (suggestion.suggested_name) {
        html += createChangeRow('Name', provider?.name, suggestion.suggested_name);
    }
    if (suggestion.suggested_description) {
        html += createChangeRow('Beschreibung', provider?.description, suggestion.suggested_description);
    }
    if (suggestion.suggested_address) {
        html += createChangeRow('Adresse', provider?.address, suggestion.suggested_address);
    }
    if (suggestion.suggested_city) {
        html += createChangeRow('Stadt', provider?.city, suggestion.suggested_city);
    }
    if (suggestion.suggested_postal_code) {
        html += createChangeRow('PLZ', provider?.postal_code, suggestion.suggested_postal_code);
    }
    if (suggestion.suggested_phone) {
        html += createChangeRow('Telefon', provider?.phone, suggestion.suggested_phone);
    }
    if (suggestion.suggested_email) {
        html += createChangeRow('E-Mail', provider?.email, suggestion.suggested_email);
    }
    if (suggestion.suggested_website) {
        html += createChangeRow('Website', provider?.website, suggestion.suggested_website);
    }
    if (suggestion.suggested_category) {
        html += createChangeRow('Kategorie', provider?.category, suggestion.suggested_category);
    }
    if (suggestion.suggested_category2 !== undefined && suggestion.suggested_category2 !== null) {
        html += createChangeRow('Kategorie 2', provider?.category2 || '', suggestion.suggested_category2 || '— Keine —');
    }
    if (suggestion.suggested_category3 !== undefined && suggestion.suggested_category3 !== null) {
        html += createChangeRow('Kategorie 3', provider?.category3 || '', suggestion.suggested_category3 || '— Keine —');
    }
    if (suggestion.suggested_services) {
        html += createChangeRow('Leistungen', provider?.services?.join(', '), suggestion.suggested_services.join(', '));
    }
    if (suggestion.suggested_brands) {
        html += createChangeRow('Marken', provider?.brands?.join(', '), suggestion.suggested_brands.join(', '));
    }
    if (suggestion.suggested_street) {
        html += createChangeRow('Straße', provider?.street, suggestion.suggested_street);
    }
    if (suggestion.suggested_opening_hours) {
        html += createChangeRow('Öffnungszeiten', provider?.opening_hours, suggestion.suggested_opening_hours);
    }

    html += '</div>';

    if (suggestion.status === 'pending') {
        html += `
            <div class="form-actions" id="suggestion-actions">
                <button class="btn-primary" onclick="approveSuggestion('${suggestion.id}')">✅ Genehmigen</button>
                <button class="btn-secondary" style="background-color: #3b82f6; color: white;"
                        onclick="editSuggestion()">✏️ Bearbeiten</button>
                <button class="btn-secondary" style="background-color: var(--danger-color); color: white;"
                        onclick="rejectSuggestion('${suggestion.id}')">❌ Ablehnen</button>
            </div>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
                <button class="btn-secondary" style="background-color: #991b1b; color: white; font-size: 0.85em;"
                        onclick="deleteProviderFromSuggestion('${suggestion.provider_id}', '${suggestion.id}')">
                    🗑️ Provider komplett löschen
                </button>
            </div>
        `;
    }

    details.innerHTML = html;
    modal.classList.add('active');
}

// Bearbeiten-Modus: Wandelt die Ansicht in editierbare Felder um
function editSuggestion() {
    if (!currentSuggestionContext) return;
    const { suggestion, provider } = currentSuggestionContext;
    const container = document.getElementById('suggestion-changes');

    const fields = [
        { key: 'suggested_name', label: 'Name', old: provider?.name },
        { key: 'suggested_description', label: 'Beschreibung', old: provider?.description, textarea: true },
        { key: 'suggested_street', label: 'Straße', old: provider?.street },
        { key: 'suggested_city', label: 'Stadt', old: provider?.city },
        { key: 'suggested_postal_code', label: 'PLZ', old: provider?.postal_code },
        { key: 'suggested_country', label: 'Land', old: provider?.country },
        { key: 'suggested_phone', label: 'Telefon', old: provider?.phone },
        { key: 'suggested_email', label: 'E-Mail', old: provider?.email },
        { key: 'suggested_website', label: 'Website', old: provider?.website },
        { key: 'suggested_category', label: 'Kategorie (Primär)', old: provider?.category, isCategory: true, required: true },
        { key: 'suggested_category2', label: 'Kategorie 2 (optional)', old: provider?.category2, isCategory: true },
        { key: 'suggested_category3', label: 'Kategorie 3 (optional)', old: provider?.category3, isCategory: true },
        { key: 'suggested_services', label: 'Leistungen', old: provider?.services?.join(', '), isArray: true },
        { key: 'suggested_brands', label: 'Marken', old: provider?.brands?.join(', '), isArray: true },
        { key: 'suggested_opening_hours', label: 'Öffnungszeiten', old: provider?.opening_hours },
    ];

    // Kategorie-Optionen fuer Dropdowns vorbereiten
    const catOptions = PROVIDER_CATEGORIES.filter(c => c.value !== 'Alle');

    let html = '';
    fields.forEach(field => {
        const suggestedValue = field.isArray && suggestion[field.key]
            ? suggestion[field.key].join(', ')
            : (suggestion[field.key] || '');
        const oldValue = field.old || '';
        const hasSuggestion = !!suggestion[field.key];

        let inputHtml;
        if (field.isCategory) {
            // Dropdown fuer Kategorie-Felder
            const opts = field.required
                ? catOptions.map(c => `<option value="${c.value}" ${suggestedValue === c.value ? 'selected' : ''}>${c.label}</option>`).join('')
                : `<option value="">— Keine —</option>` + catOptions.map(c => `<option value="${c.value}" ${suggestedValue === c.value ? 'selected' : ''}>${c.label}</option>`).join('');
            inputHtml = `<select id="edit-${field.key}"
                style="width: 100%; padding: 8px 10px; border: 1.5px solid ${hasSuggestion ? '#3b82f6' : '#e2e8f0'}; border-radius: 6px; font-size: 0.95em; box-sizing: border-box;">
                ${opts}
            </select>`;
        } else if (field.textarea) {
            inputHtml = `<textarea id="edit-${field.key}" rows="3"
                style="width: 100%; padding: 8px 10px; border: 1.5px solid ${hasSuggestion ? '#3b82f6' : '#e2e8f0'}; border-radius: 6px; font-size: 0.95em; font-family: inherit; resize: vertical; box-sizing: border-box;"
                >${suggestedValue}</textarea>`;
        } else {
            inputHtml = `<input id="edit-${field.key}" type="text" value="${suggestedValue.replace(/"/g, '&quot;')}"
                style="width: 100%; padding: 8px 10px; border: 1.5px solid ${hasSuggestion ? '#3b82f6' : '#e2e8f0'}; border-radius: 6px; font-size: 0.95em; box-sizing: border-box;"
                />`;
        }

        html += `
            <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px;">
                <label style="font-weight: 600; display: block; margin-bottom: 6px;">${field.label}</label>
                <div style="font-size: 0.85em; color: #64748b; margin-bottom: 6px;">
                    Aktuell: ${oldValue || '<em>leer</em>'}
                </div>
                ${inputHtml}
                ${field.isArray ? '<div style="font-size: 0.8em; color: #94a3b8; margin-top: 3px;">Kommagetrennt eingeben</div>' : ''}
            </div>
        `;
    });

    container.innerHTML = html;

    // Buttons austauschen
    const actions = document.getElementById('suggestion-actions');
    actions.innerHTML = `
        <button class="btn-primary" onclick="saveSuggestionEdit('${suggestion.id}')">💾 Speichern & Genehmigen</button>
        <button class="btn-secondary" style="background-color: #3b82f6; color: white;"
                onclick="saveSuggestionOnly('${suggestion.id}')">💾 Nur speichern</button>
        <button class="btn-secondary" onclick="showSuggestionDetails(currentSuggestionContext.suggestion)">Abbrechen</button>
    `;
}

// Bearbeitete Werte aus den Formularfeldern lesen
function readEditedFields() {
    const fields = [
        { key: 'suggested_name', dbKey: 'name' },
        { key: 'suggested_description', dbKey: 'description' },
        { key: 'suggested_street', dbKey: 'street' },
        { key: 'suggested_city', dbKey: 'city' },
        { key: 'suggested_postal_code', dbKey: 'postal_code' },
        { key: 'suggested_country', dbKey: 'country' },
        { key: 'suggested_phone', dbKey: 'phone' },
        { key: 'suggested_email', dbKey: 'email' },
        { key: 'suggested_website', dbKey: 'website' },
        { key: 'suggested_category', dbKey: 'category' },
        { key: 'suggested_category2', dbKey: 'category2', allowEmpty: true },
        { key: 'suggested_category3', dbKey: 'category3', allowEmpty: true },
        { key: 'suggested_services', dbKey: 'services', isArray: true },
        { key: 'suggested_brands', dbKey: 'brands', isArray: true },
        { key: 'suggested_opening_hours', dbKey: 'opening_hours' },
    ];

    const providerUpdates = {};
    const suggestionUpdates = {};

    fields.forEach(field => {
        const el = document.getElementById(`edit-${field.key}`);
        if (!el) return;
        const val = el.value.trim();

        // allowEmpty-Felder (category2/3) duerfen auch leer sein (Kategorie entfernen)
        if (!val && !field.allowEmpty) return;

        if (field.isArray) {
            const arr = val.split(',').map(s => s.trim()).filter(s => s);
            if (arr.length > 0) {
                providerUpdates[field.dbKey] = arr;
                suggestionUpdates[field.key] = arr;
            }
        } else if (field.allowEmpty) {
            providerUpdates[field.dbKey] = val || null;
            suggestionUpdates[field.key] = val || null;
        } else {
            providerUpdates[field.dbKey] = val;
            suggestionUpdates[field.key] = val;
        }
    });

    return { providerUpdates, suggestionUpdates };
}

// Bearbeitete Werte speichern und direkt genehmigen
async function saveSuggestionEdit(suggestionId) {
    if (!confirm('Bearbeitete Änderung speichern und genehmigen?')) return;
    if (!currentSuggestionContext) return;
    const { suggestion } = currentSuggestionContext;

    try {
        const { providerUpdates, suggestionUpdates } = readEditedFields();

        if (Object.keys(providerUpdates).length === 0) {
            alert('Keine Änderungen zum Speichern vorhanden.');
            return;
        }

        // Provider aktualisieren
        await supabaseClient
            .from('service_providers')
            .update(providerUpdates)
            .eq('id', suggestion.provider_id);

        // Suggestion mit bearbeiteten Werten aktualisieren und genehmigen
        await supabaseClient
            .from('provider_edit_suggestions')
            .update({
                ...suggestionUpdates,
                status: 'approved',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', suggestionId);

        alert('✅ Änderung bearbeitet und genehmigt!');
        document.getElementById('suggestion-modal').classList.remove('active');
        currentSuggestionContext = null;
        loadSuggestions();
        loadDashboard();
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Speichern: ' + error.message);
    }
}

// Nur die Suggestion speichern (ohne Provider-Update, bleibt pending)
async function saveSuggestionOnly(suggestionId) {
    if (!confirm('Bearbeitete Werte im Vorschlag speichern?')) return;
    if (!currentSuggestionContext) return;

    try {
        const { suggestionUpdates } = readEditedFields();

        if (Object.keys(suggestionUpdates).length === 0) {
            alert('Keine Änderungen zum Speichern vorhanden.');
            return;
        }

        await supabaseClient
            .from('provider_edit_suggestions')
            .update(suggestionUpdates)
            .eq('id', suggestionId);

        alert('💾 Vorschlag gespeichert (noch nicht genehmigt).');

        // Aktualisierte Suggestion neu laden und anzeigen
        const { data: updated } = await supabaseClient
            .from('provider_edit_suggestions')
            .select('*, service_providers(name)')
            .eq('id', suggestionId)
            .single();

        if (updated) {
            showSuggestionDetails(updated);
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Speichern: ' + error.message);
    }
}

function createChangeRow(label, oldValue, newValue) {
    return `
        <div style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px;">
            <strong>${label}</strong><br>
            ${oldValue ? `<span style="color: #ef4444; text-decoration: line-through;">Alt: ${oldValue}</span><br>` : ''}
            <span style="color: #10b981;">Neu: ${newValue}</span>
        </div>
    `;
}

async function approveSuggestion(suggestionId) {
    if (!confirm('Änderung wirklich genehmigen?')) return;

    try {
        // Lade Suggestion
        const { data: suggestion } = await supabaseClient
            .from('provider_edit_suggestions')
            .select('*')
            .eq('id', suggestionId)
            .single();

        // Update Provider
        const updates = {};
        if (suggestion.suggested_name) updates.name = suggestion.suggested_name;
        if (suggestion.suggested_description) updates.description = suggestion.suggested_description;
        if (suggestion.suggested_address) updates.address = suggestion.suggested_address;
        if (suggestion.suggested_city) updates.city = suggestion.suggested_city;
        if (suggestion.suggested_postal_code) updates.postal_code = suggestion.suggested_postal_code;
        if (suggestion.suggested_country) updates.country = suggestion.suggested_country;
        if (suggestion.suggested_phone) updates.phone = suggestion.suggested_phone;
        if (suggestion.suggested_email) updates.email = suggestion.suggested_email;
        if (suggestion.suggested_website) updates.website = suggestion.suggested_website;
        if (suggestion.suggested_category) updates.category = suggestion.suggested_category;
        if (suggestion.suggested_category2 !== undefined && suggestion.suggested_category2 !== null) updates.category2 = suggestion.suggested_category2 || null;
        if (suggestion.suggested_category3 !== undefined && suggestion.suggested_category3 !== null) updates.category3 = suggestion.suggested_category3 || null;
        if (suggestion.suggested_services) updates.services = suggestion.suggested_services;
        if (suggestion.suggested_brands) updates.brands = suggestion.suggested_brands;
        if (suggestion.suggested_street) updates.street = suggestion.suggested_street;
        if (suggestion.suggested_opening_hours) updates.opening_hours = suggestion.suggested_opening_hours;

        await supabaseClient
            .from('service_providers')
            .update(updates)
            .eq('id', suggestion.provider_id);

        // Markiere als genehmigt
        await supabaseClient
            .from('provider_edit_suggestions')
            .update({
                status: 'approved',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString()
            })
            .eq('id', suggestionId);

        alert('✅ Änderung genehmigt!');
        document.getElementById('suggestion-modal').classList.remove('active');
        currentSuggestionContext = null;
        loadSuggestions();
        loadDashboard();
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Genehmigen');
    }
}

async function rejectSuggestion(suggestionId) {
    const reason = prompt('Ablehnungsgrund (optional):');
    if (reason === null) return;

    try {
        await supabaseClient
            .from('provider_edit_suggestions')
            .update({
                status: 'rejected',
                reviewed_by: currentUser.id,
                reviewed_at: new Date().toISOString(),
                rejection_reason: reason || null
            })
            .eq('id', suggestionId);

        alert('❌ Änderung abgelehnt');
        document.getElementById('suggestion-modal').classList.remove('active');
        currentSuggestionContext = null;
        loadSuggestions();
        loadDashboard();
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Ablehnen');
    }
}

// ============================================
// SERVICE PROVIDERS
// ============================================

async function loadProviders(searchQuery = '') {
    try {
        let query = supabaseClient
            .from('service_providers')
            .select('*')
            .order('name');

        if (searchQuery) {
            query = query.or(`name.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
        }

        const { data: providers, error } = await query.limit(100);

        if (error) throw error;

        displayProviders(providers);
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Laden der Provider');
    }
}

function displayProviders(providers) {
    const list = document.getElementById('providers-list');
    list.innerHTML = '';

    if (!providers || providers.length === 0) {
        list.innerHTML = '<p>Keine Provider gefunden</p>';
        return;
    }

    providers.forEach(provider => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="list-item-header">
                <span class="list-item-title">${provider.name}</span>
                <button onclick="deleteProvider('${provider.id}')"
                        class="btn-secondary"
                        style="background-color: var(--danger-color); color: white; padding: 6px 12px;">
                    🗑️ Löschen
                </button>
            </div>
            <div class="list-item-content">${provider.category || 'Keine Kategorie'}</div>
            <div class="list-item-meta">
                <span>📍 ${provider.city || 'Keine Stadt'}</span>
                ${provider.phone ? `<span>📞 ${provider.phone}</span>` : ''}
            </div>
        `;
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                showProviderDetails(provider);
            }
        });
        list.appendChild(item);
    });
}

function searchProviders() {
    const query = document.getElementById('provider-search').value;
    loadProviders(query);
}

async function toggleProviderView(view) {
    // Update button states
    const buttons = document.querySelectorAll('#providers-page .filter-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if ((view === 'list' && btn.textContent.includes('Liste')) ||
            (view === 'categories' && btn.textContent.includes('Kategorien'))) {
            btn.classList.add('active');
        }
    });

    if (view === 'list') {
        document.getElementById('providers-list').style.display = 'block';
        document.getElementById('providers-by-category').style.display = 'none';
        loadProviders();
    } else if (view === 'categories') {
        document.getElementById('providers-list').style.display = 'none';
        document.getElementById('providers-by-category').style.display = 'block';
        await loadProvidersByCategory();
    }
}

async function loadProvidersByCategory() {
    try {
        const { data: providers, error } = await supabaseClient
            .from('service_providers')
            .select('*')
            .order('category, name');

        if (error) throw error;

        displayProvidersByCategory(providers);
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Laden der Provider');
    }
}

function displayProvidersByCategory(providers) {
    const container = document.getElementById('providers-by-category');
    container.innerHTML = '';

    if (!providers || providers.length === 0) {
        container.innerHTML = '<p>Keine Provider gefunden</p>';
        return;
    }

    // Gruppiere nach Kategorie
    const byCategory = {};
    providers.forEach(provider => {
        const cat = provider.category || 'Ohne Kategorie';
        if (!byCategory[cat]) {
            byCategory[cat] = [];
        }
        byCategory[cat].push(provider);
    });

    // Farben für Kategorien
    const categoryColors = {
        'Werkstatt': '#3b82f6',
        'Motorservice': '#2563eb',
        'Zubehör': '#10b981',

        'Segelmacher': '#8b5cf6',
        'Rigg': '#ec4899',
        'Instrumente': '#06b6d4',
        'Marina': '#0ea5e9',
        'Winterlager': '#64748b',
        'Lackiererei': '#a855f7',
        'Bootsbauer': '#059669',
        'Gutachter': '#d97706',
        'Kran': '#78716c',
        'Heizung/Klima': '#f97316',
        'Sonstige': '#6b7280'
    };

    // Sortiere Kategorien nach Anzahl
    const sortedCategories = Object.entries(byCategory)
        .sort((a, b) => b[1].length - a[1].length);

    // Bulk-Lösch-Bar oben
    const bulkActionsDiv = document.createElement('div');
    bulkActionsDiv.id = 'bulk-actions-bar';
    bulkActionsDiv.style.cssText = 'display: none; position: sticky; top: 0; z-index: 100; padding: 15px; background: #fef3c7; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
    bulkActionsDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="font-weight: 600;" id="selected-count">0 ausgewählt</span>
                <button onclick="window.selectAllProviders()" class="btn-secondary" style="padding: 6px 12px; font-size: 14px;">
                    ☑️ Alle auswählen
                </button>
                <button onclick="window.deselectAllProviders()" class="btn-secondary" style="padding: 6px 12px; font-size: 14px;">
                    ◻️ Alle abwählen
                </button>
            </div>
            <button onclick="window.bulkDeleteProviders()" class="btn-primary" style="background: #ef4444; padding: 8px 16px; font-size: 14px;">
                🗑️ Ausgewählte löschen
            </button>
        </div>
    `;
    container.appendChild(bulkActionsDiv);

    // Erstelle Summary
    const summaryDiv = document.createElement('div');
    summaryDiv.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px;';

    sortedCategories.forEach(([cat, provs]) => {
        const color = categoryColors[cat] || '#6b7280';
        const card = document.createElement('div');
        card.style.cssText = `padding: 20px; background: ${color}; color: white; border-radius: 8px; cursor: pointer;`;
        card.innerHTML = `
            <div style="font-size: 32px; font-weight: bold;">${provs.length}</div>
            <div style="font-size: 14px; opacity: 0.9;">${cat}</div>
        `;
        card.onclick = () => {
            const section = document.getElementById(`category-${cat.replace(/\s+/g, '-')}`);
            section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        summaryDiv.appendChild(card);
    });
    container.appendChild(summaryDiv);

    // Erstelle Kategorien-Sektionen
    sortedCategories.forEach(([category, categoryProviders]) => {
        const color = categoryColors[category] || '#6b7280';

        const section = document.createElement('div');
        section.id = `category-${category.replace(/\s+/g, '-')}`;
        section.style.marginBottom = '40px';

        const header = document.createElement('h2');
        header.style.cssText = `color: ${color}; border-bottom: 3px solid ${color}; padding-bottom: 10px; margin-bottom: 20px;`;
        header.innerHTML = `${category} <span style="font-size: 16px; color: #666;">(${categoryProviders.length})</span>`;
        section.appendChild(header);

        const table = document.createElement('table');
        table.style.cssText = 'width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';

        table.innerHTML = `
            <thead>
                <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                    <th style="padding: 12px; text-align: center; font-weight: 600; width: 40px;">
                        <input type="checkbox" class="select-all-category" data-category="${category}"
                               onchange="window.toggleCategorySelection('${category}', this.checked)"
                               style="cursor: pointer;">
                    </th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Name</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Adresse</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Stadt</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Land</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Telefon</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600;">Aktionen</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;

        const tbody = table.querySelector('tbody');
        categoryProviders.forEach((provider, index) => {
            const row = document.createElement('tr');
            row.style.cssText = `border-bottom: 1px solid #e5e7eb; cursor: pointer; transition: background 0.2s;`;
            row.onmouseover = () => row.style.background = '#f9fafb';
            row.onmouseout = () => row.style.background = index % 2 === 0 ? 'white' : '#fafafa';
            row.style.background = index % 2 === 0 ? 'white' : '#fafafa';

            row.innerHTML = `
                <td style="padding: 12px; text-align: center;" onclick="event.stopPropagation();">
                    <input type="checkbox" class="provider-checkbox" data-category="${category}" data-provider-id="${provider.id}"
                           onchange="window.updateBulkActionsBar()"
                           style="cursor: pointer;">
                </td>
                <td style="padding: 12px; font-weight: 500;">${provider.name}</td>
                <td style="padding: 12px; color: #666;">${provider.street || '-'}</td>
                <td style="padding: 12px; color: #666;">${provider.postal_code || ''} ${provider.city || '-'}</td>
                <td style="padding: 12px; color: #666;">${provider.country || '-'}</td>
                <td style="padding: 12px; color: #666;">${provider.phone || '-'}</td>
                <td style="padding: 12px; text-align: center;">
                    <button onclick="event.stopPropagation(); window.showProviderDetails(${JSON.stringify(provider).replace(/"/g, '&quot;')})"
                            class="btn-secondary" style="padding: 4px 8px; font-size: 12px; margin-right: 5px;">
                        👁️ Details
                    </button>
                    <button onclick="event.stopPropagation(); window.editProvider('${provider.id}')"
                            class="btn-primary" style="padding: 4px 8px; font-size: 12px;">
                        ✏️ Bearbeiten
                    </button>
                </td>
            `;

            row.onclick = () => showProviderDetails(provider);
            tbody.appendChild(row);
        });

        section.appendChild(table);
        container.appendChild(section);
    });
}

function showProviderDetails(provider) {
    const modal = document.getElementById('provider-modal');
    const details = document.getElementById('provider-details');

    details.innerHTML = `
        <h2>${provider.name}</h2>
        <div style="margin: 20px 0;">
            <p><strong>Kategorie:</strong> ${[provider.category, provider.category2, provider.category3].filter(Boolean).join(', ') || '-'}</p>
            <p><strong>Adresse:</strong> ${provider.street || provider.address || '-'}</p>
            <p><strong>PLZ/Ort:</strong> ${provider.postal_code || ''} ${provider.city || ''}</p>
            <p><strong>Land:</strong> ${provider.country || '-'}</p>
            <p><strong>Telefon:</strong> ${provider.phone || '-'}</p>
            <p><strong>E-Mail:</strong> ${provider.email || '-'}</p>
            <p><strong>Website:</strong> ${provider.website ? `<a href="${provider.website}" target="_blank">${provider.website}</a>` : '-'}</p>
            <p><strong>Koordinaten:</strong> ${provider.latitude}, ${provider.longitude}</p>
            ${provider.description ? `<p><strong>Beschreibung:</strong><br>${provider.description}</p>` : ''}
            ${provider.services ? `<p><strong>Leistungen:</strong> ${provider.services.join(', ')}</p>` : ''}
            ${provider.brands ? `<p><strong>Marken:</strong> ${provider.brands.join(', ')}</p>` : ''}
        </div>
        <div class="form-actions">
            <button class="btn-primary" onclick="editProvider('${provider.id}')">✏️ Bearbeiten</button>
        </div>
    `;

    modal.classList.add('active');
}

function editProvider(providerId) {
    // Finde den Provider in der aktuellen Liste
    const providerSearch = document.getElementById('provider-search');
    loadProviderForEdit(providerId);
}

async function loadProviderForEdit(providerId) {
    try {
        const { data: provider, error } = await supabaseClient
            .from('service_providers')
            .select('*')
            .eq('id', providerId)
            .single();

        if (error) throw error;

        showEditForm(provider);
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Laden: ' + error.message);
    }
}

function showEditForm(provider) {
    const modal = document.getElementById('provider-modal');
    const details = document.getElementById('provider-details');

    // Kategorie-Dropdowns erstellen
    const catList = PROVIDER_CATEGORIES.filter(cat => cat.value !== 'Alle');
    const categoryOptions = catList
        .map(cat => `<option value="${cat.value}" ${provider.category === cat.value ? 'selected' : ''}>${cat.label}</option>`)
        .join('');
    const category2Options = `<option value="">— Keine —</option>` + catList
        .map(cat => `<option value="${cat.value}" ${provider.category2 === cat.value ? 'selected' : ''}>${cat.label}</option>`)
        .join('');
    const category3Options = `<option value="">— Keine —</option>` + catList
        .map(cat => `<option value="${cat.value}" ${provider.category3 === cat.value ? 'selected' : ''}>${cat.label}</option>`)
        .join('');

    details.innerHTML = `
        <h2>Provider bearbeiten</h2>
        <form id="edit-provider-form" onsubmit="event.preventDefault(); updateProvider('${provider.id}');">
            <div class="form-group">
                <label>Name *</label>
                <input type="text" name="name" value="${provider.name || ''}" required>
            </div>
            <div class="form-group">
                <label>Kategorie * (bestimmt Pin-Icon)</label>
                <select name="category" required style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                    ${categoryOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Kategorie 2 (optional)</label>
                <select name="category2" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                    ${category2Options}
                </select>
            </div>
            <div class="form-group">
                <label>Kategorie 3 (optional)</label>
                <select name="category3" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
                    ${category3Options}
                </select>
            </div>
            <div class="form-group">
                <label>Beschreibung</label>
                <textarea name="description" rows="3">${provider.description || ''}</textarea>
            </div>
            <div class="form-group">
                <label>Straße</label>
                <input type="text" name="street" value="${provider.street || provider.address || ''}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>PLZ</label>
                    <input type="text" name="postal_code" value="${provider.postal_code || ''}">
                </div>
                <div class="form-group">
                    <label>Stadt *</label>
                    <input type="text" name="city" value="${provider.city || ''}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Land</label>
                <input type="text" name="country" value="${provider.country || 'Deutschland'}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Latitude</label>
                    <input type="number" name="latitude" step="any" value="${provider.latitude || ''}">
                </div>
                <div class="form-group">
                    <label>Longitude</label>
                    <input type="number" name="longitude" step="any" value="${provider.longitude || ''}">
                </div>
            </div>
            <div class="form-group" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
                <div style="font-size:13px; font-weight:600; margin-bottom:8px; color:#374151;">📍 Koordinaten ermitteln</div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button type="button" class="btn-secondary" onclick="geocodeForEditForm()" style="flex:1; min-width:180px;">
                        🔍 Aus Adresse (automatisch)
                    </button>
                    <button type="button" class="btn-secondary" onclick="openGoogleMapsForProvider()" style="flex:1; min-width:180px;">
                        🗺️ In Google Maps suchen
                    </button>
                </div>
                <div id="geocode-edit-status" style="font-size:12px; color:#555; margin-top:8px; line-height:1.4;"></div>
                <div style="font-size:11px; color:#888; margin-top:6px; border-top:1px solid #e2e8f0; padding-top:6px;">
                    💡 Für "Zone Technique", Häfen etc.: Google Maps öffnen → rechte Maustaste auf den genauen Ort → Koordinaten kopieren → oben eintragen
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Telefon</label>
                    <input type="tel" name="phone" value="${provider.phone || ''}">
                </div>
                <div class="form-group">
                    <label>E-Mail</label>
                    <input type="email" name="email" value="${provider.email || ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Website</label>
                <input type="url" name="website" value="${provider.website || ''}">
            </div>
            <div class="form-group">
                <label>Leistungen (kommagetrennt)</label>
                <input type="text" name="services" value="${provider.services ? provider.services.join(', ') : ''}">
            </div>
            <div class="form-group">
                <label>Marken (kommagetrennt)</label>
                <input type="text" name="brands" value="${provider.brands ? provider.brands.join(', ') : ''}">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn-primary">💾 Speichern</button>
                <button type="button" class="btn-secondary" onclick="document.getElementById('provider-modal').classList.remove('active')">Abbrechen</button>
            </div>
        </form>
    `;

    // Modal sichtbar machen (nötig wenn z.B. von der Karte aufgerufen)
    modal.classList.add('active');
}

async function updateProvider(providerId) {
    const form = document.getElementById('edit-provider-form');
    const formData = new FormData(form);

    // Sammle alle Daten
    const providerData = {
        provider_id: providerId,
        provider_name: formData.get('name'),
        provider_category: formData.get('category'),
        provider_category2: formData.get('category2') || null,
        provider_category3: formData.get('category3') || null,
        provider_description: formData.get('description') || null,
        provider_street: formData.get('street') || null,
        provider_postal_code: formData.get('postal_code') || null,
        provider_city: formData.get('city') || null,
        provider_country: formData.get('country') || null,
        provider_latitude: formData.get('latitude') ? parseFloat(formData.get('latitude')) : null,
        provider_longitude: formData.get('longitude') ? parseFloat(formData.get('longitude')) : null,
        provider_phone: formData.get('phone') || null,
        provider_email: formData.get('email') || null,
        provider_website: formData.get('website') || null,
        provider_services: formData.get('services') ? formData.get('services').split(',').map(s => s.trim()).filter(s => s) : null,
        provider_brands: formData.get('brands') ? formData.get('brands').split(',').map(s => s.trim()).filter(s => s) : null
    };

    console.log('Updating provider via RPC:', providerData);

    try {
        // Verwende RPC-Funktion um Schema-Cache zu umgehen
        const { data, error } = await supabaseClient.rpc('update_service_provider', providerData);

        if (error) {
            console.error('RPC Error:', error);

            // Fallback: Minimale Updates ohne problematische Felder
            console.log('Fallback: Update nur Basis-Felder (city/country werden übersprungen wegen Schema-Cache)...');
            const minimalUpdates = {
                name: providerData.provider_name,
                category: providerData.provider_category,
                category2: providerData.provider_category2 || null,
                category3: providerData.provider_category3 || null
            };

            // Nur nicht-null Felder hinzufügen
            if (providerData.provider_description) minimalUpdates.description = providerData.provider_description;
            if (providerData.provider_street) minimalUpdates.street = providerData.provider_street;
            if (providerData.provider_postal_code) minimalUpdates.postal_code = providerData.provider_postal_code;
            if (providerData.provider_city) minimalUpdates.city = providerData.provider_city;
            if (providerData.provider_country) minimalUpdates.country = providerData.provider_country;
            if (providerData.provider_latitude) minimalUpdates.latitude = providerData.provider_latitude;
            if (providerData.provider_longitude) minimalUpdates.longitude = providerData.provider_longitude;
            if (providerData.provider_phone) minimalUpdates.phone = providerData.provider_phone;
            if (providerData.provider_email) minimalUpdates.email = providerData.provider_email;
            if (providerData.provider_website) minimalUpdates.website = providerData.provider_website;
            if (providerData.provider_services && providerData.provider_services.length > 0) {
                minimalUpdates.services = providerData.provider_services;
            }
            if (providerData.provider_brands && providerData.provider_brands.length > 0) {
                minimalUpdates.brands = providerData.provider_brands;
            }

            const { error: updateError } = await supabaseClient
                .from('service_providers')
                .update(minimalUpdates)
                .eq('id', providerId);

            if (updateError) {
                console.error('Fallback Update Error:', updateError);
                alert('❌ Update fehlgeschlagen!\n\nBitte erstelle die RPC-Funktion in Supabase:\n\n1. Öffne: https://supabase.com/dashboard/project/vcjwlyqkfkszumdrfvtm/sql/new\n2. Kopiere den Inhalt aus create-update-function.sql\n3. Klicke "Run"\n\nDanach kannst du alle Felder (inkl. Stadt/Land) bearbeiten.');
                throw updateError;
            }

            alert('⚠️ Provider teilweise aktualisiert!\n\nStadt und Land konnten nicht gespeichert werden (Supabase Schema-Cache Problem).\n\nBitte erstelle die RPC-Funktion für vollständige Updates.');
        }

        alert('✅ Provider erfolgreich aktualisiert!');
        document.getElementById('provider-modal').classList.remove('active');
        loadProviders();
        loadDashboard();
        // Map aktualisieren falls aktiv
        if (document.getElementById('map-page')?.classList.contains('active')) {
            loadAllMapProviders().then(() => applyMapFilters());
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Aktualisieren: ' + error.message);
    }
}

async function deleteProvider(providerId) {
    if (!confirm('Provider wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden!')) return;

    try {
        // Verwende RPC-Funktion für Löschung (umgeht RLS-Policies)
        const { data, error } = await supabaseClient.rpc('bulk_delete_providers', {
            provider_ids: [providerId]
        });

        if (error) throw error;

        if (data.deleted === 1) {
            alert('✅ Provider gelöscht');
        } else {
            alert('⚠️ Provider konnte nicht gelöscht werden');
        }

        loadProviders();
        loadDashboard();
        // Map aktualisieren falls aktiv
        if (document.getElementById('map-page')?.classList.contains('active')) {
            mapAllProviders = mapAllProviders.filter(p => p.id !== providerId);
            applyMapFilters();
        }
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
}

// ============================================
// ADD PROVIDER
// ============================================

async function handleAddProvider(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        category: formData.get('category'),
        description: formData.get('description') || null,
        street: formData.get('street') || null,
        postal_code: formData.get('postal_code') || null,
        city: formData.get('city'),
        country: formData.get('country'),
        latitude: parseFloat(formData.get('latitude')),
        longitude: parseFloat(formData.get('longitude')),
        phone: formData.get('phone') || null,
        email: formData.get('email') || null,
        website: formData.get('website') || null,
        services: formData.get('services') ? formData.get('services').split(',').map(s => s.trim()).filter(s => s) : null,
        brands: formData.get('brands') ? formData.get('brands').split(',').map(s => s.trim()).filter(s => s) : null
    };

    try {
        const { error } = await supabaseClient
            .from('service_providers')
            .insert([data]);

        if (error) throw error;

        alert('✅ Provider erfolgreich hinzugefügt!');
        e.target.reset();
        loadDashboard();
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler beim Hinzufügen: ' + error.message);
    }
}

async function geocodeAddress() {
    const address = document.querySelector('input[name="address"]').value;
    const city = document.querySelector('input[name="city"]').value;
    const country = document.querySelector('input[name="country"]').value;

    if (!city) {
        alert('Bitte geben Sie mindestens eine Stadt ein');
        return;
    }

    const fullAddress = [address, city, country].filter(x => x).join(', ');

    try {
        if (USE_NOMINATIM) {
            // OpenStreetMap Nominatim (kostenlos)
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                document.querySelector('input[name="latitude"]').value = data[0].lat;
                document.querySelector('input[name="longitude"]').value = data[0].lon;
                alert('✅ Koordinaten gefunden!');
            } else {
                alert('❌ Keine Koordinaten gefunden');
            }
        } else {
            // Google Maps Geocoding API
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                document.querySelector('input[name="latitude"]').value = data.results[0].geometry.location.lat;
                document.querySelector('input[name="longitude"]').value = data.results[0].geometry.location.lng;
                alert('✅ Koordinaten gefunden!');
            } else {
                alert('❌ Keine Koordinaten gefunden');
            }
        }
    } catch (error) {
        console.error('Geocoding Fehler:', error);
        alert('Fehler beim Geocoding');
    }
}

async function geocodeForEditForm() {
    const form = document.getElementById('edit-provider-form');
    if (!form) return;

    const street = form.querySelector('input[name="street"]')?.value || '';
    const postalCode = form.querySelector('input[name="postal_code"]')?.value || '';
    const city = form.querySelector('input[name="city"]')?.value || '';
    const country = form.querySelector('input[name="country"]')?.value || '';

    if (!city) {
        alert('Bitte mindestens eine Stadt angeben');
        return;
    }

    const fullAddress = [street, postalCode, city, country].filter(x => x).join(', ');
    const statusEl = document.getElementById('geocode-edit-status');
    if (statusEl) statusEl.textContent = '⏳ Suche Koordinaten für: ' + fullAddress;

    // Hinweis: User-Agent darf vom Browser nicht gesetzt werden (forbidden header)
    const nominatimFetch = async (params) => {
        const url = 'https://nominatim.openstreetmap.org/search?' + params + '&format=json&limit=1';
        console.log('Nominatim Anfrage:', url);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    };

    try {
        let data = [];

        // Versuch 1: Strukturierte Parameter (zuverlässiger als q=)
        const structuredParams = new URLSearchParams();
        if (street) structuredParams.set('street', street);
        if (postalCode) structuredParams.set('postalcode', postalCode);
        if (city) structuredParams.set('city', city);
        if (country) structuredParams.set('country', country);
        data = await nominatimFetch(structuredParams.toString());
        console.log('Versuch 1 (strukturiert):', data.length, 'Ergebnisse');

        // Versuch 2: Freier Text q= mit vollständiger Adresse
        if (!data || data.length === 0) {
            if (statusEl) statusEl.textContent = `⏳ Versuche freie Suche: ${fullAddress}`;
            data = await nominatimFetch(`q=${encodeURIComponent(fullAddress)}`);
            console.log('Versuch 2 (q=fullAddress):', data.length, 'Ergebnisse');
        }

        // Versuch 3: Nur Stadt + Land
        if (!data || data.length === 0) {
            const fallback = [city, country].filter(x => x).join(', ');
            if (statusEl) statusEl.textContent = `⏳ Versuche Stadt+Land: ${fallback}`;
            data = await nominatimFetch(`q=${encodeURIComponent(fallback)}`);
            console.log('Versuch 3 (Stadt+Land):', data.length, 'Ergebnisse');
        }

        if (data && data.length > 0) {
            form.querySelector('input[name="latitude"]').value = data[0].lat;
            form.querySelector('input[name="longitude"]').value = data[0].lon;
            const preview = data[0].display_name.length > 70 ? data[0].display_name.substring(0, 70) + '…' : data[0].display_name;
            if (statusEl) statusEl.textContent = `✅ ${data[0].lat}, ${data[0].lon} — ${preview}`;
        } else {
            if (statusEl) statusEl.textContent = '❌ Keine Koordinaten gefunden – bitte Adresse prüfen';
            console.warn('Nominatim: Keine Ergebnisse für:', fullAddress);
        }
    } catch (error) {
        console.error('Geocoding Fehler:', error);
        if (statusEl) statusEl.textContent = '❌ Fehler beim Geocoding: ' + error.message;
    }
}

function openGoogleMapsForProvider() {
    const form = document.getElementById('edit-provider-form');
    if (!form) return;

    const name = form.querySelector('input[name="name"]')?.value || '';
    const street = form.querySelector('input[name="street"]')?.value || '';
    const postalCode = form.querySelector('input[name="postal_code"]')?.value || '';
    const city = form.querySelector('input[name="city"]')?.value || '';
    const country = form.querySelector('input[name="country"]')?.value || '';

    const query = [name, street, postalCode, city, country].filter(x => x).join(' ');
    const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    window.open(mapsUrl, '_blank');

    const statusEl = document.getElementById('geocode-edit-status');
    if (statusEl) {
        statusEl.innerHTML = `
            <strong>So gehst du vor:</strong><br>
            1. Im neuen Tab den genauen Ort in Google Maps finden<br>
            2. Rechte Maustaste auf den Punkt klicken<br>
            3. Koordinaten aus dem Kontextmenü kopieren (z.B. <em>43.4489, 3.7531</em>)<br>
            4. Ersten Wert (Latitude) und zweiten Wert (Longitude) oben eintragen<br>
            <button type="button" onclick="pasteCoordinates()" class="btn-secondary" style="margin-top:6px; padding:4px 10px; font-size:12px;">
                📋 Koordinaten aus Zwischenablage einfügen
            </button>
        `;
    }
}

async function pasteCoordinates() {
    try {
        const text = await navigator.clipboard.readText();
        // Google Maps kopiert im Format "43.4489444, 3.7530925"
        const match = text.match(/(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/);
        if (match) {
            const form = document.getElementById('edit-provider-form');
            form.querySelector('input[name="latitude"]').value = parseFloat(match[1]).toFixed(7);
            form.querySelector('input[name="longitude"]').value = parseFloat(match[2]).toFixed(7);
            const statusEl = document.getElementById('geocode-edit-status');
            if (statusEl) statusEl.textContent = `✅ Koordinaten gesetzt: ${match[1]}, ${match[2]}`;
        } else {
            alert('Kein gültiges Koordinatenformat in der Zwischenablage.\nErwartet: "43.4489, 3.7531"');
        }
    } catch (e) {
        alert('Zwischenablage nicht lesbar.\nBitte Koordinaten manuell in die Felder eintragen.');
    }
}

// ============================================
// AUTO SEARCH
// ============================================

async function startAutoSearch() {
    const startPoint = document.getElementById('search-start').value;
    const radius = parseInt(document.getElementById('search-radius').value);
    const step = parseInt(document.getElementById('search-step').value);
    const area = parseInt(document.getElementById('search-area').value);

    if (!startPoint) {
        alert('Bitte Startpunkt angeben');
        return;
    }

    // Parse Startpunkt
    let lat, lng;
    if (startPoint.includes(',')) {
        [lat, lng] = startPoint.split(',').map(x => parseFloat(x.trim()));
    } else {
        // Geocode Stadt
        const coords = await geocodeCity(startPoint);
        if (!coords) {
            alert('Startpunkt konnte nicht gefunden werden');
            return;
        }
        lat = coords.lat;
        lng = coords.lng;
    }

    // Zeige Progress
    document.getElementById('search-progress').style.display = 'block';
    document.getElementById('progress-text').textContent = 'Starte Suche...';
    document.getElementById('progress-fill').style.width = '0%';

    // Generiere Suchpunkte (Grid)
    const searchPoints = generateSearchGrid(lat, lng, area, step);
    const results = [];

    for (let i = 0; i < searchPoints.length; i++) {
        const point = searchPoints[i];
        const progress = ((i + 1) / searchPoints.length) * 100;

        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent =
            `Suche Punkt ${i + 1}/${searchPoints.length} (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`;

        // Suche Provider bei diesem Punkt
        const found = await searchProvidersNearPoint(point.lat, point.lng, radius);
        results.push(...found);

        // Pause zwischen Requests (API Rate Limiting)
        await sleep(1000);
    }

    // Zeige Ergebnisse
    displaySearchResults(results);
}

function generateSearchGrid(centerLat, centerLng, areaKm, stepKm) {
    const points = [];
    const kmPerDegreeLat = 111;
    const kmPerDegreeLng = 111 * Math.cos(centerLat * Math.PI / 180);

    const steps = Math.ceil(areaKm / stepKm);

    for (let latStep = -steps; latStep <= steps; latStep++) {
        for (let lngStep = -steps; lngStep <= steps; lngStep++) {
            const lat = centerLat + (latStep * stepKm / kmPerDegreeLat);
            const lng = centerLng + (lngStep * stepKm / kmPerDegreeLng);
            points.push({ lat, lng });
        }
    }

    return points;
}

// Dedupliziert Service-Provider basierend auf Koordinaten
function deduplicateByLocation(services, thresholdMeters = 50) {
    const unique = [];
    let duplicatesRemoved = 0;

    for (const service of services) {
        const isDuplicate = unique.some(existing => {
            const latDiff = Math.abs(existing.lat - service.lat);
            const lonDiff = Math.abs(existing.lon - service.lon);
            // ~0.0005 degrees ≈ 50 meters (abhängig von Breitengrad)
            return latDiff < 0.0005 && lonDiff < 0.0005;
        });

        if (!isDuplicate) {
            unique.push(service);
        } else {
            duplicatesRemoved++;
        }
    }

    if (duplicatesRemoved > 0) {
        console.log(`   🔄 ${duplicatesRemoved} Duplikate entfernt (basierend auf Koordinaten)`);
    }

    return unique;
}

async function searchProvidersNearPoint(lat, lng, radiusKm) {
    // Suche in Overpass API (OpenStreetMap) nach maritimen Betrieben
    // ERWEITERTE Suche - findet viel mehr Typen von Service-Providern
    const radiusM = radiusKm * 1000;
    const query = `
        [out:json][timeout:25];
        (
            /* Werkstätten & Bootsbauer - ERWEITERT mit Regex */
            node["craft"~"sailmaker|boatbuilder|rigger|electronics|upholsterer"](around:${radiusM},${lat},${lng});
            way["craft"~"sailmaker|boatbuilder|rigger|electronics|upholsterer"](around:${radiusM},${lat},${lng});

            /* Allgemeine Werkstätten - NEU */
            node["amenity"="workshop"](around:${radiusM},${lat},${lng});
            way["amenity"="workshop"](around:${radiusM},${lat},${lng});

            /* Shops & Zubehör - ERWEITERT mit mehr Shop-Typen */
            node["shop"~"boat|marine|fishing|water_sports|general|hardware|sports"](around:${radiusM},${lat},${lng});
            way["shop"~"boat|marine|fishing|water_sports|general|hardware|sports"](around:${radiusM},${lat},${lng});

            /* Marinas & Häfen - ERWEITERT */
            node["leisure"~"marina|slipway"](around:${radiusM},${lat},${lng});
            way["leisure"~"marina|slipway"](around:${radiusM},${lat},${lng});
            node["amenity"~"boat_rental|boat_sharing"](around:${radiusM},${lat},${lng});
            way["amenity"~"boat_rental|boat_sharing"](around:${radiusM},${lat},${lng});

            /* Werften & Slipanlagen */
            node["industrial"="shipyard"](around:${radiusM},${lat},${lng});
            node["man_made"="slipway"](around:${radiusM},${lat},${lng});
            way["industrial"="shipyard"](around:${radiusM},${lat},${lng});
            way["man_made"="slipway"](around:${radiusM},${lat},${lng});

            /* Weitere maritime Tags */
            node["seamark:type"="harbour"](around:${radiusM},${lat},${lng});
            node["harbour"="yes"](around:${radiusM},${lat},${lng});
            node["port"="yes"](around:${radiusM},${lat},${lng});
            node["dock"="yes"](around:${radiusM},${lat},${lng});
            way["seamark:type"="harbour"](around:${radiusM},${lat},${lng});
            way["harbour"="yes"](around:${radiusM},${lat},${lng});

            /* Keyword-Suche in Namen - NEU (findet Betriebe mit marine/boat Keywords) */
            node["name"~"marine|boat|yacht|accastillage|réparation|électronique|voilerie|chantier|gréement|shipchandler|nautique",i](around:${radiusM},${lat},${lng});
            way["name"~"marine|boat|yacht|accastillage|réparation|électronique|voilerie|chantier|gréement|shipchandler|nautique",i](around:${radiusM},${lat},${lng});
        );
        out body;
        >;
        out skel qt;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        const data = await response.json();
        return data.elements || [];
    } catch (error) {
        console.error('Overpass API Fehler:', error);
        return [];
    }
}

// Suche NUR nach Marinas
async function searchMarinasNearPoint(lat, lng, radiusKm) {
    const query = `
        [out:json][timeout:25];
        (
            node["leisure"="marina"](around:${radiusKm * 1000},${lat},${lng});
            way["leisure"="marina"](around:${radiusKm * 1000},${lat},${lng});
            node["seamark:type"="harbour"](around:${radiusKm * 1000},${lat},${lng});
            way["seamark:type"="harbour"](around:${radiusKm * 1000},${lat},${lng});
            node["harbour"="yes"](around:${radiusKm * 1000},${lat},${lng});
            way["harbour"="yes"](around:${radiusKm * 1000},${lat},${lng});
        );
        out center;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        const data = await response.json();
        return data.elements || [];
    } catch (error) {
        console.error('Overpass API Fehler (Marinas):', error);
        return [];
    }
}

// Suche NUR nach Service-Betrieben (KEINE Marinas)
async function searchServiceProvidersNearPoint(lat, lng, radiusKm) {
    const radiusM = radiusKm * 1000;
    const query = `
        [out:json][timeout:25];
        (
            /* Werkstätten & Bootsbauer - ERWEITERT mit Regex */
            node["craft"~"sailmaker|boatbuilder|rigger|electronics|upholsterer"](around:${radiusM},${lat},${lng});
            way["craft"~"sailmaker|boatbuilder|rigger|electronics|upholsterer"](around:${radiusM},${lat},${lng});

            /* Allgemeine Werkstätten - NEU */
            node["amenity"="workshop"](around:${radiusM},${lat},${lng});
            way["amenity"="workshop"](around:${radiusM},${lat},${lng});

            /* Shops & Zubehör - ERWEITERT mit mehr Shop-Typen */
            node["shop"~"boat|marine|fishing|water_sports|general|hardware|sports"](around:${radiusM},${lat},${lng});
            way["shop"~"boat|marine|fishing|water_sports|general|hardware|sports"](around:${radiusM},${lat},${lng});

            /* Werften & Slipanlagen */
            node["industrial"="shipyard"](around:${radiusM},${lat},${lng});
            node["man_made"="slipway"](around:${radiusM},${lat},${lng});
            way["industrial"="shipyard"](around:${radiusM},${lat},${lng});
            way["man_made"="slipway"](around:${radiusM},${lat},${lng});

            /* Alternative Marina/Port Tags - NEU */
            node["leisure"~"marina|slipway"](around:${radiusM},${lat},${lng});
            way["leisure"~"marina|slipway"](around:${radiusM},${lat},${lng});
            node["port"="yes"](around:${radiusM},${lat},${lng});
            node["dock"="yes"](around:${radiusM},${lat},${lng});

            /* Keyword-Suche in Namen - NEU (findet Betriebe mit marine/boat Keywords) */
            node["name"~"marine|boat|yacht|accastillage|réparation|électronique|voilerie|chantier|gréement|shipchandler|nautique",i](around:${radiusM},${lat},${lng});
            way["name"~"marine|boat|yacht|accastillage|réparation|électronique|voilerie|chantier|gréement|shipchandler|nautique",i](around:${radiusM},${lat},${lng});
        );
        out body;
        >;
        out skel qt;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });

        const data = await response.json();
        return data.elements || [];
    } catch (error) {
        console.error('Overpass API Fehler (Service-Provider):', error);
        return [];
    }
}

/**
 * Suche Service-Provider via Google Search (eigener Backend-Scraper)
 * @param {string} location - Ortsname (z.B. "Gruissan, France")
 * @param {string} category - Kategorie (z.B. "Werkstatt") oder null für alle
 * @returns {Promise<Array>} Array von Providern im OSM-kompatiblen Format
 */
async function searchProvidersViaGoogleSearch(location, category = null) {
    if (!USE_GOOGLE_SEARCH_FALLBACK) {
        console.log('   ⚠️ Google Search Fallback deaktiviert');
        return [];
    }

    const results = [];
    const searchTerms = category ? GOOGLE_SEARCH_CATEGORIES[category] || [] : [];

    // Wenn keine Kategorie, suche alle
    const keywords = searchTerms.length > 0
        ? searchTerms
        : Object.values(GOOGLE_SEARCH_CATEGORIES).flat();

    console.log(`   🔍 Google Search: ${keywords.length} Keywords für "${location}"`);

    for (const keyword of keywords) {
        try {
            // Baue Such-Query
            const query = `${location} ${keyword}`;

            // Call eigener Backend-Scraper
            const response = await fetch(`${GOOGLE_SCRAPER_BACKEND_URL}/api/google-search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: query,
                    language: 'fr',
                    country: 'fr',
                    maxResults: 20
                })
            });

            if (!response.ok) {
                throw new Error(`Backend Scraper Error: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.results && data.results.length > 0) {
                console.log(`      ✅ Google: ${data.results.length} Ergebnisse für "${keyword}"`);

                for (const result of data.results) {
                    // Extrahiere relevante Daten
                    const name = result.title;
                    const snippet = result.snippet || '';
                    const link = result.link || '';

                    // Versuche Telefonnummer aus Snippet zu extrahieren
                    const phoneMatch = snippet.match(/(\+?\d{1,3}[\s\-]?)?\(?\d{2,3}\)?[\s\-]?\d{2,4}[\s\-]?\d{2,4}/);
                    const phone = phoneMatch ? phoneMatch[0] : '';

                    // Versuche Adresse aus Snippet zu extrahieren
                    const addressMatch = snippet.match(/(\d{1,5}\s[\w\s]+,?\s\d{5}\s[\w\s]+)/);
                    const address = addressMatch ? addressMatch[0] : '';

                    results.push({
                        type: 'node',
                        lat: 0, // Wird später via Geocoding gefüllt
                        lon: 0,
                        tags: {
                            name: name,
                            description: snippet,
                            website: link,
                            phone: phone,
                            'addr:full': address,
                            'source': 'google_search',
                            'google:snippet': snippet,
                            'search:query': query,
                            'search:keyword': keyword
                        }
                    });
                }
            } else {
                console.log(`      ℹ️ Google: Keine Ergebnisse für "${keyword}"`);
            }

            // Rate Limiting
            await sleep(1000); // 1 Sekunde zwischen Requests
        } catch (error) {
            console.error(`   ❌ Google Search Fehler für "${keyword}":`, error);
        }
    }

    // Geocode results (falls lat/lon = 0)
    const geocodedResults = await geocodeSearchResults(results, location);

    return deduplicateByLocation(geocodedResults, 50);
}

/**
 * Geocode Suchergebnisse die keine Koordinaten haben
 */
async function geocodeSearchResults(results, location) {
    const geocoded = [];

    for (const result of results) {
        if (result.lat === 0 && result.lon === 0) {
            // Versuche Geocoding via Adresse oder Name + Location
            const addressQuery = result.tags?.['addr:full'] || `${result.tags?.name}, ${location}`;

            const coords = await geocodeCity(addressQuery);
            if (coords) {
                result.lat = coords.lat;
                result.lon = coords.lng;
                geocoded.push(result);
            } else {
                console.warn(`   ⚠️ Konnte "${result.tags?.name}" nicht geocoden`);
            }

            await sleep(200); // Rate limiting für Nominatim
        } else {
            geocoded.push(result);
        }
    }

    return geocoded;
}

/**
 * Lade Ignore-Patterns aus Supabase
 */
async function loadIgnorePatterns() {
    try {
        const { data, error } = await supabaseClient
            .from('scraping_ignore_patterns')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log(`✅ ${data.length} Ignore-Patterns geladen`);
        return data;
    } catch (error) {
        console.error('Fehler beim Laden von Ignore-Patterns:', error);
        return [];
    }
}

/**
 * Speichere neue Ignore-Patterns
 */
async function saveIgnorePatterns(patterns) {
    try {
        const { data, error } = await supabaseClient
            .from('scraping_ignore_patterns')
            .insert(patterns);

        if (error) throw error;

        console.log(`✅ ${patterns.length} Ignore-Patterns gespeichert`);
        return data;
    } catch (error) {
        console.error('Fehler beim Speichern von Ignore-Patterns:', error);
        throw error;
    }
}

/**
 * Filtere Scraping-Ergebnisse gegen Ignore-Patterns
 */
function filterResultsAgainstIgnorePatterns(results, ignorePatterns) {
    const filtered = results.filter(result => {
        const name = result.tags?.name || '';
        const address = [
            result.tags?.['addr:street'],
            result.tags?.['addr:housenumber']
        ].filter(Boolean).join(' ');
        const placeId = result.tags?.['google:place_id'] || '';

        // Prüfe ob Ergebnis ignoriert werden soll
        const shouldIgnore = ignorePatterns.some(pattern => {
            // Exakter Match auf Google Place ID
            if (placeId && pattern.google_place_id === placeId) return true;

            // Fuzzy Match auf Name (mindestens 80% Ähnlichkeit)
            if (pattern.name && name.toLowerCase().includes(pattern.name.toLowerCase())) {
                return true;
            }

            // Adress-Match
            if (pattern.address && address.toLowerCase().includes(pattern.address.toLowerCase())) {
                return true;
            }

            return false;
        });

        return !shouldIgnore;
    });

    const ignoredCount = results.length - filtered.length;
    if (ignoredCount > 0) {
        console.log(`   🚫 ${ignoredCount} Ergebnisse aufgrund von Ignore-Patterns gefiltert`);
    }

    return filtered;
}

/**
 * Zeige Scraping-Ergebnisse im Review-Modus
 */
function showReviewMode(results) {
    // Verstecke Search-Results, zeige Review-Mode
    document.getElementById('search-results').style.display = 'none';
    document.getElementById('review-mode').style.display = 'block';

    const container = document.getElementById('review-results-container');
    container.innerHTML = '';

    // Lade gespeicherte Ignore-Patterns (synchron aus Cache wenn möglich)
    loadIgnorePatterns().then(ignorePatterns => {
        results.forEach((result, index) => {
            const name = result.tags?.name || 'Unbekannt';
            const address = [
                result.tags?.['addr:street'],
                result.tags?.['addr:housenumber'],
                result.tags?.['addr:postcode'],
                result.tags?.['addr:city']
            ].filter(Boolean).join(' ') || result.tags?.['addr:full'] || '';

            const phone = result.tags?.phone || '-';
            const website = result.tags?.website || '-';
            const source = result.tags?.source || 'osm';

            // Prüfe ob dieser Eintrag einem Ignore-Pattern entspricht
            const isIgnored = ignorePatterns.some(pattern => {
                return name.toLowerCase().includes(pattern.name?.toLowerCase() || '') ||
                       address.toLowerCase().includes(pattern.address?.toLowerCase() || '');
            });

            const card = document.createElement('div');
            card.className = 'review-card';
            card.dataset.index = index;
            card.dataset.ignored = isIgnored;
            card.style.cssText = `
                background: ${isIgnored ? '#fee2e2' : 'white'};
                border: 2px solid ${isIgnored ? '#ef4444' : '#d1d5db'};
                border-radius: 8px;
                padding: 15px;
                margin-bottom: 10px;
                display: flex;
                gap: 15px;
                opacity: ${isIgnored ? 0.5 : 1};
            `;

            card.innerHTML = `
                <div style="flex: 1;">
                    <h4 style="margin: 0 0 5px 0;">${name}</h4>
                    <p style="margin: 0; font-size: 13px; color: #6b7280;">
                        📍 ${address || 'Keine Adresse'}<br>
                        📞 ${phone}<br>
                        🌐 ${website !== '-' ? `<a href="${website}" target="_blank">${website}</a>` : '-'}<br>
                        🔖 Quelle: ${source.toUpperCase()}
                    </p>
                    ${isIgnored ? '<p style="color: #ef4444; margin: 5px 0 0 0;">⚠️ Entspricht Ignore-Pattern</p>' : ''}
                </div>
                <div style="display: flex; flex-direction: column; gap: 5px;">
                    <button
                        onclick="window.toggleReviewResult(${index})"
                        style="background: ${isIgnored ? '#10b981' : '#ef4444'}; padding: 8px 12px; border-radius: 5px; border: none; color: white; cursor: pointer; font-size: 18px;"
                        title="${isIgnored ? 'Doch behalten' : 'Löschen'}"
                    >
                        ${isIgnored ? '↩️' : '🗑️'}
                    </button>
                </div>
            `;

            container.appendChild(card);
        });

        // Update Counter
        updateReviewCounter();
    });
}

/**
 * Toggle Ignored-Status eines Review-Results
 */
window.toggleReviewResult = function(index) {
    const card = document.querySelector(`.review-card[data-index="${index}"]`);
    if (!card) return;

    const isIgnored = card.dataset.ignored === 'true';
    card.dataset.ignored = !isIgnored;

    // Update Styling
    card.style.background = isIgnored ? 'white' : '#fee2e2';
    card.style.borderColor = isIgnored ? '#d1d5db' : '#ef4444';
    card.style.opacity = isIgnored ? 1 : 0.5;

    // Update Button
    const button = card.querySelector('button');
    button.style.background = isIgnored ? '#ef4444' : '#10b981';
    button.textContent = isIgnored ? '🗑️' : '↩️';
    button.title = isIgnored ? 'Löschen' : 'Doch behalten';

    updateReviewCounter();
};

/**
 * Update Selected Counter
 */
function updateReviewCounter() {
    const cards = document.querySelectorAll('.review-card');
    const selected = Array.from(cards).filter(card => card.dataset.ignored !== 'true').length;
    document.getElementById('review-selected-count').textContent = selected;
}

/**
 * Bestätige reviewte Ergebnisse und importiere
 */
window.confirmReviewedResults = async function() {
    const cards = document.querySelectorAll('.review-card');
    const toImport = [];
    const toIgnore = [];

    cards.forEach((card) => {
        const result = scrapingResults[parseInt(card.dataset.index)];
        if (card.dataset.ignored === 'true') {
            // Zu Ignore-Liste hinzufügen
            toIgnore.push({
                name: result.tags?.name,
                address: [
                    result.tags?.['addr:street'],
                    result.tags?.['addr:housenumber']
                ].filter(Boolean).join(' ') || result.tags?.['addr:full'],
                reason: 'user_deleted',
                location_name: document.getElementById('location-input')?.value || '',
                category: result.tags?.['search:keyword'] || '',
                created_by: currentUser?.id
            });
        } else {
            toImport.push(result);
        }
    });

    // Speichere Ignore-Patterns
    if (toIgnore.length > 0) {
        await saveIgnorePatterns(toIgnore);
        console.log(`✅ ${toIgnore.length} Ignore-Patterns gespeichert`);
    }

    // Importiere ausgewählte Ergebnisse
    if (toImport.length > 0) {
        console.log(`📥 Importiere ${toImport.length} Provider...`);
        scrapingResults = toImport; // Update global array
        await bulkImportResultsInternal();
    } else {
        alert('Keine Ergebnisse zum Importieren ausgewählt!');
    }

    // Schließe Review-Modus
    document.getElementById('review-mode').style.display = 'none';
    document.getElementById('search-results').style.display = 'block';
};

/**
 * Abbrechen Review-Modus
 */
window.cancelReview = function() {
    document.getElementById('review-mode').style.display = 'none';
    document.getElementById('search-results').style.display = 'block';
    scrapingResults = [];
};

function displaySearchResults(results) {
    const resultsDiv = document.getElementById('search-results');

    // Duplikate entfernen
    const unique = [];
    const seen = new Set();

    results.forEach(r => {
        const key = `${r.lat},${r.lon}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(r);
        }
    });

    // Filter: Bei marina-zentrierter Suche KEINE Marinas anzeigen
    let filtered = unique;
    const marinaCentered = document.getElementById('marina-centered-search')?.checked || false;

    if (marinaCentered) {
        // Filtere Marinas RAUS - zeige nur Service-Betriebe
        filtered = unique.filter(r => {
            const cat = r.knownCategory || detectCategory(r.tags);
            return cat !== 'Marina';
        });
    }

    // Kategorien zählen (von gefilterten Ergebnissen)
    const categoryCount = {};
    filtered.forEach(r => {
        const cat = r.knownCategory || detectCategory(r.tags);
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    // Header mit Statistik
    let statsHtml = '<div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">';
    Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
        const categoryColors = {
            'Werkstatt': '#3b82f6',
            'Motorservice': '#2563eb',
            'Zubehör': '#10b981',
    
            'Segelmacher': '#8b5cf6',
            'Rigg': '#ec4899',
            'Instrumente': '#06b6d4',
            'Marina': '#0ea5e9',
            'Winterlager': '#64748b',
            'Lackiererei': '#a855f7',
            'Bootsbauer': '#059669',
            'Gutachter': '#d97706',
            'Kran': '#78716c',
            'Heizung/Klima': '#f97316',
            'Sonstige': '#6b7280'
        };
        const color = categoryColors[cat] || '#6b7280';
        statsHtml += `<span style="padding: 8px 16px; background: ${color}; color: white; border-radius: 20px; font-weight: 600;">${cat}: ${count}</span>`;
    });
    statsHtml += '</div>';

    // Zeige Anzahl gefundener und gefilterter Ergebnisse
    const filterInfo = marinaCentered ? ` (${unique.length} gesamt, ohne Marinas)` : '';

    resultsDiv.innerHTML = `
        <h3>Gefundene Service-Betriebe: ${filtered.length}${filterInfo}</h3>
        ${statsHtml}
    `;

    filtered.forEach(result => {
        // Bevorzuge manuell hinterlegte Kategorie aus known-providers.json
        const category = result.knownCategory || detectCategory(result.tags);
        const categoryColors = {
            'Werkstatt': '#3b82f6',
            'Motorservice': '#2563eb',
            'Zubehör': '#10b981',
    
            'Segelmacher': '#8b5cf6',
            'Rigg': '#ec4899',
            'Instrumente': '#06b6d4',
            'Marina': '#0ea5e9',
            'Winterlager': '#64748b',
            'Lackiererei': '#a855f7',
            'Bootsbauer': '#059669',
            'Gutachter': '#d97706',
            'Kran': '#78716c',
            'Heizung/Klima': '#f97316',
            'Sonstige': '#6b7280'
        };
        const categoryColor = categoryColors[category] || '#6b7280';

        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <div style="flex: 1;">
                    <strong style="font-size: 16px;">${result.tags?.name || 'Unbekannt'}</strong>
                    <span style="display: inline-block; margin-left: 10px; padding: 4px 12px; background: ${categoryColor}; color: white; border-radius: 12px; font-size: 12px; font-weight: 600;">
                        ${category}
                    </span>
                    <br>
                    <small style="color: #666;">
                        ${result.tags?.['addr:street'] || ''} ${result.tags?.['addr:postcode'] || ''} ${result.tags?.['addr:city'] || ''}
                    </small>
                    <br>
                    ${result.tags?.phone ? `📞 ${result.tags.phone}<br>` : ''}
                    ${result.tags?.website ? `🌐 ${result.tags.website}<br>` : ''}
                    <small style="color: #999;">📍 ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}</small>
                </div>
                <button onclick="addFoundProvider(${JSON.stringify(result).replace(/"/g, '&quot;')})"
                        class="btn-primary" style="margin-left: 10px; white-space: nowrap;">
                    ➕ Hinzufügen
                </button>
            </div>
        `;
        resultsDiv.appendChild(div);
    });
}

async function addFoundProvider(osmData) {
    // WICHTIG: Nur Provider mit Namen importieren!
    const name = osmData.tags?.name || osmData.knownName;

    if (!name || name === 'Unbekannt') {
        alert('❌ Provider hat keinen Namen und kann nicht importiert werden!');
        return;
    }

    const data = {
        name: name,
        category: osmData.knownCategory || detectCategory(osmData.tags),
        street: osmData.tags?.['addr:street'] || null,
        postal_code: osmData.tags?.['addr:postcode'] || null,
        city: osmData.tags?.['addr:city'] || null,
        country: osmData.tags?.['addr:country'] || null,
        latitude: osmData.lat || osmData.center?.lat,
        longitude: osmData.lon || osmData.center?.lon,
        phone: osmData.tags?.phone || null,
        email: osmData.tags?.email || null,
        website: osmData.tags?.website || null
    };

    // Prüfe auf Duplikate (gleicher Name + ähnliche Koordinaten)
    try {
        const { data: existing, error: checkError } = await supabaseClient
            .from('service_providers')
            .select('id, name, latitude, longitude')
            .eq('name', data.name);

        if (checkError) throw checkError;

        // Prüfe ob Provider mit gleichem Namen und ähnlichen Koordinaten existiert
        if (existing && existing.length > 0) {
            for (const existingProvider of existing) {
                const latDiff = Math.abs(existingProvider.latitude - data.latitude);
                const lonDiff = Math.abs(existingProvider.longitude - data.longitude);

                // Wenn Koordinaten weniger als 0.001° (ca. 100m) auseinander liegen
                if (latDiff < 0.001 && lonDiff < 0.001) {
                    alert(`⚠️ Provider "${data.name}" existiert bereits!`);
                    return;
                }
            }
        }

        // Import
        const { error } = await supabaseClient
            .from('service_providers')
            .insert([data]);

        if (error) throw error;

        alert(`✅ Provider "${data.name}" hinzugefügt!`);
    } catch (error) {
        console.error('Fehler:', error);
        alert('Fehler: ' + error.message);
    }
}

function detectCategory(tags, knownName = '') {
    if (!tags) return 'Sonstige';

    const name = (tags.name || knownName || '').toLowerCase();
    const shop = (tags.shop || '').toLowerCase();
    const craft = (tags.craft || '').toLowerCase();
    const amenity = (tags.amenity || '').toLowerCase();

    // SEGELMACHER
    if (craft === 'sailmaker' || name.includes('voilerie') || name.includes('sailmaker') ||
        name.includes('sail loft') || name.includes('segel')) {
        return 'Segelmacher';
    }

    // RIGG
    if (craft === 'rigger' || name.includes('gréement') || name.includes('rigging') ||
        name.includes('tauwerk') || name.includes('takelage') || tags.shop === 'rope') {
        return 'Rigg';
    }

    // INSTRUMENTE / ELEKTRONIK
    if (name.includes('électronique') || name.includes('electronic') || name.includes('instrument') ||
        name.includes('navigation') || craft.includes('electronics') ||
        (shop.includes('electronics') && (name.includes('marine') || name.includes('boat')))) {
        return 'Instrumente';
    }

    // HEIZUNG / KLIMA
    if (name.includes('heizung') || name.includes('klimaanlage') || name.includes('klimatechnik') ||
        name.includes('chauffage') || name.includes('climatisation') || name.includes('webasto') ||
        name.includes('hvac') || name.includes('heating') || name.includes('air conditioning')) {
        return 'Heizung/Klima';
    }

    // GUTACHTER / SURVEYOR
    if (name.includes('surveyor') || name.includes('gutachter') || name.includes('expert maritime') ||
        name.includes('expertise') || name.includes('perito')) {
        return 'Gutachter';
    }

    // LACKIEREREI / ANTIFOULING
    if (name.includes('antifouling') || name.includes('lackier') || name.includes('osmose') ||
        name.includes('peinture') || name.includes('carénage') || name.includes('painting')) {
        return 'Lackiererei';
    }

    // KRAN / TRAVEL LIFT
    if (name.includes('travelift') || name.includes('travel lift') || name.includes('kran') ||
        name.includes('grue') || name.includes('crane') || name.includes('slipway') ||
        tags.man_made === 'slipway') {
        return 'Kran';
    }

    // MOTORSERVICE
    if (name.includes('motor') || name.includes('moteur') || name.includes('engine') ||
        name.includes('outboard') || name.includes('hors-bord') || name.includes('außenborder') ||
        name.includes('mécanique') || name.includes('mécanicien')) {
        return 'Motorservice';
    }

    // WINTERLAGER
    if (name.includes('winterlager') || name.includes('hivernage') || name.includes('wintering') ||
        name.includes('stockage')) {
        return 'Winterlager';
    }

    // BOOTSBAUER / WERFT
    if (craft.includes('boatbuilder') || tags.industrial === 'shipyard' ||
        name.includes('bootsbau') || name.includes('boat builder') || name.includes('constructeur naval') ||
        name.includes('chantier naval') || name.includes('cantiere navale') || name.includes('astillero')) {
        return 'Bootsbauer';
    }

    // ZUBEHÖR / ACCASTILLAGE
    if (shop.includes('boat') || shop.includes('marine') || shop.includes('water_sports') ||
        shop.includes('hardware') || shop.includes('sports') ||
        name.includes('accastillage') || name.includes('shipchandler') || name.includes('chandler') ||
        name.includes('nautique') || name.includes('bootszubehör') || name.includes('marine shop') ||
        name.includes('marine supply')) {
        return 'Zubehör';
    }

    // WERKSTATT / REPARATUR
    if (amenity === 'workshop' || name.includes('réparation') || name.includes('repair') ||
        name.includes('werkstatt') || name.includes('werft') || name.includes('chantier') ||
        name.includes('shipyard') || name.includes('boatyard') || name.includes('boat service') ||
        name.includes('marine service')) {
        return 'Werkstatt';
    }

    // MARINA
    if (tags.leisure === 'marina' || tags['seamark:type'] === 'harbour' ||
        tags.harbour === 'yes' || tags.port === 'yes' ||
        tags.amenity === 'boat_rental' || tags.amenity === 'boat_sharing' ||
        name.includes('marina') || name.includes('port') || name.includes('hafen') ||
        name.includes('yacht club') || name.includes('yachtclub')) {
        return 'Marina';
    }

    // Fallback: Maritime Bezüge → Werkstatt
    if (tags.craft || tags.shop === 'boat' || tags['seamark:type']) {
        return 'Werkstatt';
    }

    return 'Sonstige';
}

// NEU: Erkennt ALLE passenden Kategorien (nicht nur erste)
function detectAllCategories(tags, knownName = '') {
    if (!tags) return ['Sonstige'];

    const name = (tags.name || knownName || '').toLowerCase();
    const shop = (tags.shop || '').toLowerCase();
    const craft = (tags.craft || '').toLowerCase();
    const amenity = (tags.amenity || '').toLowerCase();

    const categories = [];

    // SEGELMACHER
    if (craft === 'sailmaker' || name.includes('voilerie') || name.includes('sailmaker') ||
        name.includes('sail loft') || name.includes('segel')) categories.push('Segelmacher');

    // RIGG
    if (craft === 'rigger' || name.includes('gréement') || name.includes('rigging') ||
        name.includes('tauwerk') || name.includes('takelage') || tags.shop === 'rope') categories.push('Rigg');

    // INSTRUMENTE / ELEKTRONIK
    if (name.includes('électronique') || name.includes('electronic') || name.includes('instrument') ||
        name.includes('navigation') || craft.includes('electronics')) categories.push('Instrumente');

    // HEIZUNG / KLIMA
    if (name.includes('heizung') || name.includes('klimaanlage') || name.includes('klimatechnik') ||
        name.includes('chauffage') || name.includes('climatisation') || name.includes('webasto') ||
        name.includes('hvac')) categories.push('Heizung/Klima');

    // GUTACHTER
    if (name.includes('surveyor') || name.includes('gutachter') || name.includes('expert maritime') ||
        name.includes('expertise') || name.includes('perito')) categories.push('Gutachter');

    // LACKIEREREI
    if (name.includes('antifouling') || name.includes('lackier') || name.includes('osmose') ||
        name.includes('peinture') || name.includes('carénage') || name.includes('painting')) categories.push('Lackiererei');

    // KRAN / TRAVEL LIFT
    if (name.includes('travelift') || name.includes('travel lift') || name.includes('kran') ||
        name.includes('grue') || name.includes('crane') || tags.man_made === 'slipway') categories.push('Kran');

    // MOTORSERVICE
    if (name.includes('motor') || name.includes('moteur') || name.includes('engine') ||
        name.includes('outboard') || name.includes('hors-bord') || name.includes('mécanique')) categories.push('Motorservice');

    // WINTERLAGER
    if (name.includes('winterlager') || name.includes('hivernage') || name.includes('wintering') ||
        name.includes('stockage')) categories.push('Winterlager');

    // BOOTSBAUER
    if (craft.includes('boatbuilder') || tags.industrial === 'shipyard' ||
        name.includes('bootsbau') || name.includes('boat builder') || name.includes('constructeur naval') ||
        name.includes('cantiere navale') || name.includes('astillero')) categories.push('Bootsbauer');

    // ZUBEHÖR
    if (shop.includes('boat') || shop.includes('marine') || shop.includes('water_sports') ||
        shop.includes('hardware') || name.includes('accastillage') || name.includes('shipchandler') ||
        name.includes('chandler') || name.includes('bootszubehör') || name.includes('marine supply')) categories.push('Zubehör');

    // WERKSTATT
    if (amenity === 'workshop' || name.includes('réparation') || name.includes('repair') ||
        name.includes('werkstatt') || name.includes('werft') || name.includes('chantier') ||
        name.includes('boatyard') || name.includes('boat service') || name.includes('marine service')) categories.push('Werkstatt');

    // MARINA
    if (tags.leisure === 'marina' || tags['seamark:type'] === 'harbour' ||
        tags.harbour === 'yes' || tags.port === 'yes' ||
        tags.amenity === 'boat_rental' || tags.amenity === 'boat_sharing' ||
        name.includes('marina') || name.includes('port') || name.includes('hafen') ||
        name.includes('yacht club')) categories.push('Marina');

    if (categories.length === 0) categories.push('Sonstige');
    return [...new Set(categories)];
}

// NEU: Extrahiert Services/Produkte aus OSM Tags
function extractServices(tags) {
    if (!tags) return [];

    const services = [];

    // Aus craft-Tags
    if (tags.craft) {
        const crafts = {
            'sailmaker': 'Segelmacherei',
            'boatbuilder': 'Bootsbau',
            'rigger': 'Takelage',
            'electronics': 'Elektronik',
            'upholsterer': 'Polsterung'
        };
        if (crafts[tags.craft]) services.push(crafts[tags.craft]);
    }

    // Aus services-Tag (falls vorhanden)
    if (tags.services) {
        const servicesList = tags.services.split(';').map(s => s.trim());
        services.push(...servicesList);
    }

    // Aus description parsen
    if (tags.description) {
        const desc = tags.description.toLowerCase();
        if (desc.includes('repair')) services.push('Reparatur');
        if (desc.includes('maintenance')) services.push('Wartung');
        if (desc.includes('installation')) services.push('Installation');
        if (desc.includes('rigging')) services.push('Takelage');
        if (desc.includes('electronics')) services.push('Elektronik');
        if (desc.includes('engine')) services.push('Motorservice');
        if (desc.includes('sails')) services.push('Segel');
    }

    // Aus shop-Tags
    if (tags.shop) {
        const shops = {
            'boat': 'Bootszubehör',
            'marine': 'Marinebedarf',
            'fishing': 'Angelbedarf',
            'water_sports': 'Wassersport',
            'hardware': 'Eisenwaren',
            'electronics': 'Elektronik'
        };
        if (shops[tags.shop]) services.push(shops[tags.shop]);
    }

    // Entferne Duplikate
    return [...new Set(services)];
}

// NEU: Extrahiert Marken aus OSM Tags
function extractBrands(tags) {
    if (!tags) return [];

    const brands = [];

    // Direkt aus brand-Tag
    if (tags.brand) {
        brands.push(tags.brand);
    }

    // Aus brands-Tag (falls vorhanden, semicolon-separated)
    if (tags.brands) {
        const brandsList = tags.brands.split(';').map(b => b.trim());
        brands.push(...brandsList);
    }

    // Aus operator (manchmal ist der Betreiber auch eine Marke)
    if (tags.operator && !tags.operator.includes('private')) {
        brands.push(tags.operator);
    }

    // Aus description parsen (gängige Marken)
    if (tags.description) {
        const desc = tags.description;
        const commonBrands = [
            'Volvo', 'Yanmar', 'Yamaha', 'Mercury', 'Honda', 'Suzuki',
            'Garmin', 'Raymarine', 'Simrad', 'B&G', 'Furuno',
            'Harken', 'Lewmar', 'Ronstan', 'Spinlock',
            'North Sails', 'Quantum', 'Doyle', 'UK Sails',
            'Plastimo', 'Zodiac', 'Beneteau', 'Jeanneau'
        ];

        for (const brand of commonBrands) {
            if (desc.includes(brand)) {
                brands.push(brand);
            }
        }
    }

    // Entferne Duplikate und leere Einträge
    return [...new Set(brands.filter(b => b && b.length > 0))];
}

// NEU: Extrahiert Logo und Bilder aus OSM Tags
function extractImages(tags) {
    if (!tags) return { logo_url: null, cover_image_url: null, gallery_urls: [] };

    const images = {
        logo_url: null,
        cover_image_url: null,
        gallery_urls: []
    };

    // Logo aus verschiedenen Tags
    if (tags.logo) {
        images.logo_url = tags.logo;
    } else if (tags['brand:logo']) {
        images.logo_url = tags['brand:logo'];
    } else if (tags.image && tags.image.includes('logo')) {
        images.logo_url = tags.image;
    }

    // Cover/Main Image
    if (tags.image && !tags.image.includes('logo')) {
        images.cover_image_url = tags.image;
    } else if (tags['image:main']) {
        images.cover_image_url = tags['image:main'];
    }

    // Gallery/Multiple Images
    const galleryImages = [];

    // Aus image:N Tags (image:1, image:2, etc.)
    for (let i = 1; i <= 10; i++) {
        const imageTag = tags[`image:${i}`];
        if (imageTag) {
            galleryImages.push(imageTag);
        }
    }

    // Aus wikimedia_commons Tag
    if (tags.wikimedia_commons) {
        const wikiUrl = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(tags.wikimedia_commons)}`;
        galleryImages.push(wikiUrl);
    }

    // Aus website_image Tags
    if (tags.website_image) {
        const websiteImages = tags.website_image.split(';').map(url => url.trim());
        galleryImages.push(...websiteImages);
    }

    images.gallery_urls = galleryImages.filter(url => url && url.length > 0);

    // Falls kein Cover-Image aber Gallery vorhanden, nehme erstes Gallery-Bild als Cover
    if (!images.cover_image_url && images.gallery_urls.length > 0) {
        images.cover_image_url = images.gallery_urls[0];
    }

    return images;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function getStatusText(status) {
    const texts = {
        'pending': 'Ausstehend',
        'approved': 'Genehmigt',
        'rejected': 'Abgelehnt'
    };
    return texts[status] || status;
}

async function geocodeCity(city) {
    // NEU: Prüfe ob Input Koordinaten sind (Format: lat,lng)
    const coordPattern = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
    const coordMatch = city.match(coordPattern);

    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        console.log(`   📍 Koordinaten erkannt: ${lat}, ${lng}`);
        return { lat, lng, source: 'direct' };
    }

    // Nominatim Geocoding mit Verbesserungen
    try {
        // NEU: Hole mehrere Ergebnisse (limit=5) statt nur 1
        // NEU: countrycodes=fr einschränken wenn "France" im Query
        const isFrance = city.toLowerCase().includes('france');
        const countryCodes = isFrance ? '&countrycodes=fr' : '';

        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?` +
            `q=${encodeURIComponent(city)}&format=json&limit=5${countryCodes}&` +
            `addressdetails=1&extratags=1`
        );
        const data = await response.json();

        if (data && data.length > 0) {
            console.log(`   🔍 Gefunden: ${data.length} Geocoding-Ergebnisse`);

            // NEU: Filtere und bewerte Ergebnisse
            const scoredResults = data.map(result => {
                let score = 0;

                // Bevorzuge maritime Orte
                if (result.extratags?.place === 'harbour' ||
                    result.extratags?.leisure === 'marina') {
                    score += 50;
                }

                // Bevorzuge Städte/Orte über Straßen/Adressen
                if (result.type === 'city' || result.type === 'town' ||
                    result.type === 'village' || result.type === 'municipality') {
                    score += 30;
                } else if (result.type === 'administrative') {
                    score += 20;
                } else if (result.type === 'road' || result.type === 'house') {
                    score -= 20; // Penalize einzelne Adressen
                }

                // Bevorzuge höheren importance Score von Nominatim
                score += (parseFloat(result.importance) || 0) * 100;

                // Bevorzuge Küsten-Koordinaten (grobe Prüfung für Mittelmeer)
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                // Mittelmeer: ~30-48°N, ~-6-37°E
                if (lat >= 30 && lat <= 48 && lon >= -6 && lon <= 37) {
                    score += 10;
                }

                return { ...result, score };
            });

            // Sortiere nach Score (höchster zuerst)
            scoredResults.sort((a, b) => b.score - a.score);

            const best = scoredResults[0];
            console.log(`   ✅ Bestes Ergebnis: "${best.display_name}" (Score: ${best.score.toFixed(1)}, Type: ${best.type})`);

            // NEU: Warne wenn mehrdeutig (Top 2 Ergebnisse haben ähnlichen Score)
            if (scoredResults.length > 1) {
                const scoreDiff = scoredResults[0].score - scoredResults[1].score;
                if (scoreDiff < 10) {
                    console.warn(`   ⚠️ Mehrdeutig! Alternative: "${scoredResults[1].display_name}"`);

                    // Optional: Zeige User-Warnung in UI
                    if (document.getElementById('progress-text')) {
                        document.getElementById('progress-text').textContent =
                            `⚠️ Mehrdeutig: "${best.display_name}" gewählt (Alternative: "${scoredResults[1].display_name}")`;
                        document.getElementById('progress-text').style.color = '#f59e0b';
                    }
                }
            }

            return {
                lat: parseFloat(best.lat),
                lng: parseFloat(best.lon),
                source: 'nominatim',
                displayName: best.display_name,
                type: best.type,
                score: best.score
            };
        }
    } catch (error) {
        console.error('Nominatim Geocoding Fehler:', error);
    }

    return null;
}

// NEUE FUNKTION: Lade bekannte Provider aus JSON
async function loadKnownProviders() {
    try {
        const response = await fetch('known-providers.json');
        const data = await response.json();
        return data.providers || [];
    } catch (error) {
        console.log('⚠️ Keine known-providers.json gefunden:', error.message);
        return [];
    }
}

// NEUE FUNKTION: Suche nach spezifischen Betrieben in einem Ort
async function searchByNameInCity(businessName, city, country = 'France') {
    try {
        const searchQuery = `${businessName}, ${city}, ${country}`;
        console.log('🔍 Suche nach:', searchQuery);

        const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5`);
        const data = await response.json();

        if (data && data.length > 0) {
            console.log(`✅ ${data.length} Ergebnisse gefunden für "${businessName}"`);
            return data.map(item => ({
                type: 'node',
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                tags: {
                    name: item.display_name,
                    'addr:city': city,
                    'addr:country': country
                }
            }));
        } else {
            console.log(`❌ Kein Ergebnis für "${businessName}"`);
        }
    } catch (error) {
        console.error('Namensuche Fehler:', error);
    }
    return [];
}

// NEUE FUNKTION: Erweiterte Suche für Cap d'Agde (oder andere Orte)
async function searchSpecificLocation() {
    const location = document.getElementById('specific-location').value || 'Cap d\'Agde';

    // ERWEITERTE Liste bekannter Betriebe in französischen Häfen
    const businesses = [
        // Cap d'Agde spezifisch
        'Sud Croisaire', 'Navicap', 'Nav-Elec', 'Sudcrosaire',
        'Port Ambonne', 'Chantier Naval Cap d\'Agde',
        'Accastillage Diffusion', 'Marine Service Cap d\'Agde',

        // Allgemeine französische maritime Betriebe
        'Accastillage', 'Shipchandler', 'Chantier Naval',
        'Marine Service', 'Voilerie', 'Gréement',
        'Electronique Marine', 'Mécanique Marine',
        'Peinture Marine', 'Location Bateau',

        // Englische Begriffe
        'boat repair', 'marine electronics', 'sailmaker',
        'ship chandler', 'yacht service', 'boat yard'
    ];

    console.log(`🔍 Starte erweiterte Suche in ${location}...`);

    // Zeige Progress
    document.getElementById('search-progress').style.display = 'block';
    document.getElementById('progress-text').textContent = 'Starte spezifische Suche...';
    document.getElementById('progress-fill').style.width = '0%';

    const allResults = [];

    // 0. Lade bekannte Provider aus JSON (falls vorhanden)
    document.getElementById('progress-text').textContent = 'Lade bekannte Provider...';
    const knownProviders = await loadKnownProviders();
    console.log(`📋 ${knownProviders.length} bekannte Provider geladen`);

    // Filtere nach Stadt
    const localKnown = knownProviders.filter(p =>
        p.city.toLowerCase().includes(location.toLowerCase()) ||
        location.toLowerCase().includes(p.city.toLowerCase())
    );

    if (localKnown.length > 0) {
        console.log(`✅ ${localKnown.length} bekannte Provider in ${location} gefunden!`);
        // Konvertiere zu OSM-Format
        localKnown.forEach(p => {
            allResults.push({
                type: 'known',
                lat: p.coordinates[0],
                lon: p.coordinates[1],
                tags: {
                    name: p.name,
                    'addr:street': p.address,
                    'addr:postcode': p.postal_code,
                    'addr:city': p.city,
                    'addr:country': p.country,
                    website: p.website,
                    description: p.description
                },
                knownCategory: p.category,
                knownServices: p.services
            });
        });
    }

    // 1. Namensuche mit Nominatim
    for (let i = 0; i < businesses.length; i++) {
        const business = businesses[i];
        const progress = ((i + 1) / businesses.length) * 50; // Erste 50%
        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent = `Suche "${business}" (${i + 1}/${businesses.length})`;

        console.log(`   Suche "${business}"...`);
        const results = await searchByNameInCity(business, location);
        allResults.push(...results);
        await sleep(500); // Rate limiting
    }

    // 2. Überprüfe auch in der Nähe liegenden Orte
    const nearbyPlaces = [
        location,
        `Port ${location}`,
        `Marina ${location}`,
        location.replace('Cap d\'', '').trim() // z.B. "Agde" statt "Cap d'Agde"
    ];

    document.getElementById('progress-text').textContent = 'Durchsuche nahe Orte...';

    for (const place of nearbyPlaces) {
        if (place !== location && place !== '') {
            const coords = await geocodeCity(place);
            if (coords) {
                const results = await searchProvidersNearPoint(coords.lat, coords.lng, 3);
                allResults.push(...results);
            }
            await sleep(1000);
        }
    }

    // 3. Kombiniere mit regulärer Overpass-Suche
    const coords = await geocodeCity(location);
    if (coords) {
        document.getElementById('progress-fill').style.width = '75%';
        document.getElementById('progress-text').textContent = 'Führe Overpass-Suche durch...';

        console.log(`   Führe Overpass-Suche durch...`);
        const overpassResults = await searchProvidersNearPoint(coords.lat, coords.lng, 5);
        allResults.push(...overpassResults);

        // Erweitere Suchradius für Häfen
        document.getElementById('progress-fill').style.width = '90%';
        document.getElementById('progress-text').textContent = 'Erweiterte Hafensuche...';
        const harborResults = await searchProvidersNearPoint(coords.lat, coords.lng, 10);
        allResults.push(...harborResults);
    }

    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('progress-text').textContent = `Fertig! ${allResults.length} Ergebnisse gefunden`;

    console.log(`✅ Gesamt ${allResults.length} Ergebnisse gefunden`);
    displaySearchResults(allResults);

    // Verstecke Progress nach 2 Sekunden
    setTimeout(() => {
        document.getElementById('search-progress').style.display = 'none';
    }, 2000);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Login anzeigen (falls nicht authentifiziert)
function showLogin() {
    console.log('🔐 Zeige Login-Formular');

    document.body.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: var(--bg-color);">
            <div style="background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width: 400px; width: 100%;">
                <h2 style="margin-bottom: 24px; display:flex; align-items:center; gap:10px; justify-content:center;"><img src="/icon-192.png" alt="" style="width:40px;height:40px;border-radius:8px;"> Skipily Admin Login</h2>
                <div id="login-error" style="display: none; padding: 12px; background: #fee2e2; color: #991b1b; border-radius: 8px; margin-bottom: 16px; font-size: 14px;"></div>
                <form id="login-form">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">E-Mail</label>
                        <input type="email" id="email" required
                               style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;"
                               placeholder="ihre-email@example.com" />
                    </div>
                    <div style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500;">Passwort</label>
                        <input type="password" id="password" required
                               style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;"
                               placeholder="••••••••" />
                    </div>
                    <button type="submit" id="login-btn"
                            style="width: 100%; padding: 14px; background: #2563eb; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px; transition: background 0.2s;">
                        Anmelden
                    </button>
                </form>
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 12px; color: #64748b; margin: 0;">
                        💡 Hinweis: Sie benötigen Admin-Berechtigung
                    </p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('login-btn');
        const errorDiv = document.getElementById('login-error');

        console.log('🔑 Login-Versuch für:', email);

        // Button deaktivieren
        btn.disabled = true;
        btn.textContent = 'Anmelden...';
        errorDiv.style.display = 'none';

        try {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                console.error('❌ Login-Fehler:', error);
                throw error;
            }

            console.log('✅ Login erfolgreich:', data);

            // Kurz warten und dann neu laden
            setTimeout(() => {
                window.location.reload();
            }, 500);

        } catch (error) {
            console.error('❌ Login fehlgeschlagen:', error);

            // Fehler anzeigen
            let errorMessage = 'Login fehlgeschlagen';
            if (error.message.includes('Invalid login credentials')) {
                errorMessage = 'Ungültige E-Mail oder Passwort';
            } else if (error.message.includes('Email not confirmed')) {
                errorMessage = 'E-Mail-Adresse noch nicht bestätigt';
            } else {
                errorMessage = error.message;
            }

            errorDiv.textContent = errorMessage;
            errorDiv.style.display = 'block';

            // Button wieder aktivieren
            btn.disabled = false;
            btn.textContent = 'Anmelden';
        }
    });
}

// ============================================
// GLOBAL SCRAPING
// ============================================

const EUROPEAN_PORTS = {
    'france-med': [
        "Cap d'Agde, France", "Le Grau du Roi, France", "Port Camargue, France",
        "Gruissan, France",  // NEU: Wichtiger Yachthafen hinzugefügt
        "Sète, France", "Marseillan, France", "Palavas-les-Flots, France",
        "La Grande-Motte, France", "Marseille, France", "Toulon, France",
        "Nice, France", "Antibes, France", "Cannes, France", "Saint-Tropez, France"
    ],
    'france-atlantic': [
        "La Rochelle, France", "Les Sables-d'Olonne, France", "Lorient, France",
        "Brest, France", "Saint-Malo, France", "Pornic, France", "Arcachon, France"
    ],
    'spain-med': [
        "Barcelona, Spain", "Valencia, Spain", "Alicante, Spain",
        "Málaga, Spain", "Palma de Mallorca, Spain", "Ibiza, Spain"
    ],
    'italy': [
        "Genoa, Italy", "La Spezia, Italy", "Venice, Italy",
        "Trieste, Italy", "Naples, Italy", "Palermo, Italy"
    ],
    'croatia': ["Split, Croatia", "Dubrovnik, Croatia", "Zadar, Croatia", "Pula, Croatia"],
    'greece': ["Athens Piraeus, Greece", "Corfu, Greece", "Rhodes, Greece", "Santorini, Greece"],
    'germany': ["Hamburg, Germany", "Kiel, Germany", "Rostock, Germany", "Flensburg, Germany"],
    'netherlands': ["Amsterdam, Netherlands", "Rotterdam, Netherlands", "Den Haag, Netherlands"],
    'uk': ["Southampton, UK", "Portsmouth, UK", "Brighton, UK", "Plymouth, UK"],
    'scandinavia': ["Copenhagen, Denmark", "Gothenburg, Sweden", "Stockholm, Sweden", "Oslo, Norway", "Bergen, Norway"]
};

let scrapingCancelled = false;
let scrapingResults = [];

async function startGlobalScraping() {
    const region = document.getElementById('global-region').value;
    const radius = parseInt(document.getElementById('global-radius').value);
    const customLocation = document.getElementById('global-custom-location').value;

    scrapingCancelled = false;
    scrapingResults = [];

    // Zeige Progress
    document.getElementById('search-progress').style.display = 'block';
    document.getElementById('scraping-stats').style.display = 'block';
    document.getElementById('progress-fill').style.width = '0%';

    let locations = [];

    if (region === 'custom') {
        if (!customLocation) {
            alert('Bitte einen Ort eingeben!');
            return;
        }
        locations = [customLocation];
    } else if (region === 'europe-all') {
        // Alle Regionen kombinieren
        locations = Object.values(EUROPEAN_PORTS).flat();
    } else {
        locations = EUROPEAN_PORTS[region] || [];
    }

    if (locations.length === 0) {
        alert('Keine Orte für diese Region definiert!');
        return;
    }

    console.log(`🌍 Starte globales Scraping für ${locations.length} Orte`);
    document.getElementById('stats-locations').textContent = locations.length;

    for (let i = 0; i < locations.length; i++) {
        if (scrapingCancelled) {
            console.log('⏹️ Scraping abgebrochen');
            break;
        }

        const location = locations[i];
        const progress = ((i + 1) / locations.length) * 100;

        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent = 
            `[${i + 1}/${locations.length}] Durchsuche ${location}...`;

        console.log(`\n[${i + 1}/${locations.length}] ${location}`);

        try {
            const providers = await scrapeLocation(location, radius);
            scrapingResults.push(...providers);

            document.getElementById('stats-total').textContent = scrapingResults.length;

            console.log(`   ✅ ${providers.length} Provider gefunden (Gesamt: ${scrapingResults.length})`);
        } catch (error) {
            console.error(`   ❌ Fehler bei ${location}:`, error);
        }

        // Pause zwischen Orten (Rate Limiting)
        await sleep(2000);
    }

    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('progress-text').textContent = 
        `✅ Fertig! ${scrapingResults.length} Provider gefunden`;

    // Zeige Ergebnisse
    displaySearchResults(scrapingResults);

    console.log(`\n🎉 Scraping abgeschlossen!`);
    console.log(`   Gesamt: ${scrapingResults.length} Provider`);
}

async function scrapeLocation(location, radiusKm) {
    // Geocode Location
    const coords = await geocodeCity(location);
    if (!coords) {
        const errorMsg = `❌ Fehler: Ort "${location}" konnte nicht gefunden werden (Geocoding fehlgeschlagen)`;
        console.error(errorMsg);

        // Zeige Fehler in UI
        if (document.getElementById('progress-text')) {
            document.getElementById('progress-text').textContent = errorMsg;
            document.getElementById('progress-text').style.color = '#ef4444'; // Rot
        }

        // Alert für Benutzer
        alert(`Geocoding-Fehler:\n\n"${location}" konnte nicht auf der Karte gefunden werden.\n\nBitte prüfen Sie:\n- Schreibweise korrekt?\n- Format: "Stadt, Land" (z.B. "Gruissan, France")\n- Versuchen Sie Koordinaten: lat,lng (z.B. 43.1089,3.0828)`);

        return [];
    }

    console.log(`   📍 ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);

    // NEU: Zeige detaillierte Geocoding-Info
    if (coords.displayName) {
        console.log(`   📍 Ort: "${coords.displayName}" (Type: ${coords.type}, Score: ${coords.score?.toFixed(1)})`);
    }

    // NEU: Zeige in UI
    if (document.getElementById('progress-text')) {
        const sourceText = coords.source === 'direct' ? '(direkte Koordinaten)' : `(${coords.type || 'geocoded'})`;
        document.getElementById('progress-text').textContent =
            `✓ "${location}" gefunden: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} ${sourceText}`;
        document.getElementById('progress-text').style.color = ''; // Reset color
    }

    // NEU: Debug-Panel Update
    if (document.getElementById('show-debug-info')?.checked && document.getElementById('debug-geocoding')) {
        document.getElementById('debug-geocoding').textContent =
            `Geocoding: ✓ ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} - ${coords.displayName || location}`;
    }

    // Prüfe ob Marina-zentrierte Suche aktiviert ist
    const marinaCentered = document.getElementById('marina-centered-search')?.checked || false;

    let results = [];

    if (marinaCentered) {
        // NEUE STRATEGIE: Finde zuerst Marinas, dann suche um diese herum
        console.log(`   ⚓ Marina-zentrierte Suche aktiviert`);

        // 1. Finde alle Marinas in der Umgebung
        const marinas = await searchMarinasNearPoint(coords.lat, coords.lng, radiusKm);
        console.log(`   ✅ ${marinas.length} Marinas gefunden`);

        // NEU: Debug-Panel Update
        if (document.getElementById('show-debug-info')?.checked && document.getElementById('debug-marina-count')) {
            document.getElementById('debug-marina-count').textContent =
                `Marinas gefunden: ${marinas.length}`;
        }

        // 2. Suche Service-Betriebe um jede Marina herum (kleinerer Radius)
        const serviceRadius = 3; // 3km um jede Marina
        const allServices = [];

        for (const marina of marinas) {
            const marinaLat = marina.lat || marina.center?.lat;
            const marinaLon = marina.lon || marina.center?.lon;

            if (marinaLat && marinaLon) {
                console.log(`      Suche um ${marina.tags?.name || 'Marina'} herum...`);
                const services = await searchServiceProvidersNearPoint(marinaLat, marinaLon, serviceRadius);
                allServices.push(...services);
                await sleep(500); // Rate limiting
            }
        }

        // 3. NEUE: Stadt-zentrierte Suche mit größerem Radius
        console.log(`      Zusätzliche Stadt-Suche...`);
        const cityServices = await searchServiceProvidersNearPoint(
            coords.lat,
            coords.lng,
            radiusKm * 1.5  // Größerer Radius für Stadtsuche
        );
        allServices.push(...cityServices);

        // 4. Dedupliziere basierend auf Koordinaten
        console.log(`   📊 Gefunden: ${allServices.length} Service-Betriebe (vor Deduplizierung)`);
        results = deduplicateByLocation(allServices, 50);
        console.log(`   ✅ Nach Deduplizierung: ${results.length} Service-Betriebe`);

        // NEU: Google Search Fallback wenn 0 OSM-Ergebnisse
        if (results.length === 0 && USE_GOOGLE_SEARCH_FALLBACK) {
            console.log(`   ⚠️ OSM lieferte 0 Ergebnisse. Versuche Google Search Fallback...`);

            // Zeige Info in UI
            if (document.getElementById('progress-text')) {
                document.getElementById('progress-text').textContent =
                    `🔄 OSM: 0 Ergebnisse → Fallback zu Google Search...`;
                document.getElementById('progress-text').style.color = '#f59e0b';
            }

            const googleResults = [];

            // Suche für jede Kategorie
            console.log(`      Google Search für alle Kategorien...`);
            for (const category of Object.keys(GOOGLE_SEARCH_CATEGORIES)) {
                const categoryResults = await searchProvidersViaGoogleSearch(
                    location,
                    category
                );
                googleResults.push(...categoryResults);
                await sleep(500); // Rate limiting
            }

            // Deduplizierung
            results = deduplicateByLocation(googleResults, 50);
            console.log(`   ✅ Google Search: ${results.length} Provider gefunden`);

            // Update UI
            if (document.getElementById('progress-text')) {
                document.getElementById('progress-text').textContent =
                    `✓ Google Search Fallback: ${results.length} Provider gefunden`;
                document.getElementById('progress-text').style.color = '#10b981';
            }
        }
    } else {
        // Normale Suche: Alles im Radius
        results = await searchProvidersNearPoint(coords.lat, coords.lng, radiusKm);

        // NEU: Google Search Fallback auch bei normaler Suche wenn 0 Ergebnisse
        if (results.length === 0 && USE_GOOGLE_SEARCH_FALLBACK) {
            console.log(`   ⚠️ OSM: 0 Ergebnisse → Google Search Fallback`);

            if (document.getElementById('progress-text')) {
                document.getElementById('progress-text').textContent =
                    `🔄 Google Search Fallback wird aktiviert...`;
                document.getElementById('progress-text').style.color = '#f59e0b';
            }

            results = await searchProvidersViaGoogleSearch(location);

            if (document.getElementById('progress-text')) {
                document.getElementById('progress-text').textContent =
                    `✓ Google Search: ${results.length} Provider gefunden`;
                document.getElementById('progress-text').style.color = '#10b981';
            }
        }
    }

    // NEU: Filtere gegen Ignore-Patterns (bevor Review-Modus)
    const ignorePatterns = await loadIgnorePatterns();
    const filteredResults = filterResultsAgainstIgnorePatterns(results, ignorePatterns);

    console.log(`   📊 Nach Ignore-Pattern-Filter: ${filteredResults.length} Provider`);

    // NEU: Debug-Panel Update für Provider-Count
    if (document.getElementById('show-debug-info')?.checked && document.getElementById('debug-provider-count')) {
        document.getElementById('debug-provider-count').textContent =
            `Provider gefunden: ${filteredResults.length} (${filteredResults[0]?.tags?.source || 'osm'})`;
    }

    return filteredResults;
}

function cancelScraping() {
    scrapingCancelled = true;
    document.getElementById('progress-text').textContent = 'Abbrechen...';
}

async function bulkImportResults() {
    if (scrapingResults.length === 0) {
        alert('Keine Ergebnisse zum Importieren!');
        return;
    }

    // NEU: Prüfe ob Review-Modus aktiviert
    const reviewModeEnabled = document.getElementById('enable-review-mode')?.checked ?? true;

    if (reviewModeEnabled && scrapingResults.length > 0) {
        console.log('📋 Review-Modus aktiviert → Zeige Ergebnisse zur Überprüfung');
        showReviewMode(scrapingResults);
        return; // Stoppe Import, warte auf User-Bestätigung
    }

    // Wenn Review-Modus deaktiviert, führe normalen Import durch
    await bulkImportResultsInternal();
}

/**
 * Interne Bulk-Import Funktion (vom Review-Modus aufgerufen oder direkt)
 */
async function bulkImportResultsInternal() {
    if (scrapingResults.length === 0) {
        alert('Keine Ergebnisse zum Importieren!');
        return;
    }

    console.log(`📊 Total scraping results: ${scrapingResults.length}`);

    let filteredByNameOrTags = 0;

    // ERWEITERTE Filterung: Akzeptiere Provider mit Namen ODER gültigen Tags
    const validResults = scrapingResults.filter(r => {
        const name = r.tags?.name || r.knownName;
        const hasValidTags = r.tags && (
            r.tags.craft ||
            r.tags.shop ||
            r.tags.amenity ||
            r.tags.seamark ||
            r.tags.leisure ||
            r.tags.port ||
            r.tags.industrial ||
            r.tags.man_made
        );

        // Akzeptiere wenn: (Name existiert UND ist nicht "Unbekannt") ODER (hat gültige OSM Tags)
        const isValid = (name && name !== 'Unbekannt') || hasValidTags;

        if (!isValid) {
            filteredByNameOrTags++;
            console.log(`❌ Filtered (no name/tags): lat=${r.lat}, lon=${r.lon}, tags=`, r.tags);
        }

        return isValid;
    });

    console.log(`✅ Valid results after filtering: ${validResults.length}`);
    console.log(`❌ Filtered by name/tags: ${filteredByNameOrTags}`);

    const skipped = scrapingResults.length - validResults.length;

    if (validResults.length === 0) {
        alert('❌ Keine gültigen Provider gefunden! Alle Ergebnisse wurden übersprungen.');
        return;
    }

    const message = skipped > 0
        ? `Möchtest du ${validResults.length} Provider importieren?\n\n⚠️ ${skipped} Provider ohne Namen/Tags werden übersprungen.`
        : `Möchtest du ${validResults.length} Provider importieren?`;

    if (!confirm(message)) {
        return;
    }

    let imported = 0;
    let errors = 0;
    let duplicates = 0;
    let generatedNames = 0;

    // Lade existierende Provider einmal am Anfang
    const { data: existingProviders } = await supabaseClient
        .from('service_providers')
        .select('id, name, latitude, longitude');

    for (let i = 0; i < validResults.length; i++) {
        const result = validResults[i];

        try {
            let name = result.tags?.name || result.knownName;
            const latitude = result.lat || result.center?.lat;
            const longitude = result.lon || result.center?.lon;

            // Generiere Fallback-Namen für POIs ohne Namen
            if (!name || name === 'Unbekannt') {
                const city = result.tags?.['addr:city'] || 'Unknown';
                if (result.tags?.craft) {
                    name = `${result.tags.craft} (${city})`;
                } else if (result.tags?.shop) {
                    name = `${result.tags.shop} shop (${city})`;
                } else if (result.tags?.amenity) {
                    name = `${result.tags.amenity} (${city})`;
                } else if (result.tags?.leisure) {
                    name = `${result.tags.leisure} (${city})`;
                } else {
                    name = `Service Provider (${city})`;
                }
                generatedNames++;
                console.log(`🏷️ Generated name: "${name}" from tags:`, result.tags);
            }

            // Erkenne ALLE Kategorien (nicht nur erste)
            const allCategories = detectAllCategories(result.tags, name);
            const primaryCategory = allCategories[0]; // Erste Kategorie = primär

            // Extrahiere Services, Brands und Bilder
            const services = extractServices(result.tags);
            const brands = extractBrands(result.tags);
            const images = extractImages(result.tags);

            const data = {
                name: name,
                category: primaryCategory, // Primäre Kategorie für Rückwärtskompatibilität
                categories: allCategories, // ALLE Kategorien
                services: services.length > 0 ? services : null, // Produkte/Leistungen
                brands: brands.length > 0 ? brands : null, // Vertretene Marken
                logo_url: images.logo_url, // NEU: Logo
                cover_image_url: images.cover_image_url, // NEU: Cover-Bild
                gallery_urls: images.gallery_urls.length > 0 ? images.gallery_urls : null, // NEU: Galerie
                street: result.tags?.['addr:street'] || null,
                postal_code: result.tags?.['addr:postcode'] || null,
                city: result.tags?.['addr:city'] || null,
                country: result.tags?.['addr:country'] || null,
                latitude: latitude,
                longitude: longitude,
                phone: result.tags?.phone || null,
                email: result.tags?.email || null,
                website: result.tags?.website || null
            };

            // Debug-Logging für Multiple Kategorien, Services und Bilder
            if (allCategories.length > 1) {
                console.log(`📂 Multiple Kategorien für "${name}":`, allCategories);
            }
            if (services.length > 0) {
                console.log(`🔧 Services für "${name}":`, services);
            }
            if (brands.length > 0) {
                console.log(`🏷️ Brands für "${name}":`, brands);
            }
            if (images.logo_url || images.cover_image_url || images.gallery_urls.length > 0) {
                console.log(`🖼️ Bilder für "${name}":`, {
                    logo: images.logo_url ? '✓' : '✗',
                    cover: images.cover_image_url ? '✓' : '✗',
                    gallery: images.gallery_urls.length
                });
            }

            // Prüfe auf Duplikate
            let isDuplicate = false;
            if (existingProviders && existingProviders.length > 0) {
                for (const existing of existingProviders) {
                    if (existing.name === data.name) {
                        const latDiff = Math.abs(existing.latitude - data.latitude);
                        const lonDiff = Math.abs(existing.longitude - data.longitude);

                        // Weniger als 100m Distanz = Duplikat
                        if (latDiff < 0.001 && lonDiff < 0.001) {
                            isDuplicate = true;
                            duplicates++;
                            console.log(`Überspringe Duplikat: ${data.name}`);
                            break;
                        }
                    }
                }
            }

            if (!isDuplicate) {
                const { error } = await supabaseClient
                    .from('service_providers')
                    .insert([data]);

                if (error) {
                    console.error(`Fehler bei ${data.name}:`, error);
                    errors++;
                } else {
                    imported++;
                    // Füge zur existingProviders Liste hinzu
                    existingProviders.push({ name: data.name, latitude: data.latitude, longitude: data.longitude });
                    document.getElementById('stats-imported').textContent = imported;
                }
            }

        } catch (error) {
            console.error('Import-Fehler:', error);
            errors++;
        }

        // Progress Update
        const progress = ((i + 1) / validResults.length) * 100;
        document.getElementById('progress-text').textContent =
            `Importiere ${i + 1}/${validResults.length}...`;
        document.getElementById('progress-fill').style.width = progress + '%';

        // Rate Limiting
        if (i % 10 === 0) {
            await sleep(500);
        }
    }

    let resultMessage = `✅ Import abgeschlossen!\n\nImportiert: ${imported}`;
    if (generatedNames > 0) {
        resultMessage += `\n🏷️ Namen generiert: ${generatedNames}`;
    }
    if (duplicates > 0) resultMessage += `\nDuplikate übersprungen: ${duplicates}`;
    if (skipped > 0) resultMessage += `\nOhne Namen übersprungen: ${skipped}`;
    if (errors > 0) resultMessage += `\nFehler: ${errors}`;

    alert(resultMessage);
    document.getElementById('progress-text').textContent =
        `✅ ${imported} Provider importiert`;
}

// ============================================
// BULK DELETE FUNCTIONS
// ============================================

function updateBulkActionsBar() {
    const checkboxes = document.querySelectorAll('.provider-checkbox:checked');
    const count = checkboxes.length;
    const bulkBar = document.getElementById('bulk-actions-bar');
    const countSpan = document.getElementById('selected-count');

    if (count > 0) {
        bulkBar.style.display = 'block';
        countSpan.textContent = `${count} ausgewählt`;
    } else {
        bulkBar.style.display = 'none';
    }
}

function toggleCategorySelection(category, checked) {
    const checkboxes = document.querySelectorAll(`.provider-checkbox[data-category="${category}"]`);
    checkboxes.forEach(cb => cb.checked = checked);
    updateBulkActionsBar();
}

function selectAllProviders() {
    const checkboxes = document.querySelectorAll('.provider-checkbox');
    checkboxes.forEach(cb => cb.checked = true);

    // Auch Kategorie-Checkboxen aktivieren
    const categoryCheckboxes = document.querySelectorAll('.select-all-category');
    categoryCheckboxes.forEach(cb => cb.checked = true);

    updateBulkActionsBar();
}

function deselectAllProviders() {
    const checkboxes = document.querySelectorAll('.provider-checkbox');
    checkboxes.forEach(cb => cb.checked = false);

    // Auch Kategorie-Checkboxen deaktivieren
    const categoryCheckboxes = document.querySelectorAll('.select-all-category');
    categoryCheckboxes.forEach(cb => cb.checked = false);

    updateBulkActionsBar();
}

async function bulkDeleteProviders() {
    const checkboxes = document.querySelectorAll('.provider-checkbox:checked');
    const providerIds = Array.from(checkboxes).map(cb => cb.dataset.providerId);

    if (providerIds.length === 0) {
        alert('Keine Provider ausgewählt!');
        return;
    }

    const confirmed = confirm(
        `⚠️ Möchten Sie wirklich ${providerIds.length} Provider löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!`
    );

    if (!confirmed) return;

    try {
        // Verwende RPC-Funktion für Bulk-Löschung (umgeht RLS-Policies)
        const { data, error } = await supabaseClient.rpc('bulk_delete_providers', {
            provider_ids: providerIds
        });

        if (error) {
            console.error('Fehler bei Bulk-Löschung:', error);
            alert(`❌ Fehler beim Löschen:\n${error.message}`);
            return;
        }

        console.log('Bulk-Löschung Ergebnis:', data);
        alert(`✅ Bulk-Löschung abgeschlossen!\n\nGelöscht: ${data.deleted}\nFehler: ${data.errors}\nGesamt: ${data.total}`);

        // Seite neu laden
        await loadProvidersByCategory();
    } catch (error) {
        console.error('Fehler bei Bulk-Löschung:', error);
        alert(`❌ Fehler: ${error.message}`);
    }
}

// Event Listener für Region-Select
document.addEventListener('DOMContentLoaded', () => {
    const regionSelect = document.getElementById('global-region');
    const customInput = document.getElementById('custom-location-input');

    if (regionSelect) {
        regionSelect.addEventListener('change', (e) => {
            customInput.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
    }

    // NEU: Debug-Info Toggle
    const debugCheckbox = document.getElementById('show-debug-info');
    if (debugCheckbox) {
        debugCheckbox.addEventListener('change', (e) => {
            const debugPanel = document.getElementById('scraping-debug-info');
            if (debugPanel) {
                debugPanel.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }
});

// ============================================
// CRAWL4AI + N8N SCRAPING
// ============================================

const CRAWL4AI_SERVICE_URL = 'http://localhost:8765';
const N8N_DEFAULT_WEBHOOK = 'http://localhost:5678/webhook/marine-scraper';

/**
 * Prüft ob Crawl4AI Service und N8N laufen.
 */
async function checkCrawl4AIStatus() {
    const indicator = document.getElementById('crawl4ai-status-indicator');
    if (!indicator) return;
    indicator.textContent = '⏳ Prüfe...';

    const results = [];

    // Crawl4AI Service prüfen
    try {
        const r = await fetch(`${CRAWL4AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
        const data = await r.json();
        results.push('✅ Crawl4AI Service (Port 8765)');
    } catch {
        results.push('❌ Crawl4AI Service nicht erreichbar – <code>python crawl4ai_service.py</code> starten');
    }

    // N8N prüfen
    const n8nUrl = document.getElementById('n8n-webhook-url')?.value || N8N_DEFAULT_WEBHOOK;
    try {
        const r = await fetch(n8nUrl.replace('/webhook/', '/healthz').split('/webhook/')[0] + '/healthz',
                              { signal: AbortSignal.timeout(3000), mode: 'no-cors' });
        results.push('✅ N8N (Port 5678)');
    } catch {
        results.push('❌ N8N nicht erreichbar – <code>npx n8n</code> starten');
    }

    indicator.innerHTML = results.join(' &nbsp;|&nbsp; ');
}

/**
 * Prüft robots.txt für alle eingetragenen URLs und zeigt das Ergebnis an.
 */
async function checkRobotsTxtForUrls() {
    const textarea = document.getElementById('crawl-websites');
    if (!textarea) return;

    const urls = textarea.value.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) {
        alert('Bitte mindestens eine URL eingeben (mit http/https)');
        return;
    }

    const resultsDiv = document.getElementById('robots-check-results');
    const listDiv = document.getElementById('robots-results-list');
    resultsDiv.style.display = 'block';
    listDiv.innerHTML = '⏳ Prüfe...';

    const rows = [];
    for (const url of urls) {
        try {
            const result = await window.checkRobotsTxt(url);
            const badge = window.robotsStatusBadge(result);
            rows.push(`<div style="padding:4px 0; border-bottom:1px solid #f0fdf4;">
                <a href="${url}" target="_blank" style="font-size:12px; color:#374151;">${url}</a><br>
                ${badge}
            </div>`);
        } catch (e) {
            rows.push(`<div style="padding:4px 0;"><span style="color:#999;">${url}</span> – Fehler: ${e.message}</div>`);
        }
    }
    listDiv.innerHTML = rows.join('');
}

/**
 * Crawlt URLs direkt über den lokalen Crawl Service (Port 8765).
 * N8N ist optional – funktioniert auch ohne N8N.
 */
async function startCrawl4AIScraping() {
    const textarea = document.getElementById('crawl-websites');
    const city = document.getElementById('crawl-city')?.value || '';
    const country = document.getElementById('crawl-country')?.value || '';
    const category = document.getElementById('crawl-category')?.value || 'Sonstige';

    const urls = textarea.value.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) {
        alert('Bitte mindestens eine URL eingeben');
        return;
    }

    const progressDiv = document.getElementById('crawl4ai-progress');
    const progressFill = document.getElementById('crawl4ai-progress-fill');
    const progressText = document.getElementById('crawl4ai-progress-text');
    const resultsDiv = document.getElementById('crawl4ai-results');
    const resultsList = document.getElementById('crawl4ai-results-list');

    progressDiv.style.display = 'block';
    progressFill.style.background = '#16a34a';
    progressFill.style.width = '5%';
    resultsDiv.style.display = 'none';

    const results = [];

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const pct = Math.round(((i + 0.5) / urls.length) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = `(${i + 1}/${urls.length}) Crawle: ${url}`;

        try {
            const response = await fetch(`${CRAWL4AI_SERVICE_URL}/crawl`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.robots_blocked) {
                results.push({ skipped: true, url, reason: data.reason });
            } else if (!data.success) {
                results.push({ skipped: true, url, reason: data.error || 'Crawl fehlgeschlagen' });
            } else {
                // Provider-Objekt zusammenbauen
                const provider = {
                    name: data.name || url.replace(/^https?:\/\//, '').split('/')[0],
                    category,
                    city,
                    country,
                    website: url,
                    phone: data.phone || '',
                    email: data.email || '',
                    description: data.description || '',
                    street: data.address_hint || '',
                    postal_code: data.postal_code || '',
                    mode: data.mode,
                    _crawled: true
                };
                results.push(provider);
            }
        } catch (e) {
            results.push({ skipped: true, url, reason: e.message });
        }
    }

    progressFill.style.width = '100%';
    const ok = results.filter(r => !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    progressText.textContent = `✅ Fertig: ${ok} gecrawlt, ${skipped} übersprungen`;

    // Ergebnisse anzeigen
    resultsDiv.style.display = 'block';
    const rows = results.map(r => {
        if (r.skipped) {
            return `<div style="color:#999; padding:6px 0; border-bottom:1px solid #f0fdf4;">
                ⏭️ <span style="font-size:11px;">${r.url}</span><br>
                <span style="font-size:11px; margin-left:16px;">${r.reason}</span>
            </div>`;
        }
        return `<div style="padding:8px 0; border-bottom:1px solid #f0fdf4;">
            ✅ <strong>${r.name}</strong>
            <span style="font-size:11px; color:#888; margin-left:6px;">[${r.mode}]</span><br>
            <span style="font-size:12px; color:#555; margin-left:16px;">
                ${r.phone ? '📞 ' + r.phone + ' &nbsp;' : ''}
                ${r.email ? '✉️ ' + r.email + ' &nbsp;' : ''}
                ${r.street ? '📍 ' + r.street : ''}
            </span>
        </div>`;
    });
    resultsList.innerHTML = rows.join('') +
        `<div style="margin-top:12px;">
            <button onclick="saveCrawledProviders()" class="btn-primary" style="background:#16a34a;">
                💾 ${ok} Provider in Supabase speichern
            </button>
        </div>`;

    // Ergebnisse für späteren Speicher-Schritt merken
    window._crawledProviders = results.filter(r => !r.skipped);
}

/**
 * Speichert die gecrawlten Provider direkt in Supabase.
 */
async function saveCrawledProviders() {
    const providers = window._crawledProviders || [];
    if (providers.length === 0) {
        alert('Keine Provider zum Speichern');
        return;
    }

    let saved = 0, errors = 0;
    for (const p of providers) {
        const record = {
            name: p.name,
            category: p.category,
            city: p.city || null,
            country: p.country || null,
            website: p.website || null,
            phone: p.phone || null,
            email: p.email || null,
            description: p.description || null,
            street: p.street || null,
            postal_code: p.postal_code || null,
            is_verified: false,
            is_active: true,
            user_id: null
        };
        try {
            const { error } = await supabaseClient.from('service_providers').insert([record]);
            if (error) throw error;
            saved++;
        } catch (e) {
            console.error('Speicher-Fehler für', p.name, e.message);
            errors++;
        }
    }

    alert(`✅ ${saved} Provider gespeichert${errors ? ', ' + errors + ' Fehler' : ''}`);
    if (saved > 0) loadDashboard();
}

window.saveCrawledProviders = saveCrawledProviders;

// Global verfügbar machen
window.checkCrawl4AIStatus = checkCrawl4AIStatus;
window.checkRobotsTxtForUrls = checkRobotsTxtForUrls;
window.startCrawl4AIScraping = startCrawl4AIScraping;

// Status beim Laden der Seite prüfen
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(checkCrawl4AIStatus, 2000);
});

// ============================================
// GOOGLE PLACES DISCOVERY SCRAPER
// Benötigt: scraper-backend auf localhost:3001
// ============================================

const SCRAPER_URL = GOOGLE_SCRAPER_BACKEND_URL; // Re-use existing constant from line 24

// Server-Status prüfen und Badge + Hinweis anzeigen
async function checkScraperStatus() {
    const badge = document.getElementById('scraper-status-badge');
    const hint = document.getElementById('scraper-offline-hint');
    try {
        const res = await fetch(`${SCRAPER_URL}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            if (badge) {
                badge.textContent = '● Online';
                badge.style.cssText = 'display:inline-block;background:#10b981;color:white;padding:3px 10px;border-radius:12px;font-size:12px;margin-left:10px;vertical-align:middle;';
            }
            if (hint) hint.style.display = 'none';
        } else {
            throw new Error('not ok');
        }
    } catch {
        if (badge) {
            badge.textContent = '● Offline';
            badge.style.cssText = 'display:inline-block;background:#ef4444;color:white;padding:3px 10px;border-radius:12px;font-size:12px;margin-left:10px;vertical-align:middle;cursor:help;';
            badge.title = 'Scraper nicht gestartet. Terminal öffnen: cd scraper-backend && npm start';
        }
        if (hint) hint.style.display = 'block';
    }
}

// ============================================
// NEUE PROVIDER-SUCHE
// ============================================

/** Log-Funktion für Suchfortschritt */
function searchLog(message, type = 'info') {
    const log = document.getElementById('search-log');
    if (!log) return;
    const colors = { info: '#94a3b8', success: '#10b981', error: '#ef4444', warn: '#f59e0b' };
    log.innerHTML += `<div style="color:${colors[type] || colors.info};">[${new Date().toLocaleTimeString('de-DE')}] ${message}</div>`;
    log.scrollTop = log.scrollHeight;
}

/** Hauptfunktion: Provider-Suche (ein oder mehrere Orte) */
async function startProviderSearch() {
    const raw = document.getElementById('search-locations')?.value?.trim();
    if (!raw) {
        alert('Bitte mindestens einen Ort eingeben');
        return;
    }

    const locations = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const radiusKm = parseInt(document.getElementById('search-radius')?.value || '20');
    const pauseSeconds = parseInt(document.getElementById('search-pause')?.value || '3');
    const autoImport = document.getElementById('search-auto-import')?.checked ?? false;

    // Benutzerdefinierte Suchbegriffe und Ausschlüsse auslesen
    const customKeywordsRaw = document.getElementById('search-custom-keywords')?.value?.trim() || '';
    const customExclusionsRaw = document.getElementById('search-custom-exclusions')?.value?.trim() || '';
    const customKeywords = customKeywordsRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const customExclusions = customExclusionsRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const btn = document.getElementById('provider-search-btn');
    if (btn) btn.disabled = true;

    // Progress anzeigen
    const progressEl = document.getElementById('search-progress-section');
    const logEl = document.getElementById('search-log');
    const fillEl = document.getElementById('search-progress-fill');
    const textEl = document.getElementById('search-progress-text');
    if (progressEl) progressEl.style.display = 'block';
    if (logEl) logEl.innerHTML = '';
    if (fillEl) fillEl.style.width = '10%';

    // Ergebnisse zurücksetzen
    const statsEl = document.getElementById('search-stats-section');
    const resultsEl = document.getElementById('search-results-section');
    if (statsEl) statsEl.style.display = 'none';
    if (resultsEl) resultsEl.style.display = 'none';

    const isMulti = locations.length > 1;
    searchLog(`Starte Suche: ${locations.length} Ort(e), Radius ${radiusKm}km, Import: ${autoImport ? 'Ja' : 'Nein'}`, 'info');
    if (customKeywords.length > 0) searchLog(`➕ ${customKeywords.length} zusätzliche Suchbegriffe: ${customKeywords.join(', ')}`, 'info');
    if (customExclusions.length > 0) searchLog(`🚫 ${customExclusions.length} zusätzliche Ausschlüsse: ${customExclusions.join(', ')}`, 'info');

    try {
        let allProviders = [];
        let totalImported = 0, totalSkipped = 0, totalDuplicates = 0;

        if (isMulti) {
            // Multi-Ort → ein Request
            if (textEl) textEl.textContent = `Durchsuche ${locations.length} Orte...`;
            const response = await fetch(`${SCRAPER_URL}/api/scrape-multiple`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locations, radiusKm, autoImport, pauseSeconds, customKeywords, customExclusions })
            });
            if (!response.ok) { const e = await response.json(); throw new Error(e.error || `HTTP ${response.status}`); }
            const data = await response.json();

            for (const r of data.results) {
                if (r.error) {
                    searchLog(`❌ ${r.location}: ${r.error}`, 'error');
                } else {
                    // Provider-Objekte sammeln (für editierbare Tabelle)
                    if (r.providers && Array.isArray(r.providers)) {
                        allProviders.push(...r.providers);
                    }
                    const imp = r.import;
                    const catStr = r.stats?.categories
                        ? Object.entries(r.stats.categories).map(([k,v]) => `${k}: ${v}`).join(', ')
                        : '';
                    searchLog(`✅ ${r.formattedLocation || r.location}: ${r.count} gefunden${catStr ? ' · ' + catStr : ''}`, 'success');
                    if (imp) {
                        searchLog(`   → Importiert: ${imp.imported || 0} neu, ${imp.skipped || 0} Duplikate`, 'info');
                        totalImported += imp.imported || 0;
                        totalSkipped  += imp.skipped  || 0;
                    }
                }
            }
            totalImported = data.totalSummary?.imported ?? totalImported;
            totalSkipped  = data.totalSummary?.skipped  ?? totalSkipped;
            totalDuplicates = allProviders.filter(p => p._isDuplicate).length || totalSkipped;
            searchLog(`Gesamt: ${allProviders.length} gefunden · ${totalImported} importiert · ${totalSkipped} Duplikate übersprungen`, 'success');

        } else {
            // Einzelort
            if (textEl) textEl.textContent = `Durchsuche "${locations[0]}"...`;
            const response = await fetch(`${SCRAPER_URL}/api/scrape`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ location: locations[0], radiusKm, autoImport, customKeywords, customExclusions })
            });
            if (!response.ok) { const e = await response.json(); throw new Error(e.error || `HTTP ${response.status}`); }
            const data = await response.json();

            allProviders = data.providers || [];
            totalImported = data.import?.imported || 0;
            totalSkipped = data.import?.skipped || 0;
            totalDuplicates = allProviders.filter(p => p._isDuplicate).length;

            searchLog(`✅ ${data.count} Betriebe gefunden in ${data.location}`, 'success');
            if (data.stats?.categories) {
                const cats = Object.entries(data.stats.categories).map(([k,v]) => `${k}: ${v}`).join(', ');
                searchLog(`Kategorien: ${cats}`, 'info');
            }
            if (data.import) {
                searchLog(`Import: ${totalImported} neu, ${totalSkipped} übersprungen, ${totalDuplicates} Duplikate`, 'success');
            }
        }

        if (fillEl) fillEl.style.width = '100%';
        if (textEl) textEl.textContent = 'Fertig!';

        // Stats anzeigen
        if (statsEl) {
            statsEl.style.display = 'block';
            const grid = document.getElementById('search-stats-grid');
            if (grid) {
                const total = allProviders.length || (totalImported + totalSkipped);
                grid.innerHTML = [
                    { label: 'Gefunden', value: total, color: '#0ea5e9' },
                    { label: 'Importiert', value: totalImported, color: '#10b981' },
                    { label: 'Duplikate', value: totalDuplicates || totalSkipped, color: '#f59e0b' },
                ].map(s => `
                    <div style="background:white; padding:12px; border-radius:6px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                        <div style="font-size:28px; font-weight:bold; color:${s.color};">${s.value}</div>
                        <div style="font-size:12px; color:#666;">${s.label}</div>
                    </div>
                `).join('');
            }
        }

        // Provider-Karten anzeigen (auf der Such-Seite)
        if (allProviders.length > 0 && resultsEl) {
            resultsEl.style.display = 'block';
            showSearchResults(allProviders);
        }

        // Ergebnisse in die editierbare Tabelle unter "Neue Betriebe" laden + dorthin navigieren
        if (allProviders.length > 0) {
            try {
                displayScrapingResultsTable(allProviders);
                searchLog(`→ ${allProviders.length} Ergebnisse in editierbare Tabelle geladen. Wechsle zu "Neue Betriebe"...`, 'info');
            } catch (tableErr) {
                console.error('Fehler beim Rendern der Scraping-Tabelle:', tableErr);
                searchLog(`⚠️ Tabellen-Anzeige fehlgeschlagen: ${tableErr.message}`, 'warn');
            }
            // Navigation immer ausführen (auch wenn Tabelle Fehler hatte)
            setTimeout(() => {
                navigateToPage('new-providers');
            }, 1500);
        }

        // Dashboard-Statistiken neu laden (korrekte Funktion)
        if (typeof loadDashboard === 'function') loadDashboard();

    } catch (err) {
        searchLog(`❌ Fehler: ${err.message}`, 'error');
        if (err instanceof TypeError || err.message.includes('fetch') || err.message.includes('Load failed')) {
            searchLog('→ Scraper-Server nicht erreichbar! Terminal: cd scraper-backend && npm start', 'warn');
        }
        if (fillEl) fillEl.style.width = '0%';
    } finally {
        if (btn) btn.disabled = false;
    }
}

/** Provider-Ergebniskarten rendern */
function showSearchResults(providers) {
    const list = document.getElementById('search-results-list');
    if (!list) return;

    list.innerHTML = providers.map(p => {
        // Backend-Kategorie in deutsche Frontend-Kategorie übersetzen
        if (p.category && BACKEND_TO_FRONTEND_CATEGORY[p.category]) {
            p._displayCategory = BACKEND_TO_FRONTEND_CATEGORY[p.category];
        } else {
            p._displayCategory = p.category;
        }
        const hasCategoryWarning = p._category_warning;
        const isWebsiteData = p._data_source === 'website';
        const borderColor = p._isDuplicate ? '#fde68a' : (hasCategoryWarning ? '#fed7aa' : '#e2e8f0');

        return `
        <div style="background:white; border:1px solid ${borderColor}; border-radius:8px; padding:14px 16px; margin-bottom:8px; font-size:13px; display:flex; gap:12px; align-items:flex-start;">
            ${(p.logo_url || p.cover_image_url)
                ? `<img src="${p.logo_url || p.cover_image_url}" style="width:48px; height:48px; border-radius:8px; object-fit:cover; flex-shrink:0;" onerror="this.parentElement.querySelector('.cat-icon-fallback').style.display='flex'; this.style.display='none';" /><div class="cat-icon-fallback" style="display:none; width:48px; height:48px; border-radius:8px; background:#f1f5f9; align-items:center; justify-content:center; flex-shrink:0; font-size:20px;">${getCategoryIcon(p._displayCategory || p.category)}</div>`
                : `<div style="width:48px; height:48px; border-radius:8px; background:#f1f5f9; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:20px;">${getCategoryIcon(p._displayCategory || p.category)}</div>`
            }
            <div style="flex:1; min-width:0;">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span style="font-weight:600; font-size:14px;">${esc(p.name)}</span>
                    <span style="background:#dbeafe; color:#1d4ed8; padding:1px 6px; border-radius:10px; font-size:11px;">${esc(p._displayCategory || p.category)}</span>
                    ${p._isDuplicate ? '<span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:10px; font-size:11px;">⚠️ Duplikat</span>' : ''}
                    ${isWebsiteData ? '<span style="background:#dcfce7; color:#166534; padding:1px 6px; border-radius:10px; font-size:11px;" title="Daten von echter Website">🌐 Website</span>' : '<span style="background:#f1f5f9; color:#475569; padding:1px 6px; border-radius:10px; font-size:11px;" title="Daten aus Google Places Texten">📋 Google</span>'}
                    ${hasCategoryWarning ? `<span style="background:#fed7aa; color:#9a3412; padding:1px 6px; border-radius:10px; font-size:11px;" title="${esc(p._category_warning)}">⚠️ Kategorie prüfen</span>` : ''}
                </div>
                <div style="color:#666; margin-top:3px;">
                    ${[p.street, p.city, p.country].filter(Boolean).map(esc).join(', ')}
                </div>
                ${hasCategoryWarning ? `<div style="margin-top:4px; color:#9a3412; font-size:11px; background:#fff7ed; border:1px solid #fed7aa; border-radius:4px; padding:3px 7px;">${esc(p._category_warning)}</div>` : ''}
                <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:8px; font-size:12px; color:#374151;">
                    ${p.phone ? `<span>📞 ${esc(p.phone)}</span>` : ''}
                    ${p.website ? `<span>🌐 <a href="${p.website}" target="_blank" style="color:#0ea5e9; text-decoration:none;">Website</a></span>` : ''}
                    ${p.email ? `<span>✉️ ${esc(p.email)}</span>` : ''}
                    ${p.website && !p.email ? `<button onclick="fetchProviderEmail(this, '${encodeURIComponent(p.website)}')" style="background:#e0f2fe; border:1px solid #0ea5e9; color:#0369a1; padding:1px 8px; border-radius:6px; font-size:11px; cursor:pointer;">✉️ E-Mail suchen</button>` : ''}
                </div>
                ${p.services && p.services.length > 0 ? `
                    <div style="margin-top:5px;">
                        <span style="font-size:11px; color:#6b7280; font-weight:500;">Leistungen:</span>
                        <div style="margin-top:2px; display:flex; flex-wrap:wrap; gap:4px;">
                            ${p.services.slice(0,8).map(s => `<span style="background:#ecfdf5; color:#065f46; padding:1px 6px; border-radius:8px; font-size:11px;">${esc(s)}</span>`).join('')}
                            ${p.services.length > 8 ? `<span style="color:#6b7280; font-size:11px;">+${p.services.length-8} weitere</span>` : ''}
                        </div>
                    </div>
                ` : '<div style="margin-top:5px; font-size:11px; color:#9ca3af; font-style:italic;">Keine Leistungen gefunden</div>'}
                ${p.brands && p.brands.length > 0 ? `
                    <div style="margin-top:4px;">
                        <span style="font-size:11px; color:#6b7280; font-weight:500;">Marken:</span>
                        <div style="margin-top:2px; display:flex; flex-wrap:wrap; gap:4px;">
                            ${p.brands.slice(0,8).map(b => `<span style="background:#fef3c7; color:#92400e; padding:1px 6px; border-radius:8px; font-size:11px;">🏷️ ${esc(b)}</span>`).join('')}
                            ${p.brands.length > 8 ? `<span style="color:#6b7280; font-size:11px;">+${p.brands.length-8} weitere</span>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

/** HTML-Escape Helper */
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** On-demand E-Mail von Website scrapen */
async function fetchProviderEmail(btn, encodedUrl) {
    btn.disabled = true;
    btn.textContent = '⏳ Suche...';
    try {
        const response = await fetch(`${SCRAPER_URL}/api/scrape-website`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: decodeURIComponent(encodedUrl) })
        });
        const data = await response.json();
        if (data.email) {
            btn.textContent = `✉️ ${data.email}`;
            btn.style.background = '#d1fae5';
            btn.style.borderColor = '#10b981';
            btn.style.color = '#065f46';
            if (data.contact) btn.title = `Ansprechpartner: ${data.contact}`;
        } else {
            btn.textContent = '❌ Keine E-Mail';
            btn.style.background = '#fee2e2';
            btn.style.borderColor = '#fca5a5';
            btn.style.color = '#991b1b';
        }
    } catch (err) {
        btn.textContent = '❌ Fehler';
        btn.style.background = '#fee2e2';
    }
}

// ============================================
// E-MAIL FINDER
// ============================================

let emailFinderResults = [];
let emailFinderAbort = false;

/** Subseiten, die typischerweise E-Mails/Impressum enthalten */
const EMAIL_SUBPAGES = [
    '', // Homepage
    '/impressum',
    '/kontakt',
    '/contact',
    '/about',
    '/about-us',
    '/ueber-uns',
    '/legal',
    '/imprint',
    '/contacto',
    '/contactez-nous',
    '/contatti',
];

/**
 * Extrahiert E-Mail-Adressen aus Text, auch verschleierte Varianten.
 * Erkennt: info[at]domain.de, info (at) domain.de, info{at}domain.de,
 *          info AT domain.de, info [dot] de, info(at)domain(dot)de etc.
 */
function extractEmailsFromText(text) {
    if (!text) return [];
    const found = new Set();

    // 1. Standard-E-Mail-Regex
    const stdRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;
    for (const m of text.matchAll(stdRegex)) {
        found.add(m[0].toLowerCase());
    }

    // 2. Verschleierte Varianten normalisieren und nochmal suchen
    let normalized = text
        // [at] (at) {at} <at> «at» Varianten → @
        .replace(/\s*[\[(\{<«]\s*at\s*[\])}>»]\s*/gi, '@')
        // " at " → @
        .replace(/\s+at\s+/gi, '@')
        // " AT " → @
        .replace(/\s+AT\s+/gi, '@')
        // [dot] (dot) {dot} Varianten → .
        .replace(/\s*[\[(\{<«]\s*dot\s*[\])}>»]\s*/gi, '.')
        // " dot " → .
        .replace(/\s+dot\s+/gi, '.')
        // [punkt] (punkt) → .
        .replace(/\s*[\[(\{<«]\s*punkt\s*[\])}>»]\s*/gi, '.')
        // " punkt " → .
        .replace(/\s+punkt\s+/gi, '.');

    for (const m of normalized.matchAll(stdRegex)) {
        found.add(m[0].toLowerCase());
    }

    // 3. mailto: Links (oft in href Attributen im HTML)
    const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
    for (const m of text.matchAll(mailtoRegex)) {
        found.add(m[1].toLowerCase());
    }

    // Filter out obvious non-emails (image files, CSS etc.)
    const excluded = /\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf|eot|ico)$/i;
    const noreply = /^(noreply|no-reply|mailer-daemon|postmaster)/i;
    return [...found].filter(e => !excluded.test(e) && !noreply.test(e));
}

function emailFinderLog(msg, type = 'info') {
    const log = document.getElementById('email-finder-log');
    if (!log) return;
    const colors = { info: '#94a3b8', success: '#10b981', error: '#ef4444', warn: '#f59e0b' };
    log.innerHTML += `<div style="color:${colors[type] || colors.info};">[${new Date().toLocaleTimeString('de-DE')}] ${msg}</div>`;
    log.scrollTop = log.scrollHeight;
}

/**
 * Crawlt eine URL und gibt den extrahierten Text zurück.
 * Nutzt Crawl4AI oder den Scraper-Backend.
 */
async function crawlPageText(url, source) {
    if (source === 'crawl4ai') {
        const resp = await fetch(`${CRAWL4AI_SERVICE_URL}/crawl`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data.robots_blocked || !data.success) return null;
        // Crawl4AI gibt structured data zurück – wir brauchen den Rohtext
        // Zusammensetzen aus allen verfügbaren Feldern
        return [data.markdown || '', data.raw_text || '', data.email || '', data.description || ''].join('\n');
    } else {
        // Scraper-Backend: /api/scrape-website gibt email direkt zurück
        const resp = await fetch(`${SCRAPER_URL}/api/scrape-website`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(15000)
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        // Gib den email direkt zurück als Text, damit extractEmailsFromText ihn findet
        return data.email ? `email: ${data.email}` : (data.raw_text || data.markdown || null);
    }
}

/**
 * Durchsucht die Website eines Providers nach E-Mail-Adressen.
 * Probiert Homepage + typische Unterseiten (Impressum, Kontakt, etc.)
 */
async function findEmailsForProvider(provider, source) {
    const baseUrl = provider.website.replace(/\/+$/, '');
    const allEmails = new Set();
    let foundOnPage = '';

    for (const subpage of EMAIL_SUBPAGES) {
        if (emailFinderAbort) break;
        const url = baseUrl + subpage;
        try {
            const text = await crawlPageText(url, source);
            if (!text) continue;
            const emails = extractEmailsFromText(text);
            if (emails.length > 0) {
                for (const e of emails) allEmails.add(e);
                if (!foundOnPage) foundOnPage = subpage || '/';
            }
        } catch {
            // Subpage nicht erreichbar – weiter
        }
        // Wenn wir schon E-Mails gefunden haben und mind. Impressum gecheckt, reicht das
        if (allEmails.size > 0 && EMAIL_SUBPAGES.indexOf(subpage) >= 2) break;
    }

    return { emails: [...allEmails], foundOnPage };
}

async function startEmailFinder() {
    emailFinderAbort = false;
    emailFinderResults = [];

    const filter = document.getElementById('email-finder-filter')?.value || 'missing_email';
    const limit = parseInt(document.getElementById('email-finder-limit')?.value || '50');
    const source = document.getElementById('email-finder-source')?.value || 'crawl4ai';

    const btn = document.getElementById('email-finder-btn');
    const stopBtn = document.getElementById('email-finder-stop-btn');
    if (btn) btn.disabled = true;
    if (stopBtn) stopBtn.style.display = 'inline-block';

    const progressEl = document.getElementById('email-finder-progress');
    const resultsEl = document.getElementById('email-finder-results');
    if (progressEl) progressEl.style.display = 'block';
    if (resultsEl) resultsEl.style.display = 'none';

    const logEl = document.getElementById('email-finder-log');
    if (logEl) logEl.innerHTML = '';

    const fillEl = document.getElementById('email-finder-fill');
    const textEl = document.getElementById('email-finder-text');

    emailFinderLog(`Starte E-Mail-Suche: Filter="${filter}", Max=${limit}, Quelle=${source}`, 'info');

    // 1. Betriebe aus Supabase laden
    try {
        let query = supabaseClient.from('service_providers')
            .select('id, name, category, city, website, email');

        if (filter === 'missing_email') {
            query = query.not('website', 'is', null).not('website', 'eq', '');
            // email IS NULL oder leer
        }

        const { data: providers, error } = await query.limit(500);
        if (error) throw error;

        // Client-seitiger Filter (Supabase OR-Filter für NULL + leer ist umständlich)
        let filtered;
        if (filter === 'missing_email') {
            filtered = providers.filter(p => p.website && (!p.email || p.email.trim() === ''));
        } else {
            filtered = providers.filter(p => p.website && p.website.trim() !== '');
        }

        // Limit anwenden
        const toProcess = filtered.slice(0, limit);

        emailFinderLog(`${filtered.length} Betriebe gefunden, verarbeite ${toProcess.length}`, 'info');

        // 2. Für jeden Betrieb E-Mails suchen
        let found = 0, notFound = 0, errors = 0;

        for (let i = 0; i < toProcess.length; i++) {
            if (emailFinderAbort) {
                emailFinderLog('⏹ Abgebrochen durch Benutzer', 'warn');
                break;
            }

            const p = toProcess[i];
            const pct = Math.round(((i + 1) / toProcess.length) * 100);
            if (fillEl) fillEl.style.width = pct + '%';
            if (textEl) textEl.textContent = `(${i + 1}/${toProcess.length}) ${p.name}`;

            emailFinderLog(`🔍 ${p.name} – ${p.website}`, 'info');

            try {
                const result = await findEmailsForProvider(p, source);
                if (result.emails.length > 0) {
                    found++;
                    emailFinderLog(`  ✉️ ${result.emails.join(', ')} (${result.foundOnPage})`, 'success');
                    emailFinderResults.push({
                        id: p.id,
                        name: p.name,
                        category: p.category,
                        city: p.city,
                        website: p.website,
                        oldEmail: p.email || '',
                        newEmails: result.emails,
                        foundOnPage: result.foundOnPage,
                        selectedEmail: result.emails[0] // Default: erste gefundene
                    });
                } else {
                    notFound++;
                    emailFinderLog(`  ❌ Keine E-Mail gefunden`, 'info');
                }
            } catch (err) {
                errors++;
                emailFinderLog(`  ⚠️ Fehler: ${err.message}`, 'error');
            }
        }

        if (fillEl) fillEl.style.width = '100%';
        if (textEl) textEl.textContent = 'Fertig!';
        emailFinderLog(`\n✅ Ergebnis: ${found} E-Mails gefunden, ${notFound} ohne, ${errors} Fehler`, 'success');

        showEmailFinderResults();

    } catch (err) {
        emailFinderLog(`❌ Fehler: ${err.message}`, 'error');
    } finally {
        if (btn) btn.disabled = false;
        if (stopBtn) stopBtn.style.display = 'none';
    }
}

function stopEmailFinder() {
    emailFinderAbort = true;
}

function showEmailFinderResults() {
    const section = document.getElementById('email-finder-results');
    const list = document.getElementById('email-finder-list');
    if (!section || !list) return;

    if (emailFinderResults.length === 0) {
        section.style.display = 'block';
        list.innerHTML = '<p style="color:#6b7280; padding:20px;">Keine E-Mails gefunden.</p>';
        return;
    }

    section.style.display = 'block';
    list.innerHTML = emailFinderResults.map((r, idx) => `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:14px 16px; margin-bottom:8px; font-size:13px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" class="email-cb" data-idx="${idx}" checked style="width:auto;">
                <strong style="font-size:14px;">${esc(r.name)}</strong>
                <span style="background:#dbeafe; color:#1d4ed8; padding:1px 6px; border-radius:10px; font-size:11px;">${esc(r.category)}</span>
                <span style="color:#6b7280; font-size:12px;">${esc(r.city || '')}</span>
                <a href="${esc(r.website)}" target="_blank" style="font-size:11px; color:#3b82f6; margin-left:auto;">🌐 Website</a>
            </div>
            <div style="margin-left:24px;">
                ${r.oldEmail ? `<div style="margin-bottom:4px;"><span style="color:#6b7280;">Bisherige E-Mail:</span> <span style="color:#ef4444; text-decoration:line-through;">${esc(r.oldEmail)}</span></div>` : ''}
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-weight:600; color:#374151;">Neue E-Mail:</span>
                    ${r.newEmails.length === 1
                        ? `<span style="color:#10b981; font-weight:600;">${esc(r.newEmails[0])}</span>`
                        : `<select class="email-select" data-idx="${idx}" style="font-size:13px; padding:2px 6px; border:1px solid #d1d5db; border-radius:4px;">
                            ${r.newEmails.map(e => `<option value="${esc(e)}" ${e === r.selectedEmail ? 'selected' : ''}>${esc(e)}</option>`).join('')}
                           </select>`
                    }
                    <span style="color:#94a3b8; font-size:11px;">gefunden auf: ${esc(r.foundOnPage)}</span>
                </div>
            </div>
        </div>
    `).join('');

    // Dropdown-Event für E-Mail-Auswahl
    list.querySelectorAll('.email-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx);
            emailFinderResults[idx].selectedEmail = e.target.value;
        });
    });
}

function selectAllEmails() {
    document.querySelectorAll('.email-cb').forEach(cb => cb.checked = true);
}
function deselectAllEmails() {
    document.querySelectorAll('.email-cb').forEach(cb => cb.checked = false);
}

async function applySelectedEmails() {
    const selected = [];
    document.querySelectorAll('.email-cb:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (emailFinderResults[idx]) selected.push(emailFinderResults[idx]);
    });

    if (selected.length === 0) { alert('Keine E-Mails ausgewählt'); return; }
    if (!confirm(`${selected.length} E-Mails speichern?`)) return;

    const btn = document.getElementById('apply-emails-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichere...'; }

    let ok = 0, fail = 0;
    for (const r of selected) {
        const email = r.selectedEmail || r.newEmails[0];
        try {
            const { error } = await supabaseClient.from('service_providers').update({ email }).eq('id', r.id);
            if (error) { console.error(error); fail++; } else { ok++; }
        } catch { fail++; }
    }

    alert(`✅ ${ok} E-Mails gespeichert` + (fail > 0 ? `\n❌ ${fail} Fehler` : ''));
    if (btn) { btn.disabled = false; btn.textContent = '💾 Ausgewählte speichern'; }
}

// Window-Export für onclick
window.startEmailFinder = startEmailFinder;
window.stopEmailFinder = stopEmailFinder;
window.selectAllEmails = selectAllEmails;
window.deselectAllEmails = deselectAllEmails;
window.applySelectedEmails = applySelectedEmails;

// ============================================
// UPDATE-SUCHE (ENRICHMENT)
// ============================================

let enrichPreviewData = [];

function enrichLog(message, type = 'info') {
    const log = document.getElementById('enrich-log');
    if (!log) return;
    const colors = { info: '#94a3b8', success: '#10b981', error: '#ef4444', warn: '#f59e0b' };
    log.innerHTML += `<div style="color:${colors[type] || colors.info};">[${new Date().toLocaleTimeString('de-DE')}] ${message}</div>`;
    log.scrollTop = log.scrollHeight;
}

async function startEnrichPreview() {
    const filter = document.getElementById('enrich-filter')?.value || 'missing_any';
    const limit = parseInt(document.getElementById('enrich-limit')?.value || '25');

    const btn = document.getElementById('enrich-preview-btn');
    if (btn) btn.disabled = true;

    const progressEl = document.getElementById('enrich-progress-section');
    const resultsEl = document.getElementById('enrich-results-section');
    if (progressEl) progressEl.style.display = 'block';
    if (resultsEl) resultsEl.style.display = 'none';

    const logEl = document.getElementById('enrich-log');
    if (logEl) logEl.innerHTML = '';

    const fillEl = document.getElementById('enrich-progress-fill');
    const textEl = document.getElementById('enrich-progress-text');
    if (fillEl) fillEl.style.width = '30%';
    if (textEl) textEl.textContent = 'Durchsuche Google Places...';

    enrichLog(`Starte Vorschau: Filter="${filter}", Limit=${limit}`, 'info');

    try {
        const response = await fetch(`${SCRAPER_URL}/api/enrich-providers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filter, limit, dryRun: true })
        });
        if (!response.ok) { const e = await response.json(); throw new Error(e.error || `HTTP ${response.status}`); }

        const data = await response.json();

        if (fillEl) fillEl.style.width = '100%';
        if (textEl) textEl.textContent = 'Fertig!';

        const withChanges = data.results.filter(r => r.status === 'preview');
        const noChanges = data.results.filter(r => r.status === 'no_changes');
        const notFound = data.results.filter(r => r.status === 'not_found');
        const errors = data.results.filter(r => r.status === 'error');

        enrichLog(`✅ ${data.processed} Betriebe geprüft`, 'success');
        enrichLog(`   ${withChanges.length} mit Änderungen`, withChanges.length > 0 ? 'success' : 'info');
        enrichLog(`   ${noChanges.length} ohne Änderungen`, 'info');
        enrichLog(`   ${notFound.length} nicht in Google gefunden`, notFound.length > 0 ? 'warn' : 'info');
        if (errors.length > 0) enrichLog(`   ${errors.length} Fehler`, 'error');

        enrichPreviewData = data.results;
        showEnrichResults(data.results);

    } catch (err) {
        enrichLog(`❌ Fehler: ${err.message}`, 'error');
        if (err instanceof TypeError || err.message.includes('fetch')) {
            enrichLog('→ Scraper-Server nicht erreichbar!', 'warn');
        }
        if (fillEl) fillEl.style.width = '0%';
    } finally {
        if (btn) btn.disabled = false;
    }
}

function showEnrichResults(results) {
    const section = document.getElementById('enrich-results-section');
    const list = document.getElementById('enrich-results-list');
    if (!section || !list) return;
    section.style.display = 'block';

    const withDiff = results.filter(r => r.diff);
    if (withDiff.length === 0) {
        list.innerHTML = '<p style="color:#6b7280; padding:20px;">Keine Änderungen gefunden.</p>';
        return;
    }

    list.innerHTML = withDiff.map((r, idx) => `
        <div style="background:white; border:1px solid #e2e8f0; border-radius:8px; padding:14px 16px; margin-bottom:8px; font-size:13px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                <input type="checkbox" class="enrich-cb" data-idx="${idx}" data-id="${r.id}" checked style="width:auto;">
                <strong style="font-size:14px;">${esc(r.name)}</strong>
                <span style="background:#dbeafe; color:#1d4ed8; padding:1px 6px; border-radius:10px; font-size:11px;">${esc(r.category)}</span>
                <span style="color:#6b7280; font-size:12px;">${esc(r.city || '')}</span>
            </div>
            ${Object.entries(r.diff).map(([field, val]) => `
                <div style="margin-left:24px; margin-bottom:4px;">
                    <span style="font-weight:600; color:#374151;">${fieldLabel(field)}:</span>
                    ${val.old ? `<span style="color:#ef4444; text-decoration:line-through; margin-right:4px;">${formatVal(val.old)}</span> →` : ''}
                    <span style="color:#10b981; font-weight:500;">${formatVal(val.new)}</span>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function fieldLabel(f) {
    return { services: 'Leistungen', brands: 'Marken', phone: 'Telefon', website: 'Website' }[f] || f;
}
function formatVal(v) {
    if (Array.isArray(v)) return v.map(esc).join(', ');
    return esc(v) || '–';
}

function selectAllEnrich() {
    document.querySelectorAll('.enrich-cb').forEach(cb => cb.checked = true);
}
function deselectAllEnrich() {
    document.querySelectorAll('.enrich-cb').forEach(cb => cb.checked = false);
}

async function applySelectedEnrichments() {
    const withDiff = enrichPreviewData.filter(r => r.diff);
    const selected = [];
    document.querySelectorAll('.enrich-cb:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (withDiff[idx]) selected.push(withDiff[idx]);
    });

    if (selected.length === 0) { alert('Keine Änderungen ausgewählt'); return; }
    if (!confirm(`${selected.length} Betriebe aktualisieren?`)) return;

    const btn = document.getElementById('apply-enrich-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Speichere...'; }

    let ok = 0, fail = 0;
    for (const r of selected) {
        const patch = {};
        for (const [k, v] of Object.entries(r.diff)) patch[k] = v.new;
        try {
            const { error } = await supabaseClient.from('service_providers').update(patch).eq('id', r.id);
            if (error) { console.error(error); fail++; } else { ok++; }
        } catch (e) { fail++; }
    }

    alert(`✅ ${ok} aktualisiert` + (fail > 0 ? `\n❌ ${fail} Fehler` : ''));
    if (btn) { btn.disabled = false; btn.textContent = '✅ Ausgewählte übernehmen'; }
}

// ============================================
// SCRAPING-ERGEBNISSE: Editierbare Tabelle unter "Neue Betriebe"
// ============================================

let scrapingTableData = []; // Gespeicherte Scraping-Ergebnisse für die Tabelle

/** Kategorie-Optionen für Dropdown */
function getCategoryOptions(selected) {
    const cats = PROVIDER_CATEGORIES.filter(c => c.value !== 'Alle');
    return cats.map(c => `<option value="${c.value}" ${c.value === selected ? 'selected' : ''}>${c.label}</option>`).join('');
}

/** Zeigt Scraping-Ergebnisse als editierbare Tabelle im "Neue Betriebe"-Bereich */
function displayScrapingResultsTable(providers) {
    console.log(`📋 displayScrapingResultsTable: ${providers.length} Provider`);

    // Backend-Kategorien übersetzen
    scrapingTableData = providers.map((p, idx) => ({
        ...p,
        _idx: idx,
        _selected: !p._isDuplicate,
        _displayCategory: BACKEND_TO_FRONTEND_CATEGORY[p.category] || p.category || 'Sonstige'
    }));

    const section = document.getElementById('scraping-results-section');
    const tbody = document.getElementById('scraping-results-tbody');
    const countEl = document.getElementById('scraping-results-count');

    if (!section || !tbody) {
        console.error('❌ scraping-results-section oder scraping-results-tbody nicht gefunden!');
        return;
    }

    section.style.display = 'block';
    const nonDup = scrapingTableData.filter(p => !p._isDuplicate).length;
    if (countEl) countEl.textContent = `${scrapingTableData.length} gefunden, ${nonDup} neu`;

    renderScrapingTable();
    console.log(`✅ Scraping-Tabelle gerendert: ${scrapingTableData.length} Zeilen`);
}

function renderScrapingTable() {
    const tbody = document.getElementById('scraping-results-tbody');
    if (!tbody) {
        console.error('❌ scraping-results-tbody nicht gefunden');
        return;
    }

    if (!scrapingTableData || scrapingTableData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="padding:20px; text-align:center; color:#6b7280;">Keine Ergebnisse vorhanden</td></tr>';
        return;
    }

    try {
        tbody.innerHTML = scrapingTableData.map((p, idx) => {
            const isDup = p._isDuplicate;
            const rowBg = isDup ? '#fefce8' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
            const borderColor = isDup ? '#fde68a' : '#e2e8f0';
            const servicesStr = Array.isArray(p.services) ? p.services.join(', ') : (p.services || '');
            const brandsStr = Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands || '');

            return `
            <tr data-idx="${idx}" style="background:${rowBg}; border-bottom:1px solid ${borderColor};">
                <td style="padding:6px; text-align:center; vertical-align:top;">
                    <input type="checkbox" class="scraping-cb" data-idx="${idx}" ${p._selected ? 'checked' : ''}
                        onchange="window.toggleScrapingRow(${idx}, this.checked)" style="width:auto;">
                </td>
                <td style="padding:4px; vertical-align:top; text-align:center; width:40px;">
                    ${p.logo_url
                        ? `<img src="${esc(p.logo_url)}" style="width:32px; height:32px; border-radius:6px; object-fit:cover;" onerror="this.outerHTML='<span style=\\'font-size:20px;\\'>${getCategoryIcon(p._displayCategory || p.category)}</span>'" />`
                        : `<span style="font-size:20px;" title="${esc(p._displayCategory || p.category)}">${getCategoryIcon(p._displayCategory || p.category)}</span>`}
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <input type="text" value="${esc(p.name || '')}" data-idx="${idx}" data-field="name"
                        onchange="window.updateScrapingField(${idx}, 'name', this.value)"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:12px;">
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <select data-idx="${idx}" data-field="category"
                        onchange="window.updateScrapingField(${idx}, '_displayCategory', this.value)"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 4px; font-size:12px;">
                        ${getCategoryOptions(p._displayCategory)}
                    </select>
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <input type="text" value="${esc(p.street || '')}" data-idx="${idx}" data-field="street"
                        onchange="window.updateScrapingField(${idx}, 'street', this.value)"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:12px;">
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <input type="text" value="${esc(p.city || '')}" data-idx="${idx}" data-field="city"
                        onchange="window.updateScrapingField(${idx}, 'city', this.value)"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:12px;">
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <input type="text" value="${esc(p.phone || '')}" data-idx="${idx}" data-field="phone"
                        onchange="window.updateScrapingField(${idx}, 'phone', this.value)"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:12px;">
                </td>
                <td style="padding:6px; vertical-align:top;">
                    ${p.website ? `<a href="${p.website}" target="_blank" style="color:#0ea5e9; font-size:11px; word-break:break-all;">${truncateUrl(p.website)}</a>` : '<span style="color:#ccc;">–</span>'}
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <input type="text" value="${esc(servicesStr)}" data-idx="${idx}" data-field="services"
                        onchange="window.updateScrapingArrayField(${idx}, 'services', this.value)"
                        placeholder="z.B. Motorrevision, GFK-Reparatur"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:11px; color:#065f46; background:#f0fdf4;">
                </td>
                <td style="padding:6px; vertical-align:top;">
                    <input type="text" value="${esc(brandsStr)}" data-idx="${idx}" data-field="brands"
                        onchange="window.updateScrapingArrayField(${idx}, 'brands', this.value)"
                        placeholder="z.B. Volvo Penta, Yanmar"
                        style="width:100%; border:1px solid #d1d5db; border-radius:4px; padding:3px 6px; font-size:11px; color:#92400e; background:#fffbeb;">
                </td>
                <td style="padding:6px; vertical-align:top; text-align:center;">
                    ${isDup
                        ? '<span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:8px; font-size:10px;" title="Bereits in DB">Duplikat</span>'
                        : (p.id ? '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:8px; font-size:10px;">Importiert</span>' : '<span style="background:#dbeafe; color:#1d4ed8; padding:2px 6px; border-radius:8px; font-size:10px;">Neu</span>')}
                </td>
            </tr>`;
        }).join('');
    } catch (renderErr) {
        console.error('❌ Fehler beim Rendern der Tabelle:', renderErr);
        tbody.innerHTML = `<tr><td colspan="11" style="padding:20px; text-align:center; color:#ef4444;">Fehler beim Rendern: ${esc(renderErr.message)}</td></tr>`;
    }
}

/** URL kürzen für Tabellendarstellung */
function truncateUrl(url) {
    try {
        const u = new URL(url);
        return u.hostname.replace(/^www\./, '');
    } catch { return url.substring(0, 30); }
}

/** Checkbox-Toggle für einzelne Zeile */
function toggleScrapingRow(idx, checked) {
    if (scrapingTableData[idx]) scrapingTableData[idx]._selected = checked;
}

/** Alle Checkboxen setzen/entfernen */
function toggleAllScrapingCheckboxes(checked) {
    scrapingTableData.forEach(p => p._selected = checked);
    document.querySelectorAll('.scraping-cb').forEach(cb => cb.checked = checked);
}

function selectAllScrapingResults() {
    toggleAllScrapingCheckboxes(true);
    const selectAllCb = document.getElementById('scraping-select-all');
    if (selectAllCb) selectAllCb.checked = true;
}

function deselectAllScrapingResults() {
    toggleAllScrapingCheckboxes(false);
    const selectAllCb = document.getElementById('scraping-select-all');
    if (selectAllCb) selectAllCb.checked = false;
}

/** Feld in der Tabelle editieren */
function updateScrapingField(idx, field, value) {
    if (scrapingTableData[idx]) scrapingTableData[idx][field] = value;
}

/** Array-Feld (Services/Brands) editieren – Komma-separierter String → Array */
function updateScrapingArrayField(idx, field, value) {
    if (scrapingTableData[idx]) {
        scrapingTableData[idx][field] = String(value || '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }
}

/** Ausgewählte Ergebnisse in Supabase importieren */
async function importSelectedScrapingResults() {
    const selected = scrapingTableData.filter(p => p._selected && !p._isDuplicate);
    if (selected.length === 0) {
        alert('Keine Betriebe zum Import ausgewählt');
        return;
    }

    if (!confirm(`${selected.length} Betriebe importieren?`)) return;

    let imported = 0, errors = 0;

    for (const p of selected) {
        const data = {
            name: p.name,
            category: p._displayCategory || p.category,
            street: p.street || null,
            postal_code: p.postal_code || null,
            city: p.city || null,
            country: p.country || null,
            latitude: p.latitude,
            longitude: p.longitude,
            phone: p.phone || null,
            email: p.email || null,
            website: p.website || null,
            services: p.services || null,
            brands: p.brands || null,
            description: p.description || null,
            logo_url: p.logo_url || null,
            cover_image_url: p.cover_image_url || null,
        };

        try {
            const { error } = await supabaseClient.from('service_providers').insert([data]);
            if (error) {
                console.error(`Import-Fehler für ${p.name}:`, error);
                errors++;
            } else {
                imported++;
                p.id = 'imported'; // Markiere als importiert
            }
        } catch (e) {
            console.error(`Import-Fehler für ${p.name}:`, e);
            errors++;
        }
    }

    alert(`✅ ${imported} importiert` + (errors > 0 ? `\n❌ ${errors} Fehler` : ''));
    renderScrapingTable(); // Tabelle aktualisieren (Status-Spalte)
    if (typeof loadDashboard === 'function') loadDashboard();
}

/** Scraping-Ergebnisse verwerfen */
function clearScrapingResults() {
    if (!confirm('Scraping-Ergebnisse verwerfen?')) return;
    scrapingTableData = [];
    const section = document.getElementById('scraping-results-section');
    if (section) section.style.display = 'none';
}

// ============================================
// KARTEN-SEITE (Map Page)
// ============================================

let mapInstance = null;
let mapMarkerCluster = null;
let mapAllProviders = [];
let mapFilteredProviders = [];
let mapRadiusCircle = null;
let mapSelectedCategory = 'Alle';
let mapSearchDebounceTimer = null;

/** Karten-Farbzuordnung pro Kategorie (wiederverwendbar) */
function getMapCategoryColors() {
    return {
        'Werkstatt': '#3b82f6',
        'Motorservice': '#2563eb',
        'Zubehör': '#10b981',
        'Segelmacher': '#8b5cf6',
        'Rigg': '#ec4899',
        'Instrumente': '#06b6d4',
        'Marina': '#0ea5e9',
        'Winterlager': '#64748b',
        'Lackiererei': '#a855f7',
        'Bootsbauer': '#059669',
        'Gutachter': '#d97706',
        'Kran': '#78716c',
        'Heizung/Klima': '#f97316',
        'Sonstige': '#6b7280'
    };
}

/** Haupteinstieg: wird von navigateToPage('map') aufgerufen */
async function loadMapPage() {
    buildMapCategoryFilters();

    if (!mapInstance) {
        initMap();
    } else {
        setTimeout(() => mapInstance.invalidateSize(), 100);
    }

    await loadAllMapProviders();
    applyMapFilters();
    setupMapEventListeners();
}

/** Leaflet-Karte initialisieren */
function initMap() {
    mapInstance = L.map('map-container', {
        center: [47.0, 10.0],
        zoom: 5,
        zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(mapInstance);

    mapMarkerCluster = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });

    mapInstance.addLayer(mapMarkerCluster);
}

/** Alle Provider aus Supabase laden (paginiert) */
async function loadAllMapProviders() {
    try {
        let allData = [];
        let from = 0;
        const batchSize = 1000;

        while (true) {
            const { data, error } = await supabaseClient
                .from('service_providers')
                .select('*')
                .order('name')
                .range(from, from + batchSize - 1);

            if (error) throw error;
            allData = allData.concat(data || []);

            if (!data || data.length < batchSize) break;
            from += batchSize;
        }

        mapAllProviders = allData;
        console.log(`Karte: ${mapAllProviders.length} Provider geladen`);
    } catch (error) {
        console.error('Karte: Fehler beim Laden', error);
    }
}

/** Kategorie-Pill-Buttons erzeugen */
function buildMapCategoryFilters() {
    const container = document.getElementById('map-category-filters');
    if (!container || container.children.length > 0) return;

    const colors = getMapCategoryColors();

    PROVIDER_CATEGORIES.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'map-category-btn' + (cat.value === 'Alle' ? ' active' : '');
        btn.textContent = cat.label;
        btn.dataset.category = cat.value;

        const color = colors[cat.value] || '#6b7280';

        if (cat.value === 'Alle') {
            btn.style.backgroundColor = '#2563eb';
            btn.style.color = 'white';
            btn.style.borderColor = 'transparent';
        } else {
            btn.style.borderColor = color;
            btn.style.color = color;
        }

        btn.addEventListener('click', () => {
            mapSelectedCategory = cat.value;
            container.querySelectorAll('.map-category-btn').forEach(b => {
                const c = colors[b.dataset.category] || '#6b7280';
                b.classList.remove('active');
                if (b.dataset.category === 'Alle') {
                    b.style.backgroundColor = 'white';
                    b.style.color = '#2563eb';
                    b.style.borderColor = '#2563eb';
                } else {
                    b.style.backgroundColor = 'white';
                    b.style.color = c;
                    b.style.borderColor = c;
                }
            });
            btn.classList.add('active');
            if (cat.value === 'Alle') {
                btn.style.backgroundColor = '#2563eb';
                btn.style.color = 'white';
                btn.style.borderColor = 'transparent';
            } else {
                btn.style.backgroundColor = color;
                btn.style.color = 'white';
                btn.style.borderColor = 'transparent';
            }
            applyMapFilters();
        });

        container.appendChild(btn);
    });
}

/** Kern-Filterlogik: Kategorie + Textsuche (AND) + Radius */
function applyMapFilters() {
    const searchText = (document.getElementById('map-search-input')?.value || '').trim();
    const radiusKm = parseInt(document.getElementById('map-radius-select')?.value || '0');

    let filtered = [...mapAllProviders];

    // 1. Kategorie-Filter (alle 3 Kategorien prüfen)
    if (mapSelectedCategory !== 'Alle') {
        filtered = filtered.filter(p => {
            const cats = [p.category, p.category2, p.category3].filter(Boolean).map(c => c.toLowerCase());
            return cats.includes(mapSelectedCategory.toLowerCase());
        });
    }

    // 2. Textsuche (AND-Logik, wie iOS-App)
    if (searchText) {
        const words = searchText.toLowerCase().split(/\s+/).filter(w => w);
        filtered = filtered.filter(provider => {
            const haystack = [
                provider.name || '',
                provider.category || '',
                provider.category2 || '',
                provider.category3 || '',
                provider.description || '',
                [provider.street, provider.postal_code, provider.city, provider.country].filter(Boolean).join(' '),
                Array.isArray(provider.brands) ? provider.brands.join(' ') : '',
                Array.isArray(provider.services) ? provider.services.join(' ') : ''
            ].join(' ').toLowerCase();
            return words.every(word => haystack.includes(word));
        });
    }

    // 3. Radius-Filter (vom Kartenmittelpunkt)
    if (radiusKm > 0 && mapInstance) {
        const center = mapInstance.getCenter();
        filtered = filtered.filter(p => {
            if (!p.latitude || !p.longitude) return false;
            return getDistanceKm(center.lat, center.lng, p.latitude, p.longitude) <= radiusKm;
        });

        // Radius-Kreis zeichnen
        if (mapRadiusCircle) mapInstance.removeLayer(mapRadiusCircle);
        mapRadiusCircle = L.circle([center.lat, center.lng], {
            radius: radiusKm * 1000,
            color: '#2563eb',
            fillColor: '#2563eb',
            fillOpacity: 0.06,
            weight: 2,
            dashArray: '6 4',
            interactive: false
        }).addTo(mapInstance);
    } else {
        if (mapRadiusCircle) {
            mapInstance.removeLayer(mapRadiusCircle);
            mapRadiusCircle = null;
        }
    }

    mapFilteredProviders = filtered;

    // Zähler aktualisieren
    const countEl = document.getElementById('map-provider-count');
    if (countEl) {
        countEl.textContent = `${filtered.length} von ${mapAllProviders.length} Betrieben`;
    }

    renderMapMarkers(filtered);
}

/** Haversine-Distanz in km */
function getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Marker auf Karte rendern */
function renderMapMarkers(providers) {
    mapMarkerCluster.clearLayers();
    const colors = getMapCategoryColors();

    providers.forEach(provider => {
        if (!provider.latitude || !provider.longitude) return;

        const color = colors[provider.category] || '#6b7280';

        const marker = L.circleMarker([provider.latitude, provider.longitude], {
            radius: 8,
            fillColor: color,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9
        });

        marker.bindPopup(() => buildMapPopup(provider, color), {
            maxWidth: 360,
            minWidth: 280
        });

        mapMarkerCluster.addLayer(marker);
    });

    // Bei erstem Laden: Karte auf alle Marker zoomen
    if (providers.length > 0 && !mapInstance._userHasPanned) {
        const group = L.featureGroup(mapMarkerCluster.getLayers());
        if (group.getLayers().length > 0) {
            mapInstance.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

/** Popup-HTML für einen Provider */
function buildMapPopup(provider, color) {
    const addr = [provider.street, provider.postal_code, provider.city, provider.country]
        .filter(Boolean).join(', ');
    const services = Array.isArray(provider.services) ? provider.services.join(', ') : '';
    const brands = Array.isArray(provider.brands) ? provider.brands.join(', ') : '';

    return `
        <div class="map-popup">
            ${provider.cover_image_url ? `
                <div style="margin:-10px -10px 8px -10px; border-radius:8px 8px 0 0; overflow:hidden;">
                    <img src="${esc(provider.cover_image_url)}"
                         style="width:100%; height:120px; object-fit:cover; display:block;"
                         onerror="this.parentElement.style.display='none'" />
                </div>
            ` : ''}
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                ${provider.logo_url ? `
                    <img src="${esc(provider.logo_url)}"
                         style="width:36px; height:36px; border-radius:6px; object-fit:cover; flex-shrink:0; border:1px solid #e2e8f0;"
                         onerror="this.style.display='none'" />
                ` : ''}
                <h3 style="margin:0; font-size:15px; flex:1;">${esc(provider.name)}</h3>
            </div>
            <span class="map-popup-category" style="background-color:${color};">
                ${esc(provider.category || 'Sonstige')}
            </span>
            ${addr ? `<div class="map-popup-row">${esc(addr)}</div>` : ''}
            ${provider.phone ? `<div class="map-popup-row"><a href="tel:${esc(provider.phone)}">${esc(provider.phone)}</a></div>` : ''}
            ${provider.email ? `<div class="map-popup-row"><a href="mailto:${esc(provider.email)}">${esc(provider.email)}</a></div>` : ''}
            ${provider.website ? `<div class="map-popup-row"><a href="${esc(provider.website)}" target="_blank" rel="noopener" style="color:#0ea5e9; word-break:break-all;">${esc(provider.website)}</a></div>` : ''}
            ${services ? `<div class="map-popup-row"><strong>Services:</strong> ${esc(services)}</div>` : ''}
            ${brands ? `<div class="map-popup-row"><strong>Marken:</strong> ${esc(brands)}</div>` : ''}
            ${provider.description ? `<div class="map-popup-row" style="font-size:11px; color:#6b7280; margin-top:4px;">${esc((provider.description || '').substring(0, 200))}${(provider.description || '').length > 200 ? '...' : ''}</div>` : ''}
            <div class="map-popup-actions">
                <button onclick="window.editProviderFromMap('${provider.id}')"
                        style="background:#2563eb; color:white; padding:5px 12px; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    Bearbeiten
                </button>
                <button onclick="window.deleteProviderFromMap('${provider.id}')"
                        style="background:#ef4444; color:white; padding:5px 12px; border:none; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;">
                    Löschen
                </button>
            </div>
        </div>
    `;
}

/** Provider bearbeiten (vom Map-Popup) */
function editProviderFromMap(providerId) {
    mapInstance.closePopup();
    loadProviderForEdit(providerId);
}

/** Provider löschen (vom Map-Popup) */
async function deleteProviderFromMap(providerId) {
    if (!confirm('Provider wirklich löschen?')) return;
    try {
        const { data, error } = await supabaseClient.rpc('bulk_delete_providers', {
            provider_ids: [providerId]
        });
        if (error) throw error;
        mapInstance.closePopup();
        mapAllProviders = mapAllProviders.filter(p => p.id !== providerId);
        applyMapFilters();
    } catch (error) {
        console.error('Karte: Löschen fehlgeschlagen', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
}

/** Provider löschen aus dem Änderungsanfragen-Modal */
async function deleteProviderFromSuggestion(providerId, suggestionId) {
    if (!confirm('⚠️ Provider wirklich KOMPLETT löschen?\n\nDer Provider und alle zugehörigen Daten werden unwiderruflich entfernt!')) return;

    try {
        // Provider löschen
        const { data, error } = await supabaseClient.rpc('bulk_delete_providers', {
            provider_ids: [providerId]
        });
        if (error) throw error;

        // Änderungsanfrage auf rejected setzen
        await supabaseClient
            .from('provider_edit_suggestions')
            .update({ status: 'rejected' })
            .eq('id', suggestionId);

        // Modal schließen
        document.getElementById('suggestion-modal').classList.remove('active');

        alert('✅ Provider wurde gelöscht');

        // Listen neu laden
        loadSuggestions();
        loadDashboard();

        // Map aktualisieren falls aktiv
        if (typeof mapAllProviders !== 'undefined' && mapAllProviders) {
            mapAllProviders = mapAllProviders.filter(p => p.id !== providerId);
            if (typeof mapMarkerCluster !== 'undefined' && mapMarkerCluster && typeof applyMapFilters === 'function') {
                applyMapFilters();
            }
        }
    } catch (error) {
        console.error('Fehler beim Löschen aus Suggestion:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
}

/** Event-Listener für Suche, Radius und Karten-Bewegung */
function setupMapEventListeners() {
    const searchInput = document.getElementById('map-search-input');
    const radiusSelect = document.getElementById('map-radius-select');

    if (searchInput && !searchInput._mapBound) {
        searchInput.addEventListener('input', () => {
            clearTimeout(mapSearchDebounceTimer);
            mapSearchDebounceTimer = setTimeout(() => applyMapFilters(), 300);
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                clearTimeout(mapSearchDebounceTimer);
                applyMapFilters();
            }
        });
        searchInput._mapBound = true;
    }

    if (radiusSelect && !radiusSelect._mapBound) {
        radiusSelect.addEventListener('change', () => applyMapFilters());
        radiusSelect._mapBound = true;
    }

    if (mapInstance && !mapInstance._moveBound) {
        mapInstance.on('moveend', () => {
            mapInstance._userHasPanned = true;
            const radiusKm = parseInt(document.getElementById('map-radius-select')?.value || '0');
            if (radiusKm > 0) applyMapFilters();
        });
        mapInstance._moveBound = true;
    }
}

// ============================================
// BEWERTUNGEN (Reviews Management / Moderation)
// ============================================

let allLoadedReviews = [];

async function loadReviews() {
    const listEl = document.getElementById('reviews-list');
    const statsEl = document.getElementById('reviews-stats');
    if (!listEl) return;

    listEl.innerHTML = '<p style="text-align:center; padding:40px; color:#64748b;">Bewertungen werden geladen...</p>';

    try {
        const { data: reviews, error } = await supabaseClient
            .from('reviews')
            .select('id, service_provider_id, user_id, rating, comment, created_at, service_providers(name, category, city)')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        allLoadedReviews = reviews || [];
        filterReviews();
    } catch (error) {
        console.error('Fehler beim Laden der Reviews:', error);
        listEl.innerHTML = '<p style="color:#dc2626;">Fehler: ' + esc(error.message) + '</p>';
    }
}

function filterReviews() {
    const listEl = document.getElementById('reviews-list');
    const statsEl = document.getElementById('reviews-stats');
    if (!listEl) return;

    const searchTerm = (document.getElementById('review-search')?.value || '').toLowerCase().trim();
    const ratingFilter = document.getElementById('review-rating-filter')?.value || 'all';

    let filtered = allLoadedReviews;

    if (searchTerm) {
        const words = searchTerm.split(/\s+/);
        filtered = filtered.filter(r => {
            const haystack = [
                r.service_providers?.name || '',
                r.service_providers?.city || '',
                r.comment || ''
            ].join(' ').toLowerCase();
            return words.every(w => haystack.includes(w));
        });
    }

    if (ratingFilter !== 'all') {
        filtered = filtered.filter(r => r.rating === parseInt(ratingFilter));
    }

    // Statistik
    if (statsEl) {
        const total = allLoadedReviews.length;
        const avgAll = total > 0 ? (allLoadedReviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1) : '–';
        statsEl.innerHTML = '<strong>' + filtered.length + '</strong> von ' + total + ' Bewertungen'
            + (filtered.length !== total ? ' (gefiltert)' : '')
            + ' &nbsp;|&nbsp; Gesamtdurchschnitt: <strong>' + avgAll + '</strong> ★';
    }

    if (filtered.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; padding:40px; color:#64748b;">Keine Bewertungen gefunden.</p>';
        return;
    }

    listEl.innerHTML = filtered.map(r => {
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const providerName = r.service_providers?.name || 'Unbekannt';
        const providerCity = r.service_providers?.city || '';
        const category = r.service_providers?.category || '';
        const date = new Date(r.created_at).toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // Farbe basierend auf Bewertung
        const ratingColor = r.rating >= 4 ? '#16a34a' : r.rating <= 2 ? '#dc2626' : '#d97706';

        return '<div class="review-card">'
            + '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">'
            + '  <div style="flex:1; min-width:0;">'
            + '    <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">'
            + '      <span style="color:' + ratingColor + '; font-size:16px; letter-spacing:2px;">' + stars + '</span>'
            + '      <span style="font-size:13px; color:#64748b;">' + esc(date) + '</span>'
            + '    </div>'
            + '    <div style="font-weight:600; margin-bottom:4px;">'
            + '      ' + esc(providerName)
            + '      <span style="font-weight:normal; color:#64748b; font-size:13px;">'
            + (providerCity ? ' (' + esc(providerCity) + ')' : '')
            + (category ? ' – ' + esc(category) : '')
            + '      </span>'
            + '    </div>'
            + '    <div style="font-size:14px; color:#374151; white-space:pre-wrap; word-break:break-word;">' + esc(r.comment) + '</div>'
            + '    <div style="font-size:11px; color:#94a3b8; margin-top:6px;">User-ID: ' + r.user_id + '</div>'
            + '  </div>'
            + '  <button onclick="window.adminDeleteReview(\'' + r.id + '\', \'' + esc(providerName).replace(/'/g, "\\'") + '\')"'
            + '          class="review-delete-btn">'
            + '    🗑️ Entfernen'
            + '  </button>'
            + '</div>'
            + '</div>';
    }).join('');
}

async function adminDeleteReview(reviewId, providerName) {
    if (!confirm('Bewertung fuer "' + providerName + '" wirklich entfernen?\n\nDies kann nicht rueckgaengig gemacht werden.')) return;

    try {
        const { data, error } = await supabaseClient.rpc('admin_delete_review', {
            p_review_id: reviewId
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        // Lokal entfernen und neu rendern
        allLoadedReviews = allLoadedReviews.filter(r => r.id !== reviewId);
        filterReviews();

        const avgInfo = data.avg_rating !== undefined
            ? ' Neuer Durchschnitt: ' + data.avg_rating + ' (' + data.review_count + ' Bewertungen)'
            : '';
        alert('Bewertung entfernt.' + avgInfo);

    } catch (error) {
        console.error('Fehler beim Loeschen:', error);
        alert('Fehler beim Entfernen: ' + error.message);
    }
}

// ============================================================
// SHOP-VERWALTUNG
// ============================================================

let shopProviders = [];

async function loadShopManagement() {
    console.log('🛒 Lade Shop-Verwaltung...');
    try {
        // Provider mit Shop-relevanten Daten laden
        const { data: providers, error } = await supabaseClient
            .from('service_providers')
            .select('id, name, category, city, is_shop_active, commission_rate, stripe_account_id, user_id')
            .order('name');

        if (error) throw error;
        shopProviders = providers || [];

        // Produkt-Count laden
        const { count: productsCount } = await supabaseClient
            .from('metashop_products')
            .select('id', { count: 'exact', head: true });

        // Orders-Count laden (falls Tabelle existiert)
        let ordersCount = 0;
        try {
            const { count } = await supabaseClient
                .from('orders')
                .select('id', { count: 'exact', head: true });
            ordersCount = count || 0;
        } catch(e) { /* Tabelle existiert noch nicht */ }

        // Stats aktualisieren
        const activeShops = shopProviders.filter(p => p.is_shop_active).length;
        document.getElementById('shop-active-count').textContent = activeShops;
        document.getElementById('shop-products-count').textContent = productsCount || 0;
        document.getElementById('shop-orders-count').textContent = ordersCount;

        renderShopProviders(shopProviders);
    } catch (err) {
        console.error('Shop-Verwaltung Fehler:', err);
    }
}

function renderShopProviders(providers) {
    const tbody = document.getElementById('shop-providers-body');
    if (!providers || providers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">Keine Provider gefunden</td></tr>';
        return;
    }

    tbody.innerHTML = providers.map(p => {
        const shopActive = p.is_shop_active ? true : false;
        const rate = p.commission_rate != null ? p.commission_rate : 10;
        const hasStripe = p.stripe_account_id ? true : false;
        const hasUser = p.user_id ? true : false;

        return '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:10px;">' +
                '<strong>' + escapeHtml(p.name) + '</strong>' +
                (p.city ? '<br><small style="color:#94a3b8;">' + escapeHtml(p.city) + '</small>' : '') +
            '</td>' +
            '<td style="padding:10px;">' + escapeHtml(p.category || '-') + '</td>' +
            '<td style="padding:10px;text-align:center;">' +
                '<label class="toggle-switch">' +
                    '<input type="checkbox" ' + (shopActive ? 'checked' : '') + ' onchange="window.toggleShopActive(\'' + p.id + '\', this.checked)">' +
                    '<span class="toggle-slider"></span>' +
                '</label>' +
            '</td>' +
            '<td style="padding:10px;text-align:center;">' +
                '<input type="number" value="' + rate + '" min="0" max="30" step="0.5" ' +
                    'style="width:70px;text-align:center;padding:5px;border:1px solid #e2e8f0;border-radius:6px;" ' +
                    'onchange="window.updateCommissionRate(\'' + p.id + '\', this.value)">' +
                ' %' +
            '</td>' +
            '<td style="padding:10px;text-align:center;" id="product-count-' + p.id + '">-</td>' +
            '<td style="padding:10px;text-align:center;">' +
                (hasStripe
                    ? '<span style="color:#10b981;font-weight:600;">✓ Verbunden</span>'
                    : '<span style="color:#94a3b8;">–</span>') +
            '</td>' +
            '<td style="padding:10px;text-align:center;">' +
                (hasUser
                    ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:10px;font-size:12px;">Registriert</span>'
                    : '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px;font-size:12px;">Kein Login</span>') +
            '</td>' +
        '</tr>';
    }).join('');

    // Produkt-Counts asynchron nachladen
    providers.forEach(async (p) => {
        const { count } = await supabaseClient
            .from('metashop_products')
            .select('id', { count: 'exact', head: true })
            .eq('provider_id', p.id);
        const cell = document.getElementById('product-count-' + p.id);
        if (cell) cell.textContent = count || 0;
    });
}

window.toggleShopActive = async function(providerId, isActive) {
    try {
        const { error } = await supabaseClient
            .from('service_providers')
            .update({ is_shop_active: isActive })
            .eq('id', providerId);

        if (error) throw error;
        console.log('Shop ' + (isActive ? 'aktiviert' : 'deaktiviert') + ' für ' + providerId);

        // Stats aktualisieren
        const activeCount = document.getElementById('shop-active-count');
        const current = parseInt(activeCount.textContent) || 0;
        activeCount.textContent = isActive ? current + 1 : Math.max(0, current - 1);
    } catch (err) {
        alert('Fehler: ' + err.message);
    }
};

window.updateCommissionRate = async function(providerId, rate) {
    const numRate = parseFloat(rate);
    if (isNaN(numRate) || numRate < 0 || numRate > 30) {
        alert('Provision muss zwischen 0% und 30% liegen.');
        return;
    }
    try {
        const { error } = await supabaseClient
            .from('service_providers')
            .update({ commission_rate: numRate })
            .eq('id', providerId);

        if (error) throw error;
        console.log('Provision aktualisiert: ' + numRate + '% für ' + providerId);
    } catch (err) {
        alert('Fehler: ' + err.message);
    }
};

window.filterShopProviders = function() {
    const search = (document.getElementById('shop-search').value || '').toLowerCase();
    const filtered = shopProviders.filter(p =>
        p.name.toLowerCase().includes(search) ||
        (p.city || '').toLowerCase().includes(search) ||
        (p.category || '').toLowerCase().includes(search)
    );
    renderShopProviders(filtered);
};

// ============================================
// Zahlungen (Payments) Page
// ============================================

let allPayments = [];
let currentPaymentFilter = 'all';

async function loadPayments() {
    console.log('💳 Lade Zahlungen...');
    try {
        // Bestellungen mit Provider-Info laden
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('id, order_number, total, commission_amount, payment_status, status, created_at, provider_id, service_providers(name, stripe_account_id)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        allPayments = orders || [];

        // Stats berechnen
        const paid = allPayments.filter(o => o.payment_status === 'paid');
        const pending = allPayments.filter(o => o.payment_status === 'pending');
        const totalRevenue = paid.reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
        const totalCommission = paid.reduce((sum, o) => sum + parseFloat(o.commission_amount || 0), 0);

        document.getElementById('payment-total-revenue').textContent = totalRevenue.toFixed(2) + ' €';
        document.getElementById('payment-total-commission').textContent = totalCommission.toFixed(2) + ' €';
        document.getElementById('payment-paid-count').textContent = paid.length;
        document.getElementById('payment-pending-count').textContent = pending.length;

        renderPayments(allPayments);
        loadStripeAccounts();
    } catch (err) {
        console.error('Zahlungen-Fehler:', err);
        document.getElementById('payments-body').innerHTML =
            '<tr><td colspan="7" style="text-align:center;padding:40px;color:#ef4444;">Fehler beim Laden: ' + err.message + '</td></tr>';
    }
}

function renderPayments(payments) {
    const tbody = document.getElementById('payments-body');
    if (!payments || payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">Keine Zahlungen gefunden</td></tr>';
        return;
    }

    tbody.innerHTML = payments.map(o => {
        const providerName = o.service_providers?.name || 'Unbekannt';
        const date = new Date(o.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const total = parseFloat(o.total || 0).toFixed(2);
        const commission = parseFloat(o.commission_amount || 0).toFixed(2);

        let statusBadge = '';
        switch (o.payment_status) {
            case 'paid':
                statusBadge = '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Bezahlt</span>';
                break;
            case 'pending':
                statusBadge = '<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Ausstehend</span>';
                break;
            case 'failed':
                statusBadge = '<span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Fehlgeschlagen</span>';
                break;
            case 'refunded':
                statusBadge = '<span style="background:#f1f5f9;color:#64748b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Erstattet</span>';
                break;
            default:
                statusBadge = '<span style="background:#f1f5f9;color:#64748b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + escapeHtml(o.payment_status || '-') + '</span>';
        }

        let orderStatusBadge = '';
        switch (o.status) {
            case 'confirmed':
                orderStatusBadge = '<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Bestätigt</span>';
                break;
            case 'shipped':
                orderStatusBadge = '<span style="background:#ede9fe;color:#5b21b6;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Versendet</span>';
                break;
            case 'delivered':
                orderStatusBadge = '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Geliefert</span>';
                break;
            case 'cancelled':
                orderStatusBadge = '<span style="background:#fee2e2;color:#991b1b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Storniert</span>';
                break;
            default:
                orderStatusBadge = '<span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + escapeHtml(o.status || 'Pending') + '</span>';
        }

        return '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:10px;"><strong>' + escapeHtml(o.order_number || '-') + '</strong></td>' +
            '<td style="padding:10px;">' + escapeHtml(providerName) + '</td>' +
            '<td style="padding:10px;text-align:right;font-weight:600;">' + total + ' €</td>' +
            '<td style="padding:10px;text-align:right;color:#f97316;font-weight:600;">' + commission + ' €</td>' +
            '<td style="padding:10px;text-align:center;">' + statusBadge + '</td>' +
            '<td style="padding:10px;text-align:center;">' + orderStatusBadge + '</td>' +
            '<td style="padding:10px;color:#64748b;font-size:13px;">' + date + '</td>' +
        '</tr>';
    }).join('');
}

window.filterPayments = function(filter) {
    currentPaymentFilter = filter;

    // Update active filter button
    document.querySelectorAll('#payment-filter-bar .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === getFilterLabel(filter).toLowerCase());
    });

    let filtered = allPayments;
    if (filter !== 'all') {
        filtered = allPayments.filter(o => o.payment_status === filter);
    }
    renderPayments(filtered);
};

function getFilterLabel(filter) {
    switch (filter) {
        case 'all': return 'Alle';
        case 'paid': return 'Bezahlt';
        case 'pending': return 'Ausstehend';
        case 'failed': return 'Fehlgeschlagen';
        case 'refunded': return 'Erstattet';
        default: return filter;
    }
}

async function loadStripeAccounts() {
    try {
        const { data: providers, error } = await supabaseClient
            .from('service_providers')
            .select('id, name, city, stripe_account_id, is_shop_active, commission_rate')
            .not('stripe_account_id', 'is', null)
            .order('name');

        if (error) throw error;

        const container = document.getElementById('stripe-accounts-list');
        if (!providers || providers.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8;text-align:center;padding:20px;">Noch keine Stripe Connect Konten verbunden.</p>';
            return;
        }

        container.innerHTML = providers.map(p => {
            const rate = p.commission_rate != null ? p.commission_rate : 10;
            return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;border-radius:8px;">' +
                '<div>' +
                    '<strong>' + escapeHtml(p.name) + '</strong>' +
                    (p.city ? '<span style="color:#94a3b8;margin-left:8px;font-size:13px;">' + escapeHtml(p.city) + '</span>' : '') +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:16px;">' +
                    '<span style="font-size:13px;color:#64748b;">Provision: <strong>' + rate + '%</strong></span>' +
                    '<span style="background:#d1fae5;color:#065f46;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Stripe verbunden</span>' +
                    (p.is_shop_active
                        ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Shop aktiv</span>'
                        : '<span style="background:#f1f5f9;color:#64748b;padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">Shop inaktiv</span>') +
                '</div>' +
            '</div>';
        }).join('');
    } catch (err) {
        console.error('Stripe-Konten Fehler:', err);
    }
}

// ============================================
// Admin Bestellverwaltung (Admin Orders)
// ============================================

let allAdminOrders = [];
let currentAdminOrderFilter = 'all';

async function loadAdminOrders() {
    console.log('📦 Lade Bestellungen...');
    try {
        const { data: orders, error } = await supabaseClient
            .from('orders')
            .select('id, order_number, total, commission_amount, status, payment_status, created_at, shipping_name, provider_id, buyer_id, service_providers(name)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        allAdminOrders = orders || [];

        // Stats
        const pending = allAdminOrders.filter(o => o.status === 'pending').length;
        const shipped = allAdminOrders.filter(o => o.status === 'shipped').length;
        const delivered = allAdminOrders.filter(o => o.status === 'delivered').length;

        document.getElementById('admin-orders-total').textContent = allAdminOrders.length;
        document.getElementById('admin-orders-pending').textContent = pending;
        document.getElementById('admin-orders-shipped').textContent = shipped;
        document.getElementById('admin-orders-delivered').textContent = delivered;

        renderAdminOrders(allAdminOrders);
    } catch (err) {
        console.error('Admin-Orders Fehler:', err);
        document.getElementById('admin-orders-body').innerHTML =
            '<tr><td colspan="7" style="text-align:center;padding:40px;color:#ef4444;">Fehler: ' + err.message + '</td></tr>';
    }
}

function renderAdminOrders(orders) {
    const tbody = document.getElementById('admin-orders-body');
    if (!orders || orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">Keine Bestellungen gefunden</td></tr>';
        return;
    }

    const statusLabels = {
        'pending': { label: 'Offen', bg: '#fef3c7', color: '#92400e' },
        'confirmed': { label: 'Bestätigt', bg: '#dbeafe', color: '#1e40af' },
        'shipped': { label: 'Versendet', bg: '#ede9fe', color: '#5b21b6' },
        'delivered': { label: 'Geliefert', bg: '#d1fae5', color: '#065f46' },
        'cancelled': { label: 'Storniert', bg: '#fee2e2', color: '#991b1b' },
        'refunded': { label: 'Erstattet', bg: '#f1f5f9', color: '#64748b' },
    };

    const paymentLabels = {
        'paid': { label: 'Bezahlt', bg: '#d1fae5', color: '#065f46' },
        'pending': { label: 'Ausstehend', bg: '#fef3c7', color: '#92400e' },
        'failed': { label: 'Fehlg.', bg: '#fee2e2', color: '#991b1b' },
        'refunded': { label: 'Erstattet', bg: '#f1f5f9', color: '#64748b' },
    };

    tbody.innerHTML = orders.map(o => {
        const providerName = o.service_providers?.name || 'Unbekannt';
        const date = new Date(o.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const total = parseFloat(o.total || 0).toFixed(2);
        const st = statusLabels[o.status] || { label: o.status, bg: '#f1f5f9', color: '#64748b' };
        const pt = paymentLabels[o.payment_status] || { label: o.payment_status || '-', bg: '#f1f5f9', color: '#64748b' };

        return '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:10px;"><strong>' + escapeHtml(o.order_number || '-') + '</strong></td>' +
            '<td style="padding:10px;">' + escapeHtml(providerName) + '</td>' +
            '<td style="padding:10px;">' + escapeHtml(o.shipping_name || '-') + '</td>' +
            '<td style="padding:10px;text-align:right;font-weight:600;">' + total + ' €</td>' +
            '<td style="padding:10px;text-align:center;"><span style="background:' + st.bg + ';color:' + st.color + ';padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + st.label + '</span></td>' +
            '<td style="padding:10px;text-align:center;"><span style="background:' + pt.bg + ';color:' + pt.color + ';padding:2px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + pt.label + '</span></td>' +
            '<td style="padding:10px;color:#64748b;font-size:13px;">' + date + '</td>' +
        '</tr>';
    }).join('');
}

window.filterAdminOrders = function(filter) {
    currentAdminOrderFilter = filter;

    // Update active filter button
    document.querySelectorAll('#admin-orders-filter-bar .filter-btn').forEach(btn => {
        const label = btn.textContent.trim().toLowerCase();
        const filterLabel = {
            'all': 'alle', 'pending': 'offen', 'confirmed': 'bestätigt',
            'shipped': 'versendet', 'delivered': 'geliefert', 'cancelled': 'storniert'
        }[filter] || filter;
        btn.classList.toggle('active', label === filterLabel);
    });

    let filtered = allAdminOrders;
    if (filter !== 'all') {
        filtered = allAdminOrders.filter(o => o.status === filter);
    }
    renderAdminOrders(filtered);
};

window.searchAdminOrders = function() {
    const search = (document.getElementById('admin-orders-search').value || '').toLowerCase();
    let filtered = allAdminOrders;

    if (currentAdminOrderFilter !== 'all') {
        filtered = filtered.filter(o => o.status === currentAdminOrderFilter);
    }

    if (search) {
        filtered = filtered.filter(o =>
            (o.order_number || '').toLowerCase().includes(search) ||
            (o.service_providers?.name || '').toLowerCase().includes(search) ||
            (o.shipping_name || '').toLowerCase().includes(search)
        );
    }

    renderAdminOrders(filtered);
};

// ============================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================
// ADMIN PROMOTIONS
// ============================================

let allAdminPromos = [];
let adminPromosFilter = 'all';

async function loadAdminPromotions() {
    console.log('🏷️ Loading admin promotions...');

    const { data: promos, error } = await supabaseClient
        .from('provider_promotions')
        .select('*, service_providers(id, company_name)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Failed to load promotions:', error);
        return;
    }

    allAdminPromos = promos || [];

    // Stats
    const total = allAdminPromos.length;
    const active = allAdminPromos.filter(p => p.is_active).length;
    const totalUsage = allAdminPromos.reduce((sum, p) => sum + (p.current_uses || 0), 0);

    document.getElementById('admin-promos-total').textContent = total;
    document.getElementById('admin-promos-active').textContent = active;
    document.getElementById('admin-promos-usage').textContent = totalUsage;

    // Calculate total discount from orders
    const { data: orders } = await supabaseClient
        .from('orders')
        .select('discount_amount')
        .gt('discount_amount', 0);

    const totalDiscounts = (orders || []).reduce((sum, o) => sum + (o.discount_amount || 0), 0);
    document.getElementById('admin-promos-discount-total').textContent =
        totalDiscounts.toFixed(2).replace('.', ',') + ' €';

    renderAdminPromotions(allAdminPromos);
}

function renderAdminPromotions(promos) {
    const tbody = document.getElementById('admin-promos-body');
    if (!promos || promos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">Keine Promotions gefunden</td></tr>';
        return;
    }

    const now = new Date().toISOString().split('T')[0];

    tbody.innerHTML = promos.map(p => {
        const provider = p.service_providers?.company_name || '—';
        const discount = p.discount_type === 'percent'
            ? `${p.discount_value}%`
            : `${Number(p.discount_value).toFixed(2)} €`;

        const usage = `${p.current_uses || 0}${p.max_uses ? '/' + p.max_uses : ''}`;

        let validity = '';
        if (p.valid_from) validity += `Ab: ${p.valid_from}`;
        if (p.valid_from && p.valid_until) validity += '<br>';
        if (p.valid_until) validity += `Bis: ${p.valid_until}`;
        if (!validity) validity = 'Unbegrenzt';

        let statusLabel = 'Aktiv';
        let statusClass = 'badge-confirmed';
        if (!p.is_active) { statusLabel = 'Inaktiv'; statusClass = 'badge-pending'; }
        else if (p.valid_from && now < p.valid_from) { statusLabel = 'Geplant'; statusClass = 'badge-pending'; }
        else if (p.valid_until && now > p.valid_until) { statusLabel = 'Abgelaufen'; statusClass = 'badge-cancelled'; }
        else if (p.max_uses && (p.current_uses || 0) >= p.max_uses) { statusLabel = 'Aufgebraucht'; statusClass = 'badge-cancelled'; }

        // Filters
        const filters = [];
        if (p.filter_categories?.length) filters.push(...p.filter_categories.map(c => `📦 ${escapeHtml(c)}`));
        if (p.filter_boat_types?.length) filters.push(...p.filter_boat_types.map(t => `⛵ ${escapeHtml(t)}`));
        if (p.filter_manufacturers?.length) filters.push(...p.filter_manufacturers.map(m => `🔧 ${escapeHtml(m)}`));
        if (p.filter_min_order) filters.push(`💰 Min. ${p.filter_min_order} €`);
        const filterHtml = filters.length
            ? filters.map(f => `<span style="display:inline-block;padding:2px 8px;margin:2px;background:#f1f5f9;border-radius:10px;font-size:0.75rem;">${f}</span>`).join('')
            : '<span style="color:#94a3b8;font-size:0.8rem;">Keine</span>';

        return `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px;">
                <strong>${escapeHtml(p.name)}</strong>
                ${p.description ? `<br><span style="font-size:0.8rem;color:#64748b;">${escapeHtml(p.description)}</span>` : ''}
            </td>
            <td style="padding:10px;">${escapeHtml(provider)}</td>
            <td style="padding:10px;text-align:center;">
                <span style="font-weight:700;color:var(--primary);font-size:1.1rem;">${discount}</span>
            </td>
            <td style="padding:10px;text-align:center;">${usage}</td>
            <td style="padding:10px;text-align:center;font-size:0.8rem;">${validity}</td>
            <td style="padding:10px;text-align:center;"><span class="badge ${statusClass}">${statusLabel}</span></td>
            <td style="padding:10px;text-align:center;">${filterHtml}</td>
        </tr>`;
    }).join('');
}

window.filterAdminPromos = function(filter) {
    adminPromosFilter = filter;
    const now = new Date().toISOString().split('T')[0];

    // Update active button
    document.querySelectorAll('#admin-promos-filter-bar .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim().toLowerCase().includes(
            filter === 'all' ? 'alle' : filter === 'active' ? 'aktiv' : filter === 'inactive' ? 'inaktiv' : 'abgelaufen'
        ));
    });

    let filtered = [...allAdminPromos];
    if (filter === 'active') {
        filtered = filtered.filter(p => p.is_active && (!p.valid_until || now <= p.valid_until));
    } else if (filter === 'inactive') {
        filtered = filtered.filter(p => !p.is_active);
    } else if (filter === 'expired') {
        filtered = filtered.filter(p => p.valid_until && now > p.valid_until);
    }

    const search = document.getElementById('admin-promos-search')?.value?.toLowerCase() || '';
    if (search) {
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(search) ||
            (p.service_providers?.company_name || '').toLowerCase().includes(search)
        );
    }

    renderAdminPromotions(filtered);
};

window.searchAdminPromos = function() {
    window.filterAdminPromos(adminPromosFilter);
};

// ============================================
// API MONITORING
// ============================================

async function loadApiMonitoring() {
    console.log('🔌 Loading API monitoring...');

    // Load providers with API keys
    const { data: providers } = await supabaseClient
        .from('service_providers')
        .select('id, company_name, api_key, webhook_url, is_shop_active')
        .order('company_name');

    const allProviders = providers || [];
    const withApiKey = allProviders.filter(p => p.api_key);
    const withWebhook = allProviders.filter(p => p.webhook_url);

    // Stats
    document.getElementById('api-keys-count').textContent = withApiKey.length;
    document.getElementById('api-webhooks-count').textContent = withWebhook.length;

    // Load API usage logs (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: usageLogs, count: todayCount } = await supabaseClient
        .from('api_usage_logs')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', todayStart.toISOString());

    document.getElementById('api-calls-today').textContent = todayCount || 0;

    // Load webhook events (errors)
    const { data: webhookEvents } = await supabaseClient
        .from('webhook_events')
        .select('*')
        .order('created_at', { ascending: false })
        .range(0, 49);

    const failedEvents = (webhookEvents || []).filter(e =>
        e.results?.some(r => !r.success)
    );
    document.getElementById('api-errors-count').textContent = failedEvents.length;

    // Render API keys table
    renderApiKeys(allProviders);

    // Render webhook events
    renderWebhookEvents(webhookEvents || []);
}

function renderApiKeys(providers) {
    const tbody = document.getElementById('api-keys-body');

    const relevant = providers.filter(p => p.api_key || p.webhook_url || p.is_shop_active);

    if (relevant.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8;">Keine Provider mit API-Zugang</td></tr>';
        return;
    }

    tbody.innerHTML = relevant.map(p => {
        const keyDisplay = p.api_key
            ? `<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:0.8rem;">${p.api_key.substring(0, 10)}••••</code>`
            : '<span style="color:#94a3b8;">—</span>';

        const webhookDisplay = p.webhook_url
            ? `<span style="font-size:0.8rem;color:var(--primary);" title="${escapeHtml(p.webhook_url)}">✅ Konfiguriert</span>`
            : '<span style="color:#94a3b8;font-size:0.8rem;">—</span>';

        return `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px;"><strong>${escapeHtml(p.company_name || '—')}</strong></td>
            <td style="padding:10px;">${keyDisplay}</td>
            <td style="padding:10px;text-align:center;">${webhookDisplay}</td>
            <td style="padding:10px;text-align:center;">
                <span class="badge ${p.is_shop_active ? 'badge-confirmed' : 'badge-pending'}">${p.is_shop_active ? 'Aktiv' : 'Inaktiv'}</span>
            </td>
            <td style="padding:10px;text-align:center;">—</td>
        </tr>`;
    }).join('');
}

function renderWebhookEvents(events) {
    const tbody = document.getElementById('webhook-events-body');

    if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8;">Keine Webhook-Events</td></tr>';
        return;
    }

    tbody.innerHTML = events.map(e => {
        const eventIcons = {
            'order_created': '🆕',
            'order_confirmed': '✅',
            'order_shipped': '🚚',
            'order_delivered': '📦',
            'order_cancelled': '❌',
        };
        const icon = eventIcons[e.event_type] || '📡';

        const allSuccess = e.results?.every(r => r.success) ?? true;
        const statusHtml = allSuccess
            ? '<span class="badge badge-confirmed">Erfolg</span>'
            : '<span class="badge badge-cancelled">Fehler</span>';

        const date = e.created_at ? new Date(e.created_at).toLocaleString('de-DE') : '—';
        const orderNumber = e.payload?.order?.order_number || e.order_id?.substring(0, 8) || '—';

        return `<tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:10px;">${icon} ${escapeHtml(e.event_type)}</td>
            <td style="padding:10px;">${escapeHtml(e.provider_id?.substring(0, 8) || '—')}</td>
            <td style="padding:10px;"><code style="font-size:0.8rem;">${escapeHtml(orderNumber)}</code></td>
            <td style="padding:10px;text-align:center;">${statusHtml}</td>
            <td style="padding:10px;font-size:0.85rem;color:var(--gray-500);">${date}</td>
        </tr>`;
    }).join('');
}


// ═════════════════════════════════════════════════════════════════════
// PROVIDER EINLADEN — ruft die Supabase Edge Function 'invite-provider' auf
// ═════════════════════════════════════════════════════════════════════
window.handleInviteProvider = async function(event) {
    event.preventDefault();

    const form    = document.getElementById('invite-provider-form');
    const btn     = document.getElementById('invite-submit-btn');
    const msgBox  = document.getElementById('invite-message');
    const data    = Object.fromEntries(new FormData(form).entries());

    msgBox.innerHTML = '';
    btn.disabled    = true;
    btn.textContent = 'Sende…';

    try {
        if (!supabaseClient) throw new Error('Supabase Client nicht initialisiert');

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Bitte zuerst als Admin einloggen.');

        const res = await fetch(
            `${SUPABASE_CONFIG.url}/functions/v1/invite-provider`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey':        SUPABASE_CONFIG.anonKey,
                },
                body: JSON.stringify(data),
            }
        );

        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(result.error || `Fehler ${res.status}`);
        }

        msgBox.innerHTML = `
            <div style="padding:12px 16px;background:#dcfce7;color:#14532d;border-radius:8px;font-size:14px;">
                ✓ Einladung an <strong>${result.email}</strong> gesendet.<br>
                <small>User-ID: <code>${result.user_id}</code></small>
            </div>`;
        form.reset();
    } catch (err) {
        console.error('Invite-Provider Fehler:', err);
        msgBox.innerHTML = `
            <div style="padding:12px 16px;background:#fee2e2;color:#7f1d1d;border-radius:8px;font-size:14px;">
                ✗ ${err.message}
            </div>`;
    } finally {
        btn.disabled    = false;
        btn.textContent = '✉️ Einladung senden';
    }

    return false;
};

// ========================================================================
// Admin einladen / verwalten
// ========================================================================
window.handleInviteAdmin = async function(event) {
    event.preventDefault();

    const form   = document.getElementById('invite-admin-form');
    const btn    = document.getElementById('admin-submit-btn');
    const msgBox = document.getElementById('admin-invite-message');
    const data   = Object.fromEntries(new FormData(form).entries());

    msgBox.innerHTML = '';
    btn.disabled    = true;
    btn.textContent = 'Sende…';

    try {
        if (!supabaseClient) throw new Error('Supabase Client nicht initialisiert');

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Bitte zuerst als Admin einloggen.');

        const res = await fetch(
            `${SUPABASE_CONFIG.url}/functions/v1/invite-admin`,
            {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey':        SUPABASE_CONFIG.anonKey,
                },
                body: JSON.stringify(data),
            }
        );

        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(result.error || `Fehler ${res.status}`);
        }

        msgBox.innerHTML = `
            <div style="padding:12px 16px;background:#dcfce7;color:#14532d;border-radius:8px;font-size:14px;">
                ✓ Admin-Einladung an <strong>${result.email}</strong> gesendet.
            </div>`;
        form.reset();
        loadAdminList();
    } catch (err) {
        console.error('Invite-Admin Fehler:', err);
        msgBox.innerHTML = `
            <div style="padding:12px 16px;background:#fee2e2;color:#7f1d1d;border-radius:8px;font-size:14px;">
                ✗ ${err.message}
            </div>`;
    } finally {
        btn.disabled    = false;
        btn.textContent = '🛡️ Admin einladen';
    }

    return false;
};

async function loadAdminList() {
    const listBox = document.getElementById('admin-list');
    if (!listBox || !supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('id, email, full_name, created_at')
            .eq('role', 'admin')
            .order('created_at', { ascending: true });

        if (error) throw error;
        if (!data || data.length === 0) {
            listBox.textContent = 'Keine Admins gefunden.';
            return;
        }

        listBox.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                    <tr style="text-align:left;border-bottom:1px solid #e2e8f0;">
                        <th style="padding:8px 4px;">E-Mail</th>
                        <th style="padding:8px 4px;">Name</th>
                        <th style="padding:8px 4px;">Angelegt</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.map(a => `
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:6px 4px;"><code>${a.email || '—'}</code></td>
                            <td style="padding:6px 4px;">${a.full_name || '—'}</td>
                            <td style="padding:6px 4px;color:#64748b;">${a.created_at ? new Date(a.created_at).toLocaleDateString('de-DE') : '—'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error('loadAdminList Fehler:', err);
        listBox.innerHTML = `<div style="color:#dc2626;">Fehler beim Laden: ${err.message}</div>`;
    }
}

// ============================================================
// Benutzer-Verwaltung
// ============================================================

let allUsers = []; // Cache für Such-/Filter-Operationen

async function loadUsers() {
    const tbody = document.getElementById('users-body');
    if (!tbody || !supabaseClient) return;

    tbody.innerHTML = '<tr><td colspan="8" style="padding:24px; text-align:center; color:#94a3b8;">Wird geladen…</td></tr>';

    try {
        const { data, error } = await supabaseClient.rpc('admin_list_users');
        if (error) throw error;

        allUsers = data || [];
        updateUsersStats(allUsers);
        renderUsers(allUsers);
    } catch (err) {
        console.error('loadUsers Fehler:', err);
        tbody.innerHTML = `<tr><td colspan="8" style="padding:24px; text-align:center; color:#dc2626;">Fehler: ${err.message}</td></tr>`;
    }
}

function updateUsersStats(users) {
    const total = users.length;
    const admins = users.filter(u => u.role === 'admin').length;
    const readonly = users.filter(u => u.role === 'admin_readonly').length;
    const withBoats = users.filter(u => Number(u.boats_count) > 0).length;

    document.getElementById('users-total').textContent = total;
    document.getElementById('users-admins').textContent = admins;
    document.getElementById('users-readonly').textContent = readonly;
    document.getElementById('users-with-boats').textContent = withBoats;
}

function searchUsers() {
    const q = (document.getElementById('users-search')?.value || '').trim().toLowerCase();
    const roleFilter = document.getElementById('users-role-filter')?.value || '';
    const filtered = allUsers.filter(u => {
        if (roleFilter && u.role !== roleFilter) return false;
        if (!q) return true;
        return (u.email || '').toLowerCase().includes(q) ||
               (u.full_name || '').toLowerCase().includes(q);
    });
    renderUsers(filtered);
}
window.searchUsers = searchUsers;

function roleBadge(role) {
    const map = {
        admin:          { label: 'Admin',          color: '#7c3aed', bg: '#ede9fe' },
        admin_readonly: { label: 'Read-only',      color: '#0369a1', bg: '#e0f2fe' },
        user:           { label: 'Nutzer',         color: '#475569', bg: '#f1f5f9' },
    };
    const s = map[role] || map.user;
    return `<span style="display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; color:${s.color}; background:${s.bg};">${s.label}</span>`;
}

function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderUsers(users) {
    const tbody = document.getElementById('users-body');
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="padding:24px; text-align:center; color:#94a3b8;">Keine Benutzer gefunden.</td></tr>';
        return;
    }

    const isReadonly = window.currentAdminRole === 'admin_readonly';
    const myId = currentUser?.id;

    tbody.innerHTML = users.map(u => {
        const isSelf = u.id === myId;
        const actionsDisabled = isReadonly || isSelf;
        const roleSelectDisabled = actionsDisabled ? 'disabled' : '';
        const deleteHidden = actionsDisabled ? 'style="display:none;"' : '';

        return `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:10px 12px;"><code style="font-size:12px;">${escapeHtml(u.email || '—')}</code>${isSelf ? ' <span style="font-size:11px; color:#16a34a;">(Sie)</span>' : ''}</td>
                <td style="padding:10px 12px;">${escapeHtml(u.full_name || '—')}</td>
                <td style="padding:10px 12px;">
                    ${isReadonly || isSelf
                        ? roleBadge(u.role)
                        : `<select onchange="window.changeUserRole('${u.id}', this.value, '${u.role}')" ${roleSelectDisabled} style="padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; font-size:13px;">
                                <option value="user" ${u.role==='user'?'selected':''}>Nutzer</option>
                                <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                                <option value="admin_readonly" ${u.role==='admin_readonly'?'selected':''}>Read-only</option>
                           </select>`}
                </td>
                <td style="padding:10px 12px; text-align:right;">${u.boats_count || 0}</td>
                <td style="padding:10px 12px; text-align:right;">${u.orders_count || 0}</td>
                <td style="padding:10px 12px; color:#64748b; font-size:12px;">${fmtDate(u.last_sign_in_at)}</td>
                <td style="padding:10px 12px; color:#64748b; font-size:12px;">${fmtDate(u.created_at)}</td>
                <td style="padding:10px 12px; text-align:right;">
                    <button onclick="window.deleteUser('${u.id}', '${escapeHtml(u.email || '')}')"
                            ${deleteHidden}
                            style="padding:6px 12px; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; border-radius:6px; font-size:12px; cursor:pointer;">
                        🗑️ Löschen
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

async function changeUserRole(userId, newRole, oldRole) {
    if (newRole === oldRole) return;
    if (!confirm(`Rolle wirklich auf "${newRole}" ändern?`)) {
        await loadUsers();
        return;
    }
    try {
        const { error } = await supabaseClient.rpc('admin_set_user_role', {
            target_user_id: userId,
            new_role: newRole
        });
        if (error) throw error;
        await loadUsers();
    } catch (err) {
        alert('Fehler beim Ändern der Rolle: ' + err.message);
        await loadUsers();
    }
}
window.changeUserRole = changeUserRole;

async function deleteUser(userId, email) {
    const confirmText = `User "${email}" und ALLE zugehörigen Daten (Boote, Equipment, Bestellungen, Nachrichten, Reviews, Bilder) endgültig löschen?\n\nDieser Vorgang ist nicht rückgängig zu machen.`;
    if (!confirm(confirmText)) return;

    // Zweite Sicherheitsabfrage – tippe E-Mail
    const typed = prompt(`Zur Bestätigung bitte E-Mail-Adresse eingeben: ${email}`);
    if (typed !== email) {
        alert('E-Mail stimmt nicht überein – Löschung abgebrochen.');
        return;
    }

    try {
        const { error } = await supabaseClient.rpc('admin_delete_user', {
            target_user_id: userId
        });
        if (error) throw error;
        alert('✅ User gelöscht.');
        await loadUsers();
    } catch (err) {
        alert('Fehler beim Löschen: ' + err.message);
    }
}
window.deleteUser = deleteUser;

window.loadUsers = loadUsers;

// Automatisch laden wenn Admin-Seite oder User-Seite geöffnet wird
(function hookAdminPageNav() {
    const origNav = window.navigateToPage;
    if (!origNav) return;
    window.navigateToPage = function(page) {
        origNav.apply(this, arguments);
        if (page === 'invite-admin') loadAdminList();
        if (page === 'users') loadUsers();
    };
})();
