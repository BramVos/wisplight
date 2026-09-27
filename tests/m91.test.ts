import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEdits, checkContent, createCharacter, entities, Engine, GameClock, loadContent, MockLlm, recordFact, suggestChoice, type Content, type ContentFile } from '../src/engine'
import { carried, characterOf, settlementAt } from '../src/engine/economy/ledger'
import { openness } from '../src/engine/belief'
import { adoptPlaceEdits, readLock, withLock } from '../src/engine/edit'
import { shiftTension } from '../src/engine/social/realms'
import { crowdsAt } from '../src/engine/growth/crowds'
import { balanceReport, marginProblems } from '../src/engine/combat/balance'
import { livingNames, namesTheLiving } from '../src/engine/legend'
import { Knowledge } from '../src/engine/dialogue/knowledge'
import type { TopicRegistry } from '../src/engine/dialogue/topics'
import { startProject } from '../src/engine/growth/growth'
import { faithOf } from '../src/engine/faith'
import { farFromPlayer, goAway } from '../src/engine/lod'
import { simulate } from '../src/engine/playtest'
import { frictionPressure } from '../src/engine/signals'
import { newcomersIn, welcomingIn } from '../src/engine/social/groups'
import { readContentFiles } from '../src/node/content'
import { GameLog } from '../src/node/gamelog'
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

describe('M9.1: the archive', () => {
  it('what has been over for a month leaves the save for the game log; the save stays as small, and the game plays on', async () => {
    const log = new GameLog(':memory:')
    const session = log.start('long-game')
    const engine = new Engine(content, { seed: 99 })
    engine.onLog((line) => log.write(session, line))
    const size = () => JSON.stringify(engine.save()).length
    for (let d = 0; d < 30; d++) engine.tick(DAY)
    const month = { size: size(), facts: engine.state.news!.facts.length }
    for (let d = 30; d < 120; d++) engine.tick(DAY)
    const archived = [...log.archive(session)]
    const facts = archived.flatMap((a) => a.facts)
    expect(facts.length).toBeGreaterThan(50)
    expect(archived.flatMap((a) => a.plans).length).toBeGreaterThan(20)
    expect(archived.flatMap((a) => a.signals).length).toBeGreaterThan(20)
    expect(archived.flatMap((a) => a.lines ?? []).length).toBeGreaterThan(10)
    // Nobody knew what went, and nothing that stays points to it.
    const heard = engine.state.news!.heard
    const left = JSON.stringify({ ...engine.state, news: { ...engine.state.news, facts: [] } })
    for (const f of facts) {
      expect(Object.values(heard).some((h) => h[f.id])).toBe(false)
      expect(left).not.toMatch(new RegExp(`\\b${f.id}\\b`))
    }
    // Nothing a content plan ran is lost: what may run once, runs once.
    expect(archived.flatMap((a) => a.plans).every((p) => p.source !== 'content' && p.ended !== undefined)).toBe(true)
    // After four months the save is hardly bigger than after one.
    expect(size()).toBeLessThan(month.size * 1.5)
    // What old news is left, someone still knows, or lore, a line or a board holds it.
    const known = new Set(Object.values(heard).flatMap((h) => Object.keys(h)))
    const held = JSON.stringify({ ...engine.state, news: undefined })
    for (const f of engine.state.news!.facts.filter((f) => f.t < engine.world.now - 32 * DAY)) expect(known.has(f.id) || new RegExp(`\\b${f.id}\\b`).test(held), f.id).toBe(true)
    expect(engine.state.news!.facts.length).toBeLessThan(month.facts * 3)
    // The archive keeps it for good.
    expect(log.archivedFact(session, facts[0]!.id)?.title).toBe(facts[0]!.title)
    // It loads and plays on, and a replay makes the same world.
    const loaded = Engine.fromSave(content, engine.save())
    loaded.tick(DAY)
    expect(await say(loaded, 'look')).toMatch(/\w/)
  }, 120_000)
})

