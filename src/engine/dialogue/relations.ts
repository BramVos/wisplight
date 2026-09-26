import type { GameState } from '../state'
import type { World } from '../world'

// A minimal relationship model for M2 (the full one arrives in M6): four
// numbers per NPC towards the player, and the attitude bands of FO chapter 8.

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
  const needs = world.npcState(npcId).needs
  const lowest = Math.min(needs.hunger, needs.rest)
  const mood = lowest < 20 ? -8 : lowest < 40 ? -4 : 0
  const score = Math.round(rel.affinity + rel.trust / 2 + 5 * npc.personality.warmth + mood)
  return { band: band(score), score }
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
  const needs = world.npcState(npcId).needs
  if (needs.hunger < 25) return 'hungry and short-tempered'
  if (needs.rest < 25) return 'tired'
  if (needs.social < 20) return 'lonely'
  if (world.npc(npcId).quirks.includes('grieving')) return 'grieving, worried sick'
  return needs.social > 70 ? 'cheerful' : 'calm'
}

export function applyEffect(world: World, npcId: string, type: 'affinity' | 'trust' | 'fear', delta: number): void {
  const rel = relation(world.state, npcId)
  rel[type] = Math.max(type === 'fear' ? 0 : -100, Math.min(100, rel[type] + delta))
}
