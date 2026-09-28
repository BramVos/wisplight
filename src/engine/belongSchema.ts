import { z } from 'zod'

// Returning, gestures and a place to belong (M10.13), as content: the words
// for what changed since your last visit, the small practical things people
// do for you after something you shared, and the lodging a world offers.

const Id = z.string().regex(/^[a-z0-9_]+$/)

/**
 * The words for what changed at a place since your last visit, per kind of
 * change. {place}, {object}, {name}, {them} and {what} are filled in; a state
 * has its own line where it reads otherwise ("repaired": the new planks).
 */
export const ReturningSchema = z
  .object({
    /** An object in another state: by "key:value" or the value alone, else the default. */
    object: z.record(z.string(), z.string()).default({}),
    /** The place in another state (flooded, damaged, normal, ...), else the default. */
    place: z.record(z.string(), z.string()).default({}),
    /** Someone who lives or works here now, and someone who does not any more (or died). */
    came: z.string().optional(),
    gone: z.string().optional(),
    dead: z.string().optional(),
    /** Something agreed that plays here. */
    agreement: z.string().optional(),
  })
  .strict()
export type Returning = z.infer<typeof ReturningSchema>

/** What was shared, for a gesture: only from the register and memory, never from liking alone. */
const SharedSchema = z.union([
  /** An agreement between the two that was kept: of a kind, or any. */
  z.object({ kept: z.string() }).strict(),
  /** Something the NPC remembers of the stranger, about this topic. */
  z.object({ memory: z.string() }).strict(),
  /** A fact of this kind about the stranger that the NPC heard. */
  z.object({ fact: z.string() }).strict(),
  /** The stranger lodges here (a lodging's id), and was away at least so many days. */
  z.object({ lodger: z.string(), away: z.number().nonnegative().default(1) }).strict(),
])
export type Shared = z.infer<typeof SharedSchema>

export const GestureSchema = z
  .object({
    id: Id,
    who: z.string(),
    /** When: the NPC sees the stranger arrive, the stranger trades with them, or the stranger leaves. */
    at: z.enum(['arrive', 'shop', 'leave']),
    shared: SharedSchema,
    /**
     * What they do: a line ({name}, {what} of the agreement or memory filled in), a thing put ready (given, no bargain),
     * a warning, or a question how something went.
     */
    do: z.union([
      z.object({ line: z.string() }).strict(),
      z.object({ give: z.string(), qty: z.number().int().positive().default(1), line: z.string() }).strict(),
      z.object({ warn: z.string() }).strict(),
      z.object({ ask: z.string() }).strict(),
    ]),
  })
  .strict()
export type Gesture = z.infer<typeof GestureSchema>

/** A place to belong (M10.13): a room rented by the week, with a chest, and people who expect you. */
export const LodgingSchema = z
  .object({
    id: Id,
    /** As the journal says it: "your room at the Drowned Goose". */
    name: z.string(),
    /** The room itself, and who lets it. */
    at: z.string(),
    keeper: z.string(),
    /** The rent for a week, in the smallest coin; without it, five nights at the price the inn asks. */
    rent: z.number().int().positive().optional(),
    /** A chest in the room that is the stranger's to use. */
    chest: z.boolean().default(true),
  })
  .strict()
export type Lodging = z.infer<typeof LodgingSchema>
