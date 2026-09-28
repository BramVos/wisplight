import { callName } from './content'
import type { Output } from './commands'
import type { Lodging } from './belongSchema'
import { itemName, listItems } from './items'
import type { World } from './world'

// A place to belong (M10.13): one lodging a world offers as content, a room
// rented by the week (the rent from what the inn asks a night), with a chest
// that is the stranger's, things that stay where they are put, and people
// who expect them: the keeper asks where they were, and the people of the
// place know them by name. No building of houses; a marriage home (M7.2)
// stays what it was.

const DAY = 24 * 60
const WEEK = 7 * DAY

/** The lodging the stranger rents now, while the week runs. */
export function lodgingNow(world: World): Lodging | undefined {
  const id = world.state.player.lodgingId
  const lodging = id ? world.content.lodgings.get(id) : undefined
  return lodging && world.now < (world.state.player.lodging?.until ?? 0) ? lodging : undefined
}

/** The rent for a week: the content's, or five nights at the price the inn asks. */
export function rentOf(world: World, l: Lodging): number {
  if (l.rent) return l.rent
  const area = world.content.locations.get(l.at)?.area
  const night = [...world.content.locations.values()].filter((loc) => loc.area === area).flatMap((loc) => loc.services).find((s) => s.lodging)?.lodging
  return (night ?? 10) * 5
}

/** The lodging offered where the stranger stands: in its room, or with its keeper at hand. */
function offeredHere(world: World): Lodging | undefined {
  const here = world.state.player.location
  const place = world.content.locations.get(here)
  const sameArea = (l: Lodging) => place?.area === world.content.locations.get(l.at)?.area
  // In the room, where the inn lets rooms (its counter, open or not), or with the keeper at hand in the same place.
  return [...world.content.lodgings.values()].find((l) => l.at === here || (sameArea(l) && (place!.services.some((s) => s.lodging) || world.npcsAt(here).includes(l.keeper))))
}

/** RENT THE ROOM FOR A WEEK: the room is yours for seven days, the chest with it; again, a week more. */
export function rentLodging(world: World): Output[] {
  const l = offeredHere(world)
  if (!l) return [{ kind: 'error', text: 'Nobody here lets a room by the week.' }]
  const rent = rentOf(world, l)
  if (world.state.player.money < rent) return [{ kind: 'text', text: `${callName(world.npc(l.keeper))} wants ${world.money(rent)} for a week, and you do not have it.` }]
  world.state.player.money -= rent
  const current = lodgingNow(world)?.id === l.id ? world.state.player.lodging!.until : world.now
  world.state.player.lodging = { location: l.at, until: Math.max(current, world.now) + WEEK }
  world.state.player.lodgingId = l.id
  const keeper = callName(world.npc(l.keeper))
  return [{ kind: 'narration', text: current > world.now ? `${keeper} takes ${world.money(rent)}: ${l.name} is yours for another week.` : `${keeper} takes ${world.money(rent)} and gives you the key to ${l.name.replace(/^your /, 'the ')}, for a week.${l.chest ? ' The chest at the foot of the bed is yours to use.' : ''}` }]
}

const inRoom = (world: World, l: Lodging) => world.state.player.location === l.at

/** PUT <thing> IN THE CHEST: kept in your room, yours, while you are away. */
export function putInChest(world: World, words: string): Output[] {
  const l = world.content.lodgings.get(world.state.player.lodgingId ?? '')
  if (!l?.chest || !inRoom(world, l)) return [{ kind: 'error', text: 'There is no chest of yours here.' }]
  const item = [...Object.keys(world.state.player.inventory)].find((id) => id === words || itemName(world.content, id).toLowerCase().includes(words))
  if (!item || !world.state.player.inventory[item]) return [{ kind: 'error', text: `You have no ${words}.` }]
  const qty = world.state.player.inventory[item]!
  delete world.state.player.inventory[item]
  const chest = (world.state.player.chest ??= {})
  chest[item] = (chest[item] ?? 0) + qty
  return [{ kind: 'text', text: `You put ${itemName(world.content, item, qty)} in your chest.` }]
}

/** TAKE <thing> FROM THE CHEST, back into your hands. */
export function takeFromChest(world: World, words: string): Output[] | undefined {
  const l = world.content.lodgings.get(world.state.player.lodgingId ?? '')
  if (!l?.chest || !inRoom(world, l)) return undefined
  const chest = world.state.player.chest ?? {}
  const item = Object.keys(chest).find((id) => id === words || itemName(world.content, id).toLowerCase().includes(words))
  if (!item) return [{ kind: 'error', text: `There is no ${words} in your chest.` }]
  const qty = chest[item]!
  delete chest[item]
  world.state.player.inventory[item] = (world.state.player.inventory[item] ?? 0) + qty
  return [{ kind: 'text', text: `You take ${itemName(world.content, item, qty)} from your chest.` }]
}

/** Under the room's description: whose room it is, and what is in the chest. */
export function lodgingLines(world: World, location: string): string[] {
  const id = world.state.player.lodgingId
  const l = id ? world.content.lodgings.get(id) : undefined
  if (!l || l.at !== location) return []
  const lines = [lodgingNow(world) ? `This is ${l.name}.` : `This was ${l.name}; the week is up. RENT THE ROOM FOR A WEEK to keep it.`]
  const chest = world.state.player.chest ?? {}
  if (l.chest) lines.push(Object.keys(chest).length ? `In your chest: ${listItems(world.content, chest)}.` : 'Your chest is empty. PUT something IN THE CHEST to keep it here.')
  return lines
}

/** The journal page of the lodging. */
export function lodgingPage(world: World): string[] {
  const id = world.state.player.lodgingId
  const l = id ? world.content.lodgings.get(id) : undefined
  if (!l) {
    const offered = [...world.content.lodgings.values()][0]
    return [offered ? `You have no room of your own. ${callName(world.npc(offered.keeper))} lets one by the week, at ${world.location(offered.at).name}.` : 'You have no room of your own.']
  }
  const until = world.state.player.lodging?.until ?? 0
  const lines = [lodgingNow(world) ? `${l.name.charAt(0).toUpperCase()}${l.name.slice(1)}, paid for until ${world.date(until)}.` : `${l.name.charAt(0).toUpperCase()}${l.name.slice(1)}: the week is up.`, `${callName(world.npc(l.keeper))} lets it.`]
  const chest = world.state.player.chest ?? {}
  if (Object.keys(chest).length) lines.push(`In your chest: ${listItems(world.content, chest)}.`)
  return lines
}

/** For the voice: the people of the lodging's place know the stranger by name. */
export function lodgerLine(world: World, npcId: string): string | undefined {
  const l = lodgingNow(world)
  if (!l || !world.content.npcs.has(npcId)) return undefined
  const area = world.content.locations.get(l.at)?.area
  const npc = world.npc(npcId)
  const theirs = [npc.home, npc.work].some((loc) => loc && world.content.locations.get(loc)?.area === area)
  const name = world.state.player.character?.name
  return theirs ? `THE STRANGER lodges here, in ${l.name.replace(/^your /, 'the ')}${name ? `; you know them by name: ${name}` : ''}.` : undefined
}

/** For a journey (M10.12): where the stranger's things wait, or that the room is waiting on the way back. */
export function journeyHome(world: World, leaving: boolean): string | undefined {
  const l = lodgingNow(world)
  if (!l) return undefined
  return leaving ? `Your things wait in ${l.name}.` : `${l.name.charAt(0).toUpperCase()}${l.name.slice(1)} is waiting for you.`
}
