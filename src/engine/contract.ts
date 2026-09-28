import type { z } from 'zod'
import { FileSchema, type Content } from './content'

// The content contract (M10.17; FO, chapter 15): everything a world can have,
// made from the schemas themselves, so it never goes out of date. Per kind:
// the file it usually lives in, what the game does with it, what happens when
// it is missing (always a neutral default, never the Nethermarch), and its
// fields: required or optional, and the default. `npm run content:contract`
// writes docs/CONTENT.md from it; the writing aid gets a short version, and
// the editor refuses a field the contract does not know.

interface KindText {
  file: string
  /** What the game does with it, in one sentence. */
  does: string
  /** What happens when a world has none. */
  missing: string
}

/**
 * What a field may hold where its type does not say it (M10.20): for the
 * contract, the fields of a world step and the writing aid's short contract.
 */
export const FIELD_NOTES: Record<string, string[]> = {
  world: [
    '`knobs`: rules of play set otherwise than the default, by the id of a knob (docs/KNOBS.md): `talk.max_turns: 30`; for a table only the rows that differ.',
    // M10.20: the palette step of The Quiet Reach borrowed peat_pit for a mine shaft.
    '`map.palette.signs`: the signs on this world\'s land by an id of its own (`mine_shaft`, never the Nethermarch\'s `peat_pit`), at most seven; each needs a colour under `glyph` in the dark and the paper style. `means: danger` or `uncertain` adds a mark and a word, not only a colour. Left out, the world has the Nethermarch\'s pool, peat_pit, willow, ruin and hummock.',
    '`map.palette.names` also names the ways in the legend: `road`, `path` and `canal` (a tow path in the Nethermarch; `canal: tidal channel` elsewhere).',
  ],
  // M10.20: a region of another world has its own lands, and the editor lays out a first one.
  regions: [
    '`zones`: one character is `zone` km east to west and north to south (without it half a km by one), the top row the north edge; every character is in `legend`.',
    '`lands`: the region\'s own terrains by the key of their palette tints, each with `like` (woods, fields, fen, water or heath: its minutes, its sight, what swallows a leg) and `text` (the line the stranger reads there).',
    '`paths[].text`: the line walking along it; without one, the Nethermarch\'s line for a road, tow path or path.',
    // M10.21: the edge of the map is an edge, with what lies beyond it.
    '`beyond`: per edge (north, east, south or west) the line the stranger reads on reaching it, from the world book, and `toward`: the far places that way (topics), which they may go on to on foot or by a line. An edge without one says that nobody has told them; beyond the last land the world names, nothing is made.',
  ],
  npcs: ['`secrets`: `about` and `teaches` take ids: a topic, a person (an NPC id), a place (a location id) or an area (`area_<id>`).'],
  // M10.20: the transport step of The Quiet Reach wrote legs as "a-b".
  passages: ['`legs`: minutes between two of its stops that the map cannot measure, keyed `<stop>><stop>` with a `>` between the ids (`loc_quay>kestrel_landing: 90`).'],
}

