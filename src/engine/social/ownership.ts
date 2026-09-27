import type { World } from '../world'

// Who owns a thing (M10.3, "Eigendom en betrapt worden"): one function, so
// that taking, using, selling and giving back all ask the same question. It
// derives ownership as the game always has: a shop's stock is its keeper's,
// what lies in a house is the household's, an object is its owner's or its
// keeper's, what someone carries is theirs; what lies in the open is nobody's.
// What the stranger carries is theirs, unless it was lent or stolen.

export interface Owner {
  kind: 'person' | 'household' | 'settlement' | 'nobody' | 'player'
  /** The one to ask, or the victim: the person, or the head of the household. */
  id?: string
  /** Everyone it belongs to. */
  people: string[]
}

const NOBODY: Owner = { kind: 'nobody', people: [] }

/** Who lives in a place: the household of a home. */
export function householdOf(world: World, location: string): string[] {
  return [...world.content.npcs.values()].filter((npc) => npc.home === location && world.alive(npc.id)).map((npc) => npc.id).sort()
}

/** A private place with people living there, where the stranger does not live. */
export function isSomeonesHome(world: World, location: string): boolean {
  const place = world.content.locations.get(location)
  return Boolean(place?.tags.includes('private')) && householdOf(world, location).length > 0 && world.state.player.lodging?.location !== location
}

/**
 * Who owns a thing: something on the ground here, a shop's stock, an object,
 * what someone carries, or what the stranger carries.
 */
export function ownerOf(world: World, location: string, thing: { item?: string; service?: string; object?: string; npc?: string; carried?: boolean } = {}): Owner {
  if (thing.npc) return { kind: 'person', id: thing.npc, people: [thing.npc] }
  if (thing.carried && thing.item) {
    const loan = (world.state.agreements?.list ?? []).find((a) => a.kind === 'lend' && a.status === 'open' && a.terms.item === thing.item)
    if (loan?.to) return { kind: 'person', id: loan.to, people: [loan.to] }
    const theft = (world.state.crimes ?? []).find((c) => c.kind === 'theft' && !c.offender && !c.returned && c.item === thing.item && c.victim)
    if (theft?.victim) return { kind: 'person', id: theft.victim, people: [theft.victim] }
    return { kind: 'player', id: 'player', people: ['player'] }
  }
  const place = world.content.locations.get(location)
  if (!place) return NOBODY
  if (thing.service) {
    const service = [...world.content.locations.values()].flatMap((l) => l.services).find((s) => s.id === thing.service)
    return service ? { kind: 'person', id: service.provider, people: [service.provider] } : NOBODY
  }
  if (thing.object) {
    const object = place.objects.find((o) => o.id === thing.object)
    const who = object?.owner ?? object?.provider
    if (who && world.content.npcs.has(who)) return { kind: 'person', id: who, people: [who] }
  }
  // In someone's home, it is the household's; in the open, nobody's.
  if (isSomeonesHome(world, location)) {
    const people = householdOf(world, location)
    return { kind: 'household', id: people[0], people }
  }
  return NOBODY
}

/** The owners who are here, awake, and can see it: to ask, or to be caught by. */
export function ownersHere(world: World, owner: Owner): string[] {
  const here = world.state.player.location
  return owner.people.filter((id) => id !== 'player' && world.content.npcs.has(id) && world.state.npcs[id]?.location === here && world.present(id) && world.npcState(id).activity !== 'asleep')
}
