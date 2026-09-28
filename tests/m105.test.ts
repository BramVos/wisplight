import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { CRAFT_RANKS } from '../src/engine/content'
import { craftBonus, craftProgress, interruption, MASTERED, recipeTier } from '../src/engine/crafts'
import { relation } from '../src/engine/dialogue/relations'
import { tieTo } from '../src/engine/people'
import { lockDc } from '../src/engine/social/access'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.5 (docs/ROADMAP.md), part A: crafts and the deeds of the
// other skills. A craft grows by doing and from a master, the difficulty
// belongs to the world, and a rank is more than a bonus.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const DAY = 24 * 60

function stay(engine: Engine, npcId: string, location: string, minutes = 600): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + minutes
  s.plan = []
}

/** The next checks roll these on the d20; everything else rolls as it would. */
function rolls(engine: Engine, ...values: number[]): void {
  const rng = engine.world.rng
  const real = rng.d20.bind(rng)
  rng.d20 = (stream = 'dice') => (stream === 'checks' && values.length ? values.shift()! : real(stream))
}

/** A baker's apprentice in the making: a character, Mirte at her oven, flour and peat. */
async function atTheOven(seed = 7): Promise<Engine> {
  const engine = new Engine(content, { seed })
  await engine.handle('create warden heathborn peat_cutter name=Joost')
  const world = engine.world
  world.state.player.location = 'loc_bakery_yard'
  stay(engine, 'npc_mirte', 'loc_bakery_yard', 3 * DAY)
  world.state.player.inventory['flour'] = 20
  world.state.player.inventory['peat'] = 20
  world.state.player.money = 500
  return engine
}

