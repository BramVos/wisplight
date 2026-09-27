import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEdits, createCharacter, entities, Engine, GameClock, loadContent, MockLlm, recordFact, suggestChoice, type Content, type ContentFile } from '../src/engine'
import { carried, settlementAt } from '../src/engine/economy/ledger'
import { readLock, withLock } from '../src/engine/edit'
import { faithOf } from '../src/engine/faith'
import { farFromPlayer, goAway } from '../src/engine/lod'
import { simulate } from '../src/engine/playtest'
import { frictionPressure } from '../src/engine/signals'
import { newcomersIn, welcomingIn } from '../src/engine/social/groups'
import { readContentFiles } from '../src/node/content'
import { content, runUntil, withNpc } from './helpers'

// Milestone M9.1 (docs/ROADMAP.md): ids are keys. Names change, ids do not;
// what goes leaves a tombstone, and saves, logs and the chronicle follow it.

const root = resolve(import.meta.dirname, '../content')
const DAY = 24 * 60

async function say(engine: Engine, ...commands: string[]): Promise<string> {
  const out: string[] = []
  for (const c of commands) out.push(...(await engine.handle(c)).map((o) => o.text))
  return out.join('\n')
}

function edited(files: ContentFile[], ...edits: Parameters<typeof applyEdits>[1]) {
  const result = applyEdits(files, edits)
  expect(result.problems).toEqual([])
  return result
}

describe('M9.1: a name changes, an id does not', () => {
  it('an old save loads and its game log plays back exactly after a name changed in the editor', async () => {
    const engine = new Engine(content, { seed: 91, builder: true })
    await say(engine, 'n', 'e', 'talk mirte', '"Good morning. Any bread today?"', 'bye', 'w', 's')
    engine.tick(2 * DAY)
    await say(engine, 'n', 'e', 'talk mirte', '"Did the flour come?"', 'bye')
    const save = engine.save()
    // Mirte is called Marte now, and nothing answers to the old name.
    const files = await readContentFiles(root)
    const mirte = entities(files, 'npc').find((e) => e.id === 'npc_mirte')!
    const renamed = edited(files, { kind: 'npc', id: 'npc_mirte', data: { ...mirte.raw, name: 'Marte Bakker', short: 'Marte the baker', aliases: ['marte', 'baker'] } })
    expect(renamed.changes.map((c) => c.path)).not.toContain('base/ids.lock')
    const loaded = Engine.fromSave(renamed.content!, save)
    expect(loaded.world.npc('npc_mirte').name).toBe('Marte Bakker')
    loaded.tick(60)
    const replayed = await Engine.replay(renamed.content!, 91, save.log)
    expect(replayed.state).toEqual(engine.state)
    // It plays on with the new name.
    expect(replayed.world.npc('npc_mirte').name).toBe('Marte Bakker')
  }, 120_000)
})

describe('M9.1: the register of each world', () => {
  it('holds every id there is (npm run ids writes it; the editor keeps it)', async () => {
    for (const world of ['base', 'isle']) {
      const files = await readContentFiles(root, world)
      const lock = files.find((f) => f.path === `${world}/ids.lock`)
      expect(lock, `${world}/ids.lock`).toBeDefined()
      expect(withLock(files, readLock(files)).find((f) => f.path === lock!.path)!.text, 'run npm run ids').toBe(lock!.text)
    }
  })
})

