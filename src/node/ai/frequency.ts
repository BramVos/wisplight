// How often each kind of call runs in an hour of play, as it was measured
// (M10.27; the cost audit of 29 September 2026, docs/worldbuild/cost-audit.md).
// The guide price counted 40 lines, 25 goal choices and one night's round; the
// clock runs a game minute a real second, paused in a talk or a fight, so an
// hour at the desk is some 25 to 40 unpaused minutes: about 1.35 game days.
// The goal choices per game day come from three days of the Nethermarch with
// the mock and the player at the start (tests/m1027goals.test.ts checks that
// the number still fits); the night round comes once a game day and now and
// then an urgent one, within the pacer's one in twenty minutes.

/** Game days in an hour of play: 25 to 40 unpaused real minutes of a game minute a second. */
export const GAME_DAYS_PER_HOUR = 1.35

/** Goal choices that go to the model in a game day since M10.27 (only people near the player or in a story). */
export const GOALS_PER_GAME_DAY = 23

/** Calls per hour of play by kind, as measured; a kind not named here the guide leaves out of the hour. */
export const MEASURED_PER_HOUR: Record<string, number> = {
  npc_reply: 40,
  npc_goals: Math.round(GOALS_PER_GAME_DAY * GAME_DAYS_PER_HOUR),
  chronicle: 1.5,
  lore_check: 1.5,
  journey: 6,
  improvise: 2,
  party_reply: 1,
  chat_line: 1,
}
