import { economyOverview, type SettlementView } from './economy/ledger'
import { parseDocument, stringify } from 'yaml'
import { DEFAULT_PALETTE, MapPaletteSchema, SURFACE, TERRAIN_ORDER, type Level, type MapPalette } from './map/palette'
import { previewMapData, type HexMapData } from './map/view'
import { ContentError, loadContent, type Content, type ContentFile, type Direction } from './content'
import { regionPreview, sceneryWarnings, warnings } from './builder'
import { applyEdits, entities, entityYaml, ENTITY_KINDS, LISTS, locate, parseEntityYaml, patchWorld, voiceYaml, worldPrefix, type Edit, type EditResult, type EntityKind, type FileChange, type Raw } from './edit'
import { worldFrame } from './dialogue/prompt'
import { suspectText, worldText, type SuspectText } from './safety'
import type { LlmRequest } from './dialogue/llm'
import { voiceSummary } from './dialogue/voice'
import { contractSummary, contractView, fieldsOf, stepFields } from './contract'
import { WORLD_GUIDE, WORLD_STEPS } from './worldguide'
import { designPrompt } from './designlog'
import { VoiceSchema } from './dialogue/voiceSchema'

// What the editor shows of a world (M8, FO chapter 15), and the pieces of
// work it does besides plain edits: exits that are made both ways, a new
// world from nothing, a change shown as a diff, and the chronicler's
// proposals. Pure, like edit.ts: the desktop editor and the browser preview
// use the same functions.

export interface EditorEntry {
  id: string
  name: string
  /** What the list groups it under: the area of a place, the kind of a topic. */
  group: string
  file: string
}

export interface QuestSummary {
  id: string
  name: string
  solutions: number
  outcomes: number
  actions: number
  stages: number
}

export interface EditorView {
  world: { id: string; name: string; prefix: string }
  lists: Record<EntityKind, EditorEntry[]>
  quests: QuestSummary[]
  /** Errors: the world does not load while there are any. */
  problems: string[]
  /** Things that load but deserve a look. */
  warnings: string[]
  /** Things descriptions bring in with no detail to look at or handle (after the M10 playtest). */
  scenery: string[]
  /** Content text that reads like an instruction to the model (M10.19): a world may come from someone else. */
  suspect: SuspectText[]
  files: string[]
  /** Each region as the generator draws it from its zones, while the world loads. */
  maps: Record<string, string>
  /** The settlements with what they live on, their character and routes (M8.4). */
  economy: SettlementView[]
  /** Every place for the map (M9.1): where it lies in km, and its ways out. */
  places: MapPlace[]
  /** What a world can have, per kind, and whether this one has it (M10.17: the contract tab). */
  contract: ReturnType<typeof contractView>
  /** The keys world.yaml can have, and whether this world sets each; the rest take the neutral default. */
  worldKeys: { key: string; set: boolean }[]
}

/** A place on the editor's map: its own position, or near its area's when it has none. */
export interface MapPlace {
  id: string
  name: string
  area: string
  /** Its own position in km, when it has one. */
  pos?: [number, number]
  /** Where the map draws it. */
  at: [number, number]
  exits: { direction: string; to: string }[]
}

const WINDS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'] as const

/** The wind from one point to another on the map (its y runs south): the way an exit between them goes. */
export function exitTowards(from: readonly [number, number], to: readonly [number, number]): (typeof WINDS)[number] {
  const angle = (Math.atan2(to[0] - from[0], -(to[1] - from[1])) * 180) / Math.PI
  return WINDS[Math.round(((angle + 360) % 360) / 45) % 8]!
}

/** The places of a world for the map: those without a position of their own in a small ring round their area. */
export function mapPlaces(files: ContentFile[]): MapPlace[] {
  const areaPos = new Map(entities(files, 'area').map((a) => [a.id, a.raw['pos'] as [number, number] | undefined]))
  const ring = new Map<string, number>()
  const out: MapPlace[] = []
  for (const l of entities(files, 'location').sort((a, b) => a.id.localeCompare(b.id))) {
    const area = String(l.raw['area'] ?? '')
    const pos = Array.isArray(l.raw['pos']) ? (l.raw['pos'] as [number, number]) : undefined
    const centre = areaPos.get(area)
    let at = pos
    if (!at && centre) {
      const n = ring.get(area) ?? 0
      ring.set(area, n + 1)
      const r = 0.25 + 0.08 * Math.floor(n / 8)
      at = [Math.round((centre[0] + r * Math.cos((n * Math.PI) / 4)) * 100) / 100, Math.round((centre[1] + r * Math.sin((n * Math.PI) / 4)) * 100) / 100]
    }
    if (!at) continue
    const exits = Object.entries((l.raw['exits'] as Record<string, { to?: string }> | undefined) ?? {}).map(([direction, e]) => ({ direction, to: String(e?.to ?? '') }))
    out.push({ id: l.id, name: String(l.raw['name'] ?? l.id), area, ...(pos ? { pos } : {}), at, exits })
  }
  return out
}

export const KIND_NAMES: Record<EntityKind, string> = {
  location: 'Places',
  area: 'Areas',
  npc: 'People',
  topic: 'Lore and facts',
  quest: 'Quests',
  item: 'Things',
  object_type: 'Objects',
  profession: 'Trades',
  news: 'Rumours at the start',
  pattern: 'Story patterns',
  faction: 'Factions',
  realm: 'Realms',
  plan: 'Plans',
  watcher: 'Watchers',
  aftermath: 'Aftermath',
  intention: 'Intentions',
  verb: 'News of the verbs',
  creature: 'Creatures',
  encounter: 'Encounters',
  region: 'Regions',
  settlement: 'Settlements',
  route: 'Trade routes',
  outland: 'Beyond the map',
  resource: 'Ground',
  newcomer: 'Newcomers',
  project: 'Projects',
  craft: 'Crafts',
  prop: 'Props the chronicler may place',
  passage: 'Passages',
  gesture: 'Gestures',
  lodging: 'Lodgings',
  background: 'Backgrounds',
}

