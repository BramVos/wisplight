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
  | { neighbours_of: Selector }
  | { social_near: Selector }
  | { board_near: Selector }
  | { step: string }
  | { mover: [Selector, Selector] }
  | { stayer: [Selector, Selector] }
  | { welcoming: Selector }

/** The kinds of hook that reach the stranger (M10.24, the pulse). */
export const HOOK_KINDS = ['request', 'visitor', 'tiding', 'gesture', 'letter', 'place'] as const

/** The moods an area can be in (M10.11). */
export const MOOD_KINDS = ['panic', 'grief', 'feast', 'threat'] as const
export type MoodKind = (typeof MOOD_KINDS)[number]

export const SelectorSchema: z.ZodType<Selector> = z.lazy(() =>
  z.union([
    z.string().describe('An id, or a binding of the plan: $a, $b, $who, $place, $area, $subject, $value.'),
    z.object({ home_of: SelectorSchema }).strict().describe("Someone's home."),
    z.object({ work_of: SelectorSchema }).strict().describe('Where someone works.'),
    z.object({ family_of: SelectorSchema }).strict().describe('The family of someone: parents, children, brothers and sisters, spouses.'),
    z.object({ household_of: SelectorSchema }).strict().describe('The others who live in one house with someone.'),
    z.object({ neighbours_of: SelectorSchema }).strict().describe("The grown people who live within three quarters of an hour's walk, outside their household."),
    z.object({ social_near: SelectorSchema }).strict().describe("The nearest place where people gather (tagged social), from someone's home."),
    z.object({ board_near: SelectorSchema }).strict().describe("The nearest notice board, from a place or someone's work."),
    z.object({ step: z.string() }).strict().describe('Where an earlier step of this plan happened.'),
    z.object({ mover: z.tuple([SelectorSchema, SelectorSchema]) }).strict().describe('Of two who set up house together: the one who moves (the player, or who lives with a parent).'),
    z.object({ stayer: z.tuple([SelectorSchema, SelectorSchema]) }).strict().describe('Of two who set up house together: the one who stays.'),
    z.object({ welcoming: SelectorSchema }).strict().describe('Who in an area welcomes its newcomers most: warm hearts who like them, not against them.'),
  ]),
)

/** A group plans move together: everyone who lives in these areas, alive and not with the player. */
const GroupSchema = z.object({ areas: z.array(z.string()).default([]), npcs: z.array(z.string()).default([]), except: z.array(z.string()).default([]) }).strict()

export const PlanEffectSchema = z.union([
  QuestEffectSchema,
  /** A trade route stops running, with why (M8.4): news, and the goods it brought stop coming. */
  z.object({ close_route: z.string(), why: z.string().optional() }).strict(),
  z.object({ open_route: z.string() }).strict(),
  /** A group flees: those near the player walk, the others become notes on the road. */
  z.object({ flee: z.string(), to: z.string(), days: z.number().int().positive() }).strict(),
  /** A route closes: an exit that cannot be used, with a reason. */
  z.object({ close: z.tuple([z.string(), z.string()]), reason: z.string() }).strict(),
  z.object({ open: z.tuple([z.string(), z.string()]) }).strict(),
  /** Scarcity: stock of a thing drops, and what comes in is a share of what came before. */
  z.object({ market: z.string(), factor: z.number().min(0).max(3) }).strict(),
  z.object({ tension: z.tuple([z.string(), z.string()]), delta: z.number().int(), why: z.string() }).strict(),
  z.object({ news: z.string(), area: z.string() }).strict(),
  /** An area takes a mood for some days (M10.11): panic, grief, feast or threat, with a line for its places and its people. */
  z.object({ mood: z.string(), kind: z.enum(MOOD_KINDS), days: z.number().positive(), line: z.string(), prompt: z.string().optional() }).strict(),
])
export type PlanEffect = z.infer<typeof PlanEffectSchema>

