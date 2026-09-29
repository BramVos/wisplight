import { GameClock } from './clock'
import { NEEDS, type Content, type Need, type Npc } from './content'
import type { StoriesState } from './stories'
import type { EconomyState } from './economy/ledger'
import type { GrowthState } from './growth/growth'
import type { Combat } from './combat/types'
import type { Character } from './rules/character'
import type { Load } from './economy/haul'
import type { Crowd } from './growth/crowds'
import type { Clock } from './rules/player'
import type { Companion } from './social/companions'
import type { Crime } from './social/crime'
import type { QuestState } from './quests/engine'
import type { PlaceStateName } from './quests/schema'
import type { PlanState } from './quests/plans'

// Everything that changes during play lives in GameState. It is plain JSON:
// a savegame is this object, and a replay rebuilds it from the input log.

export type Counts = Record<string, number>

export type GoalType =
  | 'Produce' | 'Obtain' | 'Repair' | 'Eat' | 'Sleep' | 'Socialize' | 'Pray' | 'Work' | 'Visit' | 'Idle' | 'Talk' | 'Rest' | 'AskHelp'
  // The rest of the catalogue (FO, chapter 7; M7.2).
  | 'Sell' | 'Deliver' | 'Meet' | 'Follow' | 'Guard' | 'Avoid' | 'Help' | 'Spread' | 'Court' | 'Celebrate' | 'Investigate' | 'Report' | 'Confront' | 'RecruitHelp' | 'Steal' | 'Sabotage' | 'Harm' | 'Flee'

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
  /** Facts to tell the target when they meet: a report carried there (M8.2). */
  message?: string[]
  /** The agreement this goal carries out (M10.2): when it is done, the register hears of it. */
  agreement?: string
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
  /** The moment a goal is for, once the NPC is there (npc/acts.ts). */
  | { kind: 'act'; act: import('./npc/acts').ActKind; target?: string; item?: string }

export interface Pending {
  produces?: Counts
  satisfies?: Partial<Record<Need, number>>
  narrate?: string
  location?: string
  objectKey?: string
  setState?: Record<string, string | number | boolean>
}

/**
 * An agreement (M10.2; design: signalen en nasleep, "Het verhaal- en
 * afsprakenregister"): an offer that went through, an intention after a
 * conversation, a promise of the player. One record with a fixed id, the
 * parties, what, when, the terms, and a status that only the rules change.
 */
export type AgreementKind = 'accompany' | 'lead' | 'message' | 'meet' | 'wait' | 'give' | 'lend' | 'errand' | 'attack' | 'intention'
export type AgreementStatus = 'open' | 'kept' | 'missed' | 'cancelled' | 'impossible'

export interface AgreementTerms {
  /** accompany: how long or how far, the wage, the limits, and what makes them go. */
  until?: number
  untilPlace?: string
  wage?: number
  limits?: string[]
  leaves?: string[]
  /** lead: whom to, where, where the leader thinks that person is, how long they wait, and what if nobody is there. */
  person?: string
  place?: string
  thinks?: string
  waits?: number
  ifAbsent?: 'wait' | 'return' | 'search'
  arrived?: number
  /** When the one led got there and the person was not. */
  met?: number
  /** lead with the player (M10.3): the leader goes one place ahead and waits; wrong turns and turns without following. */
  ahead?: boolean
  /** lead where no road of the exits goes (M10.6): the leader walks beside the player across country. */
  overland?: boolean
  wrong?: number
  turns?: number
  /** fetch (M10.3): where to bring the person back to. */
  bring?: string
  /** message: to whom, about what, which facts, on what condition; delivered when the other has heard it. */
  recipient?: string
  about?: string
  facts?: string[]
  condition?: string
  delivered?: number
  /** meet: from when, and who came; and a lock the one who comes opens there (M10.5: a smith called in). */
  at?: number
  came?: string[]
  open?: string
  /** give: a thing or a sum, and the debt it pays; lend: the thing, which stays the lender's, and back by the due time. */
  item?: string
  amount?: number
  debt?: string
  /** attack: whom, and why; the fight itself is the combat system's. */
  target?: string
  reason?: string
  fought?: number
  /** intention: a goal of the catalogue. */
  goal?: string
  /** errand (M10.3): the request the stranger gave their word to, such as looking in on someone. */
  request?: string
}

