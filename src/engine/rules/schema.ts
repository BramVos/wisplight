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
    attributes: z.partialRecord(z.enum([...ATTRIBUTES, 'choice']), z.number().int()).describe('choice: that many +1s the player places freely.'),
    hp: z.number().int().positive(),
    special: z.string(),
    aptitude: z.record(z.string(), z.number().int().min(-1).max(1)).default({}).describe('A skill with +1 is cheaper to raise, one with -1 dearer (after DCSS).'),
    immune: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]).describe('Other words for it in CREATE (M10.17): "veenvolk".'),
    distrusted_by: z.array(z.string()).default([]).describe('NPCs with one of these quirks trust it less (the old customs and a changeling).'),
  })
  .strict()

const BackgroundSchema = z
  .object({
    id: Id,
    name: z.string(),
    skills: z.array(Id).refine((a) => a.length === 0 || a.length === 2, 'two skills').default([]).describe('Two skills where the world has classes; a world without them (The Quiet Reach) leaves them out (M10.29 C).'),
    talent: Id.or(z.literal('')).default('').describe('A talent where the world has classes; left out in a world without them.'),
    knows: z.array(z.union([z.string(), z.object({ who: z.string(), how: z.string() }).strict()])).default([]).describe('People who know you from before, and topics already in your journal. A person may come with how you know each other (M10.29 C): { who: <person id>, how: your shipmate on the Harrow crossing }.'),
    topics: z.array(z.string()).default([]),
    reason: z.string().optional().describe('Why you are here (M10.9): two sentences in the second person, with the world\'s own names; whom you were told to ask for first (an NPC); and what you heard that brought you (a topic, in the journal from the start).'),
    contact: z.string().optional(),
    heard: z.string().optional(),
  })
  .strict()

/** The people a background knows from before, each with how, where the world says it (M10.29 C). */
export function knownPeople(b: { knows: (string | { who: string; how: string })[] }): { who: string; how?: string }[] {
  return b.knows.map((k) => (typeof k === 'string' ? { who: k } : k))
}

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
    proficiency: z
      .object({ attack: z.array(z.number().int().min(1).max(10)), class_dc: z.array(z.number().int().min(1).max(10)), defence: z.array(z.number().int().min(1).max(10)) })
      .strict()
      .default({ attack: [1], class_dc: [1], defence: [1] }).describe('The levels at which attack, class DC and defence become trained, expert and master (+2, +4, +6).'),
    gear: z.record(z.string(), z.number().int().positive()).default({}),
    core: TalentSchema,
    trees: z.array(TreeSchema).length(3),
    keeps_range: z.boolean().default(false).describe('Keeps its distance in a fight, whatever it holds (M9.1; was a list of Nethermarch classes in the code).'),
  })
  .strict()

const BlessingSchema = z.object({ at: z.number().int().min(1).max(100), name: z.string(), text: z.string(), effects: z.array(EffectSchema).default([]) }).strict()

const PatronSchema = z
  .object({
    id: Id,
    name: z.string(),
    text: z.string(),
    // Favour and blessings are for a world with characters; one without may name patrons all the same (M10.20).
    values: z.record(z.string(), z.number().int()).default({}).describe('Deeds the patron likes, with the favour they give.'),
    forbids: z.record(z.string(), z.number().int()).default({}).describe('Deeds the patron forbids, with the favour they cost.'),
    blessings: z.array(BlessingSchema).default([]),
    sworn: z.string().optional().describe('The deed swearing to this patron counts as, for companions who approve or not (M10.17).'),
  })
  .strict()

const ConditionSchema = z.object({ id: Id, name: z.string(), text: z.string(), max: z.number().int().min(1).optional() }).strict()

