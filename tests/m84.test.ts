import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editorView, Engine, loadContent, MockLlm, type Content, type SaveData } from '../src/engine'
import { openness } from '../src/engine/belief'
import { buildInput } from '../src/engine/chronicler'
import { opennessOf } from '../src/engine/economy/ledger'
import { outlineInput } from '../src/engine/outlines'
import { shiftTension } from '../src/engine/social/realms'
import { readContentFiles } from '../src/node/content'
import { content, runUntil } from './helpers'

// Milestone M8.4 (docs/ROADMAP.md): the economy. A ledger per settlement,
// once a game day: workshops make, the nameless use, routes bring and take,
// and the counters fill from the store. Shortage, surplus, a price gone up and
// a trade nobody works are signals from watchers in the content.

const root = resolve(import.meta.dirname, '../content')
const DAY = 24 * 60

function counterPrice(engine: Engine, location: string, service: string, item: string): number {
  return engine.world.price(location, engine.world.service(location, service)!, item)
}
const hendrik = (engine: Engine) => counterPrice(engine, 'loc_waagdam_smithy', 'smithy_goods', 'lamp_oil')
const lubbert = (engine: Engine) => counterPrice(engine, 'loc_waagdam_graanhandel', 'grain_store', 'flour')
const stock = (engine: Engine, settlement: string, item: string) => engine.state.economy!.ledgers[settlement]!.stock[item] ?? 0
const mill = (engine: Engine) => engine.world.objectState('loc_molenend_mill', 'de_zwaan')

describe('M8.4: a ledger per settlement', () => {
  it('every settlement of both worlds keeps one, worked out once a day, and the counters fill from it', async () => {
    const isle = loadContent(await readContentFiles(root, 'isle'))
    for (const c of [content, isle]) for (const a of c.areas.values()) if (['village', 'town', 'hamlet', 'inn'].includes(a.kind)) expect(c.settlements.has(a.id), a.id).toBe(true)
    const engine = new Engine(content, { seed: 50 })
    runUntil(engine, 15, 6, 30)
    const day = engine.state.economy!.day
    runUntil(engine, 15, 23)
    expect(engine.state.economy!.day).toBe(day)
    runUntil(engine, 16, 6, 30)
    expect(engine.state.economy!.day).toBe(day + 1)
    // Hendrik's lamp oil comes out of Waagdam's store at seven, and he pays the town for it.
    const smithy = engine.world.stock('loc_waagdam_smithy', 'smithy_goods')
    smithy['lamp_oil'] = 0
    engine.state.economy!.ledgers['waagdam']!.stock['lamp_oil'] = 5
    const purse = engine.state.economy!.ledgers['waagdam']!.purse
    runUntil(engine, 16, 7, 30)
    expect(smithy['lamp_oil']).toBe(2)
    expect(stock(engine, 'waagdam', 'lamp_oil')).toBe(3)
    expect(engine.state.economy!.ledgers['waagdam']!.purse).toBeGreaterThan(purse)
    // Without a ledger the fixed supply is as it was.
    const bare = new Engine({ ...content, settlements: new Map() } as Content, { seed: 50 })
    runUntil(bare, 16, 6, 30)
    const old = bare.world.stock('loc_waagdam_smithy', 'smithy_goods')
    old['lamp_oil'] = 0
    runUntil(bare, 16, 7, 30)
    expect(old['lamp_oil']).toBe(2)
    expect(bare.state.economy).toBeUndefined()
    // On Skerrow the Salt Kettle's stew comes from its kitchen, made of the fish of the day.
    const skerrow = new Engine(isle, { seed: 50 })
    skerrow.tick(2 * DAY)
    expect(skerrow.state.economy!.ledgers['skerrow_hythe']!.last.made['fish_stew']).toBeGreaterThan(0)
  }, 60_000)
})

