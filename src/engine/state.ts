import { GameClock } from './clock'
import { NEEDS, type Content, type Need, type Npc } from './content'
import type { StoriesState } from './stories'
import type { Combat } from './combat/types'
import type { Character } from './rules/character'
import type { Clock } from './rules/player'
import type { Companion } from './social/companions'
import type { Crime } from './social/crime'
import type { QuestState } from './quests/engine'
import type { PlaceStateName } from './quests/schema'
import type { PlanState } from './quests/plans'

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
  /** Anger or joy that lasts a while, -10 to +10 (FO, chapter 8). */
  mood?: { value: number; until: number; reason: string }
  /** Something the player did that the NPC wants to have out with them (the goal Confront). */
  grievance?: { reason: string; t: number; line: string }
  /** Hit points lost in a fight, healing a little every hour. */
  wounds?: number
  /** Where the NPC was before and when it left, for coincidences. */
  left?: { location: string; t: number }
  /** Travelling with the player as a companion: the simulation leaves it be. */
  following?: boolean
  /** Not in the world (yet): under a curse, or gone for good until a quest brings them back. */
  absent?: boolean
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

/** A debt in the ledger (FO, chapter 8): who owes whom, how much, and by when. */
export interface Debt {
  id: string
  from: string
  to: string
  amount: number
  kind: 'money' | 'favour'
  t: number
  due?: number
  note?: string
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
  /** The player character (FO, chapter 11). */
  character?: Character
  /** Half the money, left where the player fell (the Way of the Grey Rider). */
  lostPurse?: { location: string; amount: number; t: number }
  /** Died three times: the Grey Rider wants a price. */
  riderPrice?: boolean
  /** When each encounter last happened. */
  encounters?: Record<string, number>
  /** Conditions on the player that wear off, and when. */
  conditionsUntil?: Record<string, number>
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
  /** Far places worked out to their outline for this game (design, "De wereld buiten de kaart"). */
  outlines?: { pending: string[]; done: Record<string, unknown> }
  /** Goal choices waiting for the brain model, and how many each NPC had today (FO, chapter 7). */
  /** The four numbers between NPCs (FO, chapter 8), by NPC and then the other NPC. */
  bonds?: Record<string, Record<string, { affinity: number; trust: number; fear: number; familiarity: number }>>
  /** Debts in money and favours, between NPCs and with the player. */
  ledger?: Debt[]
  /** Gifts this week per NPC, for diminishing returns. */
  gifts?: Record<string, { week: number; count: number }>
  /** The player's reputation per faction, -100 to 100, and the factions the player joined. */
  reputation?: Record<string, number>
  memberships?: string[]
  /** Crimes the world knows of, witnesses who keep quiet, and fines per law. */
  crimes?: Crime[]
  silenced?: Record<string, string[]>
  wanted?: Record<string, { fine: number; since: number }>
  /** The player's companions (FO, chapter 13). */
  companions?: Companion[]
  /** Romance per NPC (FO, chapter 8). */
  romance?: Record<string, { stage: 'interest' | 'courting' | 'together' | 'bound'; since: number }>
  /** Tension between realms, 0 to 100 (design: lore and world change, "Staatkunde"). */
  tension?: Record<string, number>
  /** NPCs a companion is distracting, until when. */
  distracted?: Record<string, number>
  /** Coincidences already noticed, so each is told once. */
  coincidences?: Record<string, number>
  /** Written quests in play (FO, chapter 14), and the flags quests and the world set. */
  questlog?: Record<string, QuestState>
  flags?: Record<string, string | number | boolean>
  /** Places whose state changed: flooded, damaged, destroyed, abandoned, occupied, drained. */
  places?: Record<string, { state: PlaceStateName; since: number }>
  /** Effect plans in progress (design: grote gebeurtenissen), and plans waiting to start. */
  plans?: PlanState[]
  pendingPlans?: string[]
  /** Routes closed by an event: exits that cannot be used, with the reason. */
  closed?: Record<string, string>
  /** Scarcity: what comes in of a thing, as a share of what came before. */
  market?: Record<string, number>
  /** The news of the day per area, set by an effect plan. */
  areaNews?: Record<string, string>
  /** The fight in progress (FO, chapter 12). */
  combat?: Combat
  /** Progress clocks: threats and long jobs (FO, chapter 11). */
  clocks?: Record<string, Clock>
  brain?: { seq: number; pending: { id: string; npc: string; t: number; trigger: string }[]; counts: Record<string, { day: number; n: number }>; last?: Record<string, number>; due?: Record<string, number> }
}

export const objectKey = (location: string, object: string) => `${location}/${object}`
export const serviceKey = (location: string, service: string) => `${location}#${service}`

export function newNpcState(npc: Npc, now: number): NpcState {
  return {
    ...(npc.absent ? { absent: true } : {}),
    location: npc.home,
    money: npc.money,
    inventory: { ...npc.inventory },
    needs: Object.fromEntries(NEEDS.map((n) => [n, n === 'hunger' || n === 'rest' ? 80 : 70])) as Record<Need, number>,
    goals: [],
    plan: [],
    replans: 0,
    busyUntil: now,
    activity: 'at home',
    dailyDone: {},
    lastAskHelp: {},
  }
}

/** After the content changed under a running game (the world builder): new people get a state, removed ones go. */
export function fitStateToContent(content: Content, state: GameState): void {
  for (const npc of [...content.npcs.values()].sort((a, b) => a.id.localeCompare(b.id))) state.npcs[npc.id] ??= newNpcState(npc, state.minutes)
  for (const id of Object.keys(state.npcs)) if (!content.npcs.has(id)) delete state.npcs[id]
}

export function createInitialState(content: Content, seed: number): GameState {
  const { world } = content
  const start = GameClock.from(world.start.year, world.start.month, world.start.day, world.start.hour, world.start.minute)

  const npcs: Record<string, NpcState> = {}
  for (const npc of [...content.npcs.values()].sort((a, b) => a.id.localeCompare(b.id))) npcs[npc.id] = newNpcState(npc, start.minutes)

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
