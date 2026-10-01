import { knownName } from './acquaintance'
import { personColour } from './colour'
import type { Direction } from './content'
import type { World } from './world'
import { exitShown, shownExits } from './exits'

// A plan of here (M10.29 I; set out with Bram on 29 September 2026, the board
// "Wisplight plattegrond van hier"): the places of this settlement the
// stranger has seen or heard of, laid out from the directions of the exits
// with north up, and the ways between them. Only data: the interface draws
// it, the terminal and the journal get it as text. No model.

/** Kinds of area that are a settlement: a plan is drawn only there. */
const SETTLED = new Set(['village', 'town', 'city', 'hamlet', 'inn'])

/** A step on the plan per compass direction; in, out, up and down are words at a box's edge. */
const STEP: Partial<Record<Direction, [number, number]>> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
  northeast: [1, -1],
  northwest: [-1, -1],
  southeast: [1, 1],
  southwest: [-1, 1],
}

/** Where a place reached by in, out, up or down goes when it must go somewhere: the first free cell of these. */
const ASIDE: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
]

export interface PlanPerson {
  id: string
  name: string
  colour: string
  /** Seen here now (a filled dot), or last seen here (a hollow one, M10.33 I). */
  now: boolean
  /** How long ago, for a hollow dot: "20 minutes ago". */
  ago?: string
}

export interface PlanBox {
  id: string
  name: string
  col: number
  row: number
  /** Where you are, a place you stood in, or one you only heard of. */
  kind: 'here' | 'seen' | 'heard'
  /** In, out, up and down from here, as words at the box's edge. */
  words: string[]
  /** People you know (you talked with them) whom you last saw here. */
  people: PlanPerson[]
  /** The name of its area, when that is not the area of the plan (M10.33 I: the Workshop, of Vesper Works). */
  other?: string
}

export interface PlanData {
  area: string
  boxes: PlanBox[]
  /** The ways between two places on the plan. */
  links: { from: string; to: string }[]
  /** A way to a place not on the plan: a dashed line that way, with only the direction. */
  stubs: { from: string; direction: Direction }[]
  /** How many places of here the stranger knows. */
  known: number
}

/**
 * The places of an area on a grid: every place of the area, from its first,
 * along the exits (north up), so a place keeps its cell whatever the stranger
 * found first. A cell already taken moves the place on the same way, or aside.
 */
function layout(world: World, own: string[], across: string[] = []): Map<string, [number, number]> {
  const cells = new Map<string, [number, number]>()
  // The area's own places first, as they always lay (M10.33 I); then what joins across its edge, in the cells left.
  let places = own
  const taken = new Set<string>()
  const put = (id: string, at: [number, number]) => {
    cells.set(id, at)
    taken.add(at.join(','))
  }
  const free = (at: [number, number]) => !taken.has(at.join(','))
  for (const start of places) {
    if (cells.has(start)) continue
    // A part of the area no exit joins to the rest: to the east of what is there.
    const east = Math.max(-1, ...[...cells.values()].map(([c]) => c)) + 2
    put(start, cells.size ? [east, 0] : [0, 0])
    const queue = [start]
    // The ways with a direction first, so a place one goes in or up to takes a cell left over, not the cell of a place
    // that lies north (M10.33 M: the hangar, in from the Workshop, pushed the Guest Quarters a row up).
    const later: [string, string][] = []
    while (queue.length || later.length) {
      if (!queue.length) {
        const [from, to] = later.shift()!
        if (cells.has(to)) continue
        const [c, r] = cells.get(from)!
        let at = ASIDE.map(([dc, dr]) => [c + dc, r + dr] as [number, number]).find(free)
        for (let n = 2; !at && n < 12; n++) at = ASIDE.map(([dc, dr]) => [c + dc * n, r + dr * n] as [number, number]).find(free)
        put(to, at!)
        queue.push(to)
        continue
      }
      const id = queue.shift()!
      const [c, r] = cells.get(id)!
      for (const [dir, exit] of Object.entries(world.content.locations.get(id)?.exits ?? {}) as [Direction, { to: string }][]) {
        if (cells.has(exit.to) || !places.includes(exit.to)) continue
        const step = STEP[dir]
        if (!step) {
          later.push([id, exit.to])
          continue
        }
        let at: [number, number] | undefined
        for (let n = 1; n < 6 && !at; n++) if (free([c + step[0] * n, r + step[1] * n])) at = [c + step[0] * n, r + step[1] * n]
        at ??= ASIDE.map(([dc, dr]) => [c + dc, r + dr] as [number, number]).find(free)
        for (let n = 2; !at && n < 12; n++) at = ASIDE.map(([dc, dr]) => [c + dc * n, r + dr * n] as [number, number]).find(free)
        put(exit.to, at!)
        queue.push(exit.to)
      }
    }
  }
  if (across.length) {
    places = [...own, ...across]
    const queue = [...cells.keys()]
    while (queue.length) {
      const id = queue.shift()!
      const [c, r] = cells.get(id)!
      for (const [dir, exit] of Object.entries(world.content.locations.get(id)?.exits ?? {}) as [Direction, { to: string }][]) {
        if (cells.has(exit.to) || !places.includes(exit.to)) continue
        const step = STEP[dir]
        let at: [number, number] | undefined
        // Next to where it joins, never further along a line that would cross another place: the step, or its halves.
        if (step) at = ([step, [0, step[1]], [step[0], 0]] as [number, number][]).filter(([a, b]) => a || b).map(([a, b]) => [c + a, r + b] as [number, number]).find(free)
        at ??= ASIDE.map(([dc, dr]) => [c + dc, r + dr] as [number, number]).find(free)
        for (let n = 2; !at && n < 12; n++) at = ASIDE.map(([dc, dr]) => [c + dc * n, r + dr * n] as [number, number]).find(free)
        put(exit.to, at!)
        queue.push(exit.to)
      }
    }
  }
  return cells
}

