import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useT } from '../i18n'
import { HelpCircle, ChevronDown, FileText, ExternalLink } from 'lucide-react'

const LANGS = [
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'nl', label: 'Nederlands' },
]

// Kategorie-Reihenfolge + Überschriften je Sprache (Fallback: DE)
const CATEGORY_ORDER = [
  'offering', 'csv', 'api', 'team', 'security', 'payment',
  'orders_shipping', 'market_analysis', 'commission', 'advantages',
]
const CATEGORY_LABELS = {
  offering:        { de: 'Was wir bieten', en: 'What we offer', fr: 'Notre offre', it: 'Cosa offriamo', es: 'Qué ofrecemos', nl: 'Wat wij bieden' },
  csv:             { de: 'CSV-Produktimport', en: 'CSV product import', fr: 'Import de produits CSV', it: 'Importazione prodotti CSV', es: 'Importación de productos CSV', nl: 'CSV-productimport' },
  api:             { de: 'API / Schnittstelle / Webhook', en: 'API / interface / webhook', fr: 'API / interface / webhook', it: 'API / interfaccia / webhook', es: 'API / interfaz / webhook', nl: 'API / koppeling / webhook' },
  team:            { de: 'Teammitglieder', en: 'Team members', fr: 'Membres de l’équipe', it: 'Membri del team', es: 'Miembros del equipo', nl: 'Teamleden' },
  security:        { de: 'Sicherheit & Login', en: 'Security & login', fr: 'Sécurité & connexion', it: 'Sicurezza & accesso', es: 'Seguridad e inicio de sesión', nl: 'Beveiliging & inloggen' },
  payment:         { de: 'Zahlungen, Rechnung & Abrechnung', en: 'Payments, invoicing & payouts', fr: 'Paiements, facturation & règlements', it: 'Pagamenti, fatturazione & liquidazioni', es: 'Pagos, facturación y liquidación', nl: 'Betalingen, facturatie & uitbetaling' },
  orders_shipping: { de: 'Bestellung & Versand', en: 'Orders & shipping', fr: 'Commandes & expédition', it: 'Ordini & spedizione', es: 'Pedidos y envío', nl: 'Bestelling & verzending' },
  market_analysis: { de: 'Marktanalyse nutzen', en: 'Using market analysis', fr: 'Utiliser l’analyse de marché', it: 'Usare l’analisi di mercato', es: 'Usar el análisis de mercado', nl: 'Marktanalyse gebruiken' },
  commission:      { de: 'Provision & Pakete', en: 'Commission & plans', fr: 'Commission & forfaits', it: 'Commissione & pacchetti', es: 'Comisión y paquetes', nl: 'Commissie & pakketten' },
  advantages:      { de: 'Marktvorteile Skipily', en: 'Skipily advantages', fr: 'Avantages Skipily', it: 'Vantaggi Skipily', es: 'Ventajas de Skipily', nl: 'Skipily-voordelen' },
}
// Anleitungen als PDF (in provider-portal/public/anleitungen). DE + EN vorhanden;
// übrige Sprachen fallen auf EN zurück (Sendcloud nur DE).
const GUIDES = [
  { key: 'basics', icon: '📘',
    title: { de: 'Anbindung – Grundlagen', en: 'Integration basics', fr: 'Bases de l’intégration', it: 'Basi dell’integrazione', es: 'Fundamentos de la integración', nl: 'Integratie – basis' },
    file: { de: '/anleitungen/00-Skipily-Anbindung-Grundlagen.pdf', en: '/anleitungen/en/00-Skipily-Integration-Basics.pdf' } },
  { key: 'woo', icon: '🛒',
    title: { de: 'WooCommerce anbinden', en: 'Connect WooCommerce', fr: 'Connecter WooCommerce', it: 'Collegare WooCommerce', es: 'Conectar WooCommerce', nl: 'WooCommerce koppelen' },
    file: { de: '/anleitungen/01-WooCommerce.pdf', en: '/anleitungen/en/01-WooCommerce.pdf' } },
  { key: 'shopify', icon: '🛍️',
    title: { de: 'Shopify anbinden', en: 'Connect Shopify', fr: 'Connecter Shopify', it: 'Collegare Shopify', es: 'Conectar Shopify', nl: 'Shopify koppelen' },
    file: { de: '/anleitungen/02-Shopify.pdf', en: '/anleitungen/en/02-Shopify.pdf' } },
  { key: 'odoo', icon: '🧩',
    title: { de: 'Odoo / ERP anbinden', en: 'Connect Odoo / ERP', fr: 'Connecter Odoo / ERP', it: 'Collegare Odoo / ERP', es: 'Conectar Odoo / ERP', nl: 'Odoo / ERP koppelen' },
    file: { de: '/anleitungen/03-Odoo-ERP.pdf', en: '/anleitungen/en/03-Odoo-ERP.pdf' } },
  { key: 'sendcloud', icon: '🚚',
    title: { de: 'Sendcloud-Versand', en: 'Sendcloud shipping', fr: 'Expédition Sendcloud', it: 'Spedizioni Sendcloud', es: 'Envíos con Sendcloud', nl: 'Sendcloud-verzending' },
    file: { de: '/anleitungen/04-Sendcloud-Versand.pdf', en: '/anleitungen/en/04-Sendcloud-Shipping.pdf' } },
]
const GUIDES_UI = {
  title: { de: 'Anleitungen & Downloads', en: 'Guides & downloads', fr: 'Guides & téléchargements', it: 'Guide & download', es: 'Guías y descargas', nl: 'Handleidingen & downloads' },
  sub:   { de: 'Schritt-für-Schritt-PDFs für die Anbindung deiner Systeme.', en: 'Step-by-step PDFs for connecting your systems.', fr: 'PDF pas à pas pour connecter vos systèmes.', it: 'PDF passo-passo per collegare i tuoi sistemi.', es: 'PDF paso a paso para conectar tus sistemas.', nl: 'Stap-voor-stap-PDF’s om je systemen te koppelen.' },
  open:  { de: 'PDF öffnen', en: 'Open PDF', fr: 'Ouvrir le PDF', it: 'Apri PDF', es: 'Abrir PDF', nl: 'PDF openen' },
}
const guideUrl = (g, lang) => g.file[lang] || g.file.en || g.file.de

