import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type LlmRequest } from '../src/engine'
import { patchWorld } from '../src/engine/edit'
import { dayLength, framesLines, framesView } from '../src/engine/frames'
import { knob } from '../src/engine/knobs'
import { gameDaysPerHour, measuredPerHour } from '../src/node/ai/frequency'
import { guidePrice } from '../src/node/ai/guideprice'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.28, a calmer clock (Bram, 29 September 2026: at a game minute a real
// second people flew in and out of a room, and the brain and the night round
// ran often per real hour). The pace is the knob clock.seconds_per_minute,
// 1 to 8 real seconds a game minute: the world gives its own in world.yaml
// (4 when it says nothing), and the player turns it per game on the frames
// screen or with FRAMES CLOCK. Sleeping, waiting and travelling jump as ever.

const root = join(import.meta.dirname, '../content')
const said = async (engine: Engine, command: string) => (await engine.handle(command)).map((o) => o.text).join('\n')

describe('M10.28: how fast the day goes', () => {
  it('takes the world\'s own pace: the Nethermarch and Deepwell say nothing (4), Skerrow 5, The Quiet Reach 4', async () => {
    const worlds = { base: content, isle: await loadContentFromDir(root, 'isle'), quietreach: await loadContentFromDir(root, 'quietreach'), deepwell: await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other') }
    const pace = Object.fromEntries(Object.entries(worlds).map(([id, c]) => [id, knob({ content: c }, 'clock.seconds_per_minute')]))
    expect(pace).toEqual({ base: 4, isle: 5, quietreach: 4, deepwell: 4 })
    const engine = new Engine(worlds.isle, { seed: 1 })
    engine.start()
    expect(engine.secondsPerGameMinute()).toBe(5)
    const dial = framesView(engine.world).dials.find((d) => d.id === 'clock')!
    expect(dial.slider).toEqual({ min: 1, max: 8, value: 5, world: 5 })
    expect(dial.about).toMatch(/a day in 2 hours/)
  })

  it('FRAMES CLOCK turns it for this game, within 1 to 8, back to the world\'s own with WORLD, and the replay keeps it', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    expect(await said(engine, 'frames clock 8')).toBe('How fast the day goes: 8 seconds a game minute, a day in 3 hours 12 minutes.')
    expect(engine.secondsPerGameMinute()).toBe(8)
    expect(await said(engine, 'frames clock 9')).toMatch(/1 to 8/)
    expect(await said(engine, 'frames clock 1')).toMatch(/a day in 24 minutes/)
    expect(framesLines(engine.world).join('\n')).toMatch(/How fast the day goes: 1 second a game minute, a day in 24 minutes; this world's own is 4/)
    const again = await Engine.replay(content, 1, engine.save().log)
    expect(again.secondsPerGameMinute()).toBe(1)
    await engine.handle('frames clock world')
    expect(engine.secondsPerGameMinute()).toBe(4)
    expect(engine.state.knobs?.['clock.seconds_per_minute']).toBeUndefined()
  })

  it('says a day in real time', () => {
    expect([1, 4, 5, 8].map(dayLength)).toEqual(['24 minutes', '1 hour 36 minutes', '2 hours', '3 hours 12 minutes'])
  })

  it('a sleep or a wait still jumps, whatever the pace', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    await engine.handle('frames clock 8')
    const before = engine.world.now
    await engine.handle('wait 2 hours')
    expect(engine.world.now - before).toBeGreaterThanOrEqual(120)
  })

  it('the Calendar step may set the pace without losing the knobs a world already has', async () => {
    const files = await readContentFiles(root, 'isle')
    const patched = patchWorld(files, 'knobs:\n  clock.seconds_per_minute: 3\n')
    expect(patched.problems).toEqual([])
    const text = patched.files.find((f) => /world\.ya?ml$/.test(f.path))!.text
    expect(text).toMatch(/clock\.seconds_per_minute: 3/)
    expect(text).toMatch(/people\.model_km: 1/)
    expect(text).toMatch(/story\.quiet_ladder/)
  })

  it('prices the hour by the pace: what comes by the game day slows with it, talk does not', () => {
    expect(gameDaysPerHour(4)).toBeCloseTo(gameDaysPerHour(1) / 4, 6)
    const [one, four, eight] = [measuredPerHour(1), measuredPerHour(4), measuredPerHour(8)]
    expect(four['npc_goals']).toBeLessThan(one['npc_goals']! / 3)
    expect(four['chronicle']).toBeCloseTo(one['chronicle']! / 4, 6)
    expect(four['npc_reply']).toBe(one['npc_reply'])
    expect(eight['npc_goals']).toBeLessThan(four['npc_goals']!)
    const roles = { voice: 'claude-haiku-4-5-20251001', brain: 'claude-sonnet-5', chronicler: 'claude-opus-5-5' } as const
    const guide = guidePrice((role) => (role in roles ? { provider: 'anthropic', model: roles[role as keyof typeof roles] } : undefined))
    const by = guide.measuredByClock!
    expect(Object.keys(by).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(by[1]!).toBeGreaterThan(by[4]!)
    expect(by[4]!).toBeGreaterThan(by[8]!)
    expect(guide.measuredHour).toBe(by[4])
  })

  it('keeps the part every goal choice shares an hour in the cache, since at 4 a choice comes every seven minutes', async () => {
    const mock = new MockLlm('good')
    const seen: LlmRequest[] = []
    const engine = new Engine(content, { seed: 1, llm: { complete: async (r: LlmRequest) => (seen.push(r), mock.complete(r)) } })
    engine.setPlayMode('continue')
    engine.start()
    for (let hour = 0; hour < 12 && !seen.some((r) => r.schemaName === 'npc_goals'); hour++) {
      engine.tick(60)
      await engine.runModels()
    }
    expect(seen.find((r) => r.schemaName === 'npc_goals')!.cacheHour).toBe(true)
  })

  it('gives every person the same goal schema, since Anthropic caches the schema ahead of the shared part', async () => {
    const mock = new MockLlm('good')
    const seen: LlmRequest[] = []
    const engine = new Engine(content, { seed: 1, llm: { complete: async (r: LlmRequest) => (seen.push(r), mock.complete(r)) } })
    engine.setPlayMode('continue')
    engine.start()
    for (let hour = 0; hour < 24; hour++) {
      engine.tick(60)
      await engine.runModels()
    }
    const plain = seen.filter((r) => r.schemaName === 'npc_goals' && !JSON.stringify(r.schema).includes('intention'))
    const people = new Set(plain.map((r) => (r.meta as { npc: string }).npc))
    expect(people.size).toBeGreaterThan(2)
    expect(new Set(plain.map((r) => JSON.stringify(r.schema))).size).toBe(1)
  })
})
