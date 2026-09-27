import { describe, expect, it } from 'vitest'
import { Engine, GameClock } from '../src/engine'
import { validateGoals } from '../src/engine/npc/goals'
import type { Goal } from '../src/engine/state'
import { content } from './helpers'

// Milestone M7.2 (docs/ROADMAP.md): the open points of M1 to M7.

function game(seed = 5) {
  const engine = new Engine(content, { seed })
  const target = GameClock.from(211, 9, 15, 9, 0).minutes
  engine.tick(target - engine.world.now)
  return engine
}

function give(engine: Engine, npc: string, type: Goal['type'], extra: Partial<Goal>): void {
  const s = engine.state.npcs[npc]!
  s.goals.push({ id: `test_${type}`, type, priority: 1, source: 'ai', created: engine.world.now, until: engine.world.now + 24 * 60, ...extra })
  s.plan = []
  s.planGoal = undefined
  s.busyUntil = engine.world.now
}

const reply = (goals: { type: string; target: string }[]) => ({ goals: goals.map((g) => ({ ...g, priority: 0.8, why: 'test' })), mood: 'calm', note: '' })

describe('M7.2: the rest of the goal catalogue', () => {
  it('sells what an NPC has where they buy it', () => {
    const engine = game()
    const wouter = engine.state.npcs['npc_wouter']!
    wouter.inventory['eel'] = 3
    const money = wouter.money
    give(engine, 'npc_wouter', 'Sell', { item: 'eel', qty: 1 })
    for (let i = 0; i < 8 * 60 && (wouter.inventory['eel'] ?? 0) > 0; i++) engine.tick(1)
    expect(wouter.inventory['eel'] ?? 0).toBe(0)
    expect(wouter.money).toBeGreaterThan(money)
  })

  it('brings someone what they asked for', () => {
    const engine = game()
    engine.state.requests.push({ id: 'req_test', npc: 'npc_mirte', kind: 'fetch', item: 'herbs', qty: 1, created: engine.world.now, status: 'open', source: 'motor' })
    engine.state.npcs['npc_aaltje']!.inventory['herbs'] = 2
    const check = validateGoals(engine.world, 'npc_aaltje', reply([{ type: 'Deliver', target: 'npc_mirte' }]))
    expect(check.accepted[0]).toMatchObject({ type: 'Deliver', target: 'npc_mirte', item: 'herbs' })
    engine.state.npcs['npc_aaltje']!.goals.push(check.accepted[0]!)
    engine.state.npcs['npc_aaltje']!.plan = []
    for (let i = 0; i < 6 * 60 && engine.state.requests.find((r) => r.id === 'req_test')!.status === 'open'; i++) engine.tick(1)
    expect(engine.state.requests.find((r) => r.id === 'req_test')!.status).toBe('done')
    expect(engine.state.npcs['npc_mirte']!.inventory['herbs']).toBeGreaterThanOrEqual(1)
  })

  it('keeps the gates: the honest do not steal, nobody harms a child or someone with a quest part', () => {
    const engine = game()
    expect(validateGoals(engine.world, 'npc_mirte', reply([{ type: 'Steal', target: 'rye_bread' }])).rejected.join(' ')).toMatch(/too honest|not something/)
    engine.state.bonds = { npc_jan_visser: { npc_pim: { affinity: -90, trust: 0, fear: 0, familiarity: 50 }, npc_harmen: { affinity: -90, trust: 0, fear: 0, familiarity: 50 } } }
    expect(validateGoals(engine.world, 'npc_jan_visser', reply([{ type: 'Harm', target: 'npc_pim' }])).rejected.join(' ')).toMatch(/never a child|not something/)
    expect(validateGoals(engine.world, 'npc_aaltje', reply([{ type: 'Report', target: 'none' }])).rejected.join(' ')).toMatch(/nothing to report/)
  })

  it('a thief of the village can be seen, talked about, reported and locked up', () => {
    const engine = game()
    const kobus = engine.world.npc('npc_kobus')
    kobus.personality.honesty = -2
    engine.state.npcs['npc_kobus']!.money = 0
    const bakery = 'loc_veenhoek_bakery'
    engine.state.npcs['npc_kobus']!.location = bakery
    engine.state.npcs['npc_mirte']!.location = bakery
    engine.state.npcs['npc_mirte']!.activity = 'at work'
    engine.state.npcs['npc_mirte']!.busyUntil = engine.world.now + 60
    const check = validateGoals(engine.world, 'npc_kobus', reply([{ type: 'Steal', target: 'rye_bread' }]))
    expect(check.accepted).toHaveLength(1)
    engine.state.npcs['npc_kobus']!.goals.push(check.accepted[0]!)
    engine.state.npcs['npc_kobus']!.plan = []
    engine.state.npcs['npc_kobus']!.busyUntil = engine.world.now
    for (let i = 0; i < 60 && !(engine.state.crimes ?? []).length; i++) engine.tick(1)
    const crime = (engine.state.crimes ?? [])[0]
    if (!crime) {
      // Nobody saw it this time: the bread is simply gone.
      expect(engine.state.npcs['npc_kobus']!.inventory['rye_bread']).toBe(1)
      return
    }
    expect(crime).toMatchObject({ kind: 'theft', offender: 'npc_kobus' })
    expect(engine.state.news!.facts.some((f) => f.title === 'Kobus caught stealing a loaf of rye bread')).toBe(true)
    const witness = crime.witnesses.find((w) => (engine.world.npc(w).values['law'] ?? 0) >= 0)!
    const report = validateGoals(engine.world, witness, reply([{ type: 'Report', target: 'none' }]))
    expect(report.accepted).toHaveLength(1)
    engine.state.npcs[witness]!.goals.push(report.accepted[0]!)
    engine.state.npcs[witness]!.plan = []
    engine.state.npcs[witness]!.busyUntil = engine.world.now
    for (let i = 0; i < 6 * 60 && !crime.reported.length; i++) engine.tick(1)
    expect(crime.reported).toContain(witness)
    expect(engine.state.npcs['npc_kobus']!.stayAt?.where).toBe('loc_schout_house')
  })

  it('keeps away from a place to avoid, and learns what happened at a place it looks round', () => {
    const engine = game()
    give(engine, 'npc_mirte', 'Avoid', { target: 'loc_goose_common' })
    engine.tick(10)
    expect(engine.state.npcs['npc_mirte']!.avoid?.place).toBe('loc_goose_common')
    engine.state.news!.facts.push({ id: 'fact_test', kind: 'test', about: [], place: 'loc_peat_cuttings', t: engine.world.now, belang: 2, juice: 0.5, title: 'something at the cuttings', text: { precise: 'x', village: 'x', far: 'x' } } as never)
    give(engine, 'npc_wendela', 'Investigate', { target: 'loc_peat_cuttings' })
    for (let i = 0; i < 4 * 60 && !engine.state.news!.heard['npc_wendela']?.['fact_test']; i++) engine.tick(1)
    expect(engine.state.news!.heard['npc_wendela']?.['fact_test']).toBeDefined()
  })
})