const FactTemplate = z
  .object({
    kind: z.string().regex(/^[a-z0-9_:]+$/).default('aftermath'),
    title: z.string(),
    precise: z.string(),
    village: z.string(),
    far: z.string(),
    grows: z.array(z.string()).optional().describe('A song or a story (M10.14): the village version, bigger with each retelling; the last stays.'),
    belang: z.number().int().min(0).max(5).default(1),
    about: z.array(z.string()).default([]),
    place: SelectorSchema.optional(),
    claim: ClaimSchema.optional(),
    witnesses: z.array(z.string()).optional().describe('Only these saw it (M9.4): a leak someone came upon; without it, everyone at the place.'),
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
  /**
   * A feast at a place for some hours: the people of the area come, and the guests from further off. A burial (M10.7) is
   * the same gathering in a quiet mood, and those in fresh grief come to it rather than keep away.
   */
  z.object({ feast: SelectorSchema, hours: z.number().positive().default(4), guests: z.array(SelectorSchema).default([]), kind: z.enum(['feast', 'burial']).default('feast') }).strict(),
  /** A lasting mark at a place (M10.7): a line in its description from now on, or for so many days; {a} and {place} filled in: a cairn with a name. */
  z.object({ mark: SelectorSchema, text: z.string(), days: z.number().positive().optional() }).strict(),
  /**
   * An area takes a mood for some days (M10.11): panic, grief, feast or threat. The area of a place, or an area by id;
   * a line under the descriptions of its places, a line in the prompt of those there, and a colour on the map.
   */
  z.object({ mood: SelectorSchema, kind: z.enum(MOOD_KINDS), days: z.number().positive(), line: z.string(), prompt: z.string().optional() }).strict(),
  /**
   * Prices in an area go down or up for some days (M10.14): the first market after the mill turns again. The area of
   * a place, or an area by id; the factor is on every price asked there, from half to half as much again.
   */
  z.object({ prices: SelectorSchema, factor: z.number().min(0.5).max(1.5), days: z.number().positive() }).strict(),
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
  // M8.2: the brain's verbs, usable by every plan.
  /** Someone goes after a goal of the brain's catalogue (Visit, Talk, Avoid, Confront, ...), for some hours: { goal: Visit, who: $a, target: loc_x }. */
  z.object({ goal: z.string(), who: SelectorSchema, target: SelectorSchema.optional(), priority: z.number().min(0).max(1).default(0.8), hours: z.number().positive().default(24) }).strict(),
  /** Someone asks the player for something (a visit, a thing): it goes in the journal when they speak to them. */
  z.object({ request: SelectorSchema, kind: z.enum(['visit', 'fetch']), target: SelectorSchema.optional(), item: z.string().optional(), name: z.string(), ask: z.string() }).strict(),
  /** Someone asks a trader or traveller whether a claim is true; what does not fit, they reject. Waits for a trader. */
  z.object({ ask_around: SelectorSchema, about: z.tuple([z.string(), z.string()]) }).strict(),
  /** Someone walks to another to tell them what they know about a subject: a report with its own travel time. */
  z.object({ carry_word: SelectorSchema, to: SelectorSchema, about: z.string() }).strict(),
  // Someone with news, a request, thanks or a grievance about the stranger goes to find them (M10.3).
  z.object({ seek_player: SelectorSchema, line: z.string(), hours: z.number().positive().default(24) }).strict(),
  // Someone goes for someone else of the world (M10.3, left over): an agreement attack; the rules play it out, nobody dies of it.
  z.object({ fight: SelectorSchema, target: SelectorSchema, reason: z.string() }).strict(),
  // Someone asks the stranger to come along somewhere (M10.3, left over): they find them and offer to lead; no, and they go alone or wait.
  z.object({ invite: SelectorSchema, to: SelectorSchema, person: SelectorSchema.optional(), line: z.string().optional(), otherwise: z.enum(['alone', 'wait']).default('alone'), hours: z.number().positive().default(24) }).strict(),
  /** Someone the gates let through chases a stranger out of the village. */
  z.object({ chase_away: z.tuple([SelectorSchema, SelectorSchema]) }).strict(),
  /** Someone both trust tries to make peace between two; who mediates decides how it ends. */
  z.object({ mediate: z.tuple([SelectorSchema, SelectorSchema]), by: SelectorSchema.optional() }).strict(),
  /** Someone recognises another from a memory: it comes back to them. */
  z.object({ recall: SelectorSchema, of: SelectorSchema }).strict(),
  /** Someone the gate lets lie, with a motive, puts an untrue claim about (design: "Liegen met een motief"). */
  z.object({ spread_rumour: SelectorSchema, fact: FactTemplate }).strict(),
  // M8.3: groups.
  /** Someone who fled or came from elsewhere stays for good: a free house in that area, or the place itself, is home now. */
  z.object({ settle: SelectorSchema, at: SelectorSchema }).strict(),
  /** People band together for or against the newcomers in an area. */
  z.object({ form_group: z.array(SelectorSchema).min(1), aim: z.enum(['against', 'for']), about: z.string(), name: z.string() }).strict(),
  // M8.5: growth.
  /** Newcomers from a template (or for a trade, by its workshop) come to live in a free house of a settlement and take up the trade. */
  z.object({ arrive: z.string(), to: z.string() }).strict(),
  /** A project of the content begins: materials from the store, workdays, money. */
  z.object({ build: z.string() }).strict(),
  /** A new object from a template of the content in its owner's home (M10.5): first the locked chest; items from its list. */
  z.object({ place_prop: z.string(), owner: SelectorSchema, items: z.array(z.string()).optional() }).strict(),
  /** A nameless group comes to a place for some days (M9.1): refugees, workers. */
  z.object({ crowd: z.string(), one: z.string(), count: z.number().int().positive().max(200), at: SelectorSchema, from: z.string(), days: z.number().positive(), profession: z.string() }).strict(),
  /** A settlement takes a new rank, paid from its purse: news of belang 4 (M9.1). */
  z.object({ rank: z.string(), kind: z.enum(['hamlet', 'village', 'town', 'city']), cost: z.number().int().min(0).default(0), by: z.string().optional() }).strict(),
  /**
   * A new faction forms (M10.22: an uprising that becomes a movement): only
   * from a plan, of a great line or a storyline, at most one a season in a
   * world, and kept as content in the save. Its seat in words, and where it
   * sits (a place or an area), with its first members.
   */
  z.object({ found_faction: z.string().regex(/^[a-z0-9_]+$/), name: z.string(), wants: z.string(), seat: z.string(), at: SelectorSchema.optional(), members: z.array(SelectorSchema).default([]), join: z.enum(['never', 'hired', 'reputation']).default('reputation') }).strict(),
  // M8.4: the economy.
  /** A settlement sends for goods: they come in so many days, paid at twice their worth ({ order: $value, to: $area }). */
  z.object({ order: z.string(), to: z.string(), qty: z.number().int().positive().default(6), days: z.number().int().positive().default(3), by: z.string().default('a carrier') }).strict(),
  /** Everything a quest or an effect plan could already do. */
  PlanEffectSchema,
])
export type Verb = z.infer<typeof VerbSchema>

