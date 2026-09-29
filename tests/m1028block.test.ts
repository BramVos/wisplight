import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, type Content, type LlmClient, type LlmRequest } from '../src/engine'
import { areaBlock, BLOCK_FLOOR, blockGroups } from '../src/engine/dialogue/block'
import { speaksAsOther } from '../src/engine/dialogue/guard'
import { tokensAbout } from '../src/engine/dialogue/llm'
import { turnMessage, youLines } from '../src/engine/dialogue/prompt'
import { callName } from '../src/engine/content'
import { readContentFiles } from '../src/node/content'
import { messagesOf, systemBlocks } from '../src/node/ai/providers'
import { playTwenty } from '../src/node/talktrial'
import { content, withNpc } from './helpers'

// M10.28 (1) to (3), Bram's ideas of 29 September 2026: one cached block per
// area for the conversations, the talk as messages so a new line pays only
// for what is new, and the block kept an hour (a ping could not keep it).

/** A talk with Mirte where she stands about, with the model given. */
async function talkWith(llm: LlmClient, world: Content = content, npc = 'npc_mirte', name = 'mirte') {
  const engine = new Engine(world, { seed: 7, llm })
  engine.tick(24 * 60 + 11 * 60)
  const s = engine.state.npcs[npc]!
  engine.state.player.location = s.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  await engine.handle(`talk ${name}`)
  return engine
}

const replies = (llm: MockLlm) => llm.calls.filter((c) => c.schemaName === 'npc_reply')

