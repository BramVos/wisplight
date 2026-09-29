import { itemName } from '../items'
import { worldText } from '../safety'
import type { World } from '../world'
import { tokensAbout } from './llm'
import { cardLines, sharedPart } from './prompt'
import { landVoiceLines } from './voice'

// The area block of the conversations (M10.28; Bram, 29 September 2026: one
// cached block per area). Everything a talk here shares, whoever speaks: the
// rules, the frame, the land's voice kit, the area with its places, and the
// cards of the people who live here, with where they live and work; every
// resident knows all of it (their own area is certain knowledge, FO chapter
// 5). One block with the cache mark, so each line reads it from the cache.
// Haiku caches nothing under 4,096 tokens, and most areas are smaller: a
// small area shares its block with its neighbours, grouped once for the
// whole land, so walking between them reads the same block. Only what stays
// the same goes in; what changes (the hour, the weather, the news, who is
// where, how they feel about the stranger) and what only the speaker knows
// (their people, their secrets, their memories) stays with the talk.

/** The size a block is filled to (about-tokens, four characters each): above Haiku's minimum of 4,096 real tokens, with room for the difference. */
export const BLOCK_FLOOR = 4600

const THESE_PARTS = 'THESE PARTS: what the people who live here all know, and a card for each of them. The one YOU ARE names speaks; every other card is someone else.'

interface AreaPart {
  area: string
  text: string
  cast: string[]
}

/** The people who live in an area, by id: those whose home is there. */
function residents(world: World, area: string): string[] {
  return [...world.content.npcs.values()]
    .filter((npc) => world.content.locations.get(npc.home)?.area === area)
    .map((npc) => npc.id)
    .sort()
}

/** What one area brings to a block: its summary, its places, and the cards of its people. */
function areaPart(world: World, area: string): AreaPart {
  const { content } = world
  const own = content.areas.get(area)
  const cast = residents(world, area)
  const places = [...content.locations.values()].filter((l) => l.area === area).sort((a, b) => a.id.localeCompare(b.id))
  const livesAt = (id: string) => {
    const npc = world.npc(id)
    return [`Lives at ${content.locations.get(npc.home)?.name ?? npc.home}.`, npc.work && npc.work !== npc.home ? `Works at ${content.locations.get(npc.work)?.name ?? npc.work}.` : ''].filter(Boolean).join(' ')
  }
  const placeLine = (id: string) => {
    const place = content.locations.get(id)!
    const sold = place.services.flatMap((s) => {
      const seller = content.npcs.get(s.provider)?.short
      const goods = Object.keys(s.sells).map((i) => itemName(content, i, 2).replace(/^2 /, ''))
      return seller && goods.length ? [`${seller} sells ${goods.join(' and ')} there.`] : []
    })
    return `  ${place.name} (${place.id}): ${place.summary ?? place.description.day.split(/(?<=[.!?])\s/)[0]}${sold.length ? ` ${sold.join(' ')}` : ''}`
  }
  const lines = [
    `AREA ${own?.name ?? area} (${area}): ${own?.summary ?? ''}${own?.market_days.length ? ` Market on ${own.market_days.join(' and ')}.` : ''}`,
    ...(places.length ? ['PLACES:', ...places.map((p) => placeLine(p.id))] : []),
    ...cast.map((id) => [`CARD ${id}`, ...cardLines(world, id, true), livesAt(id)].join('\n')),
  ]
  return { area, text: lines.join('\n'), cast }
}

/** Which areas border which: a way from a place in one to a place in the other. */
function borders(world: World): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const place of world.content.locations.values()) {
    for (const exit of Object.values(place.exits)) {
      const other = exit && world.content.locations.get(exit.to)?.area
      if (!other || other === place.area) continue
      if (!out.has(place.area)) out.set(place.area, new Set())
      if (!out.has(other)) out.set(other, new Set())
      out.get(place.area)!.add(other)
      out.get(other)!.add(place.area)
    }
  }
  return out
}

// Worked out once per state of the content (a region built in play adds areas and people, M10.25).
const grouped = new WeakMap<object, { key: string; groups: Map<string, string[]> }>()

