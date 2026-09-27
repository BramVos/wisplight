import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Engine, MockLlm, recordFact, type Content, type LlmRequest } from '../src/engine'
import { chronicle, type ChroniclerRequest } from '../src/chronicler'
import { buildInput, lookupCards } from '../src/engine/chronicler'
import { answerLookup, LOOKUP_LIMITS } from '../src/engine/lookups'
import { systemPrompt, turnPrompt } from '../src/engine/dialogue/prompt'
import { goalRequest } from '../src/engine/npc/goals'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway, UNPRICED_CALLS_PER_HOUR } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import { costUsd } from '../src/node/ai/pricing'
import type { Provider, ProviderResponse } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { content } from './helpers'

// Milestone M9.3 (docs/ROADMAP.md): scale. Costs first: the hourly budget
// counts every call of the last hour, also after a restart; calls reserve
// what they may cost before they go; an unknown price is a status of its own;
// cache writes are counted and priced apart. No real API is called.

const folders: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-m93-'))
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

const request: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 50 }
const provider = (answer: () => Promise<ProviderResponse>): Provider => ({ id: 'openai', listModels: async () => [], complete: answer })
// gpt-4.1-mini: $0.40 per million input tokens, so 25,000 tokens cost $0.01.
const cent = (): Promise<ProviderResponse> => Promise.resolve({ text: '{}', provider: 'openai', model: 'gpt-4.1-mini', usage: { inputTokens: 25_000, outputTokens: 0, cachedTokens: 0 }, latencyMs: 1 })

function gateway(dir: string, p: Provider, budget: number, model = 'gpt-4.1-mini', now?: () => number) {
  return new Gateway({ role: () => ({ provider: 'openai', model }), provider: () => p, budgetUsdPerHour: () => budget, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl'), now), ...(now ? { now } : {}) })
}

describe('M9.3: the cost register', () => {
  it('counts every call of the last hour, not the last 200 lines of a log, and after a restart too', async () => {
    const dir = temp()
    const g = gateway(dir, provider(cent), 10)
    for (let i = 0; i < 250; i++) await g.complete(request)
    expect(g.status().hourSpentUsd).toBeCloseTo(2.5, 6)
    // A restart: a new gateway on the same folder.
    expect(gateway(dir, provider(cent), 10).status().hourSpentUsd).toBeCloseTo(2.5, 6)
    // An hour later it has all fallen away.
    const later = gateway(dir, provider(cent), 10, 'gpt-4.1-mini', () => Date.now() + 61 * 60 * 1000)
    expect(later.status().hourSpentUsd).toBe(0)
  })

  it('reserves what a call may cost before it goes, so calls at the same time stay within the budget together', async () => {
    const dir = temp()
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    const slow = provider(async () => {
      await gate
      return cent()
    })
    // Each call may answer 12,500 tokens at $1.60 a million: $0.02 at most. With $0.05 an hour, two may go at once, not three.
    const g = gateway(dir, slow, 0.05)
    const big = { ...request, maxTokens: 12_500 }
    const calls = [g.complete(big), g.complete(big), g.complete(big).catch((e: unknown) => e)]
    expect(g.status().hourReservedUsd).toBeGreaterThan(0.04)
    release()
    const results = await Promise.all(calls)
    expect(results[2]).toMatchObject({ kind: 'budget' })
    // Settled: what they really cost, and nothing held any more.
    expect(g.status().hourReservedUsd).toBe(0)
    expect(g.status().hourSpentUsd).toBeCloseTo(0.02, 6)
  })

  it('treats an unknown price as a status of its own: tokens counted, calls capped, shown in the settings', async () => {
    const dir = temp()
    const g = gateway(dir, provider(async () => ({ text: '{}', provider: 'openai', model: 'mystery-9', usage: { inputTokens: 900, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 })), 10, 'mystery-9')
    for (let i = 0; i < UNPRICED_CALLS_PER_HOUR; i++) await g.complete(request)
    await expect(g.complete(request)).rejects.toMatchObject({ kind: 'budget', message: /price of mystery-9 is not known/ })
    expect(g.status().unpriced).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'voice', model: 'mystery-9', callsThisHour: UNPRICED_CALLS_PER_HOUR })]))
  })

  it('counts and prices cache writes apart, and knows per role how much came from the cache', () => {
    const usage = { inputTokens: 10_000, outputTokens: 0, cachedTokens: 4_000, cacheWriteTokens: 6_000 }
    // Haiku 4.5: $1 input, $0.10 cached, $1.25 to write, per million.
    expect(costUsd('claude-haiku-4-5', usage)).toBeCloseTo((4_000 * 0.1 + 6_000 * 1.25) / 1_000_000, 10)
    const store = new UsageStore(join(temp(), 'usage.json'))
    store.record('anthropic', 'claude-haiku-4-5', usage, true, undefined, 'voice')
    store.record('anthropic', 'claude-haiku-4-5', { inputTokens: 10_000, outputTokens: 0, cachedTokens: 10_000 }, true, undefined, 'voice')
    store.record('openai', 'gpt-4.1-mini', { inputTokens: 1_000, outputTokens: 0, cachedTokens: 0 }, true, undefined, 'brain')
    const roles = store.summary().byRole
    expect(roles.find((r) => r.role === 'voice')).toMatchObject({ calls: 2, cachedTokens: 14_000, cacheWriteTokens: 6_000, cachedPercent: 70 })
    expect(roles.find((r) => r.role === 'brain')).toMatchObject({ cachedPercent: 0 })
    expect(store.summary().month.cacheWriteTokens).toBe(6_000)
  })
})

