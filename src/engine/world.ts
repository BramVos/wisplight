import { isOpenAt } from './clock'
import { callName, type Content, type Direction, type Location, type Npc, type ObjectInstance, type ObjectType, type Service } from './content'
import { hexLocation, isHexId } from './map/travel'
import { Rng } from './rng'
import { objectKey, serviceKey, type GameState, type NpcState, type WorldEvent } from './state'

// World wraps content (fixed) and state (changing) with the lookups every
// system needs: presence, opening hours, prices, routes and knowledge.

export interface Route {
  nodes: string[]
  directions: Direction[]
  minutes: number
}

const MAX_EVENTS = 300

export class World {
  readonly rng: Rng
  private readonly routes = new Map<string, Route | undefined>()
  private readonly known = new Map<string, Set<string>>()
  /** Relations between people, built once from the content (see people.ts). */
  readonly tieCache = new Map<string, unknown>()
  /**
   * A model is connected, so the chronicler's runs and the NPCs' goal choices
   * wait for it; without one the templates and the utility function decide at
   * once. Set by the engine with the model, which the log records, so a replay
   * makes the same choice.
   */
  aiLive = false
  /** Things the player should be told after this command: experience, a patron's mood. Not saved. */
  notices: string[] = []

  constructor(
    readonly content: Content,
    readonly state: GameState,
  ) {
    this.rng = new Rng(state.rng, state.seed)
  }

  get now(): number {
    return this.state.minutes
  }

  location(id: string): Location {
    const loc = this.content.locations.get(id) ?? (isHexId(id) ? hexLocation(this, id) : undefined)
    if (!loc) throw new Error(`Unknown location ${id}`)
    return loc
  }

  npc(id: string): Npc {
    const npc = this.content.npcs.get(id)
    if (!npc) throw new Error(`Unknown NPC ${id}`)
    return npc
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

  service(locationId: string, serviceId: string): Service | undefined {
    return this.location(locationId).services.find((s) => s.id === serviceId)
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
    return this.alive(id) && !this.state.npcs[id]!.note
  }

  /** Someone who can serve is on the premises (the location itself or listed rooms). */
  staffed(locationId: string, provider: string, staff: string[] = [], premises: string[] = []): boolean {
    const places = new Set([locationId, ...premises])
    return [provider, ...staff].some((id) => this.present(id) && places.has(this.state.npcs[id]!.location))
  }

  serviceOpen(locationId: string, service: Service, at = this.now): boolean {
    return isOpenAt(at, service.hours, service.days) && this.staffed(locationId, service.provider, service.staff, service.premises)
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
    const key = `${from}>${to}`
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
      .replaceAll('{short}', npc.short)
      .replaceAll('{they}', forms.they)
      .replaceAll('{their}', forms.their)
      .replaceAll('{them}', forms.them)
  }
}
