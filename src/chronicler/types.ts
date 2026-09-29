// The chronicler's own vocabulary. Nothing here knows about Wisplight's
// engine: any application that can describe what happened in these terms can
// ask the chronicler to write it up (see README.md in this folder).

/** Ids are the caller's own. The chronicler shows the model short keys instead and maps them back. */
export type Id = string

export type CardKind = 'person' | 'place' | 'area' | 'lore' | 'request' | 'item' | 'realm' | 'signal' | 'event' | 'chance' | 'named'

/** Where a storyline stands, as the chronicler sees it: the caller can pace the world by it. */
export type Phase = 'setup' | 'rising' | 'crisis' | 'resolution' | 'closed'
export const PHASES: Phase[] = ['setup', 'rising', 'crisis', 'resolution', 'closed']

/** A verb the caller lets the chronicler use in a step of a plan, and what it needs. */
export interface StepVerb {
  name: string
  /** What it does, for the model. */
  text: string
  /** Who does it: nobody, one person, or several (each does it). */
  who: 'none' | 'one' | 'two' | 'many'
  /** What kind of key the target is, if it has one. */
  target?: CardKind[]
  /** What the detail is, if it has one: a role, a text, a number. */
  detail?: string
}

/**
 * A change the caller wants the chronicler to plan for (M8.3): it touches
 * many people, or matters a lot, or the rules and a brain could not settle
 * it. A group is the people it is about who may each go their own way.
 */
export interface SignalCard {
  id: Id
  text: string
  who: Id[]
  place: Id
  /** What happens by custom if the chronicler plans nothing. */
  standard: string
  group?: Id[]
  /** For two people at odds: who both of them trust, a mediator to choose. */
  trusted?: Id[]
}

/** One line about someone or something that occurs in the overview. */
export interface Card {
  id: Id
  kind: CardKind
  name: string
  /** At most a sentence or two: who they are, where it lies, what the story says. */
  text: string
}

export interface ChronicleEvent {
  id: Id
  /** As the world tells time: "Tu 21:10". */
  when: string
  place: Id
  who: Id[]
  witnesses: Id[]
  /** 0 to 5: everyday to historic. */
  belang: number
  /** What really happened, in one or two sentences. */
  text: string
  /** A rumour that is not true. */
  untrue?: boolean
  /** What caused it, as the titles of those facts (M9.2). */
  because?: string[]
}

/** Events that belong together: the same people, the same place, cause and effect. */
export interface ChronicleLine {
  id: Id
  title: string
  pattern?: string
  /** The chronicler's own note so far, at most three lines. */
  summary: string[]
  phase?: Phase
  roles: { role: string; who: Id }[]
  hooks: string[]
  next?: string
  /** New since the last run. */
  events: ChronicleEvent[]
  /** Smaller, earlier events of the same line, for context. */
  earlier: ChronicleEvent[]
  /** The storylines this one goes on from, oldest first (M9.2): one arc, told as one story. */
  arc?: { title: string; summary: string[] }[]
}

/** A kind of request the caller can check and reward: fetch, deliver, recover, ... */
export interface QuestTemplate {
  kind: string
  /** What it means, for the model: "bring the giver an item". */
  text: string
  needs: ('item' | 'target')[]
}

export interface Limits {
  /** Lore topics per run. */
  lore: number
  storyWords: number
  textWords: number
  lineSummary: number
  quests: number
  thoughts: number
  lookups: number
  maxTokens: number
  /** The budget of a whole run over all its lookup rounds (M9.3), in tokens in and out; then he writes. */
  runTokens: number
  /** What all answers to lookups may hold together, in characters. */
  lookupChars: number
}

export const DEFAULT_LIMITS: Limits = {
  lore: 3,
  storyWords: 140,
  textWords: 45,
  lineSummary: 3,
  quests: 2,
  thoughts: 3,
  lookups: 3,
  maxTokens: 1800,
  runTokens: 30_000,
  lookupChars: 4_000,
}

export interface ChronicleInput {
  /** The working instruction: structure, rules, how a change looks. Fixed, so it is cached. */
  instruction: string
  /** A short sketch of the world. Fixed. */
  world: string
  /** Story patterns and other fixed reference, if any. */
  catalogue?: string
  now: string
  lines: ChronicleLine[]
  /** Everyone and everything the lines refer to. */
  cards: Card[]
  /** Existing lore that may relate, as cards of kind lore. */
  lore: Card[]
  /** Requests that are open in these lines, as cards of kind request. */
  requests: Card[]
  /** Areas that may get a line of news of the day. */
  areas: Card[]
  templates: QuestTemplate[]
  /** Older lines the model may look up, by title only. */
  older?: { id: Id; title: string }[]
  limits?: Partial<Limits>
  /** Lands and powers whose relations may shift, a little, after what happened (design: "Staatkunde"). */
  realms?: Card[]
  /** Storylines with an event so big that its consequences may be planned (design: "Grote gebeurtenissen"). */
  mayPlan?: Id[]
  /** Changes to plan for (M8.3), and the verbs a step may use. Without verbs, no steps. */
  signals?: SignalCard[]
  verbs?: StepVerb[]
  /** Other storylines building up now, and how many came to a crisis this week (M8.3): the pace. */
  pace?: { building: { title: string; phase: Phase }[]; climaxes: number }
  /** The player as the caller describes them (M10.5): what they can do, in words, no numbers. */
  player?: Card
  /** Situations that are there already in which a skill counts (M10.5), as cards of kind chance. */
  chances?: Card[]
  /** Templates of new objects a step place_prop may use (M10.5). */
  props?: { id: Id; text: string }[]
  /** People spoken of in talks who are not in the world yet (M10.9): a storyline may bring one, by a letter or a visit. */
  named?: Card[]
  /** The pulse (M10.24): the stranger has had nothing new near them for days; bring one hook, as it says. */
  pulse?: string
  /** The player's own words to the chronicler (M10.24), the newest few: what they would like more or less of. */
  wishes?: { id: Id; text: string }[]
}