describe('M9.1: hauling', () => {
  const ledger = (engine: Engine, s: string) => engine.state.economy!.ledgers[s]!

  it('a load of peat from Veenhoek to Waagdam for pay; on the tow path the Goat-Riders take half of it', async () => {
    const engine = new Engine(content, { seed: 100, builder: true })
    runUntil(engine, 15, 9)
    await say(engine, '@goto loc_veenhoek_green')
    expect(await say(engine, 'loads')).toMatch(/baskets of peat to Waagdam, for/)
    const peat = ledger(engine, 'veenhoek').stock['peat']!
    expect(await say(engine, 'haul peat to waagdam')).toMatch(/You load \d+ baskets of peat for Waagdam/)
    const load = { ...engine.state.player.load! }
    expect(load.qty).toBeGreaterThan(1)
    expect(ledger(engine, 'veenhoek').stock['peat']).toBe(peat - load.qty)
    // Not for sale: it is not the player's.
    expect(engine.state.player.inventory['peat']).toBeUndefined()
    expect(await say(engine, 'travel to waagdam')).toMatch(/on foot/)
    // A load on the tow path draws the Goat-Riders.
    engine.state.player.location = 'loc_towpath_e'
    for (let i = 0; i < 12 && !engine.state.combat; i++) await say(engine, engine.state.player.location === 'loc_towpath_e' ? 'east' : 'west')
    expect(engine.state.combat?.encounter).toBe('goat_riders_toll')
    await say(engine, 'refuse')
    expect(await say(engine, 'surrender')).toMatch(/They take \d+ baskets of peat of your load/)
    const left = engine.state.player.load!
    expect(left.qty).toBe(load.qty - Math.round(load.qty * 0.5))
    expect(left.pay).toBeLessThan(load.pay)
    // Delivered in Waagdam, paid from the town's purse.
    await say(engine, '@goto loc_waagdam_market')
    const stock = ledger(engine, 'waagdam').stock['peat'] ?? 0
    const purse = ledger(engine, 'waagdam').purse
    const money = engine.state.player.money
    expect(await say(engine, 'deliver')).toMatch(/You hand over \d+ baskets of peat. You are paid/)
    expect(ledger(engine, 'waagdam').stock['peat']).toBe(stock + left.qty)
    expect(engine.state.player.money).toBe(money + left.pay)
    expect(ledger(engine, 'waagdam').purse).toBe(purse - left.pay)
    expect(engine.state.player.load).toBeUndefined()
    expect(engine.state.news!.facts.at(-1)!.title).toMatch(/the stranger brought \d+ baskets of peat from Veenhoek/)
  }, 60_000)

  it('the toll gate on the Oostweg takes its due from a load, or goods when there is no money', async () => {
    const engine = new Engine(content, { seed: 101, builder: true })
    runUntil(engine, 15, 9)
    await say(engine, '@goto loc_waagdam_horse_mill')
    const load = () => (engine.state.player.load = { item: 'rye_grain', qty: 6, from: 'waagdam', to: 'zwolderkamp', route: 'zwolderkamp_oostweg', pay: 12, t: engine.world.now })
    load()
    engine.state.player.money = 20
    expect(await say(engine, 'east')).toMatch(/the Count's tollkeeper stops you and your load. You pay the toll/i)
    expect(engine.state.player.money).toBe(12)
    // Once only.
    await say(engine, 'west', 'east')
    expect(engine.state.player.money).toBe(12)
    await say(engine, 'west')
    load()
    engine.state.player.money = 0
    expect(await say(engine, 'east')).toMatch(/cannot pay the toll, so \d+ .* stays? behind/)
    expect(engine.state.player.load!.qty).toBeLessThan(6)
  }, 60_000)
})

describe('M9.1: a far place made playable', () => {
  async function toTheGate(engine: Engine) {
    runUntil(engine, 15, 8)
    engine.state.player.journal = { ...(engine.state.player.journal ?? {}), zwolderkamp: engine.world.now }
    await say(engine, '@goto loc_waagdam_east_gate')
  }

  it('Zwolderkamp: checked as content, fixed in the save, with its own ledger; the Oostweg keeps its id', async () => {
    const engine = new Engine(content, { seed: 102, builder: true })
    await toTheGate(engine)
    const out = await say(engine, 'travel to zwolderkamp')
    expect(engine.state.player.location).toBe('loc_zwolderkamp_gate')
    expect(out).toMatch(/You come to the gate of Zwolderkamp after 2 days on the road/)
    const far = engine.state.growth!.far!['zwolderkamp']!
    expect(far.by).toBe('template')
    // Content like any: the checks of loading pass, and every description keeps the rules.
    expect(checkContent(engine.content)).toEqual([])
    for (const raw of far.locations) {
      const text = String((raw['description'] as { day: string }).day)
      const n = text.split(/(?<=[.!?])\s+/).filter(Boolean).length
      expect(n, String(raw['id'])).toBeGreaterThanOrEqual(3)
      expect(n, String(raw['id'])).toBeLessThanOrEqual(5)
      expect(text).toMatch(/\byou\b/i)
    }
    expect(engine.content.areas.get('zwolderkamp')?.kind).toBe('town')
    expect(engine.content.settlements.has('zwolderkamp')).toBe(true)
    expect(engine.content.routes.get('zwolderkamp_oostweg')!.from).toBe('zwolderkamp')
    for (const raw of far.npcs) expect(engine.state.npcs[String(raw['id'])]).toBeDefined()
    // Its own ledger: its workshops make lamp oil, and the Oostweg carries it on to Waagdam.
    const oil = engine.state.economy!.ledgers['waagdam']!.last.came['lamp_oil'] ?? 0
    engine.tick(2 * DAY)
    expect(engine.state.economy!.ledgers['zwolderkamp']!.last.made['lamp_oil']).toBeGreaterThan(0)
    expect(engine.state.economy!.ledgers['waagdam']!.stock['lamp_oil']).toBeGreaterThan(0)
    void oil
    // The market sells what the League sends.
    await say(engine, 'in')
    expect(await say(engine, 'list')).toMatch(/lamp oil/i)
    // Fixed in the save.
    const loaded = Engine.fromSave(content, engine.save())
    expect(loaded.content.locations.get('loc_zwolderkamp_market')?.name).toBe(engine.content.locations.get('loc_zwolderkamp_market')?.name)
    loaded.tick(60)
    // And back the way you came.
    await say(engine, 'out')
    await say(engine, 'west')
    expect(engine.state.player.location).toBe('loc_waagdam_east_gate')
  }, 120_000)

  it('with a model the chronicler words it; the log plays back to the same world', async () => {
    const engine = new Engine(content, { seed: 103, builder: true, llm: new MockLlm('good') })
    await toTheGate(engine)
    await say(engine, 'travel to zwolderkamp')
    await engine.runModels()
    expect(await say(engine, 'travel to zwolderkamp')).toMatch(/The chronicler is working out the road to Zwolderkamp/)
    await engine.runModels()
    expect(await say(engine, 'travel to zwolderkamp')).toMatch(/You pass under the Lantern Gate of Zwolderkamp/)
    expect(engine.state.player.location).toBe('loc_zwolderkamp_gate')
    const far = engine.state.growth!.far!['zwolderkamp']!
    expect(far.by).toBe('chronicler')
    expect(far.npcs.map((n) => n['name'])).toEqual(['Wendel Hoorn', 'Aleid Kramer'])
    const replayed = await Engine.replay(content, 103, engine.save().log)
    expect(replayed.state.growth!.far).toEqual(engine.state.growth!.far)
    // Words that break the rules are not used: the template takes that place.
    const strict = new Engine(content, { seed: 104, builder: true, llm: new MockLlm('invalid') })
    await toTheGate(strict)
    for (let i = 0; i < 3; i++) {
      await say(strict, 'travel to zwolderkamp')
      await strict.runModels()
    }
    const gate = strict.state.growth!.far!['zwolderkamp']!.locations[0]!
    expect((gate['description'] as { day: string }).day).toMatch(/You come to the gate of Zwolderkamp/)
  }, 120_000)

  it('a load of rye carried to Zwolderkamp pays the toll at the gate on the way', async () => {
    const engine = new Engine(content, { seed: 105, builder: true })
    await toTheGate(engine)
    await say(engine, 'travel to zwolderkamp')
    await say(engine, 'west', '@goto loc_waagdam_market')
    engine.state.economy!.ledgers['waagdam']!.stock['rye_grain'] = 9000
    expect(await say(engine, 'loads')).toMatch(/sacks of rye to Zwolderkamp/)
    await say(engine, 'haul rye to zwolderkamp', '@goto loc_waagdam_horse_mill')
    engine.state.player.money = 50
    expect(await say(engine, 'east')).toMatch(/You pay the toll/)
    await say(engine, 'east', 'in')
    expect(await say(engine, 'deliver')).toMatch(/You are paid/)
  }, 120_000)
})

describe('M9.1: a change of rank', () => {
  /** The wall of Waagdam is finished: the fact the projects make, and what built reads. */
  function wallDone(engine: Engine) {
    const g = (engine.state.growth ??= { people: [], projects: {}, hands: {} })
    g.projects['waagdam_wall'] = { settlement: 'waagdam', started: engine.world.now - 20 * DAY, days: 20, used: { brick: 300 }, paid: 0, invested: {}, done: engine.world.now }
    engine.world.regrow()
    recordFact(engine.world, { kind: 'project', about: ['waagdam'], place: 'loc_waagdam_market', belang: 3, claim: { subject: 'waagdam_wall', key: 'project', value: 'done' }, title: 'the wall finished', text: { precise: 'p', village: 'v', far: 'f' } })
  }

  it('once the wall stands, the mayor asks the Count for town rights; he decides, and the world notices', async () => {
    for (let seed = 1; seed < 20; seed++) {
      const engine = new Engine(content, { seed, builder: true })
      runUntil(engine, 15, 9)
      const open = frictionOpenness(engine)
      const purse = () => engine.state.economy!.ledgers['waagdam']!.purse
      engine.state.economy!.ledgers['waagdam']!.purse = 1000
      wallDone(engine)
      engine.tick(60)
      const plan = engine.state.plans!.find((p) => p.plan === 'aftermath:town_rights')
      expect(plan).toBeDefined()
      expect(engine.state.npcs['npc_aleid']!.note?.activity).toMatch(/Graafhaven/)
      for (let d = 0; d < 9; d++) engine.tick(DAY)
      if (engine.content.areas.get('waagdam')!.kind !== 'city') {
        // No: the Count's word, and the town stays a town.
        expect(engine.state.news!.facts.some((f) => f.title === 'the Count said no to Waagdam')).toBe(true)
        continue
      }
      const fact = engine.state.news!.facts.find((f) => f.kind === 'rank')!
      expect(fact.belang).toBe(4)
      expect(fact.claim).toEqual({ subject: 'waagdam', key: 'rank', value: 'city' })
      expect(purse()).toBeLessThan(1000)
      expect(engine.state.flags!['waagdam_city']).toBe(true)
      // The world notices: more open, a city in conditions, the charter on the Waag, and the save keeps it.
      expect(frictionOpenness(engine)).toBeGreaterThan(open)
      expect(characterOf(engine.world, 'waagdam')).toContain('city')
      await say(engine, '@goto loc_waagdam_market')
      expect(await say(engine, 'look')).toMatch(/Waagdam is a city now/)
      expect(Engine.fromSave(content, engine.save()).content.areas.get('waagdam')!.kind).toBe('city')
      // And no second plan once it is a city.
      wallDone(engine)
      engine.tick(60)
      expect(engine.state.plans!.filter((p) => p.plan === 'aftermath:town_rights')).toHaveLength(1)
      return
    }
    throw new Error('the Count never said yes')
  }, 240_000)

  it('without the money for the charter, the answer is no', () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    runUntil(engine, 15, 9)
    wallDone(engine)
    engine.tick(60)
    engine.state.economy!.ledgers['waagdam']!.purse = 0
    for (let d = 0; d < 9; d++) {
      engine.state.economy!.ledgers['waagdam']!.purse = 0
      engine.tick(DAY)
    }
    expect(engine.content.areas.get('waagdam')!.kind).toBe('town')
    expect(engine.state.news!.facts.some((f) => f.title === 'the Count said no to Waagdam')).toBe(true)
  }, 120_000)
})

