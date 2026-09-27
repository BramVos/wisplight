import { Document, isMap, isScalar, isSeq, parseDocument, Scalar, type Node, type YAMLMap, type YAMLSeq } from 'yaml'
import { ContentError, loadContent, type Content, type ContentFile } from './content'

// The editor's core (M8, FO chapter 15): create, change and delete anything
// in a world's content, in the text of its files. Only the entity that
// changes is written again; every other byte of the file stays as it was, so
// comments, order and the designer's layout survive, and a save that changes
// nothing writes nothing. Every edit is checked by loading the whole world
// with it; a world that would not load is never written. Pure: the desktop
// editor writes the changed files, the browser preview keeps them in memory.

/** Every kind of thing a world is made of, and the list it lives in. */
export const LISTS = {
  location: 'locations',
  area: 'areas',
  npc: 'npcs',
  topic: 'topics',
  quest: 'quests',
  item: 'items',
  object_type: 'object_types',
  profession: 'professions',
  news: 'news',
  pattern: 'patterns',
  faction: 'factions',
  realm: 'realms',
  plan: 'plans',
  watcher: 'watchers',
  aftermath: 'aftermath',
  intention: 'intentions',
  verb: 'verbs',
  creature: 'creatures',
  encounter: 'encounters',
  region: 'regions',
  settlement: 'settlements',
  route: 'routes',
  outland: 'outlands',
  resource: 'resources',
} as const
export type EntityKind = keyof typeof LISTS
export const ENTITY_KINDS = Object.keys(LISTS) as EntityKind[]

export type Raw = Record<string, unknown>

/** One change: the whole entity as it should be written, or no data to delete it. */
export interface Edit {
  kind: EntityKind
  id: string
  data?: Raw
  /** For a new entity: the file to put it in, when not where things of its kind usually go. */
  file?: string
}

export interface FileChange {
  path: string
  /** The text before; missing for a new file. */
  before?: string
  text: string
}

export interface EditResult {
  ok: boolean
  problems: string[]
  /** The world as it loads with the edits. */
  content?: Content
  /** All files after the edits. */
  files: ContentFile[]
  /** Only the files that changed. */
  changes: FileChange[]
}

/** Where an entity is written: its file, its place in the list, and its data as written (without defaults). */
export interface Located {
  file: string
  index: number
  raw: Raw
}

const isYaml = (path: string) => /\.ya?ml$/.test(path)

function listIn(text: string, list: string): { doc: Document; seq: YAMLSeq } | undefined {
  if (!new RegExp(`^${list}:`, 'm').test(text)) return undefined
  const doc = parseDocument(text)
  const seq = doc.get(list, true)
  return isSeq(seq) ? { doc, seq } : undefined
}

function itemId(node: unknown): string | undefined {
  if (!isMap(node)) return undefined
  const id = node.get('id')
  return typeof id === 'string' ? id : undefined
}

/** Every entity of a kind, with its file and data as written. */
export function entities(files: ContentFile[], kind: EntityKind): (Located & { id: string })[] {
  const out: (Located & { id: string })[] = []
  for (const file of sorted(files)) {
    if (!isYaml(file.path)) continue
    const found = listIn(file.text, LISTS[kind])
    found?.seq.items.forEach((node, index) => {
      const id = itemId(node)
      if (id) out.push({ id, file: file.path, index, raw: (node as YAMLMap).toJSON() as Raw })
    })
  }
  return out
}

/** One entity: where it is and what is written. */
export function locate(files: ContentFile[], kind: EntityKind, id: string): Located | undefined {
  for (const file of sorted(files)) {
    if (!isYaml(file.path) || !file.text.includes(id)) continue
    const found = listIn(file.text, LISTS[kind])
    const index = found?.seq.items.findIndex((node) => itemId(node) === id) ?? -1
    if (found && index >= 0) return { file: file.path, index, raw: (found.seq.items[index] as YAMLMap).toJSON() as Raw }
  }
  return undefined
}

/** The YAML of one entity as the editor shows it: the item of its list, without the list around it. */
export function entityYaml(files: ContentFile[], kind: EntityKind, id: string): string | undefined {
  const at = locate(files, kind, id)
  const file = at && files.find((f) => f.path === at.file)
  if (!at || !file) return undefined
  const node = listIn(file.text, LISTS[kind])!.seq.items[at.index] as YAMLMap
  return dedent(itemText(LISTS[kind], node))
}

