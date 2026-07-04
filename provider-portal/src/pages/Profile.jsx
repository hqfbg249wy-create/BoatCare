import { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useFeatureAccess } from '../hooks/useFeatureAccess'
import FeatureLock from '../components/FeatureLock'
import { supabase } from '../lib/supabase'
import { Save, Loader, CreditCard, ExternalLink, CheckCircle, AlertCircle, Clock, Key, Copy, RefreshCw, Globe, Image as ImageIcon, Upload, Trash2, Tag, Wrench, Plus, X, Eye, Lock, Truck, ShieldCheck, RotateCcw, FileText } from 'lucide-react'
import { useT } from '../i18n'

// Storage bucket created by database/038_provider_images_bucket.sql
const PROVIDER_IMAGES_BUCKET = 'provider-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB (matches bucket limit)

const CATEGORY_OPTIONS = [
  ['repair', '🔧', 'cat.repair'],
  ['motor_service', '⚙️', 'cat.motorService'],
  ['segelmacher', '⛵', 'cat.sailmaker'],
  ['marine_supplies', '🛒', 'cat.marineSupplies'],
  ['elektronik', '📡', 'cat.electronics'],
  ['werft', '🚢', 'cat.shipyard'],
  ['winterlager', '❄️', 'cat.winterStorage'],
  ['lackiererei', '🎨', 'cat.paintShop'],
  ['gutachter', '📋', 'cat.surveyor'],
  ['tankstelle', '⛽', 'cat.fuelStation'],
  ['marina', '🌊', 'cat.marina'],
]

// EPR-/Verpackungsregister je Land — rein informativ (siehe Disclaimer im UI).
// Register/Ansprechpartner für die Verpackungs-EPR; ohne Gewähr.
const EPR_REGISTERS = {
  DE: { name: 'LUCID – Verpackungsregister (ZSVR)', url: 'https://www.verpackungsregister.org' },
  AT: { name: 'EDM – Elektronisches Datenmanagement', url: 'https://www.edm.gv.at' },
  FR: { name: 'ADEME – SYDEREP (identifiant unique)', url: 'https://syderep.ademe.fr' },
  IT: { name: 'CONAI', url: 'https://www.conai.org' },
  ES: { name: 'MITECO – Registro de Productores', url: 'https://sede.miteco.gob.es' },
  NL: { name: 'Afvalfonds Verpakkingen', url: 'https://www.afvalfondsverpakkingen.nl' },
  BE: { name: 'Fost Plus', url: 'https://www.fostplus.be' },
  LU: { name: 'Valorlux', url: 'https://www.valorlux.lu' },
  PT: { name: 'Sociedade Ponto Verde', url: 'https://www.pontoverde.pt' },
  PL: { name: 'BDO – Baza danych o odpadach', url: 'https://bdo.mos.gov.pl' },
  SE: { name: 'Naturvårdsverket', url: 'https://www.naturvardsverket.se' },
  DK: { name: 'Dansk Producentansvar (DPA)', url: 'https://www.dpa-system.dk' },
  FI: { name: 'Rinki – tuottajarekisteri', url: 'https://rinkiin.fi' },
  IE: { name: 'Repak', url: 'https://www.repak.ie' },
  CZ: { name: 'EKO-KOM', url: 'https://www.ekokom.cz' },
  SK: { name: 'ENVI-PAK', url: 'https://www.envipak.sk' },
  HU: { name: 'MOHU', url: 'https://mohu.hu' },
  RO: { name: 'Administrația Fondului pentru Mediu', url: 'https://www.afm.ro' },
  GR: { name: 'HERRCO / EOAN', url: 'https://www.herrco.gr' },
  HR: { name: 'FZOEU', url: 'https://www.fzoeu.hr' },
  SI: { name: 'Slopak', url: 'https://www.slopak.si' },
  BG: { name: 'Ecopack Bulgaria', url: 'https://www.ecopack.bg' },
  EE: { name: 'ETO – Pakendiregister', url: 'https://www.eto.ee' },
  LV: { name: 'Latvijas Zaļais punkts', url: 'https://www.zalais.lv' },
  LT: { name: 'GPAIS – Žaliasis taškas', url: 'https://www.gpais.eu' },
  CY: { name: 'Green Dot Cyprus', url: 'https://www.greendot.com.cy' },
  MT: { name: 'GreenPak Malta', url: 'https://www.greenpak.com.mt' },
  NO: { name: 'Grønt Punkt Norge', url: 'https://www.grontpunkt.no' },
  IS: { name: 'Úrvinnslusjóður', url: 'https://www.urvinnslusjodur.is' },
  LI: { name: 'Amt für Umwelt (LI)', url: 'https://www.llv.li' },
  CH: { name: 'Schweiz – keine EU-EPR-Registrierung', url: 'https://www.swissrecycling.ch' },
  GB: { name: 'UK Packaging EPR (GOV.UK)', url: 'https://www.gov.uk/guidance/extended-producer-responsibility-for-packaging' },
}

