import { z } from 'zod'
import { ConditionSchema } from '../quests/schema'

// The schema of a passage (M10.12), apart from what runs it (passages.ts), so
// the content can load it without the rules of travel.

const Id = z.string().regex(/^[a-z0-9_]+$/)

export const PassageSchema = z
  .object({
    id: Id,
    /** As the game says it: "the barge on the Graafse Vaart". */
    name: z.string(),
    /** What it is, in the word the player uses: barge, coach, ferry; a spaceship or a Ford T in another world (M10.17). */
    kind: z.string().min(1),
    /** Other words the player may use for it: trekschuit, the boat. */
    aliases: z.array(z.string()).default([]),
    /** Its stops in order along the way: locations of the world, or the topics of far places. */
    stops: z.array(z.string()).min(2),
    /** The days it runs, in the world's weekdays; none: every day. */
    days: z.array(z.string()).default([]),
    /** Hours it takes passengers, "07-17": it goes when you board. */
    hours: z.string().optional(),
    /** Or set departures, "08:00": who is late waits for the next. */
    departs: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default([]),
    /** What a ride costs, in the smallest coin; and more for a ride to a far place. */
    fare: z.number().int().nonnegative(),
    far_fare: z.number().int().nonnegative().default(0),
    /** How fast it goes in the region, km an hour, and the time lost at locks and stops. */
    speed: z.number().positive().default(6),
    stop_minutes: z.number().int().nonnegative().default(0),
    /** Minutes of a leg the map cannot measure, "a>b": to a far place, or in a world without a map. */
    legs: z.record(z.string(), z.number().int().positive()).default({}),
    /** Over water: a blessing of fair wind makes it quicker. */
    water: z.boolean().default(false),
    /** Who takes the money: the bargeman, the coachman, the skipper. */
    crew: z.string().optional(),
    /** A ride in the region, in words: {fare}, {duration} and {place} filled in. */
    text: z.string(),
    /** When it does not go now, in words (its days and hours); and where it stops, in words. */
    closed: z.string().optional(),
    /** When it does not run at all while its conditions fail (the Lamp out), in words. */
    off: z.string().optional(),
    where: z.string().optional(),
    /** Only while these hold (the Lamp lit, the road open). */
    when: z.array(ConditionSchema).default([]),
    /** What you may see on a journey of days. */
    sights: z.array(z.string()).default([]),
  })
  .strict()
export type Passage = z.infer<typeof PassageSchema>
