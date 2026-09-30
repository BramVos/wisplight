import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PlanData } from '../../engine/plan'
import { t, tn } from './i18n'
import { useWindow } from './windows'

// The plan of here (M10.29 I; the board "Wisplight plattegrond van hier"):
// above the map in the side panel, 300 by 220, the places of this settlement
// the stranger knows, from the engine's data. Where you are is filled, a place
// only heard of is grey with a question mark, a way not taken is a dashed
// stub; people you know are dots in their own colour. A click on a place you
// have seen walks there. Since M10.31 (Bram: the plan does not scroll and is
// hard to see) it also opens as a window about twice the size, with the whole
// area in it; where the area does not fit, the plan moves with the wheel and
// by dragging, and Home or the button puts where you are back in the middle.

const SMALL = { w: 300, h: 220 }
const LARGE = { w: 640, h: 460 }
/** Up to this many places the small plan fits the panel; beyond, it moves with where you are. */
const FITS = 9
const CELL = { w: 100, h: 73 }
/** How far the area may be moved past the edge of the view. */
const SLACK = 24

const STUB: Record<string, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
  northeast: [0.7, -0.7],
  northwest: [-0.7, -0.7],
  southeast: [0.7, 0.7],
  southwest: [-0.7, 0.7],
}

/** A name in at most two lines of so many letters; else one size smaller, cut short (the whole name on hovering). */
function lines(name: string, perLine: number): { rows: string[]; small: boolean } {
  const wrap = (width: number) => {
    const rows: string[] = []
    for (const word of name.split(/\s+/)) {
      const last = rows.at(-1)
      if (last !== undefined && `${last} ${word}`.length <= width) rows[rows.length - 1] = `${last} ${word}`
      else rows.push(word)
    }
    return rows
  }
  const normal = wrap(perLine)
  if (normal.length <= 2 && normal.every((r) => r.length <= perLine)) return { rows: normal, small: false }
  const smaller = wrap(Math.round(perLine * 1.2))
  if (smaller.length <= 2 && smaller.every((r) => r.length <= Math.round(perLine * 1.2))) return { rows: smaller, small: true }
  const width = Math.round(perLine * 1.2)
  const first = smaller[0]!.slice(0, width)
  const rest = smaller.slice(1).join(' ')
  return { rows: [first, rest.length > width ? `${rest.slice(0, width - 3)}...` : rest], small: true }
}

/**
 * Where the plan lies in its view (M10.31 A): the size of a place, whether
 * the whole area fits, and how far it is moved. The small plan fits up to
 * nine places; the window fits the whole area while the places stay readable.
 * An area that does not fit starts with where you are in the middle, and is
 * moved by `pan`, never further than a little past its edge.
 */
export function planLayout(plan: PlanData, large: boolean, pan: { x: number; y: number }): { view: { w: number; h: number }; cell: { w: number; h: number }; fits: boolean; shift: { x: number; y: number } } {
  const view = large ? LARGE : SMALL
  const cols = Math.max(...plan.boxes.map((b) => b.col)) + 1
  const rows = Math.max(...plan.boxes.map((b) => b.row)) + 1
  const here = plan.boxes.find((b) => b.kind === 'here')
  const fitted = { w: Math.min(CELL.w * (large ? 1.2 : 1), view.w / cols), h: Math.min(CELL.h * (large ? 1.2 : 1), view.h / rows) }
  const fits = large ? fitted.w >= CELL.w * 0.75 && fitted.h >= CELL.h * 0.75 : plan.boxes.length <= FITS
  const cell = fits ? fitted : CELL
  const area = { w: cols * cell.w, h: rows * cell.h }
  const base = !fits && here ? { x: view.w / 2 - (here.col + 0.5) * cell.w, y: view.h / 2 - (here.row + 0.5) * cell.h } : { x: (view.w - area.w) / 2, y: (view.h - area.h) / 2 }
  const clamp = (v: number, size: number, room: number) => Math.min(SLACK, Math.max(Math.min(0, room - size) - SLACK, v))
  const shift = fits ? base : { x: clamp(base.x + pan.x, area.w, view.w), y: clamp(base.y + pan.y, area.h, view.h) }
  return { view, cell, fits, shift }
}

/**
 * The plan, small in the side panel or large in its window. onOpen: a click
 * on the small plan outside a place opens the window; onClose: Esc closes it.
 */
