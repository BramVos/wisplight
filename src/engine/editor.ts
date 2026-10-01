import { mapDraft } from './map/regiondraft'
import { paintFixRequest, paintRequest, readPaint } from './map/paint'
import { economyOverview, type SettlementView } from './economy/ledger'
import { parseDocument, stringify } from 'yaml'
import { DEFAULT_PALETTE, LANDS, MapPaletteSchema, MAX_SIGNS, SIGN_SHAPES, signsOf, SURFACE, TERRAIN_ORDER, type Level, type MapPalette } from './map/palette'
import { previewMapData, type HexMapData } from './map/view'
import { ContentError, loadContent, type Content, type ContentFile, type Direction } from './content'
import { descriptionCheck, directionProblems, placeMeasures, regionPreview, sceneryWarnings, warnings } from './builder'
import { applyEdits, entities, entityYaml, ENTITY_KINDS, landHome, landOfFile, landsIn, landYaml, LISTS, locate, parseEntityYaml, patchLand, patchRules, patchWorld, voiceYaml, worldPrefix, type Edit, type EditResult, type EntityKind, type FileChange, type Raw } from './edit'
import { worldFrame } from './dialogue/prompt'
import { frameOf } from './lands'
import { worldFrames } from './frames'
import { worldFixedPart } from './worldfixed'
import { suspectText, worldText, type SuspectText } from './safety'
import { cachedSystem, type LlmRequest } from './dialogue/llm'
import { voiceSummary } from './dialogue/voice'
import { contractState, contractSummary, contractView, fieldsOf, requiredFields, stepFields } from './contract'
import { LAND_NOTES, LAND_STEPS, landFills, landGuide, PLACE_RULES, REGION_STEPS, regionFills, regionGuide, STEP_CALLS, stepMaxTokens, WORLD_GUIDE, WORLD_STEPS } from './worldguide'
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
  /** The world's knobs as world.yaml sets them (M10.20). */
  knobs: Record<string, number | Record<string, number>>
  lists: Record<EntityKind, EditorEntry[]>
  quests: QuestSummary[]
  /** Errors: the world does not load while there are any. */
  problems: string[]
  /** Things that load but deserve a look. */
  warnings: string[]
  /** Things descriptions bring in with no detail to look at or handle (after the M10 playtest). */
  scenery: string[]
  /** The descriptions against the place rules (M10.20): a summary, and the places worth a look. */
  descriptions: { summary: string; places: string[] }
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
  /** The frames the world sets (M10.24): its lands and how they know each other, and its great lines. */
  frames: ReturnType<typeof worldFrames>
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
  tide: 'Great lines',
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
  patron: 'Patrons',
  condition: 'Conditions',
  ancestry: 'Ancestries',
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
    knobs: (def['knobs'] as Record<string, number | Record<string, number>> | undefined) ?? {},
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
    descriptions: content ? descriptionCheck(content) : { summary: '', places: [] },
    suspect: content ? suspectText(content) : [],
    contract: contractView(content),
    worldKeys: fieldsOf('world').map((f) => ({ key: f.name, set: def[f.name] !== undefined })),
    economy: content ? economyOverview(content) : [],
    files: files.map((f) => f.path).sort(),
    maps: content ? Object.fromEntries([...content.regions.keys()].map((id) => [id, regionPreview(content, id) ?? ''])) : {},
    places: mapPlaces(files),
    frames: content ? worldFrames(content) : { lands: [], lines: [] },
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
  /** Top-level keys of the rules to set, as YAML (M10.20: rules.death, a block); empty for none. */
  rules?: string
  /** Whole files: only CHRONICLER.md, data/voice.yaml and data/journey.yaml, next to world.yaml (M10.17, M10.20). */
  files?: { path: string; text: string }[]
  /** The land whose build it is (M10.23): `world` then sets its land.yaml, and what is new goes in its folder. */
  land?: string
  /** A region built in play (M10.25): everything new goes into this one file. */
  into?: string
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
  required: ['say', 'questions', 'changes', 'world', 'rules', 'files'],
  properties: {
    ...DRAFT_SCHEMA.properties,
    world: { type: 'string' },
    rules: { type: 'string' },
    files: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['path', 'text'], properties: { path: { type: 'string' }, text: { type: 'string' } } } },
  },
}

/** The files a proposal may write whole, next to world.yaml. */
// The journey too (M10.20): the transport step fills it, and in The Quiet Reach it had no way to send it.
const DRAFT_FILES = /^(?:CHRONICLER\.md|data\/voice\.yaml|data\/journey\.yaml|lands\/[a-z0-9_]+\/(?:land|voice)\.yaml)$/

/**
 * A whole data file with its top-level key put back when the proposal left it
 * out (M10.20: the voice step on a lighter model wrote the voice kit's fields
 * at the root of data/voice.yaml, and a round to put it right did the same).
 * Only when every key at the root is a field of that file's kind.
 */
export function rootedFile(path: string, text: string): string {
  // A land's voice kit and land.yaml too (M10.23).
  const found = /^(?:data\/(voice|journey)|lands\/[a-z0-9_]+\/(voice|land))\.yaml$/.exec(path)
  const root = found?.[1] ?? found?.[2]
  if (!root) return text
  const doc = parseDocument(text)
  const data = doc.errors.length ? undefined : (doc.toJS() as unknown)
  if (!data || typeof data !== 'object' || Array.isArray(data) || root in data) return text
  const fields = new Set(fieldsOf(root).map((f) => f.name))
  const keys = Object.keys(data)
  return keys.length && keys.every((k) => fields.has(k)) ? stringify({ [root]: data }, { lineWidth: 0 }) : text
}

/**
 * A proposal as files (M10.17): the entities as edits, then the keys of
 * world.yaml, then whole files; checked by loading the world with all of it.
 */
