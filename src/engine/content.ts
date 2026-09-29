import { knobProblems } from './knobs'
import { parse } from 'yaml'
import { OutlandSchema, ResourceSchema, RouteSchema, SettlementSchema, type Outland, type Resource, type Route, type Settlement } from './economy/schema'
import { NamesSchema, NewcomerSchema, ProjectSchema, type Newcomer, type Project } from './growth/schema'
import { z } from 'zod'
import { DEFAULT_PALETTE, MapPaletteSchema, WorldMapSchema } from './map/palette'
import { BellSchema, SoundSchema } from './sound'
import { ImproviseSchema } from './improvise'
import { CreatureSchema, EncounterSchema, RulesSchema, type Creature, type Effect, type Encounter, type Rules, type Talent } from './rules/schema'
import { ConditionSchema, QuestBodySchema } from './quests/schema'
import { checkQuests } from './quests/check'
import { AftermathSchema, IntentionSchema, PlanSchema, VerbTextSchema, WatcherSchema, type Aftermath, type Intention, type Plan, type VerbText, type Watcher } from './quests/planschema'
import { TideSchema, type Tide } from './tideschema'
import { permitted, verbName } from './quests/verbs'
import { RELATION_ROLES } from './roles'
import { VoiceSchema, type Voice } from './dialogue/voiceSchema'
import { PassageSchema, type Passage } from './map/passageSchema'
import { DEFAULT_CALENDAR } from './clock'
import { GestureSchema, LodgingSchema, ReturningSchema, type Gesture, type Lodging, type Returning } from './belongSchema'

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

/**
 * Text to read as it flows (M9.4): the line ends of a YAML block join into
 * spaces, a blank line still parts two paragraphs. At a larger text size the
 * written line ends made room descriptions and stories ragged.
 */
const Prose = z.string().transform((text) => text.replace(/([^\n])\n(?=[^\n])/g, '$1 '))

