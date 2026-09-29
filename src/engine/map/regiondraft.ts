import { Document, isSeq, visit } from 'yaml'
import { DIRECTIONS, loadContent, type Content, type ContentFile, type Direction } from '../content'
import { draftResult, type Draft } from '../editor'
import { DEFAULT_PALETTE, LANDS } from './palette'
import { regionMap } from './region'

// A first map of a world from its places (M10.20; found building The Quiet
// Reach: no step made a region with its hexes, so the world played without a
// map). The places are laid out from their exits, each the way it says and as
// far as its minutes go at the pace of the map; the open land between them is
// one terrain of the world's palette, for the designer to paint; a path runs
// along every exit from one area to another. Nothing is saved: it comes as a
// proposal, which the designer accepts and then works on.

/** The pace of the map: a hex of 250 m on open ground in four minutes, so a minute is a sixteenth of a km. */
const KM_PER_MINUTE = 1 / 16
/** The width of a hex, in km. */
const HEX_KM = 0.25
/** Open land around the places, in km on each side, and the least a region measures. */
const MARGIN_KM = 1.5
const MIN_SIZE_KM = 4
/** An exit whose minutes and the map disagree by more than this share is named for the designer. */
const DISAGREE = 0.5
/** Up to this size each way, a first map is drawn a hex a character; a larger one half a km by one, as the Holleveen. */
const FINE_UP_TO_KM = 10

type Land = (typeof LANDS)[number]
type Point = [number, number]

