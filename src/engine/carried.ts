import { itemName, matchItem } from './items'
import type { World } from './world'

// What you carry (M10.29 E and N, from Bram's playtest of The Quiet Reach:
// "use short-range communicator" said there was no such thing here, and "get
// pocket terminal from pack" that there was no pack). A thing in the pack is
// looked for before the room, may say what using, reading or opening it does
// (`verbs`, as a detail of a place does), and says what can be done with it.

/** The thing in the stranger's pack the words name, if any. */
export function carried(world: World, words: string): string | undefined {
  const inventory = world.state.player.inventory
  return matchItem(world.content, words, Object.keys(inventory).filter((id) => (inventory[id] ?? 0) > 0))
}

/** What can be done with a thing: its own verbs, then the standard ones that fit it. */
export function thingVerbs(world: World, item: string): string[] {
  const def = world.content.items.get(item)
  if (!def) return []
  const own = Object.keys(def.verbs ?? {})
  const standard = [...(def.remedy || def.tags.includes('light') ? ['use'] : []), ...(def.food !== undefined ? ['eat'] : []), ...(def.weapon ? ['wield'] : []), ...(def.armour || def.tags.includes('clothing') ? ['wear'] : []), 'give']
  return [...new Set([...own, ...standard])]
}

/** "You could use it, read it or give it." */
export function couldLine(verbs: string[]): string {
  const said = verbs.map((v) => `${v} it`)
  return `You could ${said.length < 2 ? said[0] : `${said.slice(0, -1).join(', ')} or ${said.at(-1)}`}.`
}

/** A verb done on a thing you carry: its own line, else what it can do, else that there is nothing to do with it. */
export function doWithCarried(world: World, item: string, verb: string): string {
  const def = world.content.items.get(item)!
  const line = def.verbs?.[verb]
  if (line) return line
  // A light you carry lights the way by itself (M10.29: "use lamp" after buying it did nothing).
  if (verb === 'use' && def.tags.includes('light')) return `The ${itemName(world.content, item)} lights your way in the dark while you carry it.`
  const verbs = thingVerbs(world, item).filter((v) => v !== verb && v !== 'give')
  const name = itemName(world.content, item)
  if (verbs.length) return `You can't ${verb} the ${name}. ${couldLine([...verbs, 'give'])}`
  return verb === 'read' ? `There is nothing to read on the ${name}.` : `You turn the ${name} over in your hands; there is nothing to do with it here.`
}

/** The clothes the stranger wears and still carries (M10.33 AD): a thing given or dropped is no longer worn. */
export function wornNow(world: World): string[] {
  const inventory = world.state.player.inventory
  return (world.state.player.worn ?? []).filter((id) => (inventory[id] ?? 0) > 0)
}

/**
 * WEAR <clothes> and TAKE OFF <clothes> (M10.33 AD, Bram's log: "wear coat"
 * against "soaked to the skin" said the world had no rules for characters):
 * a thing tagged clothing is put on or taken off, in every world, rules or
 * none. Nothing when the words name no clothing carried, so WEAR goes on to
 * armour as ever.
 */
export function wearClothes(world: World, words: string, off = false): string | undefined {
  const item = carried(world, words)
  const def = item ? world.content.items.get(item) : undefined
  if (!item || !def?.tags.includes('clothing')) return undefined
  const worn = wornNow(world)
  const name = itemName(world.content, item)
  if (off) {
    if (!worn.includes(item)) return `You are not wearing the ${name}.`
    world.state.player.worn = worn.filter((id) => id !== item)
    return `You take off the ${name}.`
  }
  if (worn.includes(item)) return `You are wearing the ${name} already.`
  world.state.player.worn = [...worn, item]
  return `You put on the ${name}.${def.tags.includes('rainproof') ? ' The rain will not get through it.' : ''}`
}

/** What the stranger wears that keeps the rain out, if anything: clothes or armour tagged rainproof (M10.33 AD). */
export function keptDry(world: World): string | undefined {
  const armour = world.state.player.character?.gear.armour
  const dry = [...wornNow(world), ...(armour ? [armour] : [])].find((id) => world.content.items.get(id)?.tags.includes('rainproof'))
  return dry && itemName(world.content, dry)
}

