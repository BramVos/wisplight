import { GameClock } from './clock'
import { NEEDS, type Content, type Need } from './content'
import type { StoriesState } from './stories'

// Everything that changes during play lives in GameState. It is plain JSON:
// a savegame is this object, and a replay rebuilds it from the input log.

export type Counts = Record<string, number>

export type GoalType = 'Produce' | 'Obtain' | 'Repair' | 'Eat' | 'Sleep' | 'Socialize' | 'Pray' | 'Work' | 'Visit' | 'Idle' | 'Talk' | 'Rest' | 'AskHelp'

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
  | { kind: 'spend'; minutes: number; activity: 'work' | 'socialize' | 'pray' | 'idle' | 'play'; label?: string }
  | { kind: 'askHelp'; item: string; qty: number }

export interface Pending {
  produces?: Counts
  satisfies?: Partial<Record<Need, number>>
  narrate?: string
  location?: string
  objectKey?: string
  setState?: Record<string, string | number | boolean>
}

/**
 * Something an NPC wants from the player (FO, chapter 14, "Verzoeken"). The
 * motor makes one from a situation (a lost knife, a fever, a missing tool);
 * the chronicler can work it out or make one from an open thread.
 */
export interface Request {
  id: string
  npc: string
  /** fetch: bring the item; recover: bring back what was lost or stolen; visit: go and see the target. */
  kind?: 'fetch' | 'recover' | 'visit'
  item?: string
  qty: number
  target?: string
  created: number
  status: 'open' | 'done' | 'failed'
  /** The storyline it came from. */
  line?: string
  name?: string
  /** What the giver says when asking. */
  ask?: string
  stakes?: string
  source?: 'motor' | 'chronicler'
  /** The giver has asked the player; from then on it is in the journal. */
  asked?: number
  /** In duiten, paid when it is done. */
  reward?: number
  done?: number
}

/** Events that belong together (design, "Hoe de kroniekschrijver de wereld ziet": het schrift met verhaallijnen). */
export interface Storyline {
  id: string
  title: string
  pattern?: string
  facts: string[]
  people: string[]
  places: string[]
  /** The chronicler's note: at most three lines. */
  summary: string[]
  roles: { role: string; who: string }[]
  hooks: string[]
  next: string
  open: boolean
  changed: number
  /** Facts the chronicler has already seen. */
  reported: string[]
}

/** A lore topic that came into being in this game (design, "Opslag": de kroniek). */
export interface LoreEntry {
  id: string
  name: string
  summary: string
  details: string
  story: string
  far: string
  teller?: string
  fame: number
  place: string
  line: string
  facts: string[]
  links: string[]
  t: number
  by: 'chronicler' | 'template'
}

export interface ChronicleRun {
  id: string
  t: number
  reason: 'night' | 'urgent'
  lines: string[]
}

export interface ChronicleState {
  seq: number
  lines: Storyline[]
  lore: LoreEntry[]
  /** One line of news per area, for "What's new around here?". */
  news: Record<string, { text: string; t: number }>
  pending: ChronicleRun[]
  runs: number
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
  /** Ill until then: stays home in bed. */
  sickUntil?: number
  /** Dead: out of the simulation for good. The fact tells how. */
  dead?: { t: number; fact: string }
  /** What stays on the NPC's mind for a while, from the chronicler. */
  thoughts?: { text: string; t: number; until: number }[]
  /** The day the AI last planned for this NPC, at getting up. */
  plannedDay?: number
  /**
   * Far from the player, or on a journey across country, the NPC is a note:
   * where, since when, until when, and how restless its life is (design,
   * "Wie waar is: detail naar afstand").
   */
  note?: {
    unrest: 'fixed' | 'travelling' | 'fleeing' | 'campaign'
    /** A location in the region, or a topic for a place beyond it. */
    where: string
    from?: string
    since: number
    until?: number
    activity: string
    /** After the days away, the way home. */
    home?: boolean
    /** On a journey out: how long to stay there. */
    stay?: number
  }
  /** Staying somewhere away from home for a while (sent there, or fled there). */
  stayAt?: { where: string; until: number }
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
  /** Areas the player has been to, for the news of a stranger arriving. */
  visited?: string[]
  /** Locations the player has stood in. */
  seen?: string[]
  /** Who told the player about a topic, and when (for the journal). */
  sources?: Record<string, { from: string; t: number; level: number }[]>
  /** The region map as the player knows it: hexes seen and walked, as bitsets (FO, chapter 4). */
  map?: { seen: string; walked: string; heading?: string }
  /** Areas the player has seen from afar. */
  seenAreas?: string[]
}

export interface ServiceState {
  stock: Counts
}

/**
 * Something that happened and that people can talk about (design: lore and world
 * change). The motor writes it; the versions are what people say at each level.
 */
export interface Fact {
  id: string
  kind: string
  /** The story pattern it came from, if any. */
  pattern?: string
  /** Topic ids the fact is about: people, places, items. */
  about: string[]
  place: string
  t: number
  /** 0 to 5: how far it will travel and how long it is remembered. */
  belang: number
  /** How juicy it is to retell, 0 to 1, fading with the days. */
  juice: number
  title: string
  /** False for a rumour that is simply not true. */
  truth?: boolean
  /** Level 3, 2 and 1: precise, as the village tells it, as it sounds far away. */
  text: { precise: string; village: string; far: string }
}

/** How someone heard of a fact: level, how sure, from whom, and whether it grew in the telling. */
export interface Heard {
  level: 1 | 2 | 3
  reliability: number
  from: string
  t: number
  grown?: boolean
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
  /** Story patterns in play, and the pacing (design: lore and world change). */
  stories?: StoriesState
  /** Facts and who heard them; "player" is the player. */
  news?: { seq: number; facts: Fact[]; heard: Record<string, Record<string, Heard>> }
  chronicle?: ChronicleState
  weather?: { kind: 'clear' | 'overcast' | 'rain' | 'fog' | 'storm' | 'frost' | 'snow'; since: number }
  /** Goal choices waiting for the brain model, and how many each NPC had today (FO, chapter 7). */
  brain?: { seq: number; pending: { id: string; npc: string; t: number; trigger: string }[]; counts: Record<string, { day: number; n: number }>; last?: Record<string, number>; due?: Record<string, number> }
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
