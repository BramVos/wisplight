import { callName } from './content'
import type { Output } from './commands'
import { agreements } from './agreements'
import { objectKey } from './state'
import type { World } from './world'

// Coming back (M10.13): who comes back to a place they know after a day or
// more gets, after its description, at most three lines of what changed and
// can be seen here: an object in another state, the place in another state,
// someone who lives here now or no longer, something agreed that plays here.
// What the stranger caused comes first; what they already heard as news does
// not count. The words are the world's own (returning.yaml); a world without
// them says nothing. From state that is there already: no new simulation.

const DAY = 24 * 60
const MAX_LINES = 3

type Visit = NonNullable<World['state']['player']['visits']>[string]

function residents(world: World, location: string): string[] {
  return [...world.content.npcs.values()]
    .filter((n) => (n.home === location || n.work === location) && !world.state.npcs[n.id]?.dead && !n.creature)
    .map((n) => n.id)
    .sort()
}

function snapshot(world: World, location: string): Visit {
  const place = world.content.locations.get(location)
  const objects: Record<string, string> = {}
  for (const obj of place?.objects ?? []) objects[obj.id] = JSON.stringify(world.state.objects[objectKey(location, obj.id)] ?? {})
  const state = world.state.places?.[location]?.state
  return { t: world.now, objects, ...(state ? { state } : {}), residents: residents(world, location) }
}

/** The place the stranger stands at, as it is now: kept for when they come back. Called after every command. */
export function noteVisit(world: World): void {
  const here = world.state.player.location
  if (!world.content.locations.has(here) || here.startsWith('hex:')) return
  ;(world.state.player.visits ??= {})[here] = snapshot(world, here)
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)

/**
 * What changed at a place since the stranger was last there, a day or more
 * ago: at most three lines, what they caused first. Undefined when there is
 * nothing, or no words for it.
 */
export function returningLines(world: World, location: string): string[] {
  const words = world.content.returning
  const was = world.state.player.visits?.[location]
  if (!words || !was || world.now - was.t < DAY) return []
  const place = world.content.locations.get(location)
  if (!place) return []
  // What the stranger heard of this place since: that is not news any more.
  const heard = world.state.news?.heard['player'] ?? {}
  const facts = (world.state.news?.facts ?? []).filter((f) => f.place === location && f.t > was.t)
  const told = facts.some((f) => heard[f.id])
  const byYou = facts.some((f) => f.about.includes('player') || f.by === 'player')
  const lines: { text: string; mine: boolean; rank: number }[] = []
  // The place itself.
  const state = world.state.places?.[location]?.state
  if ((state ?? 'normal') !== (was.state ?? 'normal') && !told) {
    const text = words.place[state ?? 'normal'] ?? words.place['default']
    if (text) lines.push({ text: fill(text, { place: place.name }), mine: byYou, rank: 0 })
  }
  // Its objects.
  for (const obj of place.objects) {
    const now = world.state.objects[objectKey(location, obj.id)] ?? {}
    const before = JSON.parse(was.objects[obj.id] ?? '{}') as Record<string, unknown>
    const changed = Object.entries(now).find(([key, value]) => before[key] !== value)
    if (!changed) continue
    const [key, value] = changed
    const text = words.object[`${key}:${String(value)}`] ?? words.object[key] ?? words.object['default']
    const name = obj.name ?? world.content.objectTypes.get(obj.type)?.name ?? obj.id
    if (text) lines.push({ text: fill(text, { object: name, place: place.name }), mine: byYou, rank: 1 })
  }
  // Who lives or works here.
  const nowHere = residents(world, location)
  for (const id of nowHere) if (!was.residents.includes(id) && words.came) lines.push({ text: fill(words.came, { name: callName(world.npc(id)) }), mine: false, rank: 2 })
  for (const id of was.residents) {
    if (nowHere.includes(id) || !world.content.npcs.has(id)) continue
    const npc = world.npc(id)
    const them = npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'him' : 'them'
    const text = world.state.npcs[id]?.dead ? words.dead : words.gone
    if (text) lines.push({ text: fill(text, { name: callName(npc), them: them! }), mine: false, rank: 2 })
  }
  // Something agreed that plays here.
  if (words.agreement) {
    for (const a of agreements(world)) {
      if (a.status !== 'open' || (a.by !== 'player' && a.to !== 'player')) continue
      if (!Object.values(a.terms).includes(location)) continue
      lines.push({ text: fill(words.agreement, { what: a.what }), mine: true, rank: 3 })
    }
  }
  return lines
    .sort((a, b) => Number(b.mine) - Number(a.mine) || a.rank - b.rank)
    .slice(0, MAX_LINES)
    .map((l) => l.text)
}

/** The lines as output, marked so the narrator may make one paragraph of them with a model. */
export function returningOutput(world: World, location: string): Output[] {
  const lines = returningLines(world, location)
  return lines.length ? [{ kind: 'narration', text: lines.join(' '), returning: true }] : []
}
