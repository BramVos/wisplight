import { z } from 'zod'

// The rules as content (FO, chapters 11 and 12): skills, ancestries,
// backgrounds, classes with their talent trees, patrons, conditions, the
// bestiary and encounters. The engine carries out a fixed vocabulary of
// effects; everything else is data that can change without code.

export const ATTRIBUTES = ['might', 'grace', 'wits', 'resolve'] as const
export type Attribute = (typeof ATTRIBUTES)[number]
export const SAVES = ['fortitude', 'reflex', 'will'] as const
export type Save = (typeof SAVES)[number]

const Id = z.string().regex(/^[a-z0-9_]+$/)
export const Dice = z.string().regex(/^\d+d\d+([+-]\d+)?$|^\d+$/)
const AttributeEnum = z.enum(ATTRIBUTES)
const SaveEnum = z.enum(SAVES)
export const RANGES = ['engaged', 'near', 'far'] as const
export type Range = (typeof RANGES)[number]

export const WHEN = ['melee', 'ranged', 'shield', 'quarry', 'vs_spirit', 'outdoors', 'fen', 'night', 'first_round', 'front', 'per_level'] as const

/** A lasting bonus: to attack, damage, defence, hit points, initiative, momentum, healing, a skill or a save. */
export const BonusSchema = z
  .object({
    to: z.string().regex(/^(attack|damage|defence|hp|initiative|momentum|heal|skill:[a-z_]+|save:(fortitude|reflex|will))$/),
    value: z.number().int(),
    when: z.enum(WHEN).optional(),
  })
  .strict()
export type Bonus = z.infer<typeof BonusSchema>

export const StepSchema = z.union([
  z.object({ strike: z.object({ bonus: z.number().int().default(0), damage: Dice.optional() }).strict() }).strict(),
  z.object({ damage: z.object({ dice: Dice, save: SaveEnum.optional() }).strict() }).strict(),
  z
    .object({
      condition: z
        .object({ name: Id, value: z.number().int().min(1).max(5).default(1), save: SaveEnum.optional(), rounds: z.number().int().min(1).optional(), dc: z.number().int().optional() })
        .strict(),
    })
    .strict(),
  z.object({ heal: z.object({ dice: Dice }).strict() }).strict(),
  z.object({ cure: z.object({ name: z.string() }).strict() }).strict(),
  z.object({ buff: z.object({ to: z.enum(['attack', 'defence', 'damage']), value: z.number().int(), rounds: z.number().int().min(1) }).strict() }).strict(),
  z.object({ mark: z.literal('quarry') }).strict(),
  z.object({ protect: z.literal(true) }).strict(),
  z.object({ move: z.enum(['forward', 'back']) }).strict(),
])
export type Step = z.infer<typeof StepSchema>

export const AbilitySchema = z
  .object({
    actions: z.number().int().min(1).max(3),
    uses: z.enum(['fight', 'day', 'at_will']).default('at_will'),
    target: z.enum(['enemy', 'ally', 'self', 'enemies', 'allies']),
    range: z.enum(RANGES).default('engaged'),
    do: z.array(StepSchema).min(1),
  })
  .strict()
export type Ability = z.infer<typeof AbilitySchema>

export const EffectSchema = z.union([z.object({ bonus: BonusSchema }).strict(), z.object({ ability: AbilitySchema }).strict()])
export type Effect = z.infer<typeof EffectSchema>

export const TalentSchema = z.object({ id: Id, name: z.string(), text: z.string(), effects: z.array(EffectSchema).default([]) }).strict()
export type Talent = z.infer<typeof TalentSchema>

const SkillSchema = z.object({ id: Id, name: z.string(), attribute: AttributeEnum }).strict()

