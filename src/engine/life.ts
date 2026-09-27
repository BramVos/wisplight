import { callName, type Quest } from './content'
import { recordFact } from './news'
import { failRequestsOf } from './requests'
import type { Fact } from './state'
import type { World } from './world'

// Death (design: lore and world change, "Voorbeeld: Harmen verdrinkt"). The
// dead leave the simulation for good. The death is a fact of belang 4 or 5,
// the people near to them hear it first (news.ts), and when the dead had a
// role in a quest, that quest ends or changes and the chronicler writes at once.

/** Belang by the rules (design, "Belang van gebeurtenissen"): +1 when someone of fame 2 or more is involved. */
export function belangOf(world: World, base: number, about: string[]): number {
  const famous = about.some((id) => (world.content.npcs.get(id)?.fame ?? 0) >= 2)
  return Math.min(5, base + (famous ? 1 : 0))
}

export interface DeathInput {
  /** How it happened, after the name: "drowned in the Blackmere". */
  cause: string
  place?: string
  loud?: boolean
}

export function die(world: World, npcId: string, input: DeathInput): Fact | undefined {
  if (!world.alive(npcId)) return undefined
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const place = input.place ?? state.location
  const they = npc.pronoun === 'she' ? 'She' : npc.pronoun === 'he' ? 'He' : 'They'
  const profession = world.content.professions.get(npc.profession)?.name ?? 'someone'
  const area = world.content.areas.get(world.location(npc.home).area)?.name ?? 'the fen'
  // A death is base 3, +1 because someone died.
  const fact = recordFact(world, {
    kind: 'death',
    about: [npcId],
    place,
    belang: belangOf(world, 4, [npcId]),
    loud: input.loud,
    juice: 1,
    title: `the death of ${npc.name}`,
    text: {
      precise: `${npc.name} ${input.cause}.`,
      village: `${callName(npc)} is dead. ${they} ${input.cause}, they say.`,
      far: `The ${profession.toLowerCase()} of ${area} is dead, they say.`,
    },
  })
  state.dead = { t: world.now, fact: fact.id }
  state.activity = 'dead'
  state.plan = []
  state.goals = []
  state.planGoal = undefined
  state.pending = undefined
  if (world.state.talk?.npc === npcId) world.state.talk = undefined
  failRequestsOf(world, npcId)
  world.emit('death', place, fact.text.precise, npcId)
  return fact
}

/** The quests in which this NPC has a role. */
export function questsOf(world: World, npcId: string): Quest[] {
  return [...world.content.quests.values()].filter((q) => [...q.givers, ...q.helpers, ...q.opponents].includes(npcId))
}
