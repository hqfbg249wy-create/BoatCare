import { useState, useRef, useEffect } from 'react'

// Vollbild-Bildbetrachter mit Pinch-/Wheel-Zoom, Pan, Doppeltipp-Zoom und
// Esc/Klick zum Schliessen. Gemeinsam genutzt von News und Ausruestung.
//
// iOS-Safari-Hinweis: React-Touch-Handler sind PASSIV -> preventDefault wirkt
// nicht, und iOS macht seinen eigenen Seiten-Pinch-Zoom. Darum registrieren wir
// die Touch-/Wheel-/Gesture-Listener selbst als NICHT-passiv (ref + useEffect)
// und unterdruecken die Browser-Gesten mit preventDefault.
export default function Lightbox({ url, onClose }) {
  const [tr, setTr] = useState({ s: 1, x: 0, y: 0 })
  const trRef = useRef(tr)
  const g = useRef({ mode: null, startDist: 0, startS: 1, lx: 0, ly: 0 })
  const rootRef = useRef(null)

  // State + Spiegel-Ref gemeinsam setzen (Listener lesen trRef.current).
  const apply = (updater) => setTr(prev => {
    const next = typeof updater === 'function' ? updater(prev) : updater
    trRef.current = next
    return next
  })

  useEffect(() => { trRef.current = tr }, [tr])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const distOf = (ts) => Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY)

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        g.current.mode = 'pinch'
        g.current.startDist = distOf(e.touches)
        g.current.startS = trRef.current.s
      } else if (e.touches.length === 1 && trRef.current.s > 1) {
        g.current.mode = 'pan'
        g.current.lx = e.touches[0].clientX
        g.current.ly = e.touches[0].clientY
      } else {
        g.current.mode = null
      }
    }
    const onTouchMove = (e) => {
      if (g.current.mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault()
        const s = Math.min(5, Math.max(1, g.current.startS * (distOf(e.touches) / (g.current.startDist || 1))))
        apply(p => ({ ...p, s }))
      } else if (g.current.mode === 'pan' && e.touches.length === 1) {
        e.preventDefault()
        const dx = e.touches[0].clientX - g.current.lx
        const dy = e.touches[0].clientY - g.current.ly
        g.current.lx = e.touches[0].clientX
        g.current.ly = e.touches[0].clientY
        apply(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
      }
    }
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        g.current.mode = null
        if (trRef.current.s <= 1) apply({ s: 1, x: 0, y: 0 })
      }
    }
    const onWheel = (e) => {
      e.preventDefault()
      const s = Math.min(5, Math.max(1, trRef.current.s - e.deltaY * 0.002))
      apply(p => ({ ...p, s, ...(s <= 1 ? { x: 0, y: 0 } : {}) }))
    }
    // Safari-eigene Pinch-Gesten blocken (sonst zoomt die Seite).
    const blockGesture = (e) => e.preventDefault()

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: false })
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', blockGesture, { passive: false })
    el.addEventListener('gesturechange', blockGesture, { passive: false })
    el.addEventListener('gestureend', blockGesture, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', blockGesture)
      el.removeEventListener('gesturechange', blockGesture)
      el.removeEventListener('gestureend', blockGesture)
    }
  }, [])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const onDbl = () => apply(p => (p.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))

  // Maus-Panning (Desktop): bei gezoomtem Bild mit gedrueckter Maustaste
  // verschieben, damit auch der rechte/untere Bildbereich erreichbar ist.
  const mouse = useRef({ down: false, lx: 0, ly: 0, moved: false })
  const onMouseDown = (e) => {
    if (trRef.current.s <= 1) return
    e.preventDefault()
    mouse.current = { down: true, lx: e.clientX, ly: e.clientY, moved: false }
  }
  const onMouseMove = (e) => {
    if (!mouse.current.down) return
    const dx = e.clientX - mouse.current.lx, dy = e.clientY - mouse.current.ly
    if (Math.abs(dx) + Math.abs(dy) > 2) mouse.current.moved = true
    mouse.current.lx = e.clientX; mouse.current.ly = e.clientY
    apply(p => ({ ...p, x: p.x + dx, y: p.y + dy }))
  }
  const endMouse = () => { mouse.current.down = false }
  // Klick auf das Bild schliesst nie (stopPropagation); nach einem Drag ebenfalls nicht.
  const onImgClick = (e) => { e.stopPropagation() }

  return (
    <div ref={rootRef} onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', overflow: 'hidden' }}>
      <button onClick={onClose} aria-label="close"
        style={{ position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 20, cursor: 'pointer', zIndex: 2 }}>✕</button>
      <img src={url} alt="" draggable={false}
        onClick={onImgClick} onDoubleClick={onDbl}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={endMouse} onMouseLeave={endMouse}
        style={{ maxWidth: '100%', maxHeight: '100%', cursor: tr.s > 1 ? 'grab' : 'auto', transform: `translate(${tr.x}px, ${tr.y}px) scale(${tr.s})`, transition: (g.current.mode || mouse.current.down) ? 'none' : 'transform 0.15s ease', touchAction: 'none', userSelect: 'none', willChange: 'transform' }} />
    </div>
  )
}
