import type { Content } from './content'
import { contractSummary, requiredFields } from './contract'
import { WORLD_GUIDE } from './worldguide'

/**
 * The part of a world build that stays the same from step to step (M10.20):
 * the world guide, the contract without counts, the fields every kind needs,
 * and the chronicler's instruction. It comes first and is cached; the steps
 * of the editor and the rounds that build a region in play (M10.25) share it.
 */
export function worldFixedPart(content: Content | undefined, instruction: string): string {
  return [WORLD_GUIDE, '', contractSummary(content, false), requiredFields(), '', instruction].join('\n')
}
