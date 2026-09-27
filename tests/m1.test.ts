import { describe, expect, it } from 'vitest'
import { Engine, GameClock } from '../src/engine'
import { SaveStore } from '../src/node/savegame'
import { content, eventsBy, newEngine, runUntil, withNpc } from './helpers'

// Acceptance criteria of milestone M1 (docs/ROADMAP.md).

describe('M1: the region runs on its own', () => {
  it('runs 7 game days without errors, hunger or NPCs stuck in one place', () => {
    const engine = newEngine(7)
    const changes = new Map<string, number>()
    const last = new Map<string, string>()
    for (let hour = 0; hour < 7 * 24; hour++) {
      engine.tick(60)
      for (const [id, npc] of Object.entries(engine.state.npcs)) {
        expect(npc.needs.hunger, `${id} starving at hour ${hour}`).toBeGreaterThan(0)
        const key = `${npc.location}|${npc.activity}`
        if (last.get(id) !== key) changes.set(id, (changes.get(id) ?? 0) + 1)
        last.set(id, key)
      }
    }
    for (const id of Object.keys(engine.state.npcs)) {
      // Under a curse, or a spirit of one place: they do not keep a day.
      if (content.npcs.get(id)!.absent || content.npcs.get(id)!.quirks.includes('spirit')) continue
      expect(changes.get(id) ?? 0, `${id} barely moved in a week`).toBeGreaterThan(7)
    }
  })
})

describe('M1: Mirte bakes bread while the mill is down', () => {
  it('buys rye from Lubbert, has it ground at the horse mill and bakes', () => {
    const engine = newEngine()
    const before = engine.world.stock('loc_veenhoek_bakery', 'bakery_counter')['rye_bread'] ?? 0
    runUntil(engine, 15, 13)
    const story = eventsBy(engine, 'npc_mirte').join('\n')
    expect(story).toMatch(/Mirte buys 2 sacks of rye from Lubbert/)
    expect(story).toMatch(/horse mill/)
    expect(story).toMatch(/slides a tray of loaves into the oven/)
    expect(story).toMatch(/sets out 12 loaves of rye bread for sale/)
    expect(engine.world.objectState('loc_molenend_mill', 'de_zwaan')['broken']).toBe(true)
    expect(engine.world.stock('loc_veenhoek_bakery', 'bakery_counter')['rye_bread']).toBeGreaterThan(before)
  })

  it('leaves late enough to arrive when the grain store opens', () => {
    const engine = newEngine()
    runUntil(engine, 15, 7, 1)
    const departure = engine.state.events.find((e) => e.actor === 'npc_mirte' && e.kind === 'depart' && e.t > GameClock.from(211, 9, 15, 4).minutes)
    expect(departure).toBeDefined()
    expect(new GameClock(departure!.t).parts.hour).toBe(5)
  })

  it('asks for help when she knows no source of flour', () => {
    const engine = newEngine(1, withNpc('npc_mirte', (npc) => (npc.knows_areas = ['veenhoek'])))
    runUntil(engine, 15, 6)
    expect(engine.state.requests).toContainEqual(expect.objectContaining({ npc: 'npc_mirte', item: 'flour', status: 'open' }))
    expect(eventsBy(engine, 'npc_mirte').join('\n')).toMatch(/could do with 2 sacks of flour/)
  })

  it('prefers grinding rye over dear flour, and does the sums', () => {
    const engine = newEngine()
    runUntil(engine, 15, 7, 1)
    expect(eventsBy(engine, 'npc_mirte').join('\n')).not.toMatch(/buys .*flour/)
  })
})

describe('M1: prices follow stock', () => {
  it('makes flour dear after the storm and cheaper once the mill turns again', () => {
    const engine = newEngine()
    const world = engine.world
    const store = world.service('loc_waagdam_graanhandel', 'grain_store')!
    const price = () => world.price('loc_waagdam_graanhandel', store, 'flour')
    expect(price()).toBe(72) // 9 stuivers with 5 of 20 sacks in stock
    runUntil(engine, 16, 18)
    expect(price()).toBe(108) // sold out: three times the base price
    world.objectState('loc_molenend_mill', 'de_zwaan')['broken'] = false
    runUntil(engine, 19, 18)
    expect(price()).toBeLessThan(108)
  })
})

describe('M1: saving, loading and replay', () => {
  it('saves to SQLite and loads exactly the same state, and replays from the log', async () => {
    const engine = newEngine(42)
    await engine.handle('n')
    engine.tick(90)
    await engine.handle('e')
    await engine.handle('wait 600')
    await engine.handle('list')
    engine.tick(300)
    await engine.handle('w')

    const store = new SaveStore(':memory:')
    store.save('slot1', engine.save())
    const loaded = store.load('slot1')!
    expect(loaded.state).toEqual(engine.state)

    const restored = Engine.fromSave(content, loaded)
    expect(restored.state).toEqual(engine.state)
    restored.tick(120)
    engine.tick(120)
    expect(restored.state).toEqual(engine.state)

    const replayed = await Engine.replay(content, 42, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
    store.close()
  })
})

describe('M1: player commands', () => {
  it('handles take, drop, give, examine and use', async () => {
    const engine = newEngine()
    const say = async (input: string) => (await engine.handle(input)).map((o) => o.text).join('\n')

    expect(await say('examine stone')).toMatch(/dog carved/)
    expect(await say('drop knife')).toMatch(/You put down a knife/)
    expect(await say('look')).toMatch(/On the ground: a knife/)
    expect(await say('take knife')).toMatch(/You pick up a knife/)
    expect(await say('use stone')).toMatch(/You leave an apple on the stone/)
    expect(engine.state.player.inventory['apple']).toBe(1)

    await say('n')
    await say('e')
    expect(await say('give apple to mirte')).toMatch(/You give an apple to Mirte/)
    expect(engine.state.npcs['npc_mirte']!.inventory['apple']).toBe(1)
    expect(await say('x mirte')).toMatch(/Mirte the baker\. A round, quick woman/)
  })

  it('handles buy, eat, sell, rent, wait and sleep', async () => {
    const engine = newEngine()
    const say = async (input: string) => (await engine.handle(input)).map((o) => o.text).join('\n')

    await say('n')
    await say('e')
    expect(await say('list')).toMatch(/closed/)
    runUntil(engine, 15, 5, 5)
    expect(await say('list')).toMatch(/rye bread/)
    const money = engine.state.player.money
    expect(await say('buy bread')).toMatch(/You buy a loaf of rye bread from Mirte/)
    expect(engine.state.player.money).toBeLessThan(money)
    expect(await say('eat bread')).toMatch(/You eat a loaf of rye bread/)

    engine.state.player.location = 'loc_goose_common'
    engine.state.player.inventory['eel'] = 2
    runUntil(engine, 15, 14)
    expect(await say('sell 2 eel')).toMatch(/You sell 2 eels to Trijntje/)
    expect(await say('rent room')).toMatch(/You pay 1 st for a room/)
    expect(await say('wait 30')).toMatch(/Time passes/)
    runUntil(engine, 15, 22)
    await say('up')
    expect(await say('sleep')).toMatch(/heavy quilt/)
    expect(engine.clock.parts).toMatchObject({ day: 16, hour: 7 })
  })
})