/**
 * The areas that share a block (M10.28), grouped once for the land: the
 * largest area first, each group growing by its largest neighbour until it
 * reaches the floor; a group that cannot, joins the smallest group next to
 * it. The same grouping for every area of the land, so a block stays the
 * same while the stranger walks within its group.
 */
export function blockGroups(world: World): Map<string, string[]> {
  const { content } = world
  const key = `${content.locations.size}:${content.npcs.size}:${content.areas.size}`
  const known = grouped.get(content)
  if (known?.key === key) return known.groups
  const areas = [...new Set([...content.areas.keys(), ...[...content.locations.values()].map((l) => l.area)])].sort()
  const size = new Map(areas.map((a) => [a, tokensAbout(areaPart(world, a).text)]))
  const near = borders(world)
  const groupOf = new Map<string, string[]>()
  const order = [...areas].sort((a, b) => size.get(b)! - size.get(a)! || a.localeCompare(b))
  const total = (group: string[]) => group.reduce((n, a) => n + size.get(a)!, 0)
  const floor = BLOCK_FLOOR - tokensAbout(sharedPart(world)) - tokensAbout([...landVoiceLines(world), THESE_PARTS].join('\n'))
  const groups: string[][] = []
  for (const area of order) {
    if (groupOf.has(area)) continue
    const group = [area]
    groupOf.set(area, group)
    while (total(group) < floor) {
      const next = [...new Set(group.flatMap((a) => [...(near.get(a) ?? [])]))].filter((a) => !groupOf.has(a)).sort((a, b) => size.get(b)! - size.get(a)! || a.localeCompare(b))[0]
      if (!next) break
      group.push(next)
      groupOf.set(next, group)
    }
    groups.push(group)
  }
  // A group still under the floor joins the smallest group beside it; one that borders none (a hamlet reached over the
  // map, not by a way) the group nearest on the map.
  const pos = (area: string): [number, number] | undefined => {
    const own = content.areas.get(area)?.pos
    if (own) return own
    const at = [...content.locations.values()].filter((l) => l.area === area && l.pos).map((l) => l.pos!)
    return at.length ? [at.reduce((n, p) => n + p[0], 0) / at.length, at.reduce((n, p) => n + p[1], 0) / at.length] : undefined
  }
  const apart = (a: string[], b: string[]) => Math.min(...a.flatMap((x) => b.map((y) => {
    const [p, q] = [pos(x), pos(y)]
    return p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : Infinity
  })))
  for (const group of [...groups].sort((a, b) => total(a) - total(b) || a[0]!.localeCompare(b[0]!))) {
    if (total(group) >= floor || !groups.includes(group)) continue
    const others = groups.filter((g) => g !== group)
    const bordering = [...new Set(group.flatMap((a) => [...(near.get(a) ?? [])].map((n) => groupOf.get(n)!)))].filter((g) => g !== group)
    const beside = bordering.sort((a, b) => total(a) - total(b) || a[0]!.localeCompare(b[0]!))[0] ?? others.filter((g) => apart(group, g) < Infinity).sort((a, b) => apart(group, a) - apart(group, b) || a[0]!.localeCompare(b[0]!))[0]
    if (!beside) continue
    beside.push(...group)
    for (const a of group) groupOf.set(a, beside)
    groups.splice(groups.indexOf(group), 1)
  }
  const out = new Map<string, string[]>()
  for (const [area, group] of groupOf) out.set(area, [...group].sort())
  grouped.set(content, { key, groups: out })
  return out
}

/**
 * The block of the area the stranger is in (M10.28): the shared part (the
 * rules and the frame, marked on its own as before), and the block of the
 * area's group, with who has a card in it.
 */
export function areaBlock(world: World, area: string): { shared: string; block: string; cast: string[] } {
  const group = blockGroups(world).get(area) ?? [area]
  const parts = group.map((a) => areaPart(world, a))
  const voice = landVoiceLines(world)
  const block = [
    ...voice,
    THESE_PARTS,
    ...parts.map((p) => p.text),
  ].join('\n')
  return { shared: sharedPart(world), block: worldText(block), cast: parts.flatMap((p) => p.cast) }
}
