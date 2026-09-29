import { Engine, GameClock, type Content, type LlmClient, type LlmRejection, type LlmRequest, type LlmResponse } from '../engine'
import { callName } from '../engine/content'
import { costUsd } from './ai/pricing'

// The measure of M10.28 (Bram, 29 September 2026: "a real talk of twenty
// lines"): one talk with one person, played through the game with a real
// model, and per line what it read from the cache, wrote to it, and cost.
// And whether the block of a place is still in the cache after five minutes:
// a line, a wait past them, and a line with someone else of these parts.

/** Twenty lines a stranger might say to the baker of Veenhoek, from a greeting to goodbye. */
export const TWENTY_LINES = [
  'Good morning.',
  'What bread do you have today?',
  'How much is a loaf of rye?',
  'What happened to the mill?',
  'Who is the miller?',
  'Where does he live?',
  'Is there any news from around here?',
  'Tell me about the Haakman.',
  'Have you ever seen it yourself?',
  'Who else lives on the green?',
  'Where can I sleep tonight?',
  'Is the inn far from here?',
  'Who keeps the inn?',
  'What is Veenhoek like in winter?',
  'Do you have family here?',
  'Where is your husband now?',
  'What do people here do for work?',
  'Is there anything I could help with?',
  'Thank you, that is kind of you.',
  'Goodbye for now.',
]

/** What one line of the talk cost: every call it took, the tries the guard asked for included. */
export interface LineMeasure {
  line: string
  said: string
  calls: number
  rejected: string[]
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

/** A client that passes every call on and books it to the line being said. */
class LineMeter implements LlmClient {
  line = -1
  readonly lines: LineMeasure[] = []
  constructor(
    private readonly llm: LlmClient,
    private readonly model: (response: LlmResponse) => string,
  ) {}

  private current(): LineMeasure | undefined {
    return this.lines[this.line]
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const response = await this.llm.complete(request)
    const m = this.current()
    if (m && request.schemaName === 'npc_reply') {
      m.calls++
      m.inputTokens += response.usage.inputTokens
      m.cachedTokens += response.usage.cachedTokens
      m.cacheWriteTokens += response.usage.cacheWriteTokens ?? 0
      m.outputTokens += response.usage.outputTokens
      m.costUsd += costUsd(this.model(response), response.usage) ?? 0
      m.latencyMs += response.latencyMs
    }
    return response
  }

  report(rejection: LlmRejection): void {
    if (!rejection.fixed && !rejection.held) this.current()?.rejected.push(rejection.reason)
    this.llm.report?.(rejection)
  }

  replyWithinMs(): number {
    // A measure waits for its reply: the time limit is not what is measured here.
    return 60_000
  }
}

/** A game at Veenhoek with the baker, late in the morning of the second day, the stranger beside her. */
function begin(content: Content, llm: LlmClient, npc: string, seed: number): Engine {
  const engine = new Engine(content, { seed })
  engine.tick(GameClock.from(211, 9, 15, 11, 0).minutes - engine.world.now)
  engine.setLlm(llm)
  const s = engine.state.npcs[npc]!
  engine.state.player.location = s.location
  s.activity = 'standing about'
  s.plan = []
  return engine
}

/**
 * Plays the twenty lines with one person (M10.28): a talk that ends before
 * the lines do is begun again, as a player would, and the block of the place
 * stays the same. Per line, its calls and what they read, wrote and cost.
 */
export async function playTwenty(content: Content, llm: LlmClient, how: { npc?: string; lines?: string[]; seed?: number; model: (response: LlmResponse) => string; onLine?: (m: LineMeasure, n: number) => void }): Promise<LineMeasure[]> {
  const npc = how.npc ?? 'npc_mirte'
  const meter = new LineMeter(llm, how.model)
  const engine = begin(content, meter, npc, how.seed ?? 7)
  const name = callName(content.npcs.get(npc)!).toLowerCase()
  await engine.handle(`talk ${name}`)
  for (const [n, line] of (how.lines ?? TWENTY_LINES).entries()) {
    if (!engine.state.talk) await engine.handle(`talk ${name}`)
    meter.line = n
    meter.lines.push({ line, said: '', calls: 0, rejected: [], inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 })
    const out = await engine.handle(line)
    meter.lines[n]!.said = out.filter((o) => o.kind === 'speech').map((o) => o.text).join(' ')
    how.onLine?.(meter.lines[n]!, n + 1)
  }
  return meter.lines
}

/**
 * Whether the block of a place stays in the cache past five minutes (M10.28
 * (3)): one line, a wait past them, and a line with someone else of these
 * parts. What the second line read from the cache says it. A ping with an
 * empty answer could not keep it (measured on 29 September 2026: the schema
 * goes ahead of the block, and an empty call may carry none), so the block
 * is kept an hour.
 */
export async function blockKept(content: Content, llm: LlmClient, how: { wait: (ms: number) => Promise<void>; afterMs: number; model: (response: LlmResponse) => string; say: (line: string) => void }): Promise<{ first: LineMeasure; second: LineMeasure }> {
  const first = (await playTwenty(content, llm, { lines: ['Good morning.'], model: how.model }))[0]!
  how.say(`first line: in ${first.inputTokens}, read ${first.cachedTokens}, written ${first.cacheWriteTokens}; waiting ${Math.round(how.afterMs / 1000)}s`)
  await how.wait(how.afterMs)
  const second = (await playTwenty(content, llm, { npc: 'npc_harmen', lines: ['Good morning.'], model: how.model }))[0]!
  return { first, second }
}
