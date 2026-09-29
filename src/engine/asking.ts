import { offer } from './choice'
import type { Output } from './commands'
import type { LlmRequest } from './dialogue/llm'
import type { World } from './world'

// No question for small amounts (M10.21; Bram, 28 September 2026). A call
// below the player's threshold (a setting, one dollar unless they set
// otherwise) simply runs, and the status bar shows it. Only something that
// reaches the threshold, a district or a region made in play, asks once
// ("Making the harbour district of Graafhaven playable costs about $0.80"),
// as a choice in the game: go on, not now (for the rest of the game day), or
// always, which stops the questions for good. The price comes from the
// client, which knows the models and their prices; the mock has none and
// never asks. Whether a question was put is kept in the log, so a game plays
// back the same.

export interface CostAsk {
  /** Stable for the thing it is about: 'district:graafhaven:harbour'. */
  id: string
  /** What the call does, as a sentence start: "Making the harbour district of Graafhaven playable". */
  what: string
  /** What it costs about, in dollars. */
  usd: number
  /** The command that does it once agreed. */
  then?: string
}

/** The game day, counted from the start of time: "not now" holds for the rest of it. */
function dayOf(world: World): number {
  return Math.floor(world.now / (24 * 60))
}

function asking(world: World) {
  return (world.state.asking ??= { agreed: {}, declined: {} })
}

/**
 * Whether a call must be asked for first. Undefined: go ahead (no model, no
 * price, below the threshold, "always" chosen, or agreed before). Declined:
 * the player said not now today; do without the model. Otherwise the
 * question, now open, to be shown with askOutput.
 */
export function mustAsk(world: World, id: string, what: string, request: LlmRequest, then?: string, times = 1): { ask: CostAsk } | { declined: true } | undefined {
  const a = world.state.asking
  if (a?.agreed[id]) return undefined
  if (a?.declined[id] === dayOf(world)) return { declined: true }
  // A build of several rounds (M10.25: a region in full) is asked for once, at the price of all of them.
  const one = world.costAsk?.(id, request)
  if (one === undefined) return undefined
  const usd = one * times
  const ask: CostAsk = { id, what, usd, ...(then ? { then } : {}) }
  asking(world).open = ask
  return { ask }
}

/** The ask that waits for an answer, if any: a second one is not put on top of it. */
export function askOpen(world: World): CostAsk | undefined {
  return world.state.asking?.open
}

/** The question, as a choice the player answers with a number or a word. */
export function askOutput(world: World, ask: CostAsk): Output[] {
  const cost = ask.usd < 0.01 ? 'less than a cent' : `about $${ask.usd.toFixed(2)}`
  return offer(world, `${ask.what} costs ${cost} with the model you chose.`, [
    { label: 'Go on', command: `cost go ${ask.id}` },
    { label: 'Not now', command: `cost not ${ask.id}` },
    { label: 'Always go on, and stop asking', command: `cost always ${ask.id}` },
  ])
}

/**
 * The answer to a question (the commands `cost go|not|always <id>`): the
 * command to run when it is agreed, and what to say.
 */
export function answerAsk(world: World, answer: string, id: string): { run?: string; always?: boolean; outputs: Output[] } {
  const a = asking(world)
  const open = a.open?.id === id ? a.open : undefined
  a.open = undefined
  if (answer === 'not') {
    a.declined[id] = dayOf(world)
    return { outputs: [{ kind: 'system', text: 'Not now, then. It stays as it is for today.' }] }
  }
  a.agreed[id] = true
  delete a.declined[id]
  return { ...(open?.then ? { run: open.then } : {}), ...(answer === 'always' ? { always: true } : {}), outputs: answer === 'always' ? [{ kind: 'system', text: 'The game will not ask about the cost again; you can change that under Settings > AI.' }] : [] }
}