function frictionOpenness(engine: Engine): number {
  return openness(engine.world, 'loc_waagdam_market')
}

describe('M9.1: a place a project made, adopted into the world', () => {
  it('keeps its id: the old save and a new game have the same place, and the way in', async () => {
    const engine = new Engine(content, { seed: 61, builder: true })
    engine.tick(60)
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'raids')
    for (let d = 0; d < 30 && !engine.state.growth?.projects['waagdam_brickworks']?.done; d++) engine.tick(DAY)
    expect(engine.state.growth!.projects['waagdam_brickworks']!.done).toBeDefined()
    const save = engine.save()
    const files = await readContentFiles(root)
    const project = entities(files, 'project').find((e) => e.id === 'waagdam_brickworks')!
    const from = entities(files, 'location').find((e) => e.id === 'loc_waagdam_harbour')!
    const adopted = edited(files, ...adoptPlaceEdits(project.raw, from.raw))
    const c = adopted.content!
    expect(c.locations.get('loc_waagdam_brickworks')).toBeDefined()
    expect(c.locations.get('loc_waagdam_harbour')!.exits.south?.to).toBe('loc_waagdam_brickworks')
    expect(c.projects.get('waagdam_brickworks')!.place).toBeUndefined()
    // The old save: the same place, from the world now.
    const loaded = Engine.fromSave(c, save)
    expect(loaded.content.locations.get('loc_waagdam_brickworks')).toBe(c.locations.get('loc_waagdam_brickworks'))
    loaded.tick(DAY)
    loaded.state.player.location = 'loc_waagdam_harbour'
    expect(await say(loaded, 'south')).toMatch(/brickworks/i)
    // A new game has it from the start.
    expect(new Engine(c, { seed: 1 }).world.location('loc_waagdam_harbour').exits.south?.to).toBe('loc_waagdam_brickworks')
    // Once in the world, adopting again is refused.
    expect(applyEdits(adopted.files, adoptPlaceEdits(project.raw, from.raw)).problems.join(' ')).toMatch(/already a location with this id/)
  }, 120_000)
})