describe('M10.5: crafts are content', () => {
  it('every trade of the ledger has a craft with four ranks, and every recipe names its craft, technique and difficulty', () => {
    expect(CRAFT_RANKS).toEqual(['novice', 'journeyman', 'expert', 'master'])
    for (const id of ['baking', 'milling', 'peat_cutting', 'eel_fishing', 'coopering', 'brickmaking', 'smithing']) expect(content.crafts.has(id), id).toBe(true)
    expect([...isle.crafts.keys()].sort()).toEqual(['fishing', 'salve_making'])
    for (const c of [content, isle]) {
      for (const type of c.objectTypes.values()) {
        for (const a of type.affordances.filter((x) => x.craft)) {
          expect(a.check?.dc, `${type.id}:${a.id}`).toBeGreaterThan(0)
          expect(a.technique, `${type.id}:${a.id}`).toBeTruthy()
        }
      }
    }
    // The oven stays the baker's for the simulation: the stranger's recipes are their own.
    expect(content.objectTypes.get('bread_oven')!.affordances.find((a) => a.id === 'bake_bread')!.actors).toEqual(['npc'])
    expect(recipeTier(10)).toBe(0)
    expect(recipeTier(14)).toBe(1)
    expect(recipeTier(19)).toBe(2)
    expect(recipeTier(22)).toBe(3)
  })

  it('USE OVEN BAKE is a check at baking: bread and practice when it goes well, the flour gone when it does not', async () => {
    const engine = await atTheOven()
    const world = engine.world
    rolls(engine, 15)
    const out = said(await engine.handle('use oven bake'))
    expect(out).toMatch(/Mirte wipes her hands\. "Go on, then\. Mind you leave it as you found it\." You pay Mirte 2/)
    expect(out).toMatch(/\(Crafting \d+ vs DC 10: success\)/)
    expect(out).toMatch(/You have 6 loaves of rye bread\./)
    expect(world.state.player.inventory['rye_bread']).toBe(6)
    expect(world.state.player.inventory['flour']).toBe(19)
    const p = craftProgress(world, 'baking')
    expect(p.practice).toBe(1)
    expect(p.techniques).toEqual(['rye_loaf'])
    // The leave holds for the day: no second fee.
    const money = world.state.player.money
    rolls(engine, 1)
    const bad = said(await engine.handle('use oven bake'))
    expect(bad).not.toMatch(/You pay/)
    expect(bad).toMatch(/critical failure|failure/)
    expect(bad).toMatch(/wasted|gone/)
    expect(world.state.player.inventory['flour']).toBe(18)
    expect(world.state.player.inventory['rye_bread']).toBe(6)
    expect(world.state.player.money).toBe(money)
  })

  it("someone's workplace takes their leave: not without them, not when they are cold, not while they use it", async () => {
    const engine = await atTheOven()
    const world = engine.world
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    expect(said(await engine.handle('use oven bake'))).toMatch(/That is Mirte's bread oven\. Ask first; there is nobody here to ask\./)
    stay(engine, 'npc_mirte', 'loc_bakery_yard')
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: -60, trust: -40 })
    expect(said(await engine.handle('use oven bake'))).toMatch(/Mirte shakes her head\. "Not my bread oven\. Not for you\."/)
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 0, trust: 0 })
    world.state.npcs['npc_mirte']!.pending = { objectKey: 'loc_bakery_yard/oven' }
    expect(said(await engine.handle('use oven bake'))).toMatch(/"Not now\. Can't you see I'm using it\?"/)
    expect(world.state.player.inventory['flour']).toBe(20)
  })

  it('work stops when something comes between: half done, nothing is lost', async () => {
    const engine = await atTheOven()
    const world = engine.world
    // Someone else sets to work at the oven: the stranger is shooed off.
    stay(engine, 'npc_jan_visser', 'loc_bakery_yard')
    world.state.npcs['npc_jan_visser']!.pending = { objectKey: 'loc_bakery_yard/oven' }
    expect(interruption(world, 'loc_bakery_yard', world.location('loc_bakery_yard').objects[0]!)).toMatch(/Jan needs the bread oven and shoos you off it\./)
    const out = said(await engine.handle('use oven bake'))
    expect(out).toMatch(/Jan needs the bread oven and shoos you off it\./)
    expect(out).toMatch(/You stop baking rye loaves\. Nothing is lost/)
    expect(world.state.player.inventory['flour']).toBe(20)
    expect(craftProgress(world, 'baking').practice).toBe(0)
  })

  it('routine teaches the basics and then nothing; a bad failure is a lesson; never more than the day allows', async () => {
    const engine = await atTheOven()
    const world = engine.world
    rolls(engine, ...Array(MASTERED + 1).fill(15))
    for (let i = 0; i < MASTERED; i++) await engine.handle('use oven bake')
    const p = craftProgress(world, 'baking')
    expect(p.practice).toBe(MASTERED)
    // The day's limit (five) is reached: the next success teaches nothing today.
    expect(said(await engine.handle('use oven bake'))).toMatch(/routine for you now|enough to learn in baking for one day/)
    expect(p.practice).toBe(MASTERED)
    // The next day, rye loaves are routine: mastered, and no harder than a novice's work.
    world.state.minutes += DAY
    rolls(engine, 15)
    expect(said(await engine.handle('use oven bake'))).toMatch(/Baking rye loaves is routine for you now: it no longer teaches you anything\./)
    expect(p.practice).toBe(MASTERED)
    // A harder recipe teaches; a critical failure is a lesson.
    world.state.player.inventory['apple'] = 12
    rolls(engine, 18, 1)
    await engine.handle('use oven bake apple cake')
    expect(p.practice).toBe(MASTERED + 1)
    expect(p.techniques).toContain('sweet_dough')
    expect(said(await engine.handle('use oven bake apple cake'))).toMatch(/It went badly, but you see now what you did wrong\./)
    expect(p.practice).toBe(MASTERED + 2)
  })

  it('journeyman on practice; expert asks for a second technique; master for a masterwork, which only an expert may make', async () => {
    const engine = await atTheOven()
    const world = engine.world
    const p = craftProgress(world, 'baking')
    world.state.player.inventory['apple'] = 40
    world.state.player.inventory['milk'] = 5
    // Feast bread is an expert's work.
    expect(said(await engine.handle('use oven bake feast bread'))).toMatch(/Baking a feast bread is work for an expert baker\. You are a novice baker\./)
    p.practice = 9
    p.recipes['bread_oven:bake_rye'] = 1
    rolls(engine, 15)
    const up = said(await engine.handle('use oven bake'))
    expect(up).toMatch(/You are a journeyman baker now\./)
    expect(p.rank).toBe(1)
    // The village hears of it, and the baker has it on her mind.
    expect(world.state.news!.facts.some((f) => f.kind === 'craft_rank' && f.claim?.value === 'a journeyman baker')).toBe(true)
    expect(engine.state.signals!.queue.concat(engine.state.signals!.log).some((s) => s.kind === 'craft_rank' && s.who.includes('npc_mirte'))).toBe(true)
    engine.tick(60)
    expect(world.state.npcs['npc_mirte']!.thoughts?.some((t) => /The stranger is a journeyman baker now/.test(t.text))).toBe(true)
    // Thirty practice with one technique is not expert yet.
    p.practice = 40
    p.techniques = ['rye_loaf']
    p.today = undefined
    world.state.minutes += DAY
    rolls(engine, 15)
    await engine.handle('use oven bake')
    expect(p.rank).toBe(1)
    rolls(engine, 18)
    expect(said(await engine.handle('use oven bake apple cake'))).toMatch(/You are an expert baker now\./)
    // Past a hundred practice, master waits for the masterwork.
    p.practice = 120
    p.today = undefined
    world.state.minutes += DAY
    rolls(engine, 17)
    const master = said(await engine.handle('use oven bake feast bread'))
    expect(master).toMatch(/You have a feast bread\./)
    expect(master).toMatch(/You are a master baker now\./)
    expect(p.masterwork).toBe('baking a feast bread')
    expect(engine.page('sheet')?.lines.join('\n')).toMatch(/Craft: Baking: master \(rye loaves, sweet dough, feast bread\)\. Masterwork: baking a feast bread\./)
  })

  it('a hard commission, made by the stranger and brought to who asked for it, counts as a masterwork', async () => {
    const engine = await atTheOven()
    const world = engine.world
    const p = craftProgress(world, 'baking')
    Object.assign(p, { rank: 2, practice: 120, techniques: ['rye_loaf', 'sweet_dough'] })
    world.state.player.inventory['apple'] = 10
    world.state.player.inventory['milk'] = 2
    const { openRequest } = await import('../src/engine/requests')
    openRequest(world, { npc: 'npc_mirte', kind: 'fetch', item: 'feast_bread', source: 'motor' })
    // Bought or given, it would not count: made by the stranger's own hand it does.
    rolls(engine, 17)
    await engine.handle('use oven bake feast bread')
    p.masterwork = undefined
    p.rank = 2
    const { fulfil } = await import('../src/engine/requests')
    fulfil(world, 'npc_mirte', 'feast_bread', 1)
    expect(p.masterwork).toBe('feast bread for Mirte')
    expect(p.rank).toBe(3)
  })

  it("the craft's rank counts once it is higher than the skill it leans on", async () => {
    const engine = await atTheOven()
    const world = engine.world
    const craft = content.crafts.get('baking')!
    const plain = craftBonus(world, craft)
    craftProgress(world, 'baking').rank = 2
    const skillRank = world.state.player.character!.ranks['crafting'] ?? 0
    expect(craftBonus(world, craft)).toBe(plain + Math.max(0, 2 - skillRank) * 2)
  })

  it("the stranger's own work fetches more, by their rank", async () => {
    const engine = await atTheOven()
    const world = engine.world
    rolls(engine, 15)
    await engine.handle('use oven bake')
    const sell = async (rank: number) => {
      craftProgress(world, 'baking').rank = rank
      craftProgress(world, 'baking').made = { rye_bread: 2 }
      world.state.player.inventory['rye_bread'] = 2
      world.state.player.location = 'loc_goose_common'
      stay(engine, 'npc_trijntje', 'loc_goose_common')
      world.state.npcs['npc_trijntje']!.money = 1000
      const before = world.state.player.money
      const out = said(await engine.handle('sell 2 bread'))
      return { out, got: world.state.player.money - before }
    }
    const novice = await sell(0)
    const master = await sell(3)
    expect(master.got).toBeGreaterThan(novice.got)
    expect(master.out).toMatch(/good work, and worth a little more/)
  })

  it('Busy Hands, the blessing of Mother Holle, makes craft work a quarter shorter', async () => {
    const time = async (blessed: boolean) => {
      const engine = await atTheOven()
      const c = engine.state.player.character!
      if (blessed) c.patron = { id: 'holle', favour: 30, since: 0 }
      rolls(engine, 15)
      const start = engine.world.now
      await engine.handle('use oven bake')
      return engine.world.now - start
    }
    const plain = await time(false)
    const quick = await time(true)
    expect(quick).toBeLessThan(plain)
    expect(quick).toBeGreaterThanOrEqual(Math.round(90 * 0.75))
  })

  it('work of a craft is practice in it: a day at the peat cuttings', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create warden heathborn peat_cutter name=Joost')
    const world = engine.world
    // Peat is cut in summer.
    while (new (await import('../src/engine/clock')).GameClock(world.now).parts.month !== 7) world.state.minutes += 7 * DAY
    world.state.player.location = 'loc_peat_cuttings'
    rolls(engine, 15)
    const out = said(await engine.handle('work'))
    expect(out).toMatch(/\(Athletics \d+ vs DC 10: (success|critical success)\)/)
    expect(craftProgress(world, 'peat_cutting').practice).toBe(1)
  })
})