export function editorView(files: ContentFile[]): EditorView {
  let content: Content | undefined
  let problems: string[] = []
  try {
    content = loadContent(files)
  } catch (error) {
    problems = error instanceof ContentError ? error.problems : [String(error)]
  }
  const areaName = new Map(entities(files, 'area').map((a) => [a.id, String(a.raw['name'] ?? a.id)]))
  const placeArea = new Map(entities(files, 'location').map((l) => [l.id, String(l.raw['area'] ?? '')]))
  const lists = Object.fromEntries(
    ENTITY_KINDS.map((kind) => [
      kind,
      entities(files, kind)
        .map((e) => ({ id: e.id, name: nameOf(kind, e.raw), group: groupOf(kind, e.raw, areaName, placeArea), file: e.file }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)),
    ]),
  ) as Record<EntityKind, EditorEntry[]>
  const world = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  const def = (world ? (parseEntityYaml(world.text).raw?.['world'] as Raw | undefined) : undefined) ?? {}
  return {
    world: { id: String(def['id'] ?? ''), name: String(def['name'] ?? ''), prefix: worldPrefix(files) },
    lists,
    quests: entities(files, 'quest').map((q) => {
      const outcomes = (q.raw['outcomes'] as Raw[] | undefined) ?? []
      return {
        id: q.id,
        name: String(q.raw['name'] ?? q.id),
        solutions: outcomes.filter((o) => o['solution'] !== false).length,
        outcomes: outcomes.length,
        actions: ((q.raw['actions'] as unknown[] | undefined) ?? []).length,
        stages: ((q.raw['stages'] as unknown[] | undefined) ?? []).length,
      }
    }),
    problems,
    warnings: content ? warnings(content) : [],
    scenery: content ? sceneryWarnings(content) : [],
    suspect: content ? suspectText(content) : [],
    contract: contractView(content),
    worldKeys: fieldsOf('world').map((f) => ({ key: f.name, set: def[f.name] !== undefined })),
    economy: content ? economyOverview(content) : [],
    files: files.map((f) => f.path).sort(),
    maps: content ? Object.fromEntries([...content.regions.keys()].map((id) => [id, regionPreview(content, id) ?? ''])) : {},
    places: mapPlaces(files),
  }
}

function nameOf(kind: EntityKind, raw: Raw): string {
  if (kind === 'pattern') return String((raw['text'] as Raw | undefined)?.['title'] ?? raw['id'])
  if (kind === 'news') return String(raw['title'] ?? raw['id'])
  return String(raw['name'] ?? raw['id'])
}

function groupOf(kind: EntityKind, raw: Raw, areaName: Map<string, string>, placeArea: Map<string, string>): string {
  const area = (id: string) => areaName.get(id) ?? id
  switch (kind) {
    case 'location':
      return area(String(raw['area'] ?? ''))
    case 'npc':
      return area(placeArea.get(String(raw['home'] ?? '')) ?? '')
    case 'area':
    case 'topic':
    case 'quest':
    case 'pattern':
    case 'creature':
      return String(raw['kind'] ?? '')
    case 'item':
      return raw['weapon'] ? 'weapons' : raw['armour'] ? 'armour' : raw['food'] ? 'food and drink' : raw['remedy'] ? 'remedies' : 'things'
    default:
      return ''
  }
}

// ---------------------------------------------------------------- exits both ways

export const OPPOSITE: Record<Direction, Direction> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  northeast: 'southwest',
  southwest: 'northeast',
  northwest: 'southeast',
  southeast: 'northwest',
  up: 'down',
  down: 'up',
  in: 'out',
  out: 'in',
}

type Exits = Partial<Record<Direction, { to: string; minutes?: number }>>

/**
 * The edits, and what they need at the other end of their exits: a way back
 * to a place that gained an exit (the opposite direction, when it is free,
 * and unless the place is tagged one_way), none from a place that lost it,
 * and no exits left pointing at a place that is deleted. A place of the same
 * edits gets its way back too, written into its edit (M10.20: a new world's
 * places come in one proposal, and none of them existed yet); an exit the
 * designer wrote there is never changed.
 */