describe('M8.4: lamp oil and nails from Zwolderkamp', () => {
  it('come only over the Oostweg; the war shuts it, and within a week there is a shortage and a dearer jug at Hendrik\'s', () => {
    // Nobody wrote the shortage: nothing in the Nethermarch makes lamp oil, and only the Oostweg brings it.
    expect([...content.settlements.values()].flatMap((s) => s.workshops).some((w) => 'lamp_oil' in w.makes || 'iron_nails' in w.makes)).toBe(false)
    expect([...content.routes.values()].filter((r) => content.outlands.has(r.from) && ('lamp_oil' in r.carries || 'iron_nails' in r.carries)).map((r) => r.id)).toEqual(['zwolderkamp_oostweg'])
    const engine = new Engine(content, { seed: 51 })
    runUntil(engine, 16, 9)
    const before = hendrik(engine)
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'terpwold', 10, 'raids on the border')
    engine.tick(60)
    const war = engine.world.now
    expect(engine.state.economy!.routes['zwolderkamp_oostweg']!.closed).toBe(true)
    expect(engine.state.news!.facts.some((f) => f.claim?.subject === 'zwolderkamp_oostweg' && f.claim.value === 'closed')).toBe(true)
    let dearest = before
    for (let h = 0; h < 7 * 24; h++) {
      engine.tick(60)
      dearest = Math.max(dearest, hendrik(engine))
    }
    const shortage = engine.state.signals!.log.find((s) => s.kind === 'shortage' && s.claim?.subject === 'waagdam' && s.claim.value === 'lamp_oil')
    expect(shortage).toBeDefined()
    expect(shortage!.t - war).toBeLessThan(7 * DAY)
    expect(shortage!.who).toContain('npc_hendrik')
    expect(dearest).toBeGreaterThan(before)
    expect(engine.state.signals!.log.some((s) => s.kind === 'route_closed')).toBe(true)
  }, 60_000)
})

describe('M8.4: the mill and the flour', () => {
  it('after a storm the flour in Veenhoek goes down and Lubbert\'s price up; with the mill turning again it comes down', () => {
    const engine = new Engine(content, { seed: 52 })
    mill(engine)['broken'] = false
    runUntil(engine, 20, 12)
    const flour = stock(engine, 'veenhoek', 'flour')
    const calm = lubbert(engine)
    expect(flour).toBeGreaterThan(0)
    // The storm tears the sails again.
    mill(engine)['broken'] = true
    runUntil(engine, 25, 12)
    expect(stock(engine, 'veenhoek', 'flour')).toBeLessThan(flour)
    const storm = lubbert(engine)
    expect(storm).toBeGreaterThan(calm)
    mill(engine)['broken'] = false
    runUntil(engine, 29, 12)
    expect(lubbert(engine)).toBeLessThan(storm)
  }, 60_000)
})

describe('M8.4: signals from the ledgers', () => {
  it('a shortage for the shopkeeper\'s brain, and one that lasts a week for the chronicler', async () => {
    const mock = new MockLlm('good')
    mock.intend = (npc, offered) => (npc === 'npc_lubbert' && offered.includes('send_for_more') ? { choice: 'send_for_more' } : undefined)
    const engine = new Engine(content, { seed: 53, llm: mock })
    engine.state.player.location = 'loc_waagdam_graanhandel'
    for (let h = 0; h < 4 * 24; h++) {
      engine.tick(60)
      await engine.runModels()
    }
    const lubberts = engine.state.signals!.log.find((s) => s.kind === 'shortage' && s.claim?.subject === 'waagdam' && s.claim.value === 'flour')!
    expect(lubberts.handled).toBe('brain')
    expect(engine.state.plans!.some((p) => p.plan === 'intention:send_for_more' && p.subjects?.includes('npc_lubbert'))).toBe(true)
    for (let h = 0; h < 6 * 24; h++) engine.tick(60)
    const lasting = engine.state.signals!.log.find((s) => s.kind === 'shortage' && s.event === 'lasting' && s.claim?.value === 'flour')!
    expect(lasting).toBeDefined()
    expect(lasting.handled).toBe('chronicler')
  }, 60_000)

  it('a surplus and a trade nobody works: custom decides without a model', () => {
    const engine = new Engine(content, { seed: 54 })
    runUntil(engine, 15, 6)
    engine.state.economy!.ledgers['veenhoek']!.stock['herbs'] = 60
    // Grietje is the only spinner in Veenhoek, and she is gone.
    engine.state.npcs['npc_grietje_visser']!.absent = true
    for (let h = 0; h < 7 * 24; h++) {
      engine.tick(60)
      const news = engine.state.areaNews?.['veenhoek'] ?? ''
      if (/piling up/.test(news)) expect(news).toMatch(/herbs/)
    }
    const surplus = engine.state.signals!.log.find((s) => s.kind === 'surplus' && s.claim?.value === 'herbs')!
    expect(surplus.who).toContain('npc_aaltje')
    expect(surplus.handled).toBe('rules')
    expect(engine.state.plans!.some((p) => p.plan === 'aftermath:surplus' && p.signal === surplus.id)).toBe(true)
    const missing = engine.state.signals!.log.find((s) => s.kind === 'missing_trade')!
    expect(missing.claim).toMatchObject({ subject: 'veenhoek', key: 'trade', value: 'spinning' })
    expect(engine.state.news!.facts.some((f) => f.kind === 'notice' && f.claim?.key === 'trade')).toBe(true)
  }, 60_000)
})

