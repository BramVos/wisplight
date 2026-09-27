import type { Output } from '../commands'
import { callName } from '../content'
import { applyEffect, relation } from '../dialogue/relations'
import { recordFact } from '../news'
import type { Group } from '../state'
import type { World } from '../world'

// Groups (M8.3; design: "Wrijving in een dorp"): people who band together for
// or against the newcomers in a village. A group is data: members, an aim, a
// village. Its members will not take a newcomer on for work, and the player
// can take a side or make peace between the group and those it is against.

export function activeGroups(world: World): Group[] {
  return (world.state.groups ?? []).filter((g) => g.ended === undefined)
}

/** People from elsewhere staying in the group's village: those it is for or against. */
export function newcomersOf(world: World, group: Group): string[] {
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      const s = world.state.npcs[id]!
      const where = s.stayAt?.where ?? s.note?.where
      return !s.dead && world.content.npcs.has(id) && where && world.content.locations.get(where)?.area === group.area && world.location(world.npc(id).home).area !== group.area
    })
}

/** Someone of a group against the newcomers this one is among. */
export function againstNewcomer(world: World, member: string, newcomer: string): boolean {
  return activeGroups(world).some((g) => g.aim === 'against' && g.members.includes(member) && newcomersOf(world, g).includes(newcomer))
}

/** The group between a member and a newcomer it is against, either way round. */
export function groupBetween(world: World, a: string, b: string): Group | undefined {
  return activeGroups(world).find((g) => g.aim === 'against' && ((g.members.includes(a) && newcomersOf(world, g).includes(b)) || (g.members.includes(b) && newcomersOf(world, g).includes(a))))
}

/** SIDE WITH: with a group, or with the newcomers a group is against. */
export function sideWith(world: World, who: string): Output[] {
  const name = callName(world.npc(who))
  const own = activeGroups(world).find((g) => g.members.includes(who))
  const against = activeGroups(world).find((g) => g.aim === 'against' && newcomersOf(world, g).includes(who))
  const group = own ?? against
  if (!group) return [{ kind: 'narration', text: `There is no quarrel for you to take ${name}'s side in.` }]
  const withGroup = Boolean(own)
  for (const m of group.members) applyEffect(world, m, 'affinity', withGroup ? 10 : -10)
  for (const n of newcomersOf(world, group)) applyEffect(world, n, 'affinity', withGroup ? -10 : 10)
  recordFact(world, { kind: 'group', about: [who, ...group.members], place: world.state.player.location, belang: 2, title: `the stranger sides ${withGroup ? 'with' : 'against'} ${group.name}`, text: { precise: `The stranger has taken ${withGroup ? `the side of ${group.name}` : `the newcomers' side against ${group.name}`}.`, village: `The stranger is ${withGroup ? 'with' : 'against'} ${group.name}, they say.`, far: 'A stranger took sides in a quarrel.' } })
  return [{ kind: 'narration', text: withGroup ? `You tell ${name} you are with them. The newcomers will hear of it soon enough.` : `You tell ${name} you are on their side, whatever ${group.name} says.` }]
}

/**
 * Making peace between a group and the newcomers (M8.3): both sides must
 * trust the player. Then the group lets it go; otherwise it hardens, and the
 * group thinks less of the player for meddling.
 */
export function mediateGroup(world: World, group: Group, a: string, b: string): Output[] {
  const member = group.members.includes(a) ? a : b
  const newcomer = member === a ? b : a
  const trusted = relation(world.state, member).trust >= 20 && relation(world.state, newcomer).trust >= 20
  const [nm, nn] = [callName(world.npc(member)), callName(world.npc(newcomer))]
  if (trusted) {
    group.ended = world.now
    recordFact(world, { kind: 'group', about: [member, newcomer, ...group.members], place: world.state.player.location, belang: 2, title: `${group.name} let it go`, text: { precise: `The stranger sat ${nm} and ${nn} down together, and ${group.name} let the matter drop.`, village: `The trouble over the newcomers has blown over, they say.`, far: 'A quarrel over newcomers blew over.' } })
    return [{ kind: 'narration', text: `You talk with ${nm}, and with ${nn}, and then with both. It takes a while. In the end ${nm} shrugs: "Let them stay, then. As long as they pull their weight."` }]
  }
  for (const m of group.members) applyEffect(world, m, 'affinity', -5)
  return [{ kind: 'narration', text: `You try. But one of them does not trust you, and ${nm} goes back to the others more set against the newcomers than before.` }]
}

/** People from elsewhere staying in an area now. */
export function newcomersIn(world: World, area: string): string[] {
  return newcomersOf(world, { id: '', name: '', aim: 'for', area, members: [], since: world.now })
}

/**
 * Who in an area welcomes its newcomers most (M9.1): grown people of the place
 * with a warm heart, by how much they like them, not in a group against them.
 * The members of a group for the newcomers, as the standard aftermath forms it.
 */
export function welcomingIn(world: World, area: string, n = 3): string[] {
  const guests = newcomersIn(world, area)
  if (!guests.length) return []
  const against = new Set(activeGroups(world).filter((g) => g.aim === 'against' && g.area === area).flatMap((g) => g.members))
  const liking = (who: string) => guests.reduce((sum, g) => sum + (world.state.bonds?.[who]?.[g]?.affinity ?? 0), 0) / guests.length + world.npc(who).personality.warmth * 10
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => world.present(id) && world.content.npcs.has(id) && !world.npc(id).child && !world.npc(id).quirks.includes('spirit') && !guests.includes(id) && !against.has(id))
    .filter((id) => world.location(world.npc(id).home).area === area && world.npc(id).personality.warmth >= 1)
    .sort((a, b) => liking(b) - liking(a) || a.localeCompare(b))
    .slice(0, n)
}
