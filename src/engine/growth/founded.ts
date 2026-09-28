import { checkContent, FactionSchema, lockedIds } from '../content'
import { knob } from '../knobs'
import { recordFact } from '../news'
import type { World } from '../world'
import { growth } from './growth'

// A new faction (M10.22; Bram, 28 September 2026: factions and interests grow,
// but within bounds). A town or a region that grows in play brings no new
// factions; one forms only from a plan (of a great line, or of a storyline
// the chronicler plans: an uprising that becomes a movement), at most one a
// season in a world, and it is kept as content in the save, under an id the
// world never had, so an old save and a later world both still load.

const DAY = 24 * 60

/** Makes a faction, if the season allows one and the world loads with it. */
export function foundFaction(world: World, input: { id: string; name: string; wants: string; seat: string; at?: string; members: string[]; join: 'never' | 'hired' | 'reputation' }): boolean {
  const g = growth(world)
  const every = knob(world, 'growth.new_faction_days')
  if ((g.founded ?? []).some((t) => world.now - t < every * DAY)) return false
  const locked = lockedIds(world.base)
  let id = input.id
  for (let n = 2; world.content.factions.has(id) || locked.has(id); n++) id = `${input.id}_${n}`
  const at = input.at && (world.content.locations.has(input.at) || world.content.areas.has(input.at)) ? input.at : undefined
  const parsed = FactionSchema.safeParse({ id, name: input.name, seat: input.seat, wants: input.wants, seats: at ? [{ at, wants: input.wants }] : [], members: [...new Set(input.members)].sort(), join: input.join })
  if (!parsed.success) return false
  const before = g.factions
  g.factions = [...(g.factions ?? []), parsed.data as unknown as Record<string, unknown>]
  world.regrow()
  if (checkContent(world.content).length) {
    g.factions = before
    world.regrow()
    return false
  }
  ;(g.founded ??= []).push(world.now)
  const where = at ? (world.content.locations.get(at)?.id ?? [...world.content.locations.values()].find((l) => l.area === at)?.id) : undefined
  const place = where ?? (parsed.data.members[0] ? world.npc(parsed.data.members[0]).home : world.content.world.start.location)
  recordFact(world, { kind: 'faction', about: parsed.data.members, place, belang: 3, title: `${input.name} formed`, text: { precise: `${input.name} has formed: ${input.wants}`, village: `They say ${input.name} has banded together.`, far: `A new party has formed.` } })
  return true
}