/** Reads what the editor's YAML box holds back into an entity. */
export function parseEntityYaml(text: string): { raw?: Raw; problem?: string } {
  try {
    const doc = parseDocument(text)
    if (doc.errors.length) return { problem: doc.errors[0]!.message.split('\n')[0] }
    const value = doc.toJSON() as unknown
    if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === 'object') return { raw: value[0] as Raw }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { problem: 'Write one thing, as a mapping with an id.' }
    return { raw: value as Raw }
  } catch (error) {
    return { problem: (error as Error).message }
  }
}

/**
 * Applies edits to the files of one world and loads the world with them.
 * Nothing is kept when the world would not load: the result then has the
 * problems and no content.
 */
export function applyEdits(files: ContentFile[], edits: Edit[]): EditResult {
  let next = files.map((f) => ({ ...f }))
  const problems: string[] = []
  for (const edit of edits) {
    const result = applyOne(next, edit)
    if (typeof result === 'string') problems.push(result)
    else next = result
  }
  if (problems.length) return { ok: false, problems, files, changes: [] }
  const before = new Map(files.map((f) => [f.path, f.text]))
  const changes: FileChange[] = next
    .filter((f) => before.get(f.path) !== f.text)
    .map((f) => ({ path: f.path, ...(before.has(f.path) ? { before: before.get(f.path)! } : {}), text: f.text }))
  if (!changes.length) return { ok: true, problems: [], files, changes }
  const loaded = tryLoad(next)
  if (!loaded.content) return { ok: false, problems: loaded.problems ?? [], files, changes: [] }
  return { ok: true, problems: [], content: loaded.content, files: next, changes }
}

function tryLoad(files: ContentFile[]): { content?: Content; problems?: string[] } {
  try {
    return { content: loadContent(files) }
  } catch (error) {
    return { problems: error instanceof ContentError ? error.problems : [String(error)] }
  }
}

function applyOne(files: ContentFile[], edit: Edit): ContentFile[] | string {
  const list = LISTS[edit.kind]
  if (!/^[a-z0-9_]+$/.test(edit.id)) return `${edit.id}: an id is lower case letters, digits and underscores`
  if (edit.data && edit.data['id'] !== edit.id) return `${edit.id}: the id cannot change; make a new one and delete the old`
  const at = locate(files, edit.kind, edit.id)
  const replace = (path: string, text: string) => files.map((f) => (f.path === path ? { ...f, text } : f))

  // Delete: the item's lines go, the rest of the file stays.
  if (!edit.data) {
    if (!at) return `${edit.id}: there is no ${edit.kind.replace('_', ' ')} with this id`
    const file = files.find((f) => f.path === at.file)!
    const { doc, seq } = listIn(file.text, list)!
    if (seq.items.length === 1) {
      seq.items = []
      seq.flow = true
      return replace(file.path, doc.toString({ lineWidth: 0 }))
    }
    const node = seq.items[at.index] as YAMLMap
    const start = lineStart(file.text, node.range![0])
    let before = file.text.slice(0, start)
    let after = file.text.slice(node.range![2])
    // One blank line between the neighbours, as there was around the item.
    if (/\n\n$/.test(before) && /^\n/.test(after)) after = after.replace(/^\n+/, '')
    if (!after.trim()) {
      before = before.replace(/\n+$/, '\n')
      after = ''
    }
    return replace(file.path, before + after)
  }

  // Change: the item is patched field by field, so its own comments survive, and written again in place.
  if (at) {
    const file = files.find((f) => f.path === at.file)!
    const { seq } = listIn(file.text, list)!
    const node = seq.items[at.index] as YAMLMap
    if (same(node.toJSON(), edit.data)) return files
    const doc = new Document()
    patchMap(doc, node, edit.data)
    const start = lineStart(file.text, node.range![0])
    const end = node.range![2]
    const tail = /\s*$/.exec(file.text.slice(start, end))![0]
    return replace(file.path, file.text.slice(0, start) + itemText(list, node).trimEnd() + tail + file.text.slice(end))
  }

  // New: at the end of the list in the file where things like it live.
  const path = edit.file ?? homeFile(files, edit.kind, edit.data)
  if (!/^[a-z0-9_./-]+\.yaml$/.test(path) || path.includes('..')) return `${edit.id}: ${path} is not a content file`
  const doc = new Document()
  const node = makeNode(doc, edit.data, 0) as YAMLMap
  const text = itemText(list, node)
  const file = files.find((f) => f.path === path)
  if (!file) return [...files, { path, text: `${list}:\n${text}` }]
  const found = listIn(file.text, list)
  if (!found) return replace(path, `${file.text.trimEnd()}\n\n${list}:\n${text}`)
  const last = found.seq.items.at(-1) as Node | undefined
  if (!last || found.seq.flow) {
    found.seq.flow = false
    found.seq.items.push(node)
    return replace(path, found.doc.toString({ lineWidth: 0 }))
  }
  const end = last.range![2]
  const before = file.text.slice(0, end).replace(/\n*$/, '\n')
  return replace(path, `${before}\n${text}${file.text.slice(end).replace(/^\n*/, (m) => (m ? '\n' : ''))}`.replace(/\n{3,}$/, '\n'))
}

