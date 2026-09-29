import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Engine, MockLlm, type LlmRequest, type LlmResponse } from '../src/engine'
import { worldStepRequest } from '../src/engine/editor'
import { contentFilesOf } from '../src/engine/contentfiles'
import { storyRequest } from '../src/engine/growth/regionstory'
import { withSafety } from '../src/engine/safety'
import { kindSituation, SITUATION_KINDS } from '../src/engine/trials'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import { cacheMinimum, cacheNote } from '../src/node/ai/pricing'
import { systemBlocks, type Provider, type ProviderResponse } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { playRegion } from '../src/node/regionplay'
import { content } from './helpers'

// M10.26: the cache mark on every kind of call (Bram, 29 September 2026: the
// cache column stood at 0% for every talk). Every call already carried a mark,
// over its whole system part; what went wrong was a part that changed from
// call to call (a person's card, the goals open to them now, the design log)
// in front of the mark, and a model that caches nothing under its minimum.
// Now what stays the same comes first, with the mark; what every call of a
// kind shares is marked on its own; and the log says why nothing was cached.

const root = resolve(import.meta.dirname, '..')
const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})
const fixedOf = (r: LlmRequest) => r.system.slice(0, r.cacheBreak ?? r.system.length)
const sharedOf = (r: LlmRequest) => r.system.slice(0, r.cacheShared ?? 0)