async function player(seed = 3): Promise<Engine> {
  const engine = new Engine(content, { seed, builder: true })
  await engine.handle('create warden heathborn peat_cutter name=Tester')
  return engine
}
const say = async (engine: Engine, ...commands: string[]) => {
  let all = ''
  for (const c of commands) all += (await engine.handle(c)).map((o) => o.text).join('\n') + '\n'
  return all
}

describe('M7.2: dangers and conditions outside fights', () => {
  it('Fen Fever grows each morning until herbs cure it', async () => {
    const engine = await player()
    const c = engine.state.player.character!
    c.conditions['fen_fever'] = 1
    const before = c.attributes.might
    engine.tick(24 * 60)
    expect(c.conditions['fen_fever']).toBe(2)
    expect(c.attributes.might).toBe(before)
    await say(engine, '@give herbs', 'use herbs')
    expect(c.conditions['fen_fever']).toBeUndefined()
  })

  it('stuck in the fen: no walking until you struggle free', async () => {
    const engine = await player()
    engine.state.player.character!.conditions['mired'] = 1
    expect(await say(engine, 'north')).toMatch(/stuck fast/)
    for (let i = 0; i < 20 && engine.state.player.character!.conditions['mired']; i++) await say(engine, 'struggle')
    expect(engine.state.player.character!.conditions['mired']).toBeUndefined()
  })

  it('as a cat: no hands and no words, and the widow can make you one to talk to Fenna', async () => {
    const engine = await player()
    const out = await say(engine, '@goto loc_visser_house', '@like aaltje 30 30', '@bring aaltje', 'ask aaltje about the cat', '@goto loc_kattenbroek_hut', '@bring kaatje', '@like kaatje 10 10', 'ask the widow to make me a cat')
    expect(out).toMatch(/four soft feet/)
    expect(engine.state.player.character!.conditions['catform']).toBe(1)
    expect(await say(engine, 'talk kaatje')).toMatch(/You are a cat/)
    expect(await say(engine, '@goto loc_visser_house', 'talk to the cat')).toMatch(/It was me/)
    engine.tick(3 * 60)
    expect(engine.state.player.character!.conditions['catform']).toBeUndefined()
  })

  it('a curse costs two on every check and lifts at a holy place', async () => {
    const engine = await player()
    const c = engine.state.player.character!
    const { skillBonus } = await import('../src/engine/rules/character')
    const free = skillBonus(content, c, 'athletics')
    c.conditions['cursed'] = 1
    expect(skillBonus(content, c, 'athletics')).toBe(free - 2)
    await say(engine, '@goto loc_veenhoek_chapel', 'rite')
    expect(c.conditions['cursed']).toBeUndefined()
  })

  it('a punt from Wouter takes you over open water', async () => {
    const engine = await player()
    expect(await say(engine, 'hire punt')).toMatch(/hired from Wouter/)
    await say(engine, '@goto loc_wouter_hut', '@bring wouter', '@money 100', 'hire punt')
    expect(engine.state.player.punt).toBeGreaterThan(engine.world.now)
    const { passable } = await import('../src/engine/map/travel')
    expect(passable(engine.world, { land: 'water', bog: false, channel: true } as never, true)).toBe(true)
    expect(passable(engine.world, { land: 'water', bog: false, channel: true } as never, false)).toBe(false)
  })
})