export const StepSchema = z
  .object({
    id: Id.describe('A name for the step, unique in the plan.'),
    at: z
      .object({ days: z.number().min(0).optional(), hours: z.number().min(0).optional(), hour: z.number().int().min(0).max(23).optional(), rest_day: z.boolean().optional() })
      .strict()
      .optional()
      .describe('When, from the start of the plan: so many days and hours on, at an hour of the day, on a rest day.'),
    after: z.string().optional().describe('After another step was done or skipped (and at, from then).'),
    wait: z.number().min(0).default(0).describe('Hours to wait first.'),
    each: z.string().optional().describe('One by one for each member of a group of the plan, bound to $who.'),
    when: z.array(ConditionSchema).default([]).describe('Conditions: what someone knows (knows) and what is true.'),
    otherwise: z.enum(['skip', 'wait', 'fail']).default('skip').describe('When the conditions do not hold: skip the step, wait for them (until the plan expires), or let the plan fail.'),
    chance: z.number().min(0).max(1).optional().describe('The chance the step happens when it is due and its conditions hold, rolled once and seeded; otherwise it is skipped.'),
    every: z.number().int().positive().optional().describe('Due again every so many days at the same hour, done or skipped, for as long as the plan runs.'),
    unguarded: z.boolean().default(false).describe('Content only: the standard conditions of the verb do not apply to this step (M9.2). Ignored in a plan a model made.'),
    do: VerbSchema.describe('One verb.'),
  })
  .strict()
export type Step = z.infer<typeof StepSchema>