describe('M9.1: nameless groups', () => {
  it('refugees in the church are a number, not people; whom the player speaks to gets a name and a card', async () => {
    const engine = new Engine(content, { seed: 106, builder: true })
    runUntil(engine, 15, 9)
    const people = Object.keys(engine.state.npcs).length
    for (let i = 0; i < 4; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'raids')
    for (let h = 0; h < 48 && !engine.state.crowds?.length; h++) engine.tick(60)
    const crowd = engine.state.crowds!.find((c) => c.name === 'refugees from the eastern border')!
    expect(crowd.count).toBe(18)
    // No simulation per person: nobody new in the world.
    expect(Object.keys(engine.state.npcs)).toHaveLength(people)
    await say(engine, '@goto loc_waagdam_church')
    expect(await say(engine, 'look')).toMatch(/Some 20 refugees from the eastern border are here/)
    await say(engine, 'talk to a refugee')
    expect(crowd.count).toBe(17)
    const id = crowd.named[0]!
    const card = engine.content.npcs.get(id)!
    expect(card.profession).toBe('labourer')
    expect(card.public_facts[0]).toMatch(/one of the refugees from the eastern border, from the Nethermarch/)
    expect(engine.state.talk?.npc).toBe(id)
    expect(Object.keys(engine.state.npcs)).toHaveLength(people + 1)
    await say(engine, 'bye')
    // The same person next time, by name.
    await say(engine, `talk ${card.name.split(' ')[0]!.toLowerCase()}`)
    expect(engine.state.talk?.npc).toBe(id)
    expect(crowd.count).toBe(17)
    await say(engine, 'bye')
    // The save keeps them.
    const loaded = Engine.fromSave(content, engine.save())
    expect(loaded.content.npcs.get(id)?.name).toBe(card.name)
    expect(loaded.state.crowds!.find((c) => c.id === crowd.id)!.count).toBe(17)
    // After three weeks the group breaks up, and the one with a name goes with it.
    for (let d = 0; d < 22; d++) engine.tick(DAY)
    expect(engine.state.npcs[id]!.absent).toBe(true)
    expect(await say(engine, 'look')).not.toMatch(/refugees from the eastern border are here/)
  }, 120_000)

  it('workers at the wall while it is built', () => {
    const engine = new Engine(content, { seed: 107, builder: true })
    engine.tick(60)
    const g = (engine.state.growth ??= { people: [], projects: {}, hands: {} })
    g.projects['waagdam_brickworks'] = { settlement: 'waagdam', started: 0, days: 10, used: {}, paid: 0, invested: {}, done: engine.world.now }
    engine.world.regrow()
    expect(startProject(engine.world, 'waagdam_wall')).toBe(true)
    expect(crowdsAt(engine.world, 'loc_waagdam_west_gate').map((c) => [c.name, c.count])).toEqual([['wall workers', 30]])
  })
})