export interface Agreement {
  id: string
  kind: AgreementKind
  /** Who does it: an NPC, or "player". */
  by: string
  /** For whom: an NPC, "player", or nobody for an intention of one's own. */
  to?: string
  source: 'offer' | 'conversation' | 'player' | 'brain' | 'chronicler' | 'rules'
  /** In plain words, for the journal and the voice. */
  what: string
  t: number
  /** By when; past it, the rules settle an open agreement. Without it, it runs until something ends it. */
  due?: number
  terms: AgreementTerms
  status: AgreementStatus
  /** Whether the other knows of it: they were there when it was made. Only then do they judge it. */
  known: boolean
  outcome?: { t: number; text: string; fault?: 'by' | 'to' | 'world'; fact?: string; told?: boolean }
  /** What the maker believed when it was made, apart from what is true (where someone would be). */
  belief?: string
  /** A bluff or a lie, recorded as such: what was said, and what the maker knew. */
  deceit?: { said: string; knew: string }
  /** What the other made of it when it was not kept, from what they knew. */
  judged?: 'understood' | 'let_down' | 'betrayed'
  /** Everything the one choice recorded: a plan, a journal note, an expectation. */
  effects: { kind: 'plan' | 'journal' | 'expect'; ref: string }[]
  /** Breaks along the way, each with its end: paused, rerouted or ended, and whether they come back. */
  interruptions?: { t: number; why: string; then: 'pause' | 'reroute' | 'end'; back: boolean; resumed?: number }[]
  /** Part of a larger agreement: a wait while travelling with the player. */
  part?: string
  /** A second go at one the stranger did not keep (M10.14): kept, it makes that one good. */
  remakes?: string
  /** What the stranger did about letting them down (M10.14): said sorry, explained, offered it again, made it good, or was refused. */
  amends?: { how: 'apologised' | 'explained' | 'redo' | 'made_good' | 'refused'; t: number; redo?: string }
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
  /** Where it stands, as the chronicler set it (M8.3): the pace of the world weighs it. */
  phase?: 'setup' | 'rising' | 'crisis' | 'resolution' | 'closed'
  /** When it came to its crisis: no three climaxes in one week. */
  crisisAt?: number
  /** The storyline this one goes on from (M9.2): a full line split, or the line of what caused it. */
  follows?: string
  /** What caused it: the causes of its first fact, carried over when it splits. */
  cause?: string[]
  /**
   * Active, dormant or closed (M10.2). A line closes only by an outcome: the
   * chronicler's closed phase, or no open question left. Without change it
   * goes dormant and keeps what brings it back. Old saves have none: open is
   * active, a closed phase or no open question is closed, else dormant.
   */
  status?: 'active' | 'dormant' | 'closed'
  /** Since when it sleeps (M10.2). */
  dormantSince?: number
  /** When it woke again, and by which fact (M10.2). */
  resumed?: { t: number; by: string }[]
  /** When a round last told of it (M10.30): the talks since then go with the next round. */
  told?: number
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
  /** Legends from an old game (M9.1) have no facts: the old know them best, and those who live near where it happened. */
  by: 'chronicler' | 'template' | 'legend'
}

export interface ChronicleRun {
  id: string
  t: number
  /** The night round, a run that cannot wait, or the spark of a quiet night (M10.27). */
  reason: 'night' | 'urgent' | 'spark'
  lines: string[]
  /** Signals to plan for in this run (M8.3). */
  signals?: string[]
  /** Asked by the pulse (M10.24): bring one hook near the stranger, in this area, not of this kind. */
  pulse?: { area: string; avoid?: string }
}

/**
 * What a run of the chronicler offered the model (M9.2): the facts it showed
 * and what it could name. Only these count as reported afterwards, and the
 * names in its answer are checked against these, not the world of later.
 */
export interface Offered {
  facts: string[]
  allowed: string[]
}