const S = Math.SQRT1_2
const COMPASS: Partial<Record<Direction, Point>> = { north: [0, 1], northeast: [S, S], east: [1, 0], southeast: [S, -S], south: [0, -1], southwest: [-S, -S], west: [-1, 0], northwest: [-S, S] }
/** The winds in turn, for a way that has none (in, out, up, down): the freest is taken. */
const WINDS: Direction[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
const SETTLED = new Set(['village', 'town', 'city', 'hamlet'])
/** Kinds of hex the engine paints by its own rules, not from the drawing. */
const DERIVED = new Set(['bog', 'hummock', 'ridge', 'channel', 'tunnel', 'crown'])
/** The characters of the engine's lands, as the Nethermarch draws them; a world's own lands take the next free sign. */
const LAND_CHAR: Record<string, string> = { woods: 'T', fields: '.', fen: '"', water: '~', heath: '^' }
const OWN_CHARS = ['#', '%', '&', '*', '+', '-', '|', ';', '!', '?', '<', '>', '(', ')', '[', ']', '{', '}', '$', '_']

/** What a world's own terrain walks like, from its id and its name: water, wet ground, what closes around you, farmed ground, or open high ground. */
export function likeOf(key: string, name = ''): Land {
  const words = `${key} ${name}`.toLowerCase()
  if (/sea|ocean|water|lake|mere|bay|lagoon|river|sound\b/.test(words)) return 'water'
  if (/marsh|fen|bog|swamp|mud|shallow|tidal|wet|mire/.test(words)) return 'fen'
  if (/wood|forest|scrub|grove|jungle|thicket|tree|copse/.test(words)) return 'woods'
  if (/field|farm|grass|bed|meadow|plain|pasture|garden|orchard/.test(words)) return 'fields'
  return 'heath'
}

export interface RegionDraft {
  id: string
  /** The changes to accept: the region, its open land as an area when the world has none, and where each area and far-off place lies. */
  changes: { kind: 'region' | 'area' | 'location'; id: string; yaml: string; merge?: boolean }[]
  /** What the designer should look at. */
  notes: string[]
}

const round = (n: number) => Math.round(n * 100) / 100
/** YAML with points and lists of numbers on one line: `pos: [2.07, 1.73]`. */
function yamlOf(value: unknown): string {
  const doc = new Document(value)
  visit(doc, {
    Seq(_, node) {
      if (node.items.every((i) => !isSeq(i) || i.items.every((j) => typeof (j as { value?: unknown }).value === 'number')) && node.items.every((i) => isSeq(i) || typeof (i as { value?: unknown }).value === 'number')) node.flow = true
    },
  })
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false })
}
/** A name as it stands inside a sentence: "The Tidepools" is "the Tidepools". */
const inSentence = (name: string) => name.replace(/^The\s/, 'the ')
const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
const bare = (name: string) => name.replace(/^the\s+/i, '')
const slug = (s: string) =>
  bare(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'region'

/** A fixed seed from the world's name, so the same world draws the same land. */
function seedOf(name: string): number {
  let h = 0
  for (const ch of name) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return h % 10000
}

/** Where every place lies, from the start, along the exits both ways; km from the start. */
function layOut(content: Content, notes: string[]): Map<string, Point> {
  const pos = new Map<string, Point>()
  const start = content.world.start.location
  // Every exit both ways: an exit north from A is one south from B.
  const OPPOSITE: Partial<Record<Direction, Direction>> = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest', up: 'down', down: 'up', in: 'out', out: 'in' }
  const edges = new Map<string, { to: string; dir: Direction; minutes: number }[]>()
  const add = (from: string, to: string, dir: Direction, minutes: number) => {
    const list = edges.get(from) ?? []
    if (!list.some((e) => e.to === to)) list.push({ to, dir, minutes })
    edges.set(from, list)
  }
  for (const loc of [...content.locations.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const dir of DIRECTIONS) {
      const exit = loc.exits[dir]
      if (!exit || !content.locations.has(exit.to)) continue
      add(loc.id, exit.to, dir, exit.minutes)
      add(exit.to, loc.id, OPPOSITE[dir]!, exit.minutes)
    }
  }
  const freest = (from: Point, km: number): Point => {
    let best: Point = [from[0], from[1] + km]
    let room = -1
    for (const wind of WINDS) {
      const [ux, uy] = COMPASS[wind]!
      const at: Point = [from[0] + ux * km, from[1] + uy * km]
      const nearest = Math.min(...[...pos.values()].map((p) => dist(p, at)))
      if (nearest > room + 1e-9) {
        room = nearest
        best = at
      }
    }
    return best
  }
  if (!content.locations.has(start)) return pos
  pos.set(start, [0, 0])
  const queue = [start]
  const loose: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    const here = pos.get(id)!
    const area = content.locations.get(id)!.area
    for (const e of edges.get(id) ?? []) {
      const km = e.minutes * KM_PER_MINUTE
      const target = content.locations.get(e.to)!
      const unit = COMPASS[e.dir]
      if (pos.has(e.to)) {
        // A loop: say so when the map and the minutes part ways.
        const made = dist(pos.get(e.to)!, here)
        if (target.area !== area && km > HEX_KM && Math.abs(made - km) > km * DISAGREE && e.dir in COMPASS) notes.push(`The way ${e.dir} from ${id} to ${e.to} is ${e.minutes} minutes, but the map makes it about ${Math.round(made / KM_PER_MINUTE)}: move one of them, or change the minutes.`)
        continue
      }
      let at: Point
      if (unit) at = [here[0] + unit[0] * km, here[1] + unit[1] * km]
      else if (target.area === area && km <= HEX_KM) at = here
      else {
        at = freest(here, km)
        loose.push(`${e.to} (${e.dir} from ${id})`)
      }
      pos.set(e.to, at)
      queue.push(e.to)
    }
  }
  if (loose.length) notes.push(`These are reached by a way without a wind (in, out, up or down), and lie where there was room: ${loose.join(', ')}.`)
  const unreached = [...content.locations.keys()].filter((id) => !pos.has(id)).sort()
  if (unreached.length) {
    const south = Math.min(0, ...[...pos.values()].map((p) => p[1])) - 1
    unreached.forEach((id, i) => pos.set(id, [i * 0.5, south]))
    notes.push(`No exit leads from the start to ${unreached.join(', ')}; they lie in a row to the south until you place them.`)
  }
  return pos
}

/**
 * A region for a world without one, from its places, exits and minutes:
 * where each area lies, a path along each exit between areas, and the open
 * land in one terrain of the palette, for the designer to paint.
 */
