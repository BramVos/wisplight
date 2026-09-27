import type { Output } from '../commands'
import type { World } from '../world'

// Factions and reputation (FO, chapter 8): -100 to +100 per faction, with
// ranks from Enemy to Hero. A change spills over: a fifth to the faction's
// allies, and two fifths the other way to its rivals.

export const RANKS: { name: string; from: number }[] = [
  { name: 'Enemy', from: -100 },
  { name: 'Suspect', from: -59 },
  { name: 'Unknown', from: -19 },
  { name: 'Known', from: 10 },
  { name: 'Valued', from: 30 },
  { name: 'Friend', from: 60 },
  { name: 'Hero', from: 90 },
]

export function rankOf(score: number): string {
  let name = RANKS[0]!.name
  for (const r of RANKS) if (score >= r.from) name = r.name
  return name
}

export function reputationOf(world: World, faction: string): number {
  return world.state.reputation?.[faction] ?? 0
}

/** Changes the player's standing with a faction, and with its allies and rivals. Returns the notices. */
export function repute(world: World, factionId: string, delta: number, why: string, spill = true): void {
  const faction = world.content.factions.get(factionId)
  if (!faction || delta === 0) return
  const rep = (world.state.reputation ??= {})
  const before = rep[factionId] ?? 0
  rep[factionId] = Math.max(-100, Math.min(100, before + delta))
  if (rankOf(before) !== rankOf(rep[factionId]!)) world.notices.push(`${cap(faction.name)} now see you as ${rankOf(rep[factionId]!)} (${why}).`)
  if (!spill) return
  for (const ally of faction.allies) repute(world, ally, Math.round(delta / 5), why, false)
  for (const rival of faction.rivals) repute(world, rival, -Math.round((delta * 2) / 5), why, false)
}

/** The factions an NPC belongs to. */
export function factionsOf(world: World, npcId: string): string[] {
  return [...world.content.factions.values()].filter((f) => f.members.includes(npcId)).map((f) => f.id)
}

/** A deed against an NPC reflects on the factions they belong to. */
export function reputeFor(world: World, npcId: string, delta: number, why: string): void {
  for (const f of factionsOf(world, npcId)) repute(world, f, delta, why)
}

/**
 * JOIN <faction> (Wereldboek, chapter 4, "Lid worden"): the Church through the
 * Lantern as patron, the Old Faith through an Old Power, the Brotherhood and
 * the Goat-Riders once they value you, Waagdam by buying the town rights at
 * the Waag.
 */
export function join(world: World, words: string): Output[] {
  const w = words.toLowerCase().replace(/^the\s+/, '').trim()
  const faction = [...world.content.factions.values()].find((f) => f.id === w.replace(/\s+/g, '_') || f.name.toLowerCase().replace(/^the\s+/, '') === w || f.name.toLowerCase().includes(w))
  if (!faction) return [{ kind: 'error', text: `Join what? ${[...world.content.factions.values()].filter((f) => f.join !== 'never').map((f) => f.name).join(', ')}.` }]
  const memberships = (world.state.memberships ??= [])
  if (memberships.includes(faction.id)) return [{ kind: 'error', text: `You already belong to ${faction.name}.` }]
  const c = world.state.player.character
  const patron = c?.patron?.id
  const rep = reputationOf(world, faction.id)
  let refusal: string | undefined
  switch (faction.join) {
    case 'never':
      refusal = `${cap(faction.name)} take no members.`
      break
    case 'hired':
      refusal = `${cap(faction.name)} hire, they do not enlist. Perhaps the schout has work for you one day.`
      break
    case 'patron_lantern':
      if (patron !== 'lantern') refusal = 'The Church takes novices who have sworn themselves to the Lantern.'
      else if (!world.location(world.state.player.location).tags.includes('holy')) refusal = 'You take the novice vows in a chapel or church.'
      break
    case 'patron_old':
      if (!patron || patron === 'lantern') refusal = 'The Old Faith is for those who follow one of the Old Powers.'
      break
    case 'reputation':
      if (rep < 30) refusal = `${cap(faction.name)} do not know you well enough yet (${rankOf(rep)}).`
      break
    case 'citizenship': {
      const fee = 5 * 20 * 8
      if (world.state.player.location !== 'loc_waagdam_waag' && world.state.player.location !== 'loc_waagdam_weighing_room') refusal = 'The town rights of Waagdam are bought at the Waag.'
      else if (world.state.player.money < fee) refusal = 'The town rights cost five guilders.'
      else world.state.player.money -= fee
      break
    }
  }
  if (refusal) return [{ kind: 'error', text: refusal }]
  memberships.push(faction.id)
  repute(world, faction.id, 20, `you joined ${faction.name}`)
  return [{ kind: 'text', text: `You are one of ${faction.name} now.` }]
}

export function factionLines(world: World): string[] {
  const rep = world.state.reputation ?? {}
  const members = world.state.memberships ?? []
  return [...world.content.factions.values()]
    .filter((f) => rep[f.id] !== undefined || members.includes(f.id))
    .map((f) => `${cap(f.name)}: ${rankOf(rep[f.id] ?? 0)} (${rep[f.id] ?? 0})${members.includes(f.id) ? ', member' : ''}. ${f.wants}`)
}

/** A page for one faction the player knows: what it wants, where it sits, its friends and enemies, and your standing. */
export function factionPage(world: World, id: string): string[] | undefined {
  const f = world.content.factions.get(id)
  const score = world.state.reputation?.[id]
  const member = (world.state.memberships ?? []).includes(id)
  if (!f || (score === undefined && !member)) return undefined
  const names = (ids: string[]) => ids.map((x) => world.content.factions.get(x)?.name ?? x).join(', ')
  return [
    f.wants,
    `Seat: ${f.seat}.`,
    `On the drainage: ${f.stance}.`,
    ...(f.allies.length ? [`Friends: ${names(f.allies)}.`] : []),
    ...(f.rivals.length ? [`Enemies: ${names(f.rivals)}.`] : []),
    `You: ${rankOf(score ?? 0)} (${score ?? 0})${member ? ', a member' : ''}.`,
  ]
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