const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9_]+$`))
const ItemCounts = z.record(z.string(), z.number().int().positive()).default({})
const Hours = z.string().regex(/^\d{2}(:\d{2})?-\d{2}(:\d{2})?$/)
/** A day of the world's own week (M10.17): checked on loading against the calendar in world.yaml. */
const Weekday = z.string().min(1)

// ---------------------------------------------------------------- items

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  plural: z.string().optional(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  value: z.number().int().nonnegative(),
  /** How someone uses it when the stranger made it and gave it to them (M10.14): "{name} cuts bread with the knife you made." */
  used: z.string().optional(),
  /** A poorer make of another thing (M10.14): what a failed recipe leaves, of use for something else and worth less. */
  quality: z.enum(['poor']).optional(),
  of: z.string().optional(),
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

/**
 * What a failed attempt at a recipe leaves (M10.14; the review of 28 September 2026: failure makes a new situation,
 * not "material gone, try again"): a poorer thing (of use for something else, worth less), the workplace damaged so
 * that it needs mending, or part of the material back. A critical failure may be worse: by default it is lost.
 * Without it, the material is gone, as before.
 */
export const CraftFailureSchema = z
  .object({
    outcome: z.enum(['poor', 'damaged', 'leftover', 'lost']),
    /** poor: the lesser thing it makes instead, and how many (default half of what the recipe makes, at least one). */
    item: z.string().optional(),
    qty: z.number().int().positive().optional(),
    /** leftover: the share of the material that comes back. */
    share: z.number().min(0).max(1).default(0.5),
    /** What a master of the craft says is wrong with it. */
    why: z.string().optional(),
    critical: z.enum(['poor', 'damaged', 'leftover', 'lost']).default('lost'),
  })
  .strict()
export type CraftFailure = z.infer<typeof CraftFailureSchema>

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
  /** Work for pay (M8.5): what the owner pays the player for it; what is made then goes into the owner's store, not the player's pocket. */
  wage: z.number().int().positive().optional(),
  /**
   * A check of the player's: failed, half the work and half the pay (M8.5). A
   * recipe of a craft (M10.5) needs only the difficulty: the craft says which
   * skill it leans on.
   */
  check: z.object({ skill: z.string().optional(), dc: z.number().int() }).strict().optional(),
  /** Experience for doing it well: work is a trade you get better at (M8.5). */
  xp: z.number().int().positive().optional(),
  /** Only in these months (1 to 13), as the ground allows: peat is cut in summer (M9.1). */
  months: z.array(z.number().int().min(1).max(13)).optional(),
  /** A recipe of a craft (M10.5): which craft, and which of its techniques. */
  craft: z.string().optional(),
  technique: z.string().optional(),
  /** The rank in the craft it takes: feast bread is for an expert baker (M10.5). */
  rank: z.enum(['novice', 'journeyman', 'expert', 'master']).optional(),
  /** A piece that counts as a masterwork: done well, the craft may reach master (M10.5). */
  masterwork: z.boolean().optional(),
  /** What a failed attempt at this recipe leaves, over the craft's own (M10.14). */
  failure: CraftFailureSchema.optional(),
})
export type Affordance = z.infer<typeof AffordanceSchema>

/** The ranks of a craft (M10.5), from the first loaf to the masterwork. */
export const CRAFT_RANKS = ['novice', 'journeyman', 'expert', 'master'] as const

/**
 * A craft (M10.5): baking, milling, smithing. Learnt by doing and from a
 * master, not with points; it leans on one skill until its own rank is
 * higher. Who has it by trade teaches it.
 */
export const CraftSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    /** What someone of the craft is called: a baker, a smith. */
    maker: z.string(),
    /** The skill it leans on at the start. */
    skill: z.string(),
    /** The trades that have it: they teach it. */
    professions: z.array(z.string()).default([]),
    techniques: z.array(z.object({ id: z.string().regex(/^[a-z0-9_]+$/), name: z.string() }).strict()).default([]),
    /** What a masterwork of this craft is, in words, for the sheet and the chronicler. */
    masterwork: z.string().optional(),
    /** Practice for journeyman, expert and master: first balance values. */
    practice: z.tuple([z.number().int().positive(), z.number().int().positive(), z.number().int().positive()]).default([10, 30, 100]),
    /** At most this much practice a day: the rest is only work. */
    per_day: z.number().int().positive().default(5),
    /** What a failed attempt leaves, for every recipe of the craft that says nothing of its own (M10.14). */
    failure: CraftFailureSchema.optional(),
  })
  .strict()
export type Craft = z.infer<typeof CraftSchema>

/** Whether an affordance can be done this month (M9.1). */
export function inSeason(affordance: Pick<Affordance, 'months'>, month: number): boolean {
  return !affordance.months || affordance.months.includes(month)
}

/**
 * A lock (M10.3): opened with the key of this id, by force (Athletics, loud),
 * or picked (Thievery, quiet; M10.5). How hard it is belongs to the lock, not
 * to the one at it: the work that went into it and what it is made of (M10.5);
 * a dc of its own overrides the quality.
 */
export const LockSchema = z
  .object({
    key: z.string(),
    dc: z.number().int().min(5).max(30).optional(),
    quality: z.enum(['crude', 'common', 'good', 'fine', 'masterwork']).default('common'),
    material: z.enum(['wood', 'iron', 'brass']).default('iron'),
  })
  .strict()
export type Lock = z.infer<typeof LockSchema>

/**
 * A template for a new object the chronicler may place (M10.5, place_prop):
 * first the locked chest. The engine sets it down in the owner's home with a
 * lock, what it holds of a bounded list and a share of the owner's purse, and
 * hints in the owner's words. How hard the lock is follows the object.
 */
export const PropTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    /** The object type it is. */
    type: z.string(),
    /** Its name, with {owner}: "{owner}'s chest". */
    name: z.string(),
    /** Tags of the owner's home it fits: a chest stands in a house (private), not on the green. */
    where: z.array(z.string()).min(1),
    lock: z
      .object({
        quality: z.array(z.enum(['crude', 'common', 'good', 'fine', 'masterwork'])).min(1),
        material: z.array(z.enum(['wood', 'iron', 'brass'])).min(1),
      })
      .strict()
      .optional(),
    /** What it may hold, besides money: the owner's own things of this kind. */
    items: z.array(z.string()).default([]),
    max_items: z.number().int().min(0).max(5).default(2),
    /** At most this share of the owner's purse goes in it. */
    money: z.number().min(0).max(1).default(0),
    /** The owner's fixed moment to look in it, the hour: then a loss is found. */
    check_hour: z.number().int().min(0).max(23).default(21),
    /** Hints in the owner's words: {owner}, {their}, {things}, {place}. The first is where it is and what is in it. */
    hints: z.array(z.object({ precise: z.string(), village: z.string(), far: z.string() }).strict()).min(1),
  })
  .strict()
export type PropTemplate = z.infer<typeof PropTemplateSchema>

/**
 * A thing in a place or on an object that a description names (M10.4; after
 * the M10 playtest also on places): the apple on the old stone, the bowl of
 * milk at the hollow. LOOK tells of it; TAKE and other verbs (drink, climb,
 * touch) have their own line; what a verb has no line for, it answers in a
 * way that leaves the thing be.
 */
export const DetailSchema = z
  .object({
    words: z.array(z.string()).min(1),
    look: z.string(),
    take: z.string().optional(),
    /** Lines for other verbs: { drink: "...", climb: "..." }. */
    verbs: z.record(z.string(), z.string()).optional(),
  })
  .strict()
export type Detail = z.infer<typeof DetailSchema>

/** Words on an object (M10.5): a rune stone, a carved lintel. Lore against the dc reads them. */
export const InscriptionSchema = z
  .object({
    text: z.string().describe('What it says, once read.'),
    dc: z.number().int().min(5).max(30).default(15),
    /** What it looks like before it is read. */
    look: z.string().optional(),
    /** A topic learnt by reading it: it goes in the journal. */
    topic: z.string().optional(),
  })
  .strict()

/** Something hidden in a place (M10.5): Perception against the dc finds it, once. */
export const HiddenSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    dc: z.number().int().min(5).max(30).default(15),
    text: z.string().describe('What the stranger finds.'),
    /** A thing that lies there, found: it is on the ground. */
    item: z.string().optional(),
    qty: z.number().int().positive().default(1),
    /** A topic learnt by finding it. */
    topic: z.string().optional(),
  })
  .strict()

export const ObjectTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  affordances: z.array(AffordanceSchema).default([]),
  /** Things that belong to it (M10.4): the apple on the old stone. LOOK tells of it, TAKE answers with its own line. */
  details: z.array(z.lazy(() => DetailSchema)).default([]),
  /** Words carved or written on it (M10.5): READ it. */
  inscription: InscriptionSchema.optional(),
  repair: z
    .object({
      consumes: ItemCounts,
      duration: z.number().int().positive(),
      sets: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      narrate_end: z.string().optional(),
    })
    .optional(),
  /** An act the rules do not know, done to it, may be improvised (M10.16). */
  improvise: z.lazy(() => ImproviseSchema).optional(),
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
  /** A lock on it, and what it holds (M10.3): a chest, a strongbox. */
  lock: LockSchema.optional(),
  /** This one in particular may be improvised on (M10.16), over its type's. */
  improvise: z.lazy(() => ImproviseSchema).optional(),
  contents: z.record(z.string(), z.number().int().positive()).optional(),
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
  lock: LockSchema.optional(),
})

export const LocationSchema = z.object({
  id: Id('loc'),
  name: z.string(),
  area: z.string(),
  tags: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  summary: z.string().optional(),
  /** The faith a holy place belongs to (M10.17): a wedding here raises the standing of that faith's faction. */
  faith: z.string().optional(),
  /** What you hear here (M10.15): wind in the reeds, the sea, the hearth; over its area's. */
  sound: SoundSchema.optional(),
  /** An act the rules do not know, done here, may be improvised (M10.16): what it can mean and what may happen. */
  improvise: z.lazy(() => ImproviseSchema).optional(),
  description: z.object({ day: Prose, night: Prose.optional() }),
  /**
   * Other descriptions once a flag is set (the doorstep without the cat, once Fenna is home), or while conditions hold
   * (M10.6: the mill turning again once De Zwaan is mended). The last that fits is shown.
   */
  variants: z
    .array(
      z
        .object({ flag: z.string().optional(), when: z.array(ConditionSchema).default([]), day: Prose, night: Prose.optional() })
        .strict()
        .refine((v) => v.flag !== undefined || v.when.length > 0, 'a variant needs a flag or conditions (when)'),
    )
    .default([]),
  exits: z.partialRecord(z.enum(DIRECTIONS), Exit).default({}),
  objects: z.array(ObjectInstanceSchema).default([]),
  services: z.array(ServiceSchema).default([]),
  items: z.record(z.string(), z.number().int().positive()).default({}),
  /** Where on the map of the land it lies, in km, when not at its area's position (a tow path, a weir). */
  pos: z.tuple([z.number(), z.number()]).optional(),
  /** Grounds of the zone that can be gathered from here (M10.5): the fen's herbs, the shore's kelp. */
  forage: z.array(z.string()).default([]),
  /** What lies hidden here (M10.5): SEARCH finds it. */
  hidden: z.array(HiddenSchema).default([]),
  /** Things the description names that you can look at and handle (after the M10 playtest): the hollow, the bowl of milk. */
  details: z.array(DetailSchema).default([]),
  /**
   * A place worth a moment (M10.11): two or three sentences for the first
   * time you reach it, in mist, at night or in a storm if it reads otherwise
   * then, and how it looks when it comes into view from afar (a landmark).
   */
  arrival: z.object({ text: z.string(), mist: z.string().optional(), night: z.string().optional(), storm: z.string().optional(), far: z.string().optional() }).strict().optional(),
})
export type Location = z.infer<typeof LocationSchema>

const Position = z.tuple([z.number(), z.number()])

export const AreaSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  kind: z.enum(['village', 'town', 'city', 'hamlet', 'inn', 'route', 'wilderness']),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  fame: z.number().int().min(0).max(5).default(1),
  /** Position on the map of the land, in km (Wereldboek, chapter 2). */
  pos: Position.optional(),
  /** Known in conversation through this lore topic instead of by its own name (the Kattenbroek). */
  topic: z.string().optional(),
  /** Weekdays of the world's calendar with a market here (M10.6): "it's Woensdag, market day in Waagdam". */
  market_days: z.array(z.string()).default([]),
  /** What you hear in the area's places that have no sound of their own (M10.15). */
  sound: SoundSchema.optional(),
  /** Improvisation for everything in the area that has none of its own (M10.16), with a smaller may. */
  improvise: z.lazy(() => ImproviseSchema).optional(),
  /**
   * Places of the area barred while conditions hold (M10.17; before, the widow's mist over the Kattenbroek in code):
   * only for a stranger carrying something with this tag, or for anyone; with what they see.
   */
  barred: z.array(z.object({ when: z.array(ConditionSchema).default([]), carrying: z.string().optional(), text: z.string() }).strict()).default([]),
  /** The land it belongs to (M10.23); without one the world's home land, and an area in lands/<land>/ belongs to that land. */
  land: z.string().optional(),
  /**
   * A border (M10.23): a bridge, a pass, a toll house, a harbour, where one
   * land meets another. The stranger crosses into a land only at a border,
   * where the scene shows it and the chronicle keeps it.
   */
  border: z.boolean().default(false),
  /** A land it shades into (M10.23): people here have sayings from both kits, and both coins are good. */
  blend: z.string().optional(),
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
/** What a character of a zone drawing may stand for, besides a region's own lands. */
const REGION_KINDS = ['woods', 'fields', 'fen', 'water', 'heath', 'road', 'canal', 'path']

export const RegionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  /** The land it lies in (M10.23), when not the world's home land: its palette colours the map. */
  land: z.string().optional(),
  /** The area that stands for the open land between the places. */
  area: z.string(),
  /** Where the south-west corner lies on the map of the land, in km. */
  origin: z.tuple([z.number(), z.number()]),
  size: z.tuple([z.number().positive(), z.number().positive()]),
  hex: z.number().positive(),
  seed: z.number().int(),
  /** A character of the drawing to what lies there: one of the engine's lands (woods, fields, fen, water, heath), a way (road, canal, path), or a terrain of this region's own under `lands`. */
  legend: z.record(z.string(), z.string()),
  /**
   * The region's own terrains (M10.20; found building The Quiet Reach: black
   * basalt and tidal shallows are no fen): each walks like one of the engine's
   * lands (its minutes, its sight, what swallows a leg), is coloured and named
   * by its own key in the palette, and has the line the stranger reads there.
   */
  lands: z.record(z.string().regex(/^[a-z0-9_]+$/), z.object({ like: z.enum(['woods', 'fields', 'fen', 'water', 'heath']), text: z.string().optional() }).strict()).default({}),
  /** One character per zone, rows from north to south. */
  zones: z.string(),
  /** The size of one character of the drawing in km, east to west and north to south (M10.20: a small island is drawn a hex a character); without it half a km by one. */
  zone: z.tuple([z.number().positive(), z.number().positive()]).optional(),
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
  /**
   * What lies beyond each edge of the map (M10.21): the line the stranger reads
   * on walking up to it, from the world book, and the far places that way,
   * which they may go on to (on foot in days, or by a line). An edge without
   * one says that nobody has told them yet; beyond the last land the world
   * book names, nothing is made.
   */
  beyond: z
    .array(
      z
        .object({
          side: z.enum(['north', 'east', 'south', 'west']),
          text: z.string(),
          /** Far places that way, by topic. */
          toward: z.array(z.string()).default([]),
        })
        .strict(),
    )
    .default([]),
  /** Roads, tow paths and fen paths as lines through the zones: areas or points in km from the south-west corner. */
  paths: z
    .array(
      z.object({
        kind: z.enum(['road', 'canal', 'path']),
        name: z.string(),
        via: z.array(z.union([z.string(), z.tuple([z.number(), z.number()])])).min(2),
        /** A way on another level (M10): a tunnel under the ground, a walk through the crowns. Its ends lead up or down. */
        level: z.string().optional(),
        /** Known only to whoever knows this topic, as the hidden ridge (M10). */
        topic: z.string().optional(),
        /** The line the stranger reads walking along it (M10.20); without it the Nethermarch's line for its kind. */
        text: z.string().optional(),
      }),
    )
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
  /** The skill this trade can teach someone, for a price or a favour (M10.3, the offer teach). */
  teaches: z.string().optional(),
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
  /**
   * The profession is hidden (M10.8): the stranger sees the cover and the public short name until they know for
   * sure (a secret of theirs found out), Tamsin the hedge-witch as "an old woman who keeps goats".
   */
  hidden: z.boolean().default(false),
  cover: z.string().optional(),
  short_public: z.string().optional(),
  home: z.string(),
  work: z.string().optional(),
  household: z.string().optional(),
  fame: z.number().int().min(0).max(5).default(0),
  appearance: z.string(),
  personality: z.object({ warmth: Axis, courage: Axis, honesty: Axis, temper: Axis, curiosity: Axis, diligence: Axis }),
  values: z.record(z.string(), Axis).default({}),
  quirks: z.array(z.string()).default([]),
  speech: z.string().optional(),
  /** Their group in the world's voice kit (M10.10), when not by where they live or what they do. */
  voice: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  public_facts: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  money: z.number().int().nonnegative().default(0),
  inventory: ItemCounts,
  knows_areas: z.array(z.string()).default([]),
  child: z.boolean().default(false),
  /** The patron the NPC follows (Wereldboek, chapter 4): followers of the same are a step friendlier. */
  /** A patron of the world's rules (M10.17: any world's, no longer the Nethermarch's five). */
  patron: z.string().optional(),
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
  /** Their faith, one of the world's (M9.1); without it, from their patron, or what most people hold. */
  faith: z.string().optional(),
  /** Fights with the numbers of a creature from the bestiary (the Haakman, Black Mathijs). */
  creature: z.string().optional(),
  /** Open to romance (FO, chapter 8; Wereldboek, "Romance"): with whom, from which attitude. */
  romance: z.object({ open_to: z.enum(['anyone', 'women', 'men', 'nobody']), from: z.enum(['Friendly', 'Warm']).default('Warm'), note: z.string().optional() }).strict().optional(),
  /**
   * What this person hires out (M10.17, before M7.2's punt of Wouter in code): a punt, a horse, a skiff, a sled.
   * HIRE <name> with the owner there; for the hours given it lets the stranger cross what it crosses. A friend pays nothing.
   */
  hires: z
    .array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_]+$/),
          name: z.string(),
          aliases: z.array(z.string()).default([]),
          /** The price for the hire, in the smallest coin. */
          price: z.number().int().nonnegative(),
          hours: z.number().positive().default(12),
          /** What it lets the stranger cross that stops a walker: open water and channels. */
          crosses: z.array(z.enum(['water'])).default([]),
          /** Where the owner is found, when the stranger asks elsewhere: "the eel-fisher, at his hut south of the peat cuttings". */
          where: z.string().optional(),
          /** What the owner says on handing it over. */
          line: z.string().optional(),
          free_for_friends: z.boolean().default(true),
        })
        .strict(),
    )
    .default([]),
  relations: z.array(RelationSchema).default([]),
  secrets: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        hint: z.string(),
        admission: z.string().optional(),
        dc: z.number().int().default(18),
        /** What the player learns when the secret is told (the dry ridge): a topic, person, place or area_<id> (M10.20). */
        teaches: z.string().optional(),
        /** Asked about one of these by someone it holds dear (Warm or better), the NPC tells it freely (FO, chapter 8): topics, people, places or area_<id> (M10.20). */
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
  story: Prose.optional(),
  /** Whose telling the story is, when it is told in the first person. */
  teller: z.string().optional(),
  origin: z.string().optional(),
  /** Where the topic belongs on the map, when it is not an area of the content. */
  pos: Position.optional(),
  /** What everyone talks about when asked what's new (M8.2: content, not a list in the code). */
  standing_talk: z.boolean().default(false),
  /** Known the same everywhere, like a custom of the whole countryside. */
  everywhere: z.boolean().default(false),
  /** Extra chance for some listeners: profession ids, quirks or "child". */
  audience: z.partialRecord(z.string(), z.number()).default({}),
  fame: z.number().int().min(0).max(5).default(2),
  known_by: z.array(z.string()).default([]),
  /** The land a far place lies in (M10.23): what grows there in play is of that land. */
  land: z.string().optional(),
  /**
   * A far town that grows by district (M10.21): the world book names its
   * quarters. The first is where the stranger comes in; each is made playable
   * only when they do something there (the first) or go there (the rest).
   */
  districts: z
    .array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_]+$/),
          name: z.string(),
          /** What it is, from the world book: the chronicler builds on it, and without a model it is the district's own line. */
          line: z.string(),
        })
        .strict(),
    )
    .default([]),
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

/** The names the game's own texts use (M8): the land, the region you play in, where the stranger comes from. */
const WordsSchema = z
  .object({
    land: z.string(),
    region: z.string(),
    from: z.string(),
    /** How a night's sleep reads here (M10.17): in a room, at home with a spouse, and rough; each a sentence. */
    sleep: z.object({ room: z.string().optional(), home: z.string().optional(), rough: z.string().optional() }).strict().optional(),
  })
  .strict()

/** The coins (M8), largest first; prices in the content are in the smallest. */
const CoinsSchema = z.array(z.object({ short: z.string(), name: z.string(), plural: z.string().optional(), aliases: z.array(z.string()).default([]), value: z.number().int().positive() }).strict()).min(1)

/** Who keeps the law (M8): wanted "in" where, the officer's title, and the NPC and place to pay fines. */
const LawSchema = z
  .object({
    where: z.string(),
    officer: z.string(),
    npc: z.string().optional(),
    office: z.string().optional(),
    lord: z.string().optional(),
    /**
     * Fines in the smallest coin (M10.17): for a death, a beating, and the least for a theft; else by the world's coins.
     * A death or a beating may be "hearing" instead (M10.20): no fine buys it off; the stranger is held and heard.
     */
    fines: z
      .object({
        murder: z.union([z.number().int().positive(), z.literal('hearing')]).optional(),
        assault: z.union([z.number().int().positive(), z.literal('hearing')]).optional(),
        least: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    /** What a hearing is in this world (M10.20): how long the stranger is held first, and the words for being held and heard. */
    hearing: z
      .object({
        hours: z.number().int().min(1).max(336).default(24),
        held: z.string().optional(),
        heard: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

/** The five standings in this world's words, lowest first, and the trades that are an office (M8.2). */
const StandingSchema = z.object({ names: z.array(z.string()).length(5), offices: z.array(z.string()).default([]) }).strict()

/** The bonds a speaker may name someone new by, and the domains a talk must be in for it (M10.9). */
const SketchSchema = z.object({ bonds: z.record(z.string(), z.enum(RELATION_ROLES)), domains: z.string().optional() }).strict()

/** The faiths (M9.1); with the faction that stands for each (M10.17). */
const FaithsSchema = z.array(z.object({ id: z.string().regex(/^[a-z0-9_]+$/), name: z.string(), patrons: z.array(z.string()).default([]), oaths: z.array(z.string()).default([]), faction: z.string().optional() }).strict())

export const WorldSchema = z.object({
  id: z.string(),
  name: z.string(),
  intro: Prose.optional(),
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
  /** The fixed block every model call gets about this world (FO, chapter 10); without it, a plain one that names no world (M10.17). */
  frame: z.string().optional(),
  /** How pictures of places and people look in this world (after the M7 playtest): one style for all of them. */
  pictures: z.object({ style: z.string() }).strict().optional(),
  /** The map of this world (M10): its palette, and its levels from below to above. */
  map: WorldMapSchema.optional(),
  /** The names the game's own texts use (M8): the land, the region you play in, where the stranger comes from. */
  words: WordsSchema.optional(),
  /** Names for the calendar (M8): thirteen months (the last one five days), seven weekdays, and the era after the year. */
  // Thirteen months (twelve of thirty days and the short thirteenth), and a week of as many days as it names (M10.17).
  calendar: z.object({ era: z.string(), months: z.array(z.string()).length(13), weekdays: z.array(z.string()).min(1), start_weekday: z.string().optional() }).strict().optional(),
  /**
   * The weather of this world (M10.8): the season of each month, the chances of each weather per season, how likely
   * the sky stays as it is for another part of the day, where the wind mostly comes from, and who reads the sky.
   */
  weather: z
    .object({
      seasons: z.array(z.string()).length(13),
      chances: z.record(z.string(), z.partialRecord(z.enum(['clear', 'overcast', 'rain', 'fog', 'storm', 'frost', 'snow']), z.number().min(0))),
      stay: z.number().min(0).max(1).optional(),
      prevailing: z.enum(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']).optional(),
      /** The sky in this world's words (M10.17), per kind of weather: one sentence, or one for the day and one for the night. */
      lines: z.partialRecord(z.enum(['clear', 'overcast', 'rain', 'fog', 'storm', 'frost', 'snow']), z.union([z.string(), z.object({ day: z.string(), night: z.string().optional() }).strict()])).optional(),
      readers: z.array(z.string()).default([]),
    })
    .strict()
    .optional(),
  /** The coins (M8), largest first; prices in the content are in the smallest. */
  money: z.object({ units: CoinsSchema }).strict().optional(),
  /** Who keeps the law (M8): wanted "in" where, the officer's title, and the NPC and place to pay fines. */
  law: LawSchema.optional(),
  /** Towns with rights of their own (M8.2): their own fines, officer and place to pay, and maybe no trade with someone wanted. */
  towns: z
    .array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_]+$/),
          area: z.string(),
          where: z.string(),
          officer: z.string(),
          offices: z.array(z.string()).default([]),
          trade_ban: z.boolean().default(false),
          cleared: z.string().optional(),
        })
        .strict(),
    )
    .default([]),
  /** The five standings in this world's words, lowest first, and the trades that are an office (M8.2). */
  standing: StandingSchema.optional(),
  /** Plans that run from the first day (M8.3): the opponents who do not wait for the player. */
  plans: z.array(z.string()).default([]),
  /** Names for people who come during a game (M8.5). */
  names: NamesSchema.optional(),
  /**
   * Sketch figures (M10.9): the bonds a speaker may name someone new by, as
   * what that someone is to them ("cousin": kin, "old master": teacher), and
   * the domains a talk must be in for it (family, trade, the speaker's past).
   */
  sketch: SketchSchema.optional(),
  /** At most so many newcomers a season (M8.5). */
  newcomers_per_season: z.number().int().min(0).default(6),
  /** The faiths of this world (M9.1): the first is what most people hold; a faith may go with patrons of the rules. */
  // Each faith swears by its own (M10.8): "Saint Brand's light", "Holle take it"; the guard puts these in place of ours.
  /** The faiths (M9.1); with the faction that stands for each, whose standing a wedding at its holy place raises (M10.17). */
  faiths: FaithsSchema.default([]),
  /** Bells that ring on the hour (M10.15): heard plainly in some areas and far off in others, and a line in the text. */
  bells: z.array(BellSchema).default([]),
  /**
   * The knobs of this world (M10.20): rules of play set otherwise than the
   * default, by the knob's id (src/engine/knobs.ts, docs/KNOBS.md): one number,
   * or for a table the rows that differ.
   */
  knobs: z.record(z.string(), z.union([z.number(), z.record(z.string(), z.number())])).optional(),
})
export type WorldDef = z.infer<typeof WorldSchema>

/**
 * A land (M10.23; Bram, 28 September 2026: what happens when the stranger
 * goes to another continent, with a dynamic of its own?): the same world, its
 * own frame. A land lives in content/<world>/lands/<land>/: its land.yaml,
 * maybe a voice.yaml, and the areas, people, factions and realms, trades,
 * crafts and beasts of its own, which play like the world's. What a land
 * does not have it takes from the world: always the calendar and the clock
 * (the stranger takes their time along), and prices in the content, which
 * are in the world's smallest coin wherever they are paid.
 */
export const LandSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    /** The realm of the world's realms that rules it, when one does. */
    realm: z.string().optional(),
    /** The fixed block every model call gets while the stranger is in this land, in place of the world's. */
    frame: z.string(),
    /** What the stranger notices crossing into it, told at the border: another way of address, other money on the table. */
    crossing: z.string().optional(),
    /** Its own words for the game's texts; without them its name, and the stranger comes from the world's land. */
    words: WordsSchema.partial().optional(),
    names: NamesSchema.optional(),
    faiths: FaithsSchema.optional(),
    /**
     * Its own coins, largest first, and the rate: how many of its smallest
     * coin one of the world's smallest buys (a whole number, so every sum
     * comes out even). Prices stay in the world's smallest coin; the land
     * tells them in its own, and the coins are changed at the border.
     */
    money: z.object({ units: CoinsSchema, rate: z.number().int().positive() }).strict().optional(),
    law: LawSchema.optional(),
    standing: StandingSchema.optional(),
    sketch: SketchSchema.optional(),
    pictures: z.object({ style: z.string() }).strict().optional(),
    /** The colours and signs of its map; its levels are the world's. */
    palette: MapPaletteSchema.optional(),
  })
  .strict()
export type Land = z.infer<typeof LandSchema> & {
  /** How people of this land speak (its lands/<land>/voice.yaml); without one, the world's kit. */
  voice?: Voice
}

// ---------------------------------------------------------------- factions and realms

export const FactionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    seat: z.string(),
    wants: z.string(),
    /**
     * Where else they sit (M10.22): a place (a location or an area) with what
     * they want there. A new town brings no new factions: a district gets a
     * seat of one the world has (the guild's hall in Graafhaven).
     */
    seats: z.array(z.object({ at: z.string(), wants: z.string() }).strict()).default([]),
    /** Where they stand on what divides the land: "for the drainage". */
    stance: z.string().optional(),
    members: z.array(z.string()).default([]),
    allies: z.array(z.string()).default([]),
    rivals: z.array(z.string()).default([]),
    /**
     * How the player can join: never, hired (they hire, they do not enlist), by reputation, or on terms (M10.17, before
     * that the Lantern, the Old Faith and the town rights at the Waag were in code): sworn to one of some patrons or to
     * none of others, at some places or a place with a tag, for a fee, from a reputation; with what is said when the
     * stranger falls short.
     */
    join: z
      .union([
        z.enum(['never', 'hired', 'reputation']),
        z
          .object({
            patrons: z.array(z.string()).optional(),
            not_patrons: z.array(z.string()).optional(),
            at: z.array(z.string()).optional(),
            tag: z.string().optional(),
            fee: z.number().int().positive().optional(),
            reputation: z.number().optional(),
            says: z.object({ patron: z.string().optional(), place: z.string().optional(), fee: z.string().optional(), reputation: z.string().optional() }).strict().default({}),
          })
          .strict(),
      ])
      .default('never'),
    /** The law this faction keeps: the land's (count), or a town's from world.yaml. */
    law: z.string().optional(),
  })
  .strict()
export type Faction = z.infer<typeof FactionSchema>

/** Sentences for a journey (M10.11): chosen by the rules, seeded, per terrain, weather and time of day. */
export const JourneySchema = z
  .object({
    /** Per kind of land (fen, fields, heath, woods, water) and way (canal, road, path, ridge). */
    terrain: z.record(z.string(), z.array(z.string())).default({}),
    /** Per weather (clear, overcast, rain, fog, storm, frost, snow). */
    weather: z.record(z.string(), z.array(z.string())).default({}),
    night: z.array(z.string()).default([]),
    /** What may happen on a journey over known ground (FO, chapter 4, "Snelreizen"). */
    on_the_way: z.array(z.object({ text: z.string(), where: z.enum(['canal', 'road', 'fen', 'any']), night: z.boolean().optional(), minutes: z.number().int().positive().optional() }).strict()).default([]),
  })
  .strict()
export type Journey = z.infer<typeof JourneySchema>

export const RealmSchema = z.object({ id: z.string().regex(/^[a-z0-9_]+$/), name: z.string(), ruler: z.string(), capital: z.string() }).strict()
export type Realm = z.infer<typeof RealmSchema>

export const TensionSchema = z.object({ between: z.tuple([z.string(), z.string()]), tension: z.number().int().min(0).max(100), why: z.string() }).strict()
export type Tension = z.infer<typeof TensionSchema>

// ---------------------------------------------------------------- loading

export const FileSchema = z
  .object({
    world: WorldSchema.optional(),
    /** A land of the world (M10.23), in lands/<land>/land.yaml. */
    land: LandSchema.optional(),
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
    /** The voice kit (M10.10): oaths, sayings, address, time and what is not here. */
    voice: VoiceSchema.optional(),
    /** Sentences for a journey (M10.11): per terrain and weather, at night, and what may happen on the way. */
    journey: JourneySchema.optional(),
    /** Lines of transport (M10.12): a barge, a coach, a ferry, with stops, days, fares and legs. */
    passages: z.array(PassageSchema).optional(),
    /** Returning, gestures and a place to belong (M10.13). */
    returning: ReturningSchema.optional(),
    gestures: z.array(GestureSchema).optional(),
    lodgings: z.array(LodgingSchema).optional(),
    factions: z.array(FactionSchema).optional(),
    realms: z.array(RealmSchema).optional(),
    tensions: z.array(TensionSchema).optional(),
    plans: z.array(PlanSchema).optional(),
    /** The great lines (M10.22): great dangers that grow day by day and are judged each month. */
    tides: z.array(TideSchema).optional(),
    /** When a change is a signal, what follows by the rules, and how each verb is news (M8.1). */
    watchers: z.array(WatcherSchema).optional(),
    aftermath: z.array(AftermathSchema).optional(),
    intentions: z.array(IntentionSchema).optional(),
    verbs: z.array(VerbTextSchema).optional(),
    creatures: z.array(CreatureSchema).optional(),
    encounters: z.array(EncounterSchema).optional(),
    /** The economy (M8.4): settlements with their ledger, the ground, routes, and regions beyond the map. */
    settlements: z.array(SettlementSchema).optional(),
    resources: z.array(ResourceSchema).optional(),
    routes: z.array(RouteSchema).optional(),
    outlands: z.array(OutlandSchema).optional(),
    /** Growth (M8.5): households that may come, and what may be built. */
    newcomers: z.array(NewcomerSchema).optional(),
    projects: z.array(ProjectSchema).optional(),
    /** Crafts (M10.5): baking, smithing, fishing, with their techniques. */
    crafts: z.array(CraftSchema).optional(),
    /** Templates of new objects the chronicler may place (M10.5). */
    props: z.array(PropTemplateSchema).optional(),
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
  /** How people here speak (M10.10); a world without one keeps the old fixed guard. */
  voice?: Voice
  /** The lands of the world besides its home land (M10.23), each with its own frame. */
  lands: Map<string, Land>
  /** Sentences for journeys (M10.11); a world without them keeps the one line of before. */
  journey?: Journey
  /** Lines of transport (M10.12). */
  passages: Map<string, Passage>
  /** The words for what changed since a visit (M10.13); without them, nothing is said. */
  returning?: Returning
  gestures: Map<string, Gesture>
  lodgings: Map<string, Lodging>
  creatures: Map<string, Creature>
  encounters: Map<string, Encounter>
  factions: Map<string, Faction>
  realms: Map<string, Realm>
  tensions: Tension[]
  plans: Map<string, Plan>
  /** The great lines (M10.22). */
  tides: Map<string, Tide>
  /** The aftermath (M8.1): watchers, the standard aftermath per signal, and the news of each verb. All optional. */
  watchers: Map<string, Watcher>
  aftermath: Map<string, Aftermath>
  /** What a brain may choose to do about a signal (M8.2). */
  intentions: Map<string, Intention>
  verbTexts: Map<string, VerbText>
  /** The economy (M8.4). */
  settlements: Map<string, Settlement>
  resources: Map<string, Resource>
  routes: Map<string, Route>
  outlands: Map<string, Outland>
  /** Growth (M8.5). */
  newcomers: Map<string, Newcomer>
  projects: Map<string, Project>
  /** Crafts (M10.5). */
  crafts: Map<string, Craft>
  /** Templates of objects the chronicler may place (M10.5). */
  props: Map<string, PropTemplate>
  /** Every id this world ever committed, and what became of those that went (M9.1, ids.lock). */
  lock?: IdsLock
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
    tides: new Map<string, Tide>(),
    watchers: new Map<string, Watcher>(),
    aftermath: new Map<string, Aftermath>(),
    intentions: new Map<string, Intention>(),
    verbTexts: new Map<string, VerbText>(),
    settlements: new Map<string, Settlement>(),
    resources: new Map<string, Resource>(),
    routes: new Map<string, Route>(),
    outlands: new Map<string, Outland>(),
    newcomers: new Map<string, Newcomer>(),
    projects: new Map<string, Project>(),
    crafts: new Map<string, Craft>(),
    props: new Map<string, PropTemplate>(),
    passages: new Map<string, Passage>(),
    gestures: new Map<string, Gesture>(),
    lodgings: new Map<string, Lodging>(),
    lands: new Map<string, Land>(),
  }
  /** The voice kits of the lands (M10.23), by the folder they are in. */
  const landVoices = new Map<string, Voice>()

  let chronicler: string | undefined
  let rules: Rules | undefined
  let voice: Voice | undefined
  let journey: Journey | undefined
  let returning: Returning | undefined
  let lock: IdsLock | undefined
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    // The shared working instruction first (it sorts first), then the world's own part.
    if (/(^|\/)CHRONICLER\.md$/.test(file.path)) {
      chronicler = chronicler ? `${chronicler.trimEnd()}\n\n${file.text}` : file.text
      continue
    }
    // Other Markdown beside the content (the design log, the world book: M10.18) is for people and the editor, not content.
    if (/\.md$/.test(file.path)) continue
    // The register of committed ids (M9.1).
    if (/(^|\/)ids\.lock$/.test(file.path)) {
      const parsed = IdsLockSchema.safeParse(safeParse(file.text))
      if (parsed.success) lock = parsed.data
      else problems.push(`${file.path}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`)
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
    // A land's own folder (M10.23): what is in it is of that land, unless it says otherwise.
    const inLand = file.path.match(/(?:^|\/)lands\/([a-z0-9_]+)\//)?.[1]
    if (inLand) {
      for (const key of ['world', 'rules', 'journey', 'returning'] as const) if (data[key]) problems.push(`${file.path}: a land has no ${key} of its own; it is the world's`)
      for (const a of data.areas ?? []) a.land ??= inLand
      for (const r of data.regions ?? []) r.land ??= inLand
      for (const t of data.topics ?? []) if (t.kind === 'place') t.land ??= inLand
    }
    if (data.land) {
      if (data.land.id !== inLand) problems.push(`${file.path}: the land ${data.land.id} belongs in lands/${data.land.id}/land.yaml`)
      else if (content.lands.has(data.land.id)) problems.push(`${file.path}: duplicate land id ${data.land.id}`)
      else content.lands.set(data.land.id, data.land)
    }
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
    addAll(content.tides, data.tides, (v) => v.id, file.path, 'tide', problems)
    addAll(content.watchers, data.watchers, (v) => v.id, file.path, 'watcher', problems)
    addAll(content.aftermath, data.aftermath, (v) => v.id, file.path, 'aftermath', problems)
    addAll(content.intentions, data.intentions, (v) => v.id, file.path, 'intention', problems)
    addAll(content.verbTexts, data.verbs, (v) => v.id, file.path, 'verb', problems)
    addAll(content.settlements, data.settlements, (v) => v.id, file.path, 'settlement', problems)
    addAll(content.resources, data.resources, (v) => v.id, file.path, 'resource', problems)
    addAll(content.routes, data.routes, (v) => v.id, file.path, 'route', problems)
    addAll(content.outlands, data.outlands, (v) => v.id, file.path, 'outland', problems)
    addAll(content.newcomers, data.newcomers, (v) => v.id, file.path, 'newcomer', problems)
    addAll(content.projects, data.projects, (v) => v.id, file.path, 'project', problems)
    addAll(content.crafts, data.crafts, (v) => v.id, file.path, 'craft', problems)
    addAll(content.props, data.props, (v) => v.id, file.path, 'prop', problems)
    addAll(content.passages, data.passages, (v) => v.id, file.path, 'passage', problems)
    addAll(content.gestures, data.gestures, (v) => v.id, file.path, 'gesture', problems)
    addAll(content.lodgings, data.lodgings, (v) => v.id, file.path, 'lodging', problems)
    if (data.returning) {
      if (returning) problems.push(`${file.path}: the words for returning are defined twice`)
      returning = data.returning
    }
    if (data.rules) {
      if (rules) problems.push(`${file.path}: the rules are defined twice`)
      rules = data.rules
    }
    if (data.voice && inLand) {
      if (landVoices.has(inLand)) problems.push(`${file.path}: the voice kit of ${inLand} is defined twice`)
      landVoices.set(inLand, data.voice)
    } else if (data.voice) {
      if (voice) problems.push(`${file.path}: the voice kit is defined twice`)
      voice = data.voice
    }
    if (data.journey) {
      if (journey) problems.push(`${file.path}: the journey sentences are defined twice`)
      journey = data.journey
    }
  }

  // Each land's voice kit to its land (M10.23).
  for (const [id, kit] of landVoices) {
    const land = content.lands.get(id)
    if (!land) problems.push(`lands/${id}: a voice kit without a land.yaml`)
    else land.voice = kit
  }
  const world = worlds[0]
  if (worlds.length !== 1) problems.push(`expected exactly one world, found ${worlds.length}`)
  problems.push(...checkReferences(world, { ...content, ...(rules ? { rules } : {}), ...(lock ? { lock } : {}) }))
  problems.push(...checkQuests({ ...content, ...(rules ? { rules } : {}) }))
  if (rules) problems.push(...checkRules(rules, content))
  // What a trade teaches is a skill of the rules (M10.3).
  // Skills only where the world has them (M10.20): the rules of a world without characters may hold only patrons and death.
  if (rules?.skills.length) for (const p of content.professions.values()) if (p.teaches && !rules.skills.some((s) => s.id === p.teaches)) problems.push(`profession ${p.id}: teaches ${p.teaches}, which is no skill`)
  problems.push(...checkCrafts(content, rules))
  if (world) problems.push(...checkVoice(voice, world, content, content.lands.values()))
  // Gestures are of people of the world, and a lodging is a place with a keeper (M10.13).
  for (const g of content.gestures.values()) if (!content.npcs.has(g.who)) problems.push(`gesture ${g.id}: unknown NPC ${g.who}`)
  for (const l of content.lodgings.values()) {
    if (!content.locations.has(l.at)) problems.push(`lodging ${l.id}: unknown location ${l.at}`)
    if (!content.npcs.has(l.keeper)) problems.push(`lodging ${l.id}: unknown keeper ${l.keeper}`)
  }
  // Every day in the content is a day of the world's own week (M10.17): opening days, schedules, market days.
  const weekdays = new Set<string>(world?.calendar?.weekdays ?? DEFAULT_CALENDAR.weekdays)
  const day = (d: string, where: string) => {
    if (!weekdays.has(d)) problems.push(`${where}: ${d} is no weekday of this world`)
  }
  for (const l of content.locations.values()) {
    for (const o of l.objects) for (const d of o.days ?? []) day(d, `${l.id}.objects.${o.id}`)
    for (const sv of l.services) {
      for (const d of sv.days ?? []) day(d, `${l.id}.services.${sv.id}`)
      for (const r of sv.demand) for (const d of r.days ?? []) day(d, `${l.id}.services.${sv.id}.demand`)
    }
  }
  for (const p of content.professions.values()) {
    for (const b of p.schedule) for (const d of b.days ?? []) day(d, `profession ${p.id}.schedule`)
    for (const g of p.daily_goals ?? []) for (const d of g.days ?? []) day(d, `profession ${p.id}.daily_goals`)
  }
  for (const a of content.areas.values()) for (const d of a.market_days) day(d, `area ${a.id}.market_days`)
  // A passage stops at places of the world or far places it knows, on days of its calendar (M10.12).
  for (const p of content.passages.values()) {
    for (const stop of p.stops) if (!content.locations.has(stop) && !content.topics.has(stop)) problems.push(`passage ${p.id}: stop ${stop} is no place or topic`)
    for (const day of p.days) if (!weekdays.has(day)) problems.push(`passage ${p.id}: ${day} is no weekday of this world`)
    for (const key of Object.keys(p.legs)) if (!key.split('>').every((s) => p.stops.includes(s))) problems.push(`passage ${p.id}: leg ${key} is not between two of its stops`)
  }
  // A way on another level runs on a level the world names (M10).
  const levels = new Set((world?.map?.levels ?? [{ id: 'surface' }]).map((l) => l.id))
  for (const region of content.regions.values()) {
    for (const path of region.paths) {
      if (path.level && !levels.has(path.level)) problems.push(`region ${region.id}: ${path.name} runs on the level ${path.level}, which world.yaml does not name`)
      if (path.topic && !content.topics.has(path.topic)) problems.push(`region ${region.id}: ${path.name} is known by ${path.topic}, which is no topic`)
    }
  }
  if (problems.length > 0 || !world) throw new ContentError(problems)
  return { world, ...content, ...(rules ? { rules } : {}), ...(voice ? { voice } : {}), ...(journey ? { journey } : {}), ...(returning ? { returning } : {}), ...(chronicler ? { chronicler } : {}), ...(lock ? { lock } : {}) }
}

