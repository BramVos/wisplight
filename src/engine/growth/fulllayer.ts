import { FileSchema, type Content } from '../content'
import { CONTENT_LISTS } from '../contentfiles'
import type { GameState } from '../state'
import type { World } from '../world'

// The state and the layer of regions built in full (M10.25), apart from the
// rounds that build them (regionfull.ts): which rounds there are and which
// are done, and what the content of a game lays over what was there. None of
// it needs the editor (M10.26: loading edit.ts first went round through
// growth.ts, regionstory.ts, regionfull.ts and editor.ts, and stopped on
// "Cannot access 'ENTITY_KINDS' before initialization").

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
