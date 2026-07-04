import { useState, useMemo } from 'react'
import {
  CATEGORIES, catLabel, catIcon, DEMO_PROVIDER,
  SEED_PRODUCTS, EXTERNAL_CATALOGS, SEED_EQUIPMENT,
  maintenanceStatus, MAINTENANCE_LEVELS, matchProducts, MATCH_TIERS, CURRENT_YEAR,
} from './data'

const euro = (n) => (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

// ============================================================================
export default function App() {
  const [view, setView] = useState('shop')
  const [catalog, setCatalog] = useState(SEED_PRODUCTS)
  const [cart, setCart] = useState([])           // [{ product, qty }]
  const [toast, setToast] = useState(null)

  const notify = (text) => { setToast(text); setTimeout(() => setToast(null), 2200) }

  const addToCart = (product) => {
    setCart(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      if (ex) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { product, qty: 1 }]
    })
    notify(product.name + ' in den Warenkorb gelegt')
  }
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  const importFromShop = (platform, count) => {
    const source = EXTERNAL_CATALOGS[platform]
    const toAdd = source.slice(0, count).map(p => ({ ...p, id: p.id + '-' + Date.now() }))
    setCatalog(prev => [...prev, ...toAdd])
    return toAdd
  }

  return (
    <div className="app">
      <SimBanner />
      <Header view={view} setView={setView} cartCount={cartCount} />

      <main className="content">
        {view === 'shop'      && <ShopView catalog={catalog} addToCart={addToCart} cart={cart} setCart={setCart} notify={notify} />}
        {view === 'equipment' && <EquipmentView catalog={catalog} addToCart={addToCart} />}
        {view === 'provider'  && <ProviderView catalog={catalog} setCatalog={setCatalog} importFromShop={importFromShop} notify={notify} />}
      </main>

      {toast && <div className="toast">{toast}</div>}
      <footer className="foot">
        Skipily Provider-Sandbox · reine Simulation · keine Verbindung zur Produktiv-Datenbank ·
        Stand {CURRENT_YEAR}
      </footer>
    </div>
  )
}

// ── Simulations-Banner ──────────────────────────────────────────────────────
function SimBanner() {
  return (
    <div className="sim-banner">
      🧪 <strong>TESTUMGEBUNG (Sandbox)</strong> — alle Daten sind simuliert. Änderungen sind
      folgenlos und komplett getrennt von der echten Skipily-Umgebung.
    </div>
  )
}

// ── Header + Tabs ───────────────────────────────────────────────────────────
function Header({ view, setView, cartCount }) {
  const tabs = [
    ['shop', '🛍️ Shop (App-Ansicht)'],
    ['equipment', '🧰 Ausrüstung & Matching'],
    ['provider', '🏢 Provider-Funktionen'],
  ]
  return (
    <header className="header">
      <div className="brand">
        <BoatMark />
        <div>
          <div className="brand-word">SKIPILY</div>
          <div className="brand-sub">Provider-Sandbox</div>
        </div>
      </div>
      <nav className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={'tab' + (view === k ? ' active' : '')} onClick={() => setView(k)}>
            {label}{k === 'shop' && cartCount > 0 ? ` (${cartCount})` : ''}
          </button>
        ))}
      </nav>
    </header>
  )
}

function BoatMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 80 80" aria-hidden>
      <rect width="80" height="80" rx="20" fill="#1870c0" />
      <rect y="58" width="80" height="22" fill="#f56200" />
      <polygon points="11,48 40,22 69,48 63,57 17,57" fill="#6dd4ff" />
      <line x1="40" y1="22" x2="40" y2="7" stroke="#fff" strokeWidth="2.4" />
      <polygon points="40,7 40,26 63,40" fill="#ff8b20" />
      <polygon points="40,14 40,26 20,38" fill="#ffffff" />
    </svg>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// SHOP (Web-App-Ansicht der App)
