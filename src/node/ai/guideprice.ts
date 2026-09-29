import type { LlmRole } from '../../engine/dialogue/llm'
import { MODEL_KINDS } from '../../engine/modelkinds'
import { MEASURED, type Measured } from './measured'
import { CALLS_PER_HOUR, priceOf } from './pricing'
import type { RoleChoice } from './settings'

// A guide price per hour of play (M10.21; Bram, 28 September 2026: what an
// evening costs before he begins). From the tokens a real model used in the
// recorded trial of each kind (npm run trial, src/node/ai/measured.ts) and the
// price of the model the player chose for its role, at the pace of a talkative
// hour (CALLS_PER_HOUR: 40 lines, 25 goal choices, one night's round). A new
// place in a far town stands apart: it comes only where the stranger goes.

export interface GuidePrice {
  /** An hour of conversation: 40 lines to people. */
  conversations?: number
  /** An hour of people choosing their goals: 25 choices. */
  goals?: number
  /** One night's round of the chronicler, with its second look at big lore. */
  night?: number
  /** A new place in a far town: its outline, its first district and the weave of its people. */
  place?: number
  /** The three together, for an hour. */
  hour?: number
  /**
   * A new region, by how full it is built (M10.25): outline its first
   * district and the weave of its people; story that and the story round;
   * full also the world build's five steps and the polish round, once a
   * region run of them is measured.
   */
  region?: { outline?: number; story?: number; full?: number }
}

/** What one call of a kind costs on a model, by its measured tokens; undefined without a price or a measurement. */
function callUsd(kind: string, model: string | undefined, measured: Record<string, Measured>): number | undefined {
  const m = measured[kind]
  const price = model ? priceOf(model) : undefined
  if (!m || !price) return undefined
  return (m.inputTokens * price.input + m.outputTokens * price.output) / 1_000_000
}

export function guidePrice(role: (role: LlmRole) => RoleChoice | undefined, measured: Record<string, Measured> = MEASURED): GuidePrice {
  const model = (kind: string) => role(MODEL_KINDS.find((k) => k.kind === kind)?.role ?? 'chronicler')?.model
  const one = (kind: string) => callUsd(kind, model(kind), measured)
  const sum = (kinds: string[]) => {
    const parts = kinds.map(one)
    return parts.every((p) => p !== undefined) ? parts.reduce((a, b) => a! + b!, 0) : undefined
  }
  const reply = one('npc_reply')
  const goal = one('npc_goals')
  const guide: GuidePrice = {
    ...(reply !== undefined ? { conversations: reply * CALLS_PER_HOUR.voice } : {}),
    ...(goal !== undefined ? { goals: goal * CALLS_PER_HOUR.brain } : {}),
  }
  const night = sum(['chronicle', 'lore_check'])
  if (night !== undefined) guide.night = night * CALLS_PER_HOUR.chronicler
  const place = sum(['outline', 'district', 'weave'])
  if (place !== undefined) guide.place = place
  if (guide.conversations !== undefined && guide.goals !== undefined && guide.night !== undefined) guide.hour = guide.conversations + guide.goals + guide.night
  const outline = sum(['district', 'weave'])
  const story = sum(['district', 'weave', 'region_story'])
  // In full the world build's five steps run over the region, and its polish round (M10.25).
  const step = one('world_step')
  const polish = one('world_polish')
  const full = story !== undefined && step !== undefined && polish !== undefined ? story + 5 * step + polish : undefined
  if (outline !== undefined) guide.region = { outline, ...(story !== undefined ? { story } : {}), ...(full !== undefined ? { full } : {}) }
  return guide
}
