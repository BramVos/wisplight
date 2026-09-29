import { allFaiths } from '../lands'
import { missing, mourning } from '../people'
import type { GameState } from '../state'
import type { World } from '../world'

// Four numbers per NPC towards the player, and the attitude in seven bands
// (FO, chapter 8). The attitude is worked out at the moment itself: the
// relation, the NPC's warmth, its mood, and the situation.

export interface Relation {
  affinity: number
  trust: number
  fear: number
  familiarity: number
}

export type Attitude = 'Hostile' | 'Unfriendly' | 'Wary' | 'Neutral' | 'Friendly' | 'Warm' | 'Devoted'

export function relation(state: GameState, npcId: string): Relation {
  state.relations ??= {}
  state.relations[npcId] ??= { affinity: 0, trust: 0, fear: 0, familiarity: 0 }
  return state.relations[npcId]
}

export function attitude(world: World, npcId: string): { band: Attitude; score: number } {
  const rel = relation(world.state, npcId)
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const needs = state.needs
  const lowest = Math.min(needs.hunger, needs.rest)
  // Mood from -10 to +10: hunger and tiredness, or anger that lasts a while.
  const hungry = lowest < 20 ? -8 : lowest < 40 ? -4 : 0
  const angry = state.mood && state.mood.until > world.now ? state.mood.value : 0
  const mood = Math.max(-10, Math.min(10, hungry + angry))
  const score = Math.round(rel.affinity + rel.trust / 2 + 5 * npc.personality.warmth + mood + situation(world, npcId))
  return { band: band(score), score }
}

/**
 * The situation (FO, chapter 8): armed in someone's house -20, walking in
 * uninvited at night -30, the same patron +10. The Lantern and the Old
 * Powers distrust each other's followers, the factions weigh in with a fifth
 * of the player's standing, and superstitious people start cooler towards a
 * changeling (FO, chapter 11).
 */
export function situation(world: World, npcId: string): number {
  const npc = world.npc(npcId)
  const player = world.state.player
  const c = player.character
  let score = 0
  const home = player.location === npc.home && world.content.locations.get(npc.home)?.tags.includes('private')
  const weapon = c?.gear.weapon ? world.content.items.get(c.gear.weapon)?.weapon : undefined
  if (home && weapon && !weapon.light) score -= 20
  const hour = Math.floor(((world.now % 1440) + 1440) % 1440 / 60)
  if (home && (hour >= 22 || hour < 6) && player.lodging?.location !== npc.home && !(world.state.talk?.npc === npcId)) score -= 30
  const patron = c?.patron?.id
  if (patron && npc.patron) {
    if (patron === npc.patron) score += 10
    // Sworn to a patron of another faith (M10.17: by the world's faiths, before the Lantern against the rest).
    else if (faithOfPatron(world, patron) !== faithOfPatron(world, npc.patron) && (npc.quirks.includes('pious') || npc.values['faith'] || npc.values['tradition'])) score -= 10
  }
  const rep = world.state.reputation
  if (rep) {
    const factions = [...world.content.factions.values()].filter((f) => f.members.includes(npcId))
    if (factions.length) score += Math.max(-15, Math.min(15, Math.round(factions.reduce((s, f) => s + (rep[f.id] ?? 0), 0) / factions.length / 5)))
  }
  const ancestry = c && world.content.rules?.ancestries.find((a) => a.id === c.ancestry)
  if (ancestry?.distrusted_by.some((q) => npc.quirks.includes(q))) score -= 10
  return score
}

/** The faith a patron belongs to, by the world's faiths; the patron itself when no faith names it. */
function faithOfPatron(world: World, patron: string): string {
  return allFaiths(world.content).find((f) => f.patrons.includes(patron))?.id ?? patron
}

export function band(score: number): Attitude {
  if (score <= -60) return 'Hostile'
  if (score <= -25) return 'Unfriendly'
  if (score <= -5) return 'Wary'
  if (score <= 14) return 'Neutral'
  if (score <= 44) return 'Friendly'
  if (score <= 74) return 'Warm'
  return 'Devoted'
}

export function moodOf(world: World, npcId: string): string {
  const state = world.npcState(npcId)
  const needs = state.needs
  if (state.wokenAt !== undefined && world.now - state.wokenAt < 60) return 'just woken, groggy and cross'
  if (needs.hunger < 25) return 'hungry and short-tempered'
  if (needs.rest < 25) return 'tired'
  const lost = mourning(world, npcId)
  if (lost) return `grieving for ${lost.name}`
  const gone = missing(world, npcId)
  if (gone) return `worried sick about ${gone.name}`
  if (needs.social < 20) return 'lonely'
  if (world.npc(npcId).quirks.includes('grieving')) return 'grieving, worried sick'
  return needs.social > 70 ? 'cheerful' : 'calm'
}

export function applyEffect(world: World, npcId: string, type: 'affinity' | 'trust' | 'fear', delta: number): void {
  const rel = relation(world.state, npcId)
  rel[type] = Math.max(type === 'fear' ? 0 : -100, Math.min(100, rel[type] + delta))
}
