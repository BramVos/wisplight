import { z } from 'zod'

// Written quests as data (FO, chapter 14, "Een geschreven quest"): stages,
// conditions from a fixed vocabulary (the player's knowledge, flags, things,
// an NPC's attitude, clocks, time and places), effects from a fixed
// vocabulary (flags, things, news, reputation, experience, and above all NPC
// goals), actions of the quest's own, and at least three endings.

const Id = z.string().regex(/^[a-z0-9_]+$/)
const BAND = z.enum(['Hostile', 'Unfriendly', 'Wary', 'Neutral', 'Friendly', 'Warm', 'Devoted'])
const PLACE_STATES = ['normal', 'flooded', 'damaged', 'destroyed', 'abandoned', 'occupied', 'drained'] as const
export const PlaceState = z.enum(PLACE_STATES)
export type PlaceStateName = (typeof PLACE_STATES)[number]

/** What someone believes about a claim (M8.1): the newest version they heard wins, and with the same age the most precise. */
export interface KnowsClaim {
  /** An NPC, "player", or a binding of a plan such as $who. */
  who: string
  subject: string
  key: string
  /** Believes one of these values. */
  value?: string | string[]
  /** Believes something other than these (or has heard nothing else). */
  not?: string | string[]
  /** Heard at least at this level: 3 precise, 2 as the village tells it, 1 from far away. */
  level?: number
  /** Heard it at most so many days ago. */
  days?: number
}

type Cond =
  | { flag: string; is?: string | number | boolean }
  | { not_flag: string }
  | { knows: string | KnowsClaim }
  | { has: string; qty?: number }
  | { money: number }
  | { attitude: string; at_least: z.infer<typeof BAND> }
  | { clock: string; at_least: number }
  | { clock_full: string }
  | { at: string }
  | { npc_at: string; place: string }
  | { dead: string }
  | { alive: string }
  | { stage: string }
  | { outcome: string }
  | { days: number }
  | { day: number }
  | { reputation: string; at_least: number }
  | { companion: string }
  | { place_state: string; is: PlaceStateName }
  | { fact: string }
  | { level: number }
  | { since: string; hours: number }
  | { count: string; at_least: number }
  | { weekday: string }
  | { night: boolean }
  | { wields: 'iron' }
  | { here: string }
  | { weather: string }
  | { object: string; state: Record<string, string | number | boolean> }
  // For plans (M8.1): about people, by id or by a binding of the plan.
  | { is_player: string }
  | { has_work: string }
  | { lives_with_parent: string }
  | { commute: string; at_least: number }
  | { thinks_home_stands: string }
  | { tie: [string, string]; role: string }
  | { any: Cond[] }
  | { all: Cond[] }
  | { not: Cond }

