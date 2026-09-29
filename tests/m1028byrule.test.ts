import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type LlmClient, type LlmRequest } from '../src/engine'
import { content } from './helpers'

// M10.28 (4), no model for what the rules can do (Bram, 29 September 2026: a
// line of talk is half a cent, and many lines need no voice): a greeting, a
// yes or no after something that was no question, buying what is on offer,
// the same question again in the same words, and what the card answers. Only
// a new question goes to the model; a line by rule is the game's own, and the
// AI log keeps it as "by rule".

function talkWithMirte() {
  const mock = new MockLlm('good')
  const calls: LlmRequest[] = []
  const notes: { why: string; said: string }[] = []
  const llm: LlmClient = { complete: (r) => (calls.push(r), mock.complete(r)), byRule: (n) => void notes.push({ why: n.why, said: n.said }) }
  const engine = new Engine(content, { seed: 4, llm })
  engine.start()
  const s = engine.state.npcs['npc_mirte']!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  s.note = undefined
  const replies = () => calls.filter((r) => r.schemaName === 'npc_reply').length
  const say = async (line: string) => {
    const before = replies()
    const out = await engine.handle(line)
    const speech = out.find((o) => o.kind === 'speech')
    return { called: replies() > before, speech: speech?.text ?? '', source: speech?.source }
  }
  return { engine, notes, say }
}

describe('M10.28: the rules answer what they can, without a call', () => {
  it('greets, answers who they are, and says the same answer again, without the voice', async () => {
    const { notes, say } = await talkWithMirte()
    await say('talk mirte')
    const hello = await say('Good morning.')
    expect(hello).toMatchObject({ called: false, source: 'rules' })
    const who = await say('Who are you?')
    expect(who).toMatchObject({ called: false, source: 'rules' })
    expect(who.speech).toMatch(/Mirte/)
    const first = await say('Tell me about the Haakman.')
    expect(first.called).toBe(true)
    const again = await say('Tell me about the Haakman.')
    expect(again).toMatchObject({ called: false, source: 'rules' })
    expect(again.speech).toMatch(/As I said: /)
    expect(notes.map((n) => n.why)).toEqual(['greeting', 'card', 'asked again'])
  })

  it('a yes after a statement is a nod; a new question goes to the voice', async () => {
    const { say } = await talkWithMirte()
    await say('talk mirte')
    const news = await say('What happened to the mill?')
    expect(news).toMatchObject({ called: true, source: 'model' })
    const yes = await say('Yes.')
    // The voice's last line in the mock is no question: a nod by rule.
    expect(yes.called).toBe(news.speech.trim().endsWith('?"'))
  })

  it('a line by rule is in the talk the voice reads next', async () => {
    const mock = new MockLlm('good')
    const calls: LlmRequest[] = []
    const engine = new Engine(content, { seed: 4, llm: { complete: (r) => (calls.push(r), mock.complete(r)) } })
    engine.start()
    const s = engine.state.npcs['npc_mirte']!
    s.location = engine.state.player.location
    s.activity = 'standing about'
    s.busyUntil = engine.world.now + 600
    await engine.handle('talk mirte')
    await engine.handle('Good morning.')
    await engine.handle('What happened to the mill?')
    const call = calls.filter((r) => r.schemaName === 'npc_reply').at(-1)!
    expect((call.turns ?? []).map((t) => t.text).join('\n')).toMatch(/Good morning\./)
  })

  it('buying what is on offer is the offer\'s own line', async () => {
    const { notes, say } = await talkWithMirte()
    await say('talk mirte')
    const price = await say('How much is a loaf of rye?')
    expect(price).toMatchObject({ called: false, source: 'rules' })
    expect(notes.at(-1)!.why).toBe('trade')
  })

  it('without a model nothing is noted, and every line is the rules\' as before', async () => {
    const engine = new Engine(content, { seed: 4 })
    engine.start()
    const s = engine.state.npcs['npc_mirte']!
    s.location = engine.state.player.location
    s.activity = 'standing about'
    s.busyUntil = engine.world.now + 600
    await engine.handle('talk mirte')
    const out = await engine.handle('Good morning.')
    expect(out.find((o) => o.kind === 'speech')?.source).toBeUndefined()
  })
})
