import type { Archived } from './archive'
import { grownContent } from './growth/growth'
import { DEFAULT_CALENDAR, GameClock, isOpenAt, type Calendar } from './clock'
import { callName, type Content, type Direction, type Location, type Npc, type ObjectInstance, type ObjectType, type Service } from './content'
import { DEFAULT_MONEY, formatMoney, type MoneyUnit } from './items'
import { mergeNpc, staffOf } from './layer'
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

/** The names the game's own texts use for a world (M8); the Nethermarch's when world.yaml has none. */
export interface WorldWords {
  land: string
  region: string
  from: string
  /** Wanted "in the Count's land"; fines go to the officer, at the office or to the NPC. */
  law: { where: string; officer: string; npc?: string; office?: string; lord?: string }
}
const NETHERMARCH_WORDS: WorldWords = {
  land: 'the Nethermarch',
  region: 'the Holleveen',
  from: 'Graafhaven',
  law: { where: "in the Count's land", officer: 'schout', npc: 'npc_everhard', office: 'loc_schout_house', lord: 'the Count' },
}

/** The words of a world, from its content. */
export function wordsOf(content: Pick<Content, 'world'>): WorldWords {
  const w = content.world
  return { ...NETHERMARCH_WORDS, ...w.words, law: w.law ?? (w.words ? { where: `in ${w.words.region}`, officer: 'watch' } : NETHERMARCH_WORDS.law) }
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

  /** The names this world's texts use: the land, the region, the law (M8). */
  get words(): WorldWords {
    return wordsOf(this.content)
  }

  get calendar(): Calendar {
    return this.content.world.calendar ?? DEFAULT_CALENDAR
  }

  get coins(): readonly MoneyUnit[] {
    return this.content.world.money?.units ?? DEFAULT_MONEY
  }

  /** An amount of money in this world's coins. */
  money(amount: number): string {
    return formatMoney(amount, this.coins)
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
    return isOpenAt(at, service.hours, service.days) && this.staffed(locationId, service.provider, staff, service.premises)
  }

  objectOpen(locationId: string, object: ObjectInstance, at = this.now): boolean {
    if (!isOpenAt(at, object.hours, object.days)) return false
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
    return Math.max(1, Math.round(base * factor))
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