export interface ChronicleState {
  seq: number
  lines: Storyline[]
  lore: LoreEntry[]
  /** One line of news per area, for "What's new around here?". */
  news: Record<string, { text: string; t: number }>
  pending: ChronicleRun[]
  runs: number
  /** Signals waiting for the night run (M8.3). */
  signals?: string[]
  /** The game day of the last run that could not wait for the night (M10.22): one a day at most. */
  urgentDay?: number
  /** Quiet nights in a row, for the ladder of the spark (M10.27). */
  quiet?: number
}

export interface NpcState {
  /** A counter that could not sell a hungry buyer food (M10.24), not tried again until then. */
  foodTried?: { location: string; until: number }
  /** Crafts learnt from the stranger (M10.14), by rank from 0 (novice). */
  crafts?: Record<string, number>
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
  grievance?: { reason: string; t: number; line: string; quiet?: number }
  /** Will not serve the stranger until then (M10.3: insulted, they keep their trade shut for the day). */
  noService?: number
  /** Going to find the stranger, to open a talk with this line (M10.3, seek_player), until then. */
  seeking?: { line: string; since: number; until: number }
  /** Asking the stranger to come along somewhere (M10.3, left over: invite), until then. */
  inviting?: import('./social/invite').Invitation
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
  /** How often the NPC went after someone who walked on before a goal's moment. */
  chases?: number
  /** A place this NPC keeps away from, until then (the goal Avoid). */
  avoid?: { place: string; until: number }
  /** Whom this NPC last saw, where and when: what they can tell when asked where someone is. */
  sightings?: Record<string, { where: string; t: number }>
}

/** An ask of the stranger the night round may make a quest of (M10.30): its storyline, the fact, and the keys the call gave. */
export interface NightQuestWant {
  line: string
  asked: string
  /** Key to id, as the prompt named them (p1, l1, ...). */
  keys: Record<string, string>
}

/** A quest the night round made in play (M10.30): content like any written quest, held while it waits as a hook. */
export interface MadeQuest {
  id: string
  line: string
  asked: string
  quest: Record<string, unknown>
  t: number
  why: string
  held?: boolean
}

export interface MemoryRecord {
  t: number
  note: string
  topics: string[]
  valence: number
  /** Written after a talk with the stranger, in the speaker's words (M10.30): the night round sees it. */
  talk?: true
}

export interface TalkState {
  npc: string
  /** They came to the stranger (M10.3): a talk the stranger never answers ends by itself (M10.24). */
  opened?: boolean
  turnsLeft: number
  history: { speaker: 'player' | 'npc'; text: string }[]
  effects: number
  revealed: string[]
  /** What the NPC proposed and the player has yet to answer (M10.3): YES carries it out. */
  proposal?: import('./dialogue/offers').Offer
  /** Facts this conversation made, and whether the NPC has chosen what to do after it (M10.3). */
  facts?: string[]
  after?: boolean
  /** Claims the stranger made in this talk (M10.3): a few, then words are only words. */
  claims?: number
  /** A claim the voice read in the stranger's words (M10.3, left over), and how it was taken: it sounds in the next turn. */
  heard?: string
  /** Turns so far, and whether the NPC said they must go (M10.8): a talk goes on while it is about something. */
  turns?: number
  leaving?: boolean
  /** Quests this talk may start once their subject comes up (M10.8), not at the greeting. */
  quests?: string[]
  /** Every line of this talk as the stranger saw it (M10.8): the talk window reads these. */
  lines?: TalkLine[]
  /** Whether the speaker named someone new in this talk (M10.9): once a talk. */
  sketched?: boolean
  /** When the talk began (M10.10): the seed of the speaker's sayings and address for this talk. */
  began?: number
  /** The speaker used a saying or an oath in this talk (M10.10): no more of either. */
  flourished?: boolean
  /**
   * The talk as the voice read it (M10.28): per turn what the game told it and
   * what was said back, only ever added to, so each call reads the ones before
   * from the cache.
   */
  thread?: { role: 'user' | 'assistant'; text: string }[]
  /** What the voice was told so far in this talk, by part (M10.28): a later turn tells only what is new or changed. */
  sent?: Record<string, string>
  /** How the speaker calls the stranger in this talk (M10.28): the word their first answer used, until the attitude changes band. */
  address?: { word: string; band: string }
}