export function withReturnExits(files: ContentFile[], edits: Edit[]): Edit[] {
  const out: Edit[] = edits.map((e) => (e.kind === 'location' && e.data ? { ...e, data: structuredClone(e.data) } : e))
  const places = entities(files, 'location')
  const stored = new Map(places.map((l) => [l.id, l.raw]))
  const proposed = new Map(out.flatMap((e) => (e.kind === 'location' && e.data ? [[e.id, e.data] as const] : [])))
  const deleted = new Set(out.filter((e) => e.kind === 'location' && !e.data).map((e) => e.id))
  const own = (id: string) => proposed.has(id) || deleted.has(id)
  // Places outside the edits that change: a copy of each, once, so two exits to one place both keep their way back.
  const others = new Map<string, Raw>()
  const changed = new Set<string>()
  const place = (id: string): Raw | undefined => {
    if (proposed.has(id)) return proposed.get(id)
    if (deleted.has(id) || !stored.has(id)) return undefined
    if (!others.has(id)) others.set(id, structuredClone(stored.get(id)!))
    return others.get(id)
  }
  const setExits = (id: string, raw: Raw, exits: Exits) => {
    raw['exits'] = exits
    if (!proposed.has(id)) changed.add(id)
  }
  for (const edit of out) {
    if (edit.kind !== 'location') continue
    if (!edit.data) {
      for (const other of places) {
        if (own(other.id)) continue
        const raw = place(other.id)!
        const exits = { ...((raw['exits'] ?? {}) as Exits) }
        const gone = (Object.keys(exits) as Direction[]).filter((d) => exits[d]?.to === edit.id)
        if (!gone.length) continue
        for (const d of gone) delete exits[d]
        setExits(other.id, raw, exits)
      }
      continue
    }
    if (((edit.data['tags'] as string[] | undefined) ?? []).includes('one_way')) continue
    const id = edit.id
    const before = (stored.get(id)?.['exits'] ?? {}) as Exits
    const after = (edit.data['exits'] ?? {}) as Exits
    // An exit that went takes its way back along, unless the designer edits the other place as well.
    for (const [dir, exit] of Object.entries(before) as [Direction, { to: string }][]) {
      if (!exit || after[dir]?.to === exit.to || Object.values(after).some((e) => e?.to === exit.to) || own(exit.to)) continue
      const raw = place(exit.to)
      const theirs = { ...((raw?.['exits'] ?? {}) as Exits) }
      if (!raw || theirs[OPPOSITE[dir]]?.to !== id) continue
      delete theirs[OPPOSITE[dir]]
      setExits(exit.to, raw, theirs)
    }
    for (const [dir, exit] of Object.entries(after) as [Direction, { to: string; minutes?: number }][]) {
      if (!exit || exit.to === id) continue
      const raw = place(exit.to)
      if (!raw) continue
      const theirs = { ...((raw['exits'] ?? {}) as Exits) }
      const back = OPPOSITE[dir]
      if (Object.values(theirs).some((e) => e?.to === id) || theirs[back]) continue
      theirs[back] = exit.minutes && exit.minutes > 1 ? { to: id, minutes: exit.minutes } : { to: id }
      setExits(exit.to, raw, theirs)
    }
  }
  return [...out, ...[...changed].map((id) => ({ kind: 'location' as const, id, data: others.get(id)! }))]
}

// ---------------------------------------------------------------- a new world

/** The smallest world that loads: one area, one place, the start there, and the shared instruction. */
export function newWorldFiles(folder: string, name: string): ContentFile[] {
  const place = 'loc_first_place'
  return [
    {
      path: `${folder}/world.yaml`,
      text: stringify({
        world: {
          id: folder,
          name,
          start: { location: place, year: 1, month: 1, day: 1, hour: 8, minute: 0 },
          player: { money: 50, inventory: {} },
          words: { land: name, region: name, from: 'far away' },
          frame: `WORLD: ${name}. Describe the world, its money, its faith and its people here.\nREGION: where the story begins.\nPEOPLE speak plain English.\n`,
          intro: `You arrive in ${name}.\n\nType LOOK to look around. Type HELP if you are lost.\n`,
        },
      }),
    },
    { path: `${folder}/CHRONICLER.md`, text: `## This world: ${name}\n\n- Write here what the chronicler must keep to in this world: its tone, its names, its limits.\n` },
    { path: `${folder}/data/areas.yaml`, text: stringify({ areas: [{ id: 'first_area', name: 'The first area', kind: 'hamlet', summary: 'Where the story begins.' }] }) },
    { path: `${folder}/data/professions.yaml`, text: stringify({ professions: [{ id: 'villager', name: 'villager', schedule: [{ from: '07:00', to: '18:00', activity: 'work' }, { from: '18:00', to: '22:00', activity: 'home' }, { from: '22:00', to: '07:00', activity: 'sleep' }] }] }) },
    {
      path: `${folder}/areas/first_area/locations.yaml`,
      text: stringify({
        locations: [
          {
            id: place,
            name: 'The First Place',
            area: 'first_area',
            tags: ['public'],
            description: { day: 'You stand in the first place of a new world. The air smells of nothing yet. Everything else is still to be written.\n' },
          },
        ],
      }),
    },
  ]
}

// ---------------------------------------------------------------- a change as a diff

export interface DiffLine {
  kind: ' ' | '-' | '+' | '@'
  text: string
}

/** The lines that differ between two texts, with three lines around each change. */
export function lineDiff(before: string, after: string, context = 3): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }
  // The longest common subsequence of what is left, which is small: one entity or a few.
  const x = a.slice(start, endA)
  const y = b.slice(start, endB)
  const table = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) table[i]![j] = x[i] === y[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
  const middle: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      middle.push({ kind: ' ', text: x[i++]! })
      j++
    } else if (i < x.length && (j >= y.length || table[i + 1]![j]! >= table[i]![j + 1]!)) middle.push({ kind: '-', text: x[i++]! })
    else middle.push({ kind: '+', text: y[j++]! })
  }
  const lines: DiffLine[] = [...a.slice(Math.max(0, start - context), start).map((text) => ({ kind: ' ' as const, text })), ...middle, ...a.slice(endA, endA + context).map((text) => ({ kind: ' ' as const, text }))]
  const first = Math.max(0, start - context) + 1
  return [{ kind: '@', text: `@@ line ${first}` }, ...trimContext(lines, context)]
}

function trimContext(lines: DiffLine[], context: number): DiffLine[] {
  // Long unchanged stretches inside the change are cut to their edges.
  const out: DiffLine[] = []
  let run: DiffLine[] = []
  const flush = (last: boolean) => {
    if (run.length > context * 2 + 1 && !last && out.length) out.push(...run.slice(0, context), { kind: '@', text: '...' }, ...run.slice(-context))
    else out.push(...run)
    run = []
  }
  for (const line of lines) {
    if (line.kind === ' ') run.push(line)
    else {
      flush(false)
      out.push(line)
    }
  }
  flush(true)
  return out
}

// ---------------------------------------------------------------- sparring with the chronicler

export interface DraftChange {
  kind: EntityKind
  id: string
  /** The whole entity in YAML; empty to delete it. */
  yaml: string
  /**
   * Only the fields it sets, on a thing that exists (M10.20): each replaces
   * that field whole, the rest stays. The economy step of The Quiet Reach was
   * cut off writing out five places whole to give them a service and a bench.
   */
  merge?: boolean
}