/** The voice kit fits the world (M10.10): its faiths, areas, trades and groups are there; an NPC's own voice is a group. */
function checkVoice(voice: Voice | undefined, world: WorldDef, c: Pick<Content, 'areas' | 'professions' | 'npcs'>, lands: Iterable<Land> = []): string[] {
  const problems: string[] = []
  // A person of a land may speak as a group of their land's kit (M10.23).
  const groups = new Set([voice, ...[...lands].map((l) => l.voice)].flatMap((k) => k?.groups ?? []).map((g) => g.id))
  for (const n of c.npcs.values()) if (n.voice && !groups.has(n.voice)) problems.push(`${n.id}: voice ${n.voice} is no group of the voice kit`)
  if (!voice) return problems
  const faiths = new Set(world.faiths.map((f) => f.id))
  for (const faith of Object.keys(voice.oaths)) if (!faiths.has(faith)) problems.push(`voice.oaths: unknown faith ${faith}`)
  for (const g of voice.groups) {
    for (const a of g.areas) if (!c.areas.has(a)) problems.push(`voice.groups.${g.id}: unknown area ${a}`)
    for (const p of g.professions) if (!c.professions.has(p)) problems.push(`voice.groups.${g.id}: unknown profession ${p}`)
  }
  if (voice.default_group && !groups.has(voice.default_group)) problems.push(`voice.default_group: ${voice.default_group} is no group`)
  return problems
}