/** A line of a conversation as the engine keeps it (M10.8): what was typed, and what came back. */
/** A line of an earlier talk (M10.29 J): when, whether the stranger said it, and the words. */
export interface PastTalkLine {
  t: number
  you: boolean
  text: string
  /** The talk it was in, by when it began (M10.29 R): an older talk leaves the ring whole. Older lines have none. */
  talk?: number
}

export interface TalkLine {
  id: number
  kind: 'room' | 'text' | 'system' | 'error' | 'narration' | 'speech' | 'check' | 'input' | 'card'
  text: string
  source?: 'model' | 'rules'
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

/**
 * How far the stranger is in a craft (M10.5): a rank from novice to master,
 * the practice that counts towards the next, and what they have done.
 */
export interface CraftProgress {
  rank: number
  practice: number
  /** Techniques done well once, or taught. */
  techniques: string[]
  /** Successes per recipe, by `objectType:affordance`: past a handful it is routine. */
  recipes: Record<string, number>
  /** The hardest recipe done well, as a rank (0 to 3). */
  best: number
  /** Practice gained today: [day, amount]. */
  today?: [number, number]
  /** Failed tries in a row per recipe, and until when it rests (M10.29, crafts.fail_cooldown). */
  fails?: Record<string, { n: number; until?: number }>
  /** The masterwork, once made: what makes master possible. */
  masterwork?: string
  /** Things made by the stranger's own hand and not yet sold: they fetch more. */
  made?: Record<string, number>
}

/**
 * An object the chronicler placed (M10.5, place_prop): lasting world with a
 * fixed id, an owner, what it holds, a place and a lock, and the storyline it
 * belongs to. It follows its owner home and passes to an heir.
 */
export interface Prop {
  id: string
  template: string
  name: string
  location: string
  owner?: string
  line?: string
  placed: number
  lock?: { key: string; quality: 'crude' | 'common' | 'good' | 'fine' | 'masterwork'; material: 'wood' | 'iron' | 'brass' }
  /** Money in it, from the owner's purse. */
  money: number
  /** What the owner believes is in it: a loss shows against this at the owner's fixed moment. */
  expected: Record<string, number>
  expectedMoney: number
  /** The hour the owner looks in it. */
  checks: number
  /** The hint facts, in the owner's words. */
  hints: string[]
  /** When the owner found something missing. */
  missed?: number
}

/** What the stranger has had a moment for (M10.11): places reached or seen from afar, tidings heard. */
export interface MomentsState {
  /** Places with an arrival the stranger reached. */
  places: string[]
  /** Places seen from afar first (their card came then). */
  sighted: string[]
  /** Facts of belang 4 or more that came to the stranger with a card. */
  tidings: string[]
}

export interface PlayerState {
  /** Whom the stranger was told to ask for when they came (M10.9), by their background. */
  contact?: string
  /** The background of a stranger in a world without classes (M10.29 C): chosen with BACKGROUND; left out, the first. */
  background?: string
  /** The tongues of lands the stranger learnt, and how many exchanges in each they have had (M10.23). */
  languages?: string[]
  tongues?: Record<string, number>
  /** Moments the stranger had (M10.11): a card once per place and per tiding. */
  moments?: MomentsState
  /** What a place was like when the stranger was last there (M10.13), for what changed when they come back. */
  visits?: Record<string, { t: number; objects: Record<string, string>; state?: string; residents: string[] }>
  /** Gestures people made (M10.13): how often each, the day of each person's last, and the last place one came at. */
  gestures?: { given: Record<string, number>; days: Record<string, number>; at?: { location: string; t: number } }
  /** The lodging rented by the week (M10.13): its id; the room itself is `lodging` until the week is out. */
  lodgingId?: string
  /** The stranger's chest in the room (M10.13). */
  chest?: Counts
  /** Journeys of days the stranger made (M10.12): a line each in the journal. */
  journeys?: { t: number; from: string; to: string; by?: string; minutes: number }[]
  /** Crafts the stranger works at (M10.5), by craft. */
  crafts?: Record<string, CraftProgress>
  /** Hidden things found, `location/id`, and inscriptions read, `location/object` (M10.5). */
  found?: string[]
  /** Where the stranger last gathered from a ground, `location/ground`, by game day (M10.5). */
  gathered?: Record<string, number>
  /** Time the stranger spends on what was just agreed in a talk (M10.5: a lesson), passed after the turn. */
  spend?: { minutes: number; why: string }
  /** Family ties the stranger has heard of or seen (M10.4), by person. */
  knownTies?: Record<string, string[]>
  /** When the stranger last slept (M10.4): tired after eighteen hours. */
  sleptAt?: number
  /** Homes the stranger was let into (M10.3), until when. */
  permits?: Record<string, number>
  /** The news of each area the player has been told (M9.4): told once, and again when it changes. */
  areaNewsTold?: Record<string, string>
  location: string
  /** The land the stranger is in (M10.23), when not the world's home land: for the scene when they cross a border. */
  land?: string
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
  /** The trail (after the M10 playtest): per hex three bits, a step to the north, north-east and south-east neighbour; and the hex it ends in. */
  map?: { seen: string; walked: string; heading?: string; recent?: string; earlier?: string; period?: number; trail?: string; trailEnd?: string }
  /** Areas the player has seen from afar. */
  seenAreas?: string[]
  /** The player character (FO, chapter 11). */
  character?: Character
  /** Half the money, left where the player fell (the Way of the Grey Rider). */
  lostPurse?: { location: string; amount: number; t: number }
  /** Died three times: the Grey Rider wants a price. */
  riderPrice?: boolean
  /** Whom the stranger is teaching what (M10.14): lessons so far, and on which day the last. */
  pupils?: Record<string, Record<string, { lessons: number; day: number }>>
  /** What the stranger made and gave away, per person, and on which day a line about it was shown (M10.14). */
  ownWork?: { given: Record<string, { item: string; t: number }[]>; seen: Record<string, number> }
  /** Lost in the mist since then (M10.14), until it lifts or a road or a place says where you are. */
  lost?: number
  /** Until when the player has a punt hired (M7.2; an old save; since M10.17 in `hired`). */
  punt?: number
  /** What the player has hired, by the owner's hire id, and until when (M10.17). */
  hired?: Record<string, { owner: string; until: number; crosses: string[] }>
  /** Home after a marriage (M7.2): the spouse's house, where the player sleeps for nothing. */
  home?: string
  /** The last night the player slept at home: a spouse expects them now and then. */
  homeNight?: number
  /** When each encounter last happened. */
  encounters?: Record<string, number>
  /** A load the player carries from one settlement to another for pay (M9.1). */
  load?: Load
  /** Conditions on the player that wear off, and when. */
  conditionsUntil?: Record<string, number>
  /** What the player knows of people from seeing and asking them (acquaintance.ts). */
  people?: Record<string, PersonNote>
}

/** Where the player saw someone, and their age once they told it. */
export interface PersonNote {
  seen?: { where: string; t: number }
  /** How often the player saw them at each place; only the most frequent are kept. */
  places?: Record<string, number>
  age?: { value: number; t: number }
  /** The stranger knows what they do (M10.8): they said it, someone told, or the stranger saw them at it. */
  work?: number
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
  /** A song or a story (M10.14): grows is how the village version gets bigger with each retelling, one step a teller. */
  text: { precise: string; village: string; far: string; grows?: string[] }
  /** What it says in a form the systems can check (M8.1): who believes what follows from it. */
  claim?: Claim
  /** The facts that caused it (M9.2): what the plan, phase or aftermath that made it came from. */
  cause?: string[]
  /** Who put it about when it is only their word (M10.3): "player" for what the stranger said. */
  by?: string
  /** Said knowing it was not so (M10.3): a lie, and news when found out. */
  lie?: boolean
}

/** A claim of a fact: { subject: loc_veenhoek_green, key: state, value: normal }; far away it may say otherwise. */
export interface Claim {
  subject: string
  key: string
  value: string
  far?: string
}

/** How someone heard of a fact: level, how sure, from whom, and whether it grew in the telling. */
export interface Heard {
  level: 1 | 2 | 3
  reliability: number
  from: string
  t: number
  grown?: boolean
  /** How many tellers it passed through since whoever saw it or first told it (M10.14): a song grows with them. */
  hops?: number
  /** A claim the hearer doubts or rejects (M8.2); without it, they believe it. */
  stance?: 'doubts' | 'rejects'
  /** What the stranger said, found out to be wrong (M10.3): the consequence came once. */
  checked?: boolean
  /** Whose word made them think again, once each (M10.6): an eyewitness, a persuasion. */
  weighed?: string[]
}

/**
 * Someone a speaker named in a talk who is not in the content (M10.9): a
 * sketch in this game's lore, with a bond to the speaker and a place that
 * exists, until the stranger comes there and they become a person.
 */
export interface SketchFigure {
  id: string
  /** A first name only. */
  name: string
  pronoun: 'she' | 'he' | 'they'
  /** What they are to the speaker, in the world's words: "cousin", "old master". */
  bond: string
  /** The speaker. */
  of: string
  /** Where they live: an area's topic (area_waagdam), a far place's topic, or a far name of this game. */
  place: string
  placeName: string
  /** What they are, in a few words: "a bargeman". */
  what: string
  /** The sentence they were first named in. */
  line: string
  t: number
  known_by: string[]
  /** The person they became (M10.9): when the stranger came to their place, or a storyline brought them. */
  npc?: string
  /** A letter from them the chronicler had come (M10.9). */
  letters?: { t: number; text: string }[]
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
  lore?: { far: FarName[]; people?: SketchFigure[] }
  /** Story patterns in play, and the pacing (design: lore and world change). */
  stories?: StoriesState
  /** Facts and who heard them; "player" is the player. */
  /** landHeard (M10.23): when news first reached another land, by `<fact>><land>`, for the chronicle. */
  news?: { seq: number; facts: Fact[]; heard: Record<string, Record<string, Heard>>; landHeard?: Record<string, number> }
  /** The fact a waiting plan comes from (M9.2): a war, a big event the chronicler planned for. */
  pendingCauses?: Record<string, string>
  /** Nameless groups (M9.1): a number at a place, no simulation per person. */
  crowds?: Crowd[]
  /** The rank of settlements that changed in this game (M9.1), by area. */
  ranks?: Record<string, 'hamlet' | 'village' | 'town' | 'city'>
  chronicle?: ChronicleState
  weather?: import('./weather').WeatherState
  /** Far places worked out to their outline for this game (design, "De wereld buiten de kaart"). */
  outlines?: { pending: string[]; done: Record<string, unknown> }
  /** Goal choices waiting for the brain model, and how many each NPC had today (FO, chapter 7). */
  /** The four numbers between NPCs (FO, chapter 8), by NPC and then the other NPC. */
  bonds?: Record<string, Record<string, Bond>>
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
  /** Wanted by a law: the fines, and the crimes no fine buys off, which want a hearing (M10.20). */
  wanted?: Record<string, { fine: number; since: number; hearing?: string[] }>
  /** The player's companions (FO, chapter 13). */
  companions?: Companion[]
  /** The mood of an area for some days (M10.11), by area: panic, grief, feast or threat. */
  moods?: Record<string, { kind: import('./quests/planschema').MoodKind; t: number; until: number; line: string; prompt?: string }>
  /** Lasting marks at places (M10.7), by location: a cairn with a name, a line on a wall; shown under the description. */
  marks?: Record<string, { t: number; text: string; about?: string; until?: number }[]>
  /** Questions about a cost (M10.21): the one open, what was agreed, and what was declined on which game day. */
  asking?: { open?: import('./asking').CostAsk; agreed: Record<string, true>; declined: Record<string, number> }
  /** A choice put to the player (after the M10 playtest): numbered, answered by the next command. */
  choice?: { question: string; options: { label: string; command: string }[]; t: number }
  /** The choice a new command just set aside (M10.29 T): its numbers count one command longer ("l 8"). */
  lastChoice?: { question: string; options: { label: string; command: string }[]; t: number }
  /** Objects the chronicler placed (M10.5), with the last id handed out. */
  props?: { seq: number; list: Prop[] }
  /** Existing chances the rules made visible (M10.5), by id, and when; and the news they put out, by area. */
  chances?: Record<string, number>
  chanceNews?: Record<string, string>
  /** Locks opened with their key, picked or broken (M10.3), or jammed by a bad pick (M10.5), by exit:<from>:<direction> or object:<location>/<object>. */
  locks?: Record<string, 'open' | 'broken' | 'jammed'>
  /** Conversation facts of today (M10.3): how many, and about whom. */
  /** Quests that would have begun while their region had its fill (M10.30), and do not wake again by themselves. */
  questsWaiting?: string[]
  /** Quests the night round made in play (M10.30 (7)), the night it last made or tried one, and the ask it is working on. */
  made?: { quests: MadeQuest[]; day?: number; pending?: NightQuestWant; declined?: string[] }
  talkFacts?: { day: number; people: string[]; /** Who asked the stranger to do something today (M10.30): one fact each. */ asked?: string[] }
  /** The register of agreements (M10.2): who promised whom what, by when, and how it went. */
  agreements?: { seq: number; list: Agreement[] }
  /** Romance per NPC (FO, chapter 8). */
  romance?: Record<string, { stage: 'interest' | 'courting' | 'together' | 'bound'; since: number }>
  /** Tension between realms, 0 to 100 (design: lore and world change, "Staatkunde"). */
  tension?: Record<string, number>
  /** The great lines (M10.22): where each stands, and a month's judgement waiting for the chronicler. */
  tides?: import('./tides').TidesState
  /** The pulse (M10.24): the hooks it brought and whether it asked the night round. */
  pulse?: import('./pulse').PulseState
  /** How the chronicler, the weave and the great lines go on (M10.24): without it, continue. */
  playMode?: import('./modes').PlayMode
  /** The player's own words to the chronicler (M10.24): the design log of this game, and what came of each. */
  wishes?: import('./wishes').WishesState
  /** Knobs of this game over the world's own (M10.24: the dials of the frames screen), by knob id. */
  knobs?: Record<string, number>
  /** What the player chose on the frames screen (M10.24), where a dial is more than one knob. */
  frames?: { lines?: 'often' | 'seldom'; growth?: 'little' | 'much'; region?: import('./frames').RegionSetting }
  /** What waits for the player in think and direct mode (M10.24): hooks of a night, proposals. */
  modes?: import('./modes').ModesState
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
  /** Plans the chronicler wrote for big events without a fixed plan (M7.2), checked like the fixed ones. */
  dynamicPlans?: Record<string, import('./quests/plans').Plan>
  /** Routes closed by an event: exits that cannot be used, with the reason. */
  closed?: Record<string, string>
  /** Scarcity: what comes in of a thing, as a share of what came before. */
  market?: Record<string, number>
  /** What the stranger improvised lately (M10.16): for the next act on the same thing, and for the chronicler. */
  improvisations?: { t: number; target: string; act: string; narration: string; effect: string }[]
  /** The last bell the player heard (M10.15): when, and whether far off. */
  bell?: { t: number; far: boolean }
  /** A spell of cheaper or dearer prices per area, until then (M10.14). */
  prices?: Record<string, { factor: number; until: number }>
  /** The news of the day per area, set by an effect plan. */
  areaNews?: Record<string, string>
  /** The fight in progress (FO, chapter 12). */
  combat?: Combat
  /** A fight between two people of the world in front of the stranger (M10.3, left over), waiting for their move. */
  brawl?: import('./social/brawl').BrawlScene
  /** Progress clocks: threats and long jobs (FO, chapter 11). */
  clocks?: Record<string, Clock>
  brain?: {
    seq: number
    pending: { id: string; npc: string; t: number; trigger: string; signal?: string }[]
    counts: Record<string, { day: number; n: number }>
    last?: Record<string, number>
    due?: Record<string, number>
    /** Signals the brains took up today, for the day's maximum (M8.2). */
    signals?: { day: number; n: number }
    /** Brains that made no valid plan for a signal, by NPC: twice and it goes to the chronicler (M8.3). */
    failed?: Record<string, number>
  }
  /** What changed in play on top of the content (M8.1): ties, homes, work, households, who serves. */
  layer?: Layer
  /** Signals from the watchers, waiting and done (M8.1). */
  signals?: SignalState
  /** Notices pinned on boards: by location, the facts they tell (M8.1). */
  boards?: Record<string, string[]>
  /** The number of plans of the aftermath started, for their ids. */
  planSeq?: number
  /** Greetings and chats where the player is (M8.2): when each pair last greeted, and the chats going on. */
  /** hinted (M10.29): the stranger was told once that LISTEN catches what two people say. */
  chatter?: { greeted: Record<string, number>; chats: import('./chatter').Chat[]; hinted?: boolean }
  /** The lines of earlier talks per person (M10.29 J), a ring of the knob talk.kept_lines: for the talk window and the journal. */
  pastTalks?: Record<string, PastTalkLine[]>
  /** People who band together for or against newcomers (M8.3). */
  groups?: Group[]
  /** The ledgers of the settlements, the routes and goods sent for (M8.4). */
  economy?: EconomyState
  /** People who came and what was built during the game (M8.5). */
  growth?: GrowthState
}

/** A group with members and an aim (M8.3): for or against the newcomers in an area. */
export interface Group {
  id: string
  name: string
  aim: 'against' | 'for'
  area: string
  members: string[]
  since: number
  ended?: number
}

/** The four numbers from one NPC to another (FO, chapter 8), and since M8.2 an old grudge. */
export interface Bond {
  affinity: number
  trust: number
  fear: number
  familiarity: number
  /** A quarrel not made up, since then. */
  grudge?: number
}

/** A tie between two people that changed or began in play; null: the tie is gone. */
export type TieChange = { role: import('./content').RelationRole; bond: number; t: number; why?: string } | null

/** The layer over the content (design: signalen en nasleep, "Wereldtoestand die mag veranderen"). */
export interface Layer {
  /** Per NPC: home, work (null for none), household (null for none) and trade, where they differ from the content. */
  npcs?: Record<string, { home?: string; work?: string | null; household?: string | null; profession?: string }>
  /** By NPC and then the other: an NPC id or "player". */
  ties?: Record<string, Record<string, TieChange>>
  /** Who serves at a service beyond or instead of the content, by service key. */
  staff?: Record<string, { add: string[]; remove: string[] }>
  /** Someone who expects another home: by NPC. */
  expects?: Record<string, { of: string; nights: number; since: number }>
  /** Houses nobody lives in, and since when: the free houses. */
  empty?: Record<string, number>
  /** The standing each household was last seen at, and where it came from (M8.2). */
  standing?: Record<string, { level: number; from?: number; t: number }>
  /** Since when someone has been Warm or better towards the stranger (M10.3, the probe befriended). */
  warm?: Record<string, number>
}

/** A marked change in the state of the world (M8.1). Data, not text. */
export interface Signal {
  id: string
  kind: string
  /** The kind of life event, or another refinement: wedding, betrothal. */
  event?: string
  who: string[]
  place: string
  from?: string
  to?: string
  /** The facts or events that caused it. */
  cause: string[]
  /** One person, one household, two people of two households, or more. */
  scope: 'person' | 'household' | 'pair' | 'many'
  belang: number
  t: number
  claim?: Claim
  watcher: string
  /** Who took it up: the standard aftermath, a brain, the chronicler, or nobody. */
  handled?: string
  /** Only the standard aftermath: the brain had its turn (M8.2). */
  rules?: boolean
  /** It waited a night for the chronicler already, as the night run was full (M10.22). */
  waited?: boolean
  /** Back from the chronicler without a plan: all of the standard aftermath runs, not only the brain's part (M8.3). */
  whole?: boolean
}

export interface SignalState {
  seq: number
  queue: Signal[]
  log: Signal[]
  /** What the watchers last saw, for changes: by watcher and subject. */
  seen: Record<string, number | string | boolean>
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
