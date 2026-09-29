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
    object: z.record(z.string(), z.string()).default({}).describe('An object in another state: by "key:value" or the value alone, else the default.'),
    place: z.record(z.string(), z.string()).default({}).describe('The place in another state (flooded, damaged, normal, ...), else the default.'),
    came: z.string().optional().describe('Someone who lives or works here now and did not before.'),
    gone: z.string().optional().describe('Someone who lived or worked here does not any more.'),
    dead: z.string().optional().describe('Someone who lived or worked here died.'),
    agreement: z.string().optional().describe('Something agreed that plays here.'),
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
    id: Id.describe('The gesture\'s id: a key, never changed once committed, and never shown to the player.'),
    who: z.string().describe('The person who makes it.'),
    at: z.enum(['arrive', 'shop', 'leave']).describe('When: the NPC sees the stranger arrive, the stranger trades with them, or the stranger leaves.'),
    shared: SharedSchema.describe('What the two share for it: an agreement kept, a memory of the stranger, a fact they heard of the stranger, or the stranger lodging here.'),
    do: z.union([
      z.object({ line: z.string() }).strict(),
      z.object({ give: z.string(), qty: z.number().int().positive().default(1), line: z.string() }).strict(),
      z.object({ warn: z.string() }).strict(),
      z.object({ ask: z.string() }).strict(),
    ]).describe('What they do: a line ({name}, {what} of the agreement or memory filled in), a thing put ready (given, no bargain), a warning, or a question how something went.'),
  })
  .strict()
export type Gesture = z.infer<typeof GestureSchema>

/** A place to belong (M10.13): a room rented by the week, with a chest, and people who expect you. */
export const LodgingSchema = z
  .object({
    id: Id.describe('The lodging\'s id: a key, never changed once committed, and never shown to the player.'),
    name: z.string().describe('As the journal says it: "your room at the Drowned Goose".'),
    at: z.string().describe('The room itself.'),
    keeper: z.string().describe('Who lets the room.'),
    rent: z.number().int().positive().optional().describe('The rent for a week, in the smallest coin; without it, five nights at the price the inn asks.'),
    chest: z.boolean().default(true).describe('A chest in the room that is the stranger\'s to use.'),
  })
  .strict()
export type Lodging = z.infer<typeof LodgingSchema>