// ---------------------------------------------------------------- what comes back, in the caller's ids

export interface LoreOp {
  line: Id
  name: string
  /** Level 1: what anyone may have heard. */
  summary: string
  /** Level 2: the core, as the village tells it. */
  details: string
  /** Level 3: the story as a witness tells it. */
  story: string
  /** How it sounds far away; it may be wrong, as retold news goes wrong. */
  far: string
  teller?: Id
  links: Id[]
  /**
   * What the lore says happened, as structure (M9.2): each rests on an event
   * of the storyline. Without them the lore is not kept.
   */
  claims: ClaimOp[]
}

/** One thing the lore says: about whom or what, which key, which value, and the event it rests on. */
export interface ClaimOp {
  event: Id
  subject: Id
  key: string
  value: string
}

export interface LineOp {
  line: Id
  summary: string[]
  roles: { role: string; who: Id }[]
  hooks: string[]
  next: string
  close: boolean
  phase?: Phase
}

/** A request for the player: worked out from a hook, or a better wording of an open one. */
export interface QuestOp {
  /** An open request this rewrites; empty for a new one. */
  request?: Id
  line: Id
  template: string
  giver: Id
  item?: Id
  target?: Id
  name: string
  /** What the giver says when asking. */
  ask: string
  /** Why it matters, in a sentence. */
  stakes: string
}

/** Something that stays on someone's mind for a while: the chronicler's bounded effect. */
export interface ThoughtOp {
  who: Id
  text: string
}

export interface NewsOp {
  area: Id
  text: string
}

/** Someone spoken of in a talk comes into a storyline (M10.9): a letter to the one who spoke of them, or a visit. */
export interface NamedOp {
  who: Id
  how: 'letter' | 'visit'
  text: string
}

/** A small shift in how two realms stand, with its reason: bounded by the chronicler and again by the caller. */
export interface TensionOp {
  between: [Id, Id]
  delta: number
  why: string
}

/** One consequence of a big event, from a fixed vocabulary the caller can check and carry out. */
export type PlanEffectOp =
  | { place: Id; state: 'flooded' | 'damaged' | 'destroyed' | 'abandoned' | 'occupied' | 'normal' }
  | { news: string; area: Id }
  | { market: Id; factor: number }
  | { flee: Id; to: Id; days: number }

/** One step of a plan: after so many hours, a verb of the caller's list, who does it, what at, and a detail. */
export interface StepOp {
  after: number
  verb: string
  who: Id[]
  target?: Id
  detail?: string
}

/**
 * Consequences in phases (design: "Effectplan in fases"), for a storyline
 * marked PLAN; or steps (M8.3) for such a line, for a signal to plan for,
 * or as the one beat of any other storyline in the run.
 */
export interface PlanOp {
  line?: Id
  signal?: Id
  name: string
  phases: { after: number; effects: PlanEffectOp[] }[]
  steps?: StepOp[]
}

export interface ChronicleOutput {
  lore: LoreOp[]
  lines: LineOp[]
  quests: QuestOp[]
  thoughts: ThoughtOp[]
  news: NewsOp[]
  tensions?: TensionOp[]
  plans?: PlanOp[]
  named?: NamedOp[]
  /** What the chronicler did with each of the player's words this round (M10.24), one sentence each. */
  heard?: { note: Id; did: string }[]
}

// ---------------------------------------------------------------- the model

/** Structurally the same as the request of the engine's model gateway. */
export interface ChroniclerRequest {
  role: 'chronicler'
  system: string
  prompt: string
  schemaName: string
  schema: Record<string, unknown>
  maxTokens: number
  meta?: Record<string, unknown>
}

export interface ChroniclerUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
}

export interface ChroniclerModel {
  complete(request: ChroniclerRequest): Promise<{ text: string; usage: ChroniclerUsage }>
}

/** Answers a lookup: fuller cards for these ids (a person, a place, lore, an older line). */
export type Lookup = (ids: Id[]) => Card[] | Promise<Card[]>