const DeathSchema = z
  .object({
    vision: z.string().describe('The walk while dead; {guide} is the patron who sends you back, or the guide.'),
    guide: z.string(),
    patron: z.string().optional().describe('The patron who is death\'s own guide (the Grey Rider): sworn to them, the guide sends you back, not a patron by name.'),
    wake: z.string(),
    mark: z.string().describe('The mark: {lost} is the line about the purse, or nothing.'),
    rite_where: z.string().describe('Where a rite lifts it, when the stranger tries elsewhere; what the rite says; and when nothing is to lift.'),
    rite_done: z.string(),
    rite_nothing: z.string(),
    price: z
      .object({
        warn: z.string(),
        refused: z.string(),
        item: z.string(),
        at: z.string(),
        where: z.string(),
        none: z.string(),
        paid: z.string(),
        nothing: z.string(),
      })
      .strict()
      .optional().describe('After the third death: a price before the rite takes again (an item, left at a place with this tag or name).'),
  })
  .strict()

export const RulesSchema = z
  .object({
    xp_per_level: z.number().int().positive().default(1000).describe('Experience needed for each level: level n is reached at (n - 1) times this.'),
    // Every list may be left out (M10.20): a world without characters may still have patrons, death and conditions.
    skills: z.array(SkillSchema).default([]).describe('The skills of a character, each with its attribute.'),
    ancestries: z.array(AncestrySchema).default([]).describe('Where a character can come from, with what it gives.'),
    backgrounds: z.array(BackgroundSchema).default([]).describe('What a character did before, with what it gives.'),
    general_talents: z.array(TalentSchema).default([]).describe('Talents any character may take.'),
    conditions: z.array(ConditionSchema).default([]).describe('Conditions a character can suffer (hurt, sick, cursed) and what they do.'),
    classes: z.array(ClassSchema).default([]).describe('The classes of a character, with what each gives by level.'),
    patrons: z.array(PatronSchema).default([]).describe('The patrons a character may follow, and what each gives.'),
    ready_made: z
      .object({ name: z.string(), ancestry: Id, background: Id, class: Id, boosts: z.array(AttributeEnum), skills: z.array(Id), talent: Id })
      .strict()
      .optional().describe('The ready-made traveller for a game started without making a character (M9.1: per world).'),
    suggest: z.partialRecord(AttributeEnum, Id).optional().describe('For a suggested character: the ancestry for each key attribute (M9.1: per world); without it, the one that gives the key most.'),
    death: DeathSchema.optional().describe('What death is like in this world (M10.17; the Way of the Grey Rider in the Nethermarch): the vision, the waking, the mark and how a rite lifts it, and the price after the third time. Without it, plain words and no price.'),
  })
  .strict()
export type Rules = z.infer<typeof RulesSchema>
export type Death = z.infer<typeof DeathSchema>
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
    crit: z.string().optional().describe('What a critical hit does besides double damage.'),
    effect: z.object({ condition: Id, value: z.number().int().default(1), save: SaveEnum, dc: z.number().int() }).strict().optional().describe('An effect on every hit, with a save against its DC.'),
  })
  .strict()

