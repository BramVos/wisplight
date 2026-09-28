import { GameClock, parseHours, weekdayName } from '../clock'
import type { Output } from '../commands'
import type { ChoiceOption } from '../choice'
import { factById } from '../news'
import { playerSkill } from '../rules/player'
import { blessed } from '../rules/blessings'
import { allHold } from '../quests/engine'
import { areaTopicId } from '../content'
import type { Passage } from './passageSchema'
import { weather, weatherLine } from '../weather'
import type { World } from '../world'
import { farPlaceOf, wantFarPlace } from '../growth/far'
import { centre } from './hexgrid'
import { duration, listOf } from './journeyText'
import { journeyHome } from '../lodgings'
import { regionMap } from './region'

// Passages (M10.12; FO, chapters 4 and 7): lines of transport as content, in
// content/<world>/data/passages.yaml. A barge on a canal, a coach on a road, a
// ferry over the sea: its stops (places of the region, or far places beyond
// it), the days and hours it runs, what it costs, how long a leg takes, and
// what you may see on the way. A ride inside the region takes hours; a ride
// to a far place takes days, and the world plays on meanwhile: the stranger
// is far from everyone, and each day may bring something on the way.

const DAY = 24 * 60

export { PassageSchema, type Passage } from './passageSchema'

/** Who takes the money when the content does not say: by the kind of vehicle, else the crew. */
const CREW: Record<string, string> = { barge: 'bargeman', ferry: 'skipper', coach: 'coachman', ship: 'master', cart: 'carter' }

function passages(world: World): Passage[] {
  return [...world.content.passages.values()]
}

/** The passages a word names: its kind, its id, or a word of its own ("barge", "trekschuit", "the coach"). */
export function passagesNamed(world: World, word: string): Passage[] {
  const w = word.toLowerCase().replace(/^the\s+/, '').trim()
  // Its name counts too, by whole words of some length: "the vaart barge", not "a".
  const inName = (p: Passage) => w.length >= 4 && new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(p.name.toLowerCase())
  return passages(world).filter((p) => p.kind === w || p.id === w || p.aliases.some((a) => a.toLowerCase().replace(/^the\s+/, '') === w) || inName(p))
}

/** A stop's location in the world: a place of the region, or the gate of a far place made playable. */
function stopLocation(world: World, stop: string): string | undefined {
  if (world.content.locations.has(stop) && !farPlaceOf(world, stop)) return stop
  const far = farPlaceOf(world, stop)
  return far ? String((far.locations[0] as { id: string }).id) : undefined
}

const isFar = (world: World, stop: string) => !world.content.locations.has(stop) || Boolean(farPlaceOf(world, stop))

/** How a stop is called: the village of a place, or the far place's name. */
export function stopName(world: World, stop: string): string {
  const location = world.content.locations.get(stop)
  if (location && !farPlaceOf(world, stop)) return world.content.areas.get(location.area)?.name ?? location.name
  return world.content.topics.get(stop)?.name ?? stop
}

/** The stop of this passage the stranger stands at, if any. */
export function stopHere(world: World, p: Passage): string | undefined {
  const here = world.state.player.location
  return p.stops.find((s) => stopLocation(world, s) === here)
}

function stopFits(world: World, stop: string, words: string): boolean {
  // "the Ice Works" and "ice works" are the same stop (the Deepwell tram, M10.17).
  const bare = (x: string) => x.toLowerCase().replace(/^the\s+/, '').trim()
  const w = bare(words)
  const location = world.content.locations.get(stop)
  if (location && !farPlaceOf(world, stop)) {
    const area = world.content.areas.get(location.area)
    const topic = world.content.topics.get(areaTopicId(world.content, location.area))
    return location.area === w || bare(location.name).includes(w) || (area !== undefined && bare(area.name) === w) || Boolean(topic?.aliases.some((a) => bare(a) === w))
  }
  const topic = world.content.topics.get(stop)
  return Boolean(topic && (bare(topic.name) === w || topic.aliases.some((a) => bare(a) === w) || stop === w))
}

/** Whether it runs on this day, by the world's own weekdays. */
function runsOn(world: World, p: Passage, t: number): boolean {
  return p.days.length === 0 || p.days.includes(weekdayName(t, world.calendar))
}

const minuteOf = (t: number) => ((t % DAY) + DAY) % DAY

/**
 * When it next goes from its stop, from this moment: now while it takes
 * passengers in its hours, or its next set departure; undefined when it does
 * not run at all.
 */
