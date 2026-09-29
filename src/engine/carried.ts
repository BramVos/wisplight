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
  const standard = [...(def.remedy || def.tags.includes('light') ? ['use'] : []), ...(def.food !== undefined ? ['eat'] : []), ...(def.weapon ? ['wield'] : []), ...(def.armour ? ['wear'] : []), 'give']
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