export interface Draft {
  /** What the chronicler says about the proposal, or the question it asks back. */
  say: string
  questions: string[]
  changes: DraftChange[]
  /** Top-level keys of world.yaml to set, as YAML (M10.17); empty for none. */
  world?: string
  /** Whole files: only CHRONICLER.md and data/voice.yaml, next to world.yaml (M10.17). */
  files?: { path: string; text: string }[]
  /** The proposal as edits, checked against the world. */
  result?: EditResult
  problems: string[]
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'questions', 'changes'],
  properties: {
    say: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'id', 'yaml'],
        properties: { kind: { type: 'string', enum: ENTITY_KINDS }, id: { type: 'string' }, yaml: { type: 'string' }, merge: { type: 'boolean' } },
      },
    },
  },
}

/** The same with world.yaml keys and whole files (M10.17), for building a world step by step. */
const WORLD_STEP_SCHEMA = {
  ...DRAFT_SCHEMA,
  required: ['say', 'questions', 'changes', 'world', 'files'],
  properties: {
    ...DRAFT_SCHEMA.properties,
    world: { type: 'string' },
    files: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'text'], properties: { path: { type: 'string' }, text: { type: 'string' } } } },
  },
}

/** The files a proposal may write whole, next to world.yaml. */
const DRAFT_FILES = /^(?:CHRONICLER\.md|data\/voice\.yaml)$/

/**
 * A proposal as files (M10.17): the entities as edits, then the keys of
 * world.yaml, then whole files; checked by loading the world with all of it.
 */
export function draftResult(files: ContentFile[], draft: Pick<Draft, 'changes' | 'world' | 'files'>): EditResult {
  let next = files
  const problems: string[] = []
  const changes = new Map<string, FileChange>()
  // A file changed twice keeps what it was before the first change.
  const note = (change: FileChange) => {
    const had = changes.get(change.path)
    changes.set(change.path, had ? { path: change.path, text: change.text, ...(had.before !== undefined ? { before: had.before } : {}) } : change)
  }
  // The world first (M10.20): a proposal that moves the start to a new place and deletes the old one loads only with both.
  if (draft.world?.trim()) {
    const patched = patchWorld(next, draft.world)
    if (patched.problems.length) return { ok: false, problems: patched.problems, files, changes: [] }
    next = patched.files
    if (patched.change) note(patched.change)
  }
  // The builder adds the way back for every exit, as the world guide tells the chronicler.
  const edits = withReturnExits(next, draftEdits(draft, next))
  if (edits.length) {
    const applied = applyEdits(next, edits)
    for (const change of applied.changes) note(change)
    if (!applied.ok) return { ...applied, changes: [...changes.values()] }
    next = applied.files
  }
  const prefix = worldPrefix(files)
  for (const file of draft.files ?? []) {
    const path = file.path.replace(/^\/+/, '').replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
    if (!DRAFT_FILES.test(path)) {
      problems.push(`${file.path}: a proposal may write only CHRONICLER.md and data/voice.yaml whole; the rest goes in world or changes.`)
      continue
    }
    const full = `${prefix}${path}`
    const before = next.find((f) => f.path === full)
    if (before?.text === file.text) continue
    next = before ? next.map((f) => (f === before ? { ...f, text: file.text } : f)) : [...next, { path: full, text: file.text }]
    note({ path: full, ...(before ? { before: before.text } : {}), text: file.text })
  }
  if (problems.length) return { ok: false, problems, files: next, changes: [...changes.values()] }
  try {
    const content = loadContent(next)
    return { ok: true, problems: [], content, files: next, changes: [...changes.values()] }
  } catch (error) {
    return { ok: false, problems: error instanceof ContentError ? error.problems : [String(error)], files: next, changes: [...changes.values()] }
  }
}

/**
 * The request to the chronicler for a proposal (FO chapter 15, "Sparren met
 * de kroniekschrijver"): the working instruction, the world's frame, what
 * exists (ids and names), the entity in view in full, and the designer's words.
 */
export function draftRequest(files: ContentFile[], ask: string, focus?: { kind: EntityKind; id: string }): LlmRequest {
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const index = ENTITY_KINDS.map((kind) => {
    const list = entities(files, kind)
    return list.length ? `${LISTS[kind]}: ${list.map((e) => `${e.id} (${nameOf(kind, e.raw)})`).join(', ')}` : ''
  }).filter(Boolean)
  const shown = focus ? entities(files, focus.kind).find((e) => e.id === focus.id) : undefined
  return {
    role: 'chronicler',
    system: [
      instruction,
      '',
      content ? worldText(worldFrame(content)) : '',
      // The world's voice (M10.10): new content comes in the same voice.
      content ? voiceSummary(content) : '',
      '',
      // What a world can have (M10.17): the contract in short, with what this world has and what is still empty.
      contractSummary(content),
      '',
      // What the designer said and decided before (M10.18): not proposed again.
      designPrompt(files),
      '',
      'YOU ARE IN THE WORLD BUILDER. Answer the designer with a proposal: every entity to add or change in full YAML (one mapping with its id, as it would stand in its list), or an empty yaml to delete it. The builder shows it as a diff, checks it, and saves only what the designer accepts. Use only ids that exist or that you add in the same proposal. If a choice belongs to the designer, ask in questions and propose nothing for it. JSON only.',
    ].join('\n'),
    prompt: [`WHAT EXISTS:`, ...index, ...(shown ? ['', `IN VIEW (${focus!.kind} ${focus!.id}):`, stringify(shown.raw)] : []), '', `THE DESIGNER ASKS: ${ask}`].join('\n'),
    schemaName: 'builder_draft',
    schema: DRAFT_SCHEMA,
    maxTokens: 4000,
    meta: { ask, ...(focus ? { focus } : {}), ...(shown ? { focusRaw: shown.raw } : {}), prefix: worldPrefix(files) },
  }
}

