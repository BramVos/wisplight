import { parse } from 'yaml'
import { z } from 'zod'

// Content is plain YAML in content/. This module parses and validates it
// without touching the file system, so it runs in Node and in the browser.
// Every file is a mapping with one top-level key that says what it holds.

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

export const NEEDS = ['hunger', 'rest', 'social', 'safety', 'work', 'faith'] as const
export type Need = (typeof NEEDS)[number]

const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9_]+$`))
const ItemCounts = z.record(z.string(), z.number().int().positive()).default({})
const Hours = z.string().regex(/^\d{2}(:\d{2})?-\d{2}(:\d{2})?$/)
const Weekday = z.enum(['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Rustdag'])

// ---------------------------------------------------------------- items

export const ItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  plural: z.string().optional(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  value: z.number().int().nonnegative(),
  food: z.number().int().min(0).max(100).optional(),
})
export type Item = z.infer<typeof ItemSchema>

// ---------------------------------------------------------------- objects and affordances

export const AffordanceSchema = z.object({
  id: z.string(),
  verb: z.string(),
  label: z.string(),
  actors: z.array(z.enum(['npc', 'player'])).default(['npc']),
  access: z.enum(['public', 'owner', 'household', 'staff']).default('public'),
  consumes: ItemCounts,
  produces: ItemCounts,
  duration: z.number().int().positive(),
  fee: z.number().int().nonnegative().default(0),
  satisfies: z.partialRecord(z.enum(NEEDS), z.number().int()).default({}),
  requires_state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  narrate_start: z.string().optional(),
  narrate_end: z.string().optional(),
  player_text: z.string().optional(),
  broken_text: z.string().optional(),
})
export type Affordance = z.infer<typeof AffordanceSchema>

export const ObjectTypeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  description: z.string(),
  aliases: z.array(z.string()).default([]),
  affordances: z.array(AffordanceSchema).default([]),
  repair: z
    .object({
      consumes: ItemCounts,
      duration: z.number().int().positive(),
      sets: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      narrate_end: z.string().optional(),
    })
    .optional(),
})
export type ObjectType = z.infer<typeof ObjectTypeSchema>

export const ObjectInstanceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  type: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  owner: z.string().optional(),
  household: z.string().optional(),
  staff: z.array(z.string()).default([]),
  provider: z.string().optional(),
  hours: Hours.optional(),
  days: z.array(Weekday).optional(),
  state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  state_text: z.record(z.string(), z.string()).default({}),
})
export type ObjectInstance = z.infer<typeof ObjectInstanceSchema>

// ---------------------------------------------------------------- services (shops)

const Supply = z.object({
  item: z.string(),
  amount: z.number().int().positive(),
  every: z.enum(['day', 'week']),
  at: z.number().int().min(0).max(23).default(6),
  weekday: Weekday.optional(),
  requires: z.object({ object: z.string(), state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).optional(),
})

const Demand = z.object({
  item: z.string(),
  amount: z.number().int().positive(),
  from: z.number().int().min(0).max(23),
  to: z.number().int().min(1).max(24),
  days: z.array(Weekday).optional(),
})

export const ServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  sells: z.record(z.string(), z.object({ stock: z.number().int().nonnegative(), target: z.number().int().positive(), price: z.number().int().positive().optional() })).default({}),
  buys: z.array(z.string()).default([]),
  lodging: z.number().int().positive().optional(),
  provider: z.string(),
  staff: z.array(z.string()).default([]),
  premises: z.array(z.string()).default([]),
  hours: Hours,
  days: z.array(Weekday).optional(),
  supply: z.array(Supply).default([]),
  demand: z.array(Demand).default([]),
})
export type Service = z.infer<typeof ServiceSchema>

// ---------------------------------------------------------------- locations and areas

const Exit = z.object({
  to: z.string(),
  minutes: z.number().int().positive().default(1),
})

export const LocationSchema = z.object({
  id: Id('loc'),
  name: z.string(),
  area: z.string(),
  tags: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  summary: z.string().optional(),
  description: z.object({ day: z.string(), night: z.string().optional() }),
  exits: z.partialRecord(z.enum(DIRECTIONS), Exit).default({}),
  objects: z.array(ObjectInstanceSchema).default([]),
  services: z.array(ServiceSchema).default([]),
  items: z.record(z.string(), z.number().int().positive()).default({}),
})
export type Location = z.infer<typeof LocationSchema>

export const AreaSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  kind: z.enum(['village', 'town', 'hamlet', 'inn', 'route', 'wilderness']),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  fame: z.number().int().min(0).max(5).default(1),
})
export type Area = z.infer<typeof AreaSchema>

// ---------------------------------------------------------------- professions and NPCs

const ScheduleBlock = z.object({
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
  activity: z.enum(['sleep', 'work', 'eat', 'socialize', 'pray', 'free', 'home']),
  at: z.string().optional(),
  days: z.array(Weekday).optional(),
})
export type ScheduleBlock = z.infer<typeof ScheduleBlock>

const DailyGoal = z.object({
  type: z.enum(['Produce', 'Repair']),
  item: z.string().optional(),
  service: z.string().optional(),
  object: z.string().optional(),
  qty: z.number().int().positive().optional(),
  days: z.array(Weekday).optional(),
})
export type DailyGoal = z.infer<typeof DailyGoal>

export const ProfessionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  schedule: z.array(ScheduleBlock),
  daily_goals: z.array(DailyGoal).default([]),
})
export type Profession = z.infer<typeof ProfessionSchema>

const Axis = z.number().int().min(-3).max(3)

export const NpcSchema = z.object({
  id: Id('npc'),
  name: z.string(),
  short: z.string(),
  pronoun: z.enum(['she', 'he', 'they']),
  age: z.number().int().nonnegative(),
  profession: z.string(),
  home: z.string(),
  work: z.string().optional(),
  household: z.string().optional(),
  fame: z.number().int().min(0).max(5).default(0),
  appearance: z.string(),
  personality: z.object({ warmth: Axis, courage: Axis, honesty: Axis, temper: Axis, curiosity: Axis, diligence: Axis }),
  values: z.record(z.string(), Axis).default({}),
  quirks: z.array(z.string()).default([]),
  speech: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  public_facts: z.array(z.string()).default([]),
  examples: z.array(z.string()).default([]),
  money: z.number().int().nonnegative().default(0),
  inventory: ItemCounts,
  knows_areas: z.array(z.string()).default([]),
  child: z.boolean().default(false),
  secrets: z
    .array(z.object({ id: z.string(), text: z.string(), hint: z.string(), admission: z.string().optional(), dc: z.number().int().default(18) }))
    .default([]),
})
export type Npc = z.infer<typeof NpcSchema>

/** How others call an NPC in running text: the first name, so "Old Aaltje" becomes "Aaltje". */
export function callName(npc: Pick<Npc, 'name'>): string {
  return npc.name.split(' ')[0] ?? npc.name
}

// ---------------------------------------------------------------- topics (lore and facts)

export const TopicSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  kind: z.enum(['lore', 'fact', 'place', 'person']),
  aliases: z.array(z.string()).default([]),
  summary: z.string(),
  details: z.string().optional(),
  story: z.string().optional(),
  origin: z.string().optional(),
  fame: z.number().int().min(0).max(5).default(2),
  known_by: z.array(z.string()).default([]),
})
export type Topic = z.infer<typeof TopicSchema>

// ---------------------------------------------------------------- world

export const WorldSchema = z.object({
  id: z.string(),
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
  player: z.object({ money: z.number().int().nonnegative(), inventory: ItemCounts }),
})
export type WorldDef = z.infer<typeof WorldSchema>

// ---------------------------------------------------------------- loading

const FileSchema = z
  .object({
    world: WorldSchema.optional(),
    items: z.array(ItemSchema).optional(),
    object_types: z.array(ObjectTypeSchema).optional(),
    professions: z.array(ProfessionSchema).optional(),
    areas: z.array(AreaSchema).optional(),
    locations: z.array(LocationSchema).optional(),
    npcs: z.array(NpcSchema).optional(),
    topics: z.array(TopicSchema).optional(),
  })
  .strict()

export interface ContentFile {
  path: string
  text: string
}

export interface Content {
  world: WorldDef
  items: Map<string, Item>
  objectTypes: Map<string, ObjectType>
  professions: Map<string, Profession>
  areas: Map<string, Area>
  locations: Map<string, Location>
  npcs: Map<string, Npc>
  topics: Map<string, Topic>
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Content has ${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
    this.name = 'ContentError'
  }
}

function addAll<T>(map: Map<string, T>, list: T[] | undefined, id: (value: T) => string, path: string, kind: string, problems: string[]) {
  for (const value of list ?? []) {
    const key = id(value)
    if (map.has(key)) problems.push(`${path}: duplicate ${kind} id ${key}`)
    else map.set(key, value)
  }
}

export function loadContent(files: ContentFile[]): Content {
  const problems: string[] = []
  const worlds: WorldDef[] = []
  const content = {
    items: new Map<string, Item>(),
    objectTypes: new Map<string, ObjectType>(),
    professions: new Map<string, Profession>(),
    areas: new Map<string, Area>(),
    locations: new Map<string, Location>(),
    npcs: new Map<string, Npc>(),
    topics: new Map<string, Topic>(),
  }

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    let doc: unknown
    try {
      doc = parse(file.text)
    } catch (error) {
      problems.push(`${file.path}: invalid YAML (${(error as Error).message})`)
      continue
    }
    const result = FileSchema.safeParse(doc)
    if (!result.success) {
      for (const issue of result.error.issues) problems.push(`${file.path}: ${issue.path.join('.') || '(root)'} ${issue.message}`)
      continue
    }
    const data = result.data
    if (data.world) worlds.push(data.world)
    addAll(content.items, data.items, (v) => v.id, file.path, 'item', problems)
    addAll(content.objectTypes, data.object_types, (v) => v.id, file.path, 'object type', problems)
    addAll(content.professions, data.professions, (v) => v.id, file.path, 'profession', problems)
    addAll(content.areas, data.areas, (v) => v.id, file.path, 'area', problems)
    addAll(content.locations, data.locations, (v) => v.id, file.path, 'location', problems)
    addAll(content.npcs, data.npcs, (v) => v.id, file.path, 'NPC', problems)
    addAll(content.topics, data.topics, (v) => v.id, file.path, 'topic', problems)
  }

  const world = worlds[0]
  if (worlds.length !== 1) problems.push(`expected exactly one world, found ${worlds.length}`)
  problems.push(...checkReferences(world, content))
  if (problems.length > 0 || !world) throw new ContentError(problems)
  return { world, ...content }
}

function checkReferences(world: WorldDef | undefined, c: Omit<Content, 'world'>): string[] {
  const problems: string[] = []
  const item = (id: string, where: string) => {
    if (!c.items.has(id)) problems.push(`${where}: unknown item ${id}`)
  }
  const npc = (id: string | undefined, where: string) => {
    if (id && !c.npcs.has(id)) problems.push(`${where}: unknown NPC ${id}`)
  }
  const location = (id: string | undefined, where: string) => {
    if (id && !c.locations.has(id)) problems.push(`${where}: unknown location ${id}`)
  }

  if (world) {
    location(world.start.location, 'world.start.location')
    for (const id of Object.keys(world.player.inventory)) item(id, 'world.player.inventory')
  }
  for (const type of c.objectTypes.values()) {
    for (const aff of type.affordances) {
      for (const id of [...Object.keys(aff.consumes), ...Object.keys(aff.produces)]) item(id, `object type ${type.id}.${aff.id}`)
    }
  }
  for (const loc of c.locations.values()) {
    if (!c.areas.has(loc.area)) problems.push(`${loc.id}: unknown area ${loc.area}`)
    for (const [direction, exit] of Object.entries(loc.exits)) {
      if (!exit) continue
      location(exit.to, `${loc.id}.exits.${direction}`)
      const back = c.locations.get(exit.to)
      if (back && !Object.values(back.exits).some((e) => e?.to === loc.id) && !loc.tags.includes('one_way')) {
        problems.push(`${loc.id}: exit ${direction} to ${exit.to} has no way back`)
      }
    }
    for (const obj of loc.objects) {
      if (!c.objectTypes.has(obj.type)) problems.push(`${loc.id}.${obj.id}: unknown object type ${obj.type}`)
      npc(obj.owner, `${loc.id}.${obj.id}.owner`)
      npc(obj.provider, `${loc.id}.${obj.id}.provider`)
      for (const s of obj.staff) npc(s, `${loc.id}.${obj.id}.staff`)
    }
    for (const svc of loc.services) {
      npc(svc.provider, `${loc.id}.${svc.id}.provider`)
      for (const s of svc.staff) npc(s, `${loc.id}.${svc.id}.staff`)
      for (const p of svc.premises) location(p, `${loc.id}.${svc.id}.premises`)
      for (const id of [...Object.keys(svc.sells), ...svc.buys]) item(id, `${loc.id}.${svc.id}`)
      for (const s of svc.supply) item(s.item, `${loc.id}.${svc.id}.supply`)
      for (const d of svc.demand) item(d.item, `${loc.id}.${svc.id}.demand`)
    }
    for (const id of Object.keys(loc.items)) item(id, `${loc.id}.items`)
  }
  for (const n of c.npcs.values()) {
    if (!c.professions.has(n.profession)) problems.push(`${n.id}: unknown profession ${n.profession}`)
    location(n.home, `${n.id}.home`)
    location(n.work, `${n.id}.work`)
    for (const id of Object.keys(n.inventory)) item(id, `${n.id}.inventory`)
    for (const a of n.knows_areas) if (!c.areas.has(a)) problems.push(`${n.id}: unknown area ${a} in knows_areas`)
  }
  for (const t of c.topics.values()) {
    if (t.origin && !c.areas.has(t.origin) && !c.locations.has(t.origin)) problems.push(`topic ${t.id}: unknown origin ${t.origin}`)
    for (const n of t.known_by) npc(n, `topic ${t.id}.known_by`)
  }
  for (const p of c.professions.values()) {
    for (const g of p.daily_goals) if (g.item) item(g.item, `profession ${p.id}.daily_goals`)
  }
  return problems
}
