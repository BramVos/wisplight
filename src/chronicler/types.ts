// The chronicler's own vocabulary. Nothing here knows about Wisplight's
// engine: any application that can describe what happened in these terms can
// ask the chronicler to write it up (see README.md in this folder).

/** Ids are the caller's own. The chronicler shows the model short keys instead and maps them back. */
export type Id = string

export type CardKind = 'person' | 'place' | 'area' | 'lore' | 'request' | 'item' | 'realm'

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
}

/** Events that belong together: the same people, the same place, cause and effect. */
export interface ChronicleLine {
  id: Id
  title: string
  pattern?: string
  /** The chronicler's own note so far, at most three lines. */
  summary: string[]
  roles: { role: string; who: Id }[]
  hooks: string[]
  next?: string
  /** New since the last run. */
  events: ChronicleEvent[]
  /** Smaller, earlier events of the same line, for context. */
  earlier: ChronicleEvent[]
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
}

export interface LineOp {
  line: Id
  summary: string[]
  roles: { role: string; who: Id }[]
  hooks: string[]
  next: string
  close: boolean
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

/** The consequences of a big event in phases (design: "Effectplan in fases"). */
export interface PlanOp {
  line: Id
  name: string
  phases: { after: number; effects: PlanEffectOp[] }[]
}

export interface ChronicleOutput {
  lore: LoreOp[]
  lines: LineOp[]
  quests: QuestOp[]
  thoughts: ThoughtOp[]
  news: NewsOp[]
  tensions?: TensionOp[]
  plans?: PlanOp[]
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
