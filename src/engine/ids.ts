import type { Content } from './content'
import type { GameState } from './state'

// Ids are keys (M9.1; FO chapter 15, design "Na M8.5: in M9.1"). A name, a
// label or a description may change; an id never does. What went from a
// world left a tombstone in its register: gone, or gone up in another thing.
// A save, a game log and the chronicle follow the tombstones when they load.
// And so that a log plays back exactly after a name changed, a new game
// writes the names it began with at the head of its log; playing it back
// uses those names, and the game goes on with the new ones.

/** The names of everything the player can name, as the game began with them. */
export interface NameBook {
  npcs: Record<string, string[]>
  locations: Record<string, string[]>
  items: Record<string, string[]>
  topics: Record<string, string[]>
  areas: Record<string, string[]>
  objectTypes: Record<string, string[]>
}

export function nameBook(content: Content): NameBook {
  const book = <T extends { id: string }>(map: Map<string, T>, names: (e: T) => (string | undefined)[]) => Object.fromEntries([...map.values()].map((e) => [e.id, names(e).map((n) => n ?? '')]))
  return {
    npcs: book(content.npcs, (n) => [n.name, n.short, ...n.aliases]),
    locations: book(content.locations, (l) => [l.name, ...l.aliases]),
    items: book(content.items, (i) => [i.name, i.plural, ...i.aliases]),
    topics: book(content.topics, (t) => [t.name, ...t.aliases]),
    areas: book(content.areas, (a) => [a.name, ...a.aliases]),
    objectTypes: book(content.objectTypes, (o) => [o.name, ...o.aliases]),
  }
}

/** The content with the names of the book, where they differ: to play back a log as it was played. */
export function withNames(content: Content, book: NameBook): Content {
  const renamed = <T extends { id: string }>(map: Map<string, T>, names: Record<string, string[]>, apply: (e: T, n: string[]) => T): Map<string, T> => {
    let out: Map<string, T> | undefined
    for (const [id, n] of Object.entries(names)) {
      const e = map.get(id)
      if (!e) continue
      const next = apply(e, n)
      if (JSON.stringify(next) === JSON.stringify(e)) continue
      ;(out ??= new Map(map)).set(id, next)
    }
    return out ?? map
  }
  return {
    ...content,
    npcs: renamed(content.npcs, book.npcs, (e, [name, short, ...aliases]) => ({ ...e, name: name!, short: short!, aliases })),
    locations: renamed(content.locations, book.locations, (e, [name, ...aliases]) => ({ ...e, name: name!, aliases })),
    items: renamed(content.items, book.items, (e, [name, plural, ...aliases]) => ({ ...e, name: name!, ...(plural ? { plural } : {}), aliases })),
    topics: renamed(content.topics, book.topics, (e, [name, ...aliases]) => ({ ...e, name: name!, aliases })),
    areas: renamed(content.areas, book.areas, (e, [name, ...aliases]) => ({ ...e, name: name!, aliases })),
    objectTypes: renamed(content.objectTypes, book.objectTypes, (e, [name, ...aliases]) => ({ ...e, name: name!, aliases })),
  }
}

/** What the tombstones say: which ids went into which, and which are gone. */
function graves(content: Pick<Content, 'lock'>): { into: Map<string, string>; gone: Set<string> } {
  const into = new Map<string, string>()
  const gone = new Set<string>()
  for (const t of content.lock?.tombstones ?? []) {
    if (t.into) into.set(t.id, t.into)
    else gone.add(t.id)
  }
  // A chain of merges ends where the last one went.
  for (const [from, to] of into) {
    let end = to
    for (let n = 0; into.has(end) && n < 20; n++) end = into.get(end)!
    into.set(from, end)
  }
  return { into, gone }
}

/** An id, or a key made of one (loc_x/object, loc_x#service), as the tombstones have it now; undefined when it is gone. */
function follow(key: string, into: Map<string, string>, gone: Set<string>): string | undefined {
  const cut = key.search(/[/#|:]/)
  const head = cut < 0 ? key : key.slice(0, cut)
  if (gone.has(head)) return undefined
  const to = into.get(head)
  return to ? `${to}${cut < 0 ? '' : key.slice(cut)}` : key
}

function walk(value: unknown, into: Map<string, string>, gone: Set<string>): unknown {
  if (typeof value === 'string') return into.size && into.has(value) ? into.get(value) : value
  if (Array.isArray(value)) return value.filter((v) => !(typeof v === 'string' && gone.has(v))).map((v) => walk(v, into, gone))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = follow(k, into, gone)
      if (key === undefined) continue
      out[key] = walk(v, into, gone)
    }
    return out
  }
  return value
}

/**
 * A save follows the tombstones of its world (M9.1): what went into another
 * is that other now, in every key and reference; what is gone is dropped,
 * and someone standing in a place that is gone goes home (the player to the
 * start). Nothing to do for a world without tombstones.
 */
export function followTombstones(content: Content, state: GameState): GameState {
  const { into, gone } = graves(content)
  if (!into.size && !gone.size) return state
  const next = walk(state, into, gone) as GameState
  const start = content.world.start.location
  const known = (id: string | undefined) => Boolean(id && (content.locations.has(id) || /^hex_/.test(id)))
  if (!known(next.player.location)) next.player.location = start
  for (const [id, npc] of Object.entries(next.npcs)) {
    const home = content.npcs.get(id)?.home ?? start
    if (!known(npc.location)) npc.location = home
    if (npc.stayAt && !known(npc.stayAt.where)) delete npc.stayAt
  }
  return next
}

/** The entries of a game log, following the tombstones too: what the model wrote and what was chosen. */
export function followTombstonesInLog<T>(content: Content, log: T[]): T[] {
  const { into, gone } = graves(content)
  if (!into.size && !gone.size) return log
  return log.map((e) => walk(e, into, gone) as T)
}
