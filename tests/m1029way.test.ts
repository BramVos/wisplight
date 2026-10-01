import { describe, expect, it } from 'vitest'
import { Engine, type LlmClient, type LlmRequest } from '../src/engine'
import { content } from './helpers'

// M10.29 H (Bram's playtest: Sana pinned Sorell to the ship, and a quay was
// made up): asked the way or after someone, the speaker gets THE WAY, per
// place its heading and minutes on foot from here, and per person where they
// think that one is right now; the rules say no way is made up beyond it.

const DAY = 24 * 60

function recording(): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = []
  return {
    calls,
    complete: async (request) => {
      calls.push(request)
      return { text: JSON.stringify({ reply: 'Mirte points. "That way."', names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked the way.', ends_conversation: false, keep_talking: 'no' }), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
  }
}

async function askMirte(line: string) {
  const llm = recording()
  const engine = new Engine(content, { seed: 4, llm })
  engine.tick(((11 * 60 - (engine.world.now % DAY)) + DAY) % DAY)
  const s = engine.state.npcs['npc_mirte']!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  await engine.handle('talk mirte')
  await engine.handle(line)
  return llm.calls.at(-1)!
}

describe('M10.29 H: the way, and where people are', () => {
  it('gives the heading and minutes of a place asked after, and where a person is right now', async () => {
    const mill = await askMirte('How do I get to the mill?')
    expect(mill.prompt).toMatch(/THE WAY: from here, The Mill De Zwaan is \w+, about \d+ minutes' walk\./)
    const harmen = await askMirte('Where is Harmen?')
    expect(harmen.prompt).toMatch(/THE WAY: right now: .*Harmen/)
    expect(mill.system).toMatch(/THE WAY is all you know of a way: make up no road, turning, quay or door\./)
  })

  it('says nothing of the way when nobody asks it', async () => {
    expect((await askMirte('What bread do you have?')).prompt).not.toMatch(/THE WAY/)
  })
})
