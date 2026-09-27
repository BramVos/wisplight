import { parse } from 'yaml'
import { z } from 'zod'
import { CreatureSchema, EncounterSchema, RulesSchema, type Creature, type Effect, type Encounter, type Rules, type Talent } from './rules/schema'
import { QuestBodySchema } from './quests/schema'
import { checkQuests } from './quests/check'
import { AftermathSchema, PlanSchema, VerbTextSchema, WatcherSchema, type Aftermath, type Plan, type VerbText, type Watcher } from './quests/planschema'
import { RELATION_ROLES } from './roles'

// Content is plain YAML in content/. This module parses and validates it
// without touching the file system, so it runs in Node and in the browser.
// Every file is a mapping with one top-level key that says what it holds.

export const DIRECTIONS = [
  'north',
  'south',
  'east',
  'west',
  'northeast',
  'northwest',
  'southeast',
  'southwest',
  'up',
  'down',
  'in',
  'out',
] as const
export type Direction = (typeof DIRECTIONS)[number]

export const NEEDS = ['hunger', 'rest', 'social', 'safety', 'work', 'faith'] as const
export type Need = (typeof NEEDS)[number]

const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9_]+$`))
const ItemCounts = z.record(z.string(), z.number().int().positive()).default({})
const Hours = z.string().regex(/^\d{2}(:\d{2})?-\d{2}(:\d{2})?$/)
const Weekday = z.enum(['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Rustdag'])

// ---------------------------------------------------------------- items

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  plural: z.string().optional(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  value: z.number().int().nonnegative(),
  food: z.number().int().min(0).max(100).optional(),
  /** A weapon (FO, chapter 12): its damage die, and what a critical hit does. */
  weapon: z
    .object({
      damage: z.string().regex(/^\d+d\d+$/),
      kind: z.enum(['melee', 'ranged', 'thrown']).default('melee'),
      light: z.boolean().default(false),
      two_hands: z.boolean().default(false),
      /** A critical hit: axes make bleed, clubs knock down, spears keep at a distance. */
      crit: z.enum(['bleeding', 'prone', 'push', 'none']).default('none'),
      /** How far a ranged weapon reaches. */
      range: z.enum(['near', 'far']).default('far'),
      /** Iron or cold iron: some spirits cannot bear it. */
      iron: z.boolean().default(false),
    })
    .strict()
    .optional(),
  /** Armour or a shield: the defence it gives, and how much Grace still counts in it. */
  armour: z
    .object({
      kind: z.enum(['light', 'medium', 'heavy', 'shield']),
      defence: z.number().int().min(0).max(6),
      cap: z.number().int().min(0).max(6).default(6),
    })
    .strict()
    .optional(),
  /** A remedy: what using it heals or cures (FO, chapter 11, "Aandoeningen"). */
  remedy: z.object({ heal: z.string().regex(/^\d+d\d+([+-]\d+)?$/).optional(), cures: z.array(z.string()).default([]) }).strict().optional(),
})
export type Item = z.infer<typeof ItemSchema>

// ---------------------------------------------------------------- objects and affordances

export const AffordanceSchema = z.object({
  id: z.string(),
  verb: z.string(),
  label: z.string(),
  actors: z.array(z.enum(['npc', 'player'])).default(['npc']),
  access: z.enum(['public', 'owner', 'household', 'staff']).default('public'),
  consumes: ItemCounts,
  produces: ItemCounts,
  duration: z.number().int().positive(),
  fee: z.number().int().nonnegative().default(0),
  satisfies: z.partialRecord(z.enum(NEEDS), z.number().int()).default({}),
  requires_state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  narrate_start: z.string().optional(),
  narrate_end: z.string().optional(),
  player_text: z.string().optional(),
  broken_text: z.string().optional(),
})
export type Affordance = z.infer<typeof AffordanceSchema>

export const ObjectTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  affordances: z.array(AffordanceSchema).default([]),
  repair: z
    .object({
      consumes: ItemCounts,
      duration: z.number().int().positive(),
      sets: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      narrate_end: z.string().optional(),
    })
    .optional(),
})
export type ObjectType = z.infer<typeof ObjectTypeSchema>

export const ObjectInstanceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  type: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  owner: z.string().optional(),
  household: z.string().optional(),
  staff: z.array(z.string()).default([]),
  provider: z.string().optional(),
  hours: Hours.optional(),
  days: z.array(Weekday).optional(),
  state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  state_text: z.record(z.string(), z.string()).default({}),
})
export type ObjectInstance = z.infer<typeof ObjectInstanceSchema>

// ---------------------------------------------------------------- services (shops)

const Supply = z.object({
  item: z.string(),
  amount: z.number().int().positive(),
  every: z.enum(['day', 'week']),
  at: z.number().int().min(0).max(23).default(6),
  weekday: Weekday.optional(),
  requires: z.object({ object: z.string(), state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).optional(),
})

const Demand = z.object({
  item: z.string(),
  amount: z.number().int().positive(),
  from: z.number().int().min(0).max(23),
  to: z.number().int().min(1).max(24),
  days: z.array(Weekday).optional(),
})

export const ServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  sells: z.record(z.string(), z.object({ stock: z.number().int().nonnegative(), target: z.number().int().positive(), price: z.number().int().positive().optional() })).default({}),
  buys: z.array(z.string()).default([]),
  lodging: z.number().int().positive().optional(),
  provider: z.string(),
  staff: z.array(z.string()).default([]),
  premises: z.array(z.string()).default([]),
  hours: Hours,
  days: z.array(Weekday).optional(),
  supply: z.array(Supply).default([]),
  demand: z.array(Demand).default([]),
})
export type Service = z.infer<typeof ServiceSchema>

// ---------------------------------------------------------------- locations and areas

const Exit = z.object({
  to: z.string(),
  minutes: z.number().int().positive().default(1),
})

export const LocationSchema = z.object({
  id: Id('loc'),
  name: z.string(),
  area: z.string(),
  tags: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  summary: z.string().optional(),
  description: z.object({ day: z.string(), night: z.string().optional() }),
  /** Other descriptions once a flag is set: the doorstep without the cat, once Fenna is home. */
  variants: z.array(z.object({ flag: z.string(), day: z.string(), night: z.string().optional() }).strict()).default([]),
  exits: z.partialRecord(z.enum(DIRECTIONS), Exit).default({}),
  objects: z.array(ObjectInstanceSchema).default([]),
  services: z.array(ServiceSchema).default([]),
  items: z.record(z.string(), z.number().int().positive()).default({}),
  /** Where on the map of the land it lies, in km, when not at its area's position (a tow path, a weir). */
  pos: z.tuple([z.number(), z.number()]).optional(),
})
export type Location = z.infer<typeof LocationSchema>

const Position = z.tuple([z.number(), z.number()])

export const AreaSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  kind: z.enum(['village', 'town', 'hamlet', 'inn', 'route', 'wilderness']),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  fame: z.number().int().min(0).max(5).default(1),
  /** Position on the map of the land, in km (Wereldboek, chapter 2). */
  pos: Position.optional(),
  /** Known in conversation through this lore topic instead of by its own name (the Kattenbroek). */
  topic: z.string().optional(),
})
export type Area = z.infer<typeof AreaSchema>

/** The topic by which people talk about an area. */
export function areaTopicId(content: Pick<Content, 'areas'>, areaId: string): string {
  return content.areas.get(areaId)?.topic ?? `area_${areaId}`
}

// ---------------------------------------------------------------- regions

/**
 * A region map (FO, chapter 4, "De streekkaart"): the designer's zone drawing,
 * the generator's rules and the landmarks you can see from afar. The hexes
 * themselves are generated from it with a fixed seed.
 */
export const RegionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  /** The area that stands for the open land between the places. */
  area: z.string(),
  /** Where the south-west corner lies on the map of the land, in km. */
  origin: z.tuple([z.number(), z.number()]),
  size: z.tuple([z.number().positive(), z.number().positive()]),
  hex: z.number().positive(),
  seed: z.number().int(),
  legend: z.record(z.string(), z.enum(['woods', 'fields', 'fen', 'water', 'heath', 'road', 'canal', 'path'])),
  /** One character per zone, rows from north to south. */
  zones: z.string(),
  rules: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('hidden_path'), topic: z.string(), from: z.string(), to: z.string() }),
        z.object({ kind: z.literal('sight'), area: z.string(), radius: z.number().positive(), fog: z.number().int().optional(), clear: z.number().int().optional() }),
        z.object({ kind: z.literal('channels'), from: z.string(), to: z.string() }),
      ]),
    )
    .default([]),
  landmarks: z.array(z.object({ area: z.string(), text: z.string(), range: z.number().positive() })).default([]),
  /** Roads, tow paths and fen paths as lines through the zones: areas or points in km from the south-west corner. */
  paths: z
    .array(z.object({ kind: z.enum(['road', 'canal', 'path']), name: z.string(), via: z.array(z.union([z.string(), z.tuple([z.number(), z.number()])])).min(2) }))
    .default([]),
})
export type Region = z.infer<typeof RegionSchema>

// ---------------------------------------------------------------- professions and NPCs

const ScheduleBlock = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
  activity: z.enum(['sleep', 'work', 'eat', 'socialize', 'pray', 'free', 'home']),
  at: z.string().optional(),
  days: z.array(Weekday).optional(),
})
export type ScheduleBlock = z.infer<typeof ScheduleBlock>

const DailyGoal = z.object({
  type: z.enum(['Produce', 'Repair']),
  item: z.string().optional(),
  service: z.string().optional(),
  object: z.string().optional(),
  qty: z.number().int().positive().optional(),
  days: z.array(Weekday).optional(),
})
export type DailyGoal = z.infer<typeof DailyGoal>

export const ProfessionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  schedule: z.array(ScheduleBlock),
  daily_goals: z.array(DailyGoal).default([]),
})
export type Profession = z.infer<typeof ProfessionSchema>

const Axis = z.number().int().min(-3).max(3)

export { RELATION_ROLES, type RelationRole } from './roles'

export const RelationSchema = z
  .object({
    /** An NPC, or a topic for someone the game only tells about (Fenna, the widow). */
    to: z.string().optional(),
    /** Someone who is not in the game at all, as the Wereldboek names them: "Joris", "her little brother". */
    name: z.string().optional(),
    pronoun: z.enum(['she', 'he', 'they']).optional(),
    role: z.enum(RELATION_ROLES),
    /** How close: -3 bitter, 0 plain, 3 would give their life for them. */
    bond: Axis.default(2),
    /** For people outside the simulation; NPCs have their own state. */
    status: z.enum(['alive', 'dead', 'missing', 'away']).default('alive'),
    /** Not spoken of to people the NPC does not trust. */
    private: z.boolean().default(false),
    /** Money this NPC owes the other, in duiten: the ledger of debts (FO, chapter 8). */
    owes: z.number().int().positive().optional(),
    note: z.string().optional(),
  })
  .refine((r) => Boolean(r.to) !== Boolean(r.name), { message: 'a relation needs either to or name' })
export type RelationDef = z.infer<typeof RelationSchema>

export const NpcSchema = z.object({
  id: Id('npc'),
  name: z.string(),
  short: z.string(),
  pronoun: z.enum(['she', 'he', 'they']),
  age: z.number().int().nonnegative(),
  profession: z.string(),
  home: z.string(),
  work: z.string().optional(),
  household: z.string().optional(),
  fame: z.number().int().min(0).max(5).default(0),
  appearance: z.string(),
  personality: z.object({ warmth: Axis, courage: Axis, honesty: Axis, temper: Axis, curiosity: Axis, diligence: Axis }),
  values: z.record(z.string(), Axis).default({}),
  quirks: z.array(z.string()).default([]),
  speech: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  public_facts: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  money: z.number().int().nonnegative().default(0),
  inventory: ItemCounts,
  knows_areas: z.array(z.string()).default([]),
  child: z.boolean().default(false),
  /** The patron the NPC follows (Wereldboek, chapter 4): followers of the same are a step friendlier. */
  patron: z.enum(['lantern', 'nehalennia', 'grey_rider', 'holle', 'baduhenna']).optional(),
  /** Class and level in a fight (FO, chapter 12); others fight as ordinary folk. */
  fighter: z.object({ class: z.string(), level: z.number().int().min(1).max(10) }).strict().optional(),
  /** Can travel with the player (FO, chapter 13): daily wage in duiten, what they think of deeds, and the talk at the fire. */
  companion: z
    .object({
      wage: z.number().int().nonnegative(),
      approves: z.array(z.string()).default([]),
      disapproves: z.array(z.string()).default([]),
      /** Places (areas or locations) they will not set foot in. */
      limits: z.array(z.string()).default([]),
      campfire: z.array(z.string()).default([]),
      /** Walks slowly: travel with them takes longer. */
      slow: z.boolean().default(false),
      /** The personal quest that opens at bond 3. */
      quest: z.string().optional(),
    })
    .strict()
    .optional(),
  /** A portrait of their own, or the plain figure of someone generic (after the M7 playtest). */
  portrait: z.enum(['unique', 'generic']).default('unique'),
  /** Not in the world at the start: under a curse, found or freed by a quest. */
  absent: z.boolean().default(false),
  /** Fights with the numbers of a creature from the bestiary (the Haakman, Black Mathijs). */
  creature: z.string().optional(),
  /** Open to romance (FO, chapter 8; Wereldboek, "Romance"): with whom, from which attitude. */
  romance: z.object({ open_to: z.enum(['anyone', 'women', 'men', 'nobody']), from: z.enum(['Friendly', 'Warm']).default('Warm'), note: z.string().optional() }).strict().optional(),
  relations: z.array(RelationSchema).default([]),
  secrets: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        hint: z.string(),
        admission: z.string().optional(),
        dc: z.number().int().default(18),
        /** A topic the player learns when the secret is told: the dry ridge. */
        teaches: z.string().optional(),
        /** Asked about one of these by someone it holds dear (Warm or better), the NPC tells it freely (FO, chapter 8). */
        about: z.array(z.string()).default([]),
      }),
    )
    .default([]),
})
export type Npc = z.infer<typeof NpcSchema>

/** How others call an NPC in running text: the first name, so "Old Aaltje" becomes "Aaltje". */
export function callName(npc: Pick<Npc, 'name'>): string {
  return npc.name.split(' ')[0] ?? npc.name
}

// ---------------------------------------------------------------- topics (lore and facts)

export const TopicSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  kind: z.enum(['lore', 'fact', 'place', 'person']),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  details: z.string().optional(),
  story: z.string().optional(),
  /** Whose telling the story is, when it is told in the first person. */
  teller: z.string().optional(),
  origin: z.string().optional(),
  /** Where the topic belongs on the map, when it is not an area of the content. */
  pos: Position.optional(),
  /** Known the same everywhere, like a custom of the whole countryside. */
  everywhere: z.boolean().default(false),
  /** Extra chance for some listeners: profession ids, quirks or "child". */
  audience: z.partialRecord(z.string(), z.number()).default({}),
  fame: z.number().int().min(0).max(5).default(2),
  known_by: z.array(z.string()).default([]),
})
export type Topic = z.infer<typeof TopicSchema>

// ---------------------------------------------------------------- world

/**
 * A story pattern (design: lore and world change, "Soorten verhalen"): the kind
 * says which piece of the motor plays it, the rest is data for that kind.
 */
export const PatternSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  kind: z.enum(['lost_thing', 'quarrel', 'theft', 'sickness', 'feast']),
  belang: z.number().int().min(0).max(5),
  /** How often the pacing engine picks it, against the other patterns. */
  weight: z.number().nonnegative().default(1),
  /** lost_thing: what can go missing. theft: what can be stolen. */
  items: z.array(z.string()).default([]),
  /** quarrel: what people fall out about. */
  reasons: z.array(z.string()).default([]),
  /** feast: the day it falls on, and where people gather. */
  date: z.object({ month: z.number().int().min(1).max(13), day: z.number().int().min(1).max(30) }).optional(),
  place: z.string().optional(),
  /** Texts with {owner}, {thing}, {place}, {a}, {b}, {reason}, {victim}, {goods}, {name}. */
  text: z.object({ title: z.string(), precise: z.string(), village: z.string(), far: z.string() }),
  /** A line the player sees when it happens in front of them. */
  scene: z.string().optional(),
})
export type Pattern = z.infer<typeof PatternSchema>

/** Rumours that are already going round when a game starts, true or not (design: lore and world change). */
export const NewsSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  title: z.string(),
  about: z.array(z.string()).default([]),
  place: z.string(),
  belang: z.number().int().min(0).max(5),
  truth: z.boolean().default(true),
  /** Who knows it at the start, and from whom: an NPC id or "witness". */
  known_by: z.partialRecord(z.string(), z.string()).default({}),
  text: z.object({ precise: z.string(), village: z.string(), far: z.string() }),
})
export type News = z.infer<typeof NewsSchema>

/**
 * A quest as far as other systems need to know it before the quest system
 * arrives (M7): who has a role in it. The death of someone with a role ends or
 * changes the quest, and the chronicler reacts at once.
 */
export const QuestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    kind: z.enum(['main', 'request', 'mystery', 'bargain', 'threat', 'discovery', 'conflict', 'social', 'trial', 'personal']),
    summary: z.string(),
    /** NPC ids. People who are not in the content yet stay out until they are. */
    givers: z.array(z.string()).default([]),
    helpers: z.array(z.string()).default([]),
    opponents: z.array(z.string()).default([]),
  })
  .extend(QuestBodySchema.shape)
export type Quest = z.infer<typeof QuestSchema>

// The chance that someone knows a topic, by fame and distance (FO, chapter 5). The designer can tune it per world.
const KnowledgeModifierSchema = z.object({
  profession: z.array(z.string()).optional(),
  quirk: z.array(z.string()).optional(),
  min_age: z.number().int().optional(),
  kinds: z.array(z.enum(['person', 'place', 'area', 'lore', 'fact'])).optional(),
  topics: z.array(z.string()).optional(),
  /** Only for people who sell one of these items. */
  sells: z.array(z.string()).optional(),
  /** Treat the topic as this much more famous. */
  fame: z.number().int().default(0),
  factor: z.number().positive().default(1),
  /** Raise the highest level the distance allows. */
  level: z.number().int().default(0),
  /** Know it at least this well. */
  min_level: z.number().int().min(0).max(3).default(0),
})
export type KnowledgeModifier = z.infer<typeof KnowledgeModifierSchema>

const FO_CHANCES = [
  [0.1, 0, 0, 0, 0],
  [0.9, 0.4, 0.05, 0, 0],
  [1, 0.9, 0.7, 0.1, 0],
  [1, 0.95, 0.85, 0.6, 0.25],
  [1, 1, 0.95, 0.85, 0.6],
  [1, 1, 1, 1, 0.95],
]

export const KnowledgeRulesSchema = z.object({
  /** Per fame 0 to 5: same settlement, up to 10 km, 30 km, 100 km, farther. */
  chance: z.array(z.array(z.number().min(0).max(1)).length(5)).length(6).default(FO_CHANCES),
  bands_km: z.tuple([z.number(), z.number(), z.number()]).default([10, 30, 100]),
  /** The highest level per distance band. */
  max_level: z.array(z.number().int().min(0).max(3)).length(5).default([3, 3, 2, 2, 1]),
  modifiers: z.array(KnowledgeModifierSchema).default([]),
})
export type KnowledgeRules = z.infer<typeof KnowledgeRulesSchema>

export const WorldSchema = z.object({
  id: z.string(),
  name: z.string(),
  intro: z.string().optional(),
  start: z.object({
    location: z.string(),
    year: z.number().int().nonnegative(),
    month: z.number().int().min(1).max(13),
    day: z.number().int().min(1).max(30),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59).default(0),
  }),
  player: z.object({ money: z.number().int().nonnegative(), inventory: ItemCounts }),
  knowledge: KnowledgeRulesSchema.default(KnowledgeRulesSchema.parse({})),
  /** The fixed block every model call gets about this world (FO, chapter 10); without it, the Nethermarch's. */
  frame: z.string().optional(),
  /** How pictures of places and people look in this world (after the M7 playtest): one style for all of them. */
  pictures: z.object({ style: z.string() }).strict().optional(),
  /** The names the game's own texts use (M8): the land, the region you play in, where the stranger comes from. */
  words: z.object({ land: z.string(), region: z.string(), from: z.string() }).strict().optional(),
  /** Names for the calendar (M8): thirteen months (the last one five days), seven weekdays, and the era after the year. */
  calendar: z.object({ era: z.string(), months: z.array(z.string()).length(13), weekdays: z.array(z.string()).length(7) }).strict().optional(),
  /** The coins (M8), largest first; prices in the content are in the smallest. */
  money: z
    .object({ units: z.array(z.object({ short: z.string(), name: z.string(), plural: z.string().optional(), value: z.number().int().positive() }).strict()).min(1) })
    .strict()
    .optional(),
  /** Who keeps the law (M8): wanted "in" where, the officer's title, and the NPC and place to pay fines. */
  law: z.object({ where: z.string(), officer: z.string(), npc: z.string().optional(), office: z.string().optional() }).strict().optional(),
})
export type WorldDef = z.infer<typeof WorldSchema>

// ---------------------------------------------------------------- factions and realms

export const FactionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    seat: z.string(),
    wants: z.string(),
    stance: z.string(),
    members: z.array(z.string()).default([]),
    allies: z.array(z.string()).default([]),
    rivals: z.array(z.string()).default([]),
    /** How the player can join: never, hired, by a patron, by reputation, or by buying citizenship. */
    join: z.enum(['never', 'hired', 'patron_lantern', 'patron_old', 'reputation', 'citizenship']).default('never'),
    /** The law this faction keeps: the Count's land or the town rights of Waagdam. */
    law: z.enum(['count', 'waagdam']).optional(),
  })
  .strict()
export type Faction = z.infer<typeof FactionSchema>

export const RealmSchema = z.object({ id: z.string().regex(/^[a-z0-9_]+$/), name: z.string(), ruler: z.string(), capital: z.string() }).strict()
export type Realm = z.infer<typeof RealmSchema>

export const TensionSchema = z.object({ between: z.tuple([z.string(), z.string()]), tension: z.number().int().min(0).max(100), why: z.string() }).strict()
export type Tension = z.infer<typeof TensionSchema>

// ---------------------------------------------------------------- loading

const FileSchema = z
  .object({
    world: WorldSchema.optional(),
    items: z.array(ItemSchema).optional(),
    object_types: z.array(ObjectTypeSchema).optional(),
    professions: z.array(ProfessionSchema).optional(),
    areas: z.array(AreaSchema).optional(),
    locations: z.array(LocationSchema).optional(),
    npcs: z.array(NpcSchema).optional(),
    topics: z.array(TopicSchema).optional(),
    news: z.array(NewsSchema).optional(),
    patterns: z.array(PatternSchema).optional(),
    quests: z.array(QuestSchema).optional(),
    regions: z.array(RegionSchema).optional(),
    rules: RulesSchema.optional(),
    factions: z.array(FactionSchema).optional(),
    realms: z.array(RealmSchema).optional(),
    tensions: z.array(TensionSchema).optional(),
    plans: z.array(PlanSchema).optional(),
    /** When a change is a signal, what follows by the rules, and how each verb is news (M8.1). */
    watchers: z.array(WatcherSchema).optional(),
    aftermath: z.array(AftermathSchema).optional(),
    verbs: z.array(VerbTextSchema).optional(),
    creatures: z.array(CreatureSchema).optional(),
    encounters: z.array(EncounterSchema).optional(),
  })
  .strict()

export interface ContentFile {
  path: string
  text: string
}

export interface Content {
  world: WorldDef
  items: Map<string, Item>
  objectTypes: Map<string, ObjectType>
  professions: Map<string, Profession>
  areas: Map<string, Area>
  locations: Map<string, Location>
  npcs: Map<string, Npc>
  topics: Map<string, Topic>
  news: Map<string, News>
  patterns: Map<string, Pattern>
  quests: Map<string, Quest>
  regions: Map<string, Region>
  /** The rules of play (FO, chapters 11 and 12); a content set without them plays with a ready-made character. */
  rules?: Rules
  creatures: Map<string, Creature>
  encounters: Map<string, Encounter>
  factions: Map<string, Faction>
  realms: Map<string, Realm>
  tensions: Tension[]
  plans: Map<string, Plan>
  /** The aftermath (M8.1): watchers, the standard aftermath per signal, and the news of each verb. All optional. */
  watchers: Map<string, Watcher>
  aftermath: Map<string, Aftermath>
  verbTexts: Map<string, VerbText>
  /** The chronicler's working instruction (content/CHRONICLER.md and the world's own), if there is one. */
  chronicler?: string
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Content has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
    this.name = 'ContentError'
  }
}

function addAll<T>(map: Map<string, T>, list: T[] | undefined, id: (value: T) => string, path: string, kind: string, problems: string[]) {
  for (const value of list ?? []) {
    const key = id(value)
    if (map.has(key)) problems.push(`${path}: duplicate ${kind} id ${key}`)
    else map.set(key, value)
  }
}

export function loadContent(files: ContentFile[]): Content {
  const problems: string[] = []
  const worlds: WorldDef[] = []
  const content = {
    items: new Map<string, Item>(),
    objectTypes: new Map<string, ObjectType>(),
    professions: new Map<string, Profession>(),
    areas: new Map<string, Area>(),
    locations: new Map<string, Location>(),
    npcs: new Map<string, Npc>(),
    topics: new Map<string, Topic>(),
    news: new Map<string, News>(),
    patterns: new Map<string, Pattern>(),
    quests: new Map<string, Quest>(),
    regions: new Map<string, Region>(),
    creatures: new Map<string, Creature>(),
    encounters: new Map<string, Encounter>(),
    factions: new Map<string, Faction>(),
    realms: new Map<string, Realm>(),
    tensions: [] as Tension[],
    plans: new Map<string, Plan>(),
    watchers: new Map<string, Watcher>(),
    aftermath: new Map<string, Aftermath>(),
    verbTexts: new Map<string, VerbText>(),
  }

  let chronicler: string | undefined
  let rules: Rules | undefined
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    // The shared working instruction first (it sorts first), then the world's own part.
    if (/(^|\/)CHRONICLER\.md$/.test(file.path)) {
      chronicler = chronicler ? `${chronicler.trimEnd()}\n\n${file.text}` : file.text
      continue
    }
    let doc: unknown
    try {
      doc = parse(file.text)
    } catch (error) {
      problems.push(`${file.path}: invalid YAML (${(error as Error).message})`)
      continue
    }
    const result = FileSchema.safeParse(doc)
    if (!result.success) {
      for (const issue of result.error.issues) problems.push(`${file.path}: ${issue.path.join('.') || '(root)'} ${issue.message}`)
      continue
    }
    const data = result.data
    if (data.world) worlds.push(data.world)
    addAll(content.items, data.items, (v) => v.id, file.path, 'item', problems)
    addAll(content.objectTypes, data.object_types, (v) => v.id, file.path, 'object type', problems)
    addAll(content.professions, data.professions, (v) => v.id, file.path, 'profession', problems)
    addAll(content.areas, data.areas, (v) => v.id, file.path, 'area', problems)
    addAll(content.locations, data.locations, (v) => v.id, file.path, 'location', problems)
    addAll(content.npcs, data.npcs, (v) => v.id, file.path, 'NPC', problems)
    addAll(content.topics, data.topics, (v) => v.id, file.path, 'topic', problems)
    addAll(content.news, data.news, (v) => v.id, file.path, 'news', problems)
    addAll(content.patterns, data.patterns, (v) => v.id, file.path, 'pattern', problems)
    addAll(content.quests, data.quests, (v) => v.id, file.path, 'quest', problems)
    addAll(content.regions, data.regions, (v) => v.id, file.path, 'region', problems)
    addAll(content.creatures, data.creatures, (v) => v.id, file.path, 'creature', problems)
    addAll(content.encounters, data.encounters, (v) => v.id, file.path, 'encounter', problems)
    addAll(content.factions, data.factions, (v) => v.id, file.path, 'faction', problems)
    addAll(content.realms, data.realms, (v) => v.id, file.path, 'realm', problems)
    content.tensions.push(...(data.tensions ?? []))
    addAll(content.plans, data.plans, (v) => v.id, file.path, 'plan', problems)
    addAll(content.watchers, data.watchers, (v) => v.id, file.path, 'watcher', problems)
    addAll(content.aftermath, data.aftermath, (v) => v.id, file.path, 'aftermath', problems)
    addAll(content.verbTexts, data.verbs, (v) => v.id, file.path, 'verb', problems)
    if (data.rules) {
      if (rules) problems.push(`${file.path}: the rules are defined twice`)
      rules = data.rules
    }
  }

  const world = worlds[0]
  if (worlds.length !== 1) problems.push(`expected exactly one world, found ${worlds.length}`)
  problems.push(...checkReferences(world, content))
  problems.push(...checkQuests({ ...content, ...(rules ? { rules } : {}) }))
  if (rules) problems.push(...checkRules(rules, content))
  if (problems.length > 0 || !world) throw new ContentError(problems)
  return { world, ...content, ...(rules ? { rules } : {}), ...(chronicler ? { chronicler } : {}) }
}

/** The rules refer to skills, talents, items, people and topics: all of them must exist. */
function checkRules(rules: Rules, c: Omit<Content, 'world'>): string[] {
  const problems: string[] = []
  const skills = new Set(rules.skills.map((s) => s.id))
  const conditions = new Set(rules.conditions.map((x) => x.id))
  const talents = new Set<string>()
  const skill = (id: string, where: string) => {
    if (!skills.has(id)) problems.push(`rules ${where}: unknown skill ${id}`)
  }
  const effects = (list: Effect[], where: string) => {
    for (const effect of list) {
      if ('bonus' in effect && effect.bonus.to.startsWith('skill:')) skill(effect.bonus.to.slice(6), where)
      if ('ability' in effect) {
        for (const step of effect.ability.do) {
          if ('condition' in step && !conditions.has(step.condition.name)) problems.push(`rules ${where}: unknown condition ${step.condition.name}`)
          if ('cure' in step && step.cure.name !== 'any' && !conditions.has(step.cure.name)) problems.push(`rules ${where}: unknown condition ${step.cure.name}`)
        }
      }
    }
  }
  const talent = (t: Talent, where: string) => {
    if (talents.has(t.id)) problems.push(`rules ${where}: duplicate talent id ${t.id}`)
    talents.add(t.id)
    effects(t.effects, `${where}.${t.id}`)
  }
  for (const t of rules.general_talents) talent(t, 'general_talents')
  for (const a of rules.ancestries) for (const s of Object.keys(a.aptitude)) skill(s, `ancestry ${a.id}`)
  for (const k of rules.classes) {
    for (const s of k.trained) skill(s, `class ${k.id}`)
    for (const item of Object.keys(k.gear)) if (!c.items.has(item)) problems.push(`rules class ${k.id}: unknown item ${item} in gear`)
    talent(k.core, `class ${k.id}`)
    for (const tree of k.trees) for (const t of tree.talents) talent(t, `class ${k.id}.${tree.id}`)
  }
  for (const b of rules.backgrounds) {
    for (const s of b.skills) skill(s, `background ${b.id}`)
    if (!rules.general_talents.some((t) => t.id === b.talent)) problems.push(`rules background ${b.id}: unknown general talent ${b.talent}`)
    for (const who of b.knows) if (!c.npcs.has(who)) problems.push(`rules background ${b.id}: unknown NPC ${who}`)
    for (const topic of b.topics) if (!c.topics.has(topic)) problems.push(`rules background ${b.id}: unknown topic ${topic}`)
  }
  for (const p of rules.patrons) for (const b of p.blessings) effects(b.effects, `patron ${p.id}`)
  for (const creature of c.creatures.values()) {
    for (const a of creature.attacks) if (a.effect && !conditions.has(a.effect.condition)) problems.push(`creature ${creature.id}: unknown condition ${a.effect.condition}`)
    for (const a of creature.abilities) effects([{ ability: a }], `creature ${creature.id}`)
    if (creature.lore?.topic && !c.topics.has(creature.lore.topic)) problems.push(`creature ${creature.id}: unknown topic ${creature.lore.topic}`)
  }
  for (const e of c.encounters.values()) {
    for (const place of e.places) if (!c.locations.has(place) && !c.areas.has(place)) problems.push(`encounter ${e.id}: unknown place ${place}`)
    for (const foe of e.foes) if (!c.creatures.has(foe.creature)) problems.push(`encounter ${e.id}: unknown creature ${foe.creature}`)
  }
  return problems
}

function checkReferences(world: WorldDef | undefined, c: Omit<Content, 'world'>): string[] {
  const problems: string[] = []
  const item = (id: string, where: string) => {
    if (!c.items.has(id)) problems.push(`${where}: unknown item ${id}`)
  }
  const npc = (id: string | undefined, where: string) => {
    if (id && !c.npcs.has(id)) problems.push(`${where}: unknown NPC ${id}`)
  }
  const location = (id: string | undefined, where: string) => {
    if (id && !c.locations.has(id)) problems.push(`${where}: unknown location ${id}`)
  }

  if (world) {
    location(world.start.location, 'world.start.location')
    for (const id of Object.keys(world.player.inventory)) item(id, 'world.player.inventory')
    npc(world.law?.npc, 'world.law.npc')
    location(world.law?.office, 'world.law.office')
  }
  for (const type of c.objectTypes.values()) {
    for (const aff of type.affordances) {
      for (const id of [...Object.keys(aff.consumes), ...Object.keys(aff.produces)]) item(id, `object type ${type.id}.${aff.id}`)
    }
  }
  for (const loc of c.locations.values()) {
    if (!c.areas.has(loc.area)) problems.push(`${loc.id}: unknown area ${loc.area}`)
    for (const [direction, exit] of Object.entries(loc.exits)) {
      if (!exit) continue
      location(exit.to, `${loc.id}.exits.${direction}`)
      const back = c.locations.get(exit.to)
      if (back && !Object.values(back.exits).some((e) => e?.to === loc.id) && !loc.tags.includes('one_way')) {
        problems.push(`${loc.id}: exit ${direction} to ${exit.to} has no way back`)
      }
    }
    for (const obj of loc.objects) {
      if (!c.objectTypes.has(obj.type)) problems.push(`${loc.id}.${obj.id}: unknown object type ${obj.type}`)
      npc(obj.owner, `${loc.id}.${obj.id}.owner`)
      npc(obj.provider, `${loc.id}.${obj.id}.provider`)
      for (const s of obj.staff) npc(s, `${loc.id}.${obj.id}.staff`)
    }
    for (const svc of loc.services) {
      npc(svc.provider, `${loc.id}.${svc.id}.provider`)
      for (const s of svc.staff) npc(s, `${loc.id}.${svc.id}.staff`)
      for (const p of svc.premises) location(p, `${loc.id}.${svc.id}.premises`)
      for (const id of [...Object.keys(svc.sells), ...svc.buys]) item(id, `${loc.id}.${svc.id}`)
      for (const s of svc.supply) item(s.item, `${loc.id}.${svc.id}.supply`)
      for (const d of svc.demand) item(d.item, `${loc.id}.${svc.id}.demand`)
    }
    for (const id of Object.keys(loc.items)) item(id, `${loc.id}.items`)
  }
  for (const n of c.npcs.values()) {
    if (!c.professions.has(n.profession)) problems.push(`${n.id}: unknown profession ${n.profession}`)
    location(n.home, `${n.id}.home`)
    location(n.work, `${n.id}.work`)
    for (const id of Object.keys(n.inventory)) item(id, `${n.id}.inventory`)
    for (const a of n.knows_areas) if (!c.areas.has(a)) problems.push(`${n.id}: unknown area ${a} in knows_areas`)
    for (const r of n.relations) {
      if (r.to && !c.npcs.has(r.to) && !c.topics.has(r.to)) problems.push(`${n.id}: relation to unknown person ${r.to}`)
      if (r.to === n.id) problems.push(`${n.id}: relation to itself`)
    }
  }
  for (const n of c.npcs.values()) {
    for (const secret of n.secrets) {
      if (secret.teaches && !c.topics.has(secret.teaches)) problems.push(`${n.id}.secrets.${secret.id}: teaches unknown topic ${secret.teaches}`)
      for (const t of secret.about) if (!c.topics.has(t)) problems.push(`${n.id}.secrets.${secret.id}: about unknown topic ${t}`)
    }
  }
  for (const a of c.areas.values()) if (a.topic && !c.topics.has(a.topic)) problems.push(`area ${a.id}: unknown topic ${a.topic}`)
  for (const r of c.regions.values()) {
    const area = (id: string, where: string) => {
      if (!c.areas.has(id)) problems.push(`region ${r.id}.${where}: unknown area ${id}`)
    }
    area(r.area, 'area')
    for (const rule of r.rules) {
      if (rule.kind === 'sight') area(rule.area, 'rules')
      else {
        area(rule.from, 'rules')
        area(rule.to, 'rules')
      }
      if (rule.kind === 'hidden_path' && !c.topics.has(rule.topic)) problems.push(`region ${r.id}: hidden path topic ${rule.topic} does not exist`)
    }
    for (const l of r.landmarks) area(l.area, 'landmarks')
    for (const path of r.paths) for (const point of path.via) if (typeof point === 'string') area(point, `paths.${path.name}`)
    const rows = r.zones.split('\n').filter((line) => line.length > 0)
    if (rows.length === 0) problems.push(`region ${r.id}: the zone drawing is empty`)
  }
  for (const q of c.quests.values()) {
    for (const who of [...q.givers, ...q.helpers, ...q.opponents]) npc(who, `quest ${q.id}`)
  }
  for (const f of c.factions.values()) {
    for (const m of f.members) npc(m, `faction ${f.id}.members`)
    for (const other of [...f.allies, ...f.rivals]) if (!c.factions.has(other)) problems.push(`faction ${f.id}: unknown faction ${other}`)
  }
  for (const t of c.tensions) for (const r of t.between) if (!c.realms.has(r)) problems.push(`tension: unknown realm ${r}`)
  for (const n of c.npcs.values()) if (n.companion?.quest && !c.quests.has(n.companion.quest)) problems.push(`${n.id}: unknown personal quest ${n.companion.quest}`)
  for (const t of c.topics.values()) {
    if (t.origin && !c.areas.has(t.origin) && !c.locations.has(t.origin)) problems.push(`topic ${t.id}: unknown origin ${t.origin}`)
    for (const n of t.known_by) npc(n, `topic ${t.id}.known_by`)
    if (t.teller) npc(t.teller, `topic ${t.id}.teller`)
  }
  for (const p of c.patterns.values()) {
    for (const i of p.items) item(i, `pattern ${p.id}.items`)
    location(p.place, `pattern ${p.id}.place`)
    if (p.kind === 'feast' && (!p.date || !p.place)) problems.push(`pattern ${p.id}: a feast needs a date and a place`)
  }
  for (const n of c.news.values()) {
    location(n.place, `news ${n.id}.place`)
    for (const [who, from] of Object.entries(n.known_by)) {
      npc(who, `news ${n.id}.known_by`)
      if (from !== 'witness') npc(from, `news ${n.id}.known_by.${who}`)
    }
  }
  for (const p of c.professions.values()) {
    for (const g of p.daily_goals) if (g.item) item(g.item, `profession ${p.id}.daily_goals`)
  }
  // Plans with steps, and the standard aftermath (M8.1): steps refer to steps and groups of their own, people and places exist.
  const steps = (where: string, list: Plan['steps'], groups: string[]) => {
    const ids = new Set<string>()
    for (const s of list) {
      if (ids.has(s.id)) problems.push(`${where}: duplicate step ${s.id}`)
      ids.add(s.id)
    }
    for (const s of list) {
      if (s.after && !ids.has(s.after)) problems.push(`${where}.${s.id}: after an unknown step ${s.after}`)
      if (s.after === s.id) problems.push(`${where}.${s.id}: after itself`)
      if (s.each && !groups.includes(s.each)) problems.push(`${where}.${s.id}: each of an unknown group ${s.each}`)
      for (const id of idsIn(s.do)) {
        if (id.startsWith('npc_')) npc(id, `${where}.${s.id}`)
        else if (id.startsWith('loc_')) location(id, `${where}.${s.id}`)
      }
      if ('profession' in s.do && s.do.profession && !c.professions.has(s.do.profession)) problems.push(`${where}.${s.id}: unknown profession ${s.do.profession}`)
    }
  }
  for (const p of c.plans.values()) steps(`plan ${p.id}`, p.steps, Object.keys(p.groups))
  for (const a of c.aftermath.values()) {
    steps(`aftermath ${a.id}`, a.steps, Object.keys(a.groups))
    if (!CODE_SIGNALS.includes(a.signal) && ![...c.watchers.values()].some((w) => w.signal === a.signal)) problems.push(`aftermath ${a.id}: no watcher gives the signal ${a.signal}`)
  }
  for (const w of c.watchers.values()) {
    for (const id of [...(w.who ?? []), w.place ?? ''].filter((x) => x && !x.startsWith('$'))) {
      if (id.startsWith('npc_')) npc(id, `watcher ${w.id}`)
      else if (id.startsWith('loc_')) location(id, `watcher ${w.id}`)
    }
  }
  return problems
}

/** Signals the systems give themselves, without a watcher in the content. */
const CODE_SIGNALS = ['house_lost', 'plan_failed']

/** Every string in a step's verb that looks like an id. */
function idsIn(value: unknown): string[] {
  if (typeof value === 'string') return /^(npc|loc)_[a-z0-9_]+$/.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(idsIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(idsIn)
  return []
}