describe('M9.3: context that belongs to the call', () => {
  /** The Nethermarch with a thousand more people in Veenhoek, all well known to Mirte. */
  function crowded() {
    const npcs = new Map(content.npcs)
    const template = content.npcs.get('npc_pim')!
    for (let i = 0; i < 1000; i++) npcs.set(`npc_extra_${i}`, { ...template, id: `npc_extra_${i}`, name: `Extra Person${i}`, short: `Person${i}`, aliases: [`person${i}`], relations: [], household: undefined, child: false })
    const engine = new Engine({ ...content, npcs } as Content, { seed: 150 })
    for (let i = 0; i < 1000; i++) (engine.state.bonds!['npc_mirte'] ??= {})[`npc_extra_${i}`] = { affinity: 20, trust: 20, fear: 0, familiarity: 60 }
    return engine
  }
  const packet = { known: [], unknown: [] } as unknown as Parameters<typeof turnPrompt>[1]['packet']
  const voice = (engine: Engine) =>
    systemPrompt(engine.world, 'npc_mirte').length + turnPrompt(engine.world, { npcId: 'npc_mirte', act: 'chat' as never, tier: 'short' as never, attitude: { band: 'Neutral', score: 0 } as never, mood: 'calm', packet, memories: [], history: [], playerText: 'Morning.' } as never).length
  const brain = (engine: Engine) => {
    const r = goalRequest(engine.world, { id: 'c1', npc: 'npc_mirte', t: engine.world.now, trigger: 'a quiet morning' })
    return r.system.length + r.prompt.length
  }

  it('with a thousand acquaintances, the prompts of the voice and the brain do not grow', () => {
    const plain = new Engine(content, { seed: 150 })
    const many = crowded()
    expect(voice(many)).toBeLessThan(voice(plain) + 400)
    expect(brain(many)).toBeLessThan(brain(plain) + 600)
    // The brain's people and places are those that matter, never all.
    const r = goalRequest(many.world, { id: 'c2', npc: 'npc_mirte', t: many.world.now, trigger: 'a quiet morning' })
    expect((r.meta!['people'] as string[]).length).toBeLessThanOrEqual(16)
    expect((r.meta!['places'] as string[]).length).toBeLessThanOrEqual(20)
  })
})