export function nextDeparture(world: World, p: Passage, from = world.now): number | undefined {
  if (!allHold(world, p.when)) return undefined
  const dayStart = from - minuteOf(from)
  for (let d = 0; d < 8; d++) {
    const day = dayStart + d * DAY
    if (!runsOn(world, p, day)) continue
    if (p.departs.length) {
      for (const hm of [...p.departs].sort()) {
        const [h, m] = hm.split(':').map(Number) as [number, number]
        const t = day + h * 60 + m
        if (t >= from) return t
      }
      continue
    }
    // parseHours gives minutes of the day.
    const [open, close] = p.hours ? parseHours(p.hours) : [0, DAY]
    const start = day + open
    const end = day + close
    if (from < end) return Math.max(start, from)
  }
  return undefined
}

function when(world: World, t: number): string {
  const clock = new GameClock(t)
  const p = clock.parts
  const today = Math.floor(t / DAY) === Math.floor(world.now / DAY)
  const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  return today ? `today at ${time}` : `on ${weekdayName(t, world.calendar)} at ${time}`
}

/** Minutes between two stops: along the way, the map measuring what it can, the content the rest. */
export function rideMinutes(world: World, p: Passage, from: string, to: string): number {
  const fair = p.water && blessed(world.content, world.state.player.character, 'Fair Wind') ? 0.75 : 1
  const map = regionMap(world.content)
  const pos = (s: string) => {
    const hex = map && !isFar(world, s) ? map.locations.get(s) : undefined
    return hex && map ? centre(hex, map.size) : undefined
  }
  const leg = (a: string, b: string): number => {
    const set = p.legs[`${a}>${b}`] ?? p.legs[`${b}>${a}`]
    if (set) return set
    const pa = pos(a)
    const pb = pos(b)
    return pa && pb ? Math.round((Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / p.speed) * 60) : 60
  }
  // Inside the region the map measures the whole ride at once (the barge of before, M10.12 keeps it exact).
  const a = pos(from)
  const b = pos(to)
  if (a && b && !p.legs[`${from}>${to}`] && !p.legs[`${to}>${from}`]) return Math.round((Math.hypot(b[0] - a[0], b[1] - a[1]) / p.speed) * 60 * fair) + p.stop_minutes
  const i = p.stops.indexOf(from)
  const j = p.stops.indexOf(to)
  const [lo, hi] = i < j ? [i, j] : [j, i]
  let minutes = 0
  for (let k = lo; k < hi; k++) minutes += leg(p.stops[k]!, p.stops[k + 1]!)
  return Math.round(minutes * fair) + p.stop_minutes
}

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)
}

export interface PassageHost {
  pass(minutes: number): Output[]
}

/**
 * TAKE THE BARGE [TO WAAGDAM], TRAVEL TO GRAAFHAVEN BY BARGE: a ride on a
 * passage from the stop the stranger stands at. In the region it takes hours
 * and is told in the passage's own words; to a far place it takes days.
 */
export function takePassage(world: World, host: PassageHost, word: string, destination: string | undefined): Output[] {
  const named = passagesNamed(world, word)
  const kind = named[0]?.kind ?? word
  if (!named.length) return [{ kind: 'error', text: `There is no ${word} here.` }]
  const p = named.find((x) => stopHere(world, x)) ?? named[0]!
  const here = stopHere(world, p)
  const names = p.stops.map((s) => stopName(world, s))
  if (!here) return [{ kind: 'error', text: p.where ?? `The ${kind} stops at ${listOf(names)}.` }]
  if (!allHold(world, p.when)) return [{ kind: 'text', text: p.off ?? p.closed ?? `No ${kind} runs now.` }]
  const next = nextDeparture(world, p)
  if (next === undefined || next > world.now) {
    if (next !== undefined && next - world.now <= 60) {
      // It leaves within the hour: wait on the quay and go.
      host.pass(next - world.now)
    } else {
      const closed = p.closed ?? `No ${kind} now.`
      return [{ kind: 'text', text: next === undefined ? closed : `${closed} The next leaves ${when(world, next)}: WAIT FOR THE ${word.replace(/^the\s+/i, '').toUpperCase()}.` }]
    }
  }
  const others = p.stops.filter((s) => s !== here)
  // One other stop: that is where it goes (Bram's rule: one option, do it).
  if (!destination && others.length === 1) destination = stopName(world, others[0]!)
  if (!destination) return [{ kind: 'error', text: `Take the ${kind} where? ${listOf(others.map((s) => stopName(world, s))).replace(/ and ([^ ]+)$/, ' or $1')}.` }]
  const to = p.stops.find((s) => stopFits(world, s, destination))
  if (!to || to === here) return [{ kind: 'error', text: `The ${kind} stops at ${listOf(names)}.` }]
  const far = isFar(world, to) || isFar(world, here)
  const fare = p.fare + (far ? p.far_fare : 0)
  if (world.state.player.money < fare) return [{ kind: 'text', text: `The ${p.crew ?? CREW[p.kind] ?? 'crew'} wants ${world.money(fare)}, and you do not have it.` }]
  const minutes = rideMinutes(world, p, here, to)
  if (far) return journeyByPassage(world, host, p, here, to, minutes, fare)
  world.state.player.money -= fare
  host.pass(minutes)
  world.state.player.location = stopLocation(world, to)!
  return [{ kind: 'narration', text: fill(p.text, { fare: world.money(fare), duration: duration(minutes), place: world.location(world.state.player.location).name }) }]
}

