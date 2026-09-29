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
  })

  it('every kind of call sets its mark after the part it keeps the same', async () => {
    const worlds = { base: await loadContentFromDir(resolve(root, 'content'), 'base'), isle: await readContentFiles(resolve(root, 'content'), 'isle') }
    for (const kind of SITUATION_KINDS) {
      const situation = (await kindSituation(kind, worlds))!
      expect(situation.request.cacheBreak, kind).toBeGreaterThan(0)
      expect(situation.request.cacheBreak!, kind).toBeLessThanOrEqual(situation.request.system.length)
    }
  }, 120_000)

  it('keeps the part before the mark the same from call to call in a played game', async () => {
    const base = await loadContentFromDir(resolve(root, 'content'), 'base')
    const mock = new MockLlm('good')
    const seen: LlmRequest[] = []
    const llm = { complete: async (r: LlmRequest): Promise<LlmResponse> => (seen.push(r), mock.complete(r)) }
    await playRegion({ content: base, world: 'base', setting: 'full', llm, seed: 7, days: 1 })
    const of = (kind: string) => seen.filter((r) => r.schemaName === kind)
    // Everyone's goals share the rules, the whole catalogue and the frame; each person's card stays theirs.
    const goals = of('npc_goals')
    expect(goals.length).toBeGreaterThan(10)
    expect(new Set(goals.map(sharedOf)).size).toBe(1)
    // A card changes only when their standing or their people do (a household grows richer, a bond is woven).
    const cards = new Map<string, string>()
    for (const r of goals) {
      const id = String(r.meta?.['npc'])
      const card = fixedOf(r).slice(sharedOf(r).length)
      const before = cards.get(id)
      if (before !== undefined && before !== card) {
        const lines = (text: string) => text.split('\n').filter((l) => !/^(STANDING|YOUR PEOPLE):/.test(l)).join('\n')
        expect(lines(card), id).toBe(lines(before))
      }
      cards.set(id, card)
    }
    // A talk: the same rules and frame for every speaker, the same card for every turn with one.
    const talks = of('npc_reply')
    expect(new Set(talks.map(sharedOf)).size).toBe(1)
    // The night round, the districts and every step of the full build keep all of their fixed part.
    for (const kind of ['chronicle', 'district', 'world_step']) expect(new Set(of(kind).map(fixedOf)).size, kind).toBe(1)
  }, 120_000)

  it('the story round of a region reads the world\'s fixed part the full build wrote', async () => {
    const engine = new Engine(content, { seed: 3 })
    const story = storyRequest(engine.world, 'grey_saltings')
    const step = worldStepRequest(contentFilesOf(engine.content), 'places', 'The region.')
    expect(sharedOf(withSafety(story))).toBe(sharedOf(withSafety(step)))
    expect(sharedOf(story).length).toBeGreaterThan(20000)
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
