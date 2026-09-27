import { z } from 'zod'

// The economy as content (M8.4; design: signalen en nasleep, "Economie"): per
// settlement a ledger of what is made, used and brought in, once a game day.
// Named people near the player still make things for real with objects; the
// nameless are a number here. A region beyond the map is only a stub: what it
// sends and asks, its prices, the carrier and how often.

const Id = z.string().regex(/^[a-z0-9_]+$/)
/** Goods and how many: { flour: 4, peat: 2 }. */
const Goods = z.record(z.string(), z.number().positive())

/** A kind of ground and what it gives: peat in the fen, eel in the water. It runs out only if the content says so. */
export const ResourceSchema = z
  .object({
    id: Id,
    name: z.string(),
    gives: z.array(z.string()).min(1).describe('The goods this ground gives.'),
    months: z.array(z.number().int().min(1).max(13)).optional().describe('The months it gives in (1 to 13); every month when left out.'),
    amount: z.number().int().positive().optional().describe('All there is, in units of what it gives; without it, it never runs out.'),
  })
  .strict()
export type Resource = z.infer<typeof ResourceSchema>

/** Where something is made: the mill, the peat banks, the brewery. */
export const WorkshopSchema = z
  .object({
    id: Id,
    name: z.string(),
    at: z.string().describe('The place where the work is done.'),
    makes: Goods.describe('What a full day of work makes.'),
    uses: Goods.default({}).describe('What a full day of work uses.'),
    from: z.string().optional().describe('The ground it works: a resource of the settlement.'),
    requires: z
      .object({ object: z.string(), state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) })
      .strict()
      .optional()
      .describe('An object that must be in this state: the mill must turn.'),
    workers: z.number().int().min(0).default(0).describe('Nameless workers.'),
    named: z.array(z.string()).default([]).describe('Who practises it by name; with nobody left and no nameless workers, the trade is missing.'),
  })
  .strict()
export type Workshop = z.infer<typeof WorkshopSchema>

/** A settlement's ledger: its nameless people, what they use, what is made there, and what it keeps in store. */
export const SettlementSchema = z
  .object({
    id: Id.describe('The area it is.'),
    tags: z.array(Id).default([]).describe('What kind of place it is, for conditions: trade_town, peat_village, priory.'),
    people: z.number().int().min(0).describe('Nameless grown people.'),
    use: Goods.default({}).describe('What the nameless use in a day, all together.'),
    keep: z.record(z.string(), z.number().int().min(0)).default({}).describe('What it aims to hold in store (and has at the start); twice that is a surplus, and only above it goes out on a route.'),
    stock: z.record(z.string(), z.number().int().min(0)).default({}).describe('What it has at the start where that is not what it keeps: after the storm, no flour.'),
    resources: z.array(z.string()).default([]).describe('The ground around it.'),
    workshops: z.array(WorkshopSchema).default([]),
    openness: z.number().min(-0.5).max(0.5).default(0).describe('How much more (or less) open to strangers than its kind and its living make it.'),
    income: z.number().int().min(0).default(0).describe('What comes in from outside in a day, in the smallest coin: travellers, rents, the market.'),
  })
  .strict()
export type Settlement = z.infer<typeof SettlementSchema>

/** A region beyond the map, as a stub: only what it sends and asks, its prices, carrier and how often. */
export const OutlandSchema = z
  .object({
    id: Id,
    name: z.string(),
    topic: z.string().optional().describe('The topic people talk about it by.'),
    realm: z.string().optional(),
    sends: z.array(z.string()).min(1),
    asks: z.array(z.string()).default([]),
    prices: z.number().positive().default(1).describe('Its prices against ours: 1.2 is a fifth dearer.'),
    by: z.string().describe('Who carries the goods: a wagon, a barge, a pedlar.'),
    every: z.number().int().positive().describe('Every so many days.'),
  })
  .strict()
export type Outland = z.infer<typeof OutlandSchema>

/** Goods that go from one place to another now and then: between settlements, or from a region beyond the map. */
export const RouteSchema = z
  .object({
    id: Id,
    name: z.string(),
    from: z.string().describe('A settlement or a region beyond the map.'),
    to: z.string().describe('A settlement.'),
    carries: Goods.describe('What comes on a trip; from a settlement only what it has above what it keeps.'),
    returns: Goods.default({}).describe('What goes back on the same trip, from what the other side has above what it keeps.'),
    by: z.string(),
    every: z.number().int().positive().default(1).describe('Every so many days.'),
    via: z.tuple([z.string(), z.string()]).optional().describe('A way it runs over: if that way is closed, so is the route.'),
    closed: z.boolean().default(false).describe('Closed from the start.'),
  })
  .strict()
export type Route = z.infer<typeof RouteSchema>