/** Reads the chronicler's reply and checks the proposal against the world, without saving anything. */
export function readDraft(files: ContentFile[], text: string): Draft {
  const parts = draftParts(text)
  return parts ? checkedDraft(files, parts) : { say: '', questions: [], changes: [], problems: ['The chronicler did not answer in the agreed form.'] }
}

type DraftParts = Pick<Draft, 'say' | 'questions' | 'changes' | 'world' | 'files'>

/** What the chronicler answered, read but not yet checked; undefined when it is not the agreed JSON. */
function draftParts(text: string): DraftParts | undefined {
  let parsed: { say?: unknown; questions?: unknown; changes?: unknown; world?: unknown; files?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return undefined
  }
  const changes = (Array.isArray(parsed.changes) ? parsed.changes : [])
    .filter((c): c is DraftChange => Boolean(c) && typeof c === 'object' && ENTITY_KINDS.includes((c as DraftChange).kind) && typeof (c as DraftChange).id === 'string')
    .map((c) => ({ kind: c.kind, id: c.id, yaml: typeof c.yaml === 'string' ? c.yaml : '', ...(c.merge === true ? { merge: true } : {}) }))
  const world = typeof parsed.world === 'string' && parsed.world.trim() ? parsed.world : undefined
  const whole = (Array.isArray(parsed.files) ? parsed.files : []).filter((f): f is { path: string; text: string } => Boolean(f) && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string' && typeof (f as { text?: unknown }).text === 'string')
  return {
    say: typeof parsed.say === 'string' ? parsed.say : '',
    questions: Array.isArray(parsed.questions) ? parsed.questions.filter((q): q is string => typeof q === 'string') : [],
    changes,
    ...(world ? { world } : {}),
    ...(whole.length ? { files: whole } : {}),
  }
}

/** A proposal checked against the world: the YAML of each change read, then the whole loaded with it. */
function checkedDraft(files: ContentFile[], parts: DraftParts): Draft {
  const problems: string[] = []
  for (const change of parts.changes) {
    if (!change.yaml.trim()) continue
    const read = parseEntityYaml(change.yaml)
    if (!read.raw) problems.push(`${change.id}: ${read.problem}`)
  }
  const result = problems.length ? undefined : draftResult(files, parts)
  return { ...parts, ...(result ? { result } : {}), problems: [...problems, ...(result?.problems ?? [])] }
}

/**
 * The request to put right a proposal that did not load (M10.20; the real run
 * of The Quiet Reach, where a whole chapter of people failed on one wrong
 * reference, then on one line of YAML): the same step, the proposal as it
 * stands and why it did not load. The chronicler answers with only what it
 * corrects, which mergeFix puts into the proposal: cheaper than proposing the
 * chapter again, and the rest stays as the designer read it.
 */
export function worldFixRequest(files: ContentFile[], stepId: string, said: string, draft: Pick<Draft, 'changes' | 'world' | 'files'>, problems: string[]): LlmRequest {
  const base = worldStepRequest(files, stepId, said)
  const proposal = [
    'YOUR PROPOSAL AS IT STANDS:',
    ...draft.changes.map((c) => `--- ${c.kind} ${c.id}${c.merge ? ' (merge: only these fields)' : ''}\n${c.yaml.trim() || '(deleted)'}`),
    ...(draft.world?.trim() ? ['--- world', draft.world.trim()] : []),
    ...(draft.files ?? []).map((f) => `--- file ${f.path}: written whole, ${f.text.length} characters`),
  ]
  return {
    ...base,
    system: [
      base.system,
      '',
      'PUTTING IT RIGHT: your proposal for this step did not load. Correct only what the problems name, and change nothing else: no new ideas, no other wording. Answer in the same JSON: say (one sentence: what you corrected), questions (none), changes (only the entities you correct, each whole, as full YAML; leave out every entity no problem touches), world (whole again only if a problem is in it, otherwise empty), files (none, unless a problem is in one).',
    ].join('\n'),
    prompt: [base.prompt, '', ...proposal, '', 'WHY IT DID NOT LOAD:', ...problems.map((p) => `- ${p}`)].join('\n'),
    maxTokens: 12000,
    meta: { ...base.meta, fix: problems },
  }
}

/**
 * A proposal with the chronicler's corrections put in, checked again: a
 * change it corrects replaces the one of the same kind and id, a new one is
 * added, and world and files are replaced only where it gave them. What the
 * chronicler said and asked stays; what it corrected is added to the say.
 */
export function mergeFix(files: ContentFile[], draft: Pick<Draft, 'say' | 'questions' | 'changes' | 'world' | 'files'>, text: string): Draft {
  const fix = draftParts(text)
  const kept: DraftParts = { say: draft.say, questions: draft.questions, changes: draft.changes, ...(draft.world ? { world: draft.world } : {}), ...(draft.files ? { files: draft.files } : {}) }
  if (!fix) return { ...checkedDraft(files, kept), problems: ['The chronicler did not answer in the agreed form; the proposal is as it was.'] }
  const same = (a: DraftChange, b: DraftChange) => a.kind === b.kind && a.id === b.id
  const changes = [...draft.changes.map((c) => fix.changes.find((f) => same(f, c)) ?? c), ...fix.changes.filter((f) => !draft.changes.some((c) => same(c, f)))]
  const whole = [...(draft.files ?? []).map((f) => fix.files?.find((x) => x.path === f.path) ?? f), ...(fix.files ?? []).filter((x) => !(draft.files ?? []).some((f) => f.path === x.path))]
  const world = fix.world ?? draft.world
  return checkedDraft(files, {
    say: fix.say.trim() ? `${draft.say}\n\nPut right: ${fix.say.trim()}` : draft.say,
    questions: draft.questions,
    changes,
    ...(world ? { world } : {}),
    ...(whole.length ? { files: whole } : {}),
  })
}

/**
 * The request for one step of building a world with the designer (M10.17): the
 * world guide and the step's instruction, the contract in short, the world as
 * it is (its world.yaml whole, and what exists), and what the designer said.
 */
export function worldStepRequest(files: ContentFile[], stepId: string, said: string): LlmRequest {
  const step = WORLD_STEPS.find((s) => s.id === stepId) ?? WORLD_STEPS[0]!
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const worldFile = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  const index = ENTITY_KINDS.map((kind) => {
    const list = entities(files, kind)
    return list.length ? `${LISTS[kind]}: ${list.map((e) => `${e.id} (${nameOf(kind, e.raw)})`).join(', ')}` : ''
  }).filter(Boolean)
  const order = WORLD_STEPS.map((s, i) => `${i + 1}. ${s.title}${s.id === step.id ? ' (NOW)' : ''}`).join(' ')
  const standing = stepEntities(files, step.fills)
  return {
    role: 'chronicler',
    system: [
      WORLD_GUIDE,
      '',
      `THE STEPS: ${order}`,
      step.prompt,
      `ASK THE DESIGNER, if they have not said: ${step.ask.join(' ')}`,
      `CHECK BEFORE YOU PROPOSE: ${step.checks.join(' ')}`,
      `IF THE DESIGNER SKIPS THIS STEP: ${step.skipped}`,
      '',
      contractSummary(content),
      '',
      stepFields(step.fills),
      '',
      designPrompt(files),
      '',
      instruction,
      'Answer in JSON: say, questions, changes (a new thing as full YAML; to add to or change a thing that exists, merge: true with only the fields you set, each of which replaces that field whole, so give a list whole; empty YAML without merge deletes), world (YAML of the top-level world.yaml keys to set, or empty), files (CHRONICLER.md or data/voice.yaml whole, or none).',
    ].join('\n'),
    prompt: [`WORLD.YAML NOW:`, worldFile?.text ?? '(none)', '', 'WHAT EXISTS:', ...index, ...(standing ? ['', standing] : []), '', `THE DESIGNER SAYS: ${said}`].join('\n'),
    schemaName: 'world_step',
    schema: WORLD_STEP_SCHEMA,
    // A whole chapter answered in YAML (M10.20: Bram's People chapter holds eight people, their factions and the law;
    // his Places chapter ran past 12,000 tokens in the real app). The gateway allows it ten minutes.
    maxTokens: 48000,
    timeoutMs: 600000,
    meta: { step: step.id, ask: said, prefix: worldPrefix(files), world: worldFacts(files) },
  }
}

/**
 * What a step may change, as it stands (M10.20; the real run of The Quiet
 * Reach, where the economy step could not give the places made in the places
 * step their services and benches, because a change sends a thing whole and
 * the chronicler saw only ids): the YAML of every thing of the kinds the step
 * fills that the world already has. Past a limit, the rest by id only.
 */
export function stepEntities(files: ContentFile[], fills: readonly { kind: string }[], limit = 120_000): string {
  const kinds = ENTITY_KINDS.filter((kind) => fills.some((f) => f.kind === LISTS[kind]))
  const blocks: string[] = []
  const left: string[] = []
  let size = 0
  for (const kind of kinds) {
    for (const e of entities(files, kind)) {
      const yaml = entityYaml(files, kind, e.id)
      if (!yaml) continue
      if (size + yaml.length > limit) {
        left.push(`${kind} ${e.id}`)
        continue
      }
      size += yaml.length
      blocks.push(`--- ${kind} ${e.id}\n${yaml.trimEnd()}`)
    }
  }
  if (!blocks.length && !left.length) return ''
  return [
    'WHAT THIS STEP MAY CHANGE, AS IT STANDS (to add to one of these, send merge: true with only the fields you set, a list whole; or send it whole with every field and word you do not change kept as it is):',
    ...blocks,
    ...(left.length ? [`Too long to show here, by id only: ${left.join(', ')}.`] : []),
  ].join('\n')
}

const ENHANCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['brief', 'open'],
  properties: {
    brief: { type: 'string' },
    open: { type: 'array', items: { type: 'string' } },
  },
}