export function draftRegion(content: Content): RegionDraft {
  const notes: string[] = []
  const regionName = content.world.words?.region ?? content.world.name
  const id = slug(regionName)
  if (content.regions.size) return { id: [...content.regions.keys()][0]!, changes: [], notes: ['This world has a map of its own already.'] }
  const at = layOut(content, notes)

  // Each area where its first place lies; far-off places of an area get their own spot.
  const areaAt = new Map<string, Point>()
  for (const [loc, p] of at) {
    const area = content.locations.get(loc)!.area
    if (!areaAt.has(area)) areaAt.set(area, p)
  }
  // Two areas on one hex: the later moves a hex further on.
  const placed: [string, Point][] = []
  for (const [area, p] of areaAt) {
    let q = p
    for (let tries = 0; tries < 8 && placed.some(([, o]) => dist(o, q) < HEX_KM); tries++) {
      const [ux, uy] = COMPASS[WINDS[tries]!]!
      q = [p[0] + ux * HEX_KM * 1.2, p[1] + uy * HEX_KM * 1.2]
    }
    if (q !== p) notes.push(`${area} lay on the hex of another area and moved a little.`)
    areaAt.set(area, q)
    placed.push([area, q])
  }
  const ownSpot = new Map<string, Point>()
  for (const [loc, p] of at) {
    const area = content.locations.get(loc)!.area
    if (dist(p, areaAt.get(area)!) >= HEX_KM * 1.5) ownSpot.set(loc, p)
  }

  // The frame: the places in the middle, open land around them.
  const points = [...areaAt.values(), ...ownSpot.values()]
  const minX = Math.min(...points.map((p) => p[0]))
  const maxX = Math.max(...points.map((p) => p[0]))
  const minY = Math.min(...points.map((p) => p[1]))
  const maxY = Math.max(...points.map((p) => p[1]))
  const width = Math.ceil(Math.max(MIN_SIZE_KM, maxX - minX + 2 * MARGIN_KM) * 2) / 2
  const height = Math.ceil(Math.max(MIN_SIZE_KM, maxY - minY + 2 * MARGIN_KM))
  const dx = (width - (maxX - minX)) / 2 - minX
  const dy = (height - (maxY - minY)) / 2 - minY
  const local = (p: Point): Point => [round(p[0] + dx), round(p[1] + dy)]

  // The lands: the engine's by their own sign, a world's own terrain walking like one of them.
  const palette = content.world.map?.palette ?? DEFAULT_PALETTE
  const keys = Object.keys(palette.dark.terrain).filter((k) => !DERIVED.has(k))
  const legend: Record<string, string> = {}
  const lands: Record<string, { like: Land }> = {}
  const free = OWN_CHARS.filter((c) => !Object.values(LAND_CHAR).includes(c))
  const charOf: Record<string, string> = {}
  for (const key of keys) {
    const ch = (LANDS as readonly string[]).includes(key) ? LAND_CHAR[key]! : free.shift()
    if (!ch) continue
    charOf[key] = ch
    legend[ch] = key
    if (!(LANDS as readonly string[]).includes(key)) lands[key] = { like: likeOf(key, palette.names[key]) }
  }
  Object.assign(legend, { ':': 'road', ',': 'path' })
  const likeOfKey = (k: string) => (lands[k]?.like ?? k) as Land
  const open = keys.find((k) => likeOfKey(k) === 'fields' || likeOfKey(k) === 'heath') ?? keys[0]
  const ground = open && charOf[open] ? open : 'fields'
  if (!charOf[ground]) {
    charOf[ground] = LAND_CHAR[ground] ?? '.'
    legend[charOf[ground]!] = ground
  }
  // One character is a hex for a small region, else half a km east to west and one km north to south; the top row the north edge, the last row the south edge.
  const zone: Point = width <= FINE_UP_TO_KM && height <= FINE_UP_TO_KM ? [HEX_KM, HEX_KM] : [0.5, 1]
  const zones = Array.from({ length: Math.round(height / zone[1]) + 1 }, () => charOf[ground]!.repeat(Math.round(width / zone[0]))).join('\n') + '\n'
  notes.push(`One character of the drawing is ${zone[0] === HEX_KM ? 'a hex, 250 m each way' : 'half a km east to west and a km north to south'}, the top row the north. All the open land is ${palette.names[ground] ?? ground} now: paint the drawing with the other lands (${keys.filter((k) => k !== ground).map((k) => `${charOf[k]} ${palette.names[k] ?? k}`).join(', ')}).`)
  const guessed = Object.entries(lands).map(([k, l]) => `${k} walks like ${l.like}`)
  if (guessed.length) notes.push(`From their names: ${guessed.join(', ')}. Give each the line the stranger reads there (text).`)

  // A path along each exit from one area to another, and through an area that stretches out (a route).
  const areaName = (a: string) => inSentence(content.areas.get(a)?.name ?? a)
  const paths: { kind: 'road' | 'path'; name: string; via: Point[] }[] = []
  const seen = new Set<string>()
  const spot = (loc: string) => local(ownSpot.get(loc) ?? areaAt.get(content.locations.get(loc)!.area)!)
  for (const loc of [...at.keys()]) {
    const from = content.locations.get(loc)!
    for (const dir of DIRECTIONS) {
      const exit = from.exits[dir]
      const to = exit && content.locations.get(exit.to)
      if (!exit || !to) continue
      const a = spot(from.id)
      const b = spot(to.id)
      if (dist(a, b) < HEX_KM) continue
      const pair = [from.id, to.id].sort().join('>')
      if (seen.has(pair)) continue
      seen.add(pair)
      const settled = SETTLED.has(content.areas.get(from.area)?.kind ?? '') && SETTLED.has(content.areas.get(to.area)?.kind ?? '')
      const kind = settled ? 'road' : 'path'
      // Named for where it goes: an area, or within one a place; the first name not yet taken.
      const names =
        from.area === to.area
          ? [`the ${kind} to ${inSentence(to.name)}`, `the ${kind} from ${inSentence(from.name)} to ${inSentence(to.name)}`]
          : [`the ${kind} to ${areaName(to.area)}`, `the ${kind} from ${areaName(from.area)} to ${areaName(to.area)}`, `the ${kind} from ${inSentence(from.name)} to ${inSentence(to.name)}`]
      const name = names.find((n) => !paths.some((p) => p.name === n)) ?? `${names.at(-1)} (${paths.length + 1})`
      paths.push({ kind, name, via: [a, b] })
    }
  }

  // The open land between the places: an area without places of its own, or a new one.
  const empty = [...content.areas.values()].find((a) => a.kind === 'wilderness' && ![...content.locations.values()].some((l) => l.area === a.id))
  const wildId = empty?.id ?? (content.areas.has(id) ? `${id}_land` : id)
  const centreAt: Point = [round(width / 2), round(height / 2)]
  const region = {
    id,
    name: regionName,
    area: wildId,
    origin: [0, 0],
    size: [width, height],
    hex: HEX_KM,
    seed: seedOf(content.world.name),
    legend,
    ...(Object.keys(lands).length ? { lands } : {}),
    zone,
    zones,
    paths: paths.map((p) => ({ kind: p.kind, name: p.name, via: p.via })),
  }
  const changes: RegionDraft['changes'] = [{ kind: 'region', id, yaml: yamlOf(region) }]
  if (!empty) changes.push({ kind: 'area', id: wildId, yaml: yamlOf({ id: wildId, name: regionName, kind: 'wilderness', summary: `The open land between the places of ${regionName}.`, pos: centreAt }) })
  for (const [area, p] of [...areaAt].sort((a, b) => a[0].localeCompare(b[0]))) changes.push({ kind: 'area', id: area, merge: true, yaml: yamlOf({ pos: local(p) }) })
  for (const [loc, p] of [...ownSpot].sort((a, b) => a[0].localeCompare(b[0]))) changes.push({ kind: 'location', id: loc, merge: true, yaml: yamlOf({ pos: local(p) }) })
  return { id, changes, notes }
}