/** The plan of where the stranger is, or none: outside a settlement, or in one of a single place. */
export function planHere(world: World): PlanData | undefined {
  const place = world.content.locations.get(world.state.player.location)
  return place ? planOf(world, place.area) : undefined
}

/** The plan of a settlement as the stranger knows it (the journal's page of an area), or none. */
export function planOf(world: World, areaId: string): PlanData | undefined {
  const here = world.state.player.location
  const area = world.content.areas.get(areaId)
  if (!area || !SETTLED.has(area.kind)) return undefined
  // The settlement and what walkable ways join to it across an area's edge (M10.33 I: the Workshop, of Vesper Works,
  // was never on the plan of Port Vesper): places of settled areas, from the area's own along their exits.
  const settled = (id: string) => SETTLED.has(world.content.areas.get(world.content.locations.get(id)?.area ?? '')?.kind ?? '')
  const joined = new Set([...world.content.locations.values()].filter((l) => l.area === area.id).map((l) => l.id))
  for (const id of [...joined]) {
    const queue = [id]
    while (queue.length) {
      for (const exit of Object.values(world.content.locations.get(queue.shift()!)?.exits ?? {}) as { to: string }[]) {
        if (joined.has(exit.to) || !world.content.locations.has(exit.to) || !settled(exit.to)) continue
        joined.add(exit.to)
        queue.push(exit.to)
      }
    }
  }
  const ofArea = [...joined].map((id) => world.content.locations.get(id)!)
  if (ofArea.length < 2) return undefined
  const seen = new Set(world.state.player.seen ?? [])
  const journal = world.state.player.journal ?? {}
  const kindOf = (id: string): PlanBox['kind'] | undefined => (id === here ? 'here' : seen.has(id) ? 'seen' : journal[id] !== undefined ? 'heard' : undefined)
  const cells = layout(world, ofArea.filter((l) => l.area === area.id).map((l) => l.id), ofArea.filter((l) => l.area !== area.id).map((l) => l.id))
  const shown = ofArea.filter((l) => kindOf(l.id))
  // A plan of one place says nothing (M10.33 R): it comes once a second place is known.
  if (shown.length < 2) return undefined
  const people = world.state.player.people ?? {}
  const boxes: PlanBox[] = shown.map((l) => {
    const [col, row] = cells.get(l.id)!
    const kind = kindOf(l.id)!
    const words = kind === 'heard' ? [] : shownExits(world, l.id).filter((d) => !STEP[d])
    // Where you see someone now, filled; where you last saw them, hollow and for two hours (M10.33 I).
    const met = Object.entries(people)
      .filter(([id, p]) => p.seen?.where === l.id && world.content.npcs.has(id) && (world.state.relations?.[id]?.familiarity ?? 0) > 0 && world.alive(id))
      .flatMap(([id, p]): PlanPerson[] => {
        const now = l.id === here && world.state.npcs[id]?.location === here
        const minutes = world.now - (p.seen?.t ?? world.now)
        if (!now && minutes > 120) return []
        return [{ id, name: knownName(world, id), colour: personColour(world, id), now, ...(now ? {} : { ago: minutes < 5 ? 'just now' : minutes < 60 ? `${Math.round(minutes / 5) * 5} minutes ago` : minutes < 90 ? 'an hour ago' : 'two hours ago' }) }]
      })
    return { id: l.id, name: l.name, col, row, kind, words, people: met, ...(l.area !== area.id ? { other: world.content.areas.get(l.area)?.name ?? l.area } : {}) }
  })
  const on = new Set(boxes.map((b) => b.id))
  const links: PlanData['links'] = []
  const stubs: PlanData['stubs'] = []
  for (const box of boxes) {
    // What you only heard of has no ways you know.
    if (box.kind === 'heard') continue
    for (const [dir, exit] of Object.entries(world.content.locations.get(box.id)!.exits) as [Direction, { to: string }][]) {
      // A secret way not yet found is not on the plan (M10.31); the places keep their cells all the same.
      if (!exitShown(world, box.id, dir)) continue
      // The way to a place only heard of is not known: it stays a way not taken.
      if (on.has(exit.to) && kindOf(exit.to) !== 'heard') {
        if (!links.some((k) => (k.from === exit.to && k.to === box.id) || (k.from === box.id && k.to === exit.to))) links.push({ from: box.id, to: exit.to })
      } else if (STEP[dir]) stubs.push({ from: box.id, direction: dir })
    }
  }
  // The plan starts at its top-left corner.
  const minCol = Math.min(...boxes.map((b) => b.col))
  const minRow = Math.min(...boxes.map((b) => b.row))
  for (const b of boxes) {
    b.col -= minCol
    b.row -= minRow
  }
  return { area: area.name, boxes, links, stubs, known: boxes.length }
}