describe('M10.5: learning from a master', () => {
  it('a baker who trusts the stranger teaches baking for a few hours: practice, a new technique, the tie, and her oven for the day', async () => {
    const engine = await atTheOven()
    const world = engine.world
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 30, trust: 30, familiarity: 40 })
    await engine.handle('talk mirte')
    const start = world.now
    const out = said(await engine.handle('Could you teach me to bake?'))
    expect(out).toMatch(/Mirte takes you through baking step by step[\s\S]*You learn rye loaves\./)
    expect(out).toMatch(/Baking: practice 4\. You are Mirte's pupil now, and may use the bread oven today\./)
    expect(world.now - start).toBeGreaterThanOrEqual(180)
    expect(engine.state.talk).toBeUndefined()
    expect(tieTo(world, 'npc_mirte', 'player')?.role).toBe('pupil')
    expect(tieTo(world, 'npc_mirte', 'player')?.kind).toBe('teaching')
    // A pupil may use the master's oven when she is not there, for nothing.
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    world.state.minutes += DAY
    const money = world.state.player.money
    rolls(engine, 15)
    expect(said(await engine.handle('use oven bake'))).toMatch(/You have 6 loaves of rye bread\./)
    expect(world.state.player.money).toBe(money)
  })

  it('a craftsman who does not know the stranger will not teach them', async () => {
    const engine = await atTheOven()
    await engine.handle('talk mirte')
    const out = said(await engine.handle('Could you teach me to bake?'))
    expect(out).not.toMatch(/You are Mirte's pupil now/)
    expect(craftProgress(engine.world, 'baking').practice).toBe(0)
  })
})