export const CreatureSchema = z
  .object({
    id: Id.describe('The creature\'s id: a key, never changed once committed, and never shown to the player.'),
    name: z.string().describe('Its name as the player sees it.'),
    plural: z.string().optional().describe('Its name for more than one, when adding an s is wrong.'),
    kind: z.enum(['beast', 'human', 'spirit', 'undead', 'fey']).describe('What it is: beast, human, spirit, undead or fey.'),
    level: z.number().int().min(-1).max(20).describe('Its level, from -1 to 20: how hard it is to beat.'),
    hp: z.number().int().positive().describe('Its hit points.'),
    defence: z.number().int().describe('Its defence: what an attack must reach to hit it.'),
    saves: z.partialRecord(SaveEnum, z.number().int()).default({}).describe('Saves; missing ones are level + 3.'),
    perception: z.number().int().optional().describe('Its perception, for who acts first; left out, its level plus 4.'),
    attacks: z.array(AttackSchema).default([]).describe('Its attacks: bonus, damage and what a hit does.'),
    abilities: z.array(AbilitySchema.extend({ id: Id, name: z.string(), dc: z.number().int().optional() }).strict()).default([]).describe('What else it can do in a fight, each with a name and a difficulty to resist.'),
    morale: z
      .object({
        courage: z.number().int().min(-2).max(3).default(0),
        flees_below: z.number().min(0).max(1).optional(),
        surrenders: z.boolean().default(false),
        never: z.boolean().default(false),
      })
      .strict()
      .default({ courage: 0, surrenders: false, never: false }).describe('How it holds up: courage from -2 to 3, fleeing below a share of its hit points, giving up.'),
    immune: z.array(z.string()).default([]).describe('Damage and conditions that do nothing to it.'),
    weak: z.record(z.string(), z.number()).default({}).describe('Things that hurt it more: iron, fire, light.'),
    faction: z.string().optional().describe('The faction it belongs to (M10.17, before the Goat-Riders by name in code): beating it costs standing with that faction, paying it gains a little, binding one for the law costs, letting one go gains; and the fact of a fight is about that faction\'s topic, when there is one.'),
    reputation: z
      .partialRecord(z.enum(['won', 'paid', 'bound', 'freed', 'killed']), z.array(z.object({ faction: z.string(), by: z.number().int(), why: z.string() }).strict()))
      .default({}).describe('Further reputation per outcome of a fight with it: "you stood up to the Goat-Riders" with the village.'),
    lore: z.object({ dc: z.number().int(), text: z.string(), topic: z.string().optional() }).strict().optional().describe('What the stories say (Recall): a Lore DC, and the weakness it tells.'),
    text: z.string().describe('What the stranger sees of it, in a sentence or two.'),
    says: z.object({ hit: z.string().optional(), flee: z.string().optional(), surrender: z.string().optional(), down: z.string().optional() }).strict().default({}).describe('Words for the fight: how it attacks, how it flees, how it gives up.'),
  })
  .strict()
export type Creature = z.infer<typeof CreatureSchema>

export const EncounterSchema = z
  .object({
    id: Id.describe('The encounter\'s id: a key, never changed once committed, and never shown to the player.'),
    name: z.string().describe('What it is, in a few words.'),
    places: z.array(z.string()).min(1).describe('Where it can happen: locations, or area ids for the hexes of a region.'),
    chance: z.number().min(0).max(1).default(0.25).describe('The chance each time the player comes there.'),
    again_after: z.number().int().min(0).default(3).describe('Days before it can happen again.'),
    hours: z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(24)]).optional().describe('Only between these hours: from, to.'),
    foes: z
      .array(z.object({ creature: Id, count: z.number().int().min(1).default(1), range: z.enum(RANGES).default('near'), joins: z.number().int().min(1).optional() }).strict())
      .min(1).describe('Who it is: creatures, how many, how near, and when more join.'),
    opening: z.string().describe('What the stranger reads when it starts.'),
    demand: z.object({ amount: z.number().int().positive(), text: z.string(), paid: z.string() }).strict().optional().describe('A demand before blows: pay and it ends.'),
    surrender: z.object({ take: z.enum(['half_money', 'all_money', 'nothing']), text: z.string() }).strict().describe('What happens if the player gives up.'),
    flee_dc: z.number().int().default(15).describe('How hard it is to get away.'),
    news: z.object({ title: z.string(), belang: z.number().int().min(0).max(5).default(2) }).strict().optional().describe('The fact the village hears afterwards; {outcome} is filled in.'),
    when_flag: z.string().optional().describe('Only while this flag is set (the fen without its keeper).'),
    unless_flag: z.string().optional().describe('Never while this flag is set (the trick unmasked).'),
    win_flag: z.string().optional().describe('A flag set when the player wins (for quests).'),
    load: z.object({ chance: z.number().min(0).max(1), take: z.number().min(0).max(1) }).strict().optional().describe('With a load on the way (M9.1): how likely then, and what share of the load they take from whoever gives in.'),
    tempts: z.boolean().default(false).describe('Once met, a disloyal companion may hear an offer from this side (M10.17, before the Goat-Riders\' toll by name).'),
  })
  .strict()
export type Encounter = z.infer<typeof EncounterSchema>