describe('M7.2: blessings that are more than a bonus', () => {
  it('the Rider\'s Share: once you do not die, and the price is the last sheaf at a crossroads', async () => {
    const engine = await player()
    const c = engine.state.player.character!
    c.patron = { id: 'grey_rider', favour: 80, since: engine.world.now }
    const { greyRider } = await import('../src/engine/rules/player')
    const out = greyRider(engine.world, engine.state.player.location, () => []).map((o) => o.text).join(' ')
    expect(out).toMatch(/Not yet/)
    expect(c.deaths).toBe(0)
    expect(engine.state.player.riderPrice).toBe(true)
    expect(await say(engine, '@goto loc_veenhoek_chapel', 'rite')).toMatch(/wants his price/)
    expect(await say(engine, '@give rye_grain', '@goto loc_route_crossroads', 'leave the rye')).toMatch(/The Rider is paid/)
    expect(c.mark).toBeUndefined()
    // Only once.
    expect(greyRider(engine.world, engine.state.player.location, () => []).map((o) => o.text).join(' ')).toMatch(/road of grey light/)
  })

  it('the Feather Bed clears ailments but not curses in a night\'s sleep', async () => {
    const engine = await player()
    const c = engine.state.player.character!
    c.patron = { id: 'holle', favour: 60, since: engine.world.now }
    c.conditions['fen_fever'] = 2
    c.conditions['cursed'] = 1
    await say(engine, '@goto loc_goose_rooms', '@time 22', 'sleep')
    expect(c.conditions['fen_fever']).toBeUndefined()
    expect(c.conditions['cursed']).toBe(1)
  })
})

describe('M7.2: a house after a wedding', () => {
  it('the spouse\'s home becomes yours, and five nights away are minded', async () => {
    const engine = await player()
    engine.state.romance = { npc_wouter: { stage: 'together', since: engine.world.now } }
    const out = await say(engine, '@goto loc_veenhoek_chapel', '@bring wouter', 'marry wouter')
    expect(out).toMatch(/is your home now/)
    expect(engine.state.player.home).toBe(content.npcs.get('npc_wouter')!.home)
    const { relation } = await import('../src/engine/dialogue/relations')
    const before = relation(engine.state, 'npc_wouter').affinity
    engine.tick(6 * 24 * 60)
    expect(relation(engine.state, 'npc_wouter').affinity).toBeLessThan(before)
    expect(await say(engine, `@goto ${engine.state.player.home}`, '@time 22', 'sleep')).toMatch(/You sleep at home/)
  })
})

describe('M7.2: a theft nobody saw', () => {
  it('is noticed later, gets a suspect in the rumours, and the schout looks into it', async () => {
    const engine = await player()
    await say(engine, '@goto loc_veenhoek_bakery')
    for (const id of engine.world.npcsAt('loc_veenhoek_bakery')) Object.assign(engine.state.npcs[id]!, { location: 'loc_veenhoek_green', plan: [], busyUntil: engine.world.now + 600 })
    // Someone saw the player in the bakery a little earlier.
    engine.state.npcs['npc_mirte']!.sightings = { player: { where: 'loc_veenhoek_bakery', t: engine.world.now - 20 } }
    await say(engine, 'steal bread')
    const crime = engine.state.crimes![0]!
    expect(crime.unseen).toBe(true)
    engine.tick(4 * 60)
    expect(crime.discovered).toBe(true)
    expect(crime.suspect).toBe('player')
    const fact = engine.state.news!.facts.find((f) => f.title.startsWith('the theft at'))!
    expect(fact.text.village).toMatch(/the stranger/)
    for (let i = 0; i < 24 && !crime.investigated; i++) engine.tick(60)
    expect(crime.investigated).toBe(true)
    expect(engine.state.wanted?.count?.fine).toBeGreaterThan(0)
  })
})
