import type { World } from '../world'
import { allHold } from './engine'

// The opponents do not wait for the player (Wereldboek, chapter 14). Since
// M8.3 they are plans in the content (plans.yaml). What was left here, the
// widow's mist over the Kattenbroek, is content since M10.17: an area's
// places can be barred while conditions hold, for a stranger carrying
// something with a tag, or for anyone.

/** What turns the stranger back on the way into a place of a barred area, or undefined. */
export function barredWay(world: World, to: string): string | undefined {
  // Every step into a place of the area, also within it: the mist turns you round wherever you are in it.
  const area = world.content.areas.get(world.content.locations.get(to)?.area ?? '')
  if (!area?.barred.length) return undefined
  const carried = Object.keys(world.state.player.inventory)
  for (const bar of area.barred) {
    if (!allHold(world, bar.when)) continue
    if (bar.carrying && !carried.some((id) => world.content.items.get(id)?.tags.includes(bar.carrying!))) continue
    return bar.text
  }
  return undefined
}
