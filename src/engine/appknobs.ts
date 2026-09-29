// The knobs of the app, as a list (M10.20): what each does, its unit, default
// and bounds. Plain data, so the settings screen and the browser preview can
// show it; src/node/knobs.ts keeps the player's values in knobs.json.

export interface AppKnobDef {
  about: string
  unit: string
  default: number
  min: number
  max: number
}

export const APP_KNOBS = {
  autosave_every_minutes: { about: 'The game saves by itself this often, in minutes of play.', unit: 'minutes', default: 10, min: 1, max: 120 },
  save_after_minutes: { about: 'A command that lets this much game time pass (a journey, a night) saves at once.', unit: 'game minutes', default: 60, min: 10, max: 1440 },
  idle_pause_seconds: { about: 'The clock stops after this long without a key pressed.', unit: 'seconds', default: 60, min: 10, max: 3600 },
  ai_log_keep: { about: 'The calls the AI log keeps to look at.', unit: 'calls', default: 200, min: 50, max: 5000 },
  conversation_share: { about: 'The share of the hourly budget kept for conversations: above it, the chronicler and small choices wait.', unit: 'share', default: 0.8, min: 0.1, max: 1 },
  editor_timeout_seconds: { about: 'How long a long answer in the editor (a world step) may take.', unit: 'seconds', default: 600, min: 60, max: 1800 },
  brain_timeout_seconds: { about: 'How long a person\'s choice of what to do may take the model.', unit: 'seconds', default: 10, min: 3, max: 120 },
  chronicler_timeout_seconds: { about: 'How long one night run of the chronicler may take.', unit: 'seconds', default: 90, min: 20, max: 600 },
  night_round_minutes: { about: 'The chronicler\'s night round comes at most this often in real play, however fast the game\'s clock runs; the first of a session is never held.', unit: 'minutes', default: 20, min: 1, max: 480 },
  tides_round_minutes: { about: 'The great lines are judged at most this often in real play.', unit: 'minutes', default: 120, min: 10, max: 1440 },
  ai_log_full: { about: 'Every model call written out whole, prompt and answer uncut, to logs/ai-<game>-<date>.md beside the story log (1 is on). The file grows large: several megabytes an hour of play.', unit: 'on (1) or off (0)', default: 0, min: 0, max: 1 },
  recall_lines: { about: 'How many lines of the game before are shown, faded, when you pick a game up again or load it.', unit: 'lines', default: 40, min: 0, max: 400 },
  tides_every_sessions: { about: 'When the months of the game do not come, the great lines are judged at least once in this many sessions.', unit: 'sessions', default: 10, min: 1, max: 100 },
} as const satisfies Record<string, AppKnobDef>

export type AppKnobId = keyof typeof APP_KNOBS

export interface AppKnobView extends AppKnobDef {
  id: AppKnobId
  value: number
  set: boolean
}