describe('M9.1: years later, as legend', () => {
  function oldGame() {
    const engine = new Engine(content, { seed: 108 })
    engine.state.player.character = { ...(createCharacter(content, suggestChoice(content, 'warden', 'Joost')) as { character: NonNullable<typeof engine.state.player.character> }).character }
    ;(engine.state.chronicle ??= { seq: 0, lines: [], lore: [], news: {}, pending: [], runs: 0 }).lore.push({
      id: 'chr_lore_1',
      name: "Mirte's drowned oven",
      summary: 'Mirte Bakker and Joost pulled Harmen out of the Blackmere the night the dyke broke.',
      details: 'Harmen still owes Joost a sack of flour, Mirte says.',
      story: 'The water came over the green. Mirte and Joost went in after Harmen with a rope. Wendela rang the bell all night.',
      far: 'Folk in Veenhoek say a stranger saved the miller from the water.',
      teller: 'npc_mirte',
      fame: 4,
      place: 'loc_veenhoek_green',
      line: 'line_1',
      facts: ['fact_1'],
      links: ['npc_harmen'],
      t: 100,
      by: 'template',
    })
    return engine.save()
  }

  it('a new game tells the old one as legends of the stranger, without the names of the living', async () => {
    const { engine, outputs } = await Engine.legend(content, oldGame(), 7)
    expect(outputs.map((o) => o.text).join('\n')).toMatch(/Years have gone by/)
    const legend = engine.state.chronicle!.lore.find((l) => l.by === 'legend')!
    const text = [legend.name, legend.summary, legend.details, legend.story, legend.far].join(' ')
    expect(namesTheLiving(text, livingNames(content))).toBeUndefined()
    expect(text).not.toMatch(/Joost/)
    expect(legend.summary).toMatch(/^Years ago, they say: the baker and the stranger pulled the miller out of the Blackmere/)
    expect(legend.facts).toEqual([])
    // A new world: everyone is alive and at the start; only the stories remain.
    expect(engine.state.news?.facts.length ?? 0).toBe(new Engine(content, { seed: 7 }).state.news?.facts.length ?? 0)
    // The old know it best, and those who live near where it happened.
    engine.status()
    const who = await say(engine, `@who-knows ${legend.name}`)
    void who
    const knowledge = new Knowledge(engine.world, (engine as unknown as { topics: TopicRegistry }).topics)
    expect(knowledge.level('npc_aaltje', legend.id)).toBe(3)
    expect(knowledge.level('npc_mirte', legend.id)).toBe(2)
    // The log plays back to the same legends.
    const replayed = await Engine.replay(content, 7, engine.save().log)
    expect(replayed.state.chronicle!.lore).toEqual(engine.state.chronicle!.lore)
  })

  it('the chronicler retells them; a living name that slips through is not used', async () => {
    const told = await Engine.legend(content, oldGame(), 7, new MockLlm('good'))
    expect(told.engine.state.chronicle!.lore[0]!.name).toBe('the stranger and the drowned bell')
    const slipped = await Engine.legend(content, oldGame(), 7, new MockLlm('invent'))
    expect(slipped.engine.state.chronicle!.lore[0]!.summary).toMatch(/^Years ago, they say: the baker/)
  })
})