export const PlanSchema = z
  .object({
    id: Id.describe('The plan\'s id: a key, never changed once committed, and never shown to the player.'),
    name: z.string().describe('What the plan is, in a few words.'),
    groups: z.record(z.string(), GroupSchema).default({}).describe('The groups by area: everyone who lives there, alive and not travelling with the player.'),
    phases: z.array(z.object({ after: z.number().int().min(0), effects: z.array(PlanEffectSchema) }).strict()).default([]).describe('Phases in order: after so many days, what happens (effects on people, places and the world).'),
    max_effects: z.number().int().positive().default(30).describe('At most this many effects in each phase (design: a plan has a maximum).'),
    steps: z.array(StepSchema).max(30).default([]).describe('Steps in order: what people do, and when, with the news each step makes.'),
    expires: z.number().positive().optional().describe('Days after which what is left of the plan lapses.'),
    topic: z.string().optional().describe('What it is about: one plan per person per topic.'),
  })
  .strict()
  .refine((p) => p.phases.length + p.steps.length > 0, { message: 'a plan needs phases or steps' })
export type Plan = z.infer<typeof PlanSchema>

/** When a change in the world is a signal (M8.1): one of a new fact, conditions that come true, or a state the system works out. */
export const WatcherSchema = z
  .object({
    id: Id.describe('The watcher\'s id: a key, never changed once committed, and never shown to the player.'),
    signal: Id.describe('The signal it gives: the aftermath and intentions of this signal follow.'),
    event: Id.optional().describe('A name for what happened, for an aftermath that answers only this event of the signal.'),
    fact: z.object({ key: z.string().optional(), value: z.union([z.string(), z.array(z.string())]).optional(), not: z.union([z.string(), z.array(z.string())]).optional(), kind: z.string().optional() }).strict().optional().describe('A new fact with a claim of this key, and of this value or kind if given. Its people: $subject, $value, $about.'),
    belief: z.object({ key: z.string(), value: z.union([z.string(), z.array(z.string())]).optional(), kind: z.string().optional() }).strict().optional().describe('Someone comes to believe a claim of this key (and value or kind): $a who believes it, $b who told them (M8.2).'),
    when: z.array(ConditionSchema).optional().describe('Conditions that come true: a signal each time they do.'),
    probe: z
      .union([
        z.object({ house_empty: z.number().positive() }).strict(),
        z.object({ standing_rise: z.number().int().min(1).max(4) }).strict(),
        /** A grudge between two that has lasted so many days ($a and $b). */
        z.object({ grudge: z.number().positive() }).strict(),
        /** People from elsewhere who have stayed so many days: $a the one of the place who likes them least, $place where they stay, the claim what drove them there. */
        z.object({ strangers_stay: z.number().positive() }).strict(),
        /** Newcomers against the openness of a village, heavier with food short (M8.3): $a, $b, $c the villagers who mind them most, $area. */
        z.object({ friction: z.number().positive() }).strict(),
        /** A good a settlement's ledger fell short of so many days in a row (M8.4): $a the shopkeepers who sell it, $area, the claim { subject: area, key: short, value: the good }. */
        z.object({ shortage: z.number().int().positive() }).strict(),
        /** A good over twice what a settlement keeps, so many days in a row (M8.4): $a who sell or make it, $area, the claim { key: surplus }. */
        z.object({ surplus: z.number().int().positive() }).strict(),
        /** A price at a counter this many times its worth or more (M8.4), once a week: $a the shopkeeper, the claim { subject: area, key: price, value: the good }. */
        z.object({ price_doubled: z.number().positive() }).strict(),
        /** A workshop nobody works any more, so many days (M8.4): $place where it is, $area, the claim { key: trade, value: the workshop }. */
        z.object({ missing_trade: z.number().int().positive() }).strict(),
        /** Warm towards the stranger for so many days, with something shared (a secret, a favour done, a journey, a gift) (M10.3): $a the new friend. */
        z.object({ befriended: z.number().positive() }).strict(),
        /**
         * Never by itself (M10.24): the pulse sets it off when the stranger has had
         * nothing near them for too long and the chronicler brought nothing; $a
         * someone near the stranger, $place where the stranger is. Its kind is the
         * kind of hook it brings, never two of one kind in a row.
         */
        z.object({ pulse: z.enum(HOOK_KINDS) }).strict(),
      ])
      .optional().describe('A state the system works out: a house nobody has lived in for so many days ($place), a household that rose so many standings ($a and the rest of it).'),
    who: z.array(z.string()).optional().describe('Who it is about; for a fact, by default the subject and the value of its claim.'),
    place: z.string().optional().describe('Where it happens, when the conditions do not say.'),
    belang: z.number().int().min(0).max(5).optional().describe('How much it matters, from 0 to 5; left out, that of the fact.'),
  })
  .strict()
  .refine((w) => [w.fact, w.belief, w.when, w.probe].filter(Boolean).length === 1, { message: 'a watcher watches one of fact, belief, when or probe' })
