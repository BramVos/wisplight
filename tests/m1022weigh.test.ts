import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { relation } from '../src/engine/dialogue/relations'
import { recordFact } from '../src/engine/news'
import { tideState } from '../src/engine/tides'
import { loadContentFromDir } from '../src/node/content'
import { content, runUntil } from './helpers'

// M10.22: the player weighs in, both ways, and everything is in sight but not
// too often. A deed of the stranger's pushes a great line by the content's
// drivers, at most ten a day; whoever has standing may bring a line's two sides
// to one table; the journal, the land map and the chronicle show the lines;
// and a month without the stranger brings at most one threat and no event.

const DAY = 24 * 60

function crimeAgainst(engine: Engine, who: string): void {
  recordFact(engine.world, { kind: 'crime', about: [who], place: 'loc_schout_house', belang: 2, title: 'a blow at the schout', text: { precise: 'p', village: 'v', far: 'f' } })
}

function place(engine: Engine, id: string): void {
  Object.assign(engine.state.npcs[id]!, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
}

describe('M10.22: the player weighs in', () => {
  it('pushes a line with their deeds, at most ten a day, and a run of them breaks it at the month', async () => {
    const engine = new Engine(content, { seed: 7 })
    runUntil(engine, 15, 10)
    for (let i = 0; i < 3; i++) crimeAgainst(engine, 'npc_everhard')
    engine.tick(DAY)
    // Three crimes against the schout push 8 and 2 each, 30 in all; the stranger's share is held to ten.
    expect(tideState(engine.world, 'peat_unrest').pressure).toBeLessThanOrEqual(10.5)
    expect(tideState(engine.world, 'peat_unrest').moved.join(' ')).toMatch(/a blow at the schout/)
    for (let d = 0; d < 12; d++) {
      crimeAgainst(engine, 'npc_everhard')
      engine.tick(DAY)
    }
    runUntil(engine, 30, 23)
    engine.tick(5 * 60)
    const st = tideState(engine.world, 'peat_unrest')
    expect(st.history.at(-1)).toMatchObject({ judged: 'event' })
    expect(st.history.at(-1)!.why).toMatch(/after a blow at the schout/)
    expect((engine.state.pendingPlans ?? []).includes('peat_strike') || (engine.state.plans ?? []).some((p) => p.plan === 'peat_strike')).toBe(true)
  }, 120_000)

  it('lets someone with standing bring the two sides to one table, and the line eases', async () => {
    const engine = new Engine(content, { seed: 11, builder: true })
    engine.start()
    runUntil(engine, 15, 11)
    await engine.handle('@goto loc_veenhoek_green')
    for (const id of ['npc_gerrit', 'npc_everhard']) place(engine, id)
    const st = tideState(engine.world, 'peat_unrest')
    // Below the threat there is nothing great to settle: the ordinary answer.
    expect((await engine.handle('mediate between gerrit and everhard')).map((o) => o.text).join(' ')).not.toMatch(/one table/)
    st.pressure = 45
    // Without standing neither side sits down.
    expect((await engine.handle('mediate between gerrit and everhard')).map((o) => o.text).join(' ')).toMatch(/neither owes you a seat/)
    for (const id of ['npc_gerrit', 'npc_everhard']) Object.assign(relation(engine.state, id), { trust: 40 })
    for (const id of ['npc_gerrit', 'npc_everhard']) place(engine, id)
    const said = (await engine.handle('mediate between gerrit and everhard')).map((o) => o.text).join('\n')
    expect(said).toMatch(/\((Persuasion|Insight) \d+ vs DC 14: /)
    expect(st.pressure).not.toBe(45)
    expect(st.pressure).toBeGreaterThanOrEqual(35)
    expect(st.pressure).toBeLessThanOrEqual(50)
    expect(engine.state.news!.facts.some((f) => f.kind === 'tide_mediated')).toBe(true)
  }, 60_000)

  it('Skerrow has its own table; Deepwell has none and mediates as before', async () => {
    const isle = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle')
    expect(isle.tides.get('great_storm')?.mediation?.between).toEqual(['npc_maren', 'npc_garrick'])
    const other = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')
    expect([...other.tides.values()].some((t) => t.mediation)).toBe(false)
  })
})

describe('M10.22: everything in sight, and not too often', () => {
  it('shows the lines in the journal, colours the border on the land map, and names every judgement in the chronicle', async () => {
    const engine = new Engine(content, { seed: 7 })
    runUntil(engine, 30, 23)
    tideState(engine.world, 'peat_unrest').pressure = 40
    engine.tick(5 * 60)
    const page = engine.page('tides')!
    expect(page.name).toBe('The great lines')
    expect(page.lines.join('\n')).toMatch(/^The peat-cutters' unrest \(uprising\): a threat; \d+ of 60 \(a threat from 30\)\./m)
    expect(page.lines.join('\n')).toMatch(/it threatened\. pressure/)
    expect(engine.page('land')?.land?.tense ?? []).toContainEqual({ name: "the peat-cutters' unrest", stage: 'threat' })
    expect(engine.chronicle()).toMatch(/THE GREAT LINES\n.*the great flood: nothing/)
  }, 120_000)

  it('a month without the stranger brings at most one threat and no event, in all three worlds', async () => {
    for (const world of [content, await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle'), await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')]) {
      const engine = new Engine(world, { seed: 3 })
      engine.tick(30 * DAY)
      const history = Object.values(engine.state.tides?.lines ?? {}).flatMap((l) => l.history)
      expect(history.filter((h) => h.judged === 'event'), world.world.id).toEqual([])
      expect(history.filter((h) => h.judged === 'threat').length, world.world.id).toBeLessThanOrEqual(1)
    }
  }, 180_000)
})