export function draftResult(files: ContentFile[], draft: Pick<Draft, 'changes' | 'world' | 'rules' | 'files' | 'land' | 'into'>): EditResult {
  let next = files
  const problems: string[] = []
  const changes = new Map<string, FileChange>()
  // A file changed twice keeps what it was before the first change.
  const note = (change: FileChange) => {
    const had = changes.get(change.path)
    changes.set(change.path, had ? { path: change.path, text: change.text, ...(had.before !== undefined ? { before: had.before } : {}) } : change)
  }
  // The world first (M10.20): a proposal that moves the start to a new place and deletes the old one loads only with both.
  const land = draft.land
  if (draft.world?.trim()) {
    // A land's build sets the land's own keys (M10.23), never the world's.
    const patched = land ? patchLand(next, land, draft.world) : patchWorld(next, draft.world)
    if (patched.problems.length) return { ok: false, problems: patched.problems, files, changes: [] }
    next = patched.files
    if (patched.change) note(patched.change)
  }
  // Keys of the rules (M10.20): death is a block, the lists come as changes.
  if (draft.rules?.trim()) {
    const patched = patchRules(next, draft.rules)
    if (patched.problems.length) return { ok: false, problems: patched.problems, files, changes: [] }
    next = patched.files
    if (patched.change) note(patched.change)
  }
  const prefix = worldPrefix(files)
  const given = (file: { path: string }) => file.path.replace(/^\/+/, '').replace(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
  // In a land's build the voice kit is the land's: the world's is not this build's to change.
  const pathOf = (file: { path: string }) => (land && given(file) === 'data/voice.yaml' ? `lands/${land}/voice.yaml` : given(file))
  // A new land's own files first (M10.23): the areas, the reach and the rest may name it.
  const landFirst = (file: { path: string }) => /^lands\//.test(pathOf(file))
  const whole = [...(draft.files ?? []).filter(landFirst), ...(draft.files ?? []).filter((f) => !landFirst(f))]
  const put = (file: { path: string; text: string }) => {
    const path = pathOf(file)
    const full = `${prefix}${path}`
    const text = rootedFile(path, file.text)
    const before = next.find((f) => f.path === full)
    if (before?.text === text) return
    next = before ? next.map((f) => (f === before ? { ...f, text } : f)) : [...next, { path: full, text }]
    note({ path: full, ...(before ? { before: before.text } : {}), text })
  }
  for (const file of whole.filter(landFirst)) if (DRAFT_FILES.test(pathOf(file))) put(file)
  // The builder adds the way back for every exit, as the world guide tells the chronicler.
  const edits = withReturnExits(next, draftEdits(draft, next)).map((edit) => {
    // What a land's build makes goes in the land's folder (M10.23).
    const fresh = edit.data && !edit.file && !locate(next, edit.kind, edit.id)
    // A region built in play (M10.25): what is new goes into its own file, but the lists of the rules stay where the rules are.
    const file = fresh && draft.into && !LISTS[edit.kind].startsWith('rules.') ? draft.into : land && fresh ? landHome(next, land, edit.kind, edit.data!) : undefined
    return file ? { ...edit, file } : edit
  })
  if (edits.length) {
    const applied = applyEdits(next, edits)
    for (const change of applied.changes) note(change)
    if (!applied.ok) return { ...applied, changes: [...changes.values()] }
    next = applied.files
  }
  for (const file of whole.filter((f) => !landFirst(f) || !DRAFT_FILES.test(pathOf(f)))) {
    if (!DRAFT_FILES.test(pathOf(file))) {
      problems.push(`${file.path}: a proposal may write only CHRONICLER.md, data/voice.yaml, data/journey.yaml and a land's lands/<id>/land.yaml and voice.yaml whole; the rest goes in world or changes.`)
      continue
    }
    put(file)
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
    // The world and the task first, cached from one request to the next (M10.26); what it has and what the designer
    // decided change as the world grows, so they come after the mark. Kept an hour (M10.27): a designer asks the writing
    // aid again after minutes of reading, and the part before the mark is most of the call.
    cacheHour: true,
    ...cachedSystem(
      [
        instruction,
        '',
        content ? worldText(worldFrame(content)) : '',
        // The world's voice (M10.10): new content comes in the same voice.
        content ? voiceSummary(content) : '',
        '',
        'YOU ARE IN THE WORLD BUILDER. Answer the designer with a proposal: every entity to add or change in full YAML (one mapping with its id, as it would stand in its list), or an empty yaml to delete it. The builder shows it as a diff, checks it, and saves only what the designer accepts. Use only ids that exist or that you add in the same proposal, and only in fields that point at something: a name, a maker, a description or a line the player reads is words, never an id (M10.29). If a choice belongs to the designer, ask in questions and propose nothing for it. JSON only.',
      ].join('\n'),
      '',
      [
        // What a world can have (M10.17): the contract in short, with what this world has and what is still empty.
        contractSummary(content),
        '',
        // What the designer said and decided before (M10.18): not proposed again.
        designPrompt(files),
      ].join('\n'),
    ),
    prompt: [`WHAT EXISTS:`, ...index, ...(shown ? ['', `IN VIEW (${focus!.kind} ${focus!.id}):`, stringify(shown.raw)] : []), '', `THE DESIGNER ASKS: ${ask}`].join('\n'),
    schemaName: 'builder_draft',
    schema: DRAFT_SCHEMA,
    maxTokens: 4000,
    meta: { ask, ...(focus ? { focus } : {}), ...(shown ? { focusRaw: shown.raw } : {}), prefix: worldPrefix(files) },
  }
}

/** Reads the chronicler's reply and checks the proposal against the world, without saving anything. */
export function readDraft(files: ContentFile[], text: string, land?: string): Draft {
  const parts = draftParts(text)
  return parts ? checkedDraft(files, { ...parts, ...(land ? { land } : {}) }) : { say: '', questions: [], changes: [], ...(land ? { land } : {}), problems: ['The chronicler did not answer in the agreed form.'] }
}

type DraftParts = Pick<Draft, 'say' | 'questions' | 'changes' | 'world' | 'rules' | 'files' | 'land' | 'into'>

/** What the chronicler answered, read but not yet checked; undefined when it is not the agreed JSON. */
function draftParts(text: string): DraftParts | undefined {
  let parsed: { say?: unknown; questions?: unknown; changes?: unknown; world?: unknown; rules?: unknown; files?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return undefined
  }
  const changes = (Array.isArray(parsed.changes) ? parsed.changes : [])
    .filter((c): c is DraftChange => Boolean(c) && typeof c === 'object' && ENTITY_KINDS.includes((c as DraftChange).kind) && typeof (c as DraftChange).id === 'string')
    .map((c) => ({ kind: c.kind, id: c.id, yaml: typeof c.yaml === 'string' ? c.yaml : '', ...(c.merge === true ? { merge: true } : {}) }))
  const world = typeof parsed.world === 'string' && parsed.world.trim() ? parsed.world : undefined
  const rules = typeof parsed.rules === 'string' && parsed.rules.trim() ? parsed.rules : undefined
  const whole = (Array.isArray(parsed.files) ? parsed.files : []).filter((f): f is { path: string; text: string } => Boolean(f) && typeof f === 'object' && typeof (f as { path?: unknown }).path === 'string' && typeof (f as { text?: unknown }).text === 'string')
  return {
    say: typeof parsed.say === 'string' ? parsed.say : '',
    questions: Array.isArray(parsed.questions) ? parsed.questions.filter((q): q is string => typeof q === 'string') : [],
    changes,
    ...(world ? { world } : {}),
    ...(rules ? { rules } : {}),
    ...(whole.length ? { files: whole } : {}),
  }
}

/**
 * A kept proposal checked again against the world as it is now (M10.20): the
 * world may have changed since it was made, by another step or a new version
 * of the app, so what it says and whether it loads are worked out afresh.
 */
export function recheckDraft(files: ContentFile[], parts: DraftParts): Draft {
  return checkedDraft(files, parts)
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
  // Ways that do not fit one plan, and one settlement cut in two (M10.33 L), go back with the proposal like a problem
  // that keeps it from loading: the Quiet Reach's station was built so, and only Check said it, afterwards.
  const places = new Set(parts.changes.filter((c) => c.kind === 'location').map((c) => c.id))
  const crooked = result?.ok && result.content && places.size ? directionProblems(result.content, places) : []
  return { ...parts, ...(result ? { result } : {}), problems: [...problems, ...(result?.problems ?? []), ...crooked] }
}

/**
 * The request to put right a proposal that did not load (M10.20; the real run
 * of The Quiet Reach, where a whole chapter of people failed on one wrong
 * reference, then on one line of YAML): the same step, the proposal as it
 * stands and why it did not load. The chronicler answers with only what it
 * corrects, which mergeFix puts into the proposal: cheaper than proposing the
 * chapter again, and the rest stays as the designer read it.
 */
export function worldFixRequest(files: ContentFile[], stepId: string, said: string, draft: Pick<Draft, 'changes' | 'world' | 'rules' | 'files' | 'land'>, problems: string[], region?: RegionScope): LlmRequest {
  const base = worldStepRequest(files, stepId, said, draft.land, region)
  const proposal = [
    'YOUR PROPOSAL AS IT STANDS:',
    ...draft.changes.map((c) => `--- ${c.kind} ${c.id}${c.merge ? ' (merge: only these fields)' : ''}\n${c.yaml.trim() || '(deleted)'}`),
    ...(draft.world?.trim() ? [draft.land ? `--- world (lands/${draft.land}/land.yaml)` : '--- world', draft.world.trim()] : []),
    ...(draft.rules?.trim() ? ['--- rules', draft.rules.trim()] : []),
    ...(draft.files ?? []).map((f) => `--- file ${f.path}: written whole, ${f.text.length} characters`),
  ]
  return {
    ...base,
    system: [
      base.system,
      '',
      'PUTTING IT RIGHT: your proposal for this step did not load. Correct only what the problems name, and change nothing else: no new ideas, no other wording. Answer in the same JSON: say (one sentence: what you corrected), questions (none), changes (only the entities you correct: a change that had merge: true again with merge: true and only its fields, any other whole, as full YAML; leave out every entity no problem touches), world and rules (whole again only if a problem is in them, otherwise empty), files (none, unless a problem is in one).',
    ].join('\n'),
    // Only why it did not load: an earlier failed call ("The chronicler did not answer: ...") is not the proposal's fault.
    prompt: [base.prompt, '', ...proposal, '', 'WHY IT DID NOT LOAD:', ...problems.filter((p) => !/^The chronicler (did not answer|puts it right)/.test(p)).map((p) => `- ${p}`)].join('\n'),
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
export function mergeFix(files: ContentFile[], draft: Pick<Draft, 'say' | 'questions' | 'changes' | 'world' | 'rules' | 'files' | 'land' | 'into'>, text: string): Draft {
  const fix = draftParts(text)
  const land = { ...(draft.land ? { land: draft.land } : {}), ...(draft.into ? { into: draft.into } : {}) }
  const kept: DraftParts = { say: draft.say, questions: draft.questions, changes: draft.changes, ...(draft.world ? { world: draft.world } : {}), ...(draft.rules ? { rules: draft.rules } : {}), ...(draft.files ? { files: draft.files } : {}), ...land }
  if (!fix) return { ...checkedDraft(files, kept), problems: ['The chronicler did not answer in the agreed form; the proposal is as it was.'] }
  const same = (a: DraftChange, b: DraftChange) => a.kind === b.kind && a.id === b.id
  // A correction never takes away (M10.20: a fix round answered with an empty change for a place, and its services went).
  const corrected = fix.changes.filter((f) => f.yaml.trim())
  // A correction of a change that adds to a thing adds to it as well (M10.20: the trial run's palette
  // step added zones to a region, and the round to put it right sent the region back as a whole with
  // only those fields, so its places, size and legend went).
  const put = (c: DraftChange) => {
    const f = corrected.find((x) => same(x, c))
    return f ? (c.merge && !f.merge ? { ...f, merge: true } : f) : c
  }
  const changes = [...draft.changes.map(put), ...corrected.filter((f) => !draft.changes.some((c) => same(c, f)))]
  const whole = [...(draft.files ?? []).map((f) => fix.files?.find((x) => x.path === f.path) ?? f), ...(fix.files ?? []).filter((x) => !(draft.files ?? []).some((f) => f.path === x.path))]
  const world = fix.world ?? draft.world
  const rules = fix.rules ?? draft.rules
  return checkedDraft(files, {
    say: fix.say.trim() ? `${draft.say}\n\nPut right: ${fix.say.trim()}` : draft.say,
    questions: draft.questions,
    changes,
    ...(world ? { world } : {}),
    ...(rules ? { rules } : {}),
    ...(whole.length ? { files: whole } : {}),
    ...land,
  })
}

/**
 * The request for one step of building a world with the designer (M10.17): the
 * world guide and the step's instruction, the contract in short, the world as
 * it is (its world.yaml whole, and what exists), and what the designer said.
 * With a land (M10.23), the same step for that land: its land.yaml in place of
 * world.yaml, the world's frame as the background, and what the land has.
 */
export function worldStepRequest(files: ContentFile[], stepId: string, said: string, land?: string, region?: RegionScope): LlmRequest {
  // A region built in play (M10.25): the steps that fill a region, over its area.
  const steps = region ? WORLD_STEPS.filter((s) => REGION_STEPS.includes(s.id)) : land ? LAND_STEPS : WORLD_STEPS
  const step = steps.find((s) => s.id === stepId) ?? steps[0]!
  const fills = region ? regionFills(step) : land ? landFills(step) : step.fills
  const call = STEP_CALLS[step.id]
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const worldFile = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  // What exists, of the kinds this step fills and the ones it is shown (M10.20: not every kind for every step).
  const own = new Set(fills.map((f) => f.kind))
  const index = ENTITY_KINDS.filter((kind) => !call.sees || own.has(LISTS[kind]) || call.sees.includes(LISTS[kind])).map((kind) => {
    const list = entities(files, kind)
    return list.length ? `${LISTS[kind]}: ${list.map((e) => `${e.id} (${nameOf(kind, e.raw)})`).join(', ')}` : ''
  }).filter(Boolean)
  const order = steps.map((s, i) => `${i + 1}. ${s.title}${s.id === step.id ? ' (NOW)' : ''}`).join(' ')
  // A land's build is shown what the land has, in full; the world's things only by id (M10.23).
  const standing = stepEntities(files, fills, undefined, region ? (e) => ofRegion(files, region.area, e) : land ? (e) => ofLand(files, land, e) : undefined)
  // The voice kit as it stands, for a step that fills it and must send it back whole (M10.20: the voice
  // step comes second, and faiths, places and professions add their part), and the voice itself where
  // places and people are written, so they are in it from the start. A land's own kit in a land's build.
  const voicePath = land ? voiceYaml(files, land).file : undefined
  const voiceFile = files.find((f) => (voicePath ? f.path === voicePath : /(^|\/)data\/voice\.ya?ml$/.test(f.path)))
  const voiceNow = fills.some((f) => f.kind === 'voice') && voiceFile ? ['', `${land ? `LANDS/${land.toUpperCase()}/VOICE.YAML` : 'DATA/VOICE.YAML'} NOW (send it whole, with your part added):`, voiceFile.text] : []
  const voiceOf = (step.id === 'places' || step.id === 'people') && content ? voiceSummary(content, land) : ''
  // The part that stays the same from step to step comes first and is cached (M10.20: the step came
  // first, so each of twelve steps wrote some 18,000 tokens to the cache and never read them back).
  // A land's build shares it with the world's.
  const fixed = [
    worldFixedPart(content, instruction),
    'Answer in JSON: say, questions, changes (a new thing as full YAML; to add to or change a thing that exists, merge: true with only the fields you set, each of which replaces that field whole, so give a list whole; empty YAML without merge deletes), world (YAML of the top-level world.yaml keys to set, or empty), rules (YAML of the top-level keys of the rules to set, such as death, or empty; patrons, conditions and ancestries are changes), files (CHRONICLER.md, data/voice.yaml under its key voice:, data/journey.yaml under its key journey:, or for a land lands/<id>/land.yaml under land: and lands/<id>/voice.yaml, each whole, or none).',
    '',
  ].join('\n')
  const landName = land ? (content?.lands.get(land)?.name ?? landsIn(files).find((l) => l.id === land)?.name ?? land) : ''
  const changing = [
    ...(region ? [regionGuide(region.name, region.area), ''] : land ? [landGuide(landName, land), ''] : []),
    `THE STEPS: ${order}`,
    step.prompt,
    ...(land && LAND_NOTES[step.id] ? [LAND_NOTES[step.id]!.replaceAll('<id>', land).replaceAll("<the land's name>", landName)] : []),
    // The place rules word for word where descriptions are written (M10.20); other steps do not carry them.
    ...(step.id === 'places' ? [PLACE_RULES] : []),
    ...(voiceOf ? [voiceOf] : []),
    // The skills by id where a step names them (M10.25: a region's economy step guessed Craft and Survival).
    ...(content?.rules?.skills.length && fills.some((f) => ['professions', 'crafts', 'object_types'].includes(f.kind)) ? [`THE SKILLS (their ids, for teaches, a craft's skill and a check): ${content.rules.skills.map((s) => s.id).join(', ')}`] : []),
    `ASK THE DESIGNER, if they have not said: ${step.ask.join(' ')}`,
    `CHECK BEFORE YOU PROPOSE: ${step.checks.join(' ')}`,
    `IF THE DESIGNER SKIPS THIS STEP: ${step.skipped}`,
    '',
    stepFields(fills),
    '',
    designPrompt(files),
  ].join('\n')
  const keys = [...step.fills.filter((f) => f.kind === 'world').flatMap((f) => f.keys ?? []), ...call.world]
  const where = land
    ? [`THE WORLD (the background; this build does not change it):`, worldFile ? worldKeys(worldFile.text, []) : '(none)', '', `LANDS/${land.toUpperCase()}/LAND.YAML NOW (what \`world\` sets):`, landYaml(files, land).yaml]
    : [`WORLD.YAML NOW (${keys.length ? 'the keys this step needs' : 'what it is'}):`, worldFile ? worldKeys(worldFile.text, keys) : '(none)']
  return {
    role: 'chronicler',
    system: fixed + changing,
    cacheBreak: fixed.length,
    // The world's own fixed part is marked on its own too, so the story round of a region reads it from the cache (M10.26).
    cacheShared: worldFixedPart(content, instruction).length,
    cacheHour: true,
    prompt: [...where, '', contractState(content), '', 'WHAT EXISTS:', ...index, ...(standing ? ['', standing] : []), ...voiceNow, '', `THE DESIGNER SAYS: ${said}`].join('\n'),
    schemaName: 'world_step',
    schema: WORLD_STEP_SCHEMA,
    // A whole chapter answered in YAML, measured per step (M10.20: Bram's People chapter holds eight people,
    // their factions and the law). A table takes little thought and may go to the lighter model.
    maxTokens: stepMaxTokens(step.id, said),
    effort: call.effort,
    ...(call.light ? { tier: 'light' as const } : {}),
    timeoutMs: 600000,
    meta: { step: step.id, ask: said, prefix: worldPrefix(files), world: worldFacts(files, land, region?.area), ...(land ? { land } : {}), ...(region ? { region: region.area } : {}) },
  }
}

/** A region a step builds in play (M10.25): its area, and its name. */
export interface RegionScope {
  area: string
  name: string
}

/** Whether a thing of the world is the region's (M10.25): the area itself, a place in it, someone living there, its settlement. */
function ofRegion(files: ContentFile[], area: string, e: { id: string; file: string; raw: Raw }): boolean {
  if (e.id === area || e.raw['area'] === area) return true
  const home = typeof e.raw['home'] === 'string' ? entities(files, 'location').find((l) => l.id === e.raw['home']) : undefined
  return home?.raw['area'] === area
}

/** Whether a thing of the world is the land's (M10.23): in its folder, of one of its areas, or said to be. */
function ofLand(files: ContentFile[], land: string, e: { file: string; raw: Raw }): boolean {
  if (landOfFile(e.file) === land || e.raw['land'] === land) return true
  const area = typeof e.raw['area'] === 'string' ? e.raw['area'] : undefined
  const a = area ? entities(files, 'area').find((x) => x.id === area) : undefined
  return Boolean(a && (landOfFile(a.file) === land || a.raw['land'] === land))
}

/**
 * world.yaml with only the keys a step needs (M10.20: every step was sent the
 * whole file, map and pictures included): its own keys, the ones the guide
 * names for it, and always the name, the start and the frame. Other top-level
 * keys than `world` go whole.
 */
export function worldKeys(text: string, keys: string[]): string {
  const doc = parseDocument(text)
  const data = doc.errors.length ? undefined : (doc.toJS() as Record<string, unknown> | null)
  if (!data || typeof data !== 'object') return text
  const keep = new Set(['id', 'name', 'start', 'frame', ...keys])
  const world = data['world']
  if (!world || typeof world !== 'object' || Array.isArray(world)) return text
  const kept = Object.fromEntries(Object.entries(world as Record<string, unknown>).filter(([key]) => keep.has(key)))
  const left = Object.keys(world).filter((key) => !keep.has(key))
  return `${stringify({ ...data, world: kept }, { lineWidth: 0 }).trimEnd()}${left.length ? `\n# not shown here: ${left.join(', ')}` : ''}`
}

/**
 * What a step may change, as it stands (M10.20; the real run of The Quiet
 * Reach, where the economy step could not give the places made in the places
 * step their services and benches, because a change sends a thing whole and
 * the chronicler saw only ids): the YAML of every thing of the kinds the step
 * fills that the world already has. Past a limit, the rest by id only.
 */
export function stepEntities(files: ContentFile[], fills: readonly { kind: string }[], limit = 120_000, only?: (e: { id: string; file: string; raw: Raw }) => boolean): string {
  const kinds = ENTITY_KINDS.filter((kind) => fills.some((f) => f.kind === LISTS[kind]))
  const blocks: string[] = []
  const left: string[] = []
  let size = 0
  for (const kind of kinds) {
    for (const e of entities(files, kind)) {
      if (only && !only(e)) continue
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

const POLISH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'places'],
  properties: {
    say: { type: 'string' },
    places: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'day', 'night'], properties: { id: { type: 'string' }, day: { type: 'string' }, night: { type: 'string' } } } },
  },
}

/** The places the Check names under Descriptions (M10.20), by id. */
export function placesToPolish(content: Content): string[] {
  return descriptionCheck(content).places.map((line) => line.slice(0, line.indexOf(':')))
}

/**
 * The polish round (M10.20; the first real build, The Quiet Reach, averaged 88
 * words a place and listed every way out): the chronicler rewrites only the
 * descriptions of the places the Check names, or those the designer picks, in
 * the voice of the world and by the place rules. Ids, names, exits, details
 * and what lies there stay. A safety net after the steps, not a step: the rules
 * are in the places step itself. A lighter model will do (the player's model
 * for the brain), unless the designer asks for the chronicler's.
 */
export function polishRequest(files: ContentFile[], ids?: string[], light = true): LlmRequest {
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const measures = content ? placeMeasures(content) : []
  const check = content ? descriptionCheck(content) : undefined
  const chosen = ids?.length ? ids : content ? placesToPolish(content) : []
  const places = chosen.flatMap((id) => (content?.locations.get(id) ? [content.locations.get(id)!] : []))
  const askable = content ? [...new Set([...[...content.topics.values()].map((t) => t.name), ...[...content.npcs.values()].map((n) => n.name), ...[...content.locations.values()].map((l) => l.name)])] : []
  const lines = places.map((l) => {
    const m = measures.find((x) => x.id === l.id)
    const ways = Object.entries(l.exits).flatMap(([dir, e]) => (e ? [`${dir} to ${content!.locations.get(e.to)?.name ?? e.to}`] : [])).join(', ')
    const things = l.details.map((d) => d.words[0]).filter(Boolean).join(', ')
    const note = check?.places.find((p) => p.startsWith(`${l.id}:`))?.slice(l.id.length + 2)
    return [
      `--- ${l.id}: ${l.name} (${content!.areas.get(l.area)?.name ?? l.area})`,
      `ways out: ${ways || 'none'}`,
      things ? `things it has, to keep in the text: ${things}` : '',
      `day now (${m?.words ?? 0} words${(m?.words ?? 0) > 70 ? `, ${(m?.words ?? 0) - 70} too many` : ''}): ${l.description.day.trim().replace(/\s+/g, ' ')}`,
      l.description.night ? `night now: ${l.description.night.trim().replace(/\s+/g, ' ')}` : 'night now: none (leave night empty)',
      note ? `the Check says: ${note}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  return {
    role: 'chronicler',
    ...(light ? { tier: 'light' as const } : {}),
    ...cachedSystem([
      'YOU POLISH THE DESCRIPTIONS OF THE PLACES OF A WORLD, in the voice of that world. The designer built it step by step; you rewrite only what a place says, so it reads by the rules below.',
      '- Length first: every description, day and night, at most 70 words. Count them; where a place says how many are too many, cut at least that many. A description over 70 words is not taken.',
      '- Change only the day and night descriptions. Keep every fact, clue, person and thing the description names that the world relies on: the things listed per place stay in the text, and so do the way the place looks and works. Invent nothing: no new object, person, clue or way out.',
      '- Keep the world\'s names and words exactly, in British spelling.',
      '- A night description only where the place has one now; otherwise night is empty.',
      '- Put in [brackets] only names from the list of what can be asked about, written as they are there.',
      '',
      PLACE_RULES,
      '',
      content ? voiceSummary(content) : '',
      '',
      instruction,
      'Answer in JSON: say (one or two sentences on what you changed), places (id, day, night: only the places you rewrite).',
    ].join('\n'), '', '', 'none'),
    prompt: ['WHAT CAN BE ASKED ABOUT (for [brackets]):', askable.join(', '), '', 'THE PLACES TO POLISH:', ...lines].join('\n'),
    schemaName: 'world_polish',
    schema: POLISH_SCHEMA,
    // Per kind (CLAUDE.md): about 150 words a place, day and night, and a short say. The chronicler's
    // model thinks first and needs room for it (the Quiet Reach run: Opus 5.5 used 12,000 tokens on ten
    // places and was cut off); the light model answered ten places in 2,828.
    maxTokens: 700 * places.length + 1000 + (light ? 0 : 16000),
    timeoutMs: 240000,
    meta: { step: 'polish', prefix: worldPrefix(files), places: places.map((p) => p.id) },
  }
}

/**
 * The polished descriptions as a proposal: per place a change that sets only
 * its description (merge), checked by loading the world with them. A place
 * that no longer names a thing it has to look at is noted in the say.
 */
export function readPolish(files: ContentFile[], text: string): Draft {
  let parsed: { say?: unknown; places?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return { say: '', questions: [], changes: [], problems: ['The chronicler did not answer in the agreed form.'] }
  }
  const content = safeLoad(files)
  const changes: DraftChange[] = []
  const problems: string[] = []
  const notes: string[] = []
  for (const p of Array.isArray(parsed.places) ? parsed.places : []) {
    const place = p && typeof p === 'object' ? (p as { id?: unknown; day?: unknown; night?: unknown }) : {}
    const id = typeof place.id === 'string' ? place.id : ''
    const now = content?.locations.get(id)
    if (!now) {
      problems.push(`${id || '(no id)'}: no such place`)
      continue
    }
    const day = typeof place.day === 'string' ? place.day.trim() : ''
    if (!day) continue
    const night = typeof place.night === 'string' ? place.night.trim() : ''
    const keptNight = now.description.night ? (night || now.description.night.trim()) : ''
    changes.push({ kind: 'location', id, merge: true, yaml: stringify({ description: { day: `${day}\n`, ...(keptNight ? { night: `${keptNight}\n` } : {}) } }) })
    const lost = now.details.filter((d) => d.words.every((w) => !day.toLowerCase().includes(w.toLowerCase()))).map((d) => d.words[0])
    if (lost.length) notes.push(`${id} no longer names ${lost.map((w) => `"${w}"`).join(', ')}`)
    const words = day.split(/\s+/).filter(Boolean).length
    if (words > 70) notes.push(`${id} is still ${words} words`)
  }
  const say = [typeof parsed.say === 'string' ? parsed.say : '', notes.length ? `Worth a look: ${notes.join('; ')}.` : ''].filter(Boolean).join('\n\n')
  const draft = checkedDraft(files, { say, questions: [], changes })
  return { ...draft, problems: [...problems, ...draft.problems] }
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
export function enhanceRequest(files: ContentFile[], stepId: string, said: string, land?: string): LlmRequest {
  const steps = land ? LAND_STEPS : WORLD_STEPS
  const step = steps.find((s) => s.id === stepId) ?? steps[0]!
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  const worldFile = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  const index = ENTITY_KINDS.map((kind) => {
    const list = entities(files, kind)
    return list.length ? `${LISTS[kind]}: ${list.map((e) => `${e.id} (${nameOf(kind, e.raw)})`).join(', ')}` : ''
  }).filter(Boolean)
  return {
    role: 'chronicler',
    // The task and the world's own guide first, the same for every step (M10.26); the step and what the world has now after
    // the mark. Kept an hour, like the steps it comes before (M10.27).
    cacheHour: true,
    ...cachedSystem(
      [
        'YOU HELP THE DESIGNER WRITE THEIR ANSWER FOR ONE STEP OF BUILDING A WORLD. You do not propose content yet: you write out what they said as a fuller brief, so that the proposal after it has enough to go on.',
        '- Keep every choice the designer made, in meaning and in their names. Do not overrule them.',
        '- For each question of the step they did not answer, add one concrete suggestion that fits the frame and what the world already has, marked "(suggestion)". Invent names only as suggestions.',
        '- Write plain English with British spelling, in short lines or a few short paragraphs; no YAML, no ids. At most 250 words.',
        '- Keep to the hard limits: nothing sexual involving minors, no hate against real groups, romance non-explicit.',
        '- In `open`, list up to three things only the designer can decide.',
        'Answer in JSON: brief (the fuller answer, plain text), open (what only the designer can decide).',
        '',
        instruction,
      ].join('\n'),
      '',
      [
        '',
        ...(land ? [`It is the step for a land of this world, ${landsIn(files).find((l) => l.id === land)?.name ?? land}: what the land leaves open it takes from the world, and the calendar is the world's.`] : []),
        `THE STEP: ${step.title}. ${step.prompt}`,
        ...(land && LAND_NOTES[step.id] ? [LAND_NOTES[step.id]!.replaceAll('<id>', land)] : []),
        `ITS QUESTIONS: ${step.ask.join(' ')}`,
        `IF IT IS SKIPPED: ${step.skipped}`,
        '',
        contractSummary(content),
        '',
        designPrompt(files),
      ].join('\n'),
    ),
    prompt: [`WORLD.YAML NOW:`, worldFile?.text ?? '(none)', ...(land ? ['', `LANDS/${land.toUpperCase()}/LAND.YAML NOW:`, landYaml(files, land).yaml] : []), '', 'WHAT EXISTS:', ...index, '', `THE DESIGNER WROTE: ${said}`].join('\n'),
    schemaName: 'world_enhance',
    schema: ENHANCE_SCHEMA,
    maxTokens: 1200,
    meta: { step: step.id, ask: said, asks: step.ask, prefix: worldPrefix(files), ...(land ? { land } : {}) },
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
function worldFacts(files: ContentFile[], land?: string, area?: string): { name: string; start: string; startRaw?: Raw; ids: Record<string, string[]> } {
  const content = safeLoad(files)
  // A land's build (M10.23), or a region's in play (M10.25): its own areas, places and people, its first place for the start; the rest is shared.
  const own = (kind: EntityKind) => entities(files, kind).filter((e) => !['area', 'location', 'npc'].includes(kind) || (area ? ofRegion(files, area, e) : !land || ofLand(files, land, e)))
  const ids = Object.fromEntries((['area', 'location', 'npc', 'profession', 'item', 'object_type', 'faction'] as const).map((kind) => [kind, own(kind).map((e) => e.id)]))
  const start = land || area ? (ids['location']?.[0] ?? '') : (content?.world.start.location ?? '')
  const startRaw = entities(files, 'location').find((e) => e.id === start)?.raw
  const name = area ? (content?.areas.get(area)?.name ?? area) : land ? (content?.lands.get(land)?.name ?? landsIn(files).find((l) => l.id === land)?.name ?? land) : (content?.world.name ?? '')
  return { name, start, ...(startRaw ? { startRaw } : {}), ids }
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
  /** Whether it has a region map (M10.20); without one the preview is a sample, and the editor offers a map from the places. */
  region?: boolean
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
  return { palette: shown, own: Boolean(own), levels: content?.world.map?.levels ?? [{ id: SURFACE, name: 'ground level' }], ...(content ? { preview: previewMapData(content, shown), region: content.regions.size > 0 } : {}) }
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
    // A colour per sign by its id, stairs, and peat_edge for the rim of a pit (M10.20).
    glyph: { type: 'object', additionalProperties: HEX, required: ['stairs'], properties: { stairs: HEX } },
  },
}
const SIGN = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'shape', 'on'],
  properties: {
    name: { type: 'string' },
    shape: { type: 'string', enum: [...SIGN_SHAPES] },
    means: { type: 'string', enum: ['danger', 'uncertain'] },
    on: { type: 'object', additionalProperties: { type: 'number', minimum: 0, maximum: 1 } },
    text: { type: 'string' },
    firm: { type: 'boolean' },
    wet: { type: 'boolean' },
    stops: { type: 'string' },
  },
}
const PALETTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'palette'],
  properties: { say: { type: 'string' }, palette: { type: 'object', additionalProperties: false, required: ['names', 'dark', 'paper'], properties: { names: { type: 'object', additionalProperties: { type: 'string' } }, signs: { type: 'object', additionalProperties: SIGN }, dark: STYLE, paper: STYLE } } },
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
    ...cachedSystem([
      instruction,
      '',
      content ? worldText(worldFrame(content)) : '',
      '',
      'YOU ARE IN THE WORLD BUILDER, AT THE MAP PALETTE. Propose colours for the map of this world that fit its frame: muted, in the spirit of Dwarf Fortress and Brogue, three or four close tints for every terrain (the seed of each hex picks one), boggy ground darker, dry ground lighter, water in two tones (open water and channel), ways in warm parchment. One set for the dark style and one for paper; black and white is made from paper. Give the legend names of the terrains as this world would say them, and of the ways under the same names (road, path, and canal, which is a tow path in the Nethermarch and may be a tidal channel or a cable run elsewhere). Colours as #rrggbb. JSON only.',
      `SIGNS ON THE LAND: a world names its own under palette.signs, at most ${MAX_SIGNS}, by an id of its own (a mine shaft is mine_shaft, never the Nethermarch's peat_pit): a name for the legend, a shape (${SIGN_SHAPES.join(', ')}), the land it lies on with its share of those hexes (on: { fen: 0.1 } is one hex in ten; a land is ${LANDS.join(', ')} or a terrain of the palette), the line the stranger reads walking past (text), and means: danger or means: uncertain where a colour alone would not say it (the map adds ! or ? and the legend the word). firm: true for firm ground, wet: true for water in the ground, stops for a line where a walk stops to look. Give every sign a colour under glyph in both styles by its id, and stairs; peat_edge is the rim of a pit-shaped sign. Leave signs out to keep the Nethermarch's pool, peat_pit, willow, ruin and hummock.`,
    ].join('\n'), '', '', 'none'),
    prompt: [`THE PALETTE NOW:`, JSON.stringify(current), '', `TERRAINS: ${terrains.join(', ')}`, `SIGNS NOW: ${signsOf(current).map(([id, sign]) => `${id} (${sign.name}, ${sign.shape}${sign.means ? `, ${sign.means}` : ''})`).join(', ')}`, '', `THE DESIGNER ASKS: ${ask || 'a palette that fits this world'}`].join('\n'),
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
export function voiceRequest(files: ContentFile[], ask: string, land?: string): LlmRequest {
  const content = safeLoad(files)
  const instruction = files.filter((f) => /(^|\/)CHRONICLER\.md$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path)).map((f) => f.text).join('\n\n')
  // A land's kit (M10.23): from the land's frame and faiths, for the areas of the land.
  const now = voiceYaml(files, land).yaml
  const held = content ? frameOf(content, land).faiths : []
  const faiths = held.map((f) => `${f.id} (${f.name})`).join(', ')
  const areas = content ? [...content.areas.values()].filter((a) => a.land === land).map((a) => `${a.id} (${a.name}, ${a.kind})`).join(', ') : ''
  const trades = content ? [...content.professions.keys()].join(', ') : ''
  return {
    role: 'chronicler',
    ...cachedSystem([
      instruction,
      '',
      content ? worldText(worldFrame(content, land)) : '',
      '',
      'YOU ARE IN THE WORLD BUILDER, AT THE VOICE KIT. Propose how people in this world speak, as YAML with these keys: oaths (per faith id, two or three each), sayings (three or four of the whole region), groups (id, name, areas, professions, two or three sayings each), default_group, address (stranger, known, friend, high; "she/he/they" forms allowed), time, distance, measures, and not_here (word, and instead when people here have a word for it; weekdays and months of our world with this world\'s own). Sayings are rare in play: make them few and good. JSON only, with the YAML as a string: the fields below at its top, with or without voice: above them.',
      // The exact fields (M10.20: the real trial of this call wrote each time phrase as a map where the kit has a line of text).
      stepFields([{ kind: 'voice' }]),
    ].join('\n'), '', '', 'none'),
    prompt: [`FAITHS: ${faiths}`, `AREAS: ${areas}`, `TRADES: ${trades}`, '', 'THE KIT NOW:', now || '(none yet)', '', `THE DESIGNER ASKS: ${ask || 'a voice kit that fits this world'}`].join('\n'),
    schemaName: 'voice_draft',
    schema: VOICE_SCHEMA,
    maxTokens: 3000,
    meta: { voice: now, faiths: held.map((f) => f.id), ask, ...(land ? { land } : {}) },
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
  const read = parseEntityYaml(yaml).raw
  // The kit under its file's key is the kit as well (M10.20: the writing aid is shown the fields as the file has them).
  const raw = read && Object.keys(read).length === 1 && read['voice'] && typeof read['voice'] === 'object' ? (read['voice'] as Record<string, unknown>) : read
  const kit = raw ? VoiceSchema.safeParse(raw) : undefined
  return { say: typeof parsed.say === 'string' ? parsed.say : '', ...(kit?.success ? { yaml: raw === read ? yaml : stringify(raw, { lineWidth: 0 }) } : {}), problems: kit?.success ? [] : kit ? kit.error.issues.slice(0, 5).map((i) => `voice ${i.path.join('.')}: ${i.message}`) : ['The proposal is no YAML.'] }
}

