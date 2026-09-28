import { checkContent, lockedIds, NpcSchema } from '../content'
import { sketchNpc, sketchProfession } from '../sketches'
import { newNpcState, type SketchFigure } from '../state'
import type { World } from '../world'
import { growth } from './growth'

// Someone named in a talk becomes a person (M10.9): when the stranger comes
// to the village they live in, or when a storyline brings them to the one who
// spoke of them (a visit). They join the people who came during the game
// (growth), made from the same template as the people of a far place and
// checked as content first; the bond from the talk is their relation to the
// speaker, so both tell the same story. A far place makes its own (far.ts).

/** When the stranger is in a village where someone named lives, they are there now. */
export function meetSketches(world: World): void {
  const people = world.state.lore?.people
  if (!people?.length) return
  const here = `area_${world.location(world.state.player.location).area}`
  for (const s of people) if (!s.npc && s.place === here) developSketch(world, s, 'home')
}

/**
 * Makes someone named a person: at home in their own village, or come to
 * stay with the one who spoke of them (a visit). Undefined when the world
 * would not load with them.
 */
export function developSketch(world: World, s: SketchFigure, how: 'home' | 'visit'): string | undefined {
  if (s.npc) return s.npc
  if (!world.content.npcs.has(s.of)) return undefined
  const speaker = world.npc(s.of)
  const area = how === 'visit' ? world.location(speaker.home).area : s.place.replace(/^area_/, '')
  if (!world.content.areas.has(area)) return undefined
  const places = [...world.content.locations.values()].filter((l) => l.area === area).sort((a, b) => a.id.localeCompare(b.id))
  const home = how === 'visit' ? speaker.home : (places.find((l) => l.tags.includes('private')) ?? places[0])?.id
  const work = how === 'visit' ? speaker.home : (places.find((l) => l.tags.includes('public') && (l.tags.includes('market') || l.tags.includes('social'))) ?? places.find((l) => l.tags.includes('public')))?.id ?? home
  if (!home || !work) return undefined
  const locked = lockedIds(world.base)
  const stem = `npc_${s.name}_${area}`.toLowerCase().replace(/[^a-z0-9_]/g, '')
  let id = stem
  for (let n = 2; locked.has(id) || world.content.npcs.has(id); n++) id = `${stem}_${n}`
  const fallback = world.content.professions.has('labourer') ? 'labourer' : speaker.profession
  const raw = sketchNpc(world, s, { id, home, work, area, profession: sketchProfession(world, s, fallback) })
  const parsed = NpcSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const g = growth(world)
  g.people.push(parsed.data)
  world.regrow()
  if (checkContent(world.content).length) {
    g.people.pop()
    world.regrow()
    return undefined
  }
  world.state.npcs[id] = { ...newNpcState(parsed.data, world.now), location: work }
  s.npc = id
  return id
}
