import type { Output } from './commands'
import type { World } from './world'

// Choosing what a command is about (after the M10 playtest, Bram, 28
// September 2026): when a command can mean only one thing here, it does it at
// once; when what it names is unknown, or it names nothing, it offers what it
// could mean as a numbered list, answered with a number or the name; when
// there is nothing it could mean, it says so. Talk to whom, follow which
// way, take what, look at what, use what, walk where.

export interface ChoiceOption {
  /** How the option reads: "Mirte", "the path to Veenhoek". */
  label: string
  /** The command that picking it runs. */
  command: string
}

/** At most this many options are offered: a list longer than this is not a choice. */
export const MAX_OPTIONS = 9

/**
 * The options for a command: one that fits the words is done at once, one
 * option and no words too; otherwise the list, or the message for none.
 * Returns the command to run, or what to show.
 */
export function choose(world: World, words: string, question: string, options: ChoiceOption[], none: string): { run: string } | { show: Output[] } {
  if (!options.length) return { show: [{ kind: 'error', text: none }] }
  const w = normal(words)
  if (w) {
    const fitting = best(options, w)
    if (fitting.length === 1) return { run: fitting[0]!.command }
    if (fitting.length > 1) return { show: offer(world, question, fitting) }
  } else if (options.length === 1) return { run: options[0]!.command }
  return { show: offer(world, question, options) }
}

/** Puts a choice to the player: numbered, kept until the next command. */
export function offer(world: World, question: string, options: ChoiceOption[]): Output[] {
  const list = options.slice(0, MAX_OPTIONS)
  world.state.choice = { question, options: list, t: world.now }
  return [{ kind: 'system', text: [question, ...list.map((o, i) => `  ${i + 1}. ${o.label}`)].join('\n') }]
}

/**
 * The answer to a choice: a number from the list, or one of its names, gives
 * the command to run. A number off the list keeps the choice; a number with
 * no choice open is not a command. Anything else is a new command, and the
 * choice is gone.
 */
export function answerChoice(world: World, input: string): { run: string } | { error: string } | undefined {
  const choice = world.state.choice
  const text = input.trim()
  const number = /^\d+$/.test(text) ? Number(text) : undefined
  if (!choice) return number === undefined ? undefined : { error: 'There is nothing to choose from just now.' }
  if (number !== undefined) {
    const picked = choice.options[number - 1]
    if (!picked) return { error: `Choose a number from 1 to ${choice.options.length}, or type something else.` }
    world.state.choice = undefined
    return { run: picked.command }
  }
  world.state.choice = undefined
  const fitting = best(choice.options, normal(text))
  return fitting.length === 1 ? { run: fitting[0]!.command } : undefined
}

/** The options the words fit best: every word found in the label, else most words found. */
function best(options: ChoiceOption[], w: string): ChoiceOption[] {
  const words = w.split(' ').filter((x) => x.length > 1 && !STOP.has(x))
  if (!words.length) return []
  const exact = options.filter((o) => normal(o.label) === w)
  if (exact.length) return exact
  const score = (o: ChoiceOption) => {
    const label = normal(o.label)
    return words.filter((x) => label.includes(x)).length
  }
  const top = Math.max(0, ...options.map(score))
  if (top === 0) return []
  const all = options.filter((o) => score(o) === words.length)
  return all.length ? all : options.filter((o) => score(o) === top)
}

const STOP = new Set(['the', 'a', 'an', 'to', 'at', 'of', 'de', 'het', 'een', 'naar'])

function normal(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
