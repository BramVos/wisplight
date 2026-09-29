import type { Archived } from './archive'
import { grownContent } from './growth/growth'
import { calendarOf, GameClock, isOpenAt, type Calendar } from './clock'
import { callName, type Content, type Direction, type Land, type Location, type Npc, type ObjectInstance, type ObjectType, type Service } from './content'
import { formatMoney, parseMoney, type MoneyUnit } from './items'
import { frameOf, type Frame } from './lands'
import { mergeNpc, staffOf } from './layer'
import { regionMap } from './map/region'
import { hexLocation, isHexId } from './map/travel'
import { Rng } from './rng'
import { objectKey, serviceKey, type Fact, type GameState, type NpcState, type WorldEvent } from './state'

// World wraps content (fixed) and state (changing) with the lookups every
// system needs: presence, opening hours, prices, routes and knowledge.

export interface Route {
  nodes: string[]
  directions: Direction[]
  minutes: number
}

const MAX_EVENTS = 300

/** The names the game's own texts use for a world (M8); neutral words when world.yaml has none (M10.17). */
export interface WorldWords {
  land: string
  region: string
  from: string
  /** Wanted "in the Count's land"; fines go to the officer, at the office or to the NPC. */
  law: { where: string; officer: string; npc?: string; office?: string; lord?: string }
  /** How a night's sleep reads (M10.17). */
  sleep: { room: string; home: string; rough: string }
}
/** What a world without words of its own is called (M10.17): never another world's names, and a law without an officer. */
const NEUTRAL_WORDS: WorldWords = {
  land: 'the land',
  region: 'the region',
  from: 'far away',
  law: { where: 'here', officer: 'watch' },
  sleep: {
    room: 'You sleep under a heavy blanket.',
    home: 'You sleep at home, in your own bed, beside the one you married.',
    rough: 'You sleep rough, and badly. The cold gets into your bones.',
  },
}

/** The words of a world, from its content; in a land (M10.23), the land's own over the world's. */
export function wordsOf(content: Pick<Content, 'world'>, land?: Land): WorldWords {
  const w = content.world
  const home: WorldWords = { ...NEUTRAL_WORDS, ...w.words, sleep: { ...NEUTRAL_WORDS.sleep, ...w.words?.sleep }, law: w.law ?? (w.words ? { where: `in ${w.words.region}`, officer: 'watch' } : NEUTRAL_WORDS.law) }
  if (!land) return home
  // In a land the stranger comes from the world's land, and a land without a law of its own has the world's kind of officer, there.
  const own = land.words
  return {
    land: own?.land ?? land.name,
    region: own?.region ?? land.name,
    from: own?.from ?? home.land,
    sleep: { ...home.sleep, ...own?.sleep },
    law: land.law ?? { ...home.law, where: `in ${land.name}`, npc: undefined, office: undefined },
  }
}

/** The first letter up: "The Holleveen". */
export const upper = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

export class World {
  readonly rng: Rng
  private readonly routes = new Map<string, Route | undefined>()
  private readonly known = new Map<string, Set<string>>()
  /** Relations between people, built once from the content and the layer (see people.ts). */
  readonly tieCache = new Map<string, unknown>()
  /** People and services with the layer of this game on top (M8.1), built when first asked for. */
  private readonly merged = new Map<string, Npc>()
  private readonly mergedServices = new Map<string, Service>()
  /**
   * A model is connected, so the chronicler's runs and the NPCs' goal choices
   * wait for it; without one the templates and the utility function decide at
   * once. Set by the engine with the model, which the log records, so a replay
   * makes the same choice.
   */
  aiLive = false
  /**
   * What a call would cost when it reaches the player's threshold for a
   * question, or undefined to go ahead (M10.21, asking.ts). Set by the engine,
   * which asks its client and keeps the answer in the log. Not saved.
   */
  costAsk?: (id: string, request: import('./dialogue/llm').LlmRequest) => number | undefined
  /** Things the player should be told after this command: experience, a patron's mood. Not saved. */
  notices: string[] = []
  /** Deaths since the engine last looked, for the quests (not saved: handled in the same step). */
  deaths: string[] = []
  /** The facts that cause what happens now (M9.2): set while a plan, a phase or an aftermath runs; a new fact takes them as its cause. Not saved. */
  causing: string[] = []
  /** What went to the archive since the engine last looked, for the game log (M9.1; not saved). */
  archived: Archived[] = []
  /** The last stock lines that stood in for the model, and why (M10.8), for the dev menu. Not saved. */
  stockLines: { t: number; npc: string; reason: string }[] = []
  /** What the guard did this session (M10.10), by what: oaths put right, words put right, asked again, numbers noted. Not saved. */
  guard: Record<string, number> = {}
  /**
   * The archive to read back from (M10.2): the game log of this game, set by
   * whoever keeps it (the desktop app). Without it, what went to the archive
   * is simply not there. Not saved.
   */
  archive?: { fact(id: string): Fact | undefined }