/** Every kind of content, in the order a new world is best filled in. */
export const KINDS: Record<string, KindText> = {
  world: { file: 'world.yaml', does: 'The frame of the world: its name and start, the frame every model call gets, the calendar, coins, law, faiths, towns, weather, map and palette with the signs on its land, and the words its texts use for the land and the region.', missing: 'A world has exactly one. What it leaves out takes the neutral default: "the land", "the region", a law without an officer, no faith, the standard calendar, coins and palette, and the Nethermarch\'s signs on the land.' },
  areas: { file: 'data/areas.yaml', does: 'The villages, towns, inns and stretches of wild land places belong to; who lives in an area knows it.', missing: 'Nothing can be placed: at least one area is needed.' },
  locations: { file: 'areas/<area>/locations.yaml', does: 'The places the stranger can stand in: their descriptions, exits, objects, services and things to look at.', missing: 'Nothing to stand in: at least one location is needed, the start.' },
  professions: { file: 'data/professions.yaml', does: 'What people do all day: the hours of work, home and sleep that move them about.', missing: 'People keep to their homes.' },
  npcs: { file: 'areas/<area>/npcs.yaml', does: 'The people: who they are, where they live and work, what they know, who they are to each other, and how they speak.', missing: 'An empty world: nobody to talk to.' },
  items: { file: 'data/items.yaml', does: 'Things that can be carried, eaten, worn, bought and sold.', missing: 'No things.' },
  object_types: { file: 'data/objects.yaml', does: 'Kinds of objects in places, with what can be done with them (use, open, repair, work at).', missing: 'Objects cannot be used.' },
  topics: { file: 'data/topics.yaml', does: 'What people can talk about: lore, far places, people outside the game; with who knows it how well.', missing: 'People only talk of each other and the places around them.' },
  news: { file: 'data/news.yaml', does: 'Rumours going round at the start.', missing: 'No rumours at the start.' },
  patterns: { file: 'data/patterns.yaml', does: 'Small stories the world may start by itself: a lost thing, a quarrel.', missing: 'No small stories start by themselves.' },
  quests: { file: 'data/quests.yaml', does: 'Written quests with their ways and endings.', missing: 'No written quests; requests still come up from what happens.' },
  regions: { file: 'regions/<region>/region.yaml', does: 'The map of the land: terrain, ways, landmarks and where places lie on it, with the region\'s own lands (black basalt, open sea), each walking like one of the engine\'s.', missing: 'No map: the world is walked by its exits. The editor lays out a first one from the places, their exits and minutes (Palette tab).' },
  rules: { file: 'rules/rules.yaml', does: 'The rules of play: skills, ancestries, backgrounds, classes and talents, conditions and patrons.', missing: 'No character to make and no fights: the stranger talks, trades and walks.' },
  voice: { file: 'data/voice.yaml', does: 'How people speak: oaths per faith, rare sayings, how they call a stranger, time and measures, and what does not exist here.', missing: 'The fixed list of modern words is kept out, and nothing else.' },
  journey: { file: 'data/journey.yaml', does: 'Sentences for a journey of more than a few steps: per terrain, weather and the night, and what may happen on the way.', missing: 'A walk is told in one line.' },
  passages: { file: 'data/passages.yaml', does: 'Lines of transport (a barge, a coach, a ferry, a spaceship): stops, days and departures, fares and legs.', missing: 'No lines: the stranger walks.' },
  returning: { file: 'data/belonging.yaml', does: 'The words for what changed at a place since the stranger was last there.', missing: 'Nothing is said when the stranger comes back.' },
  gestures: { file: 'data/belonging.yaml', does: 'Small practical things people do after something shared with the stranger.', missing: 'No gestures.' },
  lodgings: { file: 'data/belonging.yaml', does: 'A room the stranger can rent by the week, with a chest and people who expect them.', missing: 'No room of their own; an inn still lets a bed for the night.' },
  factions: { file: 'data/factions.yaml', does: 'Groups with a seat and a stance, whose reputation the stranger earns.', missing: 'No factions.' },
  realms: { file: 'data/factions.yaml', does: 'The lands and powers beyond the region, and how they stand to each other.', missing: 'No realms and no politics.' },
  tensions: { file: 'data/factions.yaml', does: 'How two realms stand at the start.', missing: 'All at peace.' },
  plans: { file: 'data/plans.yaml', does: 'Consequences and schemes in steps: a flood, a muster, an opponent who does not wait.', missing: 'Nothing unfolds but what the rules make.' },
  watchers: { file: 'data/watchers.yaml', does: 'What change is a signal: a death, a theft, a shortage, a threat.', missing: 'Changes pass without a signal.' },
  aftermath: { file: 'data/aftermath.yaml', does: 'What follows a signal by custom, in steps of verbs.', missing: 'Signals have no custom aftermath.' },
  intentions: { file: 'data/intentions.yaml', does: 'What a person may choose to do about a signal, with a model.', missing: 'People follow custom.' },
  verbs: { file: 'data/verbs.yaml', does: 'How each verb is told as news in this world.', missing: 'The standard words.' },
  creatures: { file: 'rules/bestiary.yaml', does: 'Creatures with their numbers for a fight.', missing: 'No creatures.' },
  encounters: { file: 'rules/bestiary.yaml', does: 'Fights that may happen at places and times.', missing: 'No fights happen.' },
  settlements: { file: 'data/economy.yaml', does: 'The ledger of each settlement: people, what they use and keep, workshops.', missing: 'Fixed prices, and shops stocked as written.' },
  resources: { file: 'data/economy.yaml', does: 'The ground and what it gives.', missing: 'Nothing is gathered from the land.' },
  routes: { file: 'data/economy.yaml', does: 'Trade routes that carry goods between settlements and from beyond.', missing: 'No goods come in.' },
  outlands: { file: 'data/economy.yaml', does: 'Regions beyond the map that trade and can be travelled to.', missing: 'Nothing beyond the map trades.' },
  newcomers: { file: 'data/growth.yaml', does: 'Households that may come to live in the world.', missing: 'Nobody moves in.' },
  projects: { file: 'data/growth.yaml', does: 'What settlements may build.', missing: 'Nothing is built.' },
  crafts: { file: 'data/crafts.yaml', does: 'Crafts with their techniques, to learn and practise.', missing: 'No crafts to learn.' },
  props: { file: 'data/props.yaml', does: 'Templates of objects the chronicler may place in a home: a chest, a letter.', missing: 'The chronicler places nothing.' },
}

