// How often each kind of call runs in an hour of play, as it was measured
// (M10.27; the cost audit of 29 September 2026, docs/worldbuild/cost-audit.md).
// The guide price counted 40 lines, 25 goal choices and one night's round; the
// clock ran a game minute a real second, paused in a talk or a fight, so an
// hour at the desk is some 25 to 40 unpaused minutes: about 1.35 game days.
// Since M10.28 the pace is a knob, 1 to 8 seconds a game minute, 4 by default.
// The goal choices per game day come from three days of the Nethermarch with
// the mock and the player at the start (tests/m1027goals.test.ts checks that
// the number still fits); the night round comes once a game day and now and
// then an urgent one, within the pacer's one in twenty minutes.

/** Game days in an hour of play at a game minute a real second: 25 to 40 unpaused real minutes. */
export const GAME_DAYS_PER_HOUR = 1.35

/** Game days in an hour of play when a game minute lasts so many real seconds (M10.28: the knob clock.seconds_per_minute). */
export function gameDaysPerHour(secondsPerMinute: number): number {
  return GAME_DAYS_PER_HOUR / secondsPerMinute
}

/** Goal choices that go to the model in a game day since M10.27 (only people near the player or in a story). */
export const GOALS_PER_GAME_DAY = 23

/**
 * Calls per hour of play by kind, by the clock (M10.28): what comes by the
 * game day (goal choices, the night round and its second look) slows with the
 * clock; what the player does (talk, travel, a deed the rules do not know) does
 * not. A kind not named here the guide leaves out of the hour.
 */
export function measuredPerHour(secondsPerMinute: number): Record<string, number> {
  const days = gameDaysPerHour(secondsPerMinute)
  const nights = (1.5 * days) / GAME_DAYS_PER_HOUR
  return { npc_reply: 40, npc_goals: Math.round(GOALS_PER_GAME_DAY * days), chronicle: nights, lore_check: nights, journey: 6, improvise: 2, party_reply: 1, chat_line: 1 }
}

/** Calls per hour of play by kind, as measured in M10.27 at a game minute a second. */
export const MEASURED_PER_HOUR: Record<string, number> = measuredPerHour(1)