/**
 * The lands fit the world (M10.23): every land named is there, a land is not
 * the home land by another name, its realm and law are known, and its voice
 * kit fits its faiths. A land may hold a faith of the world by its id: one id
 * is one faith, wherever it is held.
 */
function checkLands(world: WorldDef, c: Omit<Content, 'world'>): string[] {
  const problems: string[] = []
  const land = (id: string | undefined, where: string) => {
    if (id && !c.lands.has(id)) problems.push(`${where}: unknown land ${id}`)
  }
  for (const a of c.areas.values()) {
    land(a.land, `area ${a.id}.land`)
    land(a.blend, `area ${a.id}.blend`)
    if (a.blend && a.blend === a.land) problems.push(`area ${a.id}: it blends with ${a.blend}, the land it is in`)
  }
  for (const r of c.regions.values()) land(r.land, `region ${r.id}.land`)
  for (const t of c.topics.values()) land(t.land, `topic ${t.id}.land`)
  for (const l of c.lands.values()) {
    if (l.id === world.id) problems.push(`land ${l.id}: the world's own id; the home land needs no folder`)
    if (l.realm && !c.realms.has(l.realm)) problems.push(`land ${l.id}: unknown realm ${l.realm}`)
    if (l.law?.npc && !c.npcs.has(l.law.npc)) problems.push(`land ${l.id}.law: unknown NPC ${l.law.npc}`)
    if (l.law?.office && !c.locations.has(l.law.office)) problems.push(`land ${l.id}.law: unknown location ${l.law.office}`)
    if (l.voice) problems.push(...checkVoice(l.voice, { ...world, faiths: [...world.faiths, ...(l.faiths ?? [])] }, { ...c, npcs: new Map() }).map((p) => `land ${l.id}: ${p}`))
  }
  return problems
}

