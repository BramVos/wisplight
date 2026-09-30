import type { Content, Direction, Location, Quest } from '../content'
import { wordsOf } from '../said'

// Can a quest be solved? (M10.30 (6); Bram, 29 September 2026: is there a
// check that quests can be done? Until now only that what they name exists.)
// For every stage a way on: the flag a next stage waits for is set somewhere,
// a thing asked for can be had (sold, found, carried by someone, given or
// made), the places and people there are; and a way to end. It reads the
// world as it stands, not a game: whether a person will live is not known.

type Raw = Record<string, unknown>
type Exit = NonNullable<Location['exits'][Direction]>

/** What the world can make true: the flags set anywhere, and the things that can be had. */
interface Means {
  flags: Set<string>
  things: Set<string>
  /** Every word the world tells a player somewhere, spaced: for a word a quest waits to hear (M10.31 C). */
  told: string
  /** What only a secret tells that needs a roll to get out (M10.33 U): no given_when, no trust. */
  rolled: string
  /** The places behind secret or waiting ways that never open (M10.32), with why. */
  shut: Map<string, string>
}

/** Keys whose text nobody is told: what the player types, what a condition asks, a lock's own word, patterns. */
const UNTOLD = new Set(['said', 'word', 'say', 'words', 'id', 'when', 'unless', 'not_yet'])

/** The words of every text under a tree, but for the keys nobody is told. */
function toldIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) toldIn(v, out)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value as Raw)) if (!UNTOLD.has(k)) toldIn(v, out)
  return out
}

/** Every value under a key in a tree, as strings: the flags an effect sets, the things given. */
function valuesOf(value: unknown, key: string, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) valuesOf(v, key, out)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Raw)) {
      if (k === key && typeof v === 'string') out.add(v)
      else valuesOf(v, key, out)
    }
  }
  return out
}

/** What the content can make true, read once for a whole world. */
function meansOf(content: Content): Means {
  const kinds = [content.quests, content.objectTypes, content.aftermath, content.plans, content.intentions, content.encounters, content.locations, content.creatures, content.watchers]
  const all = kinds.flatMap((m) => [...m.values()])
  const flags = valuesOf(all, 'set')
  // A thing can be had where the world names it outside the asking: for sale, lying about, carried, given, made, gathered.
  const things = new Set<string>([...valuesOf(all, 'give'), ...valuesOf(all, 'item'), ...valuesOf(all, 'produces'), ...valuesOf([...content.resources.values()], 'item')])
  for (const l of content.locations.values()) {
    for (const id of Object.keys(l.items)) things.add(id)
    for (const s of l.services) for (const id of Object.keys(s.sells)) things.add(id)
  }
  for (const n of content.npcs.values()) for (const id of Object.keys(n.inventory)) things.add(id)
  for (const c of content.crafts.values()) for (const t of Object.values(c as unknown as Raw)) for (const id of valuesOf(t, 'produces')) things.add(id)
  // What a player can be told: what people know, hide and say, what places, things and topics say, what deeds bring.
  // A secret without a right (given_when) or trust (about) is got only by a roll (M10.33 U): no way of its own.
  const rollOnly = (s: { given_when?: unknown[]; about?: string[] }) => !(s.given_when?.length || s.about?.length)
  const people = [...content.npcs.values()].map((n) => ({ ...n, secrets: n.secrets.filter((s) => !rollOnly(s)) }))
  const told = ` ${wordsOf(toldIn([...all, ...people, ...content.topics.values(), ...content.items.values()]).join(' '))} `
  const rolled = ` ${wordsOf(toldIn([...content.npcs.values()].flatMap((n) => n.secrets.filter(rollOnly))).join(' '))} `
  const means = { flags, things, told, rolled, shut: new Map<string, string>() }
  means.shut = shutPlaces(content, means)
  return means
}

/**
 * The places no way ever opens into (M10.32; the gap of M10.30: the check did
 * not look at exits). A place reached only by secret or waiting ways opens
 * when one of them can, from a place that is open itself: a secret way that
 * something hidden of that place reveals, or whose `when` can hold; a waiting
 * way whose `when` can hold. A lock shuts nothing: it can be picked or forced.
 */
function shutPlaces(content: Content, means: Means): Map<string, string> {
  const into = new Map<string, [string, Direction, Exit][]>()
  for (const l of content.locations.values()) {
    for (const [d, e] of Object.entries(l.exits) as [Direction, Exit][]) {
      if (!into.has(e.to)) into.set(e.to, [])
      into.get(e.to)!.push([l.id, d, e])
    }
  }
  /** Why a way never opens, or nothing when it can. */
  const closed = ([from, d, e]: [string, Direction, Exit]): string | undefined => {
    const waits = e.when?.length ? never(content, means, e.when) : undefined
    if (waits) return `the way from ${from} waits for what never comes: ${waits}`
    if (!e.hidden || e.when?.length) return undefined
    const finds = content.locations.get(from)!.hidden.filter((h) => h.exit === d)
    if (!finds.length) return `the secret way from ${from} is revealed by nothing`
    return finds.every((h) => h.when && never(content, means, h.when)) ? `the secret way from ${from} is found by nothing that can be found: ${never(content, means, finds[0]!.when!)}` : undefined
  }
  const shut = new Map<string, string>()
  for (const [id, ways] of into) if (ways.every(([, , e]) => e.hidden || e.when?.length)) shut.set(id, '')
  // Open what an open place's way can open, until nothing more opens.
  for (let opened = true; opened; ) {
    opened = false
    for (const id of shut.keys()) {
      if (into.get(id)!.some((w) => !shut.has(w[0]) && !closed(w))) {
        shut.delete(id)
        opened = true
      }
    }
  }
  for (const id of shut.keys()) shut.set(id, into.get(id)!.map(closed).find(Boolean) ?? `every way into it comes from a place that never opens`)
  return shut
}

