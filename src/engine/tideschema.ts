import { z } from 'zod'

// The great lines of a world (M10.22; Bram, 28 September 2026: do great
// events, war or a flood, go on in the background, with or without the
// stranger, and with their weight?). A line is content: what it is, where it
// strikes, what pushes it from day to day, when it may threaten and when it
// may break, what a threat does, and the plan of the content that plays the
// event. The engine adds up the pressure every day and judges each line once
// a month (src/engine/tides.ts).

/** What pushes a line, each day it holds (a negative weight calms it). */
export const DriverSchema = z.union([
  /** Each fact of the day that matches: a kind, at least a belang, about someone, by the stranger. */
  z.object({ fact: z.object({ kind: z.string().optional(), belang: z.number().int().min(0).max(5).optional(), about: z.string().optional(), by: z.literal('player').optional() }).strict(), weight: z.number() }).strict(),
  /** Each day the tension between two realms is at least this. */
  z.object({ tension: z.tuple([z.string(), z.string()]), at_least: z.number().min(0).max(100), weight: z.number() }).strict(),
  /** Each day of a season of the world. */
  z.object({ season: z.string(), weight: z.number() }).strict(),
  /** Each day a settlement is short of an item (or of anything). */
  z.object({ short: z.object({ settlement: z.string(), item: z.string().optional() }).strict(), weight: z.number() }).strict(),
  /** Each day a flag of the world is set. */
  z.object({ flag: z.string(), weight: z.number() }).strict(),
])
export type Driver = z.infer<typeof DriverSchema>

export const TideSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    /** What it is, in a word the chronicler and the journal use: war, flood, famine, plague, uprising, storm. */
    kind: z.string(),
    /** The areas it strikes: its threat and its news are there. */
    areas: z.array(z.string()).min(1),
    drivers: z.array(DriverSchema).min(1),
    /** From this pressure it may threaten. */
    threat: z.number().positive(),
    /** From this pressure it may break. */
    threshold: z.number().positive(),
    /** What a threat does: a mood of threat in its areas with this line, news, and prices up a little. */
    threatens: z
      .object({
        line: z.string(),
        news: z.string(),
        /** Prices in its areas, for as long as the mood lasts; 1 leaves them. */
        prices: z.number().min(1).max(2).default(1.2),
        days: z.number().int().positive().default(14),
      })
      .strict(),
    /** The plan of the content that plays the event, run by the engine. */
    plan: z.string(),
    /** What is said when it breaks: the fact of belang 5. */
    breaks: z.object({ title: z.string(), precise: z.string(), village: z.string(), far: z.string() }).strict(),
    /** Days after an event before it may break again (without: the knob tides.cooldown_days). */
    cooldown: z.number().int().positive().optional(),
    /**
     * Who the stranger may bring to one table once the line stands at its threat (M10.22): the two
     * people of its two sides, how much a good outcome eases it (at most ten, the rule for a shift),
     * and what the chronicle says afterwards.
     */
    mediation: z.object({ between: z.tuple([z.string(), z.string()]), eases: z.number().positive().max(10).default(10), told: z.string() }).strict().optional(),
  })
  .strict()
export type Tide = z.infer<typeof TideSchema>