  /** The content of this game: the world's own, with what the game added (M8.5, growth). */
  content: Content
  constructor(
    /** The world's own content, as written. */
    readonly base: Content,
    readonly state: GameState,
  ) {
    this.rng = new Rng(state.rng, state.seed)
    this.content = grownContent(base, state)
  }

  /** New people or places entered the world (M8.5): the content of the game is laid anew, and what was worked out from it is forgotten. */
  regrow(): void {
    this.content = grownContent(this.base, this.state)
    this.routes.clear()
    this.layerChanged()
  }

  get now(): number {
    return this.state.minutes
  }

  /** The land the stranger is in (M10.23): undefined for the world's home land. */
  get land(): string | undefined {
    return this.content.areas.get(this.areaHere() ?? '')?.land
  }

  /** The area the stranger is in, without making a hex a place (naming a hex asks for the land's palette). */
  private areaHere(): string | undefined {
    const at = this.state.player.location
    return this.content.locations.get(at)?.area ?? (isHexId(at) ? regionMap(this.content)?.region.area : undefined)
  }

  /** The land the area the stranger is in shades into (M10.23; the world's id for the home land), if it does. */
  get blend(): string | undefined {
    return this.content.areas.get(this.areaHere() ?? '')?.blend
  }

  /** The frame the stranger plays under (M10.23): the land's where they are, else the world's. */
  get frame(): Frame {
    return frameOf(this.content, this.land)
  }

  /** The names this world's texts use: the land, the region, the law (M8); in a land, the land's (M10.23). */
  get words(): WorldWords {
    return wordsOf(this.content, this.frame.land)
  }

  private anchored?: Calendar
  /** The world's calendar, its week anchored on its own start (M10.17). */
  get calendar(): Calendar {
    return (this.anchored ??= calendarOf(this.content.world))
  }

  /** The coins where the stranger is (M10.23: a land's own), largest first. */
  get coins(): readonly MoneyUnit[] {
    return this.frame.coins
  }

  /** An amount of money in the world's smallest coin, told in the coins where the stranger is (M10.23: at the land's rate). */
  money(amount: number): string {
    const f = this.frame
    return formatMoney(amount * f.rate, f.coins)
  }

  /** An amount the stranger names in the coins where they are, in the world's smallest coin (M10.23): rounded up, never short. */
  parseMoney(text: string): number | undefined {
    const f = this.frame
    const amount = parseMoney(text, f.coins)
    return amount === undefined ? undefined : Math.ceil(amount / f.rate)
  }

  /** What a coin where the stranger is is worth in the world's smallest coin (M10.23), at least one. */
  coinWorth(unit: MoneyUnit): number {
    return Math.max(1, Math.ceil(unit.value / this.frame.rate))
  }

  /** The date and time as this world writes them. */
  date(minutes = this.now): string {
    return new GameClock(minutes).format(this.calendar)
  }

  location(id: string): Location {
    const loc = this.content.locations.get(id) ?? (isHexId(id) ? hexLocation(this, id) : undefined)
    if (!loc) throw new Error(`Unknown location ${id}`)
    return loc
  }