export function PlanView({ plan, onWalk, large = false, onOpen, onClose }: { plan: PlanData; onWalk?: (command: string) => void; large?: boolean; onOpen?: () => void; onClose?: () => void }) {
  const here = plan.boxes.find((b) => b.kind === 'here')
  // Moved by the wheel or by dragging, from where you are in the middle; back when you move or ask.
  const [pan, setPan] = useState({ x: 0, y: 0 })
  useEffect(() => setPan({ x: 0, y: 0 }), [here?.id, large])
  const { view, cell, fits, shift } = planLayout(plan, large, pan)
  const box = { w: cell.w - 18, h: Math.max(26, cell.h - 30) }
  const centre = (b: { col: number; row: number }) => ({ x: shift.x + (b.col + 0.5) * cell.w, y: shift.y + (b.row + 0.5) * cell.h })
  const at = new Map(plan.boxes.map((b) => [b.id, b]))

  // The wheel moves an area that does not fit (a native listener: React's wheel handler cannot stop the page scrolling).
  const svg = useRef<SVGSVGElement>(null)
  const moveBy = useRef((dx: number, dy: number) => setPan((p) => ({ x: p.x - dx, y: p.y - dy })))
  useEffect(() => {
    const el = svg.current
    if (!el || fits) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const scale = view.w / el.getBoundingClientRect().width
      moveBy.current((event.shiftKey ? event.deltaY : event.deltaX) * scale, (event.shiftKey ? 0 : event.deltaY) * scale)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [fits, view.w])

  // Dragging moves it too; a drag is no click on a place.
  const drag = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined)
  const dragged = useRef(false)
  const onDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (fits || event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, moved: false }
    dragged.current = false
  }
  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const dx = event.clientX - d.x
    const dy = event.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) event.currentTarget.setPointerCapture(event.pointerId)
    d.moved = true
    dragged.current = true
    const scale = view.w / event.currentTarget.getBoundingClientRect().width
    moveBy.current(-dx * scale, -dy * scale)
    d.x = event.clientX
    d.y = event.clientY
  }
  const onUp = () => {
    drag.current = undefined
  }

  // A window of the stack while large (M10.33 A): Escape closes it when it is on top.
  useWindow(() => onClose?.(), large && Boolean(onClose))
  // In the window: Home puts where you are back in the middle, Esc closes it.
  useEffect(() => {
    if (!large) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Home') {
        event.preventDefault()
        setPan({ x: 0, y: 0 })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [large, onClose])

  const perLine = Math.max(6, Math.floor(box.w / 6.2))
  return (
    <figure className={`plan${large ? ' plan-large' : ''}${fits ? '' : ' plan-moves'}`} aria-label={t('app.plan.label', { name: plan.area })}>
      <svg
        ref={svg}
        viewBox={`0 0 ${view.w} ${view.h}`}
        width={view.w}
        height={view.h}
        role="img"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(event) => {
          // A click on the small plan outside a place opens the window (M10.31).
          if (!large && onOpen && !dragged.current && !(event.target as Element).closest('.plan-place.walkable')) onOpen()
        }}
      >
        {plan.links.map((link) => {
          const a = centre(at.get(link.from)!)
          const b = centre(at.get(link.to)!)
          return <line key={`${link.from}-${link.to}`} className="plan-way" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
        {plan.stubs.map((stub) => {
          const c = centre(at.get(stub.from)!)
          const [dx, dy] = STUB[stub.direction] ?? [0, 0]
          const from = { x: c.x + dx * (box.w / 2), y: c.y + dy * (box.h / 2) }
          return <line key={`${stub.from}-${stub.direction}`} className="plan-stub" x1={from.x} y1={from.y} x2={from.x + dx * 16} y2={from.y + dy * 16} />
        })}
        {plan.boxes.map((b) => {
          const c = centre(b)
          const name = lines(b.name, perLine)
          const walk = b.kind === 'seen' && onWalk ? () => !dragged.current && onWalk(`walk to ${b.name}`) : undefined
          return (
            <g key={b.id} className={`plan-place ${b.kind}${walk ? ' walkable' : ''}`} onClick={walk} role={walk ? 'button' : undefined} aria-label={walk ? t('app.plan.walk', { name: b.name }) : b.name}>
              <title>{b.kind === 'heard' ? t('app.plan.heard', { name: b.name }) : b.name}</title>
              <rect x={c.x - box.w / 2} y={c.y - box.h / 2} width={box.w} height={box.h} rx={3} />
              {name.rows.map((row, i) => (
                <text key={i} x={c.x} y={c.y + (i - (name.rows.length - 1) / 2) * (name.small ? 10 : 11) + 3.5} className={name.small ? 'small' : undefined}>
                  {b.kind === 'heard' && i === name.rows.length - 1 ? `${row} ?` : row}
                </text>
              ))}
              {b.words.length > 0 && (
                <text x={c.x + box.w / 2 - 2} y={c.y + box.h / 2 + 9} className="plan-word">
                  {b.words.join(' ')}
                </text>
              )}
              {b.people.map((p, i) => (
                <circle key={p.id} cx={c.x - box.w / 2 + 6 + i * 9} cy={c.y - box.h / 2} r={3.5} fill={p.colour} className="plan-person">
                  <title>{p.name}</title>
                </circle>
              ))}
            </g>
          )
        })}
      </svg>
      {(large || !fits) && (
        <figcaption className="muted small plan-caption">
          {tn('app.plan.known', plan.known)}
          {!fits && (
            <>
              {' '}
              {t('app.plan.moves')}{' '}
              <button type="button" className="link" onClick={() => setPan({ x: 0, y: 0 })} title={t('app.plan.centreTitle')}>
                [{t('app.plan.centre')}]
              </button>
            </>
          )}
        </figcaption>
      )}
    </figure>
  )
}
