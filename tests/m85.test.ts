import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEdits, Engine, type Content } from '../src/engine'
import { describeRoom } from '../src/engine/commands'
import { simulate } from '../src/engine/playtest'
import { shiftTension } from '../src/engine/social/realms'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M8.5 (docs/ROADMAP.md): growth. Newcomers from templates, checked
// as content and at most so many a season; projects built with materials
// from the ledgers; the player works for pay and puts money in.

const root = resolve(import.meta.dirname, '../content')
const DAY = 24 * 60

async function say(engine: Engine, ...commands: string[]): Promise<string> {
  const out: string[] = []
  for (const c of commands) out.push(...(await engine.handle(c)).map((o) => o.text))
  return out.join('\n')
}

describe('M8.5: a cooper comes to Veenhoek', () => {
  it('with the household, into the empty house, because nobody makes barrels', async () => {
    const engine = new Engine(content, { seed: 60, builder: true })
    for (let d = 0; d < 22; d++) engine.tick(DAY)
    const missing = engine.state.signals!.log.find((s) => s.kind === 'missing_trade' && s.claim?.value === 'cooperage')!
    expect(missing).toBeDefined()
    const people = engine.state.growth!.people
    expect(people.map((p) => p.profession)).toEqual(['cooper', 'homemaker', 'child'])
    const [head, spouse, child] = people
    for (const p of people) {
      expect(p.home).toBe('loc_veenhoek_cooperage')
      expect(p.fame).toBe(0)
      // They came knowing nobody: what ties they have are new.
      expect(Object.values(engine.state.bonds?.[p.id] ?? {}).every((b) => b.familiarity < 40)).toBe(true)
      expect(content.world.names!.family.some((f) => p.name.endsWith(` ${f}`))).toBe(true)
    }
    expect(head!.relations.map((r) => [r.to, r.role])).toEqual([[spouse!.id, 'spouse'], [child!.id, 'child']])
    expect(child!.child).toBe(true)
    // The trade is worked again.
    expect(engine.state.growth!.hands['veenhoek:cooperage']).toEqual([head!.id])
    expect(engine.state.economy!.ledgers['veenhoek']!.last.made['barrel']).toBeGreaterThan(0)
    expect(engine.state.news!.facts.some((f) => f.kind === 'arrived' && f.about.includes(head!.id))).toBe(true)
    // A new face who does not know the stranger either, and can be talked to.
    engine.state.npcs[head!.id]!.location = 'loc_veenhoek_quay'
    await say(engine, '@goto loc_veenhoek_quay')
    expect(await say(engine, `talk ${head!.name.split(' ')[0]}`)).not.toMatch(/no one|nobody by that name/i)
    // A save carries them.
    const loaded = Engine.fromSave(content, engine.save())
    expect(loaded.content.npcs.get(head!.id)?.name).toBe(head!.name)
    expect(loaded.state.npcs[head!.id]).toBeDefined()
    loaded.tick(DAY)
  }, 120_000)

  it('not when a season has had its newcomers', () => {
    const few = { ...content, world: { ...content.world, newcomers_per_season: 2 } } as Content
    const engine = new Engine(few, { seed: 60 })
    for (let d = 0; d < 22; d++) engine.tick(DAY)
    expect(engine.state.growth?.people ?? []).toEqual([])
    // Still nobody: a note on the board.
    expect(engine.state.news!.facts.some((f) => f.kind === 'notice' && f.claim?.value === 'cooperage')).toBe(true)
  }, 120_000)
})

