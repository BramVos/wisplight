import { stringify } from 'yaml'
import { ContentError, loadContent, type Content, type ContentFile, type Direction } from './content'
import { warnings } from './builder'
import { applyEdits, entities, ENTITY_KINDS, LISTS, parseEntityYaml, worldPrefix, type Edit, type EditResult, type EntityKind, type Raw } from './edit'
import { worldFrame } from './dialogue/prompt'
import type { LlmRequest } from './dialogue/llm'

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
  files: string[]
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
  creature: 'Creatures',
  encounter: 'Encounters',
  region: 'Regions',
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
    files: files.map((f) => f.path).sort(),
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
 * A place's exits changed: the places on the other side get the way back
 * (the opposite direction, when it is free), and lose it when the exit went.
 */
export function returnExits(files: ContentFile[], id: string, before: Exits, after: Exits): Edit[] {
  const places = new Map(entities(files, 'location').map((l) => [l.id, l.raw]))
  const changed = new Map<string, Raw>()
  const place = (to: string) => changed.get(to) ?? (places.get(to) ? structuredClone(places.get(to)!) : undefined)
  for (const [dir, exit] of Object.entries(before) as [Direction, { to: string }][]) {
    if (after[dir]?.to === exit.to) continue
    const other = place(exit.to)
    const theirs = (other?.['exits'] ?? {}) as Exits
    const back = OPPOSITE[dir]
    if (other && theirs[back]?.to === id && !Object.values(after).some((e) => e?.to === exit.to)) {
      delete theirs[back]
      other['exits'] = theirs
      changed.set(exit.to, other)
    }
  }
  for (const [dir, exit] of Object.entries(after) as [Direction, { to: string; minutes?: number }][]) {
    const other = place(exit.to)
    if (!other || exit.to === id) continue
    const theirs = (other['exits'] ?? {}) as Exits
    if (Object.values(theirs).some((e) => e?.to === id)) continue
    const back = OPPOSITE[dir]
    if (theirs[back]) continue
    theirs[back] = exit.minutes && exit.minutes > 1 ? { to: id, minutes: exit.minutes } : { to: id }
    other['exits'] = theirs
    changed.set(exit.to, other)
  }
  return [...changed].map(([to, raw]) => ({ kind: 'location' as const, id: to, data: raw }))
}

/**
 * The edits, and what they need at the other end of their exits: a way back
 * to a place that gained an exit (unless it is tagged one_way), none from a
 * place that lost it, and no exits left pointing at a place that is deleted.
 * An edit of the designer's own to the other place comes first.
 */
export function withReturnExits(files: ContentFile[], edits: Edit[]): Edit[] {
  const out = [...edits]
  const places = entities(files, 'location')
  const own = (id: string) => out.some((e) => e.kind === 'location' && e.id === id)
  for (const edit of edits) {
    if (edit.kind !== 'location') continue
    if (!edit.data) {
      for (const other of places) {
        const exits = { ...((other.raw['exits'] ?? {}) as Exits) }
        const gone = (Object.keys(exits) as Direction[]).filter((d) => exits[d]?.to === edit.id)
        if (!gone.length || own(other.id)) continue
        for (const d of gone) delete exits[d]
        out.push({ kind: 'location', id: other.id, data: { ...other.raw, exits } })
      }
      continue
    }
    if (((edit.data['tags'] as string[] | undefined) ?? []).includes('one_way')) continue
    const before = (places.find((l) => l.id === edit.id)?.raw['exits'] ?? {}) as Exits
    for (const back of returnExits(files, edit.id, before, (edit.data['exits'] ?? {}) as Exits)) if (!own(back.id)) out.push(back)
  }
  return out
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
}

export interface Draft {
  /** What the chronicler says about the proposal, or the question it asks back. */
  say: string
  questions: string[]
  changes: DraftChange[]
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
        properties: { kind: { type: 'string', enum: ENTITY_KINDS }, id: { type: 'string' }, yaml: { type: 'string' } },
      },
    },
  },
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
      content ? worldFrame(content) : '',
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
  let parsed: { say?: unknown; questions?: unknown; changes?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return { say: '', questions: [], changes: [], problems: ['The chronicler did not answer in the agreed form.'] }
  }
  const changes = (Array.isArray(parsed.changes) ? parsed.changes : [])
    .filter((c): c is DraftChange => Boolean(c) && typeof c === 'object' && ENTITY_KINDS.includes((c as DraftChange).kind) && typeof (c as DraftChange).id === 'string')
    .map((c) => ({ kind: c.kind, id: c.id, yaml: typeof c.yaml === 'string' ? c.yaml : '' }))
  const problems: string[] = []
  const edits: Edit[] = []
  for (const change of changes) {
    if (!change.yaml.trim()) {
      edits.push({ kind: change.kind, id: change.id })
      continue
    }
    const read = parseEntityYaml(change.yaml)
    if (!read.raw) problems.push(`${change.id}: ${read.problem}`)
    else edits.push({ kind: change.kind, id: change.id, data: { ...read.raw, id: change.id } })
  }
  const result = problems.length ? undefined : applyEdits(files, edits)
  return {
    say: typeof parsed.say === 'string' ? parsed.say : '',
    questions: Array.isArray(parsed.questions) ? parsed.questions.filter((q): q is string => typeof q === 'string') : [],
    changes,
    ...(result ? { result } : {}),
    problems: [...problems, ...(result?.problems ?? [])],
  }
}

/** The edits a draft stands for, to save when the designer accepts it. */
export function draftEdits(draft: Pick<Draft, 'changes'>): Edit[] {
  return draft.changes.map((c) => {
    const raw = c.yaml.trim() ? parseEntityYaml(c.yaml).raw : undefined
    return raw ? { kind: c.kind, id: c.id, data: { ...raw, id: c.id } } : { kind: c.kind, id: c.id }
  })
}

function safeLoad(files: ContentFile[]): Content | undefined {
  try {
    return loadContent(files)
  } catch {
    return undefined
  }
}

