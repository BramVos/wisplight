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
  for (let round = 0; ; round++) {
    const lookupsLeft = lookup ? Math.max(0, limits.lookups - round) : 0
    const reply = await model.complete(buildRequest(input, keys, limits, lookedUp, lookupsLeft))
    calls++
    usage.inputTokens += reply.usage.inputTokens
    usage.outputTokens += reply.usage.outputTokens
    usage.cachedTokens += reply.usage.cachedTokens
    const read = readReply(reply.text, keys, input, limits)
    if (read.lookups.length && lookup && lookupsLeft > 0) {
      for (const card of await lookup(read.lookups)) {
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