/** What Enhance with AI gives back: the designer's answer written out, and what only the designer can decide. */
export interface Enhanced {
  brief: string
  open: string[]
  problems: string[]
}

/**
 * Enhance with AI (after M10.17; Bram, 28 September 2026): the chronicler
 * takes the designer's short answer to a step and writes it out as a fuller
 * brief, in plain text, before anything is proposed. It keeps every choice
 * the designer made, fills each question of the step they left open with a
 * marked suggestion, and says what only the designer can decide. The brief
 * goes back into the answer box to be changed at will; Propose then has
 * enough to go on. Nothing is saved, and no content is made.
 */
export function enhanceRequest(files: ContentFile[], stepId: string, said: string): LlmRequest {
  const step = WORLD_STEPS.find((s) => s.id === stepId) ?? WORLD_STEPS[0]!
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const worldFile = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  const index = ENTITY_KINDS.map((kind) => {
    const list = entities(files, kind)
    return list.length ? `${LISTS[kind]}: ${list.map((e) => `${e.id} (${nameOf(kind, e.raw)})`).join(', ')}` : ''
  }).filter(Boolean)
  return {
    role: 'chronicler',
    system: [
      'YOU HELP THE DESIGNER WRITE THEIR ANSWER FOR ONE STEP OF BUILDING A WORLD. You do not propose content yet: you write out what they said as a fuller brief, so that the proposal after it has enough to go on.',
      '- Keep every choice the designer made, in meaning and in their names. Do not overrule them.',
      '- For each question of the step they did not answer, add one concrete suggestion that fits the frame and what the world already has, marked "(suggestion)". Invent names only as suggestions.',
      '- Write plain English with British spelling, in short lines or a few short paragraphs; no YAML, no ids. At most 250 words.',
      '- Keep to the hard limits: nothing sexual involving minors, no hate against real groups, romance non-explicit.',
      '- In `open`, list up to three things only the designer can decide.',
      '',
      `THE STEP: ${step.title}. ${step.prompt}`,
      `ITS QUESTIONS: ${step.ask.join(' ')}`,
      `IF IT IS SKIPPED: ${step.skipped}`,
      '',
      contractSummary(content),
      '',
      designPrompt(files),
      '',
      instruction,
      'Answer in JSON: brief (the fuller answer, plain text), open (what only the designer can decide).',
    ].join('\n'),
    prompt: [`WORLD.YAML NOW:`, worldFile?.text ?? '(none)', '', 'WHAT EXISTS:', ...index, '', `THE DESIGNER WROTE: ${said}`].join('\n'),
    schemaName: 'world_enhance',
    schema: ENHANCE_SCHEMA,
    maxTokens: 1200,
    meta: { step: step.id, ask: said, asks: step.ask, prefix: worldPrefix(files) },
  }
}