type Schema = z.ZodType
// The shape of zod 4's definitions, as far as the contract reads them.
type Def = { type: string; innerType?: Schema; defaultValue?: unknown; element?: Schema; shape?: Record<string, Schema>; entries?: Record<string, string>; options?: Schema[]; getter?: () => Schema; valueType?: Schema; keyType?: Schema; values?: unknown[]; in?: Schema; items?: Schema[]; checks?: { _zod: { def: { check: string; value?: unknown; inclusive?: boolean; format?: string; pattern?: unknown } } }[] }
const def = (s: Schema): Def => (s as unknown as { _zod: { def: Def } })._zod.def

/** The schema under optional, default, lazy and pipe, with whether it was optional and its default. */
function unwrap(s: Schema): { s: Schema; optional: boolean; fallback?: unknown } {
  let optional = false
  let fallback: unknown
  for (let i = 0; i < 10; i++) {
    const d = def(s)
    if (d.type === 'optional') {
      optional = true
      s = d.innerType!
    } else if (d.type === 'default' || d.type === 'prefault') {
      optional = true
      fallback = typeof d.defaultValue === 'function' ? (d.defaultValue as () => unknown)() : d.defaultValue
      s = d.innerType!
    } else if (d.type === 'lazy') s = d.getter!()
    else if (d.type === 'pipe') s = d.in!
    else if (d.type === 'nullable') s = d.innerType!
    else break
  }
  return { s, optional, ...(fallback !== undefined ? { fallback } : {}) }
}