// ════════════════════════════════════════════════════════════════════════════
function ShopView({ catalog, addToCart, cart, setCart, notify }) {
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [showCart, setShowCart] = useState(false)

  const filtered = catalog.filter(p =>
    (cat === 'all' || p.category === cat) &&
    (!q || (p.name + p.manufacturer + p.model).toLowerCase().includes(q.toLowerCase()))
  )

  return (
    <div className="shop">
      <div className="row-between">
        <h1>Bootsservice & Produkte</h1>
        <button className="btn-secondary" onClick={() => setShowCart(true)}>
          🛒 Warenkorb ({cart.reduce((s, i) => s + i.qty, 0)})
        </button>
      </div>

      <input className="search" placeholder="Suche nach Produkt, Hersteller, Modell…" value={q} onChange={e => setQ(e.target.value)} />

      <div className="chips">
        <button className={'chip' + (cat === 'all' ? ' active' : '')} onClick={() => setCat('all')}>Alle</button>
        {CATEGORIES.map(c => (
          <button key={c.key} className={'chip' + (cat === c.key ? ' active' : '')} onClick={() => setCat(c.key)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <div className="grid">
        {filtered.map(p => <ProductCard key={p.id} p={p} onAdd={() => addToCart(p)} />)}
        {filtered.length === 0 && <p className="muted">Keine Produkte in dieser Kategorie.</p>}
      </div>

      {showCart && <CartDrawer cart={cart} setCart={setCart} onClose={() => setShowCart(false)} notify={notify} />}
    </div>
  )
}

function SourceBadge({ source }) {
  if (source === 'shopify')     return <span className="src src-shopify">Shopify</span>
  if (source === 'woocommerce') return <span className="src src-woo">WooCommerce</span>
  return <span className="src src-manual">Manuell</span>
}

function ProductCard({ p, onAdd }) {
  return (
    <div className="card product">
      <div className="product-emoji">{p.emoji || catIcon(p.category)}</div>
      <div className="product-body">
        <div className="product-cat">{catIcon(p.category)} {catLabel(p.category)}</div>
        <div className="product-name">{p.name}</div>
        {(p.manufacturer || p.partNumber) && (
          <div className="product-meta">
            {p.manufacturer} {p.model && '· ' + p.model} {p.partNumber && ' · Art. ' + p.partNumber}
          </div>
        )}
        <div className="product-foot">
          <div>
            <div className="price">{euro(p.price)}</div>
            <div className="ship">{p.shippingCost === 0 ? 'Kostenloser Versand' : 'zzgl. ' + euro(p.shippingCost) + ' Versand'}</div>
          </div>
          <button className="btn-primary sm" onClick={onAdd}>In den Korb</button>
        </div>
        <SourceBadge source={p.source} />
      </div>
    </div>
  )
}

function CartDrawer({ cart, setCart, onClose, notify }) {
  const [done, setDone] = useState(false)
  // Gruppierung nach Provider (hier ein Demo-Provider) → Versand = höchste Produkt-Versandkosten
  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0)
  const shipping = cart.length ? Math.max(...cart.map(i => i.product.shippingCost || 0)) : 0
  const total = subtotal + shipping
  const setQty = (id, d) => setCart(prev => prev
    .map(i => i.product.id === id ? { ...i, qty: Math.max(0, i.qty + d) } : i)
    .filter(i => i.qty > 0))

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="row-between">
          <h2>Warenkorb</h2>
          <button className="x" onClick={onClose}>✕</button>
        </div>
        {done ? (
          <div className="checkout-done">
            ✅ <strong>Bestellung simuliert!</strong>
            <p className="muted">In der echten App würde jetzt die Zahlung (Stripe) starten und die Bestellung
              beim Provider landen. Hier ist alles folgenlos.</p>
            <button className="btn-secondary" onClick={onClose}>Schließen</button>
          </div>
        ) : cart.length === 0 ? (
          <p className="muted">Der Warenkorb ist leer.</p>
        ) : (
          <>
            {cart.map(i => (
              <div key={i.product.id} className="cart-line">
                <span>{i.product.emoji}</span>
                <div className="cart-line-name">{i.product.name}<div className="muted sm">{euro(i.product.price)}</div></div>
                <div className="qty">
                  <button onClick={() => setQty(i.product.id, -1)}>−</button>
                  <span>{i.qty}</span>
                  <button onClick={() => setQty(i.product.id, +1)}>＋</button>
                </div>
              </div>
            ))}
            <div className="cart-sum">
              <div className="row-between"><span>Zwischensumme</span><span>{euro(subtotal)}</span></div>
              <div className="row-between"><span>Versand {shipping === 0 && '(frei)'}</span><span>{euro(shipping)}</span></div>
              <div className="row-between total"><strong>Gesamt</strong><strong>{euro(total)}</strong></div>
              <p className="muted sm">Hinweis: Versand = höchste Produkt-Versandkosten (aktuelle Skipily-Logik).</p>
            </div>
            <button className="btn-primary" onClick={() => { setDone(true); notify('Bestellung simuliert') }}>
              Bestellung simulieren
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// AUSRÜSTUNG + Wartungsstufen + Equipment→Produkt-Matching
// ════════════════════════════════════════════════════════════════════════════
function EquipmentView({ catalog, addToCart }) {
  const [selected, setSelected] = useState(SEED_EQUIPMENT[0])
  const matches = useMemo(() => matchProducts(selected, catalog), [selected, catalog])
  const grouped = {
    original: matches.filter(m => m.tier === 'original'),
    derivate: matches.filter(m => m.tier === 'derivate'),
    related:  matches.filter(m => m.tier === 'related'),
  }

  return (
    <div className="equip">
      <h1>Ausrüstung des Boots</h1>
      <p className="muted">Wähle ein Bauteil — Skipily sucht in den Produkten der Provider passende Teile.
        Je genauer die Ausrüstung erfasst ist, desto besser das Matching.</p>

      <div className="legend">
        {MAINTENANCE_LEVELS.map(l => (
          <span key={l.key} className="legend-item"><i style={{ background: l.color }} /> {l.label}</span>
        ))}
      </div>

      <div className="equip-layout">
        <div className="equip-list">
          {SEED_EQUIPMENT.map(item => {
            const st = maintenanceStatus(item)
            return (
              <button key={item.id}
                className={'equip-item' + (selected.id === item.id ? ' active' : '')}
                onClick={() => setSelected(item)}>
                <span className="dot" style={{ background: st.color }} />
                <div className="equip-item-body">
                  <div className="equip-name">{catIcon(item.category)} {item.name}</div>
                  <div className="muted sm">{item.manufacturer} {item.model && '· ' + item.model}</div>
                </div>
                <span className="equip-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
              </button>
            )
          })}
        </div>

        <div className="equip-detail">
          <div className="card">
            <h2>{catIcon(selected.category)} {selected.name}</h2>
            <MaintenancePanel item={selected} />
          </div>

          <h3 className="match-h">Passende Produkte aus der Suche</h3>
          {['original', 'derivate', 'related'].map(tier => {
            const t = MATCH_TIERS[tier]
            const list = grouped[tier]
            if (!list.length) return null
            return (
              <div key={tier} className="match-group">
                <div className="match-title" style={{ color: t.color }}>
                  {t.badge} {t.label} <span className="muted sm">— {t.hint}</span>
                </div>
                {list.map(m => (
                  <div key={m.product.id} className="match-row">
                    <span>{m.product.emoji}</span>
                    <div className="match-row-body">
                      <div>{m.product.name}</div>
                      <div className="muted sm">{m.reason} · Score {m.score} · {euro(m.product.price)}</div>
                    </div>
                    <SourceBadge source={m.product.source} />
                    <button className="btn-primary sm" onClick={() => addToCart(m.product)}>Korb</button>
                  </div>
                ))}
              </div>
            )
          })}
          {matches.length === 0 && <p className="muted">Keine passenden Produkte im Katalog — importiere welche über die Provider-Funktionen.</p>}
        </div>
      </div>
    </div>
  )
}

function MaintenancePanel({ item }) {
  const st = maintenanceStatus(item)
  const rows = [
    ['Kategorie', catLabel(item.category)],
    ['Hersteller / Modell', `${item.manufacturer || '—'} ${item.model ? '· ' + item.model : ''}`],
    ['Artikelnummer', item.partNumber || '—'],
    ['Eingebaut', item.installedYear],
    ['Letzter Service', item.lastServiceYear || '—'],
    ['Wartungsintervall', item.maintenanceCycleYears + ' Jahr(e)'],
    ['Erwartete Lebensdauer', item.expectedLifespanYears + ' Jahre'],
  ]
  return (
    <div>
      <div className="maint-status" style={{ background: st.color + '22', color: st.color, borderColor: st.color }}>
        Wartungsstufe: <strong>{st.label}</strong>
        {st.key === 'overdue' && ` · seit ${st.yearsSince} J. kein Service (Intervall ${item.maintenanceCycleYears} J.)`}
        {st.key === 'due' && ` · in ~${Math.max(0, st.dueIn)} J. fällig`}
        {st.key === 'ok' && ` · nächster Service in ~${st.dueIn} J.`}
      </div>
      <table className="kv">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// PROVIDER-FUNKTIONEN (Portal) — Produkte, Sendcloud, Shop-Import
// ════════════════════════════════════════════════════════════════════════════
function ProviderView({ catalog, setCatalog, importFromShop, notify }) {
  return (
    <div className="provider">
      <h1>Provider-Funktionen</h1>
      <p className="muted">Simulierte Portal-Funktionen des Providers „{DEMO_PROVIDER.name}".</p>

      <ShopImportCard importFromShop={importFromShop} notify={notify} />
      <SendcloudCard notify={notify} />
      <ProductAdminCard catalog={catalog} setCatalog={setCatalog} notify={notify} />
    </div>
  )
}

// —— Shopify / WooCommerce Import (Simulation) ——
function ShopImportCard({ importFromShop, notify }) {
  const [platform, setPlatform] = useState('shopify')
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const available = EXTERNAL_CATALOGS[platform].length

  const runImport = () => {
    if (!url.trim() || !key.trim()) { notify('Bitte Shop-URL und API-Key eingeben (beliebig — Simulation).'); return }
    setBusy(true); setLog([])
    const steps = [
      `Verbinde mit ${platform === 'shopify' ? 'Shopify' : 'WooCommerce'} (${url}) …`,
      'Authentifizierung mit API-Key … OK',
      `Lese Produktkatalog … ${available} Produkte gefunden`,
      'Ordne Kategorien zu & übersetze Titel …',
      'Importiere Produkte in den Skipily-Katalog …',
    ]
    steps.forEach((s, i) => setTimeout(() => setLog(l => [...l, s]), 350 * (i + 1)))
    setTimeout(() => {
      const added = importFromShop(platform, available)
      setLog(l => [...l, `✅ Fertig: ${added.length} Produkte importiert und im Shop sichtbar.`])
      setBusy(false)
      notify(`${added.length} Produkte aus ${platform} importiert`)
    }, 350 * (steps.length + 1))
  }

  return (
    <div className="card accent-blue">
      <h2>🔌 Shopify / WooCommerce-Anbindung (Simulation)</h2>
      <p className="muted sm">Verbinde den bestehenden Shop des Providers per API. Hier simuliert: beliebige
        Werte eingeben — es werden Beispielprodukte importiert und erscheinen sofort im Shop und in der Ausrüstungssuche.</p>

      <div className="seg">
        {['shopify', 'woocommerce'].map(p => (
          <button key={p} className={'seg-btn' + (platform === p ? ' active' : '')} onClick={() => setPlatform(p)}>
            {p === 'shopify' ? 'Shopify' : 'WooCommerce'}
          </button>
        ))}
      </div>

      <div className="form-row">
        <label>Shop-URL
          <input value={url} onChange={e => setUrl(e.target.value)}
                 placeholder={platform === 'shopify' ? 'mein-shop.myshopify.com' : 'https://mein-shop.de'} />
        </label>
        <label>API-Key / Access-Token
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="beliebig (Simulation)" />
        </label>
      </div>
      <button className="btn-primary" onClick={runImport} disabled={busy}>
        {busy ? 'Import läuft…' : `Aus ${platform === 'shopify' ? 'Shopify' : 'WooCommerce'} importieren`}
      </button>

      {log.length > 0 && (
        <pre className="import-log">{log.map((l, i) => <div key={i}>{l}</div>)}</pre>
      )}
    </div>
  )
}

// —— Sendcloud (Simulation) ——
function SendcloudCard({ notify }) {
  const [connected, setConnected] = useState(false)
  const [pub, setPub] = useState('')
  const [sec, setSec] = useState('')
  const [busy, setBusy] = useState(false)
  const connect = () => {
    if (!pub.trim() || !sec.trim()) { notify('Bitte Public & Secret Key eingeben (Simulation).'); return }
    setBusy(true)
    setTimeout(() => { setBusy(false); setConnected(true); notify('Sendcloud verbunden (Simulation)') }, 700)
  }
  return (
    <div className="card accent-green">
      <h2>🚚 Sendcloud-Versand (Simulation)</h2>
      {connected ? (
        <div className="ok-box">
          ✅ Verbunden als <strong>Nordwind Marine (Demo-Konto)</strong>
          <button className="btn-secondary sm" onClick={() => setConnected(false)}>Trennen</button>
        </div>
      ) : (
        <>
          <p className="muted sm">Public/Secret Key aus dem Sendcloud-Konto eingeben (hier beliebig).</p>
          <div className="form-row">
            <label>Public Key<input value={pub} onChange={e => setPub(e.target.value)} placeholder="12ab34cd-…" /></label>
            <label>Secret Key<input value={sec} onChange={e => setSec(e.target.value)} type="password" placeholder="Secret…" /></label>
          </div>
          <button className="btn-primary" onClick={connect} disabled={busy}>{busy ? 'Verbinde…' : 'Mit Sendcloud verbinden'}</button>
        </>
      )}
    </div>
  )
}

// —— Produkt-Verwaltung ——
function ProductAdminCard({ catalog, setCatalog, notify }) {
  const [name, setName] = useState('')
  const [cat, setCat] = useState('marine_supplies')
  const [price, setPrice] = useState('')
  const add = () => {
    if (!name.trim() || !price) { notify('Name und Preis angeben.'); return }
    setCatalog(prev => [...prev, {
      id: 'new-' + Date.now(), name: name.trim(), category: cat, price: parseFloat(price),
      shippingCost: 5.9, weightKg: 1, stock: 10, emoji: catIcon(cat), source: 'manual',
      manufacturer: '', model: '', partNumber: '', tags: [],
    }])
    setName(''); setPrice(''); notify('Produkt hinzugefügt')
  }
  const bySource = catalog.reduce((m, p) => { m[p.source] = (m[p.source] || 0) + 1; return m }, {})
  return (
    <div className="card">
      <h2>📦 Produkte ({catalog.length})</h2>
      <p className="muted sm">
        Manuell: {bySource.manual || 0} · Shopify: {bySource.shopify || 0} · WooCommerce: {bySource.woocommerce || 0}
      </p>
      <div className="form-row">
        <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Produktname" /></label>
        <label>Kategorie
          <select value={cat} onChange={e => setCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
          </select>
        </label>
        <label>Preis €<input value={price} onChange={e => setPrice(e.target.value)} type="number" step="0.01" placeholder="0,00" /></label>
      </div>
      <button className="btn-primary" onClick={add}>Produkt hinzufügen</button>
    </div>
  )
}