  /** Someone as they are now: the content with the changes of this game (a new home, work, ties). */
  npc(id: string): Npc {
    const npc = this.content.npcs.get(id)
    if (!npc) throw new Error(`Unknown NPC ${id}`)
    if (!this.state.layer) return npc
    let merged = this.merged.get(id)
    if (!merged) {
      merged = mergeNpc(this, npc)
      this.merged.set(id, merged)
    }
    return merged
  }

  /** The layer changed: everything built from it is built again when asked for. */
  layerChanged(): void {
    this.merged.clear()
    this.mergedServices.clear()
    this.tieCache.clear()
    this.known.clear()
  }

  npcState(id: string): NpcState {
    const npc = this.state.npcs[id]
    if (!npc) throw new Error(`No state for NPC ${id}`)
    return npc
  }

  object(locationId: string, objectId: string): { instance: ObjectInstance; type: ObjectType } | undefined {
    const instance = this.location(locationId).objects.find((o) => o.id === objectId)
    const type = instance && this.content.objectTypes.get(instance.type)
    return instance && type ? { instance, type } : undefined
  }

  objectState(locationId: string, objectId: string): Record<string, string | number | boolean> {
    const key = objectKey(locationId, objectId)
    this.state.objects[key] ??= {}
    return this.state.objects[key]
  }

  /** A service as it is now: who serves there may have changed in play (M8.1). */
  service(locationId: string, serviceId: string): Service | undefined {
    const service = this.location(locationId).services.find((s) => s.id === serviceId)
    if (!service || !this.state.layer?.staff) return service
    const key = serviceKey(locationId, serviceId)
    let merged = this.mergedServices.get(key)
    if (!merged) {
      merged = { ...service, staff: staffOf(this, locationId, service) }
      this.mergedServices.set(key, merged)
    }
    return merged
  }

  stock(locationId: string, serviceId: string): Record<string, number> {
    const key = serviceKey(locationId, serviceId)
    this.state.services[key] ??= { stock: {} }
    return this.state.services[key].stock
  }

  /** The living people here, not away or on a journey. */
  npcsAt(locationId: string): string[] {
    return Object.keys(this.state.npcs)
      .filter((id) => this.state.npcs[id]!.location === locationId && this.present(id))
      .sort()
  }

  alive(id: string): boolean {
    return !!this.state.npcs[id] && !this.state.npcs[id]!.dead
  }

  /** Alive and somewhere: not a note on a journey or far away. */
  present(id: string): boolean {
    return !this.state.npcs[id]?.absent && this.alive(id) && !this.state.npcs[id]!.note
  }

  /** Someone who can serve is on the premises (the location itself or listed rooms). */
  staffed(locationId: string, provider: string, staff: string[] = [], premises: string[] = []): boolean {
    const places = new Set([locationId, ...premises])
    return [provider, ...staff].some((id) => this.present(id) && places.has(this.state.npcs[id]!.location))
  }

  serviceOpen(locationId: string, service: Service, at = this.now): boolean {
    const staff = this.state.layer?.staff ? staffOf(this, locationId, service) : service.staff
    return isOpenAt(at, service.hours, service.days, this.calendar) && this.staffed(locationId, service.provider, staff, service.premises)
  }

  objectOpen(locationId: string, object: ObjectInstance, at = this.now): boolean {
    if (!isOpenAt(at, object.hours, object.days, this.calendar)) return false
    return object.provider ? this.staffed(locationId, object.provider, object.staff) : true
  }

  basePrice(item: string, service?: Service): number {
    return service?.sells[item]?.price ?? this.content.items.get(item)?.value ?? 1
  }

  /** Price per unit: base x sqrt(target / stock), between half and three times the base. */
  price(locationId: string, service: Service, item: string): number {
    const base = this.basePrice(item, service)
    const target = service.sells[item]?.target ?? 1
    const stock = this.stock(locationId, service.id)[item] ?? 0
    const factor = Math.min(3, Math.max(0.5, Math.sqrt(target / Math.max(stock, 1))))
    // Prices in the area for a while (M10.14: the first market after the mill turns again).
    const area = this.content.locations.get(locationId)?.area
    const spell = area ? this.state.prices?.[area] : undefined
    const now = spell && spell.until > this.now ? spell.factor : 1
    return Math.max(1, Math.round(base * factor * now))
  }

