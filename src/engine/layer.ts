import { RELATION_ROLES, type Npc, type RelationDef, type RelationRole, type Service } from './content'
import { serviceKey, type GameState, type Layer } from './state'
import type { World } from './world'

// The layer over the content (M8.1; design: signalen en nasleep, "Wereldtoestand
// die mag veranderen"). What a plan changes about people stays in the
// savegame, on top of the content, the way the lore of a game does: a new
// home, work or none, a household, a tie that changed kind or began, who
// serves where. World.npc() and ties() merge it in, so the rest of the engine
// reads one person as they are now. The content itself is never touched.

export function layerOf(world: World): Layer {
  return (world.state.layer ??= {})
}

const INVERSE: Partial<Record<RelationRole, RelationRole>> = {
  parent: 'child',
  child: 'parent',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  employer: 'employee',
  employee: 'employer',
  foreman: 'crew',
  crew: 'foreman',
  creditor: 'debtor',
  debtor: 'creditor',
  teacher: 'pupil',
  pupil: 'teacher',
}

export function isRole(role: string): role is RelationRole {
  return (RELATION_ROLES as readonly string[]).includes(role)
}

/** One person as they are now: the content with the layer on top. */
export function mergeNpc(world: World, base: Npc): Npc {
  const layer = world.state.layer
  const own = layer?.npcs?.[base.id]
  const ties = layer?.ties?.[base.id]
  if (!own && !ties) return base
  let relations = base.relations
  if (ties) {
    relations = base.relations.filter((r) => !r.to || ties[r.to] === undefined)
    for (const [other, change] of Object.entries(ties).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (!change) continue
      const old = base.relations.find((r) => r.to === other)
      relations.push({ ...(old ?? { status: 'alive' as const, private: false }), to: other, role: change.role, bond: change.bond, ...(change.why ? { note: change.why } : {}) } as RelationDef)
    }
  }
  return {
    ...base,
    ...(own?.home ? { home: own.home } : {}),
    ...(own && 'work' in own ? { work: own.work ?? undefined } : {}),
    ...(own && 'household' in own ? { household: own.household ?? undefined } : {}),
    ...(own?.profession ? { profession: own.profession } : {}),
    relations,
  }
}

/** Where someone lives now: an NPC's home, or the player's after a marriage. */
export function homeOf(world: World, who: string): string | undefined {
  if (who === 'player') return world.state.player.home
  return world.content.npcs.has(who) ? world.npc(who).home : undefined
}

export function setHome(world: World, who: string, home: string): void {
  if (who === 'player') {
    world.state.player.home = home
    world.state.player.homeNight ??= world.now
    return
  }
  own(world, who).home = home
  world.layerChanged()
}

/** Work somewhere, at a service if there is one; undefined for no work at all. */
export function setWork(world: World, who: string, work: string | undefined, service?: string, profession?: string): void {
  if (!world.content.npcs.has(who)) return
  const before = world.npc(who).work
  own(world, who).work = work ?? null
  if (profession && world.content.professions.has(profession)) own(world, who).profession = profession
  // Whoever leaves a place stops serving there; whoever comes to one serves where they are told.
  if (before && before !== work) for (const s of world.location(before).services) if (staffOf(world, before, s).includes(who)) changeStaff(world, before, s.id, who, false)
  if (work && service) changeStaff(world, work, service, who, true)
  world.layerChanged()
}

export function setHousehold(world: World, who: string, household: string | undefined): void {
  if (!world.content.npcs.has(who)) return
  own(world, who).household = household ?? null
  world.layerChanged()
}

/**
 * A tie of a kind between two people, both ways (spouse and spouse, parent and
 * child); the bond stays what it was, or at least the given one.
 */
/** A tie begins or changes in play; why (M10.22: the weave round) is kept as the note of the tie. */
export function setTie(world: World, a: string, b: string, role: RelationRole, bond = 2, why?: string): void {
  const ties = (layerOf(world).ties ??= {})
  const inverse = INVERSE[role] ?? role
  for (const [x, y, r] of [
    [a, b, role],
    [b, a, inverse],
  ] as const) {
    if (x === 'player' || !world.content.npcs.has(x)) continue
    const old = world.npc(x).relations.find((rel) => rel.to === y)
    ;(ties[x] ??= {})[y] = { role: r, bond: Math.max(bond, old?.bond ?? bond), t: world.now, ...(why ? { why } : {}) }
  }
  world.layerChanged()
}

export function removeTie(world: World, a: string, b: string): void {
  const ties = (layerOf(world).ties ??= {})
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    if (x === 'player' || !world.content.npcs.has(x)) continue
    ;(ties[x] ??= {})[y] = null
  }
  world.layerChanged()
}

/** Who serves at a service now: the content's staff, changed by the layer. */
export function staffOf(world: World, location: string, service: Service): string[] {
  const change = world.state.layer?.staff?.[serviceKey(location, service.id)]
  if (!change) return service.staff
  return [...service.staff.filter((id) => !change.remove.includes(id)), ...change.add.filter((id) => !service.staff.includes(id))]
}

function changeStaff(world: World, location: string, service: string, who: string, serves: boolean): void {
  const staff = (layerOf(world).staff ??= {})
  const change = (staff[serviceKey(location, service)] ??= { add: [], remove: [] })
  change.add = change.add.filter((id) => id !== who)
  change.remove = change.remove.filter((id) => id !== who)
  const content = world.content.locations.get(location)?.services.find((s) => s.id === service)?.staff.includes(who)
  if (serves && !content) change.add.push(who)
  if (!serves && content) change.remove.push(who)
}

/** Someone expects another home now and then: a spouse (M7.2, now a step of the aftermath). */
export function expectHome(world: World, who: string, of: string, nights: number): void {
  ;(layerOf(world).expects ??= {})[who] = { of, nights, since: world.now }
}

/** The people who live in one household with someone, themselves included. */
export function householdOf(world: World, who: string): string[] {
  const house = world.npc(who).household
  if (!house) return [who]
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => world.content.npcs.has(id) && world.npc(id).household === house)
}

/** Lives in one house with a parent: the one who moves out when two marry. */
export function livesWithParent(world: World, who: string): boolean {
  if (!world.content.npcs.has(who)) return false
  const npc = world.npc(who)
  return npc.relations.some((r) => r.role === 'parent' && r.to && world.content.npcs.has(r.to) && world.alive(r.to) && world.npc(r.to).home === npc.home)
}

/** The family of someone, as far as they are people of the game. */
export function familyOf(world: World, who: string): string[] {
  if (!world.content.npcs.has(who)) return []
  const family = ['parent', 'child', 'sibling', 'spouse', 'grandparent', 'grandchild', 'kin']
  return world
    .npc(who)
    .relations.filter((r) => r.to && world.content.npcs.has(r.to) && family.includes(r.role))
    .map((r) => r.to!)
}

/** The same world with a new character (M7.2): what tied people to the old one goes with them. */
export function forgetPlayer(state: GameState): void {
  const layer = state.layer
  if (!layer) return
  for (const ties of Object.values(layer.ties ?? {})) delete ties['player']
  for (const [who, e] of Object.entries(layer.expects ?? {})) if (e.of === 'player') delete layer.expects![who]
}

function own(world: World, who: string) {
  return ((layerOf(world).npcs ??= {})[who] ??= {})
}
