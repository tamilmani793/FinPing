import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'

// A list whose rows are rearranged by dragging a handle (works with touch and mouse, no library).
//   items       the rows, in their current order
//   getId       (item) => a stable id
//   enabled     false = a plain list, no handles
//   onReorder   (newItems) => called once, when the finger / mouse is released
//   renderItem  (item, { handle, dragging }) => the row; put `handle` inside it (it is null when not enabled)
export default function Sortable({ items, getId, enabled, onReorder, renderItem }) {
  const [drag, setDrag] = useState(null)       // { id, dy, from, to } while a row is held
  const [local, setLocal] = useState(null)     // ids in their new order, between the drop and the saved list arriving
  const wrapRefs = useRef({})
  const session = useRef(null)
  const raf = useRef(0)

  const signature = items.map(getId).join(',')
  useEffect(() => { setLocal(null) }, [signature])
  const shown = local ? local.map(id => items.find(i => getId(i) === id)).filter(Boolean) : items
  const ids = shown.map(getId)

  // The nearest ancestor that scrolls (the screen), so the list can scroll while a row is held near an edge
  const scroller = el => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n
    }
    return document.scrollingElement
  }

  const compute = () => {
    const s = session.current
    if (!s) return
    const dy = s.pointerY - s.startY + (s.scroller.scrollTop - s.startScroll)
    const me = s.rects[s.from]
    const center = me.top + me.height / 2 + dy
    let to = 0
    s.rects.forEach((r, i) => { if (i !== s.from && r.top + r.height / 2 < center) to += 1 })
    s.to = to
    setDrag({ id: s.id, dy, from: s.from, to, shift: s.shift })
  }

  const tick = () => {
    const s = session.current
    if (!s) return
    const top = 70, bottom = window.innerHeight - 110 // the bottom bar floats over the list
    let speed = 0
    if (s.pointerY < top) speed = -Math.min(18, (top - s.pointerY) / 3 + 3)
    else if (s.pointerY > bottom) speed = Math.min(18, (s.pointerY - bottom) / 3 + 3)
    if (speed) { s.scroller.scrollTop += speed; compute() }
    raf.current = requestAnimationFrame(tick)
  }

  const start = (e, id) => {
    if (!enabled) return
    const from = ids.indexOf(id)
    if (from < 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* synthetic events have no pointer to capture */ }
    const els = ids.map(i => wrapRefs.current[i])
    const sc = scroller(els[from])
    // positions in the scroller's own coordinates, so they stay right when it scrolls
    const rects = els.map(el => { const r = el.getBoundingClientRect(); return { top: r.top + sc.scrollTop, height: r.height } })
    const gap = rects.length > 1 ? (from < rects.length - 1 ? rects[from + 1].top - rects[from].top : rects[from].top - rects[from - 1].top) : rects[from].height
    session.current = { id, from, to: from, rects, shift: gap, startY: e.clientY, pointerY: e.clientY, scroller: sc, startScroll: sc.scrollTop }
    setDrag({ id, dy: 0, from, to: from, shift: gap })
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
    e.preventDefault()
  }
  const move = e => { const s = session.current; if (!s) return; s.pointerY = e.clientY; compute() }
  const end = () => {
    const s = session.current
    if (!s) return
    cancelAnimationFrame(raf.current)
    session.current = null
    if (s.to !== s.from) {
      const next = [...ids]
      const [m] = next.splice(s.from, 1)
      next.splice(s.to, 0, m)
      setLocal(next) // show the new order right away; the saved list catches up a moment later
      onReorder(next.map(i => items.find(x => getId(x) === i)))
    }
    setDrag(null)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  useLayoutEffect(() => { if (!enabled) { session.current = null; setDrag(null) } }, [enabled])

  const handleFor = id => enabled ? (
    <div
      onPointerDown={e => start(e, id)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onClick={e => e.stopPropagation()}
      aria-label="Drag to reorder" role="button" data-sort-handle={id}
      style={{ width: 40, height: 40, margin: '-6px -4px -6px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, touchAction: 'none', userSelect: 'none', cursor: 'grab', color: 'var(--txt3)' }}>
      <GripVertical size={20} />
    </div>
  ) : null

  return (
    <>
      {shown.map((item, i) => {
        const id = getId(item)
        const dragging = drag?.id === id
        let ty = 0
        if (drag && !dragging) {
          if (drag.from < i && i <= drag.to) ty = -drag.shift
          else if (drag.to <= i && i < drag.from) ty = drag.shift
        }
        return (
          <div key={id} ref={el => { wrapRefs.current[id] = el }}
            style={{
              position: 'relative', zIndex: dragging ? 5 : 0,
              transform: dragging ? `translateY(${drag.dy}px) scale(1.02)` : ty ? `translateY(${ty}px)` : undefined,
              transition: dragging ? 'none' : drag ? 'transform .16s ease' : undefined,
              boxShadow: dragging ? '0 14px 30px rgba(0,0,0,.22)' : undefined, borderRadius: 14,
            }}>
            {renderItem(item, { handle: handleFor(id), dragging })}
          </div>
        )
      })}
    </>
  )
}

// The small pill that switches a list into drag-to-reorder mode and back
export function ReorderToggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ height: 28, padding: '0 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--gold-border)', background: on ? 'var(--gold-grad)' : 'var(--gold-bg)', color: on ? 'var(--on-accent)' : 'var(--gold-dim)' }}>
      {on ? 'Done' : '⇅ Reorder'}
    </button>
  )
}
