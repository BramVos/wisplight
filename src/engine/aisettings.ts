// The player's own settings for the AI (M10.20; Bram set $50 an hour while
// building The Quiet Reach, and the app made it $5 without a word). The
// budget is the player's, with their own key: what they set stands. Only a
// slip of the keyboard is caught, a confirmation comes first above a high
// amount, and when a value is changed after all, the screen says so.

/** The most an hour may be set to: only against a slip of the keyboard. */
export const BUDGET_CEILING_USD = 1000
/** The least an hour may be set to. */
export const BUDGET_FLOOR_USD = 0.01
/** Above this an hour, the settings screen asks once before saving. */
export const BUDGET_CONFIRM_USD = 20
/** How long a spoken reply may take, in seconds: past a minute the talk stalls, below three no model answers. */
export const REPLY_WITHIN_SECONDS_RANGE = [3, 60] as const

/** An hourly budget as it is kept, and whether it had to be changed. */
export function hourlyBudget(usd: number): { usd: number; adjusted: boolean } {
  if (!Number.isFinite(usd)) return { usd: BUDGET_FLOOR_USD, adjusted: true }
  const kept = Math.max(BUDGET_FLOOR_USD, Math.min(BUDGET_CEILING_USD, usd))
  return { usd: kept, adjusted: kept !== usd }
}

/** A reply time as it is kept, in whole seconds, and whether it had to be changed. */
export function replyWithin(seconds: number): { seconds: number; adjusted: boolean } {
  const [least, most] = REPLY_WITHIN_SECONDS_RANGE
  if (!Number.isFinite(seconds)) return { seconds: least, adjusted: true }
  const kept = Math.round(Math.max(least, Math.min(most, seconds)))
  return { seconds: kept, adjusted: kept !== seconds }
}
