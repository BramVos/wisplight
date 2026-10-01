import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { givenWords, unfoundedClaim } from '../src/engine/dialogue/guard'
import { sentText, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine/dialogue/llm'
import { withoutRules } from '../src/engine/dialogue/prompt'
import { loadContentFromDir } from '../src/node/content'

// M10.35 B, guessing is allowed, knowing is not (Bram, 30 September 2026: Niko's "the multimeter under the bench" and
// Tessa's "an access hatch from the workshop side into the ship's belly" were embroidery said as fact, and he looked for
// both; the cause, in the rules: only fact or "I don't know", so the model's colour came on screen as fact). The voice may
// guess aloud as its own guess, never as fact or task; a firm sentence about a thing, a way or a need holds only words
// the prompt gives.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

function scripted(...replies: string[]): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!
      const body = { reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked about the station.', ends_conversation: false, keep_talking: 'no', action: 'none', propose: 'none' }
      return { text: JSON.stringify(body), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

async function niko(llm: LlmClient): Promise<Engine> {
  const engine = new Engine(quiet, { seed: 3, builder: true, llm })
  engine.start()
  for (const c of ['@goto loc_orison_listening_room', '@bring niko', 'talk niko']) await engine.handle(c)
  return engine
}

describe('M10.35 B: guessing is allowed, knowing is not', () => {
  it('tells the voice it may guess aloud as its own guess, never as fact or task', async () => {
    const good = new MockLlm('good')
    const engine = await niko(good)
    await engine.handle('"What would you do in my place?')
    expect(sentText(good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!)).toMatch(/guess aloud about the story or people as your own guess \("I'd guess"\), never as fact or task/)
  })

  it('knows a thing, a way or a need said as fact that the prompt does not give, and lets a guess, a denial and a question pass', async () => {
    const good = new MockLlm('good')
    const engine = await niko(good)
    await engine.handle('"Is the antenna damaged?')
    const given = givenWords(withoutRules(sentText(good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!)))
    expect(unfoundedClaim('Niko points. "The multimeter is under the bench."', given)).toMatchObject({ missing: ['multimeter', 'bench'] })
    expect(unfoundedClaim('"There\'s an access hatch from the workshop side into the ship\'s belly."', given)?.missing).toContain('belly')
    expect(unfoundedClaim('"Ask Sorell for the raw power traces."', given)?.missing).toEqual(['traces'])
    expect(unfoundedClaim('"If you ask me, there is a multimeter under the bench."', given)).toBeUndefined()
    expect(unfoundedClaim('"There\'s no multimeter under the bench."', given)).toBeUndefined()
    expect(unfoundedClaim('"Is the multimeter under the bench?"', given)).toBeUndefined()
    expect(unfoundedClaim('"You want the old tale."', given)).toBeUndefined()
    // What the prompt gives may be said plainly: the station and the antenna are Niko's own.
    expect(unfoundedClaim('"The recordings are kept in the Orison Listening Room."', given)).toBeUndefined()
  })

  it('asks again when a made-up thing is said as fact, and keeps the answer that says it as a guess', async () => {
    const llm = scripted('Niko frowns. "The multimeter is under the bench. Check the connector readings with it."', 'Niko frowns. "I\'d guess the wiring, if you ask me. It is old."')
    const engine = await niko(llm)
    const out = text(await engine.handle('"What would you do in my place?'))
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('invented said as fact: The multimeter is under the bench')
    expect(llm.calls.at(-1)!.prompt).toMatch(/NOTE: your last reply said as fact "The multimeter is under the bench", but nothing you know gives "multimeter", "bench"\. Leave it out, or say it only as your own guess\./)
    expect(out).not.toMatch(/multimeter/)
    expect(out).toMatch(/I'd guess the wiring/)
  })
})