/** The short name of a place in a text drawing: its words, cut to fit. */
function cut(name: string, width: number): string {
  const plain = name.replace(/^the\s+/i, '')
  return plain.length <= width ? plain : `${plain.slice(0, width - 1)}.`
}

/**
 * The plan as text (M10.29 I: PLAN in the terminal, and on the area's page
 * of the journal): a box a place, [ ] seen, ( ) heard of, * where you are,
 * lines between, and a dot for a way to a place not on it.
 */
export function planText(plan: PlanData): string[] {
  const W = 16
  const cols = Math.max(...plan.boxes.map((b) => b.col)) + 1
  const rows = Math.max(...plan.boxes.map((b) => b.row)) + 1
  // Each cell is W wide and one line high, with a line of ways between rows and a gap of 3 between columns.
  const width = cols * (W + 3)
  const grid: string[][] = Array.from({ length: rows * 2 - 1 }, () => Array.from({ length: width }, () => ' '))
  const at = new Map(plan.boxes.map((b) => [b.id, b]))
  const write = (line: number, x: number, text: string) => {
    for (let i = 0; i < text.length && x + i < width; i++) grid[line]![x + i] = text[i]!
  }
  const drawn = new Map<string, string>()
  for (const b of plan.boxes) {
    const [open, close] = b.kind === 'heard' ? ['(', ')'] : ['[', ']']
    const mark = b.kind === 'here' ? '*' : b.kind === 'heard' ? '?' : ''
    drawn.set(b.id, `${open}${cut(b.other ? `${b.name}, ${b.other}` : b.name, W - 2 - mark.length)}${mark}${close}`)
    write(b.row * 2, b.col * (W + 3), drawn.get(b.id)!)
  }
  for (const link of plan.links) {
    const a = at.get(link.from)!
    const b = at.get(link.to)!
    const [left, right] = a.col <= b.col ? [a, b] : [b, a]
    if (a.row === b.row && Math.abs(a.col - b.col) >= 1) {
      const aLen = drawn.get(left.id)!.length
      write(left.row * 2, left.col * (W + 3) + aLen, '-'.repeat(Math.max(1, right.col * (W + 3) - left.col * (W + 3) - aLen)))
    } else if (a.col === b.col) {
      for (let r = Math.min(a.row, b.row) * 2 + 1; r < Math.max(a.row, b.row) * 2; r++) write(r, a.col * (W + 3) + 2, '|')
    } else if (Math.abs(a.row - b.row) === 1) {
      const top = a.row < b.row ? a : b
      const bottom = top === a ? b : a
      write(top.row * 2 + 1, Math.max(top.col, bottom.col) * (W + 3) - 2, bottom.col > top.col ? '\\' : '/')
    }
  }
  const lines = grid.map((row) => row.join('').trimEnd())
  const ways = plan.stubs.map((s) => `${plan.boxes.find((b) => b.id === s.from)!.name}: a way ${s.direction}`)
  const words = plan.boxes.filter((b) => b.words.length).map((b) => `${b.name}: ${b.words.join(', ')}`)
  const people = plan.boxes.filter((b) => b.people.length).map((b) => `${b.name}: ${b.people.map((p) => (p.now ? `${p.name} (here now)` : `${p.name} (${p.ago})`)).join(', ')}`)
  return [
    `${plan.area}, as you know it (${plan.known} ${plan.known === 1 ? 'place' : 'places'}; * where you are, ( ) only heard of):`,
    ...lines,
    ...(words.length ? ['', 'Ways in, out, up and down:', ...words.map((w) => `  ${w}`)] : []),
    ...(ways.length ? ['', 'Ways you have not taken:', ...ways.map((w) => `  ${w}`)] : []),
    ...(people.length ? ['', 'Where you last saw people:', ...people.map((p) => `  ${p}`)] : []),
  ]
}
