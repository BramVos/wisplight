import { attitude, relation, type Attitude } from '../dialogue/relations'
import type { World } from '../world'

// Behaviour gates (FO, chapter 8, "Gedragspoorten"): what an NPC may do is
// decided here, by the system, from the attitude and the character. The model
// only puts it in words; it cannot open a gate that is shut.

const ORDER: Attitude[] = ['Hostile', 'Unfriendly', 'Wary', 'Neutral', 'Friendly', 'Warm', 'Devoted']
export const atLeast = (band: Attitude, floor: Attitude) => ORDER.indexOf(band) >= ORDER.indexOf(floor)
export const atMost = (band: Attitude, ceiling: Attitude) => ORDER.indexOf(band) <= ORDER.indexOf(ceiling)

/**
 * Attacking first: only when Hostile, and only if courage allows it.
 * Unfriendly with temper +2 or more and heavy provocation, or on an order of
 * its own faction when loyalty weighs more than liking. From Friendly: never.
 */
export function mayAttackFirst(world: World, npcId: string, opts: { provoked?: boolean; factionOrder?: boolean } = {}): boolean {
  const npc = world.npc(npcId)
  if (npc.child) return false
  const band = attitude(world, npcId).band
  if (atLeast(band, 'Friendly')) return false
  if (band === 'Hostile') return npc.personality.courage + Math.floor(relation(world.state, npcId).fear / -25) >= 0
  if (band === 'Unfriendly') return (npc.personality.temper >= 2 && Boolean(opts.provoked)) || Boolean(opts.factionOrder && relation(world.state, npcId).affinity < 0)
  return false
}

/** Fighting back: always, but a Devoted NPC dodges the first round, gives up or flees. */
export function fightsBack(world: World, npcId: string): 'fight' | 'yield' | 'flee' {
  const npc = world.npc(npcId)
  const band = attitude(world, npcId).band
  if (band === 'Devoted') return npc.personality.courage >= 1 ? 'yield' : 'flee'
  if (npc.child) return 'flee'
  return 'fight'
}

/** Stealing from the player: Unfriendly or worse, and only with honesty -1 or lower. */
export function mayStealFrom(world: World, npcId: string): boolean {
  return atMost(attitude(world, npcId).band, 'Unfriendly') && world.npc(npcId).personality.honesty <= -1
}

/** Lying to the player: Neutral or worse with honesty 0 or lower; at -2 or lower always possible. */
export function mayLie(world: World, npcId: string): boolean {
  const honesty = world.npc(npcId).personality.honesty
  return honesty <= -2 || (honesty <= 0 && atMost(attitude(world, npcId).band, 'Neutral'))
}

/** Sharing a secret: Warm, or a check that succeeded. */
export function mayShareSecret(world: World, npcId: string, checkPassed = false): boolean {
  return checkPassed || atLeast(attitude(world, npcId).band, 'Warm')
}

/** Lending money: Warm and trust 30 or more. */
export function mayLend(world: World, npcId: string): boolean {
  return atLeast(attitude(world, npcId).band, 'Warm') && relation(world.state, npcId).trust >= 30
}

/** Becoming a companion: Friendly or better; the goals must fit too (companions.ts). */
export function mayJoin(world: World, npcId: string): boolean {
  const npc = world.npc(npcId)
  return !npc.child && Boolean(npc.companion) && atLeast(attitude(world, npcId).band, 'Friendly')
}

/**
 * Reporting the player: Neutral or worse for a crime the NPC saw; Friendly
 * only for a grave crime and law +2 or more.
 */
export function mayReport(world: World, npcId: string, grave: boolean): boolean {
  const npc = world.npc(npcId)
  const band = attitude(world, npcId).band
  if (atMost(band, 'Neutral')) return (npc.values['law'] ?? 0) >= -1 || grave
  if (band === 'Friendly') return grave && (npc.values['law'] ?? 0) >= 2
  return false
}

/** Betraying the player: Unfriendly or loyalty under 20, with honesty -1 or lower and a large gain. */
export function mayBetray(world: World, npcId: string, loyalty?: number, gain = false): boolean {
  const npc = world.npc(npcId)
  const low = atMost(attitude(world, npcId).band, 'Unfriendly') || (loyalty !== undefined && loyalty < 20)
  return low && npc.personality.honesty <= -1 && gain
}