const AncestrySchema = z
  .object({
    id: Id,
    name: z.string(),
    text: z.string(),
    /** choice: that many +1s the player places freely. */
    attributes: z.partialRecord(z.enum([...ATTRIBUTES, 'choice']), z.number().int()),
    hp: z.number().int().positive(),
    special: z.string(),
    /** A skill with +1 is cheaper to raise, one with -1 dearer (after DCSS). */
    aptitude: z.record(z.string(), z.number().int().min(-1).max(1)).default({}),
    immune: z.array(z.string()).default([]),
  })
  .strict()

const BackgroundSchema = z
  .object({
    id: Id,
    name: z.string(),
    skills: z.array(Id).length(2),
    talent: Id,
    /** People who know you from before, and topics already in your journal. */
    knows: z.array(z.string()).default([]),
    topics: z.array(z.string()).default([]),
  })
  .strict()

const TreeSchema = z.object({ id: Id, name: z.string(), talents: z.array(TalentSchema).length(4) }).strict()

const ClassSchema = z
  .object({
    id: Id,
    name: z.string(),
    text: z.string(),
    key: AttributeEnum,
    hp: z.number().int().positive(),
    trained: z.array(Id),
    armour: z.enum(['none', 'light', 'medium', 'heavy']),
    /** The levels at which attack, class DC and defence become trained, expert and master (+2, +4, +6). */
    proficiency: z
      .object({ attack: z.array(z.number().int().min(1).max(10)), class_dc: z.array(z.number().int().min(1).max(10)), defence: z.array(z.number().int().min(1).max(10)) })
      .strict()
      .default({ attack: [1], class_dc: [1], defence: [1] }),
    gear: z.record(z.string(), z.number().int().positive()).default({}),
    core: TalentSchema,
    trees: z.array(TreeSchema).length(3),
    /** Keeps its distance in a fight, whatever it holds (M9.1; was a list of Nethermarch classes in the code). */
    keeps_range: z.boolean().default(false),
  })
  .strict()

const BlessingSchema = z.object({ at: z.number().int().min(1).max(100), name: z.string(), text: z.string(), effects: z.array(EffectSchema).default([]) }).strict()

const PatronSchema = z
  .object({
    id: Id,
    name: z.string(),
    text: z.string(),
    /** Deeds the patron likes, with the favour they give. */
    values: z.record(z.string(), z.number().int()),
    /** Deeds the patron forbids, with the favour they cost. */
    forbids: z.record(z.string(), z.number().int()),
    blessings: z.array(BlessingSchema),
  })
  .strict()

const ConditionSchema = z.object({ id: Id, name: z.string(), text: z.string(), max: z.number().int().min(1).optional() }).strict()

export const RulesSchema = z
  .object({
    xp_per_level: z.number().int().positive().default(1000),
    skills: z.array(SkillSchema),
    ancestries: z.array(AncestrySchema),
    backgrounds: z.array(BackgroundSchema),
    general_talents: z.array(TalentSchema),
    conditions: z.array(ConditionSchema),
    classes: z.array(ClassSchema),
    patrons: z.array(PatronSchema),
    /** The ready-made traveller for a game started without making a character (M9.1: per world). */
    ready_made: z
      .object({ name: z.string(), ancestry: Id, background: Id, class: Id, boosts: z.array(AttributeEnum), skills: z.array(Id), talent: Id })
      .strict()
      .optional(),
    /** For a suggested character: the ancestry for each key attribute (M9.1: per world); without it, the one that gives the key most. */
    suggest: z.partialRecord(AttributeEnum, Id).optional(),
  })
  .strict()
export type Rules = z.infer<typeof RulesSchema>
export type ClassDef = z.infer<typeof ClassSchema>
export type Ancestry = z.infer<typeof AncestrySchema>
export type Background = z.infer<typeof BackgroundSchema>
export type Patron = z.infer<typeof PatronSchema>

// ---------------------------------------------------------------- the bestiary (WB, chapter 12)