describe('M10.28 (1): one cached block per area', () => {
  it('holds the rules, the land voice, the area with its places and the cards of the people who live there, above the floor', () => {
    const engine = new Engine(content, { seed: 1 })
    const area = engine.world.location(engine.state.npcs['npc_mirte']!.location).area
    const block = areaBlock(engine.world, area)
    expect(block.shared).toMatch(/^You voice one character/)
    expect(block.block).toMatch(/HOW PEOPLE HERE SAY THINGS, when it comes up: .*money in guilders/)
    expect(block.block).toMatch(/Not here: o'clock \(say bells\)/)
    expect(block.block).toMatch(/AREA Veenhoek \(veenhoek\): /)
    expect(block.block).toMatch(/PLACES:\n {2}.* \(loc_/)
    expect(block.block).toContain('(loc_veenhoek_green)')
    expect(block.block).toMatch(/CARD npc_mirte\nName: Mirte Bakker/)
    expect(block.cast).toContain('npc_mirte')
    // What changes stays with the talk: her people and her standing are not in the block.
    expect(block.block).not.toMatch(/YOUR PEOPLE|STANDING:/)
    // Every group of the Nethermarch is above Haiku's minimum, so the block is read from the cache.
    for (const group of new Set([...blockGroups(engine.world).values()].map((g) => g.join('+')))) {
      const b = areaBlock(engine.world, group.split('+')[0]!)
      expect(tokensAbout(b.shared) + tokensAbout(b.block), group).toBeGreaterThanOrEqual(BLOCK_FLOOR)
    }
  })

  it('is the same block for everyone who speaks in it, and for every line, byte for byte', async () => {
    const llm = new MockLlm('good')
    const engine = await talkWith(llm)
    await engine.handle('How are you today?')
    await engine.handle('What happened to the mill?')
    await engine.handle('bye')
    const harmen = engine.state.npcs['npc_harmen']!
    harmen.location = engine.state.player.location
    harmen.activity = 'standing about'
    harmen.plan = []
    await engine.handle('talk harmen')
    await engine.handle('How are you today?')
    const calls = replies(llm)
    expect(calls.length).toBeGreaterThanOrEqual(3)
    for (const call of calls) {
      expect(call.system).toBe(calls[0]!.system)
      // The schema too: Anthropic caches it ahead of the system part (the measure of 29 September 2026).
      expect(JSON.stringify(call.schema)).toBe(JSON.stringify(calls[0]!.schema))
      expect(call.cacheBreak).toBe(calls[0]!.system.length)
      expect(call.cacheShared).toBeLessThan(call.cacheBreak!)
      expect(call.cacheHour).toBe(true)
      expect(call.cacheTail).toBe(true)
    }
    // Who speaks is in the talk, not the block.
    expect(calls.at(-1)!.prompt).toMatch(/^\[\[WORLD TEXT\]\]\nYOU ARE: Harmen Molenaar \(CARD npc_harmen above\)/)
  })

  it('shows a hidden trade only as its cover in the block, and tells the keeper alone', async () => {
    const world = withNpc('npc_wouter', (n) => Object.assign(n, { hidden: true, cover: 'an eel-fisher' }))
    const engine = new Engine(world, { seed: 1 })
    const hidden = world.npcs.get('npc_wouter')!
    const area = engine.world.location(hidden.home).area
    const block = areaBlock(engine.world, area)
    const card = block.block.slice(block.block.indexOf(`CARD ${hidden.id}`)).split('\nCARD ')[0]!
    expect(card).toContain(`. ${hidden.cover}.`)
    expect(card).not.toMatch(/keep your trade to yourself/)
    expect(youLines(engine.world, hidden.id, block.cast)).toMatch(/With strangers you keep your trade to yourself \(.+\): to them you are an eel-fisher\./)
  })

  it('brings the whole card of someone from further away, who knows these parts only as told', async () => {
    const llm = new MockLlm('good')
    const engine = await talkWith(llm)
    const block = areaBlock(engine.world, engine.world.location(engine.state.player.location).area)
    const stranger = [...content.npcs.values()].find((n) => !block.cast.includes(n.id) && !n.child && !n.creature)!
    const s = engine.state.npcs[stranger.id]!
    await engine.handle('bye')
    s.location = engine.state.player.location
    s.activity = 'standing about'
    s.plan = []
    await engine.handle(`talk ${callName(stranger).toLowerCase()}`)
    await engine.handle('How are you today?')
    const prompt = replies(llm).at(-1)!.prompt
    expect(prompt).toMatch(/You are not of these parts: of the places and people above you know only what KNOWLEDGE and PEOPLE YOU KNOW give\.\nYOUR CARD\nName: /)
  })

  it('asks again for a reply voiced as another card', async () => {
    expect(speaksAsOther('Harmen scowls. "No."', ['Mirte'], ['Harmen', 'Harmen Molenaar'])).toBe('Harmen')
    expect(speaksAsOther('Harmen? She shakes her head. "No."', ['Mirte'], ['Harmen'])).toBeUndefined()
    expect(speaksAsOther('Mirte glances at Harmen. "No."', ['Mirte'], ['Harmen'])).toBeUndefined()
    expect(speaksAsOther('"Harmen went north."', ['Mirte'], ['Harmen'])).toBeUndefined()
    let i = 0
    const said = ['Harmen scowls. "Ask Mirte."', 'Mirte wipes her hands. "Rye today."']
    const reports: string[] = []
    const llm: LlmClient = {
      complete: async () => ({ text: JSON.stringify({ reply: said[Math.min(i++, 1)], names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked about bread.', ends_conversation: false, keep_talking: 'no' }), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }),
      report: (r) => reports.push(`${r.reason} ${r.detail ?? ''}`),
    }
    const engine = await talkWith(llm)
    const out = (await engine.handle('What bread is there today?')).map((o) => o.text).join('\n')
    expect(reports).toContain('character voiced as Harmen')
    expect(out).toMatch(/Rye today/)
  })

  it('Skerrow and Deepwell build their own blocks, in their own words', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const other = loadContent(await readContentFiles('tests/worlds', 'other'))
    for (const world of [isle, other]) {
      const engine = new Engine(world, { seed: 1 })
      const npc = [...world.npcs.values()].find((n) => !n.child && !n.creature)!
      const block = areaBlock(engine.world, engine.world.location(npc.home).area)
      expect(block.cast).toContain(npc.id)
      expect(block.block).toContain(`CARD ${npc.id}`)
      expect(block.block).not.toMatch(/Veenhoek|Nethermarch|guilders/)
    }
  })
})

describe('M10.28 (2): the talk as messages', () => {
  it('sends the talk so far as turns, only ever added to, and a later line tells only what is new', async () => {
    const llm = new MockLlm('good')
    const engine = await talkWith(llm)
    await engine.handle('How are you today?')
    await engine.handle('What happened to the mill?')
    await engine.handle('Who is the miller?')
    const [first, second, third] = replies(llm)
    expect(first!.turns).toEqual([])
    expect(first!.prompt).toMatch(/SCENE: .*\n/)
    expect(first!.prompt).toMatch(/AFTER THE TALK: /)
    expect(first!.prompt).toMatch(/PLAYER SAYS: <<How are you today\?>>$/)
    // The second: the first as it was told, with what was said back; then only what changed.
    expect(second!.turns!.map((t) => t.role)).toEqual(['user', 'assistant'])
    expect(second!.turns![0]!.text).toBe(first!.prompt)
    expect(second!.prompt).not.toMatch(/SCENE:|AFTER THE TALK|YOU ARE:/)
    expect(second!.prompt).toMatch(/PLAYER SAYS: <<What happened to the mill\?>>$/)
    // Append only: what the third reads begins with all the second read.
    expect(third!.turns!.slice(0, 2)).toEqual(second!.turns)
    expect(third!.turns![2]!.text).toBe(second!.prompt)
    expect(engine.state.talk!.thread!.length).toBe(6)
    // What the voice knew is told once: the mill in the second line is not told again in the third.
    const mill = (second!.prompt.match(/^ {2}(\S+) \(level/m) ?? [])[1]
    if (mill) expect(third!.prompt).not.toContain(`  ${mill} (level`)
  })

  it('tells a part again when it changed, and the parts of every turn each time', () => {
    const one = turnMessage([
      { key: 'scene', text: 'SCENE: the quay.' },
      { key: 'k:', text: '  (nothing relevant beyond your own life)' },
      { key: 'act', text: 'ACT: Greet.', each: true },
    ])
    expect(one.text).toBe('SCENE: the quay.\nKNOWLEDGE:\n  (nothing relevant beyond your own life)\nACT: Greet.')
    const two = turnMessage([{ key: 'scene', text: 'SCENE: the quay.' }, { key: 'k:loc_mill', text: '  loc_mill (level 3): The mill.' }, { key: 'act', text: 'ACT: AskAbout.', each: true }], one.sent)
    expect(two.text).toBe('KNOWLEDGE, new:\n  loc_mill (level 3): The mill.\nACT: AskAbout.')
    const three = turnMessage([{ key: 'scene', text: 'SCENE: the quay, dusk.' }, { key: 'k:loc_mill', text: '  loc_mill (level 3): The mill.' }, { key: 'act', text: 'ACT: AskAbout.', each: true }], two.sent)
    expect(three.text).toBe('SCENE: the quay, dusk.\nACT: AskAbout.')
  })

  it('marks the end of the talk for Anthropic, and sends the turns as messages', () => {
    const messages = messagesOf({ prompt: 'PLAYER SAYS: <<And the rye?>>', turns: [{ role: 'user', text: 'PLAYER SAYS: <<Morning.>>' }, { role: 'assistant', text: '"Morning."' }], cacheTail: true })
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[2]!.content).toEqual([{ type: 'text', text: 'PLAYER SAYS: <<And the rye?>>', cache_control: { type: 'ephemeral' } }])
    expect(messagesOf({ prompt: 'p' })).toEqual([{ role: 'user', content: 'p' }])
  })
})

describe('M10.28 (3): the block kept an hour', () => {
  // Measured on 29 September 2026: a ping with an empty answer (max_tokens 0) may carry no schema, and Anthropic caches
  // the schema ahead of the system part, so the ping wrote an entry of its own and the next line read nothing. The
  // roadmap's fall-back: the block is kept an hour, no pings. The end of the talk is marked for five minutes, after it.
  it('marks the rules and the block for an hour, and the end of the talk for five minutes', () => {
    const request: LlmRequest = { role: 'voice', system: 's'.repeat(300) + 'b'.repeat(900), cacheShared: 300, cacheBreak: 1200, prompt: 'PLAYER SAYS: <<Morning.>>', schemaName: 'npc_reply', schema: {}, maxTokens: 50, cacheHour: true, cacheTail: true }
    const blocks = systemBlocks(request)
    expect(blocks.map((b) => b.cache_control)).toEqual([{ type: 'ephemeral', ttl: '1h' }, { type: 'ephemeral', ttl: '1h' }])
    const messages = messagesOf(request)
    expect(messages.at(-1)!.content).toEqual([{ type: 'text', text: 'PLAYER SAYS: <<Morning.>>', cache_control: { type: 'ephemeral' } }])
  })
})

describe('M10.28: the measure of a talk of twenty lines', () => {
  it('plays twenty lines with the baker, begun again when a talk ends, and books every call to its line', async () => {
    const llm = new MockLlm('good')
    const lines = await playTwenty(content, llm, { model: () => 'claude-haiku-4-5-20251001' })
    expect(lines).toHaveLength(20)
    expect(lines.filter((l) => l.calls > 0).length).toBeGreaterThanOrEqual(15)
    expect(lines.every((l) => l.said.length > 0 || l.calls === 0)).toBe(true)
    // Every call of the talk behind the same block.
    const systems = new Set(replies(llm).map((c) => c.system))
    expect(systems.size).toBe(1)
  }, 60_000)
})