// ---------------------------------------------------------------- the map after the world steps (M10.25)

/**
 * The map belongs to the world build (M10.25; Bram, 29 September 2026): after
 * the last step the editor offers to lay the region map out from the places
 * (mapDraft, without a model) and to have it painted, as one proposal with a
 * diff. Since M10.26 the painting is a table the model fills (map/paint.ts),
 * a cheaper call than the whole Palette step; a world that has its map is
 * only painted. Without a region to paint there is no request.
 */
export function mapStepRequest(files: ContentFile[], said: string): { layout: Draft; request?: LlmRequest } {
  const layout = mapDraft(files)
  const laid = layout.result?.ok ? layout.result.files : files
  const request = paintRequest(laid, said)
  return { layout, ...(request ? { request } : {}) }
}

/** A second try after a wrong map (M10.26): the same cached part, the table as it stood, and what stood wrong. */
export function mapFixRequest(files: ContentFile[], said: string, table: string, wrong: string[]): LlmRequest | undefined {
  const { request } = mapStepRequest(files, said)
  return request ? paintFixRequest(request, table, wrong) : undefined
}

/**
 * The layout and the painting as one proposal, checked against the world as
 * it is: a thing both change is one change, the painting's fields over the
 * layout's, whole where the layout made it.
 */
export function readMapStep(files: ContentFile[], layout: Draft, text: string): Draft {
  const laid = layout.result?.ok ? layout.result.files : files
  const painted = readPaint(laid, text)
  // A table that does not fit says why, for the second try; nothing of it is proposed.
  if (painted.problems.length) return { ...painted, changes: [] }
  const key = (c: DraftChange) => `${c.kind}:${c.id}`
  const byKey = new Map(layout.changes.map((c) => [key(c), c]))
  for (const c of painted.changes) {
    const had = byKey.get(key(c))
    if (!had || !c.yaml.trim()) {
      byKey.set(key(c), c)
      continue
    }
    const a = parseEntityYaml(had.yaml).raw ?? {}
    const b = parseEntityYaml(c.yaml).raw ?? {}
    byKey.set(key(c), { kind: c.kind, id: c.id, yaml: stringify({ ...(c.merge ? a : {}), ...b }), ...(had.merge && c.merge ? { merge: true } : {}) })
  }
  // The layout's own first line sends the designer to the Palette step; here that step is part of it.
  const notes = layout.say.split('\n').slice(1).join('\n').trim()
  const lead = layout.changes.length ? 'The map, laid out from the places, their exits and minutes, and painted from your words.' : ''
  return recheckDraft(files, {
    say: [lead, notes, painted.say].filter(Boolean).join('\n\n'),
    questions: painted.questions,
    changes: [...byKey.values()],
    ...(painted.world ? { world: painted.world } : {}),
    ...(painted.files?.length ? { files: painted.files } : {}),
  })
}
