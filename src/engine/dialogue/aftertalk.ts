import { knob } from '../knobs'
import { agree, type AgreementInput } from '../agreements'
import { callName } from '../content'
import { heardBy, recordFact } from '../news'
import type { Fact, Goal } from '../state'
import type { World } from '../world'
import type { Act } from './acts'

// A conversation that goes on in the world (M10.3; FO, chapter 10, "Gepland
// (M10.3)", points 2 and 3). Asking someone about someone who matters is
// news of its own, with witnesses, and goes round like any news: Brannoc
// knows the next day that the stranger asked after him. And after the
// conversation the NPC does one thing of its own, checked like a brain's
// choice, at most one per conversation, lapsing after a day: "I'll tell my
// father tonight" is a report carried home.

const DAY = 24 * 60

/** Who someone is to the NPC, if family: "his father". */
function kin(world: World, npcId: string, person: string): string | undefined {
  const tie = world.npc(npcId).relations.find((r) => r.to === person)
  if (!tie) return undefined
  const he = world.npc(person).pronoun === 'he'
  const she = world.npc(person).pronoun === 'she'
  const words: Record<string, string> = { parent: he ? 'father' : she ? 'mother' : 'parent', child: he ? 'son' : she ? 'daughter' : 'child', spouse: he ? 'husband' : she ? 'wife' : 'spouse', sibling: he ? 'brother' : she ? 'sister' : 'sibling' }
  return words[tie.role]
}

/**
 * The stranger asked someone about someone: a fact of belang 1, or 2 when it
 * was family or the one asked about themself, with whoever was there as
 * witnesses. A few a day, one per person.
 */
export function talkFact(world: World, npcId: string, topics: string[], act: Act): Fact | undefined {
  if (act !== 'AskAbout' && act !== 'AskDirections' && act !== 'AskStory') return undefined
  const person = topics.find((t) => t !== npcId && world.content.npcs.has(t) && world.alive(t))
  if (!person) return undefined
  const day = Math.floor(world.now / DAY)
  const count = (world.state.talkFacts ??= { day, people: [] })
  if (count.day !== day) {
    count.day = day
    count.people = []
  }
  if (count.people.length >= knob(world, 'talk.facts_per_day') || count.people.includes(person)) return undefined
  count.people.push(person)
  const who = callName(world.npc(npcId))
  const whom = callName(world.npc(person))
  const family = kin(world, npcId, person)
  const their = world.npc(npcId).pronoun === 'she' ? 'her' : world.npc(npcId).pronoun === 'he' ? 'his' : 'their'
  const about = family ? `${their} ${family}` : whom
  const here = world.state.player.location
  const fact = recordFact(world, {
    kind: 'asked_about',
    about: [npcId, person],
    place: here,
    belang: family ? 2 : 1,
    title: `the stranger asking ${who} about ${about}`,
    text: {
      precise: `The stranger asked ${who} about ${about}${family ? `, ${whom}` : ''}.`,
      village: `The stranger has been asking after ${whom}.`,
      far: 'A stranger has been asking questions.',
    },
    // What it says: someone is being asked after, by the stranger.
    claim: { subject: person, key: 'asked_about', value: 'player' },
    witnesses: [npcId, ...world.npcsAt(here).filter((id) => id !== npcId && world.npcState(id).activity !== 'asleep')],
  })
  // The stranger knows what they asked: it is not news in their own journal.
  delete heardBy(world, 'player')[fact.id]
  if (world.state.player.journal) delete world.state.player.journal[fact.id]
  return fact
}

/** What the NPC does after the talk, by rules: a child or a curious one tells family who were asked about. */
export function afterChoice(world: World, npcId: string, facts: string[]): { kind: 'tell' | 'visit'; target: string } | undefined {
  const npc = world.npc(npcId)
  if (!npc.child && npc.personality.curiosity < 2) return undefined
  for (const id of facts) {
    const fact = (world.state.news?.facts ?? []).find((f) => f.id === id)
    const person = fact?.about.find((p) => p !== npcId)
    if (person && kin(world, npcId, person) && world.alive(person)) return { kind: 'tell', target: person }
  }
  return undefined
}

/**
 * The one thing the NPC does of its own after the talk, from the voice or the
 * rules: checked, an agreement in the register (an intention, or a report to
 * carry), lapsing after a day. Returns what it became, or undefined.
 */
export function doAfter(world: World, npcId: string, choice: { kind: string; target: string }, facts: string[]): string | undefined {
  if (choice.kind === 'tell') {
    const to = choice.target
    if (!world.content.npcs.has(to) || to === npcId || !world.alive(to)) return undefined
    const known = facts.filter((id) => heardBy(world, npcId)[id])
    if (!known.length) return undefined
    const input: AgreementInput = { kind: 'message', by: npcId, source: 'conversation', what: `tell ${callName(world.npc(to))} what the stranger asked`, due: world.now + DAY, known: false, terms: { recipient: to, about: 'what the stranger asked', facts: known } }
    const made = agree(world, input)
    if ('rejected' in made) return undefined
    const goal: Goal = { id: `g${++world.state.goalSeq}`, type: 'Talk', target: to, priority: 0.9, source: 'ai', created: world.now, until: made.due!, message: made.terms.facts ?? [], agreement: made.id }
    world.npcState(npcId).goals.push(goal)
    made.effects.push({ kind: 'plan', ref: goal.id })
    return made.id
  }
  if (choice.kind === 'visit') {
    const made = agree(world, { kind: 'intention', by: npcId, source: 'conversation', what: `go to ${world.content.locations.get(choice.target)?.name ?? choice.target}`, terms: { goal: 'Visit', target: choice.target } })
    return 'rejected' in made ? undefined : made.id
  }
  return undefined
}