describe('M8.5: a wall for Waagdam', () => {
  it('first a brickworks, then the wall, with materials from the economy', async () => {
    const engine = new Engine(content, { seed: 61, builder: true })
    engine.tick(60)
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'raids')
    engine.tick(2 * DAY)
    const projects = () => engine.state.growth!.projects
    expect(projects()['waagdam_brickworks']).toBeDefined()
    expect(projects()['waagdam_wall']).toBeUndefined()
    // The player puts money in, and works a day at the peat cuttings for pay.
    await say(engine, '@goto loc_waagdam_market')
    const money = engine.state.player.money
    expect(await say(engine, 'invest 20')).toMatch(/You put .* into the brickworks/)
    expect(engine.state.player.money).toBe(money - 20)
    await say(engine, '@goto loc_peat_cuttings')
    const peat = engine.state.economy!.ledgers['veenhoek']!.stock['peat'] ?? 0
    const before = engine.state.player.money
    expect(await say(engine, 'work')).toMatch(/cut peat all day/)
    expect(engine.state.player.money).toBeGreaterThan(before)
    expect(engine.state.economy!.ledgers['veenhoek']!.stock['peat'] ?? 0).toBeGreaterThan(peat)
    for (let d = 0; d < 40 && !projects()['waagdam_wall']?.done; d++) engine.tick(DAY)
    const brickworks = projects()['waagdam_brickworks']!
    const wall = projects()['waagdam_wall']!
    expect(brickworks.done).toBeDefined()
    expect(wall.started).toBeGreaterThanOrEqual(brickworks.done!)
    expect(wall.done).toBeDefined()
    expect(brickworks.used).toEqual({ peat: 40 })
    expect(wall.used).toEqual({ brick: 300 })
    // The bricks were made from clay of the Vaart, fired with peat, in the new brickworks.
    expect(engine.content.locations.get('loc_waagdam_brickworks')).toBeDefined()
    expect(engine.world.location('loc_waagdam_harbour').exits.south?.to).toBe('loc_waagdam_brickworks')
    expect(engine.content.settlements.get('waagdam')!.workshops.map((w) => w.id)).toContain('brick_kiln')
    // Who put money in has it back with a fifth more.
    expect(engine.state.growth!.projects['waagdam_brickworks']!.invested['player']).toBe(20)
    // The gates are in a wall now.
    engine.state.player.location = 'loc_waagdam_west_gate'
    expect(describeRoom(engine.world).text).toMatch(/new wall of yellow-red\s+brick/)
    // Work for pay at the kiln.
    await say(engine, '@goto loc_waagdam_brickworks')
    const bricks = engine.state.economy!.ledgers['waagdam']!.stock['brick'] ?? 0
    expect(await say(engine, 'work at the kiln')).toMatch(/feed the kiln/)
    expect(engine.state.economy!.ledgers['waagdam']!.stock['brick'] ?? 0).toBeGreaterThan(bricks)
  }, 120_000)
})

describe('M8.5: a shortage that lasts', () => {
  it('leads to a decision of a trader', () => {
    const engine = new Engine(content, { seed: 62, builder: true })
    engine.tick(60)
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'terpwold', 10, 'raids on the border')
    for (let d = 0; d < 14; d++) engine.tick(DAY)
    const lasting = engine.state.signals!.log.find((s) => s.kind === 'shortage' && s.event === 'lasting' && s.claim?.subject === 'waagdam')!
    expect(lasting).toBeDefined()
    const trader = engine.state.news!.facts.find((f) => f.kind === 'trader' && f.title.includes(lasting.claim!.value === 'lamp_oil' ? 'lamp oil' : ''))!
    expect(trader).toBeDefined()
    expect(trader.about).toEqual(lasting.who.slice(0, 1))
  }, 120_000)
})

describe('M8.5: the editor', () => {
  it('shows the newcomers of a playtest, and writes a household into the world', async () => {
    const report = simulate(content, 22, 60)
    const household = report.grown.households[0]!
    expect(household.names).toHaveLength(3)
    const files = await readContentFiles(root)
    const result = applyEdits(files, household.people.map((p) => ({ kind: 'npc' as const, id: String(p['id']), data: p })))
    expect(result.problems).toEqual([])
    expect(result.content!.npcs.get(String(household.people[0]!['id']))?.profession).toBe('cooper')
  }, 120_000)
})