const AttackSchema = z
  .object({
    name: z.string(),
    bonus: z.number().int(),
    damage: Dice,
    kind: z.enum(['melee', 'ranged']).default('melee'),
    /** What a critical hit does besides double damage. */
    crit: z.string().optional(),
    /** An effect on every hit, with a save against its DC. */
    effect: z.object({ condition: Id, value: z.number().int().default(1), save: SaveEnum, dc: z.number().int() }).strict().optional(),
  })
  .strict()

export const CreatureSchema = z
  .object({
    id: Id,
    name: z.string(),
    plural: z.string().optional(),
    kind: z.enum(['beast', 'human', 'spirit', 'undead', 'fey']),
    level: z.number().int().min(-1).max(20),
    hp: z.number().int().positive(),
    defence: z.number().int(),
    /** Saves; missing ones are level + 3. */
    saves: z.partialRecord(SaveEnum, z.number().int()).default({}),
    perception: z.number().int().optional(),
    attacks: z.array(AttackSchema).default([]),
    abilities: z.array(AbilitySchema.extend({ id: Id, name: z.string(), dc: z.number().int().optional() }).strict()).default([]),
    /** How it holds up: courage from -2 to 3, fleeing below a share of its hit points, giving up. */
    morale: z
      .object({
        courage: z.number().int().min(-2).max(3).default(0),
        flees_below: z.number().min(0).max(1).optional(),
        surrenders: z.boolean().default(false),
        never: z.boolean().default(false),
      })
      .strict()
      .default({ courage: 0, surrenders: false, never: false }),
    immune: z.array(z.string()).default([]),
    /** Things that hurt it more: iron, fire, light. */
    weak: z.record(z.string(), z.number()).default({}),
    /** What the stories say (Recall): a Lore DC, and the weakness it tells. */
    lore: z.object({ dc: z.number().int(), text: z.string(), topic: z.string().optional() }).strict().optional(),
    text: z.string(),
    /** Words for the fight: how it attacks, how it flees, how it gives up. */
    says: z.object({ hit: z.string().optional(), flee: z.string().optional(), surrender: z.string().optional(), down: z.string().optional() }).strict().default({}),
  })
  .strict()
export type Creature = z.infer<typeof CreatureSchema>

export const EncounterSchema = z
  .object({
    id: Id,
    name: z.string(),
    /** Where it can happen: locations, or area ids for the hexes of a region. */
    places: z.array(z.string()).min(1),
    /** The chance each time the player comes there, and how many days before it can happen again. */
    chance: z.number().min(0).max(1).default(0.25),
    again_after: z.number().int().min(0).default(3),
    hours: z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(24)]).optional(),
    foes: z
      .array(z.object({ creature: Id, count: z.number().int().min(1).default(1), range: z.enum(RANGES).default('near'), joins: z.number().int().min(1).optional() }).strict())
      .min(1),
    opening: z.string(),
    /** A demand before blows: pay and it ends. */
    demand: z.object({ amount: z.number().int().positive(), text: z.string(), paid: z.string() }).strict().optional(),
    /** What happens if the player gives up. */
    surrender: z.object({ take: z.enum(['half_money', 'all_money', 'nothing']), text: z.string() }).strict(),
    flee_dc: z.number().int().default(15),
    /** The fact the village hears afterwards; {outcome} is filled in. */
    news: z.object({ title: z.string(), belang: z.number().int().min(0).max(5).default(2) }).strict().optional(),
    /** Only while this flag is set (the fen without its keeper), or never while this one is (the trick unmasked). */
    when_flag: z.string().optional(),
    unless_flag: z.string().optional(),
    /** A flag set when the player wins (for quests). */
    win_flag: z.string().optional(),
    /** With a load on the way (M9.1): how likely then, and what share of the load they take from whoever gives in. */
    load: z.object({ chance: z.number().min(0).max(1), take: z.number().min(0).max(1) }).strict().optional(),
  })
  .strict()
export type Encounter = z.infer<typeof EncounterSchema>