/** A schema in a few words: "text", "list of text", "one of a, b, c", "a map: x, y". */
export function kindOf(s: Schema, depth = 0): string {
  const { s: inner } = unwrap(s)
  const d = def(inner)
  switch (d.type) {
    case 'string':
      return 'text'
    case 'number':
    case 'int':
      return 'number'
    case 'boolean':
      return 'yes or no'
    case 'enum': {
      const values = Object.values(d.entries ?? {})
      return values.length > 8 ? `one of ${values.slice(0, 8).join(', ')}, ...` : `one of ${values.join(', ')}`
    }
    case 'literal':
      return `"${String(d.values?.[0])}"`
    case 'array':
      return `list of ${kindOf(d.element!, depth + 1)}`
    case 'tuple':
      return `${(d.items ?? []).length} values`
    case 'record':
      return `a map of names to ${kindOf(d.valueType!, depth + 1)}`
    case 'union':
      return depth > 1 ? 'one of several forms' : `one of: ${(d.options ?? []).map((o) => kindOf(o, depth + 1)).join(' | ')}`
    case 'object': {
      const keys = Object.keys(d.shape ?? {})
      return depth > 1 ? 'a map' : `a map: ${keys.slice(0, 10).join(', ')}${keys.length > 10 ? ', ...' : ''}`
    }
    default:
      return d.type
  }
}

export interface Field {
  name: string
  kind: string
  required: boolean
  fallback?: unknown
}

/** The fields of one entity of a kind (the item of its list, or the object itself). */
export function fieldsOf(key: string): Field[] {
  const top = (FileSchema as unknown as { shape: Record<string, Schema> }).shape[key]
  if (!top) return []
  let { s } = unwrap(top)
  if (def(s).type === 'array') s = unwrap(def(s).element!).s
  const d = def(s)
  if (d.type !== 'object') return []
  return Object.entries(d.shape ?? {}).map(([name, field]) => {
    const u = unwrap(field)
    return { name, kind: kindOf(field), required: !u.optional, ...(u.fallback !== undefined ? { fallback: u.fallback } : {}) }
  })
}

/**
 * A schema written out whole for a model (M10.20): every field of a map, with
 * "?" after one that may be left out, maps inside opened up, every value of a
 * choice and the range of a number. The real run of The Quiet Reach in the
 * app went wrong where a step named a kind but not its fields: kinds of
 * weather the engine lacks, a chance above 1, details with "id" and "names".
 */
export function shapeOf(s: Schema, depth = 0, named?: Map<string, string>, path: Schema[] = []): string {
  // A shape inside itself (a condition of conditions: any, all, not) is not opened again. A lazy
  // schema makes a new one each time, so it is known by its wrappers.
  const chain: Schema[] = []
  for (let x: Schema | undefined = s; x && chain.length < 10; ) {
    chain.push(x)
    const d = def(x)
    x = d.type === 'lazy' ? d.getter!() : ['optional', 'default', 'prefault', 'nullable'].includes(d.type) ? d.innerType : d.type === 'pipe' ? d.in : undefined
  }
  if (chain.some((x) => path.includes(x))) return 'the same shape again, nested'
  const text = shapeText(chain.at(-1)!, depth, named, [...path, ...chain])
  // A long shape that comes back (the conditions of when) is written out once, under a name.
  if (!named || text.length < 200 || depth < 2) return text
  const name = named.get(text) ?? `SHAPE ${named.size + 1}`
  named.set(text, name)
  return name
}