/** WAIT FOR THE BARGE: until it goes from this stop; the clock runs as with any wait. */
export function waitForPassage(world: World, host: PassageHost, word: string): Output[] {
  const named = passagesNamed(world, word)
  if (!named.length) return [{ kind: 'error', text: `There is no ${word} here.` }]
  const p = named.find((x) => stopHere(world, x))
  if (!p) return [{ kind: 'error', text: named[0]!.where ?? `The ${named[0]!.kind} stops at ${listOf(named[0]!.stops.map((s) => stopName(world, s)))}.` }]
  if (!allHold(world, p.when)) return [{ kind: 'text', text: p.off ?? p.closed ?? `No ${p.kind} runs now.` }]
  const next = nextDeparture(world, p)
  const name = word.replace(/^the\s+/i, '').toLowerCase()
  if (next === undefined) return [{ kind: 'text', text: p.closed ?? `No ${name} runs now.` }]
  if (next <= world.now) return [{ kind: 'text', text: `The ${name} is here. TAKE THE ${name.toUpperCase()} TO where you want to go.` }]
  // What goes on meanwhile at the quay is not told: you sit and wait.
  const minutes = next - world.now
  host.pass(minutes)
  return [{ kind: 'narration', text: `You wait ${duration(minutes)}, and the ${name} comes in.` }]
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

/**
 * A journey of days (M10.12): the stranger is away, far from everyone at home
 * (so missed meetings run as they do when you are far, M10.2), while the world
 * plays on day by day. Each day may bring one thing on the way: a sight of the
 * passage, the weather, a hard stretch that tests you, or news from a fellow
 * traveller from the region you pass through. Told as one paragraph.
 */
export function journeyOfDays(world: World, host: PassageHost, how: { by?: Passage; fromName: string; to: string; toName: string; minutes: number; opening: string }): Output[] {
  const days = Math.max(1, Math.ceil(how.minutes / DAY))
  const lines: string[] = []
  const checks: Output[] = []
  // Away from everyone: where the stranger is going is where they are, for the world at home.
  world.state.player.location = how.to
  let left = how.minutes
  for (let d = 0; d < days; d++) {
    const step = Math.min(DAY, left)
    host.pass(step)
    left -= step
    const event = dayOnTheWay(world, how.by)
    if (event?.check) checks.push(event.check)
    if (event?.text) lines.push(`On the ${ORDINAL[d] ?? `${d + 1}th`} day, ${event.text.charAt(0).toLowerCase()}${event.text.slice(1)}`)
    if (event?.extra) host.pass(event.extra)
  }
  ;(world.state.player.journeys ??= []).push({ t: world.now, from: how.fromName, to: how.toName, ...(how.by ? { by: how.by.name } : {}), minutes: how.minutes })
  // Where the stranger belongs (M10.13): the room they left their things in, or that waits for them on the way back.
  const farAway = Boolean(world.content.areas.get(world.location(how.to).area)?.topic)
  const home = journeyHome(world, farAway)
  const text = [how.opening, ...(home && farAway ? [home] : []), ...lines, `You come to ${world.location(how.to).name}.`, ...(home && !farAway ? [home] : [])].join(' ')
  return [...checks, { kind: 'narration', text, journey: true }]
}

function dayOnTheWay(world: World, p: Passage | undefined): { text?: string; check?: Output; extra?: number } | undefined {
  if (world.rng.next('passage') >= 0.6) return undefined
  const kinds = ['sight', 'weather', 'check', 'tiding'].filter((k) => k !== 'sight' || (p?.sights.length ?? 0) > 0)
  const kind = world.rng.pick('passage', kinds)
  if (kind === 'sight') return { text: world.rng.pick('passage', p!.sights) }
  if (kind === 'weather') {
    const sky = weatherLine(world, weather(world), new GameClock(world.now).isNight)
    return sky ? { text: sky } : undefined
  }
  if (kind === 'check') {
    // A hard stretch: a mired wheel, a heavy sea, a river to ford. Survival carries you through.
    const roll = world.rng.int('passage', 1, 20)
    const total = roll + playerSkill(world, 'survival')
    const ok = total >= 12
    return {
      check: { kind: 'check', text: `(Survival ${total} vs DC 12: ${ok ? 'success' : 'failure'})` },
      text: ok ? 'a hard stretch of the way, and you come through it without trouble.' : 'a hard stretch of the way costs you half a day and most of your temper.',
      ...(ok ? {} : { extra: 360 }),
    }
  }
  // News from a fellow traveller: something of the region you pass through that you had not heard yet.
  const heard = world.state.news?.heard['player'] ?? {}
  const fresh = (world.state.news?.facts ?? []).filter((f) => f.belang >= 2 && !heard[f.id] && world.now - f.t < 14 * DAY && world.content.locations.has(f.place)).slice(-5)
  const fact = fresh.length ? world.rng.pick('passage', fresh) : undefined
  if (!fact) {
    const sky = weatherLine(world, weather(world), false)
    return sky ? { text: sky } : undefined
  }
  ;((world.state.news!.heard['player'] ??= {}) as Record<string, unknown>)[fact.id] = { level: 1, reliability: 0.6, from: 'news', t: world.now }
  return { text: `a fellow traveller has news: "${factById(world, fact.id)?.text.far ?? fact.text.far}"` }
}

/** A ride to or from a far place: made playable first (by the chronicler if a model is there), then days on the way. */
function journeyByPassage(world: World, host: PassageHost, p: Passage, from: string, to: string, minutes: number, fare: number): Output[] {
  const farStop = isFar(world, to) ? to : undefined
  if (farStop && !farPlaceOf(world, farStop)) {
    wantFarPlace(world, farStop, { from: stopLocation(world, from)!, minutes, by: p.id, water: p.water })
    if (!farPlaceOf(world, farStop)) {
      if (world.state.growth?.farPending?.includes(farStop)) return [{ kind: 'system', text: `The chronicler is working out ${stopName(world, farStop)}. Try again in a moment.` }]
      return [{ kind: 'error', text: `Nobody on the ${p.kind} can tell you anything of ${stopName(world, farStop)}; it does not go there after all.` }]
    }
  }
  world.state.player.money -= fare
  const dest = stopLocation(world, to)!
  const opening = `You pay ${world.money(fare)} and travel by ${p.name} from ${stopName(world, from)} to ${stopName(world, to)}. It takes ${duration(minutes)}.`
  return journeyOfDays(world, host, { by: p, fromName: stopName(world, from), to: dest, toName: stopName(world, to), minutes, opening })
}

/**
 * The ways to a place beyond the region (M10.12), for TRAVEL TO and the land
 * map: on foot along its road, and every passage that goes there, with its
 * next departure, how long and what it costs.
 */
export function waysTo(world: World, topic: string): (ChoiceOption & { how: 'foot' | 'passage'; detail: string })[] {
  const ways: (ChoiceOption & { how: 'foot' | 'passage'; detail: string })[] = []
  const name = world.content.topics.get(topic)?.name ?? topic
  const far = farPlaceOf(world, topic)
  if (far && !far.link.by) {
    const days = Math.round(far.link.minutes / DAY)
    ways.push({ how: 'foot', label: `On foot, ${days === 1 ? 'a day' : `${days} days`} from ${world.location(far.link.from).name}`, command: `travel to ${name} on foot`, detail: `${days === 1 ? 'a day' : `${days} days`} on foot` })
  } else if (!far && world.content.topics.get(topic)?.pos) {
    ways.push({ how: 'foot', label: 'On foot, by the road out of the region', command: `travel to ${name} on foot`, detail: 'on foot' })
  }
  for (const p of passages(world)) {
    if (!p.stops.includes(topic)) continue
    const from = stopHere(world, p) ?? p.stops.find((s) => s !== topic && !isFar(world, s))
    if (!from) continue
    const next = nextDeparture(world, p)
    const minutes = rideMinutes(world, p, from, topic)
    const fare = p.fare + p.far_fare
    const leaves = next === undefined ? (p.closed ?? 'not running now') : `next ${when(world, next)}`
    ways.push({ how: 'passage', label: `${p.name.charAt(0).toUpperCase()}${p.name.slice(1)} from ${stopName(world, from)}: ${leaves}, ${duration(minutes)}, ${world.money(fare)}`, command: `travel to ${name} by ${p.kind}`, detail: `${leaves}, ${duration(minutes)}, ${world.money(fare)}` })
  }
  return ways
}

/** The journeys the stranger made (M10.12), a line each, for the journal. */
export function journeyLines(world: World): string[] {
  return (world.state.player.journeys ?? []).map((j) => {
    const p = new GameClock(j.t - j.minutes).parts
    return `${weekdayName(j.t - j.minutes, world.calendar)} ${p.day} ${world.calendar.months[p.month - 1]}: ${j.by ? `by ${j.by}` : 'on foot'} from ${j.from} to ${j.to}, ${duration(j.minutes)}.`
  })
}