/**
 * The checks loading runs, on a content as a game has it (M9.1): what a game
 * makes (a far place made playable) must pass them as if it had been written.
 */
export function checkContent(c: Content): string[] {
  return [...checkReferences(c.world, c), ...checkQuests(c), ...(c.rules ? checkRules(c.rules, c) : [])]
}

function safeParse(text: string): unknown {
  try {
    return parse(text)
  } catch {
    return undefined
  }
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
    // Whom you were told to ask for, and what you heard (M10.9).
    if (b.contact && !c.npcs.has(b.contact)) problems.push(`rules background ${b.id}: the contact ${b.contact} is no NPC`)
    if (b.heard && !c.topics.has(b.heard) && !c.npcs.has(b.heard) && !c.locations.has(b.heard)) problems.push(`rules background ${b.id}: heard ${b.heard}, which is no topic, person or place`)
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
    for (const t of world.towns) {
      if (!c.areas.has(t.area)) problems.push(`world.towns.${t.id}: unknown area ${t.area}`)
      for (const o of t.offices) location(o, `world.towns.${t.id}.offices`)
    }
    for (const id of world.plans) if (!c.plans.has(id)) problems.push(`world.plans: unknown plan ${id}`)
    // The faiths of the world and of its lands (M10.23): one id is one faith.
    const faiths = new Set([...world.faiths, ...[...c.lands.values()].flatMap((l) => l.faiths ?? [])].map((f) => f.id))
    for (const n of c.npcs.values()) if (n.faith && !faiths.has(n.faith)) problems.push(`${n.id}: unknown faith ${n.faith}`)
    for (const o of c.outlands.values()) if (o.faith && !faiths.has(o.faith)) problems.push(`outland ${o.id}: unknown faith ${o.faith}`)
    problems.push(...checkLands(world, c))
  }
  problems.push(...checkEconomy(c))
  problems.push(...checkGrowth(c))
  if (c.lock) problems.push(...checkLock(c, c.lock))
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
    // A patron of this world's rules (M10.17: the schema no longer lists the Nethermarch's five).
    if (n.patron && c.rules && !c.rules.patrons.some((p) => p.id === n.patron)) problems.push(`${n.id}: unknown patron ${n.patron}`)
    location(n.home, `${n.id}.home`)
    location(n.work, `${n.id}.work`)
    for (const id of Object.keys(n.inventory)) item(id, `${n.id}.inventory`)
    for (const a of n.knows_areas) if (!c.areas.has(a)) problems.push(`${n.id}: unknown area ${a} in knows_areas`)
    for (const r of n.relations) {
      if (r.to && !c.npcs.has(r.to) && !c.topics.has(r.to)) problems.push(`${n.id}: relation to unknown person ${r.to}`)
      if (r.to === n.id) problems.push(`${n.id}: relation to itself`)
    }
  }
  // What a secret is about, and what it teaches (M10.20, found building The Quiet Reach): a topic, or a person, a place
  // or an area (area_<id>), which the game knows as topics too.
  const subject = (id: string) => c.topics.has(id) || c.npcs.has(id) || c.locations.has(id) || (id.startsWith('area_') && c.areas.has(id.slice(5)))
  for (const n of c.npcs.values()) {
    for (const secret of n.secrets) {
      if (secret.teaches && !subject(secret.teaches)) problems.push(`${n.id}.secrets.${secret.id}: teaches ${secret.teaches}, which is no topic, person, place or area_<id>`)
      for (const t of secret.about) if (!subject(t)) problems.push(`${n.id}.secrets.${secret.id}: about ${t}, which is no topic, person, place or area_<id>`)
    }
  }
  for (const a of c.areas.values()) if (a.topic && !c.topics.has(a.topic)) problems.push(`area ${a.id}: unknown topic ${a.topic}`)
  // The world's knobs (M10.20): known, of the right shape and within bounds.
  problems.push(...knobProblems(world?.knobs))
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
    for (const b of r.beyond) for (const t of b.toward) if (!c.topics.has(t)) problems.push(`region ${r.id}.beyond.${b.side}: toward ${t}, which is no topic`)
    const sides = r.beyond.map((b) => b.side)
    for (const side of new Set(sides)) if (sides.filter((s) => s === side).length > 1) problems.push(`region ${r.id}.beyond: the ${side} edge is named twice`)
    for (const path of r.paths) for (const point of path.via) if (typeof point === 'string') area(point, `paths.${path.name}`)
    const rows = r.zones.split('\n').filter((line) => line.length > 0)
    if (rows.length === 0) problems.push(`region ${r.id}: the zone drawing is empty`)
    // A character stands for an engine land, a way, or a terrain of the region's own (M10.20).
    for (const [ch, what] of Object.entries(r.legend)) if (!REGION_KINDS.includes(what) && !r.lands[what]) problems.push(`region ${r.id}: the legend's ${JSON.stringify(ch)} is ${what}, which is no land (${REGION_KINDS.join(', ')}) and not under lands`)
    const palette = world?.map?.palette ?? DEFAULT_PALETTE
    for (const own of Object.keys(r.lands)) if (!palette.dark.terrain[own] || !palette.paper.terrain[own]) problems.push(`region ${r.id}: the land ${own} has no tints in the palette (map.palette.dark.terrain.${own} and paper.terrain.${own})`)
  }
  for (const q of c.quests.values()) {
    for (const who of [...q.givers, ...q.helpers, ...q.opponents]) npc(who, `quest ${q.id}`)
  }
  for (const f of c.factions.values()) {
    if (f.law && f.law !== 'count' && !world?.towns.some((t) => t.id === f.law)) problems.push(`faction ${f.id}: unknown law ${f.law}`)
    for (const m of f.members) npc(m, `faction ${f.id}.members`)
    for (const s of f.seats) if (!c.locations.has(s.at) && !c.areas.has(s.at)) problems.push(`faction ${f.id}.seats: ${s.at} is no place or area`)
    for (const other of [...f.allies, ...f.rivals]) if (!c.factions.has(other)) problems.push(`faction ${f.id}: unknown faction ${other}`)
  }
  for (const t of c.tensions) for (const r of t.between) if (!c.realms.has(r)) problems.push(`tension: unknown realm ${r}`)
  // The great lines (M10.22): where they strike, what plays them, and what pushes them must exist.
  for (const tide of c.tides.values()) {
    for (const a of tide.areas) if (!c.areas.has(a)) problems.push(`tide ${tide.id}: unknown area ${a}`)
    if (!c.plans.has(tide.plan)) problems.push(`tide ${tide.id}: unknown plan ${tide.plan}`)
    if (tide.threshold <= tide.threat) problems.push(`tide ${tide.id}: the threshold (${tide.threshold}) must be above the threat (${tide.threat})`)
    const seasons = world?.weather?.seasons
    for (const d of tide.drivers) {
      if ('tension' in d) for (const r of d.tension) if (!c.realms.has(r)) problems.push(`tide ${tide.id}: unknown realm ${r}`)
      if ('short' in d && !c.settlements.has(d.short.settlement)) problems.push(`tide ${tide.id}: unknown settlement ${d.short.settlement}`)
      if ('short' in d && d.short.item && !c.items.has(d.short.item)) problems.push(`tide ${tide.id}: unknown item ${d.short.item}`)
      if ('season' in d && seasons && !seasons.includes(d.season)) problems.push(`tide ${tide.id}: ${d.season} is no season of this world (${[...new Set(seasons)].join(', ')})`)
    }
  }
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
  const steps = (where: string, list: Plan['steps'], groups: string[], maker: 'content' | 'rules' | 'brain' = 'content') => {
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
      if (!permitted(s.do, maker)) problems.push(`${where}.${s.id}: ${verbName(s.do)} is not a verb ${maker === 'brain' ? 'an intention' : 'the standard aftermath'} may use`)
    }
  }
  for (const p of c.plans.values()) steps(`plan ${p.id}`, p.steps, Object.keys(p.groups))
  for (const a of c.aftermath.values()) {
    steps(`aftermath ${a.id}`, a.steps, Object.keys(a.groups), 'rules')
    if (!CODE_SIGNALS.includes(a.signal) && ![...c.watchers.values()].some((w) => w.signal === a.signal)) problems.push(`aftermath ${a.id}: no watcher gives the signal ${a.signal}`)
  }
  for (const i of c.intentions.values()) {
    steps(`intention ${i.id}`, i.steps, Object.keys(i.groups), 'brain')
    if (!CODE_SIGNALS.includes(i.signal) && ![...c.watchers.values()].some((w) => w.signal === i.signal)) problems.push(`intention ${i.id}: no watcher gives the signal ${i.signal}`)
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
const CODE_SIGNALS = ['house_lost', 'plan_failed', 'doubt', 'stranger_unwelcome', 'recognised', 'plans_cross', 'warning_proven', 'broken_promise', 'promise_kept', 'request_open', 'theft_mended', 'craft_rank', 'made_good', 'pupil_learnt', 'improvised']

/** Every string in a step's verb that looks like an id. */
function idsIn(value: unknown): string[] {
  if (typeof value === 'string') return /^(npc|loc)_[a-z0-9_]+$/.test(value) ? [value] : []
  if (Array.isArray(value)) return value.flatMap(idsIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(idsIn)
  return []
}

/** The economy refers to areas, places, people, goods, objects and ground: all of them must exist (M8.4). */
function checkEconomy(c: Omit<Content, 'world'>): string[] {
  const problems: string[] = []
  const item = (id: string, where: string) => {
    if (!c.items.has(id)) problems.push(`${where}: unknown item ${id}`)
  }
  for (const r of c.resources.values()) for (const g of r.gives) item(g, `resource ${r.id}`)
  for (const s of c.settlements.values()) {
    const where = `settlement ${s.id}`
    if (!c.areas.has(s.id)) problems.push(`${where}: no area with that id`)
    for (const g of [...Object.keys(s.use), ...Object.keys(s.keep)]) item(g, where)
    for (const r of s.resources) if (!c.resources.has(r)) problems.push(`${where}: unknown resource ${r}`)
    const seen = new Set<string>()
    for (const w of s.workshops) {
      const at = `${where}, workshop ${w.id}`
      if (seen.has(w.id)) problems.push(`${at}: twice in the settlement`)
      seen.add(w.id)
      if (!c.locations.has(w.at)) problems.push(`${at}: unknown location ${w.at}`)
      else if (c.locations.get(w.at)!.area !== s.id) problems.push(`${at}: ${w.at} is not in ${s.id}`)
      for (const g of [...Object.keys(w.makes), ...Object.keys(w.uses)]) item(g, at)
      for (const n of w.named) if (!c.npcs.has(n)) problems.push(`${at}: unknown NPC ${n}`)
      if (w.from && !s.resources.includes(w.from)) problems.push(`${at}: works ${w.from}, which the settlement does not have`)
      if (w.from && c.resources.has(w.from)) for (const g of Object.keys(w.makes)) if (!c.resources.get(w.from)!.gives.includes(g)) problems.push(`${at}: ${w.from} does not give ${g}`)
      if (w.requires) {
        const [loc, obj] = w.requires.object.split('/')
        if (!loc || !obj || !c.locations.get(loc)?.objects.some((o) => o.id === obj)) problems.push(`${at}: unknown object ${w.requires.object}`)
      }
    }
  }
  for (const o of c.outlands.values()) {
    for (const g of [...o.sends, ...o.asks]) item(g, `outland ${o.id}`)
    if (o.topic && !c.topics.has(o.topic)) problems.push(`outland ${o.id}: unknown topic ${o.topic}`)
    if (o.realm && !c.realms.has(o.realm)) problems.push(`outland ${o.id}: unknown realm ${o.realm}`)
  }
  for (const r of c.routes.values()) {
    const where = `route ${r.id}`
    const outland = c.outlands.get(r.from)
    if (!c.settlements.has(r.from) && !outland) problems.push(`${where}: from ${r.from}, which is no settlement or region beyond the map`)
    if (!c.settlements.has(r.to)) problems.push(`${where}: to ${r.to}, which is no settlement`)
    for (const g of [...Object.keys(r.carries), ...Object.keys(r.returns)]) item(g, where)
    if (outland) {
      for (const g of Object.keys(r.carries)) if (!outland.sends.includes(g)) problems.push(`${where}: ${outland.name} does not send ${g}`)
      for (const g of Object.keys(r.returns)) if (!outland.asks.includes(g)) problems.push(`${where}: ${outland.name} does not ask for ${g}`)
    }
    if (r.via) for (const l of r.via) if (!c.locations.has(l)) problems.push(`${where}: unknown location ${l}`)
    if (r.toll && !c.locations.has(r.toll.at)) problems.push(`${where}: unknown toll gate ${r.toll.at}`)
  }
  return problems
}

/** Growth refers to trades, professions, places and goods; a project's new place is a location like any (M8.5). */
function checkGrowth(c: Omit<Content, 'world'>): string[] {
  const problems: string[] = []
  const workshops = new Set([...c.settlements.values()].flatMap((s) => s.workshops.map((w) => w.id)))
  for (const n of c.newcomers.values()) {
    const where = `newcomer ${n.id}`
    if (!workshops.has(n.trade)) problems.push(`${where}: no workshop ${n.trade} in any settlement`)
    if (!c.outlands.has(n.from) && !c.areas.has(n.from)) problems.push(`${where}: from ${n.from}, which is no region beyond the map or area`)
    for (const m of n.people) if (!c.professions.has(m.profession)) problems.push(`${where}: unknown profession ${m.profession}`)
    if (n.people.filter((m) => m.role === 'head').length !== 1) problems.push(`${where}: needs exactly one head`)
  }
  for (const p of c.projects.values()) {
    const where = `project ${p.id}`
    const s = c.settlements.get(p.settlement)
    if (!s) problems.push(`${where}: no settlement ${p.settlement}`)
    if (p.after && !c.projects.has(p.after)) problems.push(`${where}: after unknown project ${p.after}`)
    if (p.crowd && !c.locations.has(p.crowd.at)) problems.push(`${where}: its workers are at unknown ${p.crowd.at}`)
    if (p.crowd && !c.professions.has(p.crowd.profession)) problems.push(`${where}: its workers have unknown profession ${p.crowd.profession}`)
    for (const g of Object.keys(p.needs)) if (!c.items.has(g)) problems.push(`${where}: unknown item ${g}`)
    let place: string | undefined
    if (p.place) {
      const parsed = LocationSchema.safeParse(p.place)
      if (!parsed.success) problems.push(`${where}: the place is no valid location (${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')})`)
      else {
        place = parsed.data.id
        if (c.locations.has(place)) problems.push(`${where}: the place ${place} is there already`)
        if (parsed.data.area !== p.settlement) problems.push(`${where}: the place is not in ${p.settlement}`)
        for (const exit of Object.values(parsed.data.exits)) if (exit && !c.locations.has(exit.to)) problems.push(`${where}: the place leads to unknown ${exit.to}`)
      }
    }
    if (p.link) {
      const from = c.locations.get(p.link.from)
      if (!place) problems.push(`${where}: a link without a place`)
      if (!from) problems.push(`${where}: link from unknown ${p.link.from}`)
      else if (!(DIRECTIONS as readonly string[]).includes(p.link.direction)) problems.push(`${where}: no direction ${p.link.direction}`)
      else if (from.exits[p.link.direction as Direction]) problems.push(`${where}: ${p.link.from} already has a way ${p.link.direction}`)
    }
    for (const w of p.workshops) {
      if (w.at !== place && c.locations.get(w.at)?.area !== p.settlement) problems.push(`${where}: the workshop ${w.id} is not at the new place or in ${p.settlement}`)
      for (const g of [...Object.keys(w.makes), ...Object.keys(w.uses)]) if (!c.items.has(g)) problems.push(`${where}: unknown item ${g}`)
      if (w.from && s && !s.resources.includes(w.from)) problems.push(`${where}: works ${w.from}, which ${p.settlement} does not have`)
      if (w.from && c.resources.has(w.from)) for (const g of Object.keys(w.makes)) if (!c.resources.get(w.from)!.gives.includes(g)) problems.push(`${where}: ${w.from} does not give ${g}`)
    }
  }
  return problems
}

// ---------------------------------------------------------------- ids (M9.1)

/** A thing that went: gone, or gone up in another thing of its kind. */
export const TombstoneSchema = z.object({ kind: z.string(), id: z.string(), into: z.string().optional(), t: z.string().optional() }).strict()
export type Tombstone = z.infer<typeof TombstoneSchema>

/** The register of a world: every id it ever committed, by file and kind, and the tombstones of those that went. */
/**
 * Crafts and their recipes (M10.5): a craft leans on a skill of the rules and
 * is had by trades that exist; a recipe names a craft that exists and one of
 * its techniques; a check without a skill is a recipe's.
 */
function checkCrafts(c: Pick<Content, 'crafts' | 'professions' | 'objectTypes' | 'resources' | 'items' | 'locations' | 'topics' | 'props'>, rules: Rules | undefined): string[] {
  const problems: string[] = []
  for (const p of c.props.values()) {
    if (!c.objectTypes.has(p.type)) problems.push(`prop ${p.id}: ${p.type} is no object type`)
    for (const i of p.items) if (!c.items.has(i)) problems.push(`prop ${p.id}: ${i} is no item`)
  }
  // What a failed recipe leaves (M10.14): the poorer thing must exist.
  const failureRefs = (f: CraftFailure | undefined, where: string) => {
    if (!f) return
    // Which field says poor, and what to add (M10.20: the trial run's fix round did not see that `critical: poor` was meant).
    if ((f.outcome === 'poor' || f.critical === 'poor') && !f.item) problems.push(`${where}: failure.${f.outcome === 'poor' ? 'outcome' : 'critical'} is poor, so failure.item must name the poorer item it makes (or choose another outcome)`)
    if (f.item && !c.items.has(f.item)) problems.push(`${where}: a failure makes ${f.item}, which is no item`)
  }
  for (const item of c.items.values()) if (item.of && !c.items.has(item.of)) problems.push(`item ${item.id}: a poorer make of ${item.of}, which is no item`)
  for (const craft of c.crafts.values()) {
    if (rules?.skills.length && !rules.skills.some((s) => s.id === craft.skill)) problems.push(`craft ${craft.id}: leans on ${craft.skill}, which is no skill`)
    for (const p of craft.professions) if (!c.professions.has(p)) problems.push(`craft ${craft.id}: the trade ${p} does not exist`)
    const [a, b, m] = craft.practice
    if (!(a < b && b < m)) problems.push(`craft ${craft.id}: practice must rise from journeyman to master`)
    failureRefs(craft.failure, `craft ${craft.id}`)
  }
  for (const type of c.objectTypes.values()) {
    for (const a of type.affordances) {
      const craft = a.craft ? c.crafts.get(a.craft) : undefined
      if (a.craft && !craft) problems.push(`object type ${type.id}: ${a.id} is a recipe of ${a.craft}, which is no craft`)
      if (craft && a.technique && !craft.techniques.some((t) => t.id === a.technique)) problems.push(`object type ${type.id}: ${a.id} uses the technique ${a.technique}, which ${craft.id} does not have`)
      if (a.check && !a.check.skill && !a.craft) problems.push(`object type ${type.id}: ${a.id} has a check without a skill, and is no recipe of a craft`)
      if (a.check?.skill && rules?.skills.length && !rules.skills.some((s) => s.id === a.check!.skill)) problems.push(`object type ${type.id}: ${a.id} checks ${a.check.skill}, which is no skill`)
      if ((a.rank || a.masterwork || a.technique) && !a.craft) problems.push(`object type ${type.id}: ${a.id} has a rank, technique or masterwork but no craft`)
      failureRefs(a.failure, `object type ${type.id}: ${a.id}`)
      const failure = a.failure ?? craft?.failure
      if ((failure?.outcome === 'damaged' || failure?.critical === 'damaged') && !type.repair) problems.push(`object type ${type.id}: a failed ${a.id} damages it, but it has no repair`)
    }
    if (type.inscription?.topic && !c.topics.has(type.inscription.topic)) problems.push(`object type ${type.id}: its inscription teaches ${type.inscription.topic}, which is no topic`)
  }
  for (const r of c.resources.values()) {
    if (r.gather && !c.items.has(r.gather.item)) problems.push(`ground ${r.id}: gathers ${r.gather.item}, which is no item`)
  }
  for (const l of c.locations.values()) {
    for (const f of l.forage) {
      const r = c.resources.get(f)
      if (!r) problems.push(`location ${l.id}: forage ${f} is no ground`)
      else if (!r.gather) problems.push(`location ${l.id}: the ground ${f} cannot be gathered by hand`)
    }
    for (const h of l.hidden) {
      if (h.item && !c.items.has(h.item)) problems.push(`location ${l.id}: hidden ${h.id} is ${h.item}, which is no item`)
      if (h.topic && !c.topics.has(h.topic)) problems.push(`location ${l.id}: hidden ${h.id} teaches ${h.topic}, which is no topic`)
    }
  }
  return problems
}

export const IdsLockSchema = z
  .object({
    ids: z.record(z.string(), z.record(z.string(), z.array(z.string()))).default({}),
    tombstones: z.array(TombstoneSchema).default([]),
  })
  .strict()
export type IdsLock = z.infer<typeof IdsLockSchema>

/** The kinds of things with an id of their own, and where the content keeps them (the editor's lists). */
export const KIND_MAPS = {
  location: 'locations',
  area: 'areas',
  npc: 'npcs',
  topic: 'topics',
  quest: 'quests',
  item: 'items',
  object_type: 'objectTypes',
  profession: 'professions',
  news: 'news',
  pattern: 'patterns',
  faction: 'factions',
  realm: 'realms',
  plan: 'plans',
  tide: 'tides',
  watcher: 'watchers',
  aftermath: 'aftermath',
  intention: 'intentions',
  verb: 'verbTexts',
  creature: 'creatures',
  encounter: 'encounters',
  region: 'regions',
  settlement: 'settlements',
  route: 'routes',
  outland: 'outlands',
  resource: 'resources',
  newcomer: 'newcomers',
  project: 'projects',
  craft: 'crafts',
  prop: 'props',
  passage: 'passages',
  gesture: 'gestures',
  lodging: 'lodgings',
  // A list in the rules (M10.9): a save's character names its background.
  background: 'rules',
  // M10.20: more lists in the rules that a proposal may write.
  patron: 'rules',
  condition: 'rules',
  ancestry: 'rules',
} as const satisfies Record<string, keyof Content>

/** Whether the content has a thing of this kind. */
export function hasThing(c: Omit<Content, 'world'>, kind: string, id: string): boolean {
  if (kind === 'background') return Boolean(c.rules?.backgrounds.some((b) => b.id === id))
  if (kind === 'patron') return Boolean(c.rules?.patrons.some((p) => p.id === id))
  if (kind === 'condition') return Boolean(c.rules?.conditions.some((p) => p.id === id))
  if (kind === 'ancestry') return Boolean(c.rules?.ancestries.some((p) => p.id === id))
  const key = (KIND_MAPS as Record<string, keyof Content>)[kind]
  const map = key ? (c as unknown as Record<string, unknown>)[key] : undefined
  return map instanceof Map && map.has(id)
}

/**
 * An id is a key and never changes (M9.1): every id in the register must
 * still be there, or have a tombstone; a tombstone's heir must exist; and an
 * id that went does not come back as something else.
 */
function checkLock(c: Omit<Content, 'world'>, lock: IdsLock): string[] {
  const problems: string[] = []
  const buried = new Map(lock.tombstones.map((t) => [`${t.kind}:${t.id}`, t]))
  for (const [file, kinds] of Object.entries(lock.ids)) {
    for (const [kind, ids] of Object.entries(kinds)) {
      for (const id of ids) if (!hasThing(c, kind, id) && !buried.has(`${kind}:${id}`)) problems.push(`ids.lock: the ${kind.replace('_', ' ')} ${id} (in ${file}) is missing, and there is no tombstone for it`)
    }
  }
  for (const t of lock.tombstones) {
    if (!(t.kind in KIND_MAPS)) problems.push(`ids.lock: a tombstone of an unknown kind ${t.kind}`)
    else if (hasThing(c, t.kind, t.id)) problems.push(`ids.lock: the ${t.kind.replace('_', ' ')} ${t.id} has a tombstone; an id that went does not come back`)
    if (t.into && !hasThing(c, t.kind, t.into)) problems.push(`ids.lock: the ${t.kind.replace('_', ' ')} ${t.id} went into ${t.into}, which is not there`)
  }
  return problems
}

/** Every id the world ever had, the living and the buried: what a new thing may not be called. */
export function lockedIds(c: Pick<Content, 'lock'>): Set<string> {
  const out = new Set<string>()
  for (const kinds of Object.values(c.lock?.ids ?? {})) for (const ids of Object.values(kinds)) for (const id of ids) out.add(id)
  for (const t of c.lock?.tombstones ?? []) out.add(t.id)
  return out
}
