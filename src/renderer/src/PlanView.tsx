import type { PlanData } from '../../engine/plan'
import { t, tn } from './i18n'

// The plan of here (M10.29 I; the board "Wisplight plattegrond van hier"):
// above the map in the side panel, 300 by 220, the places of this settlement
// the stranger knows, from the engine's data. Where you are is filled, a place
// only heard of is grey with a question mark, a way not taken is a dashed
// stub; people you know are dots in their own colour. A click on a place you
// have seen walks there.

const WIDTH = 300
const HEIGHT = 220
/** Up to this many places the plan fits the panel; beyond, it moves with where you are. */
const FITS = 9
const CELL = { w: 100, h: 73 }

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

export function PlanView({ plan, onWalk }: { plan: PlanData; onWalk?: (command: string) => void }) {
  const cols = Math.max(...plan.boxes.map((b) => b.col)) + 1
  const rows = Math.max(...plan.boxes.map((b) => b.row)) + 1
  const here = plan.boxes.find((b) => b.kind === 'here')
  // Up to nine places fit the panel; more, and the plan keeps where you are in the middle.
  const moving = plan.boxes.length > FITS
  const cell = moving ? CELL : { w: Math.min(CELL.w, WIDTH / cols), h: Math.min(CELL.h, HEIGHT / rows) }
  const shift = moving && here ? { x: WIDTH / 2 - (here.col + 0.5) * cell.w, y: HEIGHT / 2 - (here.row + 0.5) * cell.h } : { x: (WIDTH - cols * cell.w) / 2, y: (HEIGHT - rows * cell.h) / 2 }
  const box = { w: cell.w - 18, h: Math.max(26, cell.h - 30) }
  const centre = (b: { col: number; row: number }) => ({ x: shift.x + (b.col + 0.5) * cell.w, y: shift.y + (b.row + 0.5) * cell.h })
  const at = new Map(plan.boxes.map((b) => [b.id, b]))
  return (
    <figure className="plan" aria-label={t('app.plan.label', { name: plan.area })}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img">
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
          const name = lines(b.name, Math.max(6, Math.floor(box.w / 6.2)))
          const walk = b.kind === 'seen' && onWalk ? () => onWalk(`walk to ${b.name}`) : undefined
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
      {moving && <figcaption className="muted small">{tn('app.plan.known', plan.known)}</figcaption>}
    </figure>
  )
}
