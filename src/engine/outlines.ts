import { outline as writeOutline, type Outline, type OutlineInput } from '../chronicler/outline'
import type { ChroniclerModel } from '../chronicler'
import { worldFrame } from './dialogue/prompt'
import { regionMap } from './map/region'
import { withoutReference } from './quests/reference'
import { tradeLine } from './economy/ledger'
import type { World } from './world'
import { voiceSummary } from './dialogue/voice'

// The world beyond the map (design: lore and world change, "De wereld buiten de
// kaart"): a far place the player sets off for is worked out once to its
// outline by the chronicler, and from then on it is part of this savegame.
// Without a model, the outline is what the world book says, and nothing more.

export type OutlineEntry = Outline & { by: 'chronicler' | 'template'; t: number }

function outlines(world: World) {
  return (world.state.outlines ??= { pending: [], done: {} })
}

export function outlineOf(world: World, topic: string): OutlineEntry | undefined {
  return world.state.outlines?.done[topic] as OutlineEntry | undefined
}

/** A far place the player wants to reach: work it out, once. */
export function wantOutline(world: World, topic: string): void {
  const state = outlines(world)
  if (state.done[topic] || state.pending.includes(topic)) return
  if (!world.aiLive) {
    applyOutline(world, topic, null)
    return
  }
  state.pending.push(topic)
}

/** Where a far place lies from the region, in words. */
export function farWhere(world: World, topic: string): string | undefined {
  const pos = world.content.topics.get(topic)?.pos
  const map = regionMap(world.content)
  if (!pos || !map) return undefined
  const centre: [number, number] = map.national([map.region.size[0] / 2, map.region.size[1] / 2])
  const km = Math.hypot(pos[0] - centre[0], pos[1] - centre[1])
  const angle = (Math.atan2(pos[0] - centre[0], pos[1] - centre[1]) * 180) / Math.PI
  const wind = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((angle + 360) % 360) / 45) % 8]
  const days = Math.max(1, Math.round(km / 40))
  return `It lies about ${Math.round(km / 5) * 5} km ${wind} of ${world.words.region}, ${days === 1 ? 'a day' : `${days} days`} on foot.`
}

export function outlineInput(world: World, topic: string): OutlineInput {
  const t = world.content.topics.get(topic)!
  const taken = new Set<string>()
  for (const n of world.content.npcs.values()) taken.add(n.name)
  for (const l of world.content.locations.values()) taken.add(l.name)
  for (const a of world.content.areas.values()) taken.add(a.name)
  for (const other of world.content.topics.values()) if (other.id !== topic) taken.add(other.name)
  for (const far of world.state.lore?.far ?? []) taken.add(far.name)
  for (const done of Object.values(world.state.outlines?.done ?? {})) for (const p of (done as OutlineEntry).places) taken.add(p.name)
  const neighbours = [...world.content.topics.values()]
    .filter((o) => o.id !== topic && o.pos && t.pos && Math.hypot(o.pos[0] - t.pos[0], o.pos[1] - t.pos[1]) < 60)
    .map((o) => ({ name: o.name, text: o.summary }))
  return {
    instruction: withoutReference(world.content.chronicler ?? ''),
    world: [worldFrame(world.content), voiceSummary(world.content)].filter(Boolean).join('\n\n'),
    place: { id: topic, name: t.name, kind: t.kind === 'place' ? 'place' : t.kind, where: farWhere(world, topic) ?? '', known: [t.summary, t.details, t.story, ...[...world.content.outlands.values()].filter((o) => o.topic === topic).map((o) => tradeLine(world, o.id))].filter((x): x is string => Boolean(x)) },
    taken: [...taken].sort(),
    neighbours,
  }
}

/** Stores an outline: the chronicler's, or without one what the world book says. */
export function applyOutline(world: World, topic: string, written: Outline | null): void {
  const state = outlines(world)
  state.pending = state.pending.filter((p) => p !== topic)
  const t = world.content.topics.get(topic)
  if (!t) return
  state.done[topic] = written
    ? { ...written, by: 'chronicler', t: world.now }
    : { summary: t.summary, areas: [], places: [], routes: [], people: [], dangers: [], lore: t.details ? [{ name: t.name, text: t.details }] : [], by: 'template', t: world.now }
}

export async function runOutline(world: World, topic: string, model: ChroniclerModel): Promise<{ outline?: Outline; problems: string[] }> {
  return writeOutline(outlineInput(world, topic), model)
}

/** The lines of an outline for the journal. */
export function outlineLines(entry: OutlineEntry): string[] {
  const lines = [entry.summary]
  if (entry.areas.length) lines.push(`Parts: ${entry.areas.map((a) => `${a.name} (${a.text})`).join('; ')}.`)
  for (const p of entry.places) lines.push(`${p.name}, ${p.kind}: ${p.text}`)
  for (const r of entry.routes) lines.push(`To ${r.to}: ${r.text}`)
  if (entry.people.length) lines.push(`People: ${entry.people.map((p) => `${p.role}, ${p.text}`).join('; ')}`)
  for (const d of entry.dangers) lines.push(`Beware: ${d}`)
  for (const l of entry.lore) lines.push(`${l.name}: ${l.text}`)
  if (entry.by === 'chronicler') lines.push('(Worked out by the chronicler for this game.)')
  return lines
}
