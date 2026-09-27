import type { World } from './world'

// Standing (M8.2; design: signalen en nasleep, "Stand, en je erboven
// gedragen"). Five steps, worked out and never stored: the money of a
// household against the middle of the region, and a step up for an office.
// It changes how someone speaks, where they spend their free time and who
// looks down on whom. Rising two steps is a signal (rose_in_standing).

export const STANDINGS = ['poor', 'common', 'burgher', 'well-to-do', 'notable'] as const

/** Offices that raise standing by one: the schout, the mayor, the prior. A world can name its own. */
const OFFICES = ['schout', 'mayor', 'prior', 'weighmaster', 'dyke_reeve', 'notary']

/** The words of a world for the five standings, lowest first. */
export function standingNames(world: World): readonly string[] {
  return world.content.world.standing?.names ?? STANDINGS
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

const cache = new WeakMap<World, { t: number; purses: Map<string, number> }>()

/** The money of every household, by household (worked out once per game minute). */
export function householdPurses(world: World): Map<string, number> {
  const cached = cache.get(world)
  if (cached && cached.t === world.now) return cached.purses
  const purses = new Map<string, number>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    if (!counts(world, id)) continue
    const key = householdKey(world, id)
    purses.set(key, (purses.get(key) ?? 0) + world.state.npcs[id]!.money)
  }
  cache.set(world, { t: world.now, purses })
  return purses
}

/** The middle of the region: the median purse of its households. */
export function middlePurse(world: World, purses = householdPurses(world)): number {
  const sorted = [...purses.values()].sort((a, b) => a - b)
  if (!sorted.length) return 1
  const mid = Math.floor(sorted.length / 2)
  return Math.max(1, sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2)
}

/** Per game minute, as the purses (M9.3): the middle, who holds an office by household, and the levels asked for. */
const levels = new WeakMap<World, { t: number; purses: Map<string, number>; middle: number; office: Set<string>; level: Map<string, number> }>()

/** Standing 1 (poor) to 5 (notable) of the household of someone. */
export function standingOf(world: World, id: string, purses?: Map<string, number>): number {
  if (!counts(world, id)) return 2
  // Worked out once a game minute (M9.3): talk at a crowded place asked it for every pair, again and again.
  let c = levels.get(world)
  const own = householdPurses(world)
  if (!c || c.t !== world.now || c.purses !== own) {
    const offices = world.content.world.standing?.offices ?? OFFICES
    const office = new Set(Object.keys(world.state.npcs).filter((m) => counts(world, m) && offices.includes(world.npc(m).profession)).map((m) => householdKey(world, m)))
    c = { t: world.now, purses: own, middle: middlePurse(world, own), office, level: new Map() }
    levels.set(world, c)
  }
  const using = purses ?? own
  const known = using === own ? c.level.get(id) : undefined
  if (known !== undefined) return known
  const ratio = (using.get(householdKey(world, id)) ?? 0) / (using === own ? c.middle : middlePurse(world, using))
  let level = ratio < 0.5 ? 1 : ratio < 1.5 ? 2 : ratio < 3 ? 3 : ratio < 6 ? 4 : 5
  if (c.office.has(householdKey(world, id))) level = Math.max(3, level + 1)
  level = Math.min(5, level)
  if (using === own) c.level.set(id, level)
  return level
}

export function standingName(world: World, level: number): string {
  return standingNames(world)[Math.max(1, Math.min(5, level)) - 1]!
}

/**
 * The line on the voice card (design: "De stem krijgt een regel over stand en
 * herkomst"): where they stand now, and where they come from if that differs.
 */
export function standingLine(world: World, id: string): string | undefined {
  if (!counts(world, id)) return undefined
  const now = standingOf(world, id)
  const was = world.state.layer?.standing?.[householdKey(world, id)]?.from
  const from = was !== undefined && was < now ? ` You come from ${standingName(world, was)} people and have not forgotten it; others have not either.` : ''
  return `STANDING: ${standingName(world, now)}.${from}`
}

/** Someone of two steps higher looks down on someone lower (for gates and deeds). */
export function looksDownOn(world: World, a: string, b: string): boolean {
  return standingOf(world, a) - standingOf(world, b) >= 2
}