/** Why a list of conditions could never all hold, or nothing when it could. */
function never(content: Content, means: Means, when: readonly unknown[]): string | undefined {
  for (const c of when as Raw[]) {
    const why = neverOne(content, means, c)
    if (why) return why
  }
  return undefined
}

function neverOne(content: Content, means: Means, c: Raw): string | undefined {
  if (Array.isArray(c['any'])) {
    const whys = (c['any'] as Raw[]).map((x) => neverOne(content, means, x))
    return whys.every(Boolean) ? whys[0] : undefined
  }
  if (Array.isArray(c['all'])) return never(content, means, c['all'] as Raw[])
  if (c['not'] !== undefined) return undefined
  if (typeof c['flag'] === 'string' && !means.flags.has(c['flag'])) return `the flag ${c['flag']} is set nowhere`
  if (typeof c['has'] === 'string') {
    if (!content.items.has(c['has'])) return `there is no thing ${c['has']}`
    if (!means.things.has(c['has'])) return `${c['has']} cannot be had anywhere: nobody sells, carries, gives or makes it, and it lies nowhere`
  }
  if (typeof c['at'] === 'string' && !content.locations.has(c['at']) && !content.areas.has(c['at'])) return `there is no place ${c['at']}`
  // A place no way ever opens into (M10.32).
  if (typeof c['at'] === 'string' && means.shut.has(c['at'])) return `${c['at']} never opens: ${means.shut.get(c['at'])}`
  if (typeof c['alive'] === 'string' && !content.npcs.has(c['alive'])) return `there is nobody ${c['alive']}`
  if (typeof c['here'] === 'string' && !content.npcs.has(c['here'])) return `there is nobody ${c['here']}`
  if (typeof c['talked'] === 'string' && !content.npcs.has(c['talked'])) return `there is nobody ${c['talked']}`
  // A word waited for (M10.31 C): the stranger must be able to learn it somewhere.
  if (typeof c['said'] === 'string' && !means.told.includes(` ${wordsOf(c['said'])} `)) return means.rolled.includes(` ${wordsOf(c['said'])} `) ? `the word "${c['said']}" is told only in a secret that takes a roll: give that secret given_when, so someone gives it when it matters` : `the word "${c['said']}" is told nowhere a player could learn it`
  if (typeof c['said'] === 'string' && typeof c['to'] === 'string' && !content.npcs.has(c['to'])) return `there is nobody ${c['to']}`
  for (const key of ['stage', 'outcome'] as const) {
    if (typeof c[key] !== 'string') continue
    const [quest, part] = (c[key] as string).split(':')
    const q = content.quests.get(quest ?? '')
    if (!q) return `there is no quest ${quest}`
    if (key === 'stage' && !(q.stages ?? []).some((s) => s.id === part)) return `${quest} has no stage ${part}`
    if (key === 'outcome' && !(q.outcomes ?? []).some((o) => o.id === part)) return `${quest} has no outcome ${part}`
  }
  return undefined
}

/**
 * Why a quest could not be solved as the world stands, as lines for Check:
 * a stage with no way on, a deed at a place or with someone who is not there,
 * no way to end. None: it can be done.
 */
export function solvableProblems(content: Content, quest: Quest, means: Means = meansOf(content)): string[] {
  const problems: string[] = []
  const at = (what: string) => `quest ${quest.id}, ${what}`
  const outcomes = quest.outcomes ?? []
  if (!outcomes.length) problems.push(at('no way to end: it has no outcome'))
  else if (outcomes.every((o) => never(content, means, o.when))) problems.push(at(`no way to end: ${never(content, means, outcomes[0]!.when)}`))
  for (const stage of quest.stages ?? []) {
    if (!stage.next.length) continue
    const whys = stage.next.map((n) => never(content, means, n.when))
    if (whys.every(Boolean)) problems.push(at(`stage ${stage.id}: no way on, ${whys[0]}`))
  }
  for (const action of quest.actions ?? []) {
    for (const place of action.at) if (!content.locations.has(place) && !content.areas.has(place)) problems.push(at(`deed ${action.id}: there is no place ${place}`))
    // Done where nobody can come (M10.32): behind a secret or waiting way that never opens.
    for (const place of action.at) if (means.shut.has(place)) problems.push(at(`deed ${action.id}: ${place} never opens: ${means.shut.get(place)}`))
    if (action.with && !content.npcs.has(action.with)) problems.push(at(`deed ${action.id}: there is nobody ${action.with}`))
  }
  return problems
}

/** Every quest of a world that could not be solved, for Check. */
export function unsolvable(content: Content): string[] {
  const means = meansOf(content)
  return [...content.quests.values()].flatMap((q) => solvableProblems(content, q, means))
}