function shapeText(s: Schema, depth: number, named: Map<string, string> | undefined, path: Schema[]): string {
  const { s: inner } = unwrap(s)
  const d = def(inner)
  switch (d.type) {
    case 'string': {
      // A text of a fixed form says it (M10.20: the hours of a service, "07-12", came as "07:00 to 12:00").
      const pattern = (d.checks ?? []).map((c) => c._zod.def).find((c) => c.check === 'string_format' && c.format === 'regex')?.pattern
      return pattern ? `text matching ${String(pattern)}` : 'text'
    }
    case 'number':
    case 'int': {
      const checks = (d.checks ?? []).map((c) => c._zod.def)
      const whole = d.type === 'int' || checks.some((c) => c.check === 'number_format' && /int/.test(c.format ?? ''))
      const from = checks.find((c) => c.check === 'greater_than')
      const to = checks.find((c) => c.check === 'less_than')
      const range = [from ? `${from.inclusive ? 'from' : 'above'} ${String(from.value)}` : '', to ? `${to.inclusive ? 'to' : 'below'} ${String(to.value)}` : ''].filter(Boolean).join(' ')
      return `${whole ? 'whole number' : 'number'}${range ? ` ${range}` : ''}`
    }
    case 'boolean':
      return 'true or false'
    case 'enum':
      return `one of ${Object.values(d.entries ?? {}).join(', ')}`
    case 'literal':
      return JSON.stringify(d.values?.[0])
    case 'array':
      return `list of ${shapeOf(d.element!, depth + 1, named, path)}`
    case 'tuple':
      return `[${(d.items ?? []).map((i) => shapeOf(i, depth + 1, named, path)).join(', ')}]`
    case 'record': {
      const key = d.keyType ? def(unwrap(d.keyType).s) : undefined
      const keys = key?.type === 'enum' ? Object.values(key.entries ?? {}).join(' | ') : 'names'
      return `a map of ${keys} to ${shapeOf(d.valueType!, depth + 1, named, path)}`
    }
    case 'union':
      return `(${(d.options ?? []).map((o) => shapeOf(o, depth + 1, named, path)).join(' or ')})`
    case 'object': {
      if (depth > 12) return 'a map'
      const fields = Object.entries(d.shape ?? {}).map(([name, field]) => `${name}${unwrap(field).optional ? '?' : ''}: ${shapeOf(field, depth + 1, named, path)}`)
      return `{ ${fields.join('; ')} }`
    }
    default:
      return d.type
  }
}

/**
 * The exact fields of what a step of building a world fills (M10.20), for the
 * chronicler: one line a field, written out whole with shapeOf. A kind the
 * contract does not know (the voice has a file of its own) is left out.
 */
export function stepFields(fills: readonly { kind: string; keys?: string[] }[]): string {
  const shape = (FileSchema as unknown as { shape: Record<string, Schema> }).shape
  const lines: string[] = []
  const named = new Map<string, string>()
  for (const fill of fills) {
    const top = shape[fill.kind]
    if (!top) continue
    let { s } = unwrap(top)
    const list = def(s).type === 'array'
    if (list) s = unwrap(def(s).element!).s
    const fields = def(s).shape ?? {}
    const names = (fill.keys ?? Object.keys(fields)).filter((name) => fields[name])
    if (!names.length) continue
    lines.push(`${fill.kind}${list ? ', each one' : ''}:`, ...names.map((name) => `  ${name}${unwrap(fields[name]!).optional ? '?' : ''}: ${shapeOf(fields[name]!, 1, named)}`), ...(FIELD_NOTES[fill.kind] ?? []).map((note) => `  Note: ${note}`))
  }
  if (!lines.length) return ''
  const shapes = [...named].map(([text, name]) => `${name}: ${text}`)
  return ['THE EXACT FIELDS OF WHAT THIS STEP FILLS (write these names and no others; "?" marks a field that may be left out):', ...lines, ...shapes].join('\n')
}

/** Whether a kind is a list of entities with ids, or one block. */
export function isList(key: string): boolean {
  const top = (FileSchema as unknown as { shape: Record<string, Schema> }).shape[key]
  return Boolean(top && def(unwrap(top).s).type === 'array')
}

const show = (value: unknown) => {
  const text = JSON.stringify(value)
  return text.length > 40 ? `${text.slice(0, 37)}...` : text
}

