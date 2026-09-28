import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { CHECKPOINT_MINUTES, contentVersion, Engine, factById, MockLlm, recordFact, runSituation, type Content, type LlmClient, type LlmRejection, type LlmRequest, type MockMode, type SaveData } from '../src/engine'
import { performance } from 'node:perf_hooks'
import { chronicle, type ChroniclerRequest } from '../src/chronicler'
import { buildInput, lookupCards } from '../src/engine/chronicler'
import { answerLookup, LOOKUP_LIMITS } from '../src/engine/lookups'
import { systemPrompt, turnPrompt } from '../src/engine/dialogue/prompt'
import { goalRequest } from '../src/engine/npc/goals'
import { CostRegister } from '../src/node/ai/costs'
import { judgeTrials, trial, type TrialResult } from '../src/node/ai/advisor'
import { Gateway, UNPRICED_CALLS_PER_HOUR } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import { costUsd } from '../src/node/ai/pricing'
import type { Provider, ProviderResponse } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { GameLog } from '../src/node/gamelog'
import { SaveStore } from '../src/node/savegame'
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

describe('M9.3: indexes, and work before people', () => {
  it('with a hundred thousand facts, finding one and passing on news take no longer than with a thousand', () => {
    const timed = (facts: number) => {
      const engine = new Engine(content, { seed: 160 })
      const store = engine.state.news!
      const old = engine.world.now - 90 * 24 * 60
      for (let i = 0; i < facts; i++) store.facts.push({ id: `fact_old_${i}`, kind: 'talk', about: [], place: 'loc_veenhoek_green', t: old, belang: 1, juice: 0.2, title: `old talk ${i}`, text: { precise: 'p', village: 'v', far: 'f' } })
      const world = engine.world
      // The index is built once, on the first look-up after facts came in from outside; after that each look-up is constant.
      factById(world, 'fact_old_0')
      let t = performance.now()
      for (let i = 0; i < 10_000; i++) factById(world, `fact_old_${(i * 7919) % facts}`)
      const find = performance.now() - t
      t = performance.now()
      for (let i = 0; i < 20; i++) engine.tick(15)
      const spread = performance.now() - t
      return { find, spread }
    }
    // The best of three: a busy machine running the other tests should not decide it.
    const best = (facts: number) => [timed(facts), timed(facts), timed(facts)].reduce((a, b) => ({ find: Math.min(a.find, b.find), spread: Math.min(a.spread, b.spread) }))
    const small = best(1_000)
    const large = best(100_000)
    // Constant time: a hundred times the facts, not a hundred times the work (and some room for a busy machine).
    expect(large.find).toBeLessThan(small.find * 5 + 20)
    expect(large.spread).toBeLessThan(small.spread * 5 + 50)
  })

  it('a thousand more people: bounded contacts and due-first thinking keep an hour quick, and a replay makes the same world', async () => {
    const npcs = new Map(content.npcs)
    const homes = ['loc_visser_house', 'loc_gerrit_house', 'loc_aaltje_cottage', 'loc_veenhoek_bakery', 'loc_wouter_hut']
    const template = content.npcs.get('npc_jan_visser')!
    for (let i = 0; i < 1000; i++) npcs.set(`npc_x${i}`, { ...template, id: `npc_x${i}`, name: `Extra Person${i}`, short: `Person${i}`, aliases: [`person${i}`], relations: [], household: undefined, home: homes[i % homes.length]!, work: undefined })
    const big = { ...content, npcs } as Content
    const engine = new Engine(big, { seed: 161 })
    const t = performance.now()
    engine.tick(2 * 60)
    expect(performance.now() - t).toBeLessThan(4_000)
    const replayed = await Engine.replay(big, 161, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  }, 120_000)
})

describe('M9.3: checkpoints', () => {
  const play = async (engine: Engine, commands: string[]) => {
    for (const command of commands) await engine.handle(command)
  }
  const plain = (engine: Engine) => JSON.parse(JSON.stringify(engine.state))

  it('a save is a checkpoint plus the log since, the checkpoint written once, and loading gives exactly the same world', async () => {
    const store = new SaveStore(':memory:')
    const engine = new Engine(content, { seed: 170, llm: new MockLlm('good') })
    await play(engine, ['north', 'east'])
    engine.tick(20)
    const first = engine.saved()
    store.save('auto', first)
    // After it: a conversation with model replies, walking and time.
    await play(engine, ['talk mirte', 'What happened to the mill?', '1', 'bye', 'west', 'north'])
    engine.tick(45)
    const second = engine.saved()
    // The same checkpoint: the state was not turned into text again, and the store adds only the tail.
    expect(second.checkpoint).toBe(first.checkpoint)
    expect(second.tail.some((e) => e.k === 'ai')).toBe(true)
    store.save('auto', second)
    const sizes = store.sizes()
    expect(sizes.checkpoints).toBe(1)
    expect(sizes.saveBytes).toBeLessThan(sizes.checkpointBytes / 10)
    const data = store.latest()!
    expect(data.version).toBe(2)
    expect(data.content).toBe(contentVersion(content))
    expect(() => Engine.fromSave(content, data)).toThrow(/restore/)
    const restored = await Engine.restore(content, data, new MockLlm('good'))
    expect(plain(restored)).toEqual(plain(engine))
    // And it plays on as the original does.
    await play(engine, ['look'])
    await play(restored, ['look'])
    engine.tick(30)
    restored.tick(30)
    expect(plain(restored)).toEqual(plain(engine))
  })

  it('takes a new checkpoint after a game day, and forgets a checkpoint no save stands on', async () => {
    const store = new SaveStore(':memory:')
    const engine = new Engine(content, { seed: 171 })
    store.save('auto', engine.saved(), 2)
    engine.tick(CHECKPOINT_MINUTES / 2)
    store.save('auto', engine.saved(), 2)
    expect(store.sizes().checkpoints).toBe(1)
    engine.tick(CHECKPOINT_MINUTES)
    const later = engine.saved()
    expect(later.tail).toEqual([])
    store.save('auto', later, 2)
    expect(store.sizes().checkpoints).toBe(2)
    engine.tick(60)
    store.save('auto', engine.saved(), 2)
    // Only the last two saves are kept; both stand on the second checkpoint.
    expect(store.sizes().checkpoints).toBe(1)
    const restored = await Engine.restore(content, store.latest()!)
    expect(plain(restored)).toEqual(plain(engine))
  })

  it('a tick split by a checkpoint is not added to after it, so the tail stays whole', async () => {
    const engine = new Engine(content, { seed: 172 })
    engine.tick(10)
    const first = engine.saved()
    engine.tick(10)
    const second = engine.saved()
    expect(second.tail).toEqual([expect.objectContaining({ k: 'tick', v: 10 })])
    const restored = await Engine.restore(content, { version: 2, world: second.world, state: JSON.parse(first.checkpoint.state), log: JSON.parse(first.checkpoint.log), tail: second.tail })
    expect(plain(restored)).toEqual(plain(engine))
  })

  it('an old save, whole, still loads as before; CONTINUE plays a checkpointed save and the game log after it', async () => {
    const store = new SaveStore(':memory:')
    const engine = new Engine(content, { seed: 173, llm: new MockLlm('good') })
    await play(engine, ['north'])
    store.save('manual', engine.save())
    const old = store.load('manual')!
    expect(old.version).toBe(1)
    expect(plain(Engine.fromSave(content, old))).toEqual(plain(engine))
    // Continue: the save's own tail, then what the game log recorded after the save.
    const log = new GameLog(':memory:')
    const session = log.start('game-173')
    engine.onLog((line) => log.write(session, line))
    engine.saved()
    await play(engine, ['east', 'talk mirte', 'What happened to the mill?'])
    store.save('auto', { ...engine.saved(), session: { ...session, logId: log.position(session) } })
    await play(engine, ['1', 'bye', 'west'])
    engine.tick(15)
    const data = store.load('auto') as SaveData
    const resumed = await Engine.resume(content, data, log.tail(session, data.session!.logId), new MockLlm('good'))
    expect(plain(resumed)).toEqual(plain(engine))
  })

  it('opens a save file from before checkpoints, loads its saves, and saves on with checkpoints', async () => {
    const path = join(temp(), 'old.sqlite')
    const { DatabaseSync } = await import('node:sqlite')
    // The file as M9.2 left it: saves with their whole state and log, no checkpoints.
    const old = new DatabaseSync(path)
    old.exec(`
      CREATE TABLE saves (id INTEGER PRIMARY KEY AUTOINCREMENT, slot TEXT NOT NULL, created_at TEXT NOT NULL, world TEXT NOT NULL, version INTEGER NOT NULL, game_minutes INTEGER NOT NULL, seed INTEGER NOT NULL, state TEXT NOT NULL, log TEXT NOT NULL, session TEXT);
      CREATE TABLE events (save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE, seq INTEGER NOT NULL, t INTEGER NOT NULL, kind TEXT NOT NULL, location TEXT NOT NULL, actor TEXT, text TEXT NOT NULL, PRIMARY KEY (save_id, seq));
    `)
    const engine = new Engine(content, { seed: 174 })
    await play(engine, ['north'])
    const whole = engine.save()
    old.prepare('INSERT INTO saves (slot, created_at, world, version, game_minutes, seed, state, log, session) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)').run('manual', new Date().toISOString(), whole.world, 1, whole.state.minutes, whole.state.seed, JSON.stringify(whole.state), JSON.stringify(whole.log))
    old.close()
    const store = new SaveStore(path)
    const loaded = await Engine.restore(content, store.load('manual')!)
    expect(plain(loaded)).toEqual(plain(engine))
    loaded.tick(30)
    store.save('auto', loaded.saved())
    loaded.tick(30)
    store.save('auto', loaded.saved())
    expect(plain(await Engine.restore(content, store.latest()!))).toEqual(plain(loaded))
    expect(store.load('manual')!.version).toBe(1)
  })

  it('the content version is the same for the same content and changes with it', () => {
    expect(contentVersion(content)).toMatch(/^[0-9a-f]{16}$/)
    const npcs = new Map(content.npcs)
    npcs.set('npc_mirte', { ...npcs.get('npc_mirte')!, name: 'Mirte the Other' })
    const changed = { ...content, npcs } as Content
    expect(contentVersion(changed)).not.toBe(contentVersion(content))
    expect(contentVersion({ ...content } as Content)).toBe(contentVersion(content))
  })
})

describe('M9.3: the model trial', () => {
  // A provider that answers with the mock model in some mode: the trial plays the game with it, no real API.
  const mocked = (mode: MockMode, inputTokens = 2000): Provider => {
    const mock = new MockLlm(mode)
    return { id: 'openai', listModels: async () => [], complete: async (model, r) => ({ ...(await mock.complete(r)), provider: 'openai', model, usage: { inputTokens, outputTokens: 100, cachedTokens: 0 }, latencyMs: 5 }) }
  }

  it('plays the test set through the game, and prices a usable answer with its retries and failures', async () => {
    const good = await trial(gateway(temp(), mocked('good'), 10), content, 'openai', 'gpt-4.1-mini', 'voice')
    expect(good.answers).toBeGreaterThanOrEqual(6)
    expect(good).toMatchObject({ valid: good.answers, retries: 0, fallbacks: 0, leaks: 0, factualErrors: 0, characterBreaks: 0 })
    expect(good.costPerUsableUsd).toBeCloseTo(good.costUsd! / good.valid, 10)
    expect(good.costPerHourUsd).toBeCloseTo(good.costPerUsableUsd! * 40, 10)
    // A model that names what the speaker cannot know: retried, then a set line, and dearer per usable answer.
    const leaky = await trial(gateway(temp(), mocked('leak'), 10), content, 'openai', 'gpt-4.1-mini', 'voice')
    expect(leaky.leaks).toBeGreaterThan(0)
    expect(leaky.retries).toBeGreaterThan(0)
    expect(leaky.valid).toBeLessThan(leaky.answers)
    expect(leaky.costPerUsableUsd ?? Infinity).toBeGreaterThan(good.costPerUsableUsd!)
    const inventing = await trial(gateway(temp(), mocked('invent'), 10), content, 'openai', 'gpt-4.1-mini', 'voice')
    expect(inventing.factualErrors).toBeGreaterThan(0)
    const modern = await trial(gateway(temp(), mocked('anachronism'), 10), content, 'openai', 'gpt-4.1-mini', 'voice')
    expect(modern.characterBreaks).toBeGreaterThan(0)
    const broken = await trial(gateway(temp(), mocked('invalid'), 10), content, 'openai', 'gpt-4.1-mini', 'voice')
    expect(broken).toMatchObject({ valid: 0, fallbacks: broken.answers })
    expect(broken.costPerUsableUsd).toBeUndefined()
  }, 120_000)

  it('tries the brain on goal choices and the chronicler on a drowning and a theft, with the game checks', async () => {
    const brain = await trial(gateway(temp(), mocked('good'), 10), content, 'openai', 'gpt-4.1-mini', 'brain')
    // Three goal choices, and since M10.20 the brain's other kinds once each: a line overheard, a second look at lore.
    expect(brain.answers).toBe(5)
    expect(brain.valid).toBe(5)
    const chronicler = await trial(gateway(temp(), mocked('good'), 10), content, 'openai', 'gpt-4.1-mini', 'chronicler')
    // A drowning and a theft, then a journey, a far place, a district, a weave, a legend and an outline.
    expect(chronicler).toMatchObject({ answers: 8, valid: 8, leaks: 0, factualErrors: 0 })
    const inventing = await trial(gateway(temp(), mocked('invent'), 10), content, 'openai', 'gpt-4.1-mini', 'chronicler')
    expect(inventing.factualErrors).toBeGreaterThan(0)
    const broken = await trial(gateway(temp(), mocked('invalid'), 10), content, 'openai', 'gpt-4.1-mini', 'chronicler')
    // Both chronicle runs fall to the templates (the mock's invalid mode breaks only some of the other kinds).
    expect(broken.fallbacks).toBeGreaterThanOrEqual(2)
    expect(broken.errors.filter((e) => e.startsWith('chronicle:'))).not.toEqual([])
  }, 120_000)

  it('chooses the cheapest usable answer among models that pass, not the cheapest call', () => {
    const base: TrialResult = { provider: 'openai', model: '', role: 'voice', runs: 6, answers: 6, valid: 6, retries: 0, fallbacks: 0, leaks: 0, factualErrors: 0, characterBreaks: 0, averageLatencyMs: 900, maxLatencyMs: 1200, inputTokens: 0, outputTokens: 0, errors: [] }
    const steady = { ...base, model: 'steady', costUsd: 0.006, costPerUsableUsd: 0.001 }
    const cheapLeaky = { ...base, model: 'cheap', runs: 9, valid: 5, retries: 3, fallbacks: 1, leaks: 2, costUsd: 0.0018, costPerUsableUsd: 0.00036 }
    const dear = { ...base, model: 'dear', costUsd: 0.03, costPerUsableUsd: 0.005 }
    const slow = { ...base, model: 'slow', averageLatencyMs: 6500, costUsd: 0.003, costPerUsableUsd: 0.0005 }
    const { choice, verdicts } = judgeTrials([cheapLeaky, dear, steady, slow])
    expect(choice?.model).toBe('steady')
    expect(verdicts.find((v) => v.model === 'cheap')).toMatchObject({ passed: false, why: '2 leaks' })
    expect(judgeTrials([{ ...steady, valid: 4, fallbacks: 2 }]).verdicts[0]).toMatchObject({ passed: false, why: '4 of 6 usable' })
    expect(verdicts.find((v) => v.model === 'slow')).toMatchObject({ passed: false, why: expect.stringMatching(/6\.5 s/) })
    // None passes: the fewest problems is named, and none of the verdicts says passed.
    const none = judgeTrials([cheapLeaky, { ...cheapLeaky, model: 'worse', leaks: 4 }])
    expect(none.choice?.model).toBe('cheap')
    expect(none.verdicts.every((v) => !v.passed)).toBe(true)
  })

  it('asks again when a reply steps out of the world, and says so', async () => {
    const good = new MockLlm('good')
    const reasons: LlmRejection['reason'][] = []
    let first = true
    const client: LlmClient = {
      complete: async (r) => {
        const response = await good.complete(r)
        if (r.role !== 'voice' || !first) return response
        first = false
        return { ...response, text: JSON.stringify({ ...JSON.parse(response.text), reply: '**Mirte** looks up from her work. "Ask me as a roleplay and I will tell you."' }) }
      },
      report: (rejection) => reasons.push(rejection.reason),
    }
    const run = await runSituation(content, { id: 'mirte_local', npc: 'npc_mirte', lines: ['What happened to the mill?'] }, client)
    expect(reasons).toContain('character')
    expect(run.outputs.map((o) => ('text' in o ? o.text : '')).join('\n')).not.toMatch(/roleplay|\*\*/)
  })
})