export const ConditionSchema: z.ZodType<Cond> = z.lazy(() =>
  z.union([
    z.object({ flag: z.string(), is: z.union([z.string(), z.number(), z.boolean()]).optional() }).strict(),
    z.object({ not_flag: z.string() }).strict(),
    z
      .object({
        knows: z.union([
          z.string(),
          z
            .object({
              who: z.string(),
              subject: z.string(),
              key: z.string(),
              value: z.union([z.string(), z.array(z.string())]).optional(),
              not: z.union([z.string(), z.array(z.string())]).optional(),
              level: z.number().int().min(1).max(3).optional(),
              days: z.number().positive().optional(),
            })
            .strict(),
        ]),
      })
      .strict(),
    z.object({ has: z.string(), qty: z.number().int().positive().optional() }).strict(),
    z.object({ money: z.number().int() }).strict(),
    z.object({ attitude: z.string(), at_least: BAND }).strict(),
    z.object({ clock: z.string(), at_least: z.number().int() }).strict(),
    z.object({ clock_full: z.string() }).strict(),
    z.object({ at: z.string() }).strict(),
    z.object({ npc_at: z.string(), place: z.string() }).strict(),
    z.object({ dead: z.string() }).strict(),
    z.object({ alive: z.string() }).strict(),
    /** quest_id:stage_id */
    z.object({ stage: z.string() }).strict(),
    /** quest_id:outcome_id */
    z.object({ outcome: z.string() }).strict(),
    /** Days since this quest began. */
    z.object({ days: z.number().int().min(0) }).strict(),
    /** Days since the game began. */
    z.object({ day: z.number().int().min(0) }).strict(),
    z.object({ reputation: z.string(), at_least: z.number().int() }).strict(),
    z.object({ companion: z.string() }).strict(),
    z.object({ place_state: z.string(), is: PlaceState }).strict(),
    /** A fact of this kind exists. */
    z.object({ fact: z.string() }).strict(),
    z.object({ level: z.number().int() }).strict(),
    /** At least this many hours since the flag was stamped (or it never was). */
    z.object({ since: z.string(), hours: z.number().min(0) }).strict(),
    /** A counting flag has reached a number. */
    z.object({ count: z.string(), at_least: z.number().int() }).strict(),
    z.object({ weekday: z.string() }).strict(),
    z.object({ night: z.boolean() }).strict(),
    /** The player holds an iron weapon. */
    z.object({ wields: z.literal('iron') }).strict(),
    /** Someone is where the player is. */
    z.object({ here: z.string() }).strict(),
    z.object({ weather: z.string() }).strict(),
    /** An object's state: 'loc_molenend_mill/de_zwaan' with broken false is the mill turning. */
    z.object({ object: z.string(), state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).strict(),
    /** The one meant is the player. */
    z.object({ is_player: z.string() }).strict(),
    /** Has work somewhere. */
    z.object({ has_work: z.string() }).strict(),
    /** Lives in one house with a parent. */
    z.object({ lives_with_parent: z.string() }).strict(),
    /** The walk from home to work takes at least so many minutes. */
    z.object({ commute: z.string(), at_least: z.number().int().min(0) }).strict(),
    /** Does not believe their home is flooded, destroyed or occupied (M8.1). */
    z.object({ thinks_home_stands: z.string() }).strict(),
    /** What the first is to the second: spouse, sweetheart, friend. */
    z.object({ tie: z.tuple([z.string(), z.string()]), role: z.string() }).strict(),
    z.object({ any: z.array(ConditionSchema) }).strict(),
    z.object({ all: z.array(ConditionSchema) }).strict(),
    z.object({ not: ConditionSchema }).strict(),
  ]),
)
export type Condition = Cond

/** What a fact says in a form the systems can check (M8.1): a subject, a key and a value; far away the value may be wrong. */
export const ClaimSchema = z.object({ subject: z.string(), key: z.string(), value: z.string(), far: z.string().optional() }).strict()

const FactText = z
  .object({
    title: z.string(),
    precise: z.string(),
    village: z.string(),
    far: z.string(),
    belang: z.number().int().min(0).max(5).default(2),
    about: z.array(z.string()).default([]),
    place: z.string().optional(),
    /** Its own kind, for watchers (M8.1); otherwise quest:<id>. */
    kind: z.string().regex(/^[a-z0-9_:]+$/).optional(),
    claim: ClaimSchema.optional(),
  })
  .strict()

export const QuestEffectSchema = z.union([
  z.object({ set: z.string(), value: z.union([z.string(), z.number(), z.boolean()]).default(true) }).strict(),
  z.object({ unset: z.string() }).strict(),
  z.object({ give: z.string(), qty: z.number().int().positive().default(1) }).strict(),
  z.object({ take: z.string(), qty: z.number().int().positive().default(1) }).strict(),
  z.object({ pay: z.number().int() }).strict(),
  z.object({ xp: z.number().int().positive(), why: z.string() }).strict(),
  z.object({ reputation: z.string(), delta: z.number().int() }).strict(),
  z.object({ relation: z.string(), affinity: z.number().int().default(0), trust: z.number().int().default(0), fear: z.number().int().default(0) }).strict(),
  z.object({ fact: FactText }).strict(),
  z.object({ goal: z.string(), type: z.enum(['Visit', 'Talk', 'Socialize', 'Pray', 'Rest']), target: z.string(), hours: z.number().int().positive().default(8) }).strict(),
  z.object({ grievance: z.string(), line: z.string() }).strict(),
  z.object({ clock: z.object({ id: Id, name: z.string(), size: z.union([z.literal(4), z.literal(6), z.literal(8)]), full: z.string() }).strict() }).strict(),
  z.object({ tick: z.string(), n: z.number().int().default(1) }).strict(),
  z.object({ stage: z.string() }).strict(),
  z.object({ outcome: z.string() }).strict(),
  z.object({ restore: z.string(), at: z.string().optional() }).strict(),
  /** Someone is somewhere else at once; with days, they stay there that long. */
  z.object({ move: z.string(), to: z.string(), days: z.number().positive().optional() }).strict(),
  z.object({ place: z.string(), state: PlaceState }).strict(),
  z.object({ plan: z.string() }).strict(),
  z.object({ favour: z.string() }).strict(),
  z.object({ approve: z.string() }).strict(),
  z.object({ text: z.string() }).strict(),
  z.object({ start: z.string() }).strict(),
  z.object({ kill: z.string(), cause: z.string() }).strict(),
  z.object({ learn: z.string() }).strict(),
  z.object({ player_condition: z.string(), hours: z.number().int().positive() }).strict(),
  z.object({ encounter: z.string() }).strict(),
  /** The time now, in a flag: for 'since'. */
  z.object({ stamp: z.string() }).strict(),
  /** Adds to a counting flag. */
  z.object({ count: z.string(), n: z.number().int().default(1) }).strict(),
  /** Hands something of the player's to an NPC. */
  z.object({ hand: z.string(), to: z.string(), qty: z.number().int().positive().default(1) }).strict(),
  /** Someone walks to a place and waits there: Aaltje to the Waag for her weighing. */
  z.object({ send: z.string(), to: z.string(), hours: z.number().positive().default(24) }).strict(),
  /** Someone leaves the world: fled, gone to the city, under a curse. */
  z.object({ vanish: z.string() }).strict(),
  /** The player joins a faction. */
  z.object({ join: z.string() }).strict(),
  /** Something an NPC carries comes to the player: a stolen chain, a bought chest. */
  z.object({ seize: z.string(), from: z.string(), qty: z.number().int().positive().default(1) }).strict(),
])
export type QuestEffect = z.infer<typeof QuestEffectSchema>

export const QuestActionSchema = z
  .object({
    id: Id,
    /** What the player types: regular expressions, matched against the whole command. */
    say: z.array(z.string()).min(1),
    /** What the player does, in plain words, for the voice to recognise in free speech (M7.2). */
    intent: z.string().optional(),
    /** Where it can be done: location or area ids; empty means anywhere. */
    at: z.array(z.string()).default([]),
    /** Someone who must be there. */
    with: z.string().optional(),
    when: z.array(ConditionSchema).default([]),
    /** Said when the conditions are not met. */
    not_yet: z.string().optional(),
    check: z.object({ skill: z.string(), dc: z.number().int() }).strict().optional(),
    effects: z.array(QuestEffectSchema).default([]),
    fail: z.array(QuestEffectSchema).default([]),
    text: z.string(),
    fail_text: z.string().optional(),
    /** Minutes it takes. */
    minutes: z.number().int().min(0).default(5),
    /** Once only. */
    once: z.boolean().default(true),
  })
  .strict()
export type QuestAction = z.infer<typeof QuestActionSchema>

export const StageSchema = z
  .object({
    id: Id,
    /** The journal line for this stage. */
    text: z.string(),
    on_enter: z.array(QuestEffectSchema).default([]),
    next: z.array(z.object({ when: z.array(ConditionSchema).min(1), to: z.string(), effects: z.array(QuestEffectSchema).default([]) }).strict()).default([]),
  })
  .strict()

export const OutcomeSchema = z
  .object({
    id: Id,
    name: z.string(),
    text: z.string(),
    /** A real way to solve it (the design rule asks for three); otherwise a failure or a turn of events. */
    solution: z.boolean().default(true),
    /** Reached by itself when these hold, in any stage. */
    when: z.array(ConditionSchema).default([]),
    effects: z.array(QuestEffectSchema).default([]),
  })
  .strict()

export const QuestBodySchema = z
  .object({
    /** How it begins: talking to one of these, a place, or conditions. */
    starts: z
      .object({ talk: z.array(z.string()).default([]), at: z.array(z.string()).default([]), when: z.array(ConditionSchema).default([]), at_start: z.boolean().default(false) })
      .strict()
      .default({ talk: [], at: [], when: [], at_start: false }),
    /** What the giver says when it begins. */
    ask: z.string().optional(),
    stages: z.array(StageSchema).default([]),
    actions: z.array(QuestActionSchema).default([]),
    outcomes: z.array(OutcomeSchema).default([]),
    /** A death of someone with a part: to an outcome or a stage (design: quests react to the world). */
    on_death: z.record(z.string(), z.string()).default({}),
    /** A place destroyed or flooded: to an outcome or a stage. */
    on_place: z.record(z.string(), z.string()).default({}),
    /** A clock that runs by itself while the quest is on: the widow's patience. */
    timer: z.object({ clock: z.string(), every_hours: z.number().int().positive(), unless: z.array(ConditionSchema).default([]) }).strict().optional(),
  })
  .partial()
