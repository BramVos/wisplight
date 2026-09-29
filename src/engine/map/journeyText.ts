import { GameClock } from '../clock'
import { cachedSystem } from '../dialogue/llm'
import { callName } from '../content'
import { weather } from '../weather'
import type { World } from '../world'

// A journey told in one paragraph (M10.11; FO, chapter 7): instead of a line
// that lists the lands, what the journey was, by the rules, from sentences in
// the world's content per terrain and weather (journey.yaml), seeded so it is
// not the same each time. With a model, the narrator may reword it (the
// engine does that, and keeps this paragraph when the words do not pass).

export interface JourneyFacts {
  /** How it began: "You head east", "You follow the tow path west to Oude Zijl". */
  how: string
  minutes: number
  /** The kinds of land and way, in the order met: fen, fields, canal, road, ridge. */
  terrains: string[]
  /** A landmark seen on the way, with where it lay. */
  seen?: { text: string; wind: string }
  /** Who the stranger passed on the way. */
  met: string[]
  /** Why the walk ended, when it did not end where it meant to: the mist, a bog, nightfall. */
  reason?: string
  /** Where it ended, when at a place. */
  arrived?: string
}

export function duration(minutes: number): string {
  // A journey of days (M10.12): days, and the hours over.
  if (minutes >= 24 * 60) {
    const days = Math.floor(minutes / (24 * 60))
    const hours = Math.round((minutes - days * 24 * 60) / 60)
    return `${days === 1 ? 'a day' : `${days} days`}${hours >= 1 ? ` and ${hours === 1 ? 'an hour' : `${hours} hours`}` : ''}`
  }
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours === 1 ? 'an hour' : `${hours} hours`}${rest >= 10 ? ` and ${rest} minutes` : ''}`
}

export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** Whether the world has sentences for journeys (a world without keeps the one line of before). */
export function tellsJourneys(world: World): boolean {
  return Boolean(world.content.journey && Object.keys(world.content.journey.terrain).length)
}

/** The paragraph of a journey: how long, over what, in what weather, what you saw and whom you passed, and how it ended. */
export function journeyParagraph(world: World, j: JourneyFacts): string {
  const kit = world.content.journey!
  const pick = (list: string[] | undefined) => (list?.length ? world.rng.pick('journey', list) : undefined)
  const lands = [...new Set(j.terrains)].filter((t) => kit.terrain[t]?.length).slice(0, 2)
  const night = new GameClock(world.now).isNight
  const parts = [
    `${j.how} for ${duration(j.minutes)}.`,
    ...lands.map((t) => pick(kit.terrain[t])),
    pick(kit.weather[weather(world)]),
    night ? pick(kit.night) : undefined,
    j.seen ? `Away to the ${j.seen.wind} you see ${j.seen.text}.` : undefined,
    j.met.length ? `On the way you pass ${listOf(j.met)}.` : undefined,
    j.reason,
    j.arrived ? `You come to ${j.arrived}.` : undefined,
  ]
  return parts.filter((p): p is string => Boolean(p)).join(' ')
}

/** Who stood on the ground the stranger crossed, by the names they are known by. */
export function metOnTheWay(world: World, hexIds: string[]): string[] {
  const out: string[] = []
  for (const id of hexIds) for (const npc of world.npcsAt(id)) if (world.content.npcs.has(npc)) out.push(callName(world.npc(npc)))
  return [...new Set(out)].slice(0, 3)
}

/**
 * The narrator's request (M10.11): the paragraph reworded in the voice of the
 * world, one call, with nothing added and nothing left out.
 */
export function journeyRequest(world: World, paragraph: string, frame: string, kind: 'journey' | 'return' = 'journey'): import('../dialogue/llm').LlmRequest {
  const task =
    kind === 'return'
      ? 'You are the narrator of a text game. The player comes back to a place they know; make these few lines about what changed since their last visit into one short paragraph in the voice of this world: one to three sentences, second person, present tense, plain words. Keep every fact; add nothing: no people, places, events or numbers that are not in it. JSON only.'
      : 'You are the narrator of a text game. Reword the journey the player made in the voice of this world: two to five sentences, second person, present tense, plain words. Keep every fact: how long, over what, the weather, what was seen, who was passed, how it ended and where. Add nothing: no people, places, events or numbers that are not in it. JSON only.'
  return {
    role: 'chronicler',
    ...cachedSystem([frame, '', task].join('\n'), '', '', 'none'),
    prompt: `${kind === 'return' ? 'WHAT CHANGED' : 'THE JOURNEY'}: ${paragraph}`,
    schemaName: 'journey',
    schema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    maxTokens: 300,
    priority: 'low',
    meta: { journey: paragraph },
  }
}