/**
 * The first map as a proposal for the editor (M10.20): the changes checked
 * against the world, and what the designer should do next as a list.
 */
export function mapDraft(files: ContentFile[]): Draft {
  let content: Content
  try {
    content = loadContent(files)
  } catch {
    return { say: '', questions: [], changes: [], problems: ['The world does not load, so there are no places to make a map from. Look under Check.'] }
  }
  const draft = draftRegion(content)
  if (!draft.changes.length) return { say: draft.notes.join(' '), questions: [], changes: [], problems: [] }
  const result = draftResult(files, { changes: draft.changes })
  const say = [
    `A first map of ${content.world.words?.region ?? content.world.name}, laid out from the places, their exits and minutes. Accept it, then paint the land in \`regions/${draft.id}/region.yaml\`, or let the chronicler do it in the Palette step.`,
    '',
    ...draft.notes.map((n) => `- ${n}`),
  ].join('\n')
  return { say, questions: [], changes: draft.changes, result, problems: result.problems }
}

/**
 * Where the places lie in the zone drawing of the world's first region, by
 * row from the top and column from the left, counted from 1 (M10.25: the
 * painter of The Quiet Reach had only their km, took the top row for the
 * south, and put the high rock of Orison Ridge on the wrong side). The hex a
 * place stands on reads the character under its centre, so that is the one named.
 */
export function placesInDrawing(content: Content): string {
  const map = regionMap(content)
  if (!map) return ''
  const [across, down] = map.region.zone ?? [0.5, 1]
  const cells = [...map.places.entries()]
    .filter(([area]) => area !== map.region.area)
    .map(([area, hex]) => {
      const [x, y] = map.local(map.posOf(hex))
      return `${content.areas.get(area)?.name ?? area} row ${Math.round((map.region.size[1] - y) / down) + 1}, column ${Math.floor(x / across) + 1}`
    })
  return cells.length ? `WHERE THE PLACES LIE IN THE DRAWING (row from the top, which is the north; column from the left, which is the west; both from 1): ${cells.join('; ')}.` : ''
}

/** A world's files without its region map (M10.26: to lay one out and paint it again, or to measure the painting), its lock without the map's line. */
export function withoutMap(files: ContentFile[]): ContentFile[] {
  return files
    .filter((f) => !/(^|\/)regions\//.test(f.path))
    .map((f) => (f.path.endsWith('ids.lock') ? { ...f, text: f.text.replace(/\n\s+\S*\/regions\/\S*:\n\s+region: \[[^\]]*\]/g, '') } : f))
}
