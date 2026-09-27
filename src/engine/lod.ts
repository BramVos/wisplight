import { callName } from './content'
import { remember } from './npc/execute'
import type { NpcState } from './state'
import type { World } from './world'
import { centre } from './map/hexgrid'
import { findPath, minutesFor, playerHex } from './map/travel'
import { regionMap } from './map/region'

// Detail by distance (design: lore and world change, "Wie waar is: detail
// naar afstand"). Near the player an NPC lives every minute; further off, a
// coarser tick is enough; far away, or on a journey across country, it is a
// note: where, doing what, since when, and when to look again. When the
// player comes near, the note becomes a person again, on that spot.

export type Tier = 'full' | 'coarse' | 'note'

/** Within this many km of the player, every minute counts. */
export const FULL_KM = 8
/** Within this many km, a note on the map becomes a person again. */
export const NEAR_KM = 3
/** How often a coarse NPC thinks, in minutes. */
export const COARSE_EVERY = 15

export type Note = NonNullable<NpcState['note']>

function kmBetween(world: World, a: string, b: string): number | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const ha = placeHex(world, a)
  const hb = placeHex(world, b)
  if (!ha || !hb) return undefined
  const [ax, ay] = centre(ha, map.size)
  const [bx, by] = centre(hb, map.size)
  return Math.hypot(bx - ax, by - ay)
}

function placeHex(world: World, location: string) {
  const map = regionMap(world.content)
  if (!map) return undefined
  if (location === world.state.player.location) return playerHex(world)
  return map.locations.get(location) ?? (location.startsWith('hex:') ? { col: Number(location.slice(4).split(',')[0]), row: Number(location.split(',')[1]) } : undefined)
}

export function tierOf(world: World, npcId: string): Tier {
  const npc = world.state.npcs[npcId]!
  if (npc.note) return 'note'
  const km = kmBetween(world, npc.location, world.state.player.location)
  return km === undefined || km <= FULL_KM ? 'full' : 'coarse'
}

/** Whether an NPC thinks this minute: every minute near the player, every quarter of an hour further off. */
export function thinksNow(world: World, npcId: string): boolean {
  const tier = tierOf(world, npcId)
  if (tier === 'note') return false
  return tier === 'full' || world.now % COARSE_EVERY === 0
}

/** Across country where no road runs: the NPC is a note on the way, and arrives when the walk is done. */
export function journey(world: World, npcId: string, to: string): boolean {
  const map = regionMap(world.content)
  const npc = world.npcState(npcId)
  const from = placeHex(world, npc.location)
  const target = placeHex(world, to)
  if (!map || !from || !target) return false
  const path = findPath(world, map, from, target, false)
  if (!path) return false
  const minutes = Math.max(5, path.slice(1).reduce((sum, hex) => sum + minutesFor(world, map.cell(hex)!, false), 0))
  world.emit('depart', npc.location, world.say(`{name} sets off across country towards ${world.location(to).name}.`, npcId), npcId)
  npc.note = { unrest: 'travelling', where: to, from: npc.location, since: world.now, until: world.now + minutes, activity: `on the way to ${world.location(to).name}` }
  npc.activity = npc.note.activity
  npc.busyUntil = world.now + minutes
  return true
}

/**
 * Sends an NPC away for some days: to a far place in the region (a journey
 * there, then a note while the player is far off), or beyond the region.
 * When the days are over, the way home.
 */
export function goAway(world: World, npcId: string, where: string, days: number): void {
  const npc = world.npcState(npcId)
  const stay = world.now + days * 24 * 60
  const inside = world.content.locations.has(where)
  const name = inside ? world.location(where).name : (world.content.topics.get(where)?.name ?? where)
  npc.plan = []
  if (inside && journey(world, npcId, where)) {
    npc.note!.stay = stay
    return
  }
  npc.note = { unrest: 'travelling', where, from: npc.location, since: world.now, until: stay, activity: `away at ${name}`, home: true }
  npc.activity = npc.note.activity
  world.emit('depart', npc.location, world.say(`{name} leaves for ${name}.`, npcId), npcId)
}

/**
 * Every minute: journeys that end, notes that are due a look, and notes the
 * player has come near. Most minutes this finds nothing to do.
 */
export function settleNotes(world: World): void {
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    const note = npc.note
    if (!note || npc.dead) continue
    if (note.until !== undefined && world.now >= note.until) {
      if (note.home) {
        // The days away are over: the way home is one more journey.
        const home = world.npc(id).home
        npc.note = { unrest: 'travelling', where: home, from: note.where, since: world.now, until: world.now + 8 * 60, activity: `on the way home to ${world.location(home).name}` }
        continue
      }
      arrive(world, id)
      continue
    }
    // Someone at a far place in the region: when the player comes near, there they are.
    if (world.content.locations.has(note.where) && note.unrest === 'fixed') {
      const km = kmBetween(world, note.where, world.state.player.location)
      if (km !== undefined && km <= NEAR_KM) materialize(world, id)
    }
  }
}

function arrive(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  const note = npc.note!
  const km = kmBetween(world, note.where, world.state.player.location)
  if (note.stay !== undefined && (km === undefined || km > FULL_KM)) {
    // Far from the player there is no one to see them there: a note in its place until it is time to go home.
    npc.note = { unrest: 'fixed', where: note.where, from: note.from, since: world.now, until: note.stay, activity: `at ${world.location(note.where).name}`, home: true }
    return
  }
  if (note.stay !== undefined) npc.note = { ...note, until: note.stay, home: true }
  materialize(world, npcId)
}

/**
 * A note becomes a person again, on the spot, with a line about how they came
 * there. At the end of a journey the NPC goes on with the plan it had.
 */
export function materialize(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  const note = npc.note
  if (!note) return
  npc.note = undefined
  const where = world.content.locations.has(note.where) ? note.where : world.npc(npcId).home
  const journeyEnd = note.unrest === 'travelling' && !note.home
  npc.location = where
  if (!journeyEnd) npc.plan = []
  // Someone who came for some days stays there until it is time to go home.
  if (note.home && note.until !== undefined && where !== world.npc(npcId).home) npc.stayAt = { where, until: note.until }
  npc.busyUntil = world.now
  npc.activity = 'looking about'
  // Needs by a fixed rule: someone who was away is a little hungry and tired.
  npc.needs.hunger = Math.min(npc.needs.hunger, 60)
  npc.needs.rest = Math.min(npc.needs.rest, 65)
  const from = note.from && world.content.locations.has(note.from) ? world.location(note.from).name : undefined
  remember(world, npcId, from && from !== world.location(where).name ? `came to ${world.location(where).name} from ${from}` : `came back to ${world.location(where).name}`)
  world.emit('arrive', where, `${callName(world.npc(npcId))} arrives.`, npcId)
}
