import { isMap, isSeq, parseDocument } from 'yaml'
import { ContentError, loadContent, type Content, type ContentFile } from './content'
import { regionMap } from './map/region'

// The world builder's view of the content, and how a change goes in (FO,
// chapter 15). Pure: it works on the texts of the content files, so the
// desktop app can write them to disk and the browser preview can keep them in
// memory. Comments and order in the files stay as they were.

export type BuildKind = 'location' | 'npc' | 'region'

export interface ChangeResult {
  ok: boolean
  problems: string[]
  content?: Content
  /** The changed file, as its path and new text. */
  file?: string
  text?: string
}

/** Everything the builder shows about the content: what is there, and what is wrong with it. */
export interface BuilderData {
  areas: { id: string; name: string; pos?: [number, number] }[]
  locations: { id: string; name: string; area: string; tags: string[]; description: { day: string; night?: string }; exits: Record<string, { to: string; minutes: number }>; pos?: [number, number]; file: string }[]
  npcs: {
    id: string
    name: string
    short: string
    age: number
    profession: string
    home: string
    work?: string
    appearance: string
    speech?: string
    personality: Record<string, number>
    public_facts: string[]
    file: string
  }[]
  professions: { id: string; name: string }[]
  /** The region: its zone drawing, and the map the generator makes of it. */
  region?: { id: string; name: string; zones: string; map: string; file: string }
  problems: string[]
  warnings: string[]
}

export function builderView(files: ContentFile[]): BuilderData {
  const fileOf = new Map<string, string>()
  for (const f of files) for (const match of f.text.matchAll(/^\s*- id: ([a-z0-9_]+)/gm)) fileOf.set(match[1]!, f.path)
  let content: Content | undefined
  let problems: string[] = []
  try {
    content = loadContent(files)
  } catch (error) {
    problems = error instanceof ContentError ? error.problems : [String(error)]
  }
  return {
    areas: content ? [...content.areas.values()].map((a) => ({ id: a.id, name: a.name, ...(a.pos ? { pos: a.pos } : {}) })) : [],
    locations: content
      ? [...content.locations.values()].map((l) => ({
          id: l.id,
          name: l.name,
          area: l.area,
          tags: l.tags,
          description: l.description,
          exits: Object.fromEntries(Object.entries(l.exits).map(([d, e]) => [d, { to: e!.to, minutes: e!.minutes }])),
          ...(l.pos ? { pos: l.pos } : {}),
          file: fileOf.get(l.id) ?? '',
        }))
      : [],
    npcs: content
      ? [...content.npcs.values()].map((n) => ({
          id: n.id,
          name: n.name,
          short: n.short,
          age: n.age,
          profession: n.profession,
          home: n.home,
          ...(n.work ? { work: n.work } : {}),
          appearance: n.appearance,
          ...(n.speech ? { speech: n.speech } : {}),
          personality: { ...n.personality },
          public_facts: n.public_facts,
          file: fileOf.get(n.id) ?? '',
        }))
      : [],
    professions: content ? [...content.professions.values()].map((p) => ({ id: p.id, name: p.name })) : [],
    ...(content ? regionView(content, fileOf) : {}),
    problems,
    warnings: content ? warnings(content) : [],
  }
}

