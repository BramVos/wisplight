import { frameOf, landOfPlace } from './lands'
import type { World } from './world'

// Standing (M8.2; design: signalen en nasleep, "Stand, en je erboven
// gedragen"). Five steps, worked out and never stored: the money of a
// household against the middle of the region, and a step up for an office.
// It changes how someone speaks, where they spend their free time and who
// looks down on whom. Rising two steps is a signal (rose_in_standing).

export const STANDINGS = ['poor', 'common', 'burgher', 'well-to-do', 'notable'] as const

/** Offices that raise standing by one: a world names its own (world.yaml standing.offices); without them, none (M10.17). */
const OFFICES: string[] = []

/** The words of a world for the five standings, lowest first; a land's own (M10.23). */
export function standingNames(world: World, land?: string): readonly string[] {
  return frameOf(world.content, land).standing?.names ?? STANDINGS
}

/** The land someone lives in (M10.23): their standing is among its households. */
export function landOfNpc(world: World, id: string): string | undefined {
  return world.content.npcs.has(id) ? landOfPlace(world.content, world.npc(id).home)?.id : undefined
}

/** Who counts for standing: grown people in the world, not spirits or beasts. */
function counts(world: World, id: string): boolean {
  const s = world.state.npcs[id]
  if (!s || s.dead || !world.content.npcs.has(id)) return false
  const npc = world.npc(id)
  return !npc.child && !npc.quirks.includes('spirit') && !npc.creature && npc.profession !== 'cat'
}

/** The household of someone for standing: their household, or they alone. */
export function householdKey(world: World, id: string): string {
  return world.npc(id).household ?? id
}

const cache = new WeakMap<World, { t: number; purses: Map<string, number>; lands: Map<string, string | undefined> }>()

function households(world: World): { purses: Map<string, number>; lands: Map<string, string | undefined> } {
  const cached = cache.get(world)
  if (cached && cached.t === world.now) return cached
  const purses = new Map<string, number>()
  const lands = new Map<string, string | undefined>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    if (!counts(world, id)) continue
    const key = householdKey(world, id)
    purses.set(key, (purses.get(key) ?? 0) + world.state.npcs[id]!.money)
    if (!lands.has(key)) lands.set(key, landOfNpc(world, id))
  }
  const made = { t: world.now, purses, lands }
  cache.set(world, made)
  return made
}

/** The money of every household, by household (worked out once per game minute). */
export function householdPurses(world: World): Map<string, number> {
  return households(world).purses
}

/** The purses of the households of one land (M10.23; undefined is the home land); in a world of one land, all. */
export function landPurses(world: World, land: string | undefined, purses = householdPurses(world)): Map<string, number> {
  if (!world.content.lands.size) return purses
  const lands = households(world).lands
  return new Map([...purses].filter(([key]) => lands.get(key) === land))
}

/** The middle of the region: the median purse of its households; by default of the land the stranger is in (M10.23). */
export function middlePurse(world: World, purses = landPurses(world, world.land)): number {
  const sorted = [...purses.values()].sort((a, b) => a - b)
  if (!sorted.length) return 1
  const mid = Math.floor(sorted.length / 2)
  return Math.max(1, sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2)
}

/** Per game minute, as the purses (M9.3): the middle of each land (M10.23), who holds an office by household, and the levels asked for. */
const levels = new WeakMap<World, { t: number; purses: Map<string, number>; middles: Map<string, number>; office: Set<string>; level: Map<string, number> }>()

/** Standing 1 (poor) to 5 (notable) of the household of someone. */
export function standingOf(world: World, id: string, purses?: Map<string, number>): number {
  if (!counts(world, id)) return 2
  // Worked out once a game minute (M9.3): talk at a crowded place asked it for every pair, again and again.
  let c = levels.get(world)
  const own = householdPurses(world)
  if (!c || c.t !== world.now || c.purses !== own) {
    // An office is one of the land the holder lives in (M10.23).
    const offices = (m: string) => frameOf(world.content, landOfNpc(world, m)).standing?.offices ?? OFFICES
    const office = new Set(Object.keys(world.state.npcs).filter((m) => counts(world, m) && offices(m).includes(world.npc(m).profession)).map((m) => householdKey(world, m)))
    c = { t: world.now, purses: own, middles: new Map(), office, level: new Map() }
    levels.set(world, c)
  }
  const using = purses ?? own
  const known = using === own ? c.level.get(id) : undefined
  if (known !== undefined) return known
  // Against the middle of the land they live in (M10.23): a stranger's standing does not travel, nor anyone's.
  const land = landOfNpc(world, id)
  let middle = using === own ? c.middles.get(land ?? '') : undefined
  if (middle === undefined) {
    middle = middlePurse(world, landPurses(world, land, using))
    if (using === own) c.middles.set(land ?? '', middle)
  }
  const ratio = (using.get(householdKey(world, id)) ?? 0) / middle
  let level = ratio < 0.5 ? 1 : ratio < 1.5 ? 2 : ratio < 3 ? 3 : ratio < 6 ? 4 : 5
  if (c.office.has(householdKey(world, id))) level = Math.max(3, level + 1)
  level = Math.min(5, level)
  if (using === own) c.level.set(id, level)
  return level
}

export function standingName(world: World, level: number, land?: string): string {
  return standingNames(world, land)[Math.max(1, Math.min(5, level)) - 1]!
}

/**
 * The line on the voice card (design: "De stem krijgt een regel over stand en
 * herkomst"): where they stand now, and where they come from if that differs.
 */
export function standingLine(world: World, id: string): string | undefined {
  if (!counts(world, id)) return undefined
  const now = standingOf(world, id)
  const land = landOfNpc(world, id)
  const was = world.state.layer?.standing?.[householdKey(world, id)]?.from
  const from = was !== undefined && was < now ? ` You come from ${standingName(world, was, land)} people and have not forgotten it; others have not either.` : ''
  return `STANDING: ${standingName(world, now, land)}.${from}`
}

/** Someone of two steps higher looks down on someone lower (for gates and deeds). */
export function looksDownOn(world: World, a: string, b: string): boolean {
  return standingOf(world, a) - standingOf(world, b) >= 2
}
