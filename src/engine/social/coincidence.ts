import { callName } from '../content'
import { recordFact } from '../news'
import type { World } from '../world'
import { setMood, shiftBond } from './deeds'

// A striking coincidence (design: lore and world change, "Intrige en list"):
// the engine carries out every plan literally, so plans cross by themselves.
// Simple rules spot it and mark it as news; the chronicler makes the story.
//  - two people who cannot stand each other meet on the road;
//  - someone arrives looking for a person who has only just left.

const DAY = 24 * 60

function rivals(world: World, a: string, b: string): boolean {
  const bond = world.state.bonds?.[a]?.[b] ?? world.state.bonds?.[b]?.[a]
  return Boolean(bond && bond.affinity <= -20)
}

/** On the road: a route, the open country, or a hex between places. */
function onTheRoad(world: World, place: string): boolean {
  const location = world.content.locations.get(place)
  if (!location) return true
  const kind = world.content.areas.get(location.area)?.kind
  return location.tags.includes('route') || kind === 'route' || kind === 'wilderness'
}

function once(world: World, key: string, within: number): boolean {
  const seen = (world.state.coincidences ??= {})
  if (seen[key] !== undefined && world.now - seen[key]! < within) return false
  seen[key] = world.now
  return true
}

export function noticeCoincidences(world: World): void {
  const byPlace = new Map<string, string[]>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    const s = world.state.npcs[id]!
    if (s.dead || s.note || s.activity === 'asleep' || s.following) continue
    byPlace.set(s.location, [...(byPlace.get(s.location) ?? []), id])
  }
  for (const [place, people] of [...byPlace.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    // Two who cannot stand each other, on the same road.
    for (let i = 0; i < people.length && onTheRoad(world, place); i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i]!
        const b = people[j]!
        if (!rivals(world, a, b) || !once(world, `meet|${a}|${b}`, DAY)) continue
        const na = callName(world.npc(a))
        const nb = callName(world.npc(b))
        const where = world.location(place).name
        shiftBond(world, a, b, -2)
        shiftBond(world, b, a, -2)
        setMood(world, a, -3, 3, `ran into ${nb}`)
        setMood(world, b, -3, 3, `ran into ${na}`)
        recordFact(world, {
          kind: 'coincidence',
          about: [a, b],
          place,
          belang: 1,
          juice: 0.4,
          title: `${na} and ${nb} met at ${where}`,
          text: { precise: `${na} and ${nb} ran into each other at ${where}, and words were had.`, village: `${na} and ${nb} had words at ${where}, they say.`, far: 'Two old enemies met on the road.' },
        })
      }
    }
    // Arriving just after the one you look for has gone.
    for (const seeker of people) {
      const s = world.state.npcs[seeker]!
      for (const goal of s.goals) {
        const target = goal.target
        if (!target || !world.content.npcs.has(target) || target === seeker) continue
        const t = world.state.npcs[target]
        if (!t?.left || t.left.location !== place || t.location === place || world.now - t.left.t > 30) continue
        if (!once(world, `missed|${seeker}|${target}`, DAY)) continue
        const ns = callName(world.npc(seeker))
        const nt = callName(world.npc(target))
        const where = world.location(place).name
        recordFact(world, {
          kind: 'coincidence',
          about: [seeker, target],
          place,
          belang: 1,
          juice: 0.5,
          title: `${ns} just missed ${nt}`,
          text: { precise: `${ns} came to ${where} looking for ${nt}, just after ${nt} had gone.`, village: `${ns} missed ${nt} by a hair at ${where}.`, far: 'Two people missed each other on the road.' },
        })
      }
    }
  }
}