describe('M9.1: no id goes without a tombstone', () => {
  it('loading names the id and where it was; the editor makes the tombstone itself', async () => {
    const files = await readContentFiles(root)
    // Cut out by hand: the register misses it.
    const cut = files.map((f) => (f.path === 'base/data/items.yaml' ? { ...f, text: f.text.replace(/\n {2}- id: brick\n(?: {4}.*\n)+/, '\n') } : f))
    expect(() => loadContent(cut)).toThrow(/the item brick \(in base\/data\/items\.yaml\) is missing, and there is no tombstone for it/)
    // Changing an id is refused.
    const brick = entities(files, 'item').find((e) => e.id === 'brick')!
    expect(applyEdits(files, [{ kind: 'item', id: 'brick', data: { ...brick.raw, id: 'baksteen' } }]).problems.join(' ')).toMatch(/the id cannot change/)
    // Deleting it in the editor leaves a tombstone, and the world loads (as long as nothing else needs it).
    const added = edited(files, { kind: 'item', id: 'test_cask', data: { id: 'test_cask', name: 'test cask', description: 'A cask for the test.', value: 1 } })
    expect(added.changes.map((c) => c.path)).toContain('base/ids.lock')
    const gone = edited(added.files, { kind: 'item', id: 'test_cask' })
    expect(gone.content!.lock!.tombstones).toContainEqual({ kind: 'item', id: 'test_cask' })
    // An id that went does not come back.
    expect(applyEdits(gone.files, [{ kind: 'item', id: 'test_cask', data: { id: 'test_cask', name: 'another', description: 'Another.', value: 1 } }]).problems.join(' ')).toMatch(/has a tombstone/)
  })

  it('a save with something removed or merged later loads and plays on by the tombstone', async () => {
    const files = await readContentFiles(root)
    const added = edited(
      files,
      { kind: 'item', id: 'test_cask', data: { id: 'test_cask', name: 'test cask', description: 'A cask for the test.', value: 1 } },
      { kind: 'npc', id: 'npc_test_tinker', data: { id: 'npc_test_tinker', name: 'Tobias Tinker', short: 'the tinker', pronoun: 'he', age: 40, profession: 'pedlar', home: 'loc_goose_rooms', appearance: 'A man with pots.', personality: { warmth: 0, courage: 0, honesty: 0, temper: 0, curiosity: 0, diligence: 0 }, public_facts: ['He mends pots.'] } },
    )
    const engine = new Engine(added.content!, { seed: 92 })
    engine.state.player.inventory['test_cask'] = 2
    engine.tick(DAY)
    const save = engine.save()
    expect(save.state.npcs['npc_test_tinker']).toBeDefined()
    // The cask went up in the barrel; the tinker is gone.
    const later = edited(added.files, { kind: 'item', id: 'test_cask', into: 'barrel' }, { kind: 'npc', id: 'npc_test_tinker' })
    const loaded = Engine.fromSave(later.content!, save)
    expect(loaded.state.player.inventory['barrel']).toBe(2)
    expect(loaded.state.player.inventory['test_cask']).toBeUndefined()
    expect(loaded.state.npcs['npc_test_tinker']).toBeUndefined()
    loaded.tick(DAY)
    expect(await say(loaded, 'inventory')).toMatch(/barrel/)
  }, 120_000)
})

describe('M9.1: a newcomer adopted into the world', () => {
  it('is the same person with the same id in the old save and in a new game', async () => {
    const engine = new Engine(content, { seed: 60 })
    for (let d = 0; d < 22; d++) engine.tick(DAY)
    const people = engine.state.growth!.people
    const head = people[0]!
    const save = engine.save()
    const files = await readContentFiles(root)
    const adopted = edited(files, ...people.map((p) => ({ kind: 'npc' as const, id: p.id, data: JSON.parse(JSON.stringify(p)) as Record<string, unknown>, create: true })))
    // The save: the same person, from the world now.
    const loaded = Engine.fromSave(adopted.content!, save)
    expect(loaded.content.npcs.get(head.id)).toBe(adopted.content!.npcs.get(head.id))
    expect(loaded.state.npcs[head.id]).toBeDefined()
    loaded.tick(DAY)
    // A new game has them from the start, with that id.
    const fresh = new Engine(adopted.content!, { seed: 1 })
    expect(fresh.state.npcs[head.id]).toBeDefined()
    // Adopting again is refused: the id is taken.
    expect(applyEdits(adopted.files, [{ kind: 'npc', id: head.id, data: JSON.parse(JSON.stringify(head)) as Record<string, unknown>, create: true }]).problems.join(' ')).toMatch(/already a npc with this id/)
  }, 120_000)
})

/** The same world, starting on another day. */
function startingOn(c: Content, month: number, day: number): Content {
  return { ...c, world: { ...c.world, start: { ...c.world.start, month, day } } } as Content
}
/** On to a day of a month of the first year. */
function runOn(engine: Engine, month: number, day: number, hour: number): void {
  const target = GameClock.from(211, month, day, hour).minutes
  if (target > engine.world.now) engine.tick(target - engine.world.now)
}
const made = (engine: Engine, settlement: string, item: string) => engine.state.economy!.ledgers[settlement]!.last.made[item] ?? 0
const stock = (engine: Engine, settlement: string, item: string) => engine.state.economy!.ledgers[settlement]!.stock[item] ?? 0
const peatPrice = (engine: Engine) => engine.world.price('loc_peat_sheds', engine.world.service('loc_peat_sheds', 'peat_store')!, 'peat')

