import { askOutput, mustAsk } from '../asking'
import type { Output } from '../commands'
import { checkContent, FileSchema, type Content, type ContentFile } from '../content'
import { CONTENT_LISTS, contentFilesOf } from '../contentfiles'
import type { LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { descriptionCheck } from '../builder'
import { mergeFix, polishRequest, readDraft, readPolish, recheckDraft, worldFixRequest, worldStepRequest, type Draft, type RegionScope } from '../editor'
import { recordFact } from '../news'
import { newNpcState, type GameState } from '../state'
import type { World } from '../world'
import { districtsOf } from './districts'
import { farPlaceOf } from './far'
import { grownContent, growth } from './growth'

// A new region built in full (M10.25; Bram, 29 September 2026: give the
// option to whoever wants the chronicler to do it because money is no
// object). The world build in small: the steps Places, Professions, People,
// Economy and Signals of the world build (worldStepRequest) run over the
// region, with its outline and the frame as the designer's answer, the same
// checks and the same polish round, so no step gets prompt text of its own.
// The game's content is written out as files for them (contentfiles.ts);
// what a step makes that belongs to the region is kept as a layer of the
// save, checked with the whole game's content. The story round comes last.

type Raw = Record<string, unknown>

/** The rounds of a region built in full, in order: the places polished right after they are made. */
export const FULL_ROUNDS = ['places', 'polish', 'professions', 'people', 'economy', 'watcher'] as const
export type FullRound = (typeof FULL_ROUNDS)[number]

/** What the full build made for a region, by list, and which rounds are done. */
export interface RegionFull {
  done: string[]
  entities: Record<string, Raw[]>
  t: number
  /** What came of each round: kept, or why not (M10.25: the played proof needs to see it). */
  rounds?: Record<string, { kept: boolean; problems?: string[] }>
}

/** The kinds a region's build may keep: its own things, never the world's keys, rules, factions or lines. */
const KEPT = ['areas', 'locations', 'npcs', 'professions', 'items', 'object_types', 'settlements', 'resources', 'crafts', 'topics', 'watchers', 'aftermath', 'creatures', 'encounters', 'quests'] as const
const PREFIX = 'game/'

export function fullOf(world: Pick<World, 'state'>, topic: string): RegionFull | undefined {
  return world.state.growth?.fulls?.[topic]
}

/** Whether every round of a region's full build is done. */
export function fullDone(world: Pick<World, 'state'>, topic: string): boolean {
  const done = fullOf(world, topic)?.done ?? []
  return FULL_ROUNDS.every((r) => done.includes(r))
}

/** The rounds of a region's full build still to do, in order. */
export function fullLeft(world: Pick<World, 'state'>, topic: string): FullRound[] {
  const done = fullOf(world, topic)?.done ?? []
  return FULL_ROUNDS.filter((r) => !done.includes(r))
}

// ---------------------------------------------------------------- the layer

/** The full builds of regions, for the content of a game: their things, over what was there. */
export function withFulls(content: Content, state: GameState): Content {
  const all = Object.entries(state.growth?.fulls ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (!all.some(([, f]) => Object.keys(f.entities).length)) return content
  const next = { ...content } as Record<string, unknown>
  const shape = (FileSchema as unknown as { shape: Record<string, { parse: (v: unknown) => unknown }> }).shape
  for (const [key, name] of CONTENT_LISTS) {
    const raws = all.flatMap(([, f]) => f.entities[key] ?? [])
    if (!raws.length) continue
    const map = new Map(content[name] as Map<string, { id: string }>)
    for (const item of shape[key]!.parse(raws) as { id: string }[]) map.set(item.id, item)
    next[name] = map
  }
  return next as unknown as Content
}

// ---------------------------------------------------------------- the request

/** The region's area and name, for the steps. */
function scopeOf(world: World, topic: string): RegionScope | undefined {
  const far = farPlaceOf(world, topic)
  if (!far) return undefined
  return { area: String(far.area['id']), name: world.content.topics.get(topic)?.name ?? topic }
}

/** What stands for the designer's answer: what the world book and the outline say of the region, and its frame. */
export function regionBrief(world: World, topic: string): string {
  const t = world.content.topics.get(topic)
  const quarters = districtsOf(world.content, topic)
  const frame = worldFrame(world.content, t?.land)
  return [
    `${t?.name ?? topic}: ${t?.summary ?? ''}`,
    ...(t?.details ? [t.details] : []),
    ...(t?.story ? [`What they tell of it: ${t.story}`] : []),
    ...(quarters.length ? [`Its quarters: ${quarters.map((q) => `${q.name} (${q.line})`).join('; ')}.`] : []),
    'Build it as a place people live in, with a few more places and people than it has, what they do all day, what is sold and made there, and what they mind when things change. Keep what is there.',
    ...(frame ? ['', 'THE FRAME:', frame] : []),
  ].join('\n')
}

/** The game's content as files, and the file the region's new things go into. */
function filesOf(world: World, topic: string): { files: ContentFile[]; into: string } {
  return { files: contentFilesOf(world.content, PREFIX), into: `${PREFIX}region/${topic}.yaml` }
}

/** The places of a region the checks name, for the polish round. */
function toPolish(world: World, area: string): string[] {
  const own = new Set([...world.content.locations.values()].filter((l) => l.area === area).map((l) => l.id))
  return descriptionCheck(world.content)
    .places.map((line) => line.slice(0, line.indexOf(':')))
    .filter((id) => own.has(id))
}

/** The request of one round: a step of the world build over the region, or its polish round. */
export function fullRequest(world: World, topic: string, round: FullRound): LlmRequest | undefined {
  const scope = scopeOf(world, topic)
  if (!scope) return undefined
  const { files } = filesOf(world, topic)
  const base = round === 'polish' ? polishRequest(files, toPolish(world, scope.area), true) : worldStepRequest(files, round, regionBrief(world, topic), undefined, scope)
  // A round in play counts in the game's hour, not as a build in the editor (the gateway takes a prefix for one).
  return { ...base, priority: 'low', meta: { ...(base.meta ?? {}), prefix: '', full: topic, round } }
}

/** A step's answer read and checked on the game's files; the region's file takes what is new. */
export function readFull(world: World, topic: string, round: FullRound, text: string): Draft {
  const { files, into } = filesOf(world, topic)
  if (round === 'polish') return readPolish(files, text)
  const draft = readDraft(files, text)
  // The world's keys, its rules and whole files are not a region's to set.
  return recheckDraft(files, { say: draft.say, questions: draft.questions, changes: draft.changes, into })
}

/** What a step made that belongs to the region: things new to the game, and the region's own that changed. */
export function fullLayer(world: World, topic: string, draft: Draft): Record<string, Raw[]> | undefined {
  const after = draft.result?.ok ? draft.result.content : undefined
  const scope = scopeOf(world, topic)
  if (!after || !scope) return undefined
  const before = world.content
  const areas = new Set([scope.area, ...[...after.areas.keys()].filter((id) => !before.areas.has(id))])
  const locationArea = (id: string | undefined) => (id ? (after.locations.get(id)?.area ?? '') : '')
  const own = (key: string, e: Raw): boolean => {
    if (key === 'areas' || key === 'settlements') return areas.has(String(e['id']))
    if (key === 'locations') return areas.has(String(e['area']))
    if (key === 'npcs') return areas.has(locationArea(String(e['home'])))
    return false
  }
  const plain = (v: unknown) => JSON.stringify(v)
  const layer: Record<string, Raw[]> = {}
  for (const key of KEPT) {
    const name = CONTENT_LISTS.find(([k]) => k === key)![1]
    const was = before[name] as Map<string, unknown>
    for (const e of (after[name] as Map<string, Raw>).values()) {
      const id = String(e['id'])
      const fresh = !was.has(id)
      if (!fresh && (!own(key, e) || plain(was.get(id)) === plain(e))) continue
      // Something new that is not the region's (a world's thing made elsewhere) stays out.
      if (fresh && (key === 'locations' || key === 'npcs' || key === 'areas') && !own(key, e)) continue
      ;(layer[key] ??= []).push(JSON.parse(plain(e)) as Raw)
    }
  }
  return layer
}

// ---------------------------------------------------------------- applying it

/**
 * Keeps what a round made, as a layer of the save, when the whole game's
 * content still checks; the round is done either way, so it is not asked
 * again. Returns whether it was kept.
 */
export function applyFull(world: World, topic: string, round: FullRound, layer: Record<string, Raw[]> | null, problems: string[] = []): boolean {
  const g = growth(world)
  g.fullPending = (g.fullPending ?? []).filter((k) => k !== `${topic}:${round}`)
  const had = g.fulls?.[topic] ?? { done: [], entities: {}, t: world.now }
  const merged: Record<string, Raw[]> = { ...had.entities }
  for (const [key, list] of Object.entries(layer ?? {})) {
    const byId = new Map((merged[key] ?? []).map((e) => [String(e['id']), e]))
    for (const e of list) byId.set(String(e['id']), e)
    merged[key] = [...byId.values()]
  }
  const done = [...new Set([...had.done, round])]
  const next: RegionFull = { done, entities: merged, t: had.t }
  const state = { ...world.state, growth: { ...g, fulls: { ...(g.fulls ?? {}), [topic]: next } } }
  let kept = Boolean(layer && Object.keys(layer).length)
  if (kept) {
    try {
      if (checkContent(grownContent(world.base, state)).length) kept = false
    } catch {
      kept = false
    }
  }
  const rounds = { ...(had.rounds ?? {}), [round]: { kept, ...(problems.length ? { problems: problems.slice(0, 5) } : {}) } }
  ;(g.fulls ??= {})[topic] = kept ? { ...next, rounds } : { ...had, done, rounds }
  if (kept) {
    world.regrow()
    for (const raw of layer!['npcs'] ?? []) {
      const n = world.content.npcs.get(String(raw['id']))
      if (n) world.state.npcs[n.id] ??= { ...newNpcState(n, world.now), location: n.work ?? n.home }
    }
  }
  if (fullDone(world, topic)) {
    const name = world.content.topics.get(topic)?.name ?? topic
    const count = (key: string) => (g.fulls![topic]!.entities[key] ?? []).length
    recordFact(world, {
      kind: 'region_full',
      about: [topic],
      place: String(farPlaceOf(world, topic)?.locations[0]?.['id'] ?? world.state.player.location),
      belang: 0,
      witnesses: [],
      title: `${name} built in full`,
      text: { precise: `The chronicler laid out ${name} in full: ${count('locations')} places, ${count('npcs')} people and what they live by.`, village: `${name} is a busy place, they say.`, far: `${name} is a real town.` },
    })
  }
  return kept
}

// ---------------------------------------------------------------- wanting it

/**
 * A region built in full: every round that is left, queued for the
 * chronicler, asked once for the whole above the player's threshold. Without
 * a model there is nothing to build: the story round's rules still come.
 */
export function wantFull(world: World, topic: string): Output[] {
  const g = growth(world)
  const left = fullLeft(world, topic).filter((r) => !g.fullPending?.includes(`${topic}:${r}`))
  if (!left.length || !world.aiLive || !farPlaceOf(world, topic)) return []
  const request = fullRequest(world, topic, left[0]!)
  const name = world.content.topics.get(topic)?.name ?? topic
  const asked = request ? mustAsk(world, `full:${topic}`, `Building ${name} in full, in ${left.length} rounds`, request, `build ${topic}`, left.length) : undefined
  if (asked && 'declined' in asked) return []
  if (asked) return askOutput(world, asked.ask)
  for (const r of left) (g.fullPending ??= []).push(`${topic}:${r}`)
  return []
}

/** The request to put a round right when it did not load (the world build's fix round, M10.20). */
export function fullFixRequest(world: World, topic: string, round: FullRound, draft: Draft): LlmRequest | undefined {
  const scope = scopeOf(world, topic)
  if (!scope || round === 'polish') return undefined
  const { files } = filesOf(world, topic)
  const base = worldFixRequest(files, round, regionBrief(world, topic), draft, draft.problems, scope)
  return { ...base, priority: 'low', meta: { ...(base.meta ?? {}), prefix: '', full: topic, round } }
}

/** A round with the chronicler's corrections put in, checked again on the game's files. */
export function mergeFull(world: World, topic: string, draft: Draft, text: string): Draft {
  const { files, into } = filesOf(world, topic)
  return mergeFix(files, { ...draft, into }, text)
}

/** The region whose full build is due where the stranger is: charted in play, built in full, with rounds left. */
export function fullDue(world: World): string | undefined {
  if (world.state.frames?.region !== 'full' || !world.aiLive) return undefined
  const area = world.content.locations.get(world.state.player.location)?.area
  const topic = Object.entries(world.state.growth?.far ?? {}).find(([, far]) => String(far.area['id']) === area)?.[0]
  if (!topic || !Object.values(world.state.growth?.expansions?.made ?? {}).some((m) => m.outline.id === topic)) return undefined
  const pending = world.state.growth?.fullPending ?? []
  return fullLeft(world, topic).some((r) => !pending.includes(`${topic}:${r}`)) ? topic : undefined
}
