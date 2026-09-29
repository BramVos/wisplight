import { assignKeys, buildRequest } from './prompt'
import { readReply } from './reply'
import { DEFAULT_LIMITS, type Card, type ChronicleInput, type ChronicleOutput, type ChroniclerModel, type ChroniclerUsage, type Lookup } from './types'

// One run of the chronicler: the overview goes in, operations come out. The
// model may first look things up, at most a few times per run; the fixed
// part of the prompt stays the same between those calls, so it is cached.

export interface ChronicleResult {
  output: ChronicleOutput
  /** Parts of the reply that were dropped, and why. */
  problems: string[]
  calls: number
  usage: ChroniclerUsage
}

export async function chronicle(input: ChronicleInput, model: ChroniclerModel, lookup?: Lookup): Promise<ChronicleResult> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits }
  const keys = assignKeys(input)
  const usage: ChroniclerUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
  const lookedUp: Card[] = []
  let calls = 0
  // Nothing new (M10.27): no event on any storyline, no signal to plan for, no hook asked for. Then there is nothing to
  // write, and no call: a night whose news an earlier round already told stays quiet.
  if (!input.lines.some((l) => l.events.length) && !input.signals?.length && !input.pulse) return { output: emptyOutput(), problems: [], calls, usage }
  for (let round = 0; ; round++) {
    // The whole run has a budget over all its rounds (M9.3): once spent, he writes with what he has.
    const spent = usage.inputTokens + usage.outputTokens
    const lookupsLeft = lookup && spent < limits.runTokens ? Math.max(0, limits.lookups - round) : 0
    const reply = await model.complete(buildRequest(input, keys, limits, lookedUp, lookupsLeft))
    calls++
    usage.inputTokens += reply.usage.inputTokens
    usage.outputTokens += reply.usage.outputTokens
    usage.cachedTokens += reply.usage.cachedTokens
    const read = readReply(reply.text, keys, input, limits)
    if (read.lookups.length && lookup && lookupsLeft > 0) {
      for (const card of await lookup(read.lookups)) {
        // What the answers hold together is bounded too.
        if (lookedUp.reduce((n, c) => n + c.text.length, 0) + card.text.length > limits.lookupChars) break
        keys.add(card.id, card.kind)
        if (!lookedUp.some((c) => c.id === card.id)) lookedUp.push(card)
      }
      continue
    }
    return { output: read.output, problems: read.problems, calls, usage }
  }
}

export function emptyOutput(): ChronicleOutput {
  return { lore: [], lines: [], quests: [], thoughts: [], news: [] }
}