describe('M10.26: the cache mark on every kind of call', () => {
  it('marks what every call shares and what one subject keeps apart, and leaves what changes unmarked', () => {
    expect(systemBlocks({ system: 'RULES\nCARD\nNOW', cacheShared: 6, cacheBreak: 11 })).toEqual([
      { type: 'text', text: 'RULES\n', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'CARD\n', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'NOW' },
    ])
    // The hard limits go in front of every call and move both marks with them.
    const safe = withSafety({ role: 'voice', system: 'RULES\nCARD\nNOW', cacheShared: 6, cacheBreak: 11, prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 10 })
    expect(safe.system.slice(safe.cacheShared, safe.cacheBreak)).toBe('CARD\n')
    // A kind that marks nothing (M10.27) keeps marking nothing, and the provider sends one unmarked block.
    const none = withSafety({ role: 'chronicler', system: 'GUIDE', cacheBreak: 0, prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 10 })
    expect(none.cacheBreak).toBe(0)
    expect(systemBlocks(none)).toEqual([{ type: 'text', text: none.system }])
  })

  it('every kind of call decides its mark: where a second call reads it back, and nowhere else (M10.27)', async () => {
    const worlds = { base: await loadContentFromDir(resolve(root, 'content'), 'base'), isle: await readContentFiles(resolve(root, 'content'), 'isle') }
    const marks: Record<string, string> = {}
    for (const kind of SITUATION_KINDS) {
      const r = (await kindSituation(kind, worlds))!.request
      expect(r.cacheBreak, kind).toBeDefined()
      expect(r.cacheBreak!, kind).toBeLessThanOrEqual(r.system.length)
      marks[kind] = r.cacheBreak === 0 ? 'none' : r.cacheShared !== undefined ? 'both' : 'one'
      if (r.cacheHour) marks[kind] += ', an hour'
    }
    // A talk: turns with one person, and someone new reads the rules and the frame. A goal choice: many people, the
    // shared part only. The world steps and the writing aid: a designer comes back within the hour. The rest is made
    // once per place, night or line, and nothing reads it back in five minutes.
    expect(marks).toMatchObject({ npc_reply: 'both', npc_goals: 'one, an hour', world_step: 'both, an hour', builder_draft: 'one, an hour', world_enhance: 'one, an hour' })
    for (const kind of ['party_reply', 'chat_line', 'journey', 'improvise', 'chronicle', 'lore_check', 'legends', 'outline', 'far_place', 'district', 'weave', 'expansion', 'land', 'tides', 'world_polish', 'palette_draft', 'voice_draft', 'region_story']) expect(marks[kind], kind).toBe('none')
  }, 120_000)

  it('keeps the part before the mark the same from call to call in a played game', async () => {
    const base = await loadContentFromDir(resolve(root, 'content'), 'base')
    const mock = new MockLlm('good')
    const seen: LlmRequest[] = []
    const llm = { complete: async (r: LlmRequest): Promise<LlmResponse> => (seen.push(r), mock.complete(r)) }
    await playRegion({ content: base, world: 'base', setting: 'full', llm, seed: 7, days: 1 })
    const of = (kind: string) => seen.filter((r) => r.schemaName === kind)
    // Everyone's goals share the rules, the whole catalogue and the frame, and only that is marked.
    const goals = of('npc_goals')
    // Enough to compare (M10.27: only people near the player or in a story ask the model now).
    expect(goals.length).toBeGreaterThan(5)
    expect(new Set(goals.map(fixedOf)).size).toBe(1)
    expect(goals.every((r) => r.cacheShared === undefined)).toBe(true)
    // A talk: the same rules and frame for every speaker, the same card for every turn with one.
    const talks = of('npc_reply')
    expect(new Set(talks.map(sharedOf)).size).toBe(1)
    // Every step of the full build keeps its fixed part; the night round and the districts mark nothing.
    expect(new Set(of('world_step').map(fixedOf)).size).toBe(1)
    for (const kind of ['chronicle', 'district']) expect(of(kind).every((r) => r.cacheBreak === 0), kind).toBe(true)
    // The story of a region built in full reads the part its steps wrote.
    expect(of('region_story').every((r) => r.cacheBreak! > 20000)).toBe(true)
  }, 120_000)

  it('the story round of a region built in full reads the world\'s fixed part its steps wrote', async () => {
    const engine = new Engine(content, { seed: 3 })
    const step = worldStepRequest(contentFilesOf(engine.content), 'places', 'The region.')
    // Built in full, its steps wrote the world's fixed part within the hour, and the story marks the same part.
    ;(engine.state.growth ??= { people: [], projects: {}, hands: {} }).fulls = { grey_saltings: { done: [], entities: {}, t: 0 } }
    const story = storyRequest(engine.world, 'grey_saltings')
    expect(fixedOf(withSafety(story))).toBe(sharedOf(withSafety(step)))
    expect(fixedOf(story).length).toBeGreaterThan(20000)
    // Not built in full, the story is the only call that reads that part: no mark.
    delete engine.state.growth!.fulls
    expect(storyRequest(engine.world, 'grey_saltings').cacheBreak).toBe(0)
  }, 60_000)

  it('says in the log why nothing came from the cache, in place of 0%', async () => {
    expect([cacheMinimum('claude-haiku-4-5-20251001'), cacheMinimum('claude-sonnet-5'), cacheMinimum('claude-opus-5-5'), cacheMinimum('gpt-4.1-mini')]).toEqual([4096, 1024, 512, 1024])
    const talk = { system: 'x'.repeat(6000), cacheBreak: 6000 }
    expect(cacheNote(talk, 'claude-haiku-4-5-20251001', { cachedTokens: 0 })).toBe('under the minimum: about 1,500 of 4,096')
    expect(cacheNote(talk, 'claude-sonnet-5', { cachedTokens: 0, cacheWriteTokens: 1500 })).toBe('written for the next call')
    expect(cacheNote(talk, 'claude-sonnet-5', { cachedTokens: 1500 })).toBeUndefined()
    // Through the gateway, into the log.
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1026cache-'))
    folders.push(dir)
    const reply = (): Promise<ProviderResponse> => Promise.resolve({ text: '{}', provider: 'anthropic', model: 'claude-haiku-4-5-20251001', usage: { inputTokens: 1600, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 })
    const provider: Provider = { id: 'anthropic', listModels: async () => [], complete: reply }
    const log = new AiLog()
    const gateway = new Gateway({ role: () => ({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }), provider: () => provider, budgetUsdPerHour: () => 5, log, usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')) })
    await gateway.complete({ role: 'voice', system: 'y'.repeat(4000), cacheBreak: 4000, prompt: 'p', schemaName: 'npc_reply', schema: {}, maxTokens: 50 })
    expect(log.recent(1)[0]!.cache).toMatch(/^under the minimum: about 1,\d{3} of 4,096$/)
  })
})