/** The files with one entity written again as the editor writes it, and nothing else changed: to show that writing loses nothing. */
export function rewritten(files: ContentFile[], kind: EntityKind, id: string): ContentFile[] {
  const at = locate(files, kind, id)
  if (!at) return files
  const file = files.find((f) => f.path === at.file)!
  const node = listIn(file.text, LISTS[kind])!.seq.items[at.index] as YAMLMap
  const start = lineStart(file.text, node.range![0])
  const end = node.range![2]
  const tail = /\s*$/.exec(file.text.slice(start, end))![0]
  const text = file.text.slice(0, start) + itemText(LISTS[kind], node).trimEnd() + tail + file.text.slice(end)
  return files.map((f) => (f.path === file.path ? { ...f, text } : f))
}

// ---------------------------------------------------------------- where new things go

/** The folder of the world these files belong to: "base/", "isle/", or "" for a world at the root. */
export function worldPrefix(files: ContentFile[]): string {
  const world = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  return world ? world.path.replace(/world\.ya?ml$/, '') : ''
}

/** The file a new entity goes in: next to others of its kind and place. */
export function homeFile(files: ContentFile[], kind: EntityKind, data: Raw): string {
  const prefix = worldPrefix(files)
  const list = LISTS[kind]
  const locations = entities(files, 'location')
  const areaDir = (area: string): string | undefined => {
    const inArea = locations.find((l) => l.raw['area'] === area)
    if (inArea) return inArea.file.replace(/[^/]+$/, '')
    // A new area: a folder beside the other areas' folders.
    const other = locations.find((l) => /\/areas\/[^/]+\/[^/]+$/.test(l.file))
    return other ? other.file.replace(/[^/]+\/[^/]+$/, `${area}/`) : `${prefix}areas/${area}/`
  }
  if (kind === 'location') {
    const area = String(data['area'] ?? '')
    const same = locations.find((l) => l.raw['area'] === area)
    return same ? same.file : `${areaDir(area)}locations.yaml`
  }
  if (kind === 'npc') {
    const home = locations.find((l) => l.id === data['home'])
    const area = String(home?.raw['area'] ?? '')
    const people = entities(files, 'npc')
    const neighbour = people.find((n) => locations.find((l) => l.id === n.raw['home'])?.raw['area'] === area)
    if (neighbour) return neighbour.file
    return `${areaDir(area)}npcs.yaml`
  }
  if (kind === 'region') return `${prefix}regions/${String(data['id'])}/region.yaml`
  const counts = new Map<string, number>()
  for (const e of entities(files, kind)) counts.set(e.file, (counts.get(e.file) ?? 0) + 1)
  const best = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return best ? best[0] : `${prefix}data/${list}.yaml`
}

// ---------------------------------------------------------------- writing one item

/** One item of a list as its lines in the file: "  - id: ...", ending in a newline. */
function itemText(list: string, node: YAMLMap): string {
  const copy = node.clone() as YAMLMap
  copy.commentBefore = undefined
  copy.spaceBefore = false
  const doc = new Document({ [list]: [] })
  ;(doc.get(list) as YAMLSeq).items.push(copy)
  const plain = doc.toString({ lineWidth: 0 }).replace(/^[^\n]*\n/, '')
  // The house style writes lists without inner spaces, [a, b]; keep it when that reads back the same.
  const tight = tightenSeqs(plain)
  return tight !== plain && same(parseDocument(`${list}:\n${tight}`).toJSON(), parseDocument(`${list}:\n${plain}`).toJSON()) ? tight : plain
}