/** Things that load but deserve a look (FO, chapter 15, "Schema's en validatie"). */
export function warnings(content: Content): string[] {
  const out: string[] = []
  // Reachability over exits from the start, and from every edge on the region map (reached across country).
  const roots = [content.world.start.location, ...[...content.locations.values()].filter((l) => l.tags.includes('edge') && (l.pos ?? content.areas.get(l.area)?.pos)).map((l) => l.id)]
  const reached = new Set<string>(roots)
  const queue = [...roots]
  while (queue.length) {
    const id = queue.shift()!
    for (const exit of Object.values(content.locations.get(id)?.exits ?? {})) {
      if (exit && !reached.has(exit.to)) {
        reached.add(exit.to)
        queue.push(exit.to)
      }
    }
  }
  for (const location of content.locations.values()) {
    const onMap = location.pos ?? content.areas.get(location.area)?.pos
    if (!reached.has(location.id)) out.push(`${location.id}: cannot be reached from the start, by exits or across country${onMap ? '' : ' (and it has no place on the map)'}`)
    const sentences = location.description.day.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length
    if (sentences < 3 || sentences > 5) out.push(`${location.id}: the day description has ${sentences} sentences; three to five read best`)
  }
  for (const npc of content.npcs.values()) if (npc.public_facts.length === 0) out.push(`${npc.id}: no public facts, so nobody can tell anything about them`)
  for (const topic of content.topics.values()) if (!topic.origin && !topic.pos && !topic.everywhere && topic.kind !== 'person') out.push(`topic ${topic.id}: no origin, so nobody knows where it belongs`)
  return out
}

function regionView(content: Content, fileOf: Map<string, string>): Pick<BuilderData, 'region'> {
  const region = [...content.regions.values()][0]
  const map = regionMap(content)
  if (!region || !map) return {}
  // The whole generated map, every second row, with the places of the content on it.
  const terrain: Record<string, string> = { fen: '"', water: '~', woods: 'T', heath: '^', fields: '.' }
  const rows: string[] = []
  for (let row = map.rows - 1; row >= 0; row -= 2) {
    let line = ''
    for (let col = 0; col < map.cols; col++) {
      const cell = map.cell({ col, row })!
      const place = map.placeOn(cell)
      line += place ? (content.areas.get(place)?.name.replace(/^the /i, '')[0] ?? '*').toUpperCase() : cell.way ? (cell.way.kind === 'canal' ? '=' : cell.way.kind === 'road' ? ':' : ',') : cell.hidden ? 'r' : (terrain[cell.land] ?? '.')
    }
    rows.push(line)
  }
  return { region: { id: region.id, name: region.name, zones: region.zones, map: rows.join('\n'), file: fileOf.get(region.id) ?? '' } }
}

const LOCATION_FIELDS = ['name', 'tags', 'description.day', 'description.night', 'exits'] as const
const REGION_FIELDS = ['zones'] as const
const NPC_FIELDS = ['name', 'short', 'age', 'profession', 'home', 'work', 'appearance', 'speech', 'personality', 'public_facts'] as const

/**
 * Puts a change into the text of the file that holds the thing, and checks
 * that the whole content still loads with it. Nothing is changed on a problem.
 */
export function applyChange(files: ContentFile[], kind: BuildKind, id: string, patch: Record<string, unknown>): ChangeResult {
  const list = kind === 'location' ? 'locations' : kind === 'npc' ? 'npcs' : 'regions'
  const allowed: readonly string[] = kind === 'location' ? LOCATION_FIELDS : kind === 'npc' ? NPC_FIELDS : REGION_FIELDS
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!/\.ya?ml$/.test(file.path) || !file.text.includes(`id: ${id}`)) continue
    const doc = parseDocument(file.text)
    const seq = doc.get(list)
    if (!isSeq(seq)) continue
    const index = seq.items.findIndex((item) => isMap(item) && item.get('id') === id)
    if (index < 0) continue
    for (const [field, value] of Object.entries(patch)) {
      if (!allowed.includes(field)) return { ok: false, problems: [`${field} cannot be changed here`] }
      const path = [list, index, ...field.split('.')]
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0 && field !== 'tags')) doc.deleteIn(path)
      else doc.setIn(path, value)
    }
    const text = doc.toString({ lineWidth: 0 })
    try {
      const content = loadContent(files.map((f) => (f.path === file.path ? { ...f, text } : f)))
      return { ok: true, problems: [], content, file: file.path, text }
    } catch (error) {
      return { ok: false, problems: error instanceof ContentError ? error.problems : [String(error)] }
    }
  }
  return { ok: false, problems: [`${id} is not in any file of the content`] }
}