describe('M8.4: a trading town and a peat village', () => {
  it('take the same stranger and the same shortage differently, from their character and ledger', () => {
    const engine = new Engine(content, { seed: 55 })
    const bare = new Engine({ ...content, settlements: new Map() } as Content, { seed: 55 })
    // The same stranger: the town is open, the village less, and part of that is what each lives on.
    expect(opennessOf(engine.world, 'waagdam')).toBeCloseTo(0.15)
    expect(opennessOf(engine.world, 'veenhoek')).toBeCloseTo(-0.05)
    expect(openness(engine.world, 'loc_waagdam_market') - openness(bare.world, 'loc_waagdam_market')).toBeGreaterThan(0)
    expect(openness(engine.world, 'loc_veenhoek_green') - openness(bare.world, 'loc_veenhoek_green')).toBeLessThan(0)
    // The same shortage of flour (the mill stands still): Waagdam sends for more, Veenhoek makes do.
    engine.tick(4 * DAY)
    expect(engine.state.news!.facts.some((f) => f.kind === 'goods' && f.about.includes('waagdam')) || engine.state.economy!.orders.some((o) => o.to === 'waagdam' && o.item === 'flour')).toBe(true)
    expect(engine.state.economy!.orders.some((o) => o.to === 'veenhoek')).toBe(false)
    expect(engine.state.areaNews?.['veenhoek']).toMatch(/make do/)
  }, 60_000)
})

describe('M8.4: a region beyond the map', () => {
  it('is a stub: no ledger, and the chronicler speaks of it as it sends and asks', () => {
    const engine = new Engine(content, { seed: 56 })
    engine.tick(DAY)
    const zwolderkamp = content.outlands.get('zwolderkamp')!
    expect(zwolderkamp.sends).toEqual(['lamp_oil', 'iron_nails', 'sailcloth', 'rope'])
    expect(engine.state.economy!.ledgers['zwolderkamp']).toBeUndefined()
    const input = buildInput(engine.world, { id: 'run_x', t: engine.world.now, reason: 'night', lines: [] })
    expect(input.catalogue).toMatch(/Zwolderkamp sends jugs of lamp oil, .*to Waagdam, by carters on the Oostweg, every 2 days, and asks for sacks of rye/)
    expect(outlineInput(engine.world, 'zwolderkamp').place.known.join(' ')).toMatch(/Zwolderkamp sends jugs of lamp oil/)
    // Not worked out until the story asks for it.
    expect(engine.state.outlines?.done?.['zwolderkamp']).toBeUndefined()
  })
})

describe('M8.4: the editor', () => {
  it('shows per settlement what it lives on, its character and routes, and warns where a chain does not close', async () => {
    const files = await readContentFiles(root)
    const view = editorView(files)
    const waagdam = view.economy.find((s) => s.id === 'waagdam')!
    expect(waagdam.livesOn).toBe('trade')
    expect(waagdam.tags).toEqual(['trade_town', 'market_town'])
    expect(waagdam.routes.some((r) => /Oostweg from Zwolderkamp: in .*lamp_oil.* from zwolderkamp/.test(r))).toBe(true)
    expect(view.economy.find((s) => s.id === 'veenhoek')!.livesOn).toBe('peat')
    expect(view.warnings.filter((w) => /made nowhere/.test(w))).toEqual([])
    // Without the Oostweg, lamp oil is used but comes from nowhere.
    const cut = files.map((f) => (f.path.endsWith('economy.yaml') && f.path.startsWith('base/') ? { ...f, text: f.text.replace(/^ {2}- \{ id: zwolderkamp_oostweg.*$/m, '') } : f))
    expect(editorView(cut).warnings).toContain('lamp_oil: used by the people of veenhoek, but made nowhere and brought by no route')
  })
})

describe('M8.4: an old save', () => {
  it('starts its ledgers where it stands and plays on', () => {
    const save = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', 'save-base-m8.json'), 'utf8')) as SaveData
    const engine = Engine.fromSave(content, save)
    expect(engine.state.economy).toBeUndefined()
    engine.tick(2 * DAY)
    expect(Object.keys(engine.state.economy!.ledgers).sort()).toEqual([...content.settlements.keys()].sort())
    expect(engine.state.economy!.day).toBe(Math.floor(engine.world.now / DAY) - (engine.world.now % DAY < 5 * 60 ? 1 : 0))
  })
})
