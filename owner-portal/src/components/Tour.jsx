import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HelpCircle, X } from 'lucide-react'

// Kleine geführte Tour mit Coach-Marks: hebt Buttons hervor und erklärt kurz,
// was dahinter steckt (inkl. Hinweise, wo überall KI genutzt werden kann).
// Kein externes Paket. Ziel-Elemente per [data-tour="..."] (Navigation).

const STEPS = [
  { title: 'Willkommen bei Skipily 👋',
    text: 'Kurze Tour? Ich zeige dir in 30 Sekunden, was hinter den wichtigsten Buttons steckt — und wo überall die KI hilft.' },
  { title: 'Warum Skipily? ⛵',
    text: 'Alles rund um dein Boot an einem Ort: Boote, Ausrüstung und Wartung verwalten · rechtzeitig an fällige Wartungen erinnert werden · europaweit passende Betriebe finden und anfragen · Ersatzteile und Zubehör kaufen (sichere Zahlung) · Angebote einholen und vergleichen — und die KI, die all das für dich schneller macht.' },
  { target: '[data-tour="/map"]', title: 'Karte',
    text: 'Finde Marinas, Werften und Service-Betriebe in deiner Nähe.' },
  { target: '[data-tour="/boats"]', title: 'Boote',
    text: 'Lege deine Boote an. Alle weiteren Daten (Ausrüstung, Wartung) hängen daran.' },
  { target: '[data-tour="/equipment"]', title: 'Ausrüstung 🤖',
    text: 'Erfasse deine Ausrüstung. Die KI schlägt dir hier passende Ausrüstung und Ersatzteile vor.' },
  { target: '[data-tour="/maintenance"]', title: 'Wartung',
    text: 'Behalte fällige Wartungen im Blick und plane Service rechtzeitig.' },
  { target: '[data-tour="/shop"]', title: 'Shop',
    text: 'Ersatzteile und Zubehör direkt kaufen — passend zu deiner Ausrüstung.' },
  { target: '[data-tour="/services"]', title: 'Service-Suche',
    text: 'Passende Betriebe finden — mehrsprachig und schlau: „tauwerk" findet auch Rigger, Segelmacher und Zubehörhändler.' },
  { target: '[data-tour="/inquiries"]', title: 'Anfragen',
    text: 'Sende eine unverbindliche Anfrage oder eine Bitte um ein Angebot an Betriebe. Angebote kannst du hier annehmen und sicher bezahlen.' },
  { target: '[data-tour="/chat"]', title: 'KI-Chat 🤖',
    text: 'Frag die KI alles rund um dein Boot: Wartung, Technik, Kaufberatung. Deine ersten Fragen sind gratis.' },
  { title: 'Dein Vorteil mit der Skipily-KI ⚡',
    text: 'Die KI kennt Boote und spart dir das Suchen: Sie erklärt Technik verständlich, empfiehlt die richtige Wartung, findet das passende Ersatzteil und den passenden Betrieb — in Sekunden statt Stunden. Und sie kennt deine Boots- und Ausrüstungsdaten, antwortet also konkret auf DEIN Boot.' },
  { title: 'Wo überall KI? 🤖',
    text: 'An drei Stellen: (1) KI-Chat, (2) Ausrüstungs-Vorschläge, (3) Ersatzteil-Suche. Einfach ausprobieren.' },
  { title: 'Mehr Power mit Skipily Plus 💎',
    text: 'Kostenlos startest du mit ein paar KI-Fragen. Mit Skipily Plus bekommst du deutlich mehr Fragen pro Tag und das stärkere KI-Modell — präzisere, ausführlichere Antworten für kniffligere Bootsfragen.',
    cta: { label: 'Skipily Plus ansehen', to: '/plus' } },
]

const DONE_KEY = 'skipily_tour_done_v1'

export default function Tour() {
  const navigate = useNavigate()
  const [active, setActive] = useState(false)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState(null)
  const boxRef = useRef(null)

  // Beim ersten Besuch automatisch starten.
  useEffect(() => {
    let done = false
    try { done = localStorage.getItem(DONE_KEY) === '1' } catch { /* ignore */ }
    if (!done) {
      const t = setTimeout(() => setActive(true), 900)
      return () => clearTimeout(t)
    }
  }, [])

  const step = active ? STEPS[i] : null

  // Zielposition berechnen (und bei Resize/Scroll aktualisieren).
  useLayoutEffect(() => {
    if (!step) return
    const measure = () => {
      if (!step.target) { setRect(null); return }
      const el = document.querySelector(step.target)
      if (el) {
        el.scrollIntoView({ block: 'nearest' })
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else { setRect(null) }
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [step, i])

  const finish = () => {
    try { localStorage.setItem(DONE_KEY, '1') } catch { /* ignore */ }
    setActive(false); setI(0)
  }
  const next = () => { if (i < STEPS.length - 1) setI(i + 1); else finish() }
  const prev = () => { if (i > 0) setI(i - 1) }

  // Floating-Hilfe-Button (Tour jederzeit neu starten).
  const HelpButton = (
    <button aria-label="Tour starten" onClick={() => { setI(0); setActive(true) }}
      style={{ position: 'fixed', right: 18, bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))', zIndex: 1400, width: 46, height: 46,
        borderRadius: '50%', border: 'none', background: 'var(--primary, #0a6cff)', color: '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.2)', cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center' }}>
      <HelpCircle size={22} />
    </button>
  )

  if (!active) return HelpButton

  // Tooltip-Position: neben dem Ziel, sonst zentriert.
  const pad = 8
  let tip
  if (rect) {
    const below = rect.top + rect.height + 320 < window.innerHeight
    tip = {
      left: Math.min(Math.max(12, rect.left), window.innerWidth - 340),
      top: below ? rect.top + rect.height + 12 : Math.max(12, rect.top - 12 - 180),
    }
  }

  return (
    <>
      {HelpButton}
      {/* Backdrop mit Spotlight um das Ziel (box-shadow-Trick) */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1500, pointerEvents: 'auto' }}
           onClick={(e) => { if (e.target === e.currentTarget) next() }}>
        {rect ? (
          <div style={{ position: 'fixed', top: rect.top - pad, left: rect.left - pad,
            width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 10,
            boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)', border: '2px solid #fff', pointerEvents: 'none' }} />
        ) : (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.62)', pointerEvents: 'none' }} />
        )}

        {/* Tooltip-Karte */}
        <div ref={boxRef} onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', width: 320, maxWidth: '92vw', background: '#fff', borderRadius: 14,
            padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
            ...(rect ? tip : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' }) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <strong style={{ fontSize: 16 }}>{step.title}</strong>
            <button onClick={finish} aria-label="Schließen"
              style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#334155', margin: '0 0 14px' }}>{step.text}</p>
          {step.cta && (
            <button onClick={() => { finish(); navigate(step.cta.to) }}
              style={{ width: '100%', marginBottom: 12, padding: '10px 14px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(90deg,#7c3aed,#0a6cff)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              {step.cta.label}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>{i + 1} / {STEPS.length}</span>
            <span style={{ marginLeft: 'auto' }} />
            <button onClick={finish} style={{ border: 'none', background: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>Überspringen</button>
            {i > 0 && (
              <button onClick={prev} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 13 }}>Zurück</button>
            )}
            <button onClick={next} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--primary, #0a6cff)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {i === STEPS.length - 1 ? 'Fertig' : 'Weiter'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