/** Reads the chronicler's brief; a reply out of form is a problem, never a crash. */
export function readEnhance(text: string): Enhanced {
  try {
    const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { brief?: unknown; open?: unknown }
    const brief = typeof parsed.brief === 'string' ? parsed.brief.trim() : ''
    const open = Array.isArray(parsed.open) ? parsed.open.filter((q): q is string => typeof q === 'string' && q.trim() !== '').slice(0, 3) : []
    return brief ? { brief, open, problems: [] } : { brief: '', open, problems: ['The chronicler gave no brief back.'] }
  } catch {
    return { brief: '', open: [], problems: ['The chronicler did not answer in the agreed form.'] }
  }
}

/** What a world has, by id, for the mock chronicler to build on (M10.20): its name, its start, and the ids per kind. */
function worldFacts(files: ContentFile[]): { name: string; start: string; startRaw?: Raw; ids: Record<string, string[]> } {
  const content = safeLoad(files)
  const ids = Object.fromEntries((['area', 'location', 'npc', 'profession', 'item', 'object_type', 'faction'] as const).map((kind) => [kind, entities(files, kind).map((e) => e.id)]))
  const start = content?.world.start.location ?? ''
  const startRaw = entities(files, 'location').find((e) => e.id === start)?.raw
  return { name: content?.world.name ?? '', start, ...(startRaw ? { startRaw } : {}), ids }
}

/** The edits a draft stands for, to save when the designer accepts it. */
export function draftEdits(draft: Pick<Draft, 'changes'>, files: ContentFile[] = []): Edit[] {
  return draft.changes.flatMap((c): Edit[] => {
    const raw = c.yaml.trim() ? parseEntityYaml(c.yaml).raw : undefined
    // A merge sets fields and never deletes: without fields it changes nothing.
    if (!raw) return c.merge ? [] : [{ kind: c.kind, id: c.id }]
    const base = c.merge ? locate(files, c.kind, c.id)?.raw : undefined
    return [{ kind: c.kind, id: c.id, data: { ...(base ?? {}), ...raw, id: c.id } }]
  })
}

function safeLoad(files: ContentFile[]): Content | undefined {
  try {
    return loadContent(files)
  } catch {
    return undefined
  }
}


// ---------------------------------------------------------------- the palette (M10)

/** A world's map as the editor shows it: its palette (or the default), its levels, and a map to try it on. */
export interface PaletteView {
  palette: MapPalette
  /** Whether the world has a palette of its own in world.yaml. */
  own: boolean
  levels: Level[]
  preview?: HexMapData
}

function worldFileOf(files: ContentFile[]): ContentFile | undefined {
  return files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
}

export function paletteView(files: ContentFile[], palette?: MapPalette): PaletteView {
  const content = safeLoad(files)
  const own = content?.world.map?.palette
  const shown = palette ?? own ?? DEFAULT_PALETTE
  return { palette: shown, own: Boolean(own), levels: content?.world.map?.levels ?? [{ id: SURFACE, name: 'ground level' }], ...(content ? { preview: previewMapData(content, shown) } : {}) }
}

/**
 * Writes a palette into world.yaml (M10): under world.map.palette, the rest of
 * the file as it was, comments and all. Checked by loading the world with it.
 */
export function savePalette(files: ContentFile[], palette: MapPalette): { ok: boolean; problems: string[]; changes: { path: string; before?: string; text: string }[] } {
  const parsed = MapPaletteSchema.safeParse(palette)
  if (!parsed.success) return { ok: false, problems: parsed.error.issues.map((i) => `palette ${i.path.join('.')}: ${i.message}`), changes: [] }
  const file = worldFileOf(files)
  if (!file) return { ok: false, problems: ['This world has no world.yaml.'], changes: [] }
  const doc = parseDocument(file.text)
  doc.setIn(['world', 'map', 'palette'], doc.createNode(parsed.data))
  const text = doc.toString({ lineWidth: 0 })
  const next = files.map((f) => (f === file ? { ...f, text } : f))
  try {
    loadContent(next)
  } catch (error) {
    return { ok: false, problems: error instanceof ContentError ? error.problems : [String(error)], changes: [] }
  }
  return { ok: true, problems: [], changes: [{ path: file.path, before: file.text, text }] }
}