describe('M9.1: the seasons of the ledger', () => {
  it('peat is cut in summer, rye comes in at Oogstmaand, and all from the content', () => {
    const engine = new Engine(startingOn(content, 8, 28), { seed: 93 })
    runOn(engine, 8, 29, 12)
    expect(new GameClock(engine.world.now).parts.month).toBe(8)
    expect(made(engine, 'molenend', 'rye_grain')).toBeGreaterThan(0)
    expect(made(engine, 'veenhoek', 'peat')).toBeGreaterThan(0)
    engine.tick(3 * DAY)
    expect(new GameClock(engine.world.now).parts.month).toBe(9)
    // Herfstmaand: no rye from the fields, and the peat is still cut.
    expect(made(engine, 'molenend', 'rye_grain')).toBe(0)
    expect(made(engine, 'veenhoek', 'peat')).toBeGreaterThan(0)
    // Nor is the harvest a surplus: it is the store for the year.
    expect(engine.state.economy!.ledgers['molenend']!.surplus['rye_grain']).toBeFalsy()
    // The months are the content's: a world without them cuts peat all year.
    for (const r of content.resources.values()) if (r.id === 'peat_banks') expect(r.months).toEqual([6, 7, 8, 9])
    for (const o of content.objectTypes.get('peat_bank')!.affordances) expect(o.months).toEqual([6, 7, 8, 9])
  }, 60_000)

  it('through the winter the peat in store goes down, the baskets get fewer and dearer; nobody cuts it', async () => {
    const engine = new Engine(startingOn(content, 10, 2), { seed: 94, builder: true })
    runOn(engine, 10, 3, 12)
    expect(made(engine, 'veenhoek', 'peat')).toBe(0)
    const autumn = stock(engine, 'veenhoek', 'peat')
    const calm = peatPrice(engine)
    runOn(engine, 10, 8, 12)
    expect(stock(engine, 'veenhoek', 'peat')).toBeLessThan(autumn)
    // Late winter: two thirds of the season's store gone, and the store is rationed.
    const ledger = engine.state.economy!.ledgers['veenhoek']!
    ledger.peak = { peat: 9000 }
    ledger.stock['peat'] = 2000
    runOn(engine, 10, 12, 12)
    expect(ledger.missed['peat'] ?? engine.state.signals!.log.some((s) => s.kind === 'shortage' && s.claim?.value === 'peat')).toBeTruthy()
    expect(peatPrice(engine)).toBeGreaterThan(calm)
    // And the player cannot cut it either.
    await engine.handle('@goto loc_peat_cuttings')
    expect((await engine.handle('work')).map((o) => o.text).join(' ')).toMatch(/Not in Wijnmaand: that is done in Zomermaand/)
  }, 60_000)
})

describe('M9.1: every counter from the ledger', () => {
  it('every good a counter is supplied with in a settlement of either world comes out of its store, and nobody goes hungry', async () => {
    const isle = loadContent(await readContentFiles(root, 'isle'))
    for (const c of [content, isle]) {
      const world = new Engine(c, { seed: 95 }).world
      const loose: string[] = []
      for (const loc of c.locations.values())
        for (const service of loc.services ?? [])
          for (const rule of service.supply ?? []) {
            const s = settlementAt(world, loc.id)
            if (!s || !carried(world, s.id).has(rule.item)) loose.push(`${loc.id}#${service.id}: ${rule.item}`)
          }
      expect(loose, `${c.world.name}: counters outside the ledgers`).toEqual([])
    }
    for (const c of [content, isle]) expect(simulate(c, 30, 95).problems.filter((p) => /starving/.test(p))).toEqual([])
  }, 240_000)
})

describe('M9.1: faith, and who takes the newcomers\' side', () => {
  it('everyone holds a faith of their world; one of another faith weighs heavier in a village', async () => {
    const isle = loadContent(await readContentFiles(root, 'isle'))
    for (const c of [content, isle]) {
      const world = new Engine(c, { seed: 96 }).world
      const ids = new Set(c.world.faiths.map((f) => f.id))
      for (const id of c.npcs.keys()) expect(ids.has(faithOf(world, id)!), id).toBe(true)
    }
    // A patron of the Old Powers is of the Old Powers.
    const holle = [...content.npcs.values()].find((n) => n.patron === 'holle')
    if (holle) expect(faithOf(new Engine(content, { seed: 96 }).world, holle.id)).toBe('old_powers')
    const residents = ['npc_lubbert', 'npc_hendrik', 'npc_dirk_schaal'].filter((id) => content.npcs.has(id))
    const guests = ['npc_mirte']
    const same = new Engine(content, { seed: 96 }).world
    const other = new Engine(withNpc('npc_mirte', (n) => (n.faith = 'old_powers')), { seed: 96 }).world
    const pressure = (w: typeof same) => frictionPressure(w, 'waagdam', guests, residents, 'loc_waagdam_church', false)
    expect(pressure(other)).toBeGreaterThan(pressure(same))
  })

  it('after the friction, the warm hearts of the village form the Lantern\'s charity for the newcomers', async () => {
    const engine = new Engine(content, { seed: 44, builder: true })
    runUntil(engine, 15, 9)
    await engine.handle('@plan dyke_breach')
    engine.tick(2 * DAY)
    expect(engine.state.groups?.some((g) => g.aim === 'against' && g.area === 'waagdam')).toBe(true)
    expect(newcomersIn(engine.world, 'waagdam').length).toBeGreaterThan(0)
    engine.tick(2 * DAY)
    const charity = engine.state.groups?.find((g) => g.aim === 'for' && g.area === 'waagdam')
    expect(charity?.name).toBe("the Lantern's charity")
    const against = new Set(engine.state.groups!.filter((g) => g.aim === 'against').flatMap((g) => g.members))
    expect(charity!.members.length).toBeGreaterThan(0)
    for (const m of charity!.members) {
      expect(against.has(m)).toBe(false)
      expect(engine.content.npcs.get(m)!.personality.warmth).toBeGreaterThanOrEqual(1)
    }
    expect(welcomingIn(engine.world, 'waagdam').length).toBeGreaterThan(0)
  }, 60_000)
})