function tightenSeqs(text: string): string {
  let out = ''
  let quote: string | undefined
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quote) {
      out += c
      if (c === '\\' && quote === '"') out += text[++i] ?? ''
      else if (c === quote) quote = undefined
      continue
    }
    if (c === '"' || (c === "'" && /[\s[{,:]/.test(text[i - 1] ?? ' '))) {
      quote = c
      out += c
    } else if (c === '[' && text[i + 1] === ' ' && text[i + 2] !== ']') {
      out += '['
      i++
    } else if (c === ' ' && text[i + 1] === ']' && text[i - 1] !== '[') {
      // drop the space before the bracket
    } else out += c
  }
  return out
}

function dedent(text: string): string {
  // "  - id: x\n    name: y" as "id: x\nname: y".
  return text.replace(/^ {2}- /, '').replace(/^ {4}/gm, '')
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1
}

// ---------------------------------------------------------------- patching nodes

/** Changes a map in place to hold `value`, keeping what did not change (and its comments). */
function patchMap(doc: Document, node: YAMLMap, value: Raw): void {
  const keys = new Set(Object.keys(value).filter((k) => value[k] !== undefined))
  node.items = node.items.filter((pair) => keys.has(String(isScalar(pair.key) ? pair.key.value : pair.key)))
  for (const [key, want] of Object.entries(value)) {
    const pair = node.items.find((p) => String(isScalar(p.key) ? p.key.value : p.key) === key)
    if (!pair) {
      if (want !== undefined) node.set(key, makeNode(doc, want, depthOf(node) + 1))
      continue
    }
    const current = pair.value
    if (same(isNodeLike(current) ? current.toJSON() : current, want)) continue
    if (isMap(current) && isPlainObject(want)) patchMap(doc, current, want)
    else if (isScalar(current) && (typeof want !== 'object' || want === null)) {
      current.value = want
      if (typeof want === 'string' && want.includes('\n')) current.type = Scalar.BLOCK_LITERAL
      else if (current.type === Scalar.BLOCK_LITERAL || current.type === Scalar.BLOCK_FOLDED) current.type = undefined
    } else pair.value = makeNode(doc, want, depthOf(node) + 1)
  }
}

const depthOf = (node: YAMLMap): number => (node.flow ? 3 : 1)

/** A node for a new value, in the house style: short lists and small maps of plain values on one line. */
function makeNode(doc: Document, value: unknown, depth: number): Node {
  if (Array.isArray(value)) {
    const seq = doc.createNode([]) as YAMLSeq
    for (const v of value) seq.items.push(makeNode(doc, v, depth + 1))
    seq.flow = value.every((v) => v === null || typeof v !== 'object') && JSON.stringify(value).length < 100
    return seq
  }
  if (isPlainObject(value)) {
    const map = doc.createNode({}) as YAMLMap
    for (const [k, v] of Object.entries(value)) if (v !== undefined) map.set(k, makeNode(doc, v, depth + 1))
    const simple = Object.values(value).every((v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => typeof x !== 'object')))
    map.flow = depth > 0 && simple && Object.keys(value).length <= 8 && JSON.stringify(value).length < 110 && !Object.values(value).some((v) => typeof v === 'string' && v.includes('\n'))
    return map
  }
  const scalar = doc.createNode(value) as Scalar
  if (typeof value === 'string' && value.includes('\n')) scalar.type = Scalar.BLOCK_LITERAL
  return scalar
}

function isPlainObject(value: unknown): value is Raw {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNodeLike(value: unknown): value is { toJSON(): unknown } {
  return Boolean(value) && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function'
}

/** Deep equality of plain data. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((v, i) => same(v, (b as unknown[])[i]))
  const ka = Object.keys(a as Raw).filter((k) => (a as Raw)[k] !== undefined)
  const kb = Object.keys(b as Raw).filter((k) => (b as Raw)[k] !== undefined)
  return ka.length === kb.length && ka.every((k) => same((a as Raw)[k], (b as Raw)[k]))
}

function sorted(files: ContentFile[]): ContentFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path))
}