const HEX = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }
const TINTS = { type: 'array', items: HEX, minItems: 1, maxItems: 4 }
const STYLE = {
  type: 'object',
  additionalProperties: false,
  required: ['ground', 'unknown', 'label', 'label_shadow', 'terrain', 'ways', 'glyph'],
  properties: {
    ground: HEX,
    unknown: HEX,
    label: HEX,
    label_shadow: HEX,
    terrain: { type: 'object', additionalProperties: TINTS },
    ways: { type: 'object', additionalProperties: false, required: ['road', 'path', 'canal'], properties: { road: HEX, path: HEX, canal: HEX } },
    glyph: { type: 'object', additionalProperties: false, required: ['pool', 'peat_pit', 'peat_edge', 'willow', 'ruin', 'hummock', 'stairs'], properties: Object.fromEntries(['pool', 'peat_pit', 'peat_edge', 'willow', 'ruin', 'hummock', 'stairs'].map((k) => [k, HEX])) },
  },
}
const PALETTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'palette'],
  properties: { say: { type: 'string' }, palette: { type: 'object', additionalProperties: false, required: ['names', 'dark', 'paper'], properties: { names: { type: 'object', additionalProperties: { type: 'string' } }, dark: STYLE, paper: STYLE } } },
}

/**
 * The writing aid proposes a palette on request (M10): from the frame of the
 * world (world.yaml and CHRONICLER.md), muted, three or four tints a terrain,
 * for the dark style and for paper, with this world's names for the terrains.
 */
export function paletteRequest(files: ContentFile[], ask: string): LlmRequest {
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const current = content?.world.map?.palette ?? DEFAULT_PALETTE
  const terrains = [...new Set([...Object.keys(current.dark.terrain), ...TERRAIN_ORDER])]
  return {
    role: 'chronicler',
    system: [
      instruction,
      '',
      content ? worldText(worldFrame(content)) : '',
      '',
      'YOU ARE IN THE WORLD BUILDER, AT THE MAP PALETTE. Propose colours for the map of this world that fit its frame: muted, in the spirit of Dwarf Fortress and Brogue, three or four close tints for every terrain (the seed of each hex picks one), boggy ground darker, dry ground lighter, water in two tones (open water and channel), ways in warm parchment. One set for the dark style and one for paper; black and white is made from paper. Give the legend names of the terrains as this world would say them. Colours as #rrggbb. JSON only.',
    ].join('\n'),
    prompt: [`THE PALETTE NOW:`, JSON.stringify(current), '', `TERRAINS: ${terrains.join(', ')}`, '', `THE DESIGNER ASKS: ${ask || 'a palette that fits this world'}`].join('\n'),
    schemaName: 'palette_draft',
    schema: PALETTE_SCHEMA,
    maxTokens: 3000,
    meta: { palette: current, ask },
  }
}

/** Reads a proposed palette, checked against the schema: nothing is saved until the designer does. */
export function readPalette(text: string): { say: string; palette?: MapPalette; problems: string[] } {
  let parsed: { say?: unknown; palette?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return { say: '', problems: ['The writing aid did not answer in the agreed form.'] }
  }
  const palette = MapPaletteSchema.safeParse(parsed.palette)
  return { say: typeof parsed.say === 'string' ? parsed.say : '', ...(palette.success ? { palette: palette.data } : {}), problems: palette.success ? [] : palette.error.issues.slice(0, 5).map((i) => `palette ${i.path.join('.')}: ${i.message}`) }
}

// ---------------------------------------------------------------- the voice kit (M10.10)

const VOICE_SCHEMA = { type: 'object', additionalProperties: false, required: ['say', 'yaml'], properties: { say: { type: 'string' }, yaml: { type: 'string' } } }

/**
 * The writing aid proposes a voice kit on request (M10.10): from the world's
 * frame and CHRONICLER.md, in the kit's own YAML (what stands under `voice:`).
 * Rare sayings, plain speech: character shows in what people care about, not
 * in a trick of proverbs.
 */
export function voiceRequest(files: ContentFile[], ask: string): LlmRequest {
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const now = voiceYaml(files).yaml
  const faiths = content?.world.faiths.map((f) => `${f.id} (${f.name})`).join(', ') ?? ''
  const areas = content ? [...content.areas.values()].map((a) => `${a.id} (${a.name}, ${a.kind})`).join(', ') : ''
  const trades = content ? [...content.professions.keys()].join(', ') : ''
  return {
    role: 'chronicler',
    system: [
      instruction,
      '',
      content ? worldText(worldFrame(content)) : '',
      '',
      'YOU ARE IN THE WORLD BUILDER, AT THE VOICE KIT. Propose how people in this world speak, as YAML with these keys: oaths (per faith id, two or three each), sayings (three or four of the whole region), groups (id, name, areas, professions, two or three sayings each), default_group, address (stranger, known, friend, high; "she/he/they" forms allowed), time, distance, measures, and not_here (word, and instead when people here have a word for it; weekdays and months of our world with this world\'s own). Sayings are rare in play: make them few and good. JSON only, with the YAML as a string.',
    ].join('\n'),
    prompt: [`FAITHS: ${faiths}`, `AREAS: ${areas}`, `TRADES: ${trades}`, '', 'THE KIT NOW:', now || '(none yet)', '', `THE DESIGNER ASKS: ${ask || 'a voice kit that fits this world'}`].join('\n'),
    schemaName: 'voice_draft',
    schema: VOICE_SCHEMA,
    maxTokens: 3000,
    meta: { voice: now, faiths: content?.world.faiths.map((f) => f.id) ?? [], ask },
  }
}

/** Reads a proposed voice kit, checked against the schema: nothing is saved until the designer does. */
export function readVoice(text: string): { say: string; yaml?: string; problems: string[] } {
  let parsed: { say?: unknown; yaml?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return { say: '', problems: ['The writing aid did not answer in the agreed form.'] }
  }
  const yaml = typeof parsed.yaml === 'string' ? parsed.yaml : ''
  const raw = parseEntityYaml(yaml).raw
  const kit = raw ? VoiceSchema.safeParse(raw) : undefined
  return { say: typeof parsed.say === 'string' ? parsed.say : '', ...(kit?.success ? { yaml } : {}), problems: kit?.success ? [] : kit ? kit.error.issues.slice(0, 5).map((i) => `voice ${i.path.join('.')}: ${i.message}`) : ['The proposal is no YAML.'] }
}
