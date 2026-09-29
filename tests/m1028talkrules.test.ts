import { describe, expect, it } from 'vitest'
import { Engine, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine'
import { recites } from '../src/engine/dialogue/guard'
import { asksBack } from '../src/engine/dialogue/prompt'
import { addressIn, addressWords, keepAddress } from '../src/engine/dialogue/voice'
import { content } from './helpers'

// M10.28, the rules of the talk after the read score (the design session read
// the kept answers of Haiku and gpt-5-mini, 29 September 2026): (a) a story in
// the speaker's own words, never recited; (b) about one answer in three ends
// with a question back, where it fits; (c) one form of address all through a
// talk, until the attitude changes; (d) the walking time of a place in the
// input when the stranger asks after it, so a distance does not change.

const DAY = 24 * 60
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

/** A model that says what it is told, one reply after the other, and keeps the calls and what was reported. */
function scripted(...replies: string[]): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  let i = 0
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      const reply = replies[Math.min(i++, replies.length - 1)]!
      return { text: JSON.stringify({ reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger talked to me.', ends_conversation: false, keep_talking: 'news' }), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

/** A talk with Mirte where she stands about, free, at nine in the morning. */
async function withMirte(llm: LlmClient) {
  const engine = new Engine(content, { seed: 4, llm })
  engine.tick(((9 * 60 - (engine.world.now % DAY)) + DAY) % DAY)
  const s = engine.state.npcs['npc_mirte']!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  await engine.handle('talk mirte')
  return engine
}

describe('M10.28: the rules of the talk after the read score', () => {
  it('(a) knows a recited story, and asks again for one', async () => {
    const story = 'The Haakman lives in the deep water of the Blackmere. He is grey as a heron, with teeth like water-weed, and he takes children who go too near the edge.'
    expect(recites('Mirte shivers. "The Haakman lives in the deep water of the Blackmere. He is grey as a heron, with teeth like water-weed."', story)).toBe(true)
    expect(recites('Mirte shivers. "My gran said he waits under the Blackmere, grey as a heron. I keep the children well back from it."', story)).toBe(false)
    // A striking line kept inside a telling of one's own is no recital (seventeen such tellings on Haiku, 29 September 2026).
    expect(recites('Ah, you want the Haakman? My teacher Kaatje knew him better than most. She said he is grey as a heron, with teeth like water-weed, and he takes children who go too near. I keep mine well back.', story)).toBe(false)
    const haakman = [...content.topics.values()].find((t) => /haakman/i.test(t.name) && t.story)
    expect(haakman).toBeDefined()
    if (!haakman) return
    const llm = scripted(`Mirte shivers. "${haakman.story!.split(/(?<=\.)\s/).slice(0, 3).join(' ')}"`, 'Mirte shivers. "My gran swore he waits under the black water. I keep well back from the edge, and so should you."')
    const engine = await withMirte(llm)
    const out = said(await engine.handle('Tell me the story of the Haakman.'))
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('character recited the story')
    expect(out).toMatch(/My gran swore/)
    expect(llm.calls[0]!.prompt).toMatch(/Never recite it: tell it shorter, in your own words, with one thing of your own/)
  })

  it('(b) ends about one answer in three with a question back, never from someone hostile', async () => {
    const engine = new Engine(content, { seed: 4 })
    engine.state.talk = { npc: 'npc_mirte', turnsLeft: 9, history: [], effects: 0, revealed: [], began: 30 }
    const asked = (band: string) =>
      Array.from({ length: 9 }, (_, turns) => {
        engine.state.talk!.turns = turns
        return asksBack(engine.world, { npcId: 'npc_mirte', act: 'AskAbout', attitude: { band: band as never, score: 0 } })
      }).filter(Boolean).length
    expect(asked('Neutral')).toBe(3)
    expect(asked('Hostile')).toBe(0)
    engine.state.talk!.turns = 0
    expect(asksBack(engine.world, { npcId: 'npc_mirte', act: 'Farewell', attitude: { band: 'Neutral', score: 0 } })).toBe(false)
  })

  it('(c) keeps the form of address the talk began with', async () => {
    const engine = new Engine(content, { seed: 4 })
    const words = addressWords(engine.world, 'npc_mirte')
    // Her card says she calls people lamb; the kit's forms as well.
    expect(words).toContain('lamb')
    expect(words).toContain('neighbour')
    expect(addressIn('"Rye today, lamb."', words)).toBe('lamb')
    expect(addressIn('"Grietje is my neighbour."', words)).toBeUndefined()
    expect(keepAddress('Mirte smiles. "Two duiten, neighbour."', 'lamb', words)).toEqual({ text: 'Mirte smiles. "Two duiten, lamb."', was: 'neighbour' })
    expect(keepAddress('"Ask my neighbour, Grietje."', 'lamb', words).was).toBeUndefined()
    const llm = scripted('Mirte smiles. "Rye today, lamb."', 'Mirte nods. "Two duiten, neighbour."')
    const talk = await withMirte(llm)
    await talk.handle('What bread do you have?')
    expect(talk.state.talk!.address?.word).toBe('lamb')
    const out = said(await talk.handle('How much is it?'))
    expect(out).toMatch(/Two duiten, lamb\./)
    expect(llm.calls.at(-1)!.prompt).toMatch(/You call the stranger "lamb" in this talk, every time/)
  })

  it('(d) gives the walking time of the place the speaker named, when the stranger asks after it', async () => {
    const llm = scripted('Mirte points. "Try the Drowned Goose; Trijntje keeps rooms."', 'Mirte thinks. "Not far."')
    const engine = await withMirte(llm)
    await engine.handle('Where can I sleep tonight?')
    await engine.handle('Is it far from here?')
    const prompt = llm.calls.at(-1)!.prompt
    // One of the Drowned Goose's places, with how far it is.
    expect(prompt).toMatch(/KNOWLEDGE, new:\n {2}loc_goose_\w+ \(level \d\):.*(?:minutes'|hours?') walk/)
    // The kit's words for time and distance are how people say it, never a distance of their own.
    expect(llm.calls[0]!.prompt).toMatch(/How people here say it, only for a time or a distance you were given: time .*; distance /)
  })
})
