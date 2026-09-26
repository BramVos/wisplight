import { resolve } from 'node:path'
import { Engine, GameClock, type Content } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

export const content = await loadContentFromDir(resolve(import.meta.dirname, '../content'))

export function newEngine(seed = 1, source: Content = content): Engine {
  return new Engine(source, { seed })
}

/** Runs the world until the given day of Herfstmaand 211 AW and hour. */
export function runUntil(engine: Engine, day: number, hour: number, minute = 0): void {
  const target = GameClock.from(211, 9, day, hour, minute).minutes
  if (target > engine.world.now) engine.tick(target - engine.world.now)
}

/** A copy of the content with one NPC changed. */
export function withNpc(id: string, change: (npc: ReturnType<Content['npcs']['get']> & object) => void): Content {
  const npcs = new Map(content.npcs)
  const npc = structuredClone(npcs.get(id)!)
  change(npc)
  npcs.set(id, npc)
  return { ...content, npcs }
}

export function eventsBy(engine: Engine, actor: string): string[] {
  return engine.state.events.filter((e) => e.actor === actor).map((e) => e.text)
}
