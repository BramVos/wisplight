import { z } from 'zod'
import { ConditionSchema } from '../quests/schema'

// The schema of a passage (M10.12), apart from what runs it (passages.ts), so
// the content can load it without the rules of travel.

const Id = z.string().regex(/^[a-z0-9_]+$/)

export const PassageSchema = z
  .object({
    id: Id.describe('The line\'s id: a key, never changed once committed, and never shown to the player.'),
    name: z.string().describe('As the game says it: "the barge on the Graafse Vaart".'),
    kind: z.string().min(1).describe('What it is, in the word the player uses: barge, coach, ferry; a spaceship or a Ford T in another world (M10.17).'),
    aliases: z.array(z.string()).default([]).describe('Other words the player may use for it: trekschuit, the boat.'),
    stops: z.array(z.string()).min(2).describe('Its stops in order along the way: locations of the world, or the topics of far places.'),
    days: z.array(z.string()).default([]).describe('The days it runs, in the world\'s weekdays; none: every day.'),
    hours: z.string().optional().describe('Hours it takes passengers, "07-17": it goes when you board.'),
    departs: z.array(z.string().regex(/^\d{2}:\d{2}$/)).default([]).describe('Or set departures, "08:00": who is late waits for the next.'),
    fare: z.number().int().nonnegative().describe('What a ride costs, in the smallest coin.'),
    far_fare: z.number().int().nonnegative().default(0).describe('What a ride to a far place costs on top of the fare, in the smallest coin.'),
    speed: z.number().positive().default(6).describe('How fast it goes in the region, km an hour.'),
    stop_minutes: z.number().int().nonnegative().default(0).describe('The minutes lost at locks and stops on each ride.'),
    legs: z.record(z.string(), z.number().int().positive()).default({}).describe('Minutes of a leg the map cannot measure, "a>b": to a far place, or in a world without a map.'),
    water: z.boolean().default(false).describe('Over water: a blessing of fair wind makes it quicker.'),
    crew: z.string().optional().describe('Who takes the money: the bargeman, the coachman, the skipper.'),
    text: z.string().describe('A ride in the region, in words: {fare}, {duration} and {place} filled in.'),
    closed: z.string().optional().describe('When it does not go now, in words (its days and hours).'),
    off: z.string().optional().describe('When it does not run at all while its conditions fail (the Lamp out), in words.'),
    where: z.string().optional().describe('Where it stops, in words, for someone who asks.'),
    when: z.array(ConditionSchema).default([]).describe('Only while these hold (the Lamp lit, the road open).'),
    sights: z.array(z.string()).default([]).describe('What you may see on a journey of days.'),
  })
  .strict()
export type Passage = z.infer<typeof PassageSchema>
