import type { ChosenRole } from './settings'

// What models did against each other when measured on the player's key
// (M10.28; Bram, 29 September 2026: gpt-5-mini against Haiku 4.5 for the
// voice). Shown in the model advice beside the role, so the player sees the
// measure before choosing; docs/worldbuild/cost-measure.md has the whole
// report, and docs/playtest/voice/ every answer.

export interface ComparedModel {
  model: string
  /** Usable answers of the situation set, without a set line. */
  usable: string
  /** The rules' character score, 0 to 1, the mean of the series. */
  character: number
  /** How a talk of twenty lines reads (the read score), 0 to 1. */
  read: number
  /** Seconds a line in the talk. */
  seconds: number
  /** Dollars a line in the talk after the first. */
  usdPerLine: number
}

export interface Comparison {
  role: ChosenRole
  date: string
  rows: ComparedModel[]
  advice: string
}

export const COMPARISONS: Comparison[] = [
  {
    role: 'voice',
    date: '2026-09-29',
    rows: [
      { model: 'claude-haiku-4-5-20251001', usable: '24/24', character: 1, read: 0.76, seconds: 2.4, usdPerLine: 0.0022 },
      { model: 'gpt-5-mini', usable: '11/24', character: 0.854, read: 0.71, seconds: 8.4, usdPerLine: 0.002 },
    ],
    advice: 'Haiku 4.5 for the voice: gpt-5-mini thinks first and answers in 6 to 9 seconds, past the time a reply has, so half its answers ended as set lines; a line costs about the same.',
  },
]
