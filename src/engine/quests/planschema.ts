import { z } from 'zod'
import { RELATION_ROLES } from '../roles'
import { ClaimSchema, ConditionSchema, QuestEffectSchema } from './schema'

// Plans as data (design: signalen en nasleep, "Het plan is data"; M8.1). A
// plan is steps over days: each has a moment (at, after), a condition (when)
// in the language of quest conditions, and one verb (do) from a fixed list.
// The effect plans of big events are the first kind of plan: a phase is a
// step with "after" in hours. Watchers say when a change in the world is a
// signal; the standard aftermath says which plan follows. All content.

const Id = z.string().regex(/^[a-z0-9_]+$/)

/**
 * Someone or somewhere in a plan: an id, a binding of the plan ($a, $b, $who,
 * $place, $subject, $value), or one worked out: { home_of: $b }.
 */
export type Selector =
  | string
  | { home_of: Selector }
  | { work_of: Selector }
  | { family_of: Selector }
  | { household_of: Selector }
  | { social_near: Selector }
  | { board_near: Selector }
  | { step: string }
  | { mover: [Selector, Selector] }
  | { stayer: [Selector, Selector] }

export const SelectorSchema: z.ZodType<Selector> = z.lazy(() =>
  z.union([
    z.string(),
    z.object({ home_of: SelectorSchema }).strict(),
    z.object({ work_of: SelectorSchema }).strict(),
    /** The family of someone: parents, children, brothers and sisters, spouses. */
    z.object({ family_of: SelectorSchema }).strict(),
    z.object({ household_of: SelectorSchema }).strict(),
    /** The nearest place where people gather (tagged social), from someone's home. */
    z.object({ social_near: SelectorSchema }).strict(),
    /** The nearest notice board, from a place or someone's work. */
    z.object({ board_near: SelectorSchema }).strict(),
    /** Where an earlier step of this plan happened. */
    z.object({ step: z.string() }).strict(),
    /** Of two who set up house together: the one who moves (the player, or who lives with a parent), and the one who stays. */
    z.object({ mover: z.tuple([SelectorSchema, SelectorSchema]) }).strict(),
    z.object({ stayer: z.tuple([SelectorSchema, SelectorSchema]) }).strict(),
  ]),
)

/** A group plans move together: everyone who lives in these areas, alive and not with the player. */
const GroupSchema = z.object({ areas: z.array(z.string()).default([]), npcs: z.array(z.string()).default([]), except: z.array(z.string()).default([]) }).strict()

export const PlanEffectSchema = z.union([
  QuestEffectSchema,
  /** A group flees: those near the player walk, the others become notes on the road. */
  z.object({ flee: z.string(), to: z.string(), days: z.number().int().positive() }).strict(),
  /** A route closes: an exit that cannot be used, with a reason. */
  z.object({ close: z.tuple([z.string(), z.string()]), reason: z.string() }).strict(),
  z.object({ open: z.tuple([z.string(), z.string()]) }).strict(),
  /** Scarcity: stock of a thing drops, and what comes in is a share of what came before. */
  z.object({ market: z.string(), factor: z.number().min(0).max(3) }).strict(),
  z.object({ tension: z.tuple([z.string(), z.string()]), delta: z.number().int(), why: z.string() }).strict(),
  z.object({ news: z.string(), area: z.string() }).strict(),
])
export type PlanEffect = z.infer<typeof PlanEffectSchema>

const FactTemplate = z
  .object({
    kind: z.string().regex(/^[a-z0-9_:]+$/).default('aftermath'),
    title: z.string(),
    precise: z.string(),
    village: z.string(),
    far: z.string(),
    belang: z.number().int().min(0).max(5).default(1),
    about: z.array(z.string()).default([]),
    place: SelectorSchema.optional(),
    claim: ClaimSchema.optional(),
  })
  .strict()

/** The verbs a plan may use (M8.1): what they change lasts, and each is news. */
export const VerbSchema = z.union([
  /** A tie changes kind or begins, both ways: a sweetheart becomes a spouse. */
  z.object({ set_tie: z.tuple([z.string(), z.string()]), role: z.enum(RELATION_ROLES), bond: z.number().int().min(-3).max(3).optional() }).strict(),
  z.object({ end_tie: z.tuple([z.string(), z.string()]) }).strict(),
  /** Someone lives somewhere else from now on (the player too). */
  z.object({ move_home: SelectorSchema, to: SelectorSchema }).strict(),
  /** Someone moves in with another and becomes one household with them. */
  z.object({ join_household: SelectorSchema, of: SelectorSchema }).strict(),
  z.object({ leave_household: SelectorSchema, to: SelectorSchema.optional() }).strict(),
  /** Work somewhere, at a service there, in a trade. */
  z.object({ set_work: SelectorSchema, at: SelectorSchema, service: z.string().optional(), profession: z.string().optional() }).strict(),
  /** Stops working: where they served, a place comes open. */
  z.object({ quit_work: SelectorSchema }).strict(),
  /** Someone without work who heard of an open place takes it; until then the step waits. */
  z.object({ hire: z.string(), reach: z.number().int().positive().default(120), except: z.array(SelectorSchema).default([]) }).strict(),
  /** A feast at a place for some hours: the people of the area come, and the guests from further off. */
  z.object({ feast: SelectorSchema, hours: z.number().positive().default(4), guests: z.array(SelectorSchema).default([]) }).strict(),
  /** Someone who fled or stayed away goes home. */
  z.object({ return: SelectorSchema }).strict(),
  /** Some go away together for a while: beyond the region, or to a far place in it. */
  z.object({ leave: z.array(SelectorSchema).min(1), to: z.string(), days: z.number().positive() }).strict(),
  /** A notice on a board: whoever comes by reads it. */
  z.object({ post: SelectorSchema, fact: FactTemplate }).strict(),
  /** What stays on someone's mind for some days. */
  z.object({ thought: SelectorSchema, text: z.string(), days: z.number().positive().default(7) }).strict(),
  /** Someone expects another home now and then, and minds it after so many nights. */
  z.object({ expect_home: SelectorSchema, of: SelectorSchema, nights: z.number().int().positive().default(5) }).strict(),
  /** People think better or worse of someone (the player, or an NPC). */
  z.object({ regard: z.array(SelectorSchema).min(1), to: SelectorSchema, affinity: z.number().int().min(-20).max(20) }).strict(),
  /** News with a claim, from templates: {a}, {b}, {who} and {place} are filled in. */
  z.object({ tell: FactTemplate }).strict(),
  /** Everything a quest or an effect plan could already do. */
  PlanEffectSchema,
])
export type Verb = z.infer<typeof VerbSchema>