describe('M9.3: asking for more, within bounds', () => {
  it('the chronicler may ask about anyone; an NPC only about what is in its own head', () => {
    const engine = new Engine(content, { seed: 151 })
    const world = engine.world
    const fact = recordFact(world, { kind: 'fire', about: ['npc_gerrit'], place: 'loc_peat_sheds', belang: 3, title: 'the peat sheds burn', text: { precise: 'The peat sheds of Gerrit burned down.', village: 'The sheds burned!', far: 'A fire in the fen.' } })
    ;(engine.state.news!.heard['npc_mirte'] ??= {})[fact.id] = { level: 2, reliability: 0.8, from: 'npc_wendela', t: world.now }
    // What someone knows: the chronicler may ask about Mirte; Mirte only about herself; Jan not about Mirte.
    expect(answerLookup(world, 'chronicler', { fn: 'knows', who: 'npc_mirte', topic: 'npc_gerrit' })).toMatchObject({ text: 'The sheds burned!' })
    expect(answerLookup(world, 'npc_mirte', { fn: 'knows', who: 'npc_mirte', topic: 'npc_gerrit' })).toMatchObject({ text: 'The sheds burned!' })
    expect(answerLookup(world, 'npc_jan_visser', { fn: 'knows', who: 'npc_mirte', topic: 'npc_gerrit' })).toEqual({ refused: 'you cannot look into another head' })
    // Storylines are not for NPCs; bonds only their own; places only in the areas they know, and only what they heard.
    const line = engine.state.chronicle!.lines.find((l) => l.facts.includes(fact.id))!
    expect(answerLookup(world, 'npc_mirte', { fn: 'why', line: line.id })).toEqual({ refused: 'storylines are for the chronicler' })
    expect(answerLookup(world, 'chronicler', { fn: 'why', line: line.id })).toHaveProperty('text')
    expect(answerLookup(world, 'npc_mirte', { fn: 'bond', a: 'npc_gerrit', b: 'npc_jan_visser' })).toEqual({ refused: 'you only know your own bonds' })
    expect(answerLookup(world, 'npc_mirte', { fn: 'near', place: 'loc_peat_sheds' })).toMatchObject({ text: 'The sheds burned!' })
    expect(answerLookup(world, 'npc_lubbert', { fn: 'near', place: 'loc_peat_sheds' })).toMatchObject({ text: 'Nothing of note.' })
    // Bounded in size.
    for (let i = 0; i < 40; i++) recordFact(world, { kind: 'talk', about: [], place: 'loc_peat_sheds', belang: 1, title: `talk ${i}`, text: { precise: `Somebody said something rather long about the sheds and the weather, number ${i}.`, village: 'v', far: 'f' } })
    expect((answerLookup(world, 'chronicler', { fn: 'near', place: 'loc_peat_sheds' }) as { text: string }).text.length).toBeLessThanOrEqual(LOOKUP_LIMITS.chars)
  })

  it('the chronicler asks why a line runs as it does, and a run has one budget over all its rounds', async () => {
    const engine = new Engine(content, { seed: 152 })
    const world = engine.world
    recordFact(world, { kind: 'fire', about: ['npc_gerrit'], place: 'loc_peat_sheds', belang: 4, title: 'the peat sheds burn', text: { precise: 'The peat sheds of Gerrit burned down.', village: 'The sheds burned!', far: 'A fire.' } })
    const run = world.state.chronicle!.pending[0]!
    const mock = new MockLlm('good')
    let round = 0
    mock.chronicle = (meta) => (round++ === 0 ? { lookup: [`why ${meta.lines[0]!.key}`] } : {})
    const model = { complete: (r: ChroniclerRequest) => mock.complete(r as unknown as LlmRequest) }
    await chronicle(buildInput(world, run), model, (ids) => lookupCards(world, ids))
    expect(mock.calls.at(-1)!.prompt).toMatch(/LOOKED UP[\s\S]*why "the peat sheds burn": Nothing is known to have caused it/)
    // With the whole run's budget spent after the first call, he must write with what he has.
    round = 0
    mock.calls.length = 0
    await chronicle({ ...buildInput(world, run), limits: { runTokens: 1 } }, model, (ids) => lookupCards(world, ids))
    expect(mock.calls.at(-1)!.prompt).toMatch(/Write the chronicle now\. No more lookups\./)
  })
})

describe('M9.3: a brain that asks first', () => {
  it('asks at most two questions before a choice about a signal, answered from its own head only', async () => {
    const mock = new MockLlm('good')
    mock.intend = (npc, offered) => (npc === 'npc_lubbert' && offered.includes('send_for_more') ? { choice: 'send_for_more' } : undefined)
    mock.ask = (npc, keys) => (npc === 'npc_lubbert' ? ['knows self waagdam', `knows ${Object.keys(keys).find((k) => k.startsWith('p') && keys[k] !== 'npc_lubbert')} flour`, 'near l1'] : [])
    let heard = ''
    mock.heard = (answers) => (heard ||= answers)
    const engine = new Engine(content, { seed: 53, llm: mock })
    engine.state.player.location = 'loc_waagdam_graanhandel'
    for (let h = 0; h < 4 * 24 && !heard; h++) {
      engine.tick(60)
      await engine.runModels()
    }
    expect(heard).toMatch(/^LOOKED UP:/)
    expect(heard).toMatch(/what Lubbert knows of Waagdam/)
    expect(heard).toMatch(/you cannot look into another head/)
    // Two at most: the third question was not asked.
    expect(heard.split('\n').filter((l) => l.startsWith('  ')).length).toBe(2)
    // And then it chose, as before.
    expect(engine.state.plans!.some((p) => p.plan === 'intention:send_for_more' && p.subjects?.includes('npc_lubbert'))).toBe(true)
  }, 120_000)
})
