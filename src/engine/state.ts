import { GameClock } from './clock'
import { NEEDS, type Content, type Need } from './content'

// Everything that changes during play lives in GameState. It is plain JSON:
// a savegame is this object, and a replay rebuilds it from the input log.

export type Counts = Record<string, number>

export type GoalType = 'Produce' | 'Obtain' | 'Repair' | 'Eat' | 'Sleep' | 'Socialize' | 'Pray' | 'Work' | 'Visit' | 'Idle'

export interface Goal {
  id: string
  type: GoalType
  item?: string
  qty?: number
  service?: string
  object?: string
  target?: string
  until?: number
  priority: number
  source: 'daily' | 'need' | 'schedule' | 'ai'
  created: number
}

export type Step =
  | { kind: 'move'; to: string }
  | { kind: 'waitOpen'; location: string; service?: string; object?: string }
  | { kind: 'buy'; location: string; service: string; item: string; qty: number }
  | { kind: 'use'; location: string; object: string; affordance: string; times: number }
  | { kind: 'stock'; location: string; service: string; item: string; qty: number }
  | { kind: 'repair'; location: string; object: string; consumes: Counts }
  | { kind: 'eat' }
  | { kind: 'sleep'; until: number; ready?: boolean }
  | { kind: 'spend'; minutes: number; activity: 'work' | 'socialize' | 'pray' | 'idle' | 'play' }
  | { kind: 'askHelp'; item: string; qty: number }

export interface Pending {
  produces?: Counts
  satisfies?: Partial<Record<Need, number>>
  narrate?: string
  location?: string
  objectKey?: string
  setState?: Record<string, string | number | boolean>
}

export interface Request {
  id: string
  npc: string
  item: string
  qty: number
  created: number
  status: 'open' | 'done'
}

export interface NpcState {
  location: string
  money: number
  inventory: Counts
  needs: Record<Need, number>
  goals: Goal[]
  plan: Step[]
  planGoal?: string
  replans: number
  busyUntil: number
  activity: string
  pending?: Pending
  waitSince?: number
  dailyDone: Record<string, number>
  lastAskHelp: Record<string, number>
  memory?: MemoryRecord[]
  /** What the NPC did lately, newest last, for the RECENTLY line in the prompt. */
  recent?: { t: number; text: string }[]
  /** Where the current journey started. */
  travelFrom?: string
  /** True while the NPC is only passing through its current location. */
  passing?: boolean
  sleepSince?: number
  wokenAt?: number
  /** Last time the NPC stopped to look at the player. */
  noticedPlayerAt?: number
}

export interface MemoryRecord {
  t: number
  note: string
  topics: string[]
  valence: number
}

export interface TalkState {
  npc: string
  turnsLeft: number
  history: { speaker: 'player' | 'npc'; text: string }[]
  effects: number
  revealed: string[]
}

export interface RelationState {
  affinity: number
  trust: number
  fear: number
  familiarity: number
}

export interface PlayerState {
  location: string
  money: number
  inventory: Counts
  lodging?: { location: string; until: number }
  journal?: Record<string, number>
}

export interface ServiceState {
  stock: Counts
}

/** A far-away place a model named in conversation, fixed in the savegame (design: lore and world change). */
export interface FarName {
  id: string
  name: string
  kind: 'city' | 'land' | 'sea' | 'river' | 'lake'
  /** The sentence it was first named in. */
  line: string
  by: string
  t: number
  known_by: string[]
}

export interface WorldEvent {
  t: number
  seq: number
  kind: string
  location: string
  actor?: string
  text: string
}

export interface GameState {
  version: 1
  seed: number
  rng: Record<string, number>
  minutes: number
  player: PlayerState
  npcs: Record<string, NpcState>
  objects: Record<string, Record<string, string | number | boolean>>
  services: Record<string, ServiceState>
  ground: Record<string, Counts>
  requests: Request[]
  events: WorldEvent[]
  eventSeq: number
  seenSeq: number
  goalSeq: number
  relations?: Record<string, RelationState>
  talk?: TalkState
  /** The lore layer of this game, on top of the base lore from the content. */
  lore?: { far: FarName[] }
}

export const objectKey = (location: string, object: string) => `${location}/${object}`
export const serviceKey = (location: string, service: string) => `${location}#${service}`

export function createInitialState(content: Content, seed: number): GameState {
  const { world } = content
  const start = GameClock.from(world.start.year, world.start.month, world.start.day, world.start.hour, world.start.minute)

  const npcs: Record<string, NpcState> = {}
  for (const npc of [...content.npcs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    npcs[npc.id] = {
      location: npc.home,
      money: npc.money,
      inventory: { ...npc.inventory },
      needs: Object.fromEntries(NEEDS.map((n) => [n, n === 'hunger' || n === 'rest' ? 80 : 70])) as Record<Need, number>,
      goals: [],
      plan: [],
      replans: 0,
      busyUntil: start.minutes,
      activity: 'at home',
      dailyDone: {},
      lastAskHelp: {},
    }
  }

  const objects: GameState['objects'] = {}
  const services: GameState['services'] = {}
  const ground: GameState['ground'] = {}
  for (const loc of content.locations.values()) {
    for (const obj of loc.objects) objects[objectKey(loc.id, obj.id)] = { ...obj.state }
    for (const svc of loc.services) {
      services[serviceKey(loc.id, svc.id)] = {
        stock: Object.fromEntries(Object.entries(svc.sells).map(([item, s]) => [item, s.stock])),
      }
    }
    if (Object.keys(loc.items).length > 0) ground[loc.id] = { ...loc.items }
  }

  return {
    version: 1,
    seed,
    rng: {},
    minutes: start.minutes,
    player: { location: world.start.location, money: world.player.money, inventory: { ...world.player.inventory } },
    npcs,
    objects,
    services,
    ground,
    requests: [],
    events: [],
    eventSeq: 0,
    seenSeq: 0,
    goalSeq: 0,
  }
}
