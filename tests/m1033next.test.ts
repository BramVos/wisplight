import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { nextSteps } from '../src/engine/doable'
import { actsAsked } from '../src/engine/dialogue/guard'
import type { LlmClient, LlmRejection } from '../src/engine/dialogue/llm'
import { loadContentFromDir } from '../src/node/content'

// M10.33 D, what to try next (the player does not see what can be typed; the
// review's strongest single help for the first ten minutes), and AB, the
// voice knows what can be done here (it asked for "the multimeter under the
// bench", "photograph it", "check the connector readings"). Both come from
// what the place offers, never from a model.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

function scripted(...replies: string[]): LlmClient & { reports: LlmRejection[] } {
  let i = 0
  const reports: LlmRejection[] = []
  return {
    reports,
    complete: async () => {
      const reply = replies[Math.min(i++, replies.length - 1)]!
      const body = { reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger talked to me.', ends_conversation: false, keep_talking: 'no', action: 'none', propose: 'none' }
      return { text: JSON.stringify(body), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

describe('M10.33 D: three things to try next', () => {
  it('offers someone to talk to, a thing and a way out at the start, by what the stranger knows of them', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const next = engine.status().next!
    expect(next).toHaveLength(3)
    expect(next.map((n) => n.command)).toContain('talk port coordinator')
    // Nobody's name before the stranger knows it.
    expect(next.map((n) => `${n.label} ${n.command}`).join(' ')).not.toMatch(/Mara/)
    // Each works as typed.
    for (const n of next) expect((await new Engine(quiet, { seed: 3, builder: true }).handle(n.command)).some((o) => o.kind === 'error' && /don't understand|not a command/i.test(o.text))).toBe(false)
  })

  it('puts the story\'s next deed first where it can be done', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko']) await engine.handle(c)
    expect(nextSteps(engine.world)[0]).toMatchObject({ kind: 'quest', command: 'ask niko about station' })
  })
})

describe('M10.33 AB: the voice knows what can be done here', () => {
  it('gives the voice what the stranger can do here, and a rule to ask only for that', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko', 'talk niko']) await engine.handle(c)
    await engine.handle('"What should I look at first?')
    const call = good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!
    expect(call.prompt).toMatch(/DOABLE HERE [^\n]*read the consoles/)
    expect(`${call.system}`).toMatch(/nor ask of the stranger a task, meeting or act no STORY, REQUEST or DOABLE HERE gives/)
  })

  it('knows an act asked of the stranger, and not talk or the everyday', () => {
    expect(actsAsked('Niko nods. "Could you check the connector readings for me?"')).toEqual(['check'])
    expect(actsAsked('"You could photograph it, if you have a camera."')).toEqual(['photograph'])
    expect(actsAsked('"You\'ll need to ask them."')).toEqual([])
    expect(actsAsked('"Could you read the logs for me?"')).toEqual([])
  })

  it('asks again for an act that cannot be done here, and lets one that can stand', async () => {
    const llm = scripted('Niko nods. "Could you check the connector readings for me?"', 'Niko nods. "Could you read the fault codes on the consoles?"')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko', 'talk niko']) await engine.handle(c)
    const out = (await engine.handle('"What can I do?')).map((o) => o.text).join('\n')
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('invented an act not here: check')
    expect(out).toMatch(/read the fault codes/)
  })
})