export type Watcher = z.infer<typeof WatcherSchema>

/** What follows a signal by the rules, always, also without AI (M8.1). */
export const AftermathSchema = z
  .object({
    id: Id.describe('The aftermath\'s id: a key, never changed once committed, and never shown to the player.'),
    signal: Id.describe('The signal it follows.'),
    event: Id.optional().describe('Only for this event of the signal; left out, for every event.'),
    when: z.array(ConditionSchema).default([]).describe('Only when these hold, with the bindings of the signal.'),
    topic: Id.describe('One plan per person per topic: a second signal about the same does not start a second plan.'),
    expires: z.number().positive().default(30).describe('Days after which what is left of it lapses.'),
    groups: z.record(z.string(), GroupSchema).default({}).describe('The groups it moves, by area: everyone who lives there, alive and not travelling with the stranger.'),
    steps: z.array(StepSchema).min(1).max(30).describe('What follows, step by step: what people do, and when, with the news each step makes.'),
    brain: z.boolean().default(false).describe('The brain of $a may plan this for themselves and their household instead (M8.2); this is what happens without it.'),
    about: z.enum(['all', 'first']).default('all').describe('Whom it is about, for one plan per person and topic: all people of the signal, or only the first ($a; the second only told them).'),
  })
  .strict()
export type Aftermath = z.infer<typeof AftermathSchema>

/**
 * An intention a brain may choose (M8.2; design: "Bijsturing na de review"):
 * the same as a standard aftermath, for one signal, with a choice for the
 * model: a name, one line, who may choose it (conditions with $a the one who
 * chooses), and open bindings the brain fills in (who mediates, where to).
 */
export const IntentionSchema = z
  .object({
    id: Id.describe('The intention\'s id: a key, never changed once committed, and never shown to the player.'),
    signal: Id.describe('The signal it answers.'),
    event: Id.optional().describe('Only for this event of the signal; left out, for every event.'),
    when: z.array(ConditionSchema).default([]).describe('Who may choose it: conditions with $a the one who chooses.'),
    topic: Id.describe('What it is about: one plan per person per topic.'),
    expires: z.number().positive().default(14).describe('Days after which what is left of it lapses.'),
    groups: z.record(z.string(), GroupSchema).default({}).describe('The groups it moves, by area: everyone who lives there, alive and not travelling with the stranger.'),
    about: z.enum(['all', 'first']).default('first').describe('Whom it is about: all people of the signal, or only the first ($a).'),
    choice: z
      .object({
        name: z.string(),
        line: z.string(),
        open: z.record(Id, z.enum(['person', 'place', 'house'])).default({}).describe('Bindings the brain fills: a person it knows, a place it knows, or a free house.'),
      })
      .strict().describe('What the brain chooses from: a name, one line, and the bindings it fills in (a person, a place, a house).'),
    steps: z.array(StepSchema).min(1).max(20).describe('What follows once it is chosen, step by step.'),
  })
  .strict()
export type Intention = z.infer<typeof IntentionSchema>

/** The news a verb makes when a step is done: belang and three versions (M8.1). A world can word them its own way. */
export const VerbTextSchema = z
  .object({
    id: z.enum(['set_tie', 'end_tie', 'move_home', 'join_household', 'leave_household', 'set_work', 'quit_work', 'hire', 'feast', 'return', 'leave']).describe('The verb whose news this is: set_tie, move_home, set_work, feast and the rest.'),
    belang: z.number().int().min(0).max(5).describe('How much the news matters, from 0 to 5.'),
    title: z.string().describe('The news in a few words, for the journal.'),
    precise: z.string().describe('How someone who was there tells it.'),
    village: z.string().describe('How it goes round the village.'),
    far: z.string().describe('How it reaches other places.'),
  })
  .strict()
export type VerbText = z.infer<typeof VerbTextSchema>
