import type { Output } from '../commands'
import type { World } from '../world'
import { districtsOf, type District } from './districts'
import { farTopicAt } from './far'
import { growth } from './growth'
import { regionRounds, roundsPending, wantRound } from './rounds'

// The world is built on the way (M10.25; Bram, 29 September 2026). The calls
// for a region the stranger travels to begin when they set off, not when they
// arrive: the rounds its setting wants (rounds.ts), and the words of a land
// the designer only framed. A journey plays out in game time in one command,
// so in real time the calls run after it. The travel text gives the setting
// off and one line, "While you travel, the chronicler is laying out the
// Driewater", and keeps back the rest of the way and the arrival until the
// calls are done; is it done before they come, they step into a finished
// region. The same for a district they walk into. While the arrival waits,
// what needs no new place goes on (the journal, waiting, saving); ARRIVE goes
// in at once, and what is not ready comes into view when it is. A call that
// fails ends the wait as the templates do. Without a model there is nothing
// to wait for.

export interface Underway {
  /** The far place's topic of the region; with the district, when it is one. */
  topic: string
  district?: string
  /** What is being laid out, for the line: "the Driewater", "the Weavers' Quarter of Stavermouth". */
  name: string
  /** A journey of days, or a walk into a district. */
  by: 'travel' | 'walk'
  since: number
  /** What the stranger sees on coming in, kept back until it is done or they go on. */
  held?: Output[]
}

/** Commands that need no new place: they go on while the arrival waits. */
const ON_THE_WAY = /^(?:journal|j|map|help|\?|save|load|quit|inventory|inv|i|sheet|character|stats|time|wait|sleep|frames|hooks?|proposals|accept|reject|cost|chart|mode|topics|settings)\b/i

/** The district of a far town a location lies in, by the places the game made for it. */
function districtAt(world: World, topic: string, location: string): District | undefined {
  return Object.values(world.state.growth?.districts ?? {}).find((d) => d.topic === topic && d.locations.some((l) => l['id'] === location))
}

/** Whether anything for where the stranger comes in is still being laid out. */
function busy(world: World, u: Pick<Underway, 'topic' | 'district'>): boolean {
  const g = world.state.growth
  if (u.district) return Boolean(g?.districtPending?.includes(`${u.topic}:${u.district}`))
  const land = world.content.topics.get(u.topic)?.land
  return Boolean((land && g?.landPending?.includes(land)) || roundsPending(world, u.topic))
}

/**
 * After a command that brought the stranger into a region of a far place, or
 * into a district of a far town (M10.25): starts what its setting wants, and
 * while anything is still being laid out, keeps the arrival back. The
 * outputs keep what came before the way and the setting off, with the line;
 * the rest waits in the save. Returns what was kept back (for the narrator),
 * or undefined when the stranger simply arrives.
 */
export function setOff(world: World, before: string, outputs: Output[]): Output[] | undefined {
  const here = world.state.player.location
  if (!world.aiLive || here === before || world.state.growth?.underway) return undefined
  const topic = farTopicAt(world, here)
  if (!topic) return undefined
  const from = farTopicAt(world, before)
  const district = districtAt(world, topic, here)
  const walkedIn = district && districtAt(world, topic, before)?.id !== district.id && district.id !== districtsOf(world.content, topic)[0]?.id
  if (from === topic && !walkedIn) return undefined
  // Into the region: the rounds of its setting, from the moment of setting off.
  const asked: Output[] = []
  if (from !== topic) for (const round of regionRounds(world, topic)) if (!round.pending) asked.push(...wantRound(world, round))
  const town = world.content.topics.get(topic)
  const quarter = walkedIn ? districtsOf(world.content, topic).find((d) => d.id === district.id) : undefined
  const land = town?.land ? world.content.lands.get(town.land) : undefined
  const u: Underway = walkedIn
    ? { topic, district: district.id, name: `${quarter?.name ?? district.id} of ${town?.name ?? topic}`, by: 'walk', since: world.now }
    : { topic, name: regionRounds(world, topic).find((r) => r.kind === 'story')?.name ?? town?.name ?? land?.name ?? topic, by: outputs.some((o) => o.journey) ? 'travel' : 'walk', since: world.now }
  if (!busy(world, u)) {
    outputs.push(...asked)
    return undefined
  }
  // The district's own line says the same as the line here.
  const working = (o: Output) => o.kind === 'system' && /^The chronicler is working out /.test(o.text)
  const kept = outputs.filter((o) => !working(o))
  const way = kept.findIndex((o) => o.journey)
  const opening = way >= 0 ? /^.*?It takes [^.]*\./.exec(kept[way]!.text)?.[0] : undefined
  const rest = way >= 0 && opening ? kept[way]!.text.slice(opening.length).trim() : undefined
  const shown = way >= 0 ? [...kept.slice(0, way), ...(opening ? [{ kind: 'narration' as const, text: opening }] : [])] : []
  const held = way >= 0 ? [...(opening ? (rest ? [{ ...kept[way]!, text: rest }] : []) : [kept[way]!]), ...kept.slice(way + 1)] : kept
  growth(world).underway = { ...u, held }
  outputs.splice(0, outputs.length, ...shown, { kind: 'system', text: `While you ${u.by}, the chronicler is laying out ${u.name}.` }, ...asked.filter((o) => !working(o)))
  return held
}

/**
 * The arrival, once all is laid out (M10.25): what was kept back, now. The
 * host's tick and the next command both look; nothing when it still waits.
 */
export function arrivedAt(world: World): Output[] {
  const u = world.state.growth?.underway
  if (!u || busy(world, u)) return []
  delete world.state.growth!.underway
  return u.held ?? []
}

/**
 * A command while the arrival waits (M10.25): ARRIVE goes in at once; what
 * needs no new place goes on (undefined); anything else hears the line.
 */
export function onTheWay(world: World, text: string): Output[] | undefined {
  const u = world.state.growth?.underway
  if (!u?.held) return undefined
  const said = text.trim()
  if (/^arrive$/i.test(said)) {
    const held = u.held
    delete u.held
    return [...held, { kind: 'system', text: `The chronicler is still laying out ${u.name}; what is not ready yet comes into view when it is.` }]
  }
  if (said.startsWith('@') || ON_THE_WAY.test(said)) return undefined
  return [{ kind: 'system', text: `You are not there yet: the chronicler is laying out ${u.name}. ARRIVE goes on at once, and what is not ready yet comes into view when it is.` }]
}

/** The line for the status bar while a region or district is being laid out (M10.25). */
export function buildingLine(world: World): string | undefined {
  const u = world.state.growth?.underway
  if (!u) return undefined
  return u.held ? `While you ${u.by}, the chronicler is laying out ${u.name}` : `The chronicler is laying out ${u.name}`
}
