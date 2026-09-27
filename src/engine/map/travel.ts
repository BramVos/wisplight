import { GameClock, minuteOfDay } from '../clock'
import type { Content, Location } from '../content'
import type { Output } from '../commands'
import type { World } from '../world'
import { weather, weatherLine } from '../weather'
import { centre, distance, type Hex, HEX_DIRECTIONS, type HexDirection, hexKey, neighbour, neighbours, stepToward, windBetween } from './hexgrid'
import { type Cell, regionMap, type RegionMap } from './region'

// Walking across the region (FO, chapter 4, "Lopen en automatisch doorlopen"):
// hex by hex until there is something to decide, with one running text in
// between instead of thirty messages. Places made by hand are locations; the
// land between them is the hex map, and a hex is a place you can stand on.

const PREFIX = 'hex:'

export const hexId = (hex: Hex) => `${PREFIX}${hex.col},${hex.row}`

export function hexOfId(id: string): Hex | undefined {
  if (!id.startsWith(PREFIX)) return undefined
  const [col, row] = id.slice(PREFIX.length).split(',').map(Number)
  return Number.isInteger(col) && Number.isInteger(row) ? { col: col!, row: row! } : undefined
}

export const isHexId = (id: string) => id.startsWith(PREFIX)

// ---------------------------------------------------------------- where you are

export function playerHex(world: World): Hex | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const here = world.state.player.location
  return hexOfId(here) ?? map.locations.get(here)
}

/** From a place you may set out across country only from its edge: a road, a field, a quay. */
export function canSetOut(world: World, locationId: string): boolean {
  if (isHexId(locationId)) return true
  const tags = world.content.locations.get(locationId)?.tags ?? []
  return tags.includes('edge') || tags.includes('route') || tags.includes('wilderness')
}

function knows(world: World, topic: string): boolean {
  return (world.state.player.journal ?? {})[topic] !== undefined
}

/** A hidden path counts for whoever knows it; for everyone else it is just fen. */
function onKnownRidge(world: World, cell: Cell): boolean {
  return Boolean(cell.hidden && knows(world, cell.hidden))
}

function frozen(world: World): boolean {
  return weather(world) === 'frost' || weather(world) === 'snow'
}

export function passable(world: World, cell: Cell): boolean {
  if (cell.land !== 'water') return true
  // Ice carries you over the Blackmere in a hard frost; channels never freeze hard enough.
  return frozen(world) && !cell.channel
}

export function minutesFor(world: World, cell: Cell): number {
  let minutes: number
  if (cell.way) minutes = cell.way.kind === 'path' ? 4 : 3
  else if (onKnownRidge(world, cell)) minutes = 4
  else if (cell.land === 'fen') minutes = cell.feature === 'hummock' ? 6 : 8
  else if (cell.land === 'woods') minutes = 6
  else if (cell.land === 'water') minutes = 5
  else minutes = 4
  const kind = weather(world)
  if (kind === 'rain' || kind === 'snow') minutes += 1
  if (kind === 'storm') minutes += 2
  if (!cell.way && new GameClock(world.now).isNight) minutes += 1
  return minutes
}

/** How many hexes you can see from here. */
export function sight(world: World, map: RegionMap, cell: Cell): number {
  const kind = weather(world)
  let range = cell.land === 'heath' ? 4 : cell.land === 'woods' ? 1 : 3
  if (kind === 'clear') range += 1
  if (kind === 'rain' || kind === 'snow') range = Math.min(range, 2)
  for (const rule of map.region.rules) {
    if (rule.kind !== 'sight') continue
    const place = map.places.get(rule.area)
    if (!place || distance(place, cell) * map.size > rule.radius) continue
    if (kind === 'fog' && rule.fog !== undefined) return rule.fog
    if (kind !== 'fog' && kind !== 'storm' && rule.clear !== undefined) range = Math.max(range, rule.clear)
  }
  if (kind === 'fog' || kind === 'storm') range = 1
  if (new GameClock(world.now).isNight) range = Math.min(range, 1)
  return range
}

// ---------------------------------------------------------------- what the player has seen