describe('M9.1: rules for Skerrow', () => {
  it('a character of the island, and a fight on the cliff path at night', async () => {
    const isle = loadContent(await readContentFiles(root, 'isle'))
    // The ready-made castaway, and a character of one's own.
    const engine = new Engine(isle, { seed: 110, builder: true })
    engine.start()
    expect(engine.status().character).toBeDefined()
    expect(await say(engine, 'sheet')).toMatch(/Castaway, Islander Knave/)
    expect(await say(engine, 'create shieldhand mainlander castaway name=Kerra')).toMatch(/You are Kerra, a Mainlander Shieldhand, once a castaway sailor/)
    expect(engine.state.player.inventory['ring_shirt']).toBe(1)
    // The patrons are the island's faiths.
    expect(isle.rules!.patrons.map((p) => p.id)).toEqual(['tidemother', 'old_stars'])
    // At night the wreckers are out on the cliff path.
    let fought = false
    for (let seed = 110; seed < 160 && !fought; seed++) {
      const e = new Engine(isle, { seed, builder: true })
      e.start()
      await say(e, 'create shieldhand mainlander castaway name=Kerra')
      runUntilIn(e, 22)
      e.state.player.location = 'loc_skerrow_wreck_strand'
      const out = await say(e, 'north')
      if (!e.state.combat) continue
      expect(out).toMatch(/A shuttered lamp opens on the path ahead/)
      expect(out).toMatch(/Two silver, stranger/)
      await say(e, 'refuse')
      for (let i = 0; i < 60 && e.state.combat && !e.state.combat.over; i++) {
        const fight = e.status().combat!
        await say(e, fight.fighters.some((f) => f.side === 'foes' && f.reachable) ? 'strike' : fight.actions > 0 ? 'advance' : 'end')
      }
      expect(e.state.news!.facts.some((f) => /wrecker/i.test(f.title))).toBe(true)
      fought = true
    }
    expect(fought).toBe(true)
  }, 120_000)

  it('stays within the agreed margins over 1,000 fights per class', async () => {
    const isle = loadContent(await readContentFiles(root, 'isle'))
    const reports = balanceReport(isle, 1000)
    expect(reports.map((r) => r.class)).toEqual(['shieldhand', 'harpooner', 'knave', 'witch', 'runecaster', 'tidecaller'])
    expect(marginProblems(reports)).toEqual([])
  }, 240_000)
})

/** On to an hour of the first night on Skerrow. */
function runUntilIn(engine: Engine, hour: number): void {
  const now = new GameClock(engine.world.now).parts
  const minutes = ((hour - now.hour + 24) % 24) * 60 - now.minute
  if (minutes > 0) engine.tick(minutes)
}
