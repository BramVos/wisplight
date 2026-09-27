import { callName } from './content'
import { factById, versionOf } from './news'
import { tieTo } from './people'
import type { Fact } from './state'
import type { World } from './world'
import type { LookupQuery } from '../chronicler'
export { lookupFromId, lookupId, parseLookup, type LookupQuery } from '../chronicler'

// Asking for more (M9.3; review of 27 September 2026 on prompts). A model
// does not get everything up front; it may ask a few bounded questions and
// gets the answers before it decides: what someone knows about a topic, why a
// storyline runs as it does and what is still open, how two people stand,
// what happened lately around a place. Every question is bounded in what the
// asker may know, in time, in number and in size. The chronicler sees the
// world; an NPC only what is in its own head, so asking never makes it
// omniscient.

export const LOOKUP_LIMITS = {
  /** Facts in one answer. */
  facts: 3,
  /** Events around a place. */
  events: 5,
  /** Characters in one answer. */
  chars: 500,
  /** How far back what someone knows counts, in days. */
  knowsDays: 60,
  /** How far back events around a place count, in days. */
  nearDays: 7,
}

const DAY = 24 * 60

const cut = (text: string) => (text.length > LOOKUP_LIMITS.chars ? `${text.slice(0, LOOKUP_LIMITS.chars - 3)}...` : text)
const nameOf = (world: World, id: string) =>
  world.content.npcs.has(id) ? callName(world.npc(id)) : (world.content.locations.get(id)?.name ?? world.content.topics.get(id)?.name ?? world.content.areas.get(id)?.name ?? id)

/**
 * The answer to a question, for an asker: 'chronicler', or an NPC by id.
 * A title and a text of at most 500 characters, or why it is refused.
 */
export function answerLookup(world: World, asker: string, q: LookupQuery): { title: string; text: string } | { refused: string } {
  const npc = asker !== 'chronicler'
  const facts = world.state.news?.facts ?? []
  if (q.fn === 'knows') {
    if (npc && q.who !== asker) return { refused: 'you cannot look into another head' }
    if (!world.content.npcs.has(q.who)) return { refused: 'no such person' }
    const heard = world.state.news?.heard[q.who] ?? {}
    // A topic, a person, a place, or an area: then what happened there counts.
    const about = (f: Fact) => f.about.includes(q.topic) || f.place === q.topic || f.claim?.subject === q.topic || world.content.locations.get(f.place)?.area === q.topic
    const known = facts.filter((f) => heard[f.id] && about(f) && world.now - f.t <= LOOKUP_LIMITS.knowsDays * DAY).slice(-LOOKUP_LIMITS.facts)
    const text = known.length ? known.map((f) => versionOf(f, heard[f.id]!)).join(' ') : 'Nothing they have heard of.'
    return { title: `what ${nameOf(world, q.who)} knows of ${nameOf(world, q.topic)}`, text: cut(text) }
  }
  if (q.fn === 'why') {
    if (npc) return { refused: 'storylines are for the chronicler' }
    const lines = world.state.chronicle?.lines ?? []
    const line = lines.find((l) => l.id === q.line)
    if (!line) return { refused: 'no such storyline' }
    const title = (id: string) => factById(world, id)?.title
    const causes = [...new Set([...(line.cause ?? []), ...line.facts.flatMap((id) => factById(world, id)?.cause ?? [])])]
      .map(title)
      .filter((t): t is string => Boolean(t))
      .slice(0, LOOKUP_LIMITS.facts)
    const before = line.follows ? lines.find((l) => l.id === line.follows)?.title : undefined
    const parts = [
      causes.length ? `It came from: ${causes.join('; ')}.` : 'Nothing is known to have caused it.',
      before ? `It goes on from "${before}".` : '',
      line.hooks.length ? `Still open: ${line.hooks.slice(0, 3).join('; ')}.` : 'Nothing is left open.',
      line.next ? `Expected next: ${line.next}.` : '',
    ]
    return { title: `why "${line.title}"`, text: cut(parts.filter(Boolean).join(' ')) }
  }
  if (q.fn === 'bond') {
    if (npc && q.a !== asker && q.b !== asker) return { refused: 'you only know your own bonds' }
    if (!world.content.npcs.has(q.a) || !world.content.npcs.has(q.b)) return { refused: 'no such person' }
    const b = world.state.bonds?.[q.a]?.[q.b]
    const tie = tieTo(world, q.a, q.b)
    const numbers = b ? `affinity ${b.affinity}, trust ${b.trust}, fear ${b.fear}, familiarity ${b.familiarity}` : 'they hardly know each other'
    return { title: `${nameOf(world, q.a)} and ${nameOf(world, q.b)}`, text: cut(`${tie ? `${nameOf(world, q.b)} is ${nameOf(world, q.a)}'s ${tie.role}. ` : ''}${numbers}.`) }
  }
  // near: what happened lately at a place or in its area; an NPC only what it heard, in the areas it knows.
  const place = world.content.locations.get(q.place)
  const area = place?.area ?? (world.content.areas.has(q.place) ? q.place : undefined)
  if (!area) return { refused: 'no such place' }
  if (npc) {
    const who = world.npc(asker)
    const areas = new Set([world.location(who.home).area, ...who.knows_areas])
    if (!areas.has(area)) return { refused: 'a place you do not know' }
  }
  const heard = npc ? (world.state.news?.heard[asker] ?? {}) : undefined
  const events = facts
    .filter((f) => world.now - f.t <= LOOKUP_LIMITS.nearDays * DAY && (f.place === q.place || world.content.locations.get(f.place)?.area === area) && (!heard || heard[f.id]))
    .slice(-LOOKUP_LIMITS.events)
  return { title: `lately around ${nameOf(world, q.place)}`, text: cut(events.length ? events.map((f) => (heard ? versionOf(f, heard[f.id]!) : f.text.precise)).join(' ') : 'Nothing of note.') }
}
