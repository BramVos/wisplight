import { z } from 'zod'
import { WorkshopSchema } from '../economy/schema'

// Growth as content (M8.5; design: signalen en nasleep, "Groei"): who may come
// to live in the world during a game, and what may be built. A game only
// instantiates these, and checks what it made as if it had been written.

const Id = z.string().regex(/^[a-z0-9_]+$/)
const Range = z.tuple([z.number().int().min(0), z.number().int().min(0)])

/** The names a world gives people who come during a game: given names by pronoun, and family names. */
export const NamesSchema = z
  .object({
    she: z.array(z.string()).min(1),
    he: z.array(z.string()).min(1),
    family: z.array(z.string()).min(1),
  })
  .strict()

/** One of a household that comes: the head who takes up the trade, a spouse, children. */
const MemberSchema = z
  .object({
    role: z.enum(['head', 'spouse', 'child']),
    age: Range,
    profession: z.string(),
    pronoun: z.enum(['she', 'he', 'they']).optional().describe('Drawn when left out.'),
    looks: z.array(z.string()).min(1).describe('What people see first; {they}, {their}, {man} are filled in.'),
  })
  .strict()

/** A household that may come to live in a settlement, for a trade nobody works there. */
export const NewcomerSchema = z
  .object({
    id: Id,
    trade: z.string().describe('The workshop they take up, by its id in a settlement.'),
    from: z.string().describe('Where they come from: a region beyond the map, or an area.'),
    people: z.array(MemberSchema).min(1),
    facts: z.array(z.string()).default([]).describe('What anyone may know about the head: {name}, {from}, {area}, {their} are filled in.'),
    speech: z.string().optional(),
  })
  .strict()
export type Newcomer = z.infer<typeof NewcomerSchema>

/** Something a settlement may build, with materials from its store, workdays and money. */
export const ProjectSchema = z
  .object({
    id: Id,
    name: z.string(),
    settlement: z.string(),
    after: z.string().optional().describe('A project that must be finished first.'),
    needs: z.record(z.string(), z.number().int().positive()).default({}).describe('All the materials, taken from the store a workday at a time.'),
    days: z.number().int().positive().describe('Workdays; a rest day does not count.'),
    cost: z.number().int().min(0).default(0).describe('The money it costs, from the purse of the settlement and what others put in.'),
    place: z.record(z.string(), z.unknown()).optional().describe('A new place when it is finished, written as a location.'),
    link: z.object({ from: z.string(), direction: z.string() }).strict().optional().describe('The way into the new place from a place that is there.'),
    workshops: z.array(WorkshopSchema).default([]).describe('Workshops the settlement has once it is finished.'),
    sets: z.array(z.string()).default([]).describe('Flags set when it is finished: descriptions that change with it.'),
  })
  .strict()
export type Project = z.infer<typeof ProjectSchema>