/** The whole contract as Markdown: docs/CONTENT.md. */
export function contractMarkdown(): string {
  const shape = (FileSchema as unknown as { shape: Record<string, Schema> }).shape
  const lines = [
    '# The content contract',
    '',
    'Everything a world can have, per kind, generated from the schemas in `src/engine` by `npm run content:contract` (M10.17). Do not edit by hand: a test fails when this file no longer matches the schemas.',
    '',
    'A world is a folder `content/<world>/` of YAML files. Each file holds one or more of the kinds below as top-level keys; the file names are a habit, not a rule. Whatever a world leaves out takes a neutral default, never the values of another world. Ids are keys and never change once committed (`ids.lock`).',
    '',
  ]
  const order = [...Object.keys(KINDS), ...Object.keys(shape).filter((k) => !(k in KINDS))]
  for (const key of order) {
    if (!shape[key]) continue
    const text = KINDS[key]
    lines.push(`## ${key}${text ? ` (${text.file})` : ''}`, '')
    if (text) lines.push(text.does, '', `When a world has none: ${text.missing}`, '')
    lines.push(isList(key) ? 'A list; each has:' : 'One block with:', '', '| field | what | required | default |', '| --- | --- | --- | --- |')
    for (const f of fieldsOf(key)) lines.push(`| ${f.name} | ${f.kind.replace(/\|/g, '\\|')} | ${f.required ? 'yes' : 'no'} | ${f.fallback === undefined ? '' : show(f.fallback).replace(/\|/g, '\\|')} |`)
    lines.push('', ...(FIELD_NOTES[key] ?? []).flatMap((note) => [note, '']))
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** How many a world has of a kind. */
function countOf(content: Content, key: string): number {
  const map: Record<string, unknown> = {
    world: content.world,
    areas: content.areas,
    locations: content.locations,
    professions: content.professions,
    npcs: content.npcs,
    items: content.items,
    object_types: content.objectTypes,
    topics: content.topics,
    news: content.news,
    patterns: content.patterns,
    quests: content.quests,
    regions: content.regions,
    rules: content.rules,
    voice: content.voice,
    journey: content.journey,
    passages: content.passages,
    returning: content.returning,
    gestures: content.gestures,
    lodgings: content.lodgings,
    factions: content.factions,
    realms: content.realms,
    tensions: content.tensions,
    plans: content.plans,
    watchers: content.watchers,
    aftermath: content.aftermath,
    intentions: content.intentions,
    verbs: content.verbTexts,
    creatures: content.creatures,
    encounters: content.encounters,
    settlements: content.settlements,
    resources: content.resources,
    routes: content.routes,
    outlands: content.outlands,
    newcomers: content.newcomers,
    projects: content.projects,
    crafts: content.crafts,
    props: content.props,
  }
  const value = map[key]
  if (value instanceof Map) return value.size
  if (Array.isArray(value)) return value.length
  return value ? 1 : 0
}

/** Per kind: whether the world has it, and how many. For the editor's contract tab. */
export function contractView(content: Content | undefined): { key: string; file: string; does: string; missing: string; count: number; list: boolean }[] {
  return Object.entries(KINDS).map(([key, text]) => ({ key, ...text, count: content ? countOf(content, key) : 0, list: isList(key) }))
}

/**
 * The contract in short for the writing aid (M10.17): per kind one line, what
 * it is for, what this world has and what is still empty.
 */
export function contractSummary(content: Content | undefined): string {
  return [
    'WHAT A WORLD CAN HAVE (the content contract; propose nothing outside it, and only fields it names):',
    ...contractView(content).map((k) => `- ${k.key} (${k.file}): ${k.does} ${k.count ? `This world has ${k.list ? k.count : 'it'}.` : `Empty now: ${k.missing}`}${(FIELD_NOTES[k.key] ?? []).map((note) => ` Note: ${note}`).join('')}`),
  ].join('\n')
}

/** Why the fields of an entity are not in the contract, or undefined: for the editor, with the fields a kind has. */
export function unknownFields(key: string, raw: Record<string, unknown>): string | undefined {
  const fields = fieldsOf(key)
  if (!fields.length) return undefined
  const known = new Set(fields.map((f) => f.name))
  const stray = Object.keys(raw).filter((k) => !known.has(k))
  return stray.length ? `${stray.map((s) => `"${s}"`).join(', ')} ${stray.length === 1 ? 'is' : 'are'} not in the contract; ${key} has: ${[...known].join(', ')}` : undefined
}
