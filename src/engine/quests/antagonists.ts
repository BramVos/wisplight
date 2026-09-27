import type { World } from '../world'
import { flags } from './engine'

// The opponents do not wait for the player (Wereldboek, chapter 14). Since
// M8.3 they are plans in the content (plans.yaml: holleveen_survey,
// holleveen_stakes, the_haakman_counts), started from the first day by
// world.yaml. What is left here is a rule of the road: the widow's mist.

/** The widow's mist: nobody gets through the Kattenbroek carrying measuring chains. */
export function widowTurnsBack(world: World, to: string): string | undefined {
  if (!flags(world)['widow_mist'] || flags(world)['fen_without_keeper']) return undefined
  if (world.content.locations.get(to)?.area !== 'kattenbroek') return undefined
  const carries = Object.keys(world.state.player.inventory).some((id) => world.content.items.get(id)?.tags.includes('survey'))
  return carries ? 'Mist comes up out of the reeds, thick as wool. You walk on and on, and come out where you started, with the chains heavy on your back.' : undefined
}