describe('M10.5: the deeds of the other skills', () => {
  it("PICK opens a lock quietly with something thin; a bad slip jams it; the lock's difficulty is its own", async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create rascal changeling smuggler name=Tijl')
    const world = engine.world
    world.state.player.location = 'loc_waagdam_graanhandel'
    world.state.player.inventory = {}
    for (const id of Object.keys(world.state.npcs)) if (world.state.npcs[id]!.location === 'loc_waagdam_graanhandel') world.state.npcs[id]!.location = 'loc_waagdam_market'
    expect(said(await engine.handle('pick strongbox'))).toMatch(/nothing thin and stiff enough/)
    world.state.player.inventory['iron_nails'] = 1
    rolls(engine, 20)
    const out = said(await engine.handle('pick strongbox'))
    expect(out).toMatch(/\(Thievery \d+ vs DC 18: (success|critical success)\)/)
    expect(out).toMatch(/It gives with a small click\./)
    expect(said(await engine.handle('open strongbox'))).toMatch(/In Lubbert's strongbox: 2 skeins? of yarn|In Lubbert's strongbox:/)
    // A lock of its own: a crude wooden lock is simple for anyone, a masterwork of brass hard for everyone.
    expect(lockDc(world, { quality: 'crude', material: 'wood' }, 'pick')).toBeLessThan(lockDc(world, { quality: 'masterwork', material: 'brass' }, 'pick'))
    expect(lockDc(world, { quality: 'common', material: 'wood' }, 'force')).toBeLessThan(lockDc(world, { quality: 'common', material: 'iron' }, 'force'))
    // A jammed lock: only the key or force.
    delete world.state.locks!['object:loc_waagdam_graanhandel/strongbox']
    rolls(engine, 1)
    expect(said(await engine.handle('pick strongbox'))).toMatch(/It is jammed now\./)
    expect(said(await engine.handle('pick strongbox'))).toMatch(/is jammed\. Only its key, or force, will open it now\./)
    // PICK <thing> is still taking it.
    world.state.ground[world.state.player.location] = { apple: 1 }
    expect(said(await engine.handle('pick apple'))).toMatch(/You pick up an apple\./)
  })

  it('TREAT: Medicine against fen fever with herbs, and a neighbour in bed with a fever', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create herbalist fenfolk herb_apprentice name=Aal')
    const world = engine.world
    const c = world.state.player.character!
    c.conditions['fen_fever'] = 2
    world.state.player.inventory['herbs'] = 2
    rolls(engine, 15)
    const self = said(await engine.handle('treat me'))
    expect(self).toMatch(/\(Medicine \d+ vs DC 13: success\)/)
    expect(c.conditions['fen_fever']).toBeUndefined()
    expect(world.state.player.inventory['herbs']).toBe(1)
    stay(engine, 'npc_mirte', world.state.player.location)
    world.state.npcs['npc_mirte']!.sickUntil = world.now + 3 * DAY
    const before = relation(engine.state, 'npc_mirte').affinity
    rolls(engine, 16)
    expect(said(await engine.handle('treat mirte'))).toMatch(/By evening it will break\./)
    expect(world.state.npcs['npc_mirte']!.sickUntil).toBeLessThanOrEqual(world.now + 6 * 60)
    expect(relation(engine.state, 'npc_mirte').affinity).toBeGreaterThan(before)
    expect(world.state.news!.facts.some((f) => f.kind === 'tended' && f.about.includes('npc_mirte'))).toBe(true)
  })

  it('GATHER: herbs where the fen is, once a day; gleaning only in harvest', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create poacher fenfolk peat_cutter name=Wout')
    const world = engine.world
    world.state.player.location = 'loc_peat_cuttings'
    rolls(engine, 15)
    expect(said(await engine.handle('gather herbs'))).toMatch(/bog myrtle[\s\S]*You have \w+/)
    expect(world.state.player.inventory['herbs']).toBeGreaterThanOrEqual(1)
    expect(said(await engine.handle('gather'))).toMatch(/You have taken what there is to take here today\./)
    world.state.player.location = 'loc_veenhoek_green'
    expect(said(await engine.handle('gather'))).toMatch(/There is nothing here to gather by hand\./)
    world.state.player.location = 'loc_molenend_field'
    expect(said(await engine.handle('gather'))).toMatch(/Not in \w+: there is no/)
  })

  it('TRACK: which way someone went from here, while the trail is fresh', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create poacher fenfolk peat_cutter name=Wout')
    const world = engine.world
    world.state.player.location = 'loc_veenhoek_green'
    const mirte = world.state.npcs['npc_mirte']!
    mirte.location = 'loc_veenhoek_bakery'
    mirte.left = { location: 'loc_veenhoek_green', t: world.now - 30 }
    rolls(engine, 18)
    const out = said(await engine.handle('track mirte'))
    expect(out).toMatch(/\(Survival \d+ vs DC \d+: success\)/)
    expect(out).toMatch(/Mirte went \w+, towards The Bakery|Mirte went \w+, towards/)
    mirte.left = { location: 'loc_veenhoek_quay', t: world.now - 30 }
    expect(said(await engine.handle('track mirte'))).toMatch(/You find no sign that Mirte passed this way lately\./)
  })

  it('SEARCH finds what lies hidden, once: the dry ridge at the cuttings, a cask of oil on the strand', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create poacher fenfolk peat_cutter name=Wout')
    const world = engine.world
    world.state.player.location = 'loc_peat_cuttings'
    rolls(engine, 5)
    expect(said(await engine.handle('search'))).toMatch(/find nothing out of the ordinary/)
    rolls(engine, 19)
    expect(said(await engine.handle('search'))).toMatch(/The dry ridge, it must be/)
    expect(world.state.player.journal?.['the_dry_ridge']).toBeDefined()
    rolls(engine, 19)
    expect(said(await engine.handle('search'))).toMatch(/nothing more to find here/)
    const island = new Engine(isle, { seed: 7 })
    await island.handle('create warden changeling lamp_hand name=Bryn')
    rolls(island, 18)
    expect(said(await island.handle('search'))).toMatch(/Lamp oil, by the smell of the bung\./)
    expect(island.world.state.ground['loc_skerrow_wreck_strand']?.['lamp_oil']).toBeGreaterThanOrEqual(2)
  })

  it('READ an inscription: Lore against the worn letters, and what it is about goes in the journal', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create lanternbearer dykelander lantern_novice name=Brand')
    const world = engine.world
    world.state.player.location = 'loc_veenhoek_chapel'
    delete world.state.player.journal?.['saint_brand']
    rolls(engine, 15)
    const out = said(await engine.handle('read altar'))
    expect(out).toMatch(/Brand kept the light, and the drowned came home\./)
    expect(world.state.player.journal?.['saint_brand']).toBeDefined()
    // Reading a person is still INSIGHT.
    stay(engine, 'npc_mirte', 'loc_veenhoek_chapel')
    expect(said(await engine.handle('read mirte'))).not.toMatch(/Brand kept the light/)
    const island = new Engine(isle, { seed: 7 })
    await island.handle('create warden changeling lamp_hand name=Bryn')
    island.world.state.player.location = 'loc_skerrow_mage_tower'
    rolls(island, 5)
    expect(said(await island.handle('read waystone'))).toMatch(/The runes of Aldmar crawl round the ring[\s\S]*can't make them out/)
    rolls(island, 20)
    expect(said(await island.handle('read runes'))).toMatch(/one word over and over\. Key\./)
  })

  it('both worlds have fixed uses for the skills in their content', () => {
    for (const [c, min] of [
      [content, { forage: 4, hidden: 2, inscriptions: 3, recipes: 10 }],
      [isle, { forage: 3, hidden: 2, inscriptions: 1, recipes: 2 }],
    ] as const) {
      const locations = [...c.locations.values()]
      expect(locations.filter((l) => l.forage.length).length, c.world.name).toBeGreaterThanOrEqual(min.forage)
      expect(locations.flatMap((l) => l.hidden).length, c.world.name).toBeGreaterThanOrEqual(min.hidden)
      expect([...c.objectTypes.values()].filter((t) => t.inscription).length, c.world.name).toBeGreaterThanOrEqual(min.inscriptions)
      expect([...c.objectTypes.values()].flatMap((t) => t.affordances.filter((a) => a.craft && a.actors.includes('player'))).length, c.world.name).toBeGreaterThanOrEqual(min.recipes)
      expect(locations.some((l) => l.objects.some((o) => o.lock)), c.world.name).toBe(true)
    }
  })
})