export default function Profile() {
  const { provider, loadProvider, user } = useAuth()
  const access = useFeatureAccess()
  const { t, lang } = useT()
  const sendcloudGuideUrl = lang === 'de'
    ? '/anleitungen/04-Sendcloud-Versand.pdf'
    : '/anleitungen/en/04-Sendcloud-Shipping.pdf'
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  // ── Rolle des angemeldeten Users im Betrieb ──
  // 'owner' (service_providers.user_id) oder Rolle aus provider_members.
  // canAdmin = Owner/Admin → darf Profil, Team, API, Versand ändern.
  const [myRole, setMyRole] = useState('owner')
  useEffect(() => {
    if (!provider?.id || !user?.id) return
    if (provider.user_id === user.id) { setMyRole('owner'); return }
    supabase.from('provider_members').select('role').eq('provider_id', provider.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setMyRole(data?.role || 'member'))
  }, [provider?.id, provider?.user_id, user?.id])
  const canAdmin = myRole === 'owner' || myRole === 'admin'

  // Stripe Connect state
  const [stripeLoading, setStripeLoading] = useState(false)
  const [stripeStatus, setStripeStatus] = useState(null)
  const [stripeMessage, setStripeMessage] = useState(null)

  // API Key state
  const [apiKey, setApiKey] = useState(null)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [apiKeyCopied, setApiKeyCopied] = useState(false)
  const [generatingKey, setGeneratingKey] = useState(false)

  // Image upload state
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [imageMessage, setImageMessage] = useState(null)
  const logoInputRef = useRef(null)
  const coverInputRef = useRef(null)

  // Services + Brands chip editors (linked to shop products)
  const [services, setServices] = useState([])
  const [brands, setBrands] = useState([])
  const [serviceInput, setServiceInput] = useState('')
  const [brandInput, setBrandInput] = useState('')
  const [products, setProducts] = useState([])

  // Lieferländer (EU-Verpackungsverordnung / EPR-Compliance)
  // null = unkonfiguriert (Provider hat das noch nie gesetzt — Behandlung als
  // "alle" bis er bewusst auswählt). [] = aktiv keine Länder. Sonst ISO-Codes.
  const [shippingCountries, setShippingCountries] = useState(null)

  // Subscription / Professional-Upgrade
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [subscriptionMessage, setSubscriptionMessage] = useState(null)

  // ─── Lieferländer-Katalog ────────────────────────────────────────────────
  // Gruppiert nach Region, damit Provider schnell DACH, EU-27 oder ganz
  // Europa auswählen können. Codes sind ISO-3166-1 Alpha-2.
  const EU_27 = useMemo(() => [
    { code: 'AT', name: 'Österreich' }, { code: 'BE', name: 'Belgien' },
    { code: 'BG', name: 'Bulgarien' }, { code: 'CY', name: 'Zypern' },
    { code: 'CZ', name: 'Tschechien' }, { code: 'DE', name: 'Deutschland' },
    { code: 'DK', name: 'Dänemark' }, { code: 'EE', name: 'Estland' },
    { code: 'ES', name: 'Spanien' }, { code: 'FI', name: 'Finnland' },
    { code: 'FR', name: 'Frankreich' }, { code: 'GR', name: 'Griechenland' },
    { code: 'HR', name: 'Kroatien' }, { code: 'HU', name: 'Ungarn' },
    { code: 'IE', name: 'Irland' }, { code: 'IT', name: 'Italien' },
    { code: 'LT', name: 'Litauen' }, { code: 'LU', name: 'Luxemburg' },
    { code: 'LV', name: 'Lettland' }, { code: 'MT', name: 'Malta' },
    { code: 'NL', name: 'Niederlande' }, { code: 'PL', name: 'Polen' },
    { code: 'PT', name: 'Portugal' }, { code: 'RO', name: 'Rumänien' },
    { code: 'SE', name: 'Schweden' }, { code: 'SI', name: 'Slowenien' },
    { code: 'SK', name: 'Slowakei' },
  ], [])
  const EEA_PLUS = useMemo(() => [
    { code: 'NO', name: 'Norwegen' }, { code: 'IS', name: 'Island' },
    { code: 'LI', name: 'Liechtenstein' }, { code: 'CH', name: 'Schweiz' },
    { code: 'GB', name: 'Vereinigtes Königreich' },
  ], [])
  const ALL_COUNTRIES = useMemo(
    () => [...EU_27, ...EEA_PLUS].sort((a, b) =>
      t('ctry.' + a.code).localeCompare(t('ctry.' + b.code))),
    [EU_27, EEA_PLUS, t]
  )

  const currentShipping = shippingCountries ?? []

  function toggleShippingCountry(code) {
    const base = shippingCountries ?? []
    const next = base.includes(code)
      ? base.filter(c => c !== code)
      : [...base, code]
    setShippingCountries(next)
  }
  function applyShippingPreset(codes) {
    setShippingCountries([...codes])
  }
  function clearShipping() {
    setShippingCountries([])
  }

  // Team-Verwaltung (Enterprise-Feature)
  const [teamMembers, setTeamMembers] = useState([])
  const [teamInviteEmail, setTeamInviteEmail] = useState('')
  const [teamInviteRole, setTeamInviteRole] = useState('member')
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamMessage, setTeamMessage] = useState(null)

  useEffect(() => {
    if (provider) {
      setForm({
        name: provider.name || '',
        description: provider.description || '',
        category: provider.category || '',
        category2: provider.category2 || '',
        category3: provider.category3 || '',
        street: provider.street || '',
        postal_code: provider.postal_code || '',
        city: provider.city || '',
        country: provider.country || '',
        phone: provider.phone || '',
        email: provider.email || '',
        website: provider.website || '',
        opening_hours: provider.opening_hours || '',
        tax_id: provider.tax_id || '',
        shop_description: provider.shop_description || '',
        slogan: provider.slogan || '',
        epr_registration_number: provider.epr_registration_number || '',
      })
      setServices(Array.isArray(provider.services) ? provider.services : [])
      setBrands(Array.isArray(provider.brands) ? provider.brands : [])
      // Lieferländer übernehmen, null bleibt null (unkonfiguriert)
      setShippingCountries(
        Array.isArray(provider.shipping_countries) ? provider.shipping_countries : null
      )

      // Check Stripe URL params for return from onboarding / subscription
      const params = new URLSearchParams(window.location.search)
      if (params.get('stripe') === 'success') {
        setStripeMessage({ type: 'success', text: t('profile.msgStripeDone') })
        window.history.replaceState({}, '', '/profile')
        loadProvider(user.id)
      } else if (params.get('stripe') === 'refresh') {
        setStripeMessage({ type: 'info', text: t('profile.msgStripeIncomplete') })
        window.history.replaceState({}, '', '/profile')
      } else if (params.get('subscription') === 'success') {
        setSubscriptionMessage({ type: 'success', text: t('profile.msgAboDone') })
        window.history.replaceState({}, '', '/profile')
        // Aktiv mit Stripe synchronisieren — unabhängig davon ob der
        // Webhook schon angekommen ist
        syncSubscriptionFromStripe(true)
      } else if (params.get('subscription') === 'cancelled') {
        setSubscriptionMessage({ type: 'info', text: t('profile.msgAboCancelled') })
        window.history.replaceState({}, '', '/profile')
      }
    }
  }, [provider])

  // Load Stripe account status when provider has stripe_account_id
  useEffect(() => {
    if (provider?.stripe_account_id) {
      loadStripeStatus()
    }
  }, [provider?.stripe_account_id])

  // Load API key — liegt in der streng abgesicherten Tabelle provider_secrets
  // (nicht mehr in service_providers). Nur Owner/Admin dürfen lesen (RLS).
  useEffect(() => {
    if (!provider?.id) return
    setWebhookUrl(provider.webhook_url || '')
    supabase
      .from('provider_secrets')
      .select('api_key')
      .eq('provider_id', provider.id)
      .maybeSingle()
      .then(({ data }) => setApiKey(data?.api_key || null))
  }, [provider])

  // Versandregeln laden
  const [shipRule, setShipRule] = useState(null)
  const [shipMsg, setShipMsg] = useState(null)
  useEffect(() => {
    if (!provider?.id) return
    supabase.from('provider_shipping_rules').select('*').eq('provider_id', provider.id).maybeSingle()
      .then(({ data }) => {
        // Land auf ISO-2 normalisieren (in der DB steht oft "Deutschland")
        const toIso2 = (c) => {
          if (!c) return 'DE'
          const s = String(c).trim()
          if (s.length === 2) return s.toUpperCase()
          const m = { deutschland:'DE', germany:'DE', österreich:'AT', oesterreich:'AT', austria:'AT',
            schweiz:'CH', switzerland:'CH', frankreich:'FR', france:'FR', italien:'IT', italy:'IT', italia:'IT',
            spanien:'ES', spain:'ES', niederlande:'NL', netherlands:'NL', nederland:'NL', belgien:'BE', belgium:'BE' }
          return m[s.toLowerCase()] || s.substring(0,2).toUpperCase()
        }
        setShipRule(data || {
          provider_id: provider.id, enabled: false, domestic_country: toIso2(provider.country),
          free_threshold_domestic: 85, free_threshold_eu: null,
          rate_domestic_base: 5.90, rate_domestic_per_kg: 0,
          rate_eu_base: 14.90, rate_eu_per_kg: 1.50,
          rate_world_base: 29.90, rate_world_per_kg: 3.00,
          max_shipping: null, default_item_weight: 0.50,
        })
      })
  }, [provider?.id])

  async function saveShippingRule() {
    setShipMsg(null)
    try {
      const payload = { ...shipRule, provider_id: provider.id, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('provider_shipping_rules').upsert(payload, { onConflict: 'provider_id' })
      if (error) throw error
      setShipMsg({ type: 'success', text: t('profile.msgShippingSaved') })
    } catch (err) {
      setShipMsg({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    }
  }
  const setShip = (k, v) => setShipRule(r => ({ ...r, [k]: v }))

  // ─── Sendcloud-Versandintegration ────────────────────────────────────────
  // Der Client liest NUR den Status (kein secret_key — durch Spalten-GRANTs in
  // Migration 099 abgesichert). Verbinden/Trennen läuft über die Edge Function.
  const [sc, setSc] = useState(null)          // Zeile aus provider_sendcloud
  const [scPublic, setScPublic] = useState('')
  const [scSecret, setScSecret] = useState('')
  const [scBusy, setScBusy] = useState(false)
  const [scMsg, setScMsg] = useState(null)

  useEffect(() => {
    if (!provider?.id) return
    supabase
      .from('provider_sendcloud')
      .select('status, account_name, account_email, connected_at, last_checked_at')
      .eq('provider_id', provider.id)
      .maybeSingle()
      .then(({ data }) => setSc(data || null))
  }, [provider?.id])

  const scConnected = sc?.status === 'connected'

  async function callSendcloud(payload) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Nicht angemeldet')
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
    const res = await fetch(`${supabaseUrl}/functions/v1/sendcloud-connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify({ provider_id: provider.id, ...payload }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  function reloadSendcloud() {
    return supabase
      .from('provider_sendcloud')
      .select('status, account_name, account_email, connected_at, last_checked_at')
      .eq('provider_id', provider.id)
      .maybeSingle()
      .then(({ data }) => setSc(data || null))
  }

  async function connectSendcloud() {
    setScMsg(null)
    if (!scPublic.trim() || !scSecret.trim()) {
      setScMsg({ type: 'error', text: t('sc.msgEnterKeys') })
      return
    }
    setScBusy(true)
    try {
      const { ok, data } = await callSendcloud({
        action: 'connect',
        public_key: scPublic.trim(),
        secret_key: scSecret.trim(),
      })
      if (!ok) {
        const map = { invalid_keys: 'sc.msgInvalidKeys', missing_keys: 'sc.msgEnterKeys', api_error: 'sc.msgApiError' }
        throw new Error(t(map[data.error] || 'sc.msgApiError'))
      }
      setScPublic(''); setScSecret('')
      await reloadSendcloud()
      setScMsg({ type: 'success', text: t('sc.msgConnected') })
    } catch (err) {
      setScMsg({ type: 'error', text: err.message })
    } finally {
      setScBusy(false)
    }
  }

  async function disconnectSendcloud() {
    if (!confirm(t('sc.disconnectConfirm'))) return
    setScMsg(null); setScBusy(true)
    try {
      const { ok, data } = await callSendcloud({ action: 'disconnect' })
      if (!ok) throw new Error(data.error || 'Fehler')
      await reloadSendcloud()
      setScMsg({ type: 'success', text: t('sc.msgDisconnected') })
    } catch (err) {
      setScMsg({ type: 'error', text: err.message })
    } finally {
      setScBusy(false)
    }
  }

  async function testSendcloud() {
    setScMsg(null); setScBusy(true)
    try {
      const { ok, data } = await callSendcloud({ action: 'test' })
      await reloadSendcloud()
      if (ok && data.status === 'connected') {
        setScMsg({ type: 'success', text: t('sc.msgTestedOk') })
      } else {
        setScMsg({ type: 'error', text: t('sc.msgInvalidKeys') })
      }
    } catch (err) {
      setScMsg({ type: 'error', text: err.message })
    } finally {
      setScBusy(false)
    }
  }

  // Load shop products (used for auto-suggesting brands/services + linking chips)
  useEffect(() => {
    if (!provider?.id) return
    supabase
      .from('products')
      .select('id, name, manufacturer, tags')
      .eq('provider_id', provider.id)
      .eq('is_active', true)
      .then(({ data }) => setProducts(data || []))
      .catch(() => setProducts([]))
  }, [provider?.id])

  // Auto-suggest brands from product manufacturers that aren't yet on the brand list
  const suggestedBrands = useMemo(() => {
    const fromProducts = new Set(
      products.map(p => (p.manufacturer || '').trim()).filter(Boolean)
    )
    const lowerBrands = new Set(brands.map(b => b.toLowerCase()))
    return [...fromProducts].filter(b => !lowerBrands.has(b.toLowerCase())).slice(0, 12)
  }, [products, brands])

  // Auto-suggest services from product tags
  const suggestedServices = useMemo(() => {
    const fromTags = new Set()
    products.forEach(p => (p.tags || []).forEach(t => t && fromTags.add(t.trim())))
    const lowerServices = new Set(services.map(s => s.toLowerCase()))
    return [...fromTags].filter(s => !lowerServices.has(s.toLowerCase())).slice(0, 12)
  }, [products, services])

  // Count how many shop products match a given brand/service (text match on name/manufacturer/tags)
  function productMatchCount(term) {
    if (!term) return 0
    const t = term.toLowerCase()
    return products.filter(p =>
      (p.manufacturer || '').toLowerCase().includes(t)
      || (p.name || '').toLowerCase().includes(t)
      || (p.tags || []).some(tag => (tag || '').toLowerCase().includes(t))
    ).length
  }

  function addService(s) {
    const v = (s || '').trim()
    if (!v || services.some(x => x.toLowerCase() === v.toLowerCase())) return
    setServices([...services, v])
  }
  function removeService(s) {
    setServices(services.filter(x => x !== s))
  }
  function addBrand(b) {
    const v = (b || '').trim()
    if (!v || brands.some(x => x.toLowerCase() === v.toLowerCase())) return
    setBrands([...brands, v])
  }
  function removeBrand(b) {
    setBrands(brands.filter(x => x !== b))
  }

  async function loadStripeStatus() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-connect-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })

      if (res.ok) {
        const data = await res.json()
        setStripeStatus({
          charges_enabled: data.charges_enabled,
          payouts_enabled: data.payouts_enabled,
          details_submitted: data.details_submitted,
        })
      }
    } catch (err) {
      console.error('Stripe status error:', err)
    }
  }

  async function startStripeOnboarding() {
    setStripeLoading(true)
    setStripeMessage(null)

    try {
      // Skipily haftet Stripe-seitig für Disputes — bevor wir einen Connect-
      // Account anlegen, muss der Provider die Nutzungsbedingungen akzeptiert
      // haben. Sonst sitzt Skipily auf Provider-Verschulden-Schäden.
      if (!provider?.agb_accepted_at) {
        setStripeMessage({
          type: 'error',
          text: t('profile.msgAcceptTermsFirst')
        })
        setStripeLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-connect-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Stripe-Fehler')
      }

      const data = await res.json()

      if (data.onboarding_url) {
        window.location.href = data.onboarding_url
      } else {
        throw new Error('Keine Onboarding-URL erhalten')
      }
    } catch (err) {
      setStripeMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setStripeLoading(false)
    }
  }

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // ─── Skipily-Abo: vier wählbare Pläne ────────────────────────────────────
  const SUBSCRIPTION_PLANS = [
    { code: 'pro_monthly',  tier: 'Pro',        period: 'Monatlich', price: 79,   per: 'Monat',
      price_id: 'price_1TWIBKAKSxHR03mTLBHJkIvb' },
    { code: 'pro_yearly',   tier: 'Pro',        period: 'Jährlich',  price: 789,  per: 'Jahr',
      price_id: 'price_1TWI7bAKSxHR03mTLIBshinq',  savings: 'Spare 17 %' },
    { code: 'ent_monthly',  tier: 'Enterprise', period: 'Monatlich', price: 199,  per: 'Monat',
      price_id: 'price_1TWIDLAKSxHR03mT7o48URgq' },
    { code: 'ent_yearly',   tier: 'Enterprise', period: 'Jährlich',  price: 1999, per: 'Jahr',
      price_id: 'price_1TWIE6AKSxHR03mT2gFOvwdw', savings: 'Spare 17 %' },
  ]

  async function startSubscriptionCheckout(priceId) {
    setSubscriptionLoading(true)
    setSubscriptionMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-subscription-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id, price_id: priceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout-Fehler')
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Keine Checkout-URL erhalten')
      }
    } catch (err) {
      setSubscriptionMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setSubscriptionLoading(false)
    }
  }

  async function syncSubscriptionFromStripe(showSuccess = false) {
    if (!provider?.id) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-subscription-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync fehlgeschlagen')

      // Provider-State neu laden, damit das UI den neuen Tier zeigt
      await loadProvider(user.id)

      if (showSuccess && data.status === 'synced') {
        const planLabel = ({
          pro_monthly:  'Pro · Monatlich',
          pro_yearly:   'Pro · Jährlich',
          ent_monthly:  'Enterprise · Monatlich',
          ent_yearly:   'Enterprise · Jährlich',
        })[data.plan] || data.tier
        setSubscriptionMessage({
          type: 'success',
          text: `Abo aktiv: ${planLabel}.`,
        })
      } else if (showSuccess && data.status === 'no_subscription') {
        setSubscriptionMessage({ type: 'info', text: t('profile.msgNoActiveAbo') })
      }
    } catch (err) {
      console.warn('Subscription-Sync:', err)
      if (showSuccess) setSubscriptionMessage({ type: 'error', text: t('profile.msgSyncFailed') + ' ' + err.message })
    }
  }

  // ─── Team-Verwaltung ─────────────────────────────────────────────────────
  async function loadTeamMembers() {
    if (!provider?.id) return
    setTeamLoading(true)
    try {
      const { data, error } = await supabase
        .from('provider_members')
        .select('email, role, invited_at, accepted_at, user_id')
        .eq('provider_id', provider.id)
        .order('invited_at', { ascending: true })
      if (error) throw error
      setTeamMembers(data || [])
    } catch (err) {
      console.warn('Team laden:', err)
    } finally {
      setTeamLoading(false)
    }
  }

  async function inviteTeamMember() {
    const email = teamInviteEmail.trim().toLowerCase()
    if (!email) {
      setTeamMessage({ type: 'error', text: t('profile.msgEnterEmail') })
      return
    }
    setTeamLoading(true)
    setTeamMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/invite-provider-member`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          provider_id: provider.id,
          email,
          role: teamInviteRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Einladung fehlgeschlagen')
      setTeamMessage({ type: 'success', text: data.message || 'Einladung gesendet.' })
      setTeamInviteEmail('')
      await loadTeamMembers()
    } catch (err) {
      setTeamMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setTeamLoading(false)
    }
  }

  async function removeTeamMember(email) {
    if (!confirm(t('team.confirmRemove', { email }))) return
    try {
      const { error } = await supabase
        .from('provider_members')
        .delete()
        .eq('provider_id', provider.id)
        .eq('email', email)
      if (error) throw error
      await loadTeamMembers()
    } catch (err) {
      setTeamMessage({ type: 'error', text: t('profile.msgRemoveFailed') + ' ' + err.message })
    }
  }

  async function changeTeamRole(email, newRole) {
    const member = teamMembers.find(m => m.email === email)
    if (!member || member.role === newRole) return
    try {
      const { error } = await supabase
        .from('provider_members')
        .update({ role: newRole })
        .eq('provider_id', provider.id)
        .eq('email', email)
      if (error) throw error
      setTeamMessage({ type: 'success', text: t('team.roleChanged', { email, role: newRole === 'admin' ? t('team.admin') : t('team.member') }) })
      await loadTeamMembers()
    } catch (err) {
      setTeamMessage({ type: 'error', text: t('profile.msgChangeFailed') + ' ' + err.message })
    }
  }

  // Team beim Provider-Load nachziehen, wenn Enterprise-Tier aktiv ist
  useEffect(() => {
    if (provider?.id && access.isEnterprise) loadTeamMembers()
  }, [provider?.id, access.isEnterprise])

  async function openBillingPortal() {
    setSubscriptionLoading(true)
    setSubscriptionMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Nicht angemeldet')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://vcjwlyqkfkszumdrfvtm.supabase.co'
      const res = await fetch(`${supabaseUrl}/functions/v1/create-billing-portal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ provider_id: provider.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Billing-Portal nicht erreichbar')
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error('Keine Portal-URL erhalten')
      }
    } catch (err) {
      setSubscriptionMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setSubscriptionLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('service_providers')
        .update({
          name: form.name,
          description: form.description,
          category:  form.category || null,
          category2: form.category2 || null,
          category3: form.category3 || null,
          street: form.street,
          postal_code: form.postal_code,
          city: form.city,
          country: form.country,
          phone: form.phone,
          email: form.email,
          website: form.website,
          opening_hours: form.opening_hours,
          tax_id: form.tax_id,
          shop_description: form.shop_description,
          slogan: form.slogan,
          epr_registration_number: form.epr_registration_number || null,
          services,
          brands,
          // null = unkonfiguriert (kein expliziter Save); [] und Arrays werden
          // 1:1 übernommen.
          shipping_countries: shippingCountries,
        })
        .eq('id', provider.id)

      if (error) throw error
      setMessage({ type: 'success', text: t('profile.msgSaved') })
      loadProvider(user.id)
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setSaving(false)
    }
  }

  async function generateApiKey() {
    setGeneratingKey(true)
    try {
      // Generate a random API key
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
      const keyParts = []
      for (let i = 0; i < 4; i++) {
        let part = ''
        for (let j = 0; j < 8; j++) {
          part += chars.charAt(Math.floor(Math.random() * chars.length))
        }
        keyParts.push(part)
      }
      const newKey = `bc_${keyParts.join('_')}`

      // API-Key in provider_secrets schreiben (streng RLS-geschützt).
      const { error } = await supabase
        .from('provider_secrets')
        .upsert({ provider_id: provider.id, api_key: newKey }, { onConflict: 'provider_id' })

      if (error) throw error
      setApiKey(newKey)
      setApiKeyVisible(true)
      setMessage({ type: 'success', text: t('profile.msgApiKeyGenerated') })
      loadProvider(user.id)
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    } finally {
      setGeneratingKey(false)
    }
  }

  async function saveWebhookUrl() {
    try {
      const { error } = await supabase
        .from('service_providers')
        .update({ webhook_url: webhookUrl || null })
        .eq('id', provider.id)

      if (error) throw error
      setMessage({ type: 'success', text: t('profile.msgWebhookSaved') })
    } catch (err) {
      setMessage({ type: 'error', text: t('common.errorPrefix') + ' ' + err.message })
    }
  }

  // ---------------------------------------------------------------------
  // Image uploads (logo + cover) → Supabase Storage bucket provider-images
  // ---------------------------------------------------------------------

  async function handleImageUpload(kind, file) {
    setImageMessage(null)
    if (!file) return
    if (!provider?.id) {
      setImageMessage({ type: 'error', text: t('profile.msgNoProfile') })
      return
    }

    // Basic validation
    if (!file.type.startsWith('image/')) {
      setImageMessage({ type: 'error', text: t('profile.msgSelectImage') })
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageMessage({
        type: 'error',
        text: `Bild ist größer als 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`,
      })
      return
    }

    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingCover
    setBusy(true)

    try {
      // Extension from mime or filename, fallback to jpg
      const extFromType = file.type.split('/')[1] || 'jpg'
      const ext = ['jpeg', 'jpg', 'png', 'webp', 'heic', 'heif'].includes(extFromType)
        ? (extFromType === 'jpeg' ? 'jpg' : extFromType)
        : 'jpg'

      const folder = kind === 'logo' ? 'logos' : 'covers'
      const path = `${folder}/${provider.id}.${ext}`

      const { error: upErr } = await supabase.storage
        .from(PROVIDER_IMAGES_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        })

      if (upErr) throw upErr

      // Public URL (bucket is public)
      const { data: pub } = supabase.storage
        .from(PROVIDER_IMAGES_BUCKET)
        .getPublicUrl(path)

      // Bust any CDN cache by appending a short timestamp — the URL itself
      // stays stable on the DB side (upsert overwrote the object).
      const publicUrl = pub.publicUrl

      // Persist on service_providers
      const column = kind === 'logo' ? 'logo_url' : 'cover_image_url'
      const { error: dbErr } = await supabase
        .from('service_providers')
        .update({ [column]: publicUrl })
        .eq('id', provider.id)
      if (dbErr) throw dbErr

      setImageMessage({
        type: 'success',
        text: kind === 'logo' ? 'Logo aktualisiert.' : 'Titelbild aktualisiert.',
      })
      loadProvider(user.id)
    } catch (err) {
      console.error('image upload error:', err)
      setImageMessage({
        type: 'error',
        text: `Upload fehlgeschlagen: ${err.message || err}`,
      })
    } finally {
      setBusy(false)
      // Reset input so the same file can be re-uploaded
      if (kind === 'logo' && logoInputRef.current) logoInputRef.current.value = ''
      if (kind === 'cover' && coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  async function handleImageRemove(kind) {
    setImageMessage(null)
    if (!provider?.id) return

    const column = kind === 'logo' ? 'logo_url' : 'cover_image_url'
    const currentUrl = provider[column]
    if (!currentUrl) return

    if (!confirm(kind === 'logo' ? 'Logo wirklich entfernen?' : 'Titelbild wirklich entfernen?')) {
      return
    }

    const setBusy = kind === 'logo' ? setUploadingLogo : setUploadingCover
    setBusy(true)
    try {
      // Try to delete from storage (only succeeds if the URL points at our bucket)
      if (currentUrl.includes(`/storage/v1/object/public/${PROVIDER_IMAGES_BUCKET}/`)) {
        const marker = `/storage/v1/object/public/${PROVIDER_IMAGES_BUCKET}/`
        const pathInBucket = currentUrl.split(marker)[1]
        if (pathInBucket) {
          await supabase.storage.from(PROVIDER_IMAGES_BUCKET).remove([pathInBucket])
        }
      }

      const { error: dbErr } = await supabase
        .from('service_providers')
        .update({ [column]: null })
        .eq('id', provider.id)
      if (dbErr) throw dbErr

      setImageMessage({
        type: 'success',
        text: kind === 'logo' ? 'Logo entfernt.' : 'Titelbild entfernt.',
      })
      loadProvider(user.id)
    } catch (err) {
      console.error('image remove error:', err)
      setImageMessage({
        type: 'error',
        text: `Entfernen fehlgeschlagen: ${err.message || err}`,
      })
    } finally {
      setBusy(false)
    }
  }

  function copyApiKey() {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey)
      setApiKeyCopied(true)
      setTimeout(() => setApiKeyCopied(false), 2000)
    }
  }

  function getStripeStatusInfo() {
    if (!provider?.stripe_account_id) {
      return { label: 'Nicht eingerichtet', color: 'var(--gray-400)', icon: AlertCircle }
    }
    if (stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled) {
      return { label: t('pf.stripeActive'), color: 'var(--green)', icon: CheckCircle }
    }
    if (stripeStatus?.details_submitted) {
      return { label: t('pf.stripeReview'), color: 'var(--yellow)', icon: Clock }
    }
    return { label: t('pf.stripePending'), color: 'var(--primary)', icon: AlertCircle }
  }

  if (!provider) return <div className="loading">{t('pf.k0')}</div>

  const stripeInfo = getStripeStatusInfo()
  const StripeIcon = stripeInfo.icon

  return (
    <div className="page">
      {!canAdmin && (
        <div className="alert" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', marginBottom: 12 }}>
          👤 {t('team.loggedInAs')} <strong>{t('pf.k1')}</strong> {t('team.canEditOnly')} <strong>{t('pf.k2')}</strong>{t('team.editSuffix')}
          {t('team.adminReserved')}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t('pf.k3')}</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {t('pf.k4')}
          </p>
        </div>
        <a
          href={`/provider/${provider.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          <Eye size={16} /> {t('pf.k5')}
        </a>
      </div>

      {message && (
        <div className={`message message-${message.type}`}>{message.text}</div>
      )}

      {/* Stripe Connect Section */}
      <div className="card" style={{ borderLeft: `4px solid ${stripeInfo.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} />
            {t('pf.k6')}
          </h2>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
            background: stripeInfo.color === 'var(--green)' ? '#d1fae5' :
                        stripeInfo.color === 'var(--yellow)' ? '#fef3c7' :
                        stripeInfo.color === 'var(--primary)' ? '#ffedd5' : 'var(--gray-100)',
            color: stripeInfo.color === 'var(--green)' ? '#065f46' :
                   stripeInfo.color === 'var(--yellow)' ? '#92400e' :
                   stripeInfo.color === 'var(--primary)' ? '#9a3412' : 'var(--gray-500)',
          }}>
            <StripeIcon size={14} />
            {stripeInfo.label}
          </span>
        </div>

        {stripeMessage && (
          <div className={`message message-${stripeMessage.type}`}>{stripeMessage.text}</div>
        )}

        {!provider.stripe_account_id ? (
          <div>
            {/* AGB-Gate: Stripe-Onboarding nur nach Akzeptanz der Provider-Nutzungsbedingungen.
                Bestandsprovider (vor Migration 070) sehen hier den Annahme-Button. */}
            {!provider.agb_accepted_at && (
              <div style={{
                background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8,
                padding: '12px 14px', marginBottom: 16, fontSize: '0.9rem', color: '#9a3412'
              }}>
                <strong>{t('pf.k7')}</strong>
                <p style={{ margin: '6px 0 10px', fontSize: '0.85rem' }}>
                  Skipily ist Vermittler — du verantwortest Lieferung, Qualität, Mängelhaftung
                  und Verbraucherschutz für deine Endkunden selbst.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <a href="/provider-agb.html" target="_blank" rel="noopener noreferrer"
                     style={{ color: '#9a3412', fontWeight: 600, textDecoration: 'underline' }}>
                    {t('pf.k8')}
                  </a>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                    onClick={async () => {
                      try {
                        const { error } = await supabase
                          .rpc('accept_provider_agb', { p_version: '2026-05' })
                        if (error) throw error
                        // Reload provider data
                        window.location.reload()
                      } catch (err) {
                        alert('AGB-Annahme fehlgeschlagen: ' + (err.message || err))
                      }
                    }}
                  >
                    ✓ Ich akzeptiere die AGB
                  </button>
                </div>
              </div>
            )}

            <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginBottom: 16, lineHeight: 1.6 }}>
              Um Zahlungen von Kunden zu empfangen, verbinden Sie Ihr Konto mit Stripe.
              Sie werden zur sicheren Einrichtung weitergeleitet, wo Sie Ihre Bankdaten hinterlegen.
            </p>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
              <div className="stripe-feature">
                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                <span>{t('pf.k9')}</span>
              </div>
              <div className="stripe-feature">
                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                <span>{t('pf.k10')}</span>
              </div>
              <div className="stripe-feature">
                <CheckCircle size={16} style={{ color: 'var(--green)' }} />
                <span>{t('pf.k11')}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={startStripeOnboarding}
              disabled={stripeLoading}
              style={{ marginTop: 8 }}
            >
              {stripeLoading
                ? <><Loader size={16} className="spin" /> {t('pf.k12')}</>
                : <><CreditCard size={16} /> {t('pf.k13')}</>
              }
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div className="stripe-status-item">
                <span className="stripe-status-label">{t('pf.k14')}</span>
                <span className={`stripe-status-value ${stripeStatus?.charges_enabled ? 'active' : ''}`}>
                  {stripeStatus?.charges_enabled ? t('pf.enabled') : t('pf.pending')}
                </span>
              </div>
              <div className="stripe-status-item">
                <span className="stripe-status-label">{t('pf.k15')}</span>
                <span className={`stripe-status-value ${stripeStatus?.payouts_enabled ? 'active' : ''}`}>
                  {stripeStatus?.payouts_enabled ? t('pf.enabled') : t('pf.pending')}
                </span>
              </div>
              <div className="stripe-status-item">
                <span className="stripe-status-label">{t('pf.k16')}</span>
                <span className="stripe-status-value">{provider.commission_rate || 10}%</span>
              </div>
            </div>

            {(!stripeStatus?.charges_enabled || !stripeStatus?.payouts_enabled) && (
              <button
                type="button"
                className="btn-secondary"
                onClick={startStripeOnboarding}
                disabled={stripeLoading}
              >
                {stripeLoading
                  ? <><Loader size={16} className="spin" /> {t('pf.k12')}</>
                  : <><ExternalLink size={16} /> {t('pf.k17')}</>
                }
              </button>
            )}

            {stripeStatus?.charges_enabled && stripeStatus?.payouts_enabled && (
              <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem', marginTop: 4 }}>
                {t('pf.k18')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ─── Skipily-Abo (Pro / Enterprise / Standard / Admin-Grant) ─── */}
      {(() => {
        const tier            = provider.subscription_tier   || 'standard'
        const status          = provider.subscription_status || 'active'
        const plan            = provider.subscription_plan
        const isProfessional  = tier === 'professional' && status === 'active'
        const isEnterprise    = isProfessional && (plan === 'ent_monthly' || plan === 'ent_yearly')
        const isAdminGrant    = tier === 'admin_grant'
        const validUntil      = tier === 'admin_grant' ? provider.free_until : provider.subscription_period_end
        const accent          = isEnterprise ? '#7e22ce' : isProfessional ? '#15803d' : isAdminGrant ? '#854d0e' : '#475569'
        const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' }) : null

        const planLabel = ({
          pro_monthly:  'Pro · monatlich',
          pro_yearly:   'Pro · jährlich',
          ent_monthly:  'Enterprise · monatlich',
          ent_yearly:   'Enterprise · jährlich',
        })[plan] || (isProfessional ? 'Pro' : '')

        return (
          <div className="card" style={{ borderLeft: `4px solid ${accent}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⭐ Skipily-Abo
              </h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
                background: isEnterprise ? '#f3e8ff' : isProfessional ? '#d1fae5' : isAdminGrant ? '#fef3c7' : '#f1f5f9',
                color: accent,
              }}>
                {isEnterprise   ? `💎 Enterprise${planLabel ? ' · ' + planLabel.split('· ')[1] : ''}` :
                 isProfessional ? `⭐ ${planLabel || 'Pro'}` :
                 isAdminGrant   ? t('pf.tierAdminGrant') : t('pf.tierStandard')}
              </span>
            </div>

            {subscriptionMessage && (
              <div className={`message message-${subscriptionMessage.type}`} style={{ marginBottom: 12 }}>
                {subscriptionMessage.text}
              </div>
            )}

            {/* Aktive Pro/Enterprise-Anzeige: kompakte Plan-Karte */}
            {isProfessional && validUntil && (() => {
              const planPrice = ({
                pro_monthly: { amount: 79,   per: 'Monat', features: ['API-Zugang', 'Webhook', 'Priorisierte Sichtbarkeit'] },
                pro_yearly:  { amount: 789,  per: 'Jahr',  features: ['API-Zugang', 'Webhook', 'Priorisierte Sichtbarkeit', '17 % Jahresrabatt'] },
                ent_monthly: { amount: 199,  per: 'Monat', features: ['Alle Pro-Features', 'Werbeplätze', 'Markt-Analytics', 'Multi-User'] },
                ent_yearly:  { amount: 1999, per: 'Jahr',  features: ['Alle Pro-Features', 'Werbeplätze', 'Markt-Analytics', 'Multi-User', '17 % Jahresrabatt'] },
              })[plan] || null

              return (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 16, padding: '14px 16px', borderRadius: 12,
                  background: isEnterprise ? 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)' : 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                  border: `1px solid ${isEnterprise ? '#e9d5ff' : '#bbf7d0'}`,
                  marginBottom: 14, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {planPrice && (
                      <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
                        {planPrice.amount} €
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)' }}> / {planPrice.per}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
                      {t('pf.k19')} <strong style={{ color: '#0f172a' }}>{fmtDate(validUntil)}</strong>
                    </div>
                    {planPrice && (
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {planPrice.features.map(f => (
                          <span key={f} style={{
                            fontSize: 11, fontWeight: 600,
                            padding: '2px 8px', borderRadius: 10,
                            background: '#fff', color: accent,
                            border: `1px solid ${isEnterprise ? '#e9d5ff' : '#bbf7d0'}`,
                          }}>✓ {f}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 40, lineHeight: 1, opacity: 0.85 }}>
                    {isEnterprise ? '💎' : '⭐'}
                  </div>
                </div>
              )
            })()}

            {isAdminGrant && validUntil && (
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginBottom: 12 }}>
                {t('pf.k20')} <strong>{fmtDate(validUntil)}</strong>
              </p>
            )}

            {tier === 'standard' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                  <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', margin: 0, lineHeight: 1.6, flex: 1, minWidth: 240 }}>
                    Mit <strong>Pro</strong> erhältst du erweiterte Features (API-Zugang,
                    Webhook-Integration, priorisierte Sichtbarkeit). Mit <strong>{t('pf.k21')}</strong>
                    zusätzlich Werbeplätze, Markt-Analytics und Multi-User-Verwaltung.
                  </p>
                  <button
                    type="button"
                    onClick={() => syncSubscriptionFromStripe(true)}
                    title={t('profile.titleStripeSync')}
                    style={{
                      background: 'transparent', border: '1px solid var(--gray-200)',
                      color: 'var(--gray-500)', padding: '4px 10px', borderRadius: 6,
                      fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>
                    🔄 Status aktualisieren
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {SUBSCRIPTION_PLANS.map(plan => {
                    const isEnterprise = plan.tier === 'Enterprise'
                    return (
                      <button
                        key={plan.code}
                        type="button"
                        onClick={() => startSubscriptionCheckout(plan.price_id)}
                        disabled={subscriptionLoading}
                        style={{
                          textAlign: 'left',
                          padding: '14px 16px',
                          borderRadius: 12,
                          border: `2px solid ${isEnterprise ? '#a855f7' : '#22c55e'}`,
                          background: '#fff',
                          cursor: subscriptionLoading ? 'wait' : 'pointer',
                          transition: 'transform .12s, box-shadow .12s',
                          position: 'relative',
                        }}
                        onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)' }}
                        onMouseOut={e =>  { e.currentTarget.style.transform = '';                  e.currentTarget.style.boxShadow = '' }}
                      >
                        {plan.savings && (
                          <span style={{
                            position: 'absolute', top: -8, right: 12,
                            background: '#facc15', color: '#713f12',
                            padding: '2px 8px', borderRadius: 10,
                            fontSize: 10, fontWeight: 700,
                          }}>{plan.savings}</span>
                        )}
                        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: isEnterprise ? '#7e22ce' : '#15803d', textTransform: 'uppercase' }}>
                          {plan.tier}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                          {plan.price} €
                          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)' }}> / {plan.per}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                          {plan.period === 'Jährlich'
                            ? `≈ ${(plan.price / 12).toLocaleString('de-DE', { maximumFractionDigits: 0 })} € / Monat`
                            : 'monatlich kündbar'}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {subscriptionLoading && (
                  <p style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-500)' }}>
                    <Loader size={14} className="spin" /> {t('pf.k22')}
                  </p>
                )}
              </div>
            )}

            {isProfessional && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={openBillingPortal}
                  disabled={subscriptionLoading}
                  style={{ fontSize: '0.9rem' }}
                >
                  {subscriptionLoading
                    ? <><Loader size={14} className="spin" /> {t('pf.k23')}</>
                    : <><ExternalLink size={14} /> {t('pf.k24')}</>}
                </button>
                <button
                  type="button"
                  onClick={() => syncSubscriptionFromStripe(true)}
                  title={t('profile.titleStripeSync')}
                  style={{
                    background: 'transparent', border: '1px solid var(--gray-200)',
                    color: 'var(--gray-500)', padding: '6px 12px', borderRadius: 6,
                    fontSize: '0.8rem', cursor: 'pointer',
                  }}>
                  🔄 Aktualisieren
                </button>
              </div>
            )}

            {isAdminGrant && (
              <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', marginTop: 8 }}>
                {t('pf.k25')} {t('pf.subFreeRest')}
              </p>
            )}
          </div>
        )
      })()}

      {/* Images: Logo + Cover — only editable by the provider, not by app users */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <ImageIcon size={20} style={{ color: 'var(--primary)' }} />
          <h2 style={{ margin: 0 }}>{t('profile.secImages')}</h2>
        </div>
        <p className="hint" style={{ marginBottom: 16 }}>
          {t('pf.imagesDesc')}
        </p>

        {imageMessage && (
          <div className={`message message-${imageMessage.type}`} style={{ marginBottom: 16 }}>
            {imageMessage.text}
          </div>
        )}

        {/* Logo */}
        <div className="form-group">
          <label>{t('profile.logo')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 12,
                border: '1px solid var(--gray-200)',
                background: 'var(--gray-50)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {provider.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt="Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <ImageIcon size={28} style={{ color: 'var(--gray-300)' }} />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleImageUpload('logo', e.target.files?.[0])}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo
                  ? <><Loader size={14} className="spin" /> {t('pf.k26')}</>
                  : <><Upload size={14} /> {provider.logo_url ? t('pf.logoReplace') : t('pf.logoUpload')}</>
                }
              </button>
              {provider.logo_url && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleImageRemove('logo')}
                  disabled={uploadingLogo}
                  title={t('profile.titleRemoveLogo')}
                >
                  <Trash2 size={14} /> {t('pf.k27')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cover / Titelbild */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label>{t('profile.cover')}</label>
          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              maxHeight: 260,
              borderRadius: 12,
              border: '1px solid var(--gray-200)',
              background: provider.cover_image_url
                ? 'var(--gray-50)'
                : 'linear-gradient(135deg, #e0e7ff 0%, #fce7f3 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            {provider.cover_image_url ? (
              <img
                src={provider.cover_image_url}
                alt="Titelbild"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            ) : (
              <div style={{ color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={28} />
                <span>{t('pf.k28')}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleImageUpload('cover', e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploadingCover}
            >
              {uploadingCover
                ? <><Loader size={14} className="spin" /> {t('pf.k26')}</>
                : <><Upload size={14} /> {provider.cover_image_url ? t('pf.coverReplace') : t('pf.coverUpload')}</>
              }
            </button>
            {provider.cover_image_url && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleImageRemove('cover')}
                disabled={uploadingCover}
                title={t('profile.titleRemoveCover')}
              >
                <Trash2 size={14} /> {t('pf.k27')}
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          <h2>{t('profile.secCompany')}</h2>
          <div className="form-row">
            <div className="form-group">
              <label>{t('profile.company')} *</label>
              <input name="name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>{t('profile.slogan')}</label>
              <input name="slogan" value={form.slogan} onChange={handleChange} placeholder={t('profile.phSlogan')} />
            </div>
          </div>
          <div className="form-group">
            <label>{t('profile.description')}</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={4} />
          </div>
          <div className="form-group">
            <label>{t('profile.shopDescription')}</label>
            <textarea name="shop_description" value={form.shop_description} onChange={handleChange} rows={3} placeholder={t('profile.phDescription')} />
          </div>

          {/* Kategorien — bis zu 3 (z.B. Zubehör + Motorservice) */}
          <h3 style={{ fontSize: '0.95rem', margin: '14px 0 6px' }}>{t('profile.catTitle')}</h3>
          <p className="hint" style={{ marginTop: 0 }}>{t('pf.k29')}</p>
          <div className="form-row">
            {['category', 'category2', 'category3'].map((field, idx) => (
              <div className="form-group" key={field}>
                <label>{idx === 0 ? t('team.catMain') : t('team.catOptional', { n: idx + 1 })}</label>
                <select name={field} value={form[field] || ''} onChange={handleChange} required={idx === 0}>
                  <option value="">{idx === 0 ? t('team.catChoose') : t('team.catNone')}</option>
                  {CATEGORY_OPTIONS
                    // gleiche Kategorie nicht doppelt wählbar
                    .filter(([val]) => {
                      const others = ['category', 'category2', 'category3'].filter(f => f !== field).map(f => form[f])
                      return val === form[field] || !others.includes(val)
                    })
                    .map(([val, emoji, key]) => <option key={val} value={val}>{emoji} {t(key)}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>{t('profile.secAddress')}</h2>
          <div className="form-group">
            <label>{t('profile.street')}</label>
            <input name="street" value={form.street} onChange={handleChange} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('profile.zip')}</label>
              <input name="postal_code" value={form.postal_code} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>{t('profile.city')}</label>
              <input name="city" value={form.city} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>{t('profile.country')}</label>
              <input name="country" value={form.country} onChange={handleChange} />
            </div>
          </div>
        </div>

        {/* ─── Lieferländer (EU-Verpackungsverordnung / EPR) ───────────────── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Globe size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>{t('profile.secCountries')}</h2>
          </div>
          <p className="hint" style={{ marginBottom: 12 }}>
            {t('pf.k30')} <strong>{t('pf.k31')}</strong> und nationale Pflichten wie <em>LUCID</em> (Deutschland), <em>{t('pf.k32')}</em> (Frankreich) oder <em>RAEE</em> (Italien) verlangen, dass Händler in jedem Empfängerland registriert sind und die Verpackungs-Recycling-Gebühren entrichten. Wer hier ein Land nicht freischaltet, bekommt aus diesem Land keine Bestellungen.
          </p>
          <p className="hint" style={{ marginBottom: 16, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            <strong>{t('pf.k33')}</strong> Diese Einstellung ersetzt keine rechtliche Beratung — kläre für jedes ausgewählte Land deine Registrierungs- und Meldepflichten selbst ab.
          </p>

          {/* Presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <button type="button" className="btn-secondary"
                    onClick={() => applyShippingPreset(['DE'])}
                    style={{ fontSize: 13, padding: '6px 12px' }}>
              {t('pf.k34')}
            </button>
            <button type="button" className="btn-secondary"
                    onClick={() => applyShippingPreset(['DE', 'AT', 'CH'])}
                    style={{ fontSize: 13, padding: '6px 12px' }}>
              DACH
            </button>
            <button type="button" className="btn-secondary"
                    onClick={() => applyShippingPreset(EU_27.map(c => c.code))}
                    style={{ fontSize: 13, padding: '6px 12px' }}>
              EU-27
            </button>
            <button type="button" className="btn-secondary"
                    onClick={() => applyShippingPreset(ALL_COUNTRIES.map(c => c.code))}
                    style={{ fontSize: 13, padding: '6px 12px' }}>
              {t('pf.k35')}
            </button>
            <button type="button" className="btn-secondary"
                    onClick={clearShipping}
                    style={{ fontSize: 13, padding: '6px 12px', color: '#b91c1c' }}>
              {t('pf.k36')}
            </button>
          </div>

          {/* Status-Badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
            padding: '8px 12px',
            background: shippingCountries === null
              ? '#fef3c7'
              : currentShipping.length === 0 ? '#fee2e2' : '#f0fdf4',
            border: '1px solid',
            borderColor: shippingCountries === null
              ? '#fde68a'
              : currentShipping.length === 0 ? '#fecaca' : '#bbf7d0',
            borderRadius: 6, fontSize: 13,
          }}>
            {shippingCountries === null ? (
              <>
                <AlertCircle size={16} style={{ color: '#854d0e' }} />
                <span style={{ color: '#854d0e' }}>
                  {t('pf.k37')}
                </span>
              </>
            ) : currentShipping.length === 0 ? (
              <>
                <AlertCircle size={16} style={{ color: '#991b1b' }} />
                <span style={{ color: '#991b1b' }}>
                  {t('pf.k38')} <strong>kein Land</strong> versendet — Bestellungen werden im Shop blockiert.
                </span>
              </>
            ) : (
              <>
                <CheckCircle size={16} style={{ color: '#166534' }} />
                <span style={{ color: '#166534' }}>
                  {t('pf.k39')} <strong>{currentShipping.length}</strong> {currentShipping.length === 1 ? 'Land' : 'Länder'} aktiviert.
                </span>
              </>
            )}
          </div>

          {/* Länder-Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 6,
          }}>
            {ALL_COUNTRIES.map(c => {
              const selected = currentShipping.includes(c.code)
              return (
                <label key={c.code}
                       style={{
                         display: 'flex', alignItems: 'center', gap: 8,
                         padding: '6px 10px',
                         border: '1px solid',
                         borderColor: selected ? 'var(--primary)' : '#e2e8f0',
                         background: selected ? '#eff6ff' : '#fff',
                         borderRadius: 6, cursor: 'pointer',
                         fontSize: 13,
                       }}>
                  <input type="checkbox"
                         checked={selected}
                         onChange={() => toggleShippingCountry(c.code)}
                         style={{ margin: 0 }} />
                  <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#475569' }}>
                    {c.code}
                  </span>
                  <span style={{ color: '#1e293b' }}>{t('ctry.' + c.code)}</span>
                </label>
              )
            })}
          </div>

          {/* ── EPR-Registrierungsnummer (Stammdaten) ── */}
          <div className="form-group" style={{ marginTop: 18 }}>
            <label>{t('epr.numberLabel')}</label>
            <input
              name="epr_registration_number"
              value={form.epr_registration_number || ''}
              onChange={handleChange}
              placeholder={t('epr.numberPh')}
              disabled={!canAdmin}
            />
            <p className="hint" style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 4 }}>
              {t('epr.numberHint')}
            </p>
          </div>

          {/* ── EPR-Hinweisbox je Lieferland (rein informativ) ── */}
          <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <FileText size={16} style={{ color: 'var(--primary)' }} />
              <strong style={{ fontSize: '0.92rem' }}>{t('epr.boxTitle')}</strong>
            </div>
            {currentShipping.length === 0 ? (
              <p className="hint" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                {t('epr.selectFirst')}
              </p>
            ) : (
              <>
                <p className="hint" style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--gray-500)' }}>
                  {t('epr.boxIntro')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 6 }}>
                  {[...currentShipping].sort().map(code => {
                    const reg = EPR_REGISTERS[code]
                    return (
                      <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12.5 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#475569' }}>{code}</span>
                        <span style={{ flex: 1, color: '#1e293b' }}>{reg ? reg.name : t('epr.genericNote')}</span>
                        {reg && (
                          <a href={reg.url} target="_blank" rel="noopener noreferrer"
                             style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            {t('epr.openRegister')} <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: 'var(--gray-500)', lineHeight: 1.5 }}>
              {t('epr.disclaimer')}
            </p>
          </div>
        </div>

        {/* ── Versandkosten-Engine ── */}
        {shipRule && (
        <div className="card">
          <h2 style={{ display:'flex', alignItems:'center', gap:8 }}>{t('profile.secShipping')}</h2>
          <p style={{ fontSize:'0.85rem', color:'#64748b', marginTop:0 }}>
            {t('pf.shipEngineDesc')}
          </p>

          <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <input type="checkbox" checked={!!shipRule.enabled} onChange={e => setShip('enabled', e.target.checked)} />
            <span style={{ fontWeight:600 }}>{t('pf.k40')}</span>
          </label>

          <div className="form-row">
            <div className="form-group">
              <label>{t('profile.homeCountry')}</label>
              <select value={shipRule.domestic_country || 'DE'}
                      onChange={e => setShip('domestic_country', e.target.value)}>
                {[
                  ['DE','pf.cDE'],['AT','pf.cAT'],['CH','pf.cCH'],['FR','pf.cFR'],
                  ['IT','pf.cIT'],['ES','pf.cES'],['NL','pf.cNL'],['BE','pf.cBE'],
                  ['LU','pf.cLU'],['DK','pf.cDK'],['SE','pf.cSE'],['PL','pf.cPL'],
                  ['PT','pf.cPT'],['GR','pf.cGR'],['HR','pf.cHR'],['GB','pf.cGB'],
                ].map(([code, name]) => (
                  <option key={code} value={code}>{t(name)} ({code})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>{t('profile.freeFromHome')}</label>
              <input type="number" step="0.01" value={shipRule.free_threshold_domestic ?? ''}
                     onChange={e => setShip('free_threshold_domestic', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder="85.00" />
            </div>
            <div className="form-group">
              <label>{t('profile.freeFromEu')}</label>
              <input type="number" step="0.01" value={shipRule.free_threshold_eu ?? ''}
                     onChange={e => setShip('free_threshold_eu', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder={t('profile.phOptional')} />
            </div>
          </div>

          <h3 style={{ fontSize:'0.95rem', margin:'10px 0 6px' }}>{t('profile.tariffsTitle')}</h3>
          {[['domestic','pf.zoneHome'],['eu','pf.zoneEu'],['world','pf.zoneWorld']].map(([z, label]) => (
            <div className="form-row" key={z}>
              <div className="form-group"><label>{t(label)} — {t('pf.basePrice')}</label>
                <input type="number" step="0.01" value={shipRule[`rate_${z}_base`] ?? ''} onChange={e => setShip(`rate_${z}_base`, parseFloat(e.target.value) || 0)} /></div>
              <div className="form-group"><label>{t(label)} — {t('pf.perKg')}</label>
                <input type="number" step="0.01" value={shipRule[`rate_${z}_per_kg`] ?? ''} onChange={e => setShip(`rate_${z}_per_kg`, parseFloat(e.target.value) || 0)} /></div>
            </div>
          ))}

          <div className="form-row">
            <div className="form-group"><label>{t('profile.maxShipping')}</label>
              <input type="number" step="0.01" value={shipRule.max_shipping ?? ''} onChange={e => setShip('max_shipping', e.target.value === '' ? null : parseFloat(e.target.value))} placeholder={t('profile.phCap')} /></div>
            <div className="form-group"><label>{t('profile.defaultWeight')}</label>
              <input type="number" step="0.01" value={shipRule.default_item_weight ?? ''} onChange={e => setShip('default_item_weight', parseFloat(e.target.value) || 0.5)} /></div>
          </div>

          {shipMsg && <div className={`alert alert-${shipMsg.type}`}>{shipMsg.text}</div>}
          <button className="btn-primary" onClick={saveShippingRule} disabled={!canAdmin}>{t('pf.k41')}</button>
        </div>
        )}

        {/* ── Sendcloud-Versandintegration ── */}
        {(() => {
          const accent = sc?.status === 'connected' ? 'var(--green)'
            : sc?.status === 'error' ? '#ef4444' : 'var(--gray-400)'
          const pillBg = sc?.status === 'connected' ? '#d1fae5'
            : sc?.status === 'error' ? '#fee2e2' : 'var(--gray-100)'
          const pillColor = sc?.status === 'connected' ? '#065f46'
            : sc?.status === 'error' ? '#991b1b' : 'var(--gray-500)'
          const StatusIcon = sc?.status === 'connected' ? CheckCircle
            : sc?.status === 'error' ? AlertCircle : AlertCircle
          const statusLabel = sc?.status === 'connected' ? t('sc.statusConnected')
            : sc?.status === 'error' ? t('sc.statusError') : t('sc.statusNotConnected')
          const benefits = [1, 2, 3, 4, 5, 6].map(n => [t(`sc.benefit${n}Title`), t(`sc.benefit${n}Desc`)])
          const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
          return (
            <div className="card" style={{ borderLeft: `4px solid ${accent}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Truck size={20} style={{ color: 'var(--primary)' }} />
                  {t('sc.section')}
                </h2>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 12px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600,
                  background: pillBg, color: pillColor,
                }}>
                  <StatusIcon size={14} />
                  {statusLabel}
                </span>
              </div>

              <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 0, lineHeight: 1.6 }}>
                {t('sc.tagline')}
              </p>

              {/* Vorteile */}
              <div style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%)',
                border: '1px solid #bae6fd', borderRadius: 12, padding: '14px 16px', marginBottom: 16,
              }}>
                <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⭐ {t('sc.benefitsTitle')}
                </h3>
                <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#475569', lineHeight: 1.55 }}>
                  {t('sc.whatIsDesc')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                  {benefits.map(([title, desc]) => (
                    <div key={title} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <CheckCircle size={16} style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>{title}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: 1.45 }}>{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {scMsg && (
                <div className={`message message-${scMsg.type}`} style={{ marginBottom: 12 }}>{scMsg.text}</div>
              )}

              {scConnected ? (
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    padding: '12px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0',
                    marginBottom: 14, flexWrap: 'wrap',
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{t('sc.connectedAccount')}</div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {sc?.account_name || sc?.account_email || 'Sendcloud'}
                      </div>
                      {sc?.connected_at && (
                        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                          {t('sc.connectedSince')} {fmtDate(sc.connected_at)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 34, lineHeight: 1 }}>📦</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary" onClick={testSendcloud} disabled={scBusy}>
                      {scBusy ? <><Loader size={14} className="spin" /> {t('sc.testing')}</> : <><RefreshCw size={14} /> {t('sc.testConnection')}</>}
                    </button>
                    {canAdmin && (
                      <button type="button" className="btn-secondary" onClick={disconnectSendcloud} disabled={scBusy}
                        style={{ color: '#b91c1c', borderColor: '#fecaca' }}>
                        <RotateCcw size={14} /> {t('sc.disconnect')}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {/* Anleitung */}
                  <h3 style={{ fontSize: '0.95rem', margin: '4px 0 8px' }}>{t('sc.howtoTitle')}</h3>
                  <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: '0.85rem', color: '#475569', lineHeight: 1.7 }}>
                    <li>{t('sc.howtoStep1')}</li>
                    <li>{t('sc.howtoStep2')}</li>
                    <li>{t('sc.howtoStep3')}</li>
                    <li>{t('sc.howtoStep4')}</li>
                  </ol>
                  <a href="https://app.sendcloud.com/" target="_blank" rel="noopener noreferrer"
                     className="btn-secondary"
                     style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', marginBottom: 14 }}>
                    <ExternalLink size={16} /> {t('sc.openSendcloud')}
                  </a>

                  {canAdmin ? (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>{t('sc.publicKey')}</label>
                          <input type="text" value={scPublic} onChange={e => setScPublic(e.target.value)}
                                 placeholder={t('sc.publicKeyPh')} autoComplete="off" />
                        </div>
                        <div className="form-group">
                          <label>{t('sc.secretKey')}</label>
                          <input type="password" value={scSecret} onChange={e => setScSecret(e.target.value)}
                                 placeholder={t('sc.secretKeyPh')} autoComplete="off" />
                        </div>
                      </div>
                      <button type="button" className="btn-primary" onClick={connectSendcloud} disabled={scBusy}>
                        {scBusy ? <><Loader size={16} className="spin" /> {t('sc.connecting')}</> : <><Truck size={16} /> {t('sc.connect')}</>}
                      </button>
                    </>
                  ) : (
                    <div className="alert" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412' }}>
                      {t('sc.adminOnly')}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
                <p style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.78rem', color: 'var(--gray-500)', margin: 0, lineHeight: 1.5, flex: 1, minWidth: 220 }}>
                  <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {t('sc.securityNote')}
                </p>
                <a href={sendcloudGuideUrl} target="_blank" rel="noopener noreferrer"
                   style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  <ExternalLink size={14} /> {t('sc.guidePdf')}
                </a>
              </div>
            </div>
          )
        })()}

        <div className="card">
          <h2>{t('profile.secContact')}</h2>
          <div className="form-row">
            <div className="form-group">
              <label>{t('profile.phone')}</label>
              <input name="phone" value={form.phone} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>{t('profile.email')}</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t('profile.website')}</label>
              <input name="website" value={form.website} onChange={handleChange} placeholder={t('profile.website')} />
            </div>
            <div className="form-group">
              <label>{t('profile.hours')}</label>
              <input name="opening_hours" value={form.opening_hours} onChange={handleChange} placeholder={t('profile.phMo')} />
            </div>
          </div>
        </div>

        {/* ─── Leistungen (Services) ─────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Wrench size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>{t('profile.secServices')}</h2>
          </div>
          <p className="hint" style={{ marginBottom: 16 }}>
            Welche Services bietest du an? Diese erscheinen als anklickbare Tags auf deinem Profil. Klickt ein Kunde in der App auf eine Leistung, wird automatisch nach passenden Produkten in deinem Shop gesucht.
          </p>

          {/* Existing services as chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {services.length === 0 && (
              <span style={{ color: 'var(--gray-400)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                {t('pf.k42')}
              </span>
            )}
            {services.map(s => {
              const cnt = productMatchCount(s)
              return (
                <span key={s} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px 6px 12px', borderRadius: 20,
                  background: '#f0fdf4', color: '#166534',
                  border: '1px solid #bbf7d0', fontSize: 13, fontWeight: 500,
                }}>
                  {s}
                  {cnt > 0 && (
                    <span style={{
                      background: '#dcfce7', color: '#15803d',
                      borderRadius: 10, padding: '1px 7px',
                      fontSize: 11, fontWeight: 700,
                    }} title={`${cnt} passende Produkte im Shop`}>
                      {cnt} 📦
                    </span>
                  )}
                  <button type="button" onClick={() => removeService(s)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: '#166534', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                    title={t('profile.titleRemove')}>
                    <X size={14} />
                  </button>
                </span>
              )
            })}
          </div>

          {/* Add input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={serviceInput}
              onChange={e => setServiceInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addService(serviceInput)
                  setServiceInput('')
                }
              }}
              placeholder={t('profile.phServices')}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-secondary"
              onClick={() => { addService(serviceInput); setServiceInput('') }}>
              <Plus size={14} /> {t('pf.k43')}
            </button>
          </div>

          {/* Suggestions from shop products (tags) */}
          {suggestedServices.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>
                💡 Aus deinen Shop-Produkten erkannt — zum Übernehmen klicken:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestedServices.map(s => (
                  <button key={s} type="button"
                    onClick={() => addService(s)}
                    style={{
                      padding: '4px 10px', borderRadius: 16,
                      background: '#fff', border: '1px dashed #cbd5e1',
                      color: '#475569', fontSize: 12, cursor: 'pointer',
                    }}>
                    + {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Marken (Brands) ─────────────────────────────────────────────── */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Tag size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>{t('profile.secBrands')}</h2>
          </div>
          <p className="hint" style={{ marginBottom: 16 }}>
            Welche Marken/Hersteller führst oder servicierst du? Klickt ein Kunde in der App eine Marke an, werden passende Produkte aus deinem Shop angezeigt.
          </p>

          {/* Existing brands as chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {brands.length === 0 && (
              <span style={{ color: 'var(--gray-400)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                {t('pf.k44')}
              </span>
            )}
            {brands.map(b => {
              const cnt = productMatchCount(b)
              return (
                <span key={b} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px 6px 12px', borderRadius: 20,
                  background: '#fff7ed', color: '#c2410c',
                  border: '1px solid #fed7aa', fontSize: 13, fontWeight: 500,
                }}>
                  {b}
                  {cnt > 0 && (
                    <span style={{
                      background: '#ffedd5', color: '#9a3412',
                      borderRadius: 10, padding: '1px 7px',
                      fontSize: 11, fontWeight: 700,
                    }} title={`${cnt} Produkte dieser Marke im Shop`}>
                      {cnt} 📦
                    </span>
                  )}
                  <button type="button" onClick={() => removeBrand(b)}
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: '#c2410c', padding: 0, display: 'flex', alignItems: 'center',
                    }}
                    title={t('profile.titleRemove')}>
                    <X size={14} />
                  </button>
                </span>
              )
            })}
          </div>

          {/* Add input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={brandInput}
              onChange={e => setBrandInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addBrand(brandInput)
                  setBrandInput('')
                }
              }}
              placeholder={t('profile.phBrands')}
              style={{ flex: 1 }}
            />
            <button type="button" className="btn-secondary"
              onClick={() => { addBrand(brandInput); setBrandInput('') }}>
              <Plus size={14} /> {t('pf.k43')}
            </button>
          </div>

          {/* Suggestions from shop products (manufacturers) */}
          {suggestedBrands.length > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: 'var(--gray-50)', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8 }}>
                💡 Hersteller aus deinem Shop — zum Übernehmen klicken:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestedBrands.map(b => (
                  <button key={b} type="button"
                    onClick={() => addBrand(b)}
                    style={{
                      padding: '4px 10px', borderRadius: 16,
                      background: '#fff', border: '1px dashed #cbd5e1',
                      color: '#475569', fontSize: 12, cursor: 'pointer',
                    }}>
                    + {b}
                  </button>
                ))}
              </div>
            </div>
          )}

          {products.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
              {products.length} Produkt{products.length === 1 ? '' : 'e'} in deinem Shop —
              die Zahl neben jedem Chip zeigt, wie viele davon zu dieser Marke/Leistung passen.
            </p>
          )}
        </div>

        <div className="card">
          <h2>{t('profile.secBusiness')}</h2>
          <div className="form-row">
            <div className="form-group">
              <label>{t('profile.vatId')}</label>
              <input name="tax_id" value={form.tax_id} onChange={handleChange} placeholder="DE123456789" />
            </div>
          </div>
        </div>

        {/* ─── Team-Verwaltung (Enterprise only) ──────────────────────── */}
        <div className="card" style={{ borderLeft: '4px solid #7e22ce' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 22 }}>👥</span>
            <h2 style={{ margin: 0 }}>{t('profile.secTeam')}</h2>
            <span style={{
              background: access.isEnterprise ? '#f3e8ff' : '#f1f5f9',
              color:      access.isEnterprise ? '#7e22ce' : '#475569',
              padding: '2px 10px', borderRadius: 12,
              fontSize: 11, fontWeight: 700,
            }}>💎 Enterprise</span>
          </div>

          {!access.isEnterprise ? (
            <FeatureLock requiredTier="Enterprise" feature={t('team.feature')} icon="👥">
              {t('team.lockBody')} <strong>{t('pf.k21')}</strong>{t('team.lockTariff')}
            </FeatureLock>
          ) : (
            <>
              <p className="hint" style={{ marginBottom: 16 }}>
                {t('team.invite')}
              </p>

              {teamMessage && (
                <div className={`message message-${teamMessage.type}`} style={{ marginBottom: 12 }}>
                  {teamMessage.text}
                </div>
              )}

              {/* Team-Struktur: Inhaber (Hauptrolle) oben, Mitglieder darunter eingerückt */}
              <div style={{ marginBottom: 16 }}>
                {/* Inhaber-Zeile */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: '#faf5ff',
                  border: '1px solid #e9d5ff', borderRadius: 8,
                }}>
                  <span style={{ fontSize: 18 }}>👑</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>
                      {t('team.owner')}{myRole === 'owner' ? ` · ${t('team.you')}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {provider.email || '—'}
                    </div>
                  </div>
                  <span style={{ background: '#7e22ce', color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                    {t('pf.k45')}
                  </span>
                </div>

                {/* Mitglieder, eingerückt + Verbindungslinie zum Inhaber */}
                {teamMembers.length > 0 && (
                  <div style={{ marginLeft: 20, borderLeft: '2px solid #e9d5ff', paddingLeft: 14, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {teamMembers.map(m => (
                      <div key={m.email} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        padding: '8px 12px', background: '#fafafa',
                        border: '1px solid var(--gray-200)', borderRadius: 8, position: 'relative',
                      }}>
                        <span style={{ position: 'absolute', left: -16, top: '50%', width: 12, borderTop: '2px solid #e9d5ff' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 16 }}>{m.role === 'admin' ? '🛡️' : '👤'}</span>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {m.email}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                              {m.role === 'admin' ? t('team.admin') : t('team.member')} · {m.accepted_at ? t('team.active') : t('team.invited')}
                            </div>
                          </div>
                        </div>
                        <select
                          value={m.role}
                          onChange={e => changeTeamRole(m.email, e.target.value)}
                          disabled={!canAdmin}
                          title={t('profile.titleChangeRole')}
                          style={{
                            padding: '5px 8px', border: '1px solid var(--gray-200)', borderRadius: 6,
                            fontSize: 12, background: '#fff', cursor: canAdmin ? 'pointer' : 'not-allowed',
                          }}>
                          <option value="member">👤 {t('team.member')}</option>
                          <option value="admin">🛡️ {t('team.admin')}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeTeamMember(m.email)}
                          disabled={!canAdmin}
                          style={{
                            background: 'transparent', border: '1px solid #fecaca',
                            color: '#991b1b', padding: '4px 10px', borderRadius: 6,
                            fontSize: 12, fontWeight: 600, cursor: canAdmin ? 'pointer' : 'not-allowed',
                            opacity: canAdmin ? 1 : 0.5,
                          }}>
                          {t('pf.k27')}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rechte-Legende: was darf welche Rolle? */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>{t('pf.k46')}</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>👑🛡️</span>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>{t('pf.k47')}</strong> {t('pf.ownerPerms')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>👤</span>
                  <div style={{ fontSize: 12, color: '#475569' }}>
                    <strong>{t('pf.k48')}</strong> {t('pf.memberPerms')}
                    <span style={{ color: '#94a3b8' }}> {t('pf.memberNoAccess')}</span>
                  </div>
                </div>
              </div>

              {/* Einladungsformular */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  placeholder={t('profile.phMemberEmail')}
                  value={teamInviteEmail}
                  onChange={e => setTeamInviteEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inviteTeamMember() } }}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <select
                  value={teamInviteRole}
                  onChange={e => setTeamInviteRole(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid var(--gray-200)', borderRadius: 8 }}
                >
                  <option value="member">👤 Mitglied</option>
                  <option value="admin">🛡️ Admin</option>
                </select>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={inviteTeamMember}
                  disabled={teamLoading || !canAdmin}
                >
                  {teamLoading
                    ? <><Loader size={14} className="spin" /> {t('pf.k49')}</>
                    : <><Plus size={14} /> {t('pf.k50')}</>}
                </button>
              </div>

              <p className="hint" style={{ marginTop: 10, fontSize: 12 }}>
                {t('team.magicLink')}
              </p>
            </>
          )}
        </div>

        {/* API Integration Section — Pro+ */}
        <div className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Key size={20} style={{ color: 'var(--primary)' }} />
            <h2 style={{ margin: 0 }}>{t('profile.secApi')}</h2>
            {!access.canApiAccess && (
              <span style={{
                background: '#d1fae5', color: '#15803d',
                padding: '2px 10px', borderRadius: 12,
                fontSize: 11, fontWeight: 700,
              }}>⭐ Pro</span>
            )}
          </div>

          {!access.canApiAccess ? (
            <FeatureLock requiredTier="Pro" feature="API & Webhook-Integration" icon="🔌">
              Mit der REST API synchronisierst du deine Produkte direkt aus deinem
              Warenwirtschafts-System. Bestelländerungen werden per Webhook live an
              dein System gemeldet. Verfügbar ab dem <strong>Pro</strong>-Tarif.
            </FeatureLock>
          ) : (
          <>
          <p className="hint" style={{ marginBottom: '16px' }}>
            {t('pf.k51')}
          </p>

          {/* API Key */}
          <div className="form-group">
            <label>{t('profile.apiKey')}</label>
            {apiKey ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  type={apiKeyVisible ? 'text' : 'password'}
                  value={apiKey}
                  readOnly
                  style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem' }}
                  onClick={() => setApiKeyVisible(!apiKeyVisible)}
                />
                <button type="button" className="btn-icon" onClick={copyApiKey} title={t('profile.titleCopy')}>
                  {apiKeyCopied ? <CheckCircle size={16} style={{ color: 'var(--green)' }} /> : <Copy size={16} />}
                </button>
                <button type="button" className="btn-icon" onClick={generateApiKey} title={t('profile.titleRegenerate')} disabled={generatingKey || !canAdmin}>
                  <RefreshCw size={16} className={generatingKey ? 'spin' : ''} />
                </button>
              </div>
            ) : (
              <div>
                <button type="button" className="btn-secondary" onClick={generateApiKey} disabled={generatingKey || !canAdmin}>
                  {generatingKey ? <><Loader size={14} className="spin" /> {t('pf.k52')}</> : <><Key size={14} /> {t('pf.k53')}</>}
                </button>
              </div>
            )}
          </div>

          {/* Webhook URL */}
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Globe size={14} /> {t('pf.k54')}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder={t('profile.phWebhook')}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn-secondary" onClick={saveWebhookUrl} disabled={!canAdmin} style={{ whiteSpace: 'nowrap' }}>
                <Save size={14} /> {t('pf.k55')}
              </button>
            </div>
            <p className="hint" style={{ marginTop: '4px' }}>
              {t('pf.k56')}
            </p>
          </div>

          {/* API Docs Link */}
          {apiKey && (
            <div style={{ marginTop: '12px', padding: '12px', background: 'var(--gray-50)', borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>{t('pf.k57')}</strong>{' '}
              <code style={{ background: 'var(--gray-200)', padding: '2px 6px', borderRadius: '4px' }}>
                POST /functions/v1/products-api
              </code>
              <br /><br />
              <strong>{t('pf.k58')}</strong>{' '}
              <code style={{ background: 'var(--gray-200)', padding: '2px 6px', borderRadius: '4px' }}>
                x-api-key: {apiKeyVisible ? apiKey : '••••••••'}
              </code>
              <br /><br />
              <span style={{ color: 'var(--gray-500)' }}>
                {t('pf.k59')}
              </span>
            </div>
          )}
          </>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={saving || !canAdmin}>
            {saving ? <><Loader size={16} className="spin" /> {t('pf.k60')}</> : <><Save size={16} /> {t('pf.k55')}</>}
          </button>
        </div>
      </form>
    </div>
  )
}
