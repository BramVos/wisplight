import { execFileSync } from 'node:child_process'
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

/**
 * Everyone at home, as a new game began before M10.33 M: for the tests of
 * stories that were set up and tuned on that start (the dyke, a passer-by at
 * the quay). A new game now begins with everyone where their day puts them.
 */
export function homeStart(engine: Engine): Engine {
  for (const [id, s] of Object.entries(engine.state.npcs)) {
    const npc = engine.content.npcs.get(id)
    if (npc && !s.dead && !s.absent) Object.assign(s, { location: npc.home, activity: 'at home' })
  }
  return engine
}

/**
 * The Quiet Reach as the world build made it, before Vesper Works went into
 * Port Vesper (M10.33 L): the Workshop, the hangar and its deck an area of
 * their own beside the station, for the tests of what joins two areas.
 */
export function worksApart(quiet: Content): Content {
  const areas = new Map(quiet.areas)
  areas.set('vesper_works', { ...quiet.areas.get('port_vesper')!, id: 'vesper_works', name: 'Vesper Works', aliases: ['the Works', 'Works'] })
  const locations = new Map(quiet.locations)
  for (const id of ['loc_workshop', 'loc_peregrine_hangar', 'loc_peregrine_common_deck']) locations.set(id, { ...locations.get(id)!, area: 'vesper_works' })
  return { ...quiet, areas, locations }
}

export function eventsBy(engine: Engine, actor: string): string[] {
  return engine.state.events.filter((e) => e.actor === actor).map((e) => e.text)
}

/**
 * The worlds of the repository: the folders under content/ whose world.yaml
 * git knows. A world being made in the editor, or left half made, is not
 * one of them, and the tests leave it alone (Bram, 28 September 2026: new
 * worlds and worlds in the making must not fail the tests); the editor's
 * Check is for those. Without git (a copy of the folder), every world counts.
 */
export function committedWorlds(): Set<string> | undefined {
  try {
    const listed = execFileSync('git', ['ls-files', '--', 'content'], { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' })
    return new Set(listed.split('\n').map((line) => /^content\/([^/]+)\/world\.ya?ml$/.exec(line)?.[1]).filter((folder): folder is string => Boolean(folder)))
  } catch {
    return undefined
  }
}