describe('M9.1: the distance rule', () => {
  it('far from the player nobody walks: who goes away is away at once; near the player they set off', () => {
    const engine = new Engine(content, { seed: 97 })
    runUntil(engine, 15, 10)
    const world = engine.world
    expect(engine.state.player.location).toBe('loc_veenhoek_quay')
    expect(farFromPlayer(world, 'loc_oude_zijl_dykehouse')).toBe(true)
    expect(farFromPlayer(world, 'loc_veenhoek_bakery')).toBe(false)
    engine.state.npcs['npc_sijbrand']!.location = 'loc_oude_zijl_dykehouse'
    goAway(world, 'npc_sijbrand', 'loc_molenend_mill', 2)
    expect(engine.state.npcs['npc_sijbrand']!.note?.activity).toMatch(/^away at/)
    engine.state.npcs['npc_mirte']!.location = 'loc_veenhoek_bakery'
    goAway(world, 'npc_mirte', 'loc_molenend_mill', 2)
    expect(engine.state.npcs['npc_mirte']!.note?.activity).toMatch(/^on the way to/)
  })
})

describe('M9.1: a line in the listener\'s voice', () => {
  it('who stays to listen hears one line from the small model; without a model the template is all', async () => {
    const run = async (llm?: MockLlm) => {
      const engine = new Engine(content, { seed: 28, builder: true, ...(llm ? { llm } : {}) })
      runUntil(engine, 15, 14)
      const world = engine.world
      await engine.handle('@goto loc_veenhoek_green')
      const here = engine.state.player.location
      const fact = recordFact(world, { kind: 'rumour', about: ['npc_harmen'], place: 'loc_waagdam_market', belang: 2, title: 'the mill', text: { precise: 'Harmen has sold the mill, they say.', village: 'Harmen has sold the mill!', far: 'A mill was sold.' }, witnesses: [] })
      engine.state.news!.heard['npc_mirte']![fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
      for (const id of ['npc_mirte', 'npc_grietje_visser']) Object.assign(engine.state.npcs[id]!, { location: 'loc_veenhoek_bakery', plan: [{ kind: 'move', to: here }], busyUntil: world.now, goals: [] })
      engine.state.bonds!['npc_mirte']!['npc_grietje_visser'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
      engine.state.bonds!['npc_grietje_visser']!['npc_mirte'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
      for (let m = 0; m < 15 && !engine.state.chatter?.chats.length; m++) await engine.handle('wait 1')
      const first = (await engine.handle('listen')).map((o) => o.text).join('\n')
      const second = (await engine.handle('listen')).map((o) => o.text).join('\n')
      return { first, second }
    }
    const bare = await run()
    expect(bare.first).toMatch(/Harmen has sold the mill/)
    expect(bare.second).not.toMatch(/Well, I never/)
    const voiced = await run(new MockLlm('good'))
    expect(voiced.first).not.toMatch(/Well, I never/)
    expect(voiced.second).toMatch(/(Mirte|Grietje) says: "Is that so\? Well, I never heard the like of it\."/)
  }, 60_000)
})

describe('M9.1: Busy Hands', () => {
  it('with Mother Holle\'s blessing, craft work takes a quarter less time', async () => {
    const took = async (favour: number) => {
      const engine = new Engine(content, { seed: 98, builder: true })
      const made = createCharacter(content, suggestChoice(content, 'warden', 'Joost'))
      if (!('character' in made)) throw new Error(made.problems.join('; '))
      engine.state.player.character = { ...made.character, patron: { id: 'holle', favour, since: 0 } }
      runUntil(engine, 15, 8)
      await engine.handle('@goto loc_peat_cuttings')
      const start = engine.world.now
      expect((await engine.handle('work')).map((o) => o.text).join(' ')).toMatch(/cut peat all day/)
      return engine.world.now - start
    }
    expect(await took(30)).toBe(360)
    expect(await took(10)).toBe(480)
  }, 60_000)
})