export const StepSchema = z
  .object({
    id: Id,
    /** When, from the start of the plan: so many days and hours on, at an hour of the day, on a rest day. */
    at: z.object({ days: z.number().min(0).optional(), hours: z.number().min(0).optional(), hour: z.number().int().min(0).max(23).optional(), rest_day: z.boolean().optional() }).strict().optional(),
    /** After another step was done or skipped, and so many hours after that. */
    after: z.string().optional(),
    wait: z.number().min(0).default(0),
    /** One by one for each member of a group of the plan, bound to $who. */
    each: z.string().optional(),
    /** On what someone knows (knows) and what is true (the other conditions). */
    when: z.array(ConditionSchema).default([]),
    /** When the conditions do not hold: skip the step, wait for them (until the plan expires), or let the plan fail. */
    otherwise: z.enum(['skip', 'wait', 'fail']).default('skip'),
    do: VerbSchema,
  })
  .strict()
export type Step = z.infer<typeof StepSchema>

export const PlanSchema = z
  .object({
    id: Id,
    name: z.string(),
    /** The groups by area: everyone who lives there, alive and not travelling with the player. */
    groups: z.record(z.string(), GroupSchema).default({}),
    phases: z.array(z.object({ after: z.number().int().min(0), effects: z.array(PlanEffectSchema) }).strict()).default([]),
    /** At most this many effects in each phase (design: a plan has a maximum). */
    max_effects: z.number().int().positive().default(30),
    steps: z.array(StepSchema).max(30).default([]),
    /** Days after which what is left of the plan lapses. */
    expires: z.number().positive().optional(),
    /** What it is about: one plan per person per topic. */
    topic: z.string().optional(),
  })
  .strict()
  .refine((p) => p.phases.length + p.steps.length > 0, { message: 'a plan needs phases or steps' })
export type Plan = z.infer<typeof PlanSchema>

/** When a change in the world is a signal (M8.1): one of a new fact, conditions that come true, or a state the system works out. */
export const WatcherSchema = z
  .object({
    id: Id,
    signal: Id,
    event: Id.optional(),
    /** A new fact with a claim of this key, and of this value or kind if given. Its people: $subject, $value, $about. */
    fact: z.object({ key: z.string().optional(), value: z.union([z.string(), z.array(z.string())]).optional(), not: z.union([z.string(), z.array(z.string())]).optional(), kind: z.string().optional() }).strict().optional(),
    /** Conditions that come true: a signal each time they do. */
    when: z.array(ConditionSchema).optional(),
    /** A house nobody has lived in for so many days: $place is the house. */
    probe: z.object({ house_empty: z.number().positive() }).strict().optional(),
    /** Who it is about; for a fact, by default the subject and the value of its claim. */
    who: z.array(z.string()).optional(),
    place: z.string().optional(),
    belang: z.number().int().min(0).max(5).optional(),
  })
  .strict()
  .refine((w) => [w.fact, w.when, w.probe].filter(Boolean).length === 1, { message: 'a watcher watches one of fact, when or probe' })
export type Watcher = z.infer<typeof WatcherSchema>

/** What follows a signal by the rules, always, also without AI (M8.1). */
export const AftermathSchema = z
  .object({
    id: Id,
    signal: Id,
    event: Id.optional(),
    /** Only when these hold, with the bindings of the signal. */
    when: z.array(ConditionSchema).default([]),
    /** One plan per person per topic: a second signal about the same does not start a second plan. */
    topic: Id,
    expires: z.number().positive().default(30),
    groups: z.record(z.string(), GroupSchema).default({}),
    steps: z.array(StepSchema).min(1).max(30),
  })
  .strict()
export type Aftermath = z.infer<typeof AftermathSchema>

/** The news a verb makes when a step is done: belang and three versions (M8.1). A world can word them its own way. */
export const VerbTextSchema = z
  .object({
    id: z.enum(['set_tie', 'end_tie', 'move_home', 'join_household', 'leave_household', 'set_work', 'quit_work', 'hire', 'feast', 'return', 'leave']),
    belang: z.number().int().min(0).max(5),
    title: z.string(),
    precise: z.string(),
    village: z.string(),
    far: z.string(),
  })
  .strict()
export type VerbText = z.infer<typeof VerbTextSchema>
