import { useRef } from 'react'

// Horizontal scrollbarer Streifen, der sich auch mit der MAUS ziehen laesst
// ("hin und her schieben"). Touch-Scrollen bleibt nativ erhalten. Verhindert,
// dass ein Klick (z. B. Zoom) ausgeloest wird, wenn gerade gezogen wurde.
export default function DragScroll({ children, style, className }) {
  const ref = useRef(null)
  const st = useRef({ down: false, x: 0, left: 0, moved: false })

  const onDown = (e) => {
    const el = ref.current
    if (!el) return
    st.current = { down: true, x: e.pageX, left: el.scrollLeft, moved: false }
  }
  const onMove = (e) => {
    const el = ref.current
    if (!el || !st.current.down) return
    const dx = e.pageX - st.current.x
    if (Math.abs(dx) > 3) st.current.moved = true
    el.scrollLeft = st.current.left - dx
  }
  const end = () => { st.current.down = false }
  // Nach einem Drag den folgenden Klick (Zoom) unterdruecken.
  const onClickCapture = (e) => {
    if (st.current.moved) { e.stopPropagation(); e.preventDefault(); st.current.moved = false }
  }

  return (
    <div ref={ref} className={className}
      style={{ overflowX: 'auto', cursor: 'grab', WebkitOverflowScrolling: 'touch', ...style }}
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={end} onMouseLeave={end}
      onClickCapture={onClickCapture}>
      {children}
    </div>
  )
}