  /** What a trader pays the player for an item. */
  offer(item: string): number {
    return Math.max(1, Math.floor((this.content.items.get(item)?.value ?? 1) / 2))
  }

  route(from: string, to: string): Route | undefined {
    const closed = this.state.closed ? Object.keys(this.state.closed).join(',') : ''
    const key = `${from}>${to}${closed ? `#${closed}` : ''}`
    if (this.routes.has(key)) return this.routes.get(key)
    const result = this.dijkstra(from, to)
    this.routes.set(key, result)
    return result
  }

  private dijkstra(from: string, to: string): Route | undefined {
    if (from === to) return { nodes: [from], directions: [], minutes: 0 }
    const dist = new Map<string, number>([[from, 0]])
    const prev = new Map<string, { node: string; direction: Direction }>()
    const open = new Set<string>([from])
    while (open.size > 0) {
      let current = ''
      let best = Infinity
      for (const node of open) {
        const d = dist.get(node)!
        if (d < best || (d === best && node < current)) {
          best = d
          current = node
        }
      }
      open.delete(current)
      if (current === to) break
      for (const [direction, exit] of Object.entries(this.location(current).exits)) {
        if (!exit) continue
        // A route closed by a flood or a war (design: effect plans) is no way through.
        if (this.state.closed?.[[current, exit.to].sort().join('|')]) continue
        const next = best + exit.minutes
        if (next < (dist.get(exit.to) ?? Infinity)) {
          dist.set(exit.to, next)
          prev.set(exit.to, { node: current, direction: direction as Direction })
          open.add(exit.to)
        }
      }
    }
    if (!dist.has(to)) return undefined
    const nodes = [to]
    const directions: Direction[] = []
    let cursor = to
    while (cursor !== from) {
      const p = prev.get(cursor)!
      directions.unshift(p.direction)
      nodes.unshift(p.node)
      cursor = p.node
    }
    return { nodes, directions, minutes: dist.get(to)! }
  }

  /** Locations an NPC knows well enough to plan with: its own areas plus the ones it knows. */
  knownLocations(npcId: string): Set<string> {
    const cached = this.known.get(npcId)
    if (cached) return cached
    const npc = this.npc(npcId)
    const areas = new Set([...npc.knows_areas, this.location(npc.home).area])
    if (npc.work) areas.add(this.location(npc.work).area)
    const result = new Set([...this.content.locations.values()].filter((l) => areas.has(l.area)).map((l) => l.id))
    this.known.set(npcId, result)
    return result
  }

  emit(kind: string, location: string, text: string, actor?: string): WorldEvent {
    const event: WorldEvent = { t: this.now, seq: ++this.state.eventSeq, kind, location, text, actor }
    this.state.events.push(event)
    if (this.state.events.length > MAX_EVENTS) this.state.events.splice(0, this.state.events.length - MAX_EVENTS)
    return event
  }

  /** Fills {name}, {short}, {they}, {their} and {them} for an NPC. */
  say(template: string, npcId: string): string {
    const npc = this.npc(npcId)
    const forms = {
      she: { they: 'she', their: 'her', them: 'her' },
      he: { they: 'he', their: 'his', them: 'him' },
      they: { they: 'they', their: 'their', them: 'them' },
    }[npc.pronoun]
    const first = callName(npc)
    return template
      .replaceAll('{name}', first)
      // A hidden trade stays out of the short name until the stranger knows it (M10.8).
      .replaceAll('{short}', npc.hidden && this.state.player.people?.[npcId]?.work === undefined ? (npc.short_public ?? first) : npc.short)
      .replaceAll('{they}', forms.they)
      .replaceAll('{their}', forms.their)
      .replaceAll('{them}', forms.them)
  }
}