function bits(encoded: string | undefined, size: number): Uint8Array {
  const out = new Uint8Array(Math.ceil(size / 8))
  if (!encoded) return out
  const raw = atob(encoded)
  for (let i = 0; i < raw.length && i < out.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function encode(data: Uint8Array): string {
  let raw = ''
  for (const byte of data) raw += String.fromCharCode(byte)
  return btoa(raw)
}

function mapState(world: World) {
  return (world.state.player.map ??= { seen: '', walked: '' })
}

function index(map: RegionMap, hex: Hex): number {
  return hex.col * map.rows + hex.row
}

export function hasSeen(world: World, map: RegionMap, hex: Hex): boolean {
  const i = index(map, hex)
  return (bits(mapState(world).seen, map.cols * map.rows)[i >> 3]! & (1 << (i & 7))) !== 0
}

export function hasWalked(world: World, map: RegionMap, hex: Hex): boolean {
  const i = index(map, hex)
  return (bits(mapState(world).walked, map.cols * map.rows)[i >> 3]! & (1 << (i & 7))) !== 0
}

/** Everything within sight goes on the player's map as seen; the hex itself as walked. */
export function look(world: World, map: RegionMap, hex: Hex, walked = true): void {
  const state = mapState(world)
  const seen = bits(state.seen, map.cols * map.rows)
  const range = sight(world, map, map.cell(hex)!)
  for (let dc = -range; dc <= range; dc++) {
    for (let dr = -range - 1; dr <= range + 1; dr++) {
      const other = { col: hex.col + dc, row: hex.row + dr }
      if (!map.inside(other) || distance(hex, other) > range) continue
      const i = index(map, other)
      seen[i >> 3]! |= 1 << (i & 7)
      // Places you see from afar are places you know by sight.
      const place = map.placeOn(other)
      if (place) (world.state.player.seenAreas ??= []).includes(place) || world.state.player.seenAreas!.push(place)
    }
  }
  state.seen = encode(seen)
  if (walked) {
    const done = bits(state.walked, map.cols * map.rows)
    const i = index(map, hex)
    done[i >> 3]! |= 1 << (i & 7)
    state.walked = encode(done)
  }
}

// ---------------------------------------------------------------- describing a hex

function nearest(map: RegionMap, hex: Hex): { area: string; km: number; wind: string } | undefined {
  const here = centre(hex, map.size)
  let best: { area: string; km: number; wind: string } | undefined
  for (const [area, place] of map.places) {
    const there = centre(place, map.size)
    const km = Math.hypot(there[0] - here[0], there[1] - here[1])
    if (!best || km < best.km) best = { area, km, wind: windBetween(there, here) }
  }
  return best
}

function areaName(world: World, area: string): string {
  return world.content.areas.get(area)?.name ?? area
}

export function hexName(world: World, map: RegionMap, hex: Hex): string {
  const cell = map.cell(hex)!
  const where = nearest(map, hex)
  const ground = cell.way ? `On ${cell.way.name}` : onKnownRidge(world, cell) ? 'On the dry ridge' : { fen: 'In the fen', fields: 'In the fields', woods: 'In the woods', heath: 'On the heath', water: 'On the ice', road: 'On the road', canal: 'On the tow path', path: 'On a path' }[cell.land]
  if (!where) return ground
  const name = areaName(world, where.area)
  if (where.km < 0.4) return `${ground}, just outside ${name}`
  if (where.km < 1.5) return `${ground}, near ${name}`
  return `${ground}, about ${Math.round(where.km)} km ${where.wind} of ${name}`
}

const LAND: Record<Cell['land'], string> = {
  fen: 'Wet peat and sedge stretch around you, cut by black pools.',
  fields: 'Drained fields lie in strips between straight ditches.',
  woods: 'Alder and birch close in around you, dripping.',
  heath: 'Heather and pale sand run out towards the sky.',
  water: 'You stand on grey ice, and it groans under you.',
  road: 'A cart road runs through here.',
  canal: 'The tow path runs beside the water.',
  path: 'A path runs through here.',
}

const FEATURE: Record<NonNullable<Cell['feature']>, string> = {
  pool: 'A black pool lies to one side, still as glass.',
  peat_pit: 'An old peat pit gapes beside you, full of brown water.',
  willow: 'A lone willow leans over the wet ground.',
  ruin: 'The stump of an old wall stands here, black with moss.',
  hummock: 'The ground rises into a hummock, a little drier than the rest.',
}

function landmark(world: World, map: RegionMap, hex: Hex): string | undefined {
  const here = centre(hex, map.size)
  const fog = sight(world, map, map.cell(hex)!) <= 1
  let best: { text: string; km: number; wind: string } | undefined
  for (const mark of map.region.landmarks) {
    const place = map.places.get(mark.area)
    if (!place) continue
    const there = centre(place, map.size)
    const km = Math.hypot(there[0] - here[0], there[1] - here[1])
    if (km < 0.3 || km > (fog ? 0.5 : mark.range)) continue
    if (!best || km < best.km) best = { text: mark.text, km, wind: windBetween(here, there) }
  }
  return best ? `To the ${best.wind}, ${best.text}.` : undefined
}

export function waysLine(world: World, map: RegionMap, hex: Hex): string {
  const open: string[] = []
  const shut: string[] = []
  for (const { direction, hex: next } of neighbours(hex)) {
    const cell = map.cell(next)
    if (!cell) continue
    ;(passable(world, cell) ? open : shut).push(direction.replace(/^(north|south)(east|west)$/, '$1-$2'))
  }
  return `Ways on: ${open.join(', ') || 'none'}${shut.length ? `; deep water ${shut.join(', ')}` : ''}.`
}

export function describeHex(world: World, hex: Hex): Output {
  const map = regionMap(world.content)!
  const cell = map.cell(hex)!
  const night = new GameClock(world.now).isNight
  const lines: string[] = []
  if (cell.way) {
    lines.push(
      cell.way.kind === 'canal'
        ? 'The tow path runs beside the grey water of the Vaart, rutted by the barge horses.'
        : cell.way.kind === 'road'
          ? `A cart road runs through here, ${cell.land === 'fen' ? 'raised on a bank above the wet' : 'rutted and grey'}.`
          : `A narrow path of trodden peat winds on between the ${cell.land === 'fen' ? 'pools' : 'ditches'}.`,
    )
  } else if (onKnownRidge(world, cell)) {
    lines.push('Under the sedge the ground is firm here: the dry ridge, if you keep to it.')
  } else {
    lines.push(LAND[cell.land])
  }
  if (cell.feature) lines.push(FEATURE[cell.feature])
  lines.push(weatherLine(weather(world), night))
  const mark = landmark(world, map, hex)
  if (mark) lines.push(mark)
  const ground = world.state.ground[hexId(hex)]
  const things = ground && Object.keys(ground).length ? [`On the ground: ${Object.keys(ground).join(', ')}.`] : []
  return { kind: 'room', text: [hexName(world, map, hex), lines.join(' '), ...things, waysLine(world, map, hex)].join('\n') }
}

/** The location that stands for a hex, so the rest of the game can treat it as a place. */
export function hexLocation(world: World, id: string): Location | undefined {
  const hex = hexOfId(id)
  const map = regionMap(world.content)
  const cell = hex && map?.cell(hex)
  if (!hex || !map || !cell) return undefined
  const tags = ['wilderness', 'hex', ...(cell.bog ? ['hazard:bog'] : []), ...(cell.land === 'water' ? ['hazard:deep_water'] : [])]
  return {
    id,
    name: hexName(world, map, hex),
    area: map.region.area,
    tags,
    aliases: [],
    description: { day: LAND[cell.land] },
    exits: {},
    objects: [],
    services: [],
    items: {},
    pos: map.posOf(hex),
  }
}

// ---------------------------------------------------------------- walking

export type WalkPlan =
  | { kind: 'head'; wind: string; steps?: number }
  | { kind: 'to'; target: Hex; name: string }
  | { kind: 'follow'; way: string; wind?: string }

export interface WalkResult {
  outputs: Output[]
  minutes: number
  /** Where the walk ended: a hex, or a location. */
  at: string
}

const WIND_WORDS: Record<string, string> = {
  n: 'north',
  north: 'north',
  noord: 'north',
  s: 'south',
  south: 'south',
  zuid: 'south',
  e: 'east',
  east: 'east',
  oost: 'east',
  w: 'west',
  west: 'west',
  ne: 'northeast',
  northeast: 'northeast',
  'north-east': 'northeast',
  noordoost: 'northeast',
  nw: 'northwest',
  northwest: 'northwest',
  'north-west': 'northwest',
  noordwest: 'northwest',
  se: 'southeast',
  southeast: 'southeast',
  'south-east': 'southeast',
  zuidoost: 'southeast',
  sw: 'southwest',
  southwest: 'southwest',
  'south-west': 'southwest',
  zuidwest: 'southwest',
}

export function windOf(word: string | undefined): string | undefined {
  return word ? WIND_WORDS[word.toLowerCase()] : undefined
}

const pretty = (wind: string) => wind.replace(/^(north|south)(east|west)$/, '$1-$2')

/** The cheapest way between two hexes, by the minutes it takes. */
export function findPath(world: World, map: RegionMap, from: Hex, to: Hex): Hex[] | undefined {
  const start = hexKey(from)
  const goal = hexKey(to)
  const cost = new Map<string, number>([[start, 0]])
  const back = new Map<string, Hex>()
  const open: { hex: Hex; f: number }[] = [{ hex: from, f: 0 }]
  const seen = new Set<string>()
  while (open.length) {
    open.sort((a, b) => a.f - b.f)
    const { hex } = open.shift()!
    const key = hexKey(hex)
    if (key === goal) break
    if (seen.has(key)) continue
    seen.add(key)
    for (const { hex: next } of neighbours(hex)) {
      const cell = map.cell(next)
      if (!cell || !passable(world, cell)) continue
      const g = cost.get(key)! + minutesFor(world, cell) + (cell.bog ? 10 : 0)
      const nkey = hexKey(next)
      if (g < (cost.get(nkey) ?? Infinity)) {
        cost.set(nkey, g)
        back.set(nkey, hex)
        open.push({ hex: next, f: g + distance(next, to) * 3 })
      }
    }
  }
  if (!back.has(goal) && start !== goal) return undefined
  const path: Hex[] = [to]
  let key = goal
  while (key !== start) {
    const prev = back.get(key)!
    path.unshift(prev)
    key = hexKey(prev)
  }
  return path
}

/** The locations on a hex, best entrance first: the edge of a place, a road, a landmark. */
export function entranceOn(world: World, map: RegionMap, hex: Hex): string | undefined {
  // Nobody walks into someone's house off the fen: private places are passed by.
  const here = [...map.locations.entries()]
    .filter(([, h]) => h.col === hex.col && h.row === hex.row)
    .map(([id]) => world.content.locations.get(id)!)
    .filter((l) => !l.tags.includes('private'))
  const score = (l: Location) =>
    l.tags.includes('edge') ? 5 : l.tags.includes('route') ? 4 : l.tags.includes('landmark') && l.tags.includes('public') ? 3 : l.tags.includes('public') ? 2 : l.tags.includes('private') ? 0 : 1
  return here.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0]?.id
}

function matchesWay(world: World, cell: Cell, way: string): boolean {
  if (way === 'ridge') return onKnownRidge(world, cell)
  return (cell.ways ?? []).some((w) => w.kind === way || w.name === way)
}

/** Where along a way a hex lies; the ridge has no order, so it counts every hex the same. */
function wayAt(cell: Cell, way: string, name?: string): { name: string; at: number } | undefined {
  const found = (cell.ways ?? []).find((w) => (name ? w.name === name : w.kind === way || w.name === way))
  return found && { name: found.name, at: found.at }
}

/**
 * Walks until something needs deciding (FO, chapter 4): a fork or the end of a
 * path, bad ground, deep water, the fog closing in, nightfall, a place.
 */
export function walk(world: World, plan: WalkPlan, pass: (minutes: number) => Output[]): WalkResult | Output[] {
  const map = regionMap(world.content)
  const startId = world.state.player.location
  if (!map) return [{ kind: 'error', text: 'There is no map of this land.' }]
  if (!canSetOut(world, startId)) return [{ kind: 'error', text: "You can't strike out across country from in here. Go out to the road or the edge of the village first." }]
  const start = playerHex(world)
  if (!start) return [{ kind: 'error', text: 'You are off the map.' }]
  let at: Hex = start

  let path: Hex[] | undefined
  if (plan.kind === 'to') {
    path = findPath(world, map, at, plan.target)
    if (!path) return [{ kind: 'error', text: `You can see no way to ${plan.name} from here.` }]
    if (path.length < 2) return [{ kind: 'text', text: `You are already at ${plan.name}.` }]
  }
  if (plan.kind === 'follow' && !neighbours(at).some((n) => map.cell(n.hex) && matchesWay(world, map.cell(n.hex)!, plan.way)) && !matchesWay(world, map.cell(at)!, plan.way)) {
    return [{ kind: 'error', text: `There is no ${plan.way === 'ridge' ? 'ridge' : plan.way.replace(/^the /, '').replace(/^canal$/, 'tow path')} to follow from here.` }]
  }

  const startWeather = weather(world)
  const maxSteps = plan.kind === 'head' ? (plan.steps ?? 16) : 80
  const lands = new Set<string>()
  const trail = new Set<string>([hexKey(at)])
  // Which named way is being followed, and in which sense along it.
  let following: string | undefined
  let sense = 0
  let minutes = 0
  let steps = 0
  let reason = ''
  let arrived: string | undefined
  // Following on from the last walk, keep the way you were going.
  let heading: HexDirection | undefined = plan.kind === 'follow' ? (mapState(world).heading as HexDirection | undefined) : undefined

  while (steps < maxSteps) {
    let next: Hex | undefined
    let direction: HexDirection | undefined
    if (plan.kind === 'head') {
      direction = stepToward(at, plan.wind, steps)
      next = direction && neighbour(at, direction)
    } else if (plan.kind === 'to') {
      next = path![steps + 1]
      if (!next) break
    } else {
      // Along a way, the next hex is the next one of that way: forward or back.
      const here = wayAt(map.cell(at)!, plan.way, following)
      let options = neighbours(at).filter((n) => {
        const cell = map.cell(n.hex)
        if (!cell || trail.has(hexKey(n.hex)) || !passable(world, cell) || !matchesWay(world, cell, plan.way)) return false
        if (!here || plan.way === 'ridge') return true
        const there = wayAt(cell, plan.way, here.name)
        return there !== undefined && Math.abs(there.at - here.at) === 1 && (sense === 0 || Math.sign(there.at - here.at) === sense)
      })
      const wanted = plan.wind ?? heading
      if (options.length > 1 && wanted) {
        const ahead = options.filter((o) => sameGeneralWay(o.direction, wanted))
        // Without a way that goes on as before, at least do not turn back.
        const onwards = plan.wind || !heading ? [] : options.filter((o) => o.direction !== OPPOSITE[heading!])
        if (ahead.length) options = ahead
        else if (onwards.length) options = onwards
      }
      options.sort((a, b) => a.direction.localeCompare(b.direction))
      if (options.length === 0) {
        reason = steps === 0 ? 'The way ends here.' : 'The way you were following ends here.'
        break
      }
      if (options.length > 1) {
        reason = `The way goes ${options.map((c) => pretty(c.direction)).join(' and ')} from here. Say which: follow ${plan.way === 'ridge' ? 'the ridge' : 'it'} ${pretty(options[0]!.direction)}.`
        break
      }
      direction = options[0]!.direction
      next = options[0]!.hex
      const there = wayAt(map.cell(next)!, plan.way, here?.name)
      if (there) {
        if (here && sense === 0) sense = Math.sign(there.at - here.at)
        following = there.name
      }
    }
    if (!next || !map.inside(next)) {
      reason = 'You have come to the edge of the Holleveen.'
      break
    }
    const cell = map.cell(next)!
    if (!passable(world, cell)) {
      reason = cell.channel ? `A channel of open water bars the way; only a punt would cross it.` : `Deep water bars the way ${pretty(direction ?? plan.kind)}.`
      break
    }
    // In mist, off the road, you may lose your bearings (FO: Survival against DC 15; skills arrive in M5).
    const lost = sight(world, map, map.cell(at)!) <= 1 && !cell.way && !onKnownRidge(world, cell) && plan.kind !== 'follow' && world.rng.int('travel', 1, 20) < 15
    if (lost) {
      const drift = neighbours(at).filter((n) => map.cell(n.hex) && passable(world, map.cell(n.hex)!) && hexKey(n.hex) !== hexKey(next!))
      const pick = drift[world.rng.int('travel', 0, Math.max(0, drift.length - 1))]
      if (pick) next = pick.hex
    }
    heading = direction ?? heading
    at = next
    trail.add(hexKey(at))
    const stepCell = map.cell(at)!
    minutes += minutesFor(world, stepCell)
    steps++
    lands.add(stepCell.way ? stepCell.way.name : onKnownRidge(world, stepCell) ? 'the dry ridge' : stepCell.land)
    look(world, map, at)
    // On the way to somewhere, places on the road are passed through; any other walk stops there.
    const entrance = plan.kind === 'to' && steps + 1 < path!.length ? undefined : entranceOn(world, map, at)
    if (entrance && entrance !== startId) {
      arrived = entrance
      break
    }
    if (lost) {
      reason = 'The mist closes in and you lose your bearings.'
      break
    }
    if (stepCell.bog) {
      minutes += 10
      reason = 'The ground gives way under you and you sink to the knee. It takes a while to work free.'
      break
    }
    if (stepCell.feature === 'ruin' && plan.kind !== 'to') {
      reason = 'Something stands out of the sedge here: an old wall.'
      break
    }
    const before = minuteOfDay(world.now + minutes - minutesFor(world, stepCell))
    const after = minuteOfDay(world.now + minutes)
    if (before < 20 * 60 && after >= 20 * 60) {
      reason = 'Night is falling over the fen.'
      break
    }
    if (plan.kind === 'to' && steps + 1 >= path!.length) break
  }
  if (steps === 0) return [{ kind: 'error', text: reason || 'You stay where you are.' }]

  // What happened back where you started, you did not see: you were walking.
  pass(minutes)
  world.state.player.location = arrived ?? hexId(at)
  if (heading) mapState(world).heading = heading
  if (weather(world) === 'fog' && startWeather !== 'fog' && !reason) reason = 'A mist has come up while you walked.'
  const how = plan.kind === 'head' ? `You head ${pretty(plan.wind)}` : plan.kind === 'to' ? `You make your way towards ${plan.name}` : `You follow ${plan.way === 'ridge' ? 'the dry ridge' : plan.way}`
  const over = [...lands].map((l) => ({ fen: 'wet fen', fields: 'fields', woods: 'woods', heath: 'heath', water: 'the ice' })[l] ?? l)
  const summary = `${how} for ${duration(minutes)}, over ${list(over)}.${reason ? ` ${reason}` : ''}${arrived ? ` You come to ${world.location(arrived).name}.` : ''}`
  return { outputs: [{ kind: 'narration', text: summary }], minutes, at: world.state.player.location }
}

const OPPOSITE: Record<HexDirection, HexDirection> = { north: 'south', northeast: 'southwest', southeast: 'northwest', south: 'north', southwest: 'northeast', northwest: 'southeast' }

function sameGeneralWay(direction: HexDirection, wind: string): boolean {
  const target = wind.replace('-', '')
  if (direction === target) return true
  if (target === 'east') return direction === 'northeast' || direction === 'southeast'
  if (target === 'west') return direction === 'northwest' || direction === 'southwest'
  const i = HEX_DIRECTIONS.indexOf(direction)
  const j = HEX_DIRECTIONS.indexOf(target as HexDirection)
  return j >= 0 && (Math.abs(i - j) === 1 || Math.abs(i - j) === 5)
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours === 1 ? 'an hour' : `${hours} hours`}${rest >= 10 ? ` and ${rest} minutes` : ''}`
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? 'the land'
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** Which way a player means by "follow ...": a kind of way, a way by name, or the dry ridge. */
export function followWay(content: Content, words: string): string | undefined {
  const text = words.toLowerCase().trim()
  if (/^(dry |hidden )?ridge$|^droge rug$/.test(text)) return 'ridge'
  const region = [...content.regions.values()][0]
  const named = region?.paths.find((p) => p.name.toLowerCase().replace(/^the /, '') === text)
  if (named) return named.name
  if (/^(tow ?path|towpath|jaagpad|vaart|canal|graafse vaart)$/.test(text)) return 'canal'
  if (/^(road|weg|cart road)$/.test(text)) return 'road'
  if (/^(path|fen path|veenpad|pad)$/.test(text)) return 'path'
  return undefined
}

/** For the exits of a place at the edge: the ways out across country from here. */
export function crossCountryLine(world: World, locationId: string): string | undefined {
  const map = regionMap(world.content)
  const hex = map?.locations.get(locationId)
  if (!map || !hex || !canSetOut(world, locationId)) return undefined
  const names = new Set<string>()
  for (const h of [hex, ...neighbours(hex).map((n) => n.hex)]) for (const w of map.cell(h)?.ways ?? []) names.add(w.name)
  return names.size ? `Across country you can head any way, or follow ${[...names].sort().join(', ')}.` : 'Across country you can head any way from here.'
}
