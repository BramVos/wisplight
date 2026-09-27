import { callName } from '../content'
import { companionOf, characterFor } from '../social/companions'
import type { World } from '../world'
import { characterFighter, creatureFighter } from './combat'
import type { Fighter } from './types'

// People in a fight (FO, chapter 12 and 13): a companion fights with its own
// character, an NPC with a class (the schout, the five who can travel with
// the player) likewise, and everyone else as ordinary folk with a knife, a
// club or their fists.

const DAMAGE: Record<string, string> = { spear: '1d6', club: '1d6', hatchet: '1d6', mace: '1d6', knife: '1d4', staff: '1d6' }

export function npcFighter(world: World, npcId: string, side: 'party' | 'foes', id = npcId): Fighter {
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const name = callName(npc)
  const companion = companionOf(world, npcId)
  // A creature of the bestiary fights with its own numbers (the Haakman, Black Mathijs).
  if (npc.creature && world.content.creatures.has(npc.creature)) {
    const f = creatureFighter(world.content, npc.creature, id, name, 0)
    f.npc = npcId
    f.side = side
    f.hp = Math.max(1, f.maxHp - (state.wounds ?? 0))
    return f
  }
  if (companion || npc.fighter) {
    const character = companion?.character ?? characterFor(world, npcId)
    if (!companion) character.hp = Math.max(1, character.hp - (state.wounds ?? 0))
    const f = characterFighter(world.content, character, { id, name, side, kind: 'npc', npc: npcId })
    f.morale = { courage: npc.personality.courage, fleesBelow: side === 'foes' ? 0.25 : undefined, surrenders: true, never: false } as Fighter['morale']
    if (companion) {
      f.loyalty = companion.loyalty
      f.stance = companion.stance
      if (companion.protect) f.guard = companion.protect
    }
    return f
  }
  const weapon = Object.keys(state.inventory).find((i) => DAMAGE[i]) ?? 'fists'
  const might = Math.max(0, npc.personality.courage)
  const level = 1
  const hp = Math.max(1, 10 + might * 2 + (npc.age > 60 ? -3 : 0) - (state.wounds ?? 0))
  return {
    id,
    name,
    side,
    kind: 'npc',
    npc: npcId,
    level,
    hp,
    maxHp: 10 + might * 2 + (npc.age > 60 ? -3 : 0),
    defence: 12,
    saves: { fortitude: 3 + might, reflex: 3, will: 3 + Math.max(0, npc.personality.courage) },
    perception: 2 + npc.personality.curiosity,
    attacks: [{ name: weapon === 'fists' ? 'fists' : weapon, bonus: 3 + might, dice: `${DAMAGE[weapon] ?? '1d3'}+${might}`, kind: 'melee', range: 'near' }],
    abilities: [],
    conditions: {},
    timers: {},
    buffs: [],
    pos: side === 'foes' ? 0 : 0,
    row: 'front',
    state: 'up',
    morale: { courage: npc.personality.courage, fleesBelow: npc.personality.courage <= 0 ? 0.6 : 0.35, surrenders: true, never: false },
    immune: [],
    weak: {},
    initiative: 0,
    strikes: 0,
    says: { hit: `${name} swings at {target}.`, flee: `${name} runs off.`, surrender: `${name} backs away, hands up. "Enough! Enough."`, down: `${name} goes down and stays down.` },
  }
}
