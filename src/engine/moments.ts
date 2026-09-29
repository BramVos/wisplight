import { knob } from './knobs'
import { GameClock } from './clock'
import type { Card, Output } from './commands'
import { callName, type Location } from './content'
import { regionMap } from './map/region'
import { hexOfId, landmarkIn } from './map/travel'
import { factById, versionOf } from './news'
import type { MomentsState } from './state'
import { weather } from './weather'
import type { World } from './world'

// Moments (M10.11; FO, chapters 4, 7 and 11): what deserves more than a line
// in the log, lit up. Not a new kind of event: the same places and facts the
// engine knows, shown as a card the first time. Seen: a place worth it,
// reached or rising from afar. Heard: a tiding of belang 4 or more. The
// journey (travel.ts) is the third kind, a paragraph instead of a line.


/**
 * What the stranger has had a moment for. A game that had none yet begins
 * with what it knows already, so an old save does not light up everything
 * at once: the places seen, and the tidings heard.
 */
export function moments(world: World, fresh = false): MomentsState {
  const player = world.state.player
  if (!player.moments) {
    const seen = new Set(player.seen ?? [])
    const heard = world.state.news?.heard['player'] ?? {}
    player.moments = {
      // A new game has its moment where it begins (the wreck on Skerrow); an old save has had it.
      places: [...world.content.locations.values()].filter((l) => l.arrival && (seen.has(l.id) || l.id === player.location) && !(fresh && l.id === player.location)).map((l) => l.id),
      sighted: [],
      tidings: Object.keys(heard).filter((id) => (factById(world, id)?.belang ?? 0) >= knob(world, 'moments.tidings_belang')),
    }
  }
  return player.moments
}

/** The arrival text of a place as it reads now: in a storm, in mist, at night, or plain. */
export function arrivalText(world: World, place: Location): string | undefined {
  const a = place.arrival
  if (!a) return undefined
  const sky = weather(world)
  if (sky === 'storm' && a.storm) return a.storm
  if (sky === 'fog' && a.mist) return a.mist
  if (new GameClock(world.now).isNight && a.night) return a.night
  return a.text
}

function card(c: Card): Output {
  return { kind: 'card', text: `${c.title}\n${c.text}${c.from ? `\n(${c.from})` : ''}`, card: c }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The moments of the last command, once each: reaching a place worth it,
 * seeing one rise from afar, a tiding that came to the stranger. Called after
 * every command and at the start of a game.
 */
export function momentsNow(world: World, fresh = false): Output[] {
  const m = moments(world, fresh)
  const out: Output[] = []
  const here = world.state.player.location
  const place = world.content.locations.get(here)
  // Reaching a place worth it: a card, or its words only when it rose into view before.
  if (place?.arrival && !m.places.includes(here)) {
    m.places.push(here)
    const text = arrivalText(world, place)!
    if (m.sighted.includes(here)) out.push({ kind: 'narration', text })
    else out.push(card({ kind: 'arrival', title: place.name, text, picture: here }))
  }
  // Out on the land, a landmark rises into view: the card of the place of it that has words for afar.
  const hex = hexOfId(here)
  const map = hex ? regionMap(world.content) : undefined
  const mark = hex && map ? landmarkIn(world, map, hex) : undefined
  if (mark) {
    const far = [...world.content.locations.values()].filter((l) => l.area === mark.area && l.arrival?.far).sort((a, b) => a.id.localeCompare(b.id))[0]
    if (far && !m.sighted.includes(far.id) && !m.places.includes(far.id)) {
      m.sighted.push(far.id)
      out.push(card({ kind: 'sighting', title: `${far.name}, to the ${mark.wind}`, text: far.arrival!.far!, picture: far.id }))
    }
  }
  // A tiding: a fact of belang 4 or more that came to the stranger, heard or seen.
  const heard = world.state.news?.heard['player'] ?? {}
  for (const [id, h] of Object.entries(heard)) {
    if (m.tidings.includes(id)) continue
    const fact = factById(world, id)
    if (!fact || fact.belang < knob(world, 'moments.tidings_belang')) continue
    m.tidings.push(id)
    const from = h.from === 'witness' ? 'you saw it yourself' : h.from === 'news' ? 'it is going round' : h.from === 'board' ? 'on the notice board' : world.content.npcs.has(h.from) ? `from ${callName(world.npc(h.from))}` : undefined
    out.push(card({ kind: 'tidings', title: cap(fact.title), text: versionOf(fact, h), link: id, ...(from ? { from } : {}) }))
  }
  return out
}
