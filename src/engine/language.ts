import { callName } from './content'
import { landOfPlace } from './lands'
import { playerSkill } from './rules/player'
import { withPlayer } from './social/companions'
import type { World } from './world'

// A tongue of its own (M10.23, a knob and optional): a land may have a
// language. Whoever does not know it talks with its people at the lowest
// layer, a greeting, trade by gestures, names and numbers, until they learn it
// (each exchange teaches a little, Lore a little more) or have someone with
// them who speaks it. Without `language:` everyone speaks the stranger's
// tongue, as before. The rules write what the stranger makes out; the model
// is not asked, so a barrier costs nothing.

export interface Barrier {
  land: string
  name: string
}

/** The tongue that stands between the stranger and this person, if one does. */
export function languageBarrier(world: World, npcId: string): Barrier | undefined {
  const land = landOfPlace(world.content, world.npc(npcId).home)
  const tongue = land?.language
  if (!land || !tongue) return undefined
  if (world.state.player.languages?.includes(land.id)) return undefined
  // Someone with the stranger who speaks it: one of the land's own, or one of its speakers from elsewhere.
  const interpreter = withPlayer(world).some((c) => c.npc !== npcId && world.content.npcs.has(c.npc) && (landOfPlace(world.content, world.npc(c.npc).home)?.id === land.id || tongue.speakers.includes(c.npc)))
  return interpreter ? undefined : { land: land.id, name: tongue.name }
}

/**
 * What the stranger makes out of a person whose tongue they do not know, and
 * a step towards learning it: a greeting back, the names and numbers in what
 * was said, or nothing in common but gestures.
 */
export function acrossTongues(world: World, npcId: string, barrier: Barrier, said: string): string[] {
  const name = callName(world.npc(npcId))
  const tongues = (world.state.player.tongues ??= {})
  // Each exchange teaches a little; a head for lore learns faster.
  tongues[barrier.land] = (tongues[barrier.land] ?? 0) + 1 + Math.max(0, playerSkill(world, 'lore'))
  const need = world.content.lands.get(barrier.land)?.language?.learn ?? 30
  const lines: string[] = []
  const greeting = /\b(hello|hi|good (morning|day|evening)|greetings|well met|hail)\b/i.test(said)
  // Names and numbers: a capital not at the start of a sentence, or digits.
  const caught = [...new Set(said.split(/(?<=[.!?])\s+/).flatMap((sentence) => (sentence.match(/[A-Za-z][a-z']*|\d+/g) ?? []).filter((w, i) => /^\d+$/.test(w) || (i > 0 && /^[A-Z]/.test(w) && w !== 'I'))))].slice(0, 3)
  if (greeting) lines.push(`${name} answers in ${barrier.name}, a greeting by the sound of it, and inclines their head.`)
  else if (caught.length) lines.push(`${name} says something in ${barrier.name}. You catch ${caught.join(' and ')}, and a gesture that could mean anything.`)
  else lines.push(`${name} speaks in ${barrier.name}, and you have no words in common: only hands, and a patient look.`)
  if (tongues[barrier.land]! >= need) {
    ;(world.state.player.languages ??= []).push(barrier.land)
    lines.push(`You find you can follow ${barrier.name} now, slowly.`)
  }
  return lines
}