const UI = {
  title:    { de: 'Hilfe & FAQ', en: 'Help & FAQ', fr: 'Aide & FAQ', it: 'Aiuto & FAQ', es: 'Ayuda y FAQ', nl: 'Help & FAQ' },
  subtitle: { de: 'Antworten auf häufige Fragen rund um dein Anbieter-Konto.', en: 'Answers to common questions about your provider account.', fr: 'Réponses aux questions fréquentes sur votre compte fournisseur.', it: 'Risposte alle domande frequenti sul tuo account fornitore.', es: 'Respuestas a preguntas frecuentes sobre tu cuenta de proveedor.', nl: 'Antwoorden op veelgestelde vragen over je aanbiederaccount.' },
  empty:    { de: 'Noch keine FAQ-Einträge.', en: 'No FAQ entries yet.', fr: 'Aucune entrée FAQ.', it: 'Nessuna voce FAQ.', es: 'Aún no hay entradas.', nl: 'Nog geen FAQ-items.' },
}

function pick(map, lang) { return map[lang] || map.de }

// Quell-Sprache (DE) + translations jsonb → {question, answer} in gewünschter Sprache
function localized(faq, lang) {
  if (lang === 'de') return { question: faq.question, answer: faq.answer }
  const t = (faq.translations || {})[lang] || {}
  return {
    question: t.question || faq.question,
    answer: t.answer || faq.answer,
  }
}

export default function Help() {
  // Sprache folgt der GLOBALEN App-Sprache (ein Umschalter für UI + FAQ-Inhalte).
  const { lang } = useT()
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState({}) // id -> bool

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('provider_faqs')
        .select('id, category, question, answer, translations, sort_order')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
      if (active) { setFaqs(data || []); setLoading(false) }
    })()
    return () => { active = false }
  }, [])

  const grouped = useMemo(() => {
    const g = {}
    for (const f of faqs) (g[f.category] ||= []).push(f)
    return g
  }, [faqs])

  const cats = CATEGORY_ORDER.filter(c => grouped[c]?.length)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HelpCircle size={26} />
          <h1 style={{ margin: 0 }}>{pick(UI.title, lang)}</h1>
        </div>
      </div>
      <p style={{ color: '#64748b', marginTop: 0 }}>{pick(UI.subtitle, lang)}</p>

      {/* Anleitungen & Downloads (PDF) */}
      <section style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={20} style={{ color: '#f97316' }} />
          <h2 style={{ fontSize: 17, margin: 0 }}>{pick(GUIDES_UI.title, lang)}</h2>
        </div>
        <p style={{ color: '#64748b', margin: '4px 0 12px', fontSize: 14 }}>{pick(GUIDES_UI.sub, lang)}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {GUIDES.map(g => (
            <a key={g.key} href={guideUrl(g, lang)} target="_blank" rel="noopener noreferrer"
               style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ fontSize: 22 }}>{g.icon}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{pick(g.title, lang)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#f97316' }}>
                  {pick(GUIDES_UI.open, lang)} <ExternalLink size={12} />
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {loading && <p style={{ color: '#94a3b8', marginTop: 24 }}>…</p>}
      {!loading && cats.length === 0 && <p style={{ color: '#94a3b8' }}>{pick(UI.empty, lang)}</p>}

      {cats.map(cat => (
        <section key={cat} style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>{pick(CATEGORY_LABELS[cat] || { de: cat }, lang)}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grouped[cat].map(faq => {
              const { question, answer } = localized(faq, lang)
              const isOpen = !!open[faq.id]
              return (
                <div key={faq.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpen(o => ({ ...o, [faq.id]: !o[faq.id] }))}
                    style={{ width: '100%', textAlign: 'left', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontWeight: 600, fontSize: 15 }}
                  >
                    <span>{question}</span>
                    <ChevronDown size={18} style={{ flexShrink: 0, transition: 'transform .15s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                      {answer}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
