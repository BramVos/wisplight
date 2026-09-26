import { parse } from 'yaml'
import { z } from 'zod'

// Content is plain YAML in content/. This module parses and validates it
// without touching the file system, so it runs in Node and in the browser.

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

const Exit = z.object({
  to: z.string(),
  minutes: z.number().int().positive().default(1),
})

export const LocationSchema = z.object({
  id: z.string().regex(/^loc_[a-z0-9_]+$/),
  name: z.string(),
  area: z.string(),
  tags: z.array(z.string()).default([]),
  description: z.object({
    day: z.string(),
    night: z.string().optional(),
  }),
  exits: z.partialRecord(z.enum(DIRECTIONS), Exit).default({}),
})
export type Location = z.infer<typeof LocationSchema>

const Axis = z.number().int().min(-3).max(3)

export const NpcSchema = z.object({
  npc: z.string().regex(/^npc_[a-z0-9_]+$/),
  name: z.string(),
  short: z.string(),
  age: z.number().int().nonnegative(),
  profession: z.string(),
  home: z.string(),
  work: z.string().optional(),
  fame: z.number().int().min(0).max(5).default(0),
  personality: z.object({
    warmth: Axis,
    courage: Axis,
    honesty: Axis,
    temper: Axis,
    curiosity: Axis,
    diligence: Axis,
  }),
  values: z.record(z.string(), Axis).default({}),
  quirks: z.array(z.string()).default([]),
  speech: z.string().optional(),
  public_facts: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
})
export type Npc = z.infer<typeof NpcSchema>

export const WorldSchema = z.object({
  world: z.string(),
  name: z.string(),
  intro: z.string().optional(),
  start: z.object({
    location: z.string(),
    year: z.number().int().nonnegative(),
    month: z.number().int().min(1).max(13),
    day: z.number().int().min(1).max(30),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59).default(0),
  }),
})
export type World = z.infer<typeof WorldSchema>

export interface ContentFile {
  path: string
  text: string
}

export interface Content {
  world: World
  locations: Map<string, Location>
  npcs: Npc[]
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Content has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
    this.name = 'ContentError'
  }
}

export function loadContent(files: ContentFile[]): Content {
  const problems: string[] = []
  const worlds: World[] = []
  const locations = new Map<string, Location>()
  const npcs: Npc[] = []

  const report = (path: string, error: z.ZodError) => {
    for (const issue of error.issues) {
      problems.push(`${path}: ${issue.path.join('.') || '(root)'} ${issue.message}`)
    }
  }

  for (const file of files) {
    let doc: unknown
    try {
      doc = parse(file.text)
    } catch (error) {
      problems.push(`${file.path}: invalid YAML (${(error as Error).message})`)
      continue
    }

    if (Array.isArray(doc)) {
      for (const item of doc) {
        const result = LocationSchema.safeParse(item)
        if (!result.success) {
          report(file.path, result.error)
        } else if (locations.has(result.data.id)) {
          problems.push(`${file.path}: duplicate location id ${result.data.id}`)
        } else {
          locations.set(result.data.id, result.data)
        }
      }
    } else if (doc && typeof doc === 'object' && 'world' in doc) {
      const result = WorldSchema.safeParse(doc)
      if (result.success) worlds.push(result.data)
      else report(file.path, result.error)
    } else if (doc && typeof doc === 'object' && 'npc' in doc) {
      const result = NpcSchema.safeParse(doc)
      if (result.success) npcs.push(result.data)
      else report(file.path, result.error)
    } else {
      problems.push(`${file.path}: not a world, location list or NPC`)
    }
  }

  const world = worlds[0]
  if (worlds.length !== 1) problems.push(`expected exactly one world file, found ${worlds.length}`)
  if (world && !locations.has(world.start.location)) {
    problems.push(`world.start.location points to unknown location ${world.start.location}`)
  }
  for (const location of locations.values()) {
    for (const [direction, exit] of Object.entries(location.exits)) {
      if (exit && !locations.has(exit.to)) {
        problems.push(`${location.id}: exit ${direction} points to unknown location ${exit.to}`)
      }
    }
  }
  for (const npc of npcs) {
    if (!locations.has(npc.home)) problems.push(`${npc.npc}: home ${npc.home} does not exist`)
    if (npc.work && !locations.has(npc.work)) problems.push(`${npc.npc}: work ${npc.work} does not exist`)
  }

  if (problems.length > 0 || !world) throw new ContentError(problems)
  return { world, locations, npcs }
}
