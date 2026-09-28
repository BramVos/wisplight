import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { failedMake } from '../src/engine/outcomes'
import { relation } from '../src/engine/dialogue/relations'
import { describeHex, hexOfId } from '../src/engine/map/travel'
import { content } from './helpers'

// Milestone M10.14 (docs/ROADMAP.md): good outcomes, and failure that plays
// on. A failed attempt leaves a situation, with ways on; what follows good
// news is content, as the aftermath of bad news already was.

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

async function stranger(seed = 7): Promise<Engine> {
  const engine = new Engine(content, { seed, builder: true })
  await engine.handle('create warden heathborn peat_cutter name=Joost')
  engine.state.player.money = 500
  return engine
}

describe('M10.14: a failed attempt at a craft leaves something', () => {
  it('a failed batch of bread: burnt loaves instead, and Mirte says what went wrong', async () => {
    const engine = await stranger()
    engine.state.player.location = 'loc_bakery_yard'
    stay(engine, 'npc_mirte', 'loc_bakery_yard', 3 * DAY)
    Object.assign(engine.state.player.inventory, { flour: 5, peat: 5 })
    rolls(engine, 4)
    const out = said(await engine.handle('use oven bake'))
    expect(out).toMatch(/: failure\)/)
    expect(out).toMatch(/What you have is 3 burnt loaves: not what you meant, but not nothing\./)
    expect(out).toMatch(/Mirte looks at it\. "Your oven was too hot/)
    expect(engine.state.player.inventory['burnt_loaf']).toBe(3)
    expect(content.items.get('burnt_loaf')).toMatchObject({ quality: 'poor', of: 'rye_bread' })
  })

  it('a bad failure at the forge damages it: nobody can use it until it is mended, by the stranger or, the next morning, by the smith', async () => {
    const engine = await stranger()
    engine.state.player.location = 'loc_waagdam_smithy'
    stay(engine, 'npc_hendrik', 'loc_waagdam_smithy', 3 * DAY)
    Object.assign(engine.state.player.inventory, { bar_iron: 5, peat: 5 })
    rolls(engine, 1)
    const out = said(await engine.handle('use forge nails'))
    expect(out).toMatch(/critical failure/)
    expect(out).toMatch(/Something gives: the forge is damaged.*REPAIR THE FORGE, or leave it to Hendrik, who will know who did it\./)
    expect(said(await engine.handle('use forge nails'))).toMatch(/The forge is damaged and must be mended first\. REPAIR THE FORGE, or leave it to Hendrik\./)
    expect(said(await engine.handle('repair forge'))).toMatch(/You mend the forge/)
    expect(engine.world.objectState('loc_waagdam_smithy', 'forge')['damaged']).toBeUndefined()
    // Left for the smith: he mends it at six, and minds who did it.
    engine.world.objectState('loc_waagdam_smithy', 'forge')['damaged'] = 'player'
    const before = relation(engine.state, 'npc_hendrik').affinity
    engine.tick(DAY)
    expect(engine.world.objectState('loc_waagdam_smithy', 'forge')['damaged']).toBeUndefined()
    expect(relation(engine.state, 'npc_hendrik').affinity).toBeLessThan(before)
    expect(engine.state.npcs['npc_hendrik']!.thoughts?.map((t) => t.text)).toContain('The stranger damaged your forge and left it for you to mend.')
  })

  it('a failed milling gives half the grain back to go through again; without a failure of its own, the material is gone as before', async () => {
    const engine = await stranger()
    const world = engine.world
    const mill = content.objectTypes.get('horse_mill') ?? [...content.objectTypes.values()].find((t) => t.affordances.some((a) => a.craft === 'milling'))!
    const recipe = mill.affordances.find((a) => a.craft === 'milling')!
    world.state.player.inventory = {}
    const out = said(failedMake(world, { id: 'x', type: mill.id, staff: [], state: {}, state_text: {} }, mill, content.crafts.get('milling')!, { ...recipe, consumes: { rye_grain: 4 } }, { degree: 'failure' } as never))
    expect(out).toMatch(/but not all is lost: 2 sacks of rye can go in again/)
    expect(world.state.player.inventory['rye_grain']).toBe(2)
    const plain = said(failedMake(world, { id: 'x', type: mill.id, staff: [], state: {}, state_text: {} }, mill, { ...content.crafts.get('milling')!, failure: undefined }, { ...recipe, consumes: { rye_grain: 4 } }, { degree: 'failure' } as never))
    expect(plain).toMatch(/nothing worth keeping\. 4 sacks of rye gone\./)
  })
})

describe('M10.14: a failure in the field leaves the situation you are in', () => {
  it('lost in the mist: the hex has no name, the text says what you can do, and it clears when the mist lifts', async () => {
    const engine = await stranger()
    const world = engine.world
    const hexId = 'hex:40,30'
    world.state.player.location = hexId
    world.state.weather = { kind: 'fog', since: world.now }
    world.state.player.lost = world.now
    const lost = describeHex(world, hexOfId(hexId)!).text
    expect(lost).toMatch(/^Somewhere in the mist\nYou have lost your bearings: .*WAIT for it to lift, or WALK TO a place or HEAD a way/)
    world.state.weather = { kind: 'clear', since: world.now }
    expect(describeHex(world, hexOfId(hexId)!).text).not.toMatch(/Somewhere in the mist/)
    expect(world.state.player.lost).toBeUndefined()
  })

  it('out of the fen wet through and cold: -1 on checks, until an hour under a roof', async () => {
    const engine = await stranger()
    const c = engine.state.player.character!
    c.conditions['mired'] = 1
    rolls(engine, 20)
    expect(said(await engine.handle('struggle'))).toMatch(/wet through, and cold: -1 on everything you try until you dry out/)
    expect(c.conditions['wet']).toBe(1)
    engine.state.player.location = 'loc_goose_common'
    engine.tick(60)
    expect(c.conditions['wet']).toBeUndefined()
  })
})

describe('M10.14: a missed agreement can be explained or made good', () => {
  /** The stranger promised Mirte a basket of peat and let the day go by. */
  async function letMirteDown() {
    const { agree } = await import('../src/engine/agreements')
    const engine = await stranger(11)
    const world = engine.world
    world.state.player.location = 'loc_bakery_yard'
    stay(engine, 'npc_mirte', 'loc_bakery_yard', 3 * DAY)
    const a = agree(world, { kind: 'give', by: 'player', to: 'npc_mirte', source: 'conversation', what: 'bring Mirte a basket of peat', due: world.now + 60, terms: { item: 'peat' } }) as import('../src/engine/state').Agreement
    engine.tick(120)
    expect(a).toMatchObject({ status: 'missed', judged: 'let_down' })
    stay(engine, 'npc_mirte', 'loc_bakery_yard', 3 * DAY)
    return { engine, world, a }
  }

  it('sorry, by the rules: a check against how Mirte stands and who she is; then a second go, and kept, it is made good', async () => {
    const { engine, world, a } = await letMirteDown()
    const before = relation(world.state, 'npc_mirte').affinity
    await engine.handle('talk mirte')
    rolls(engine, 20)
    const sorry = said(await engine.handle("I'm sorry, I let you down."))
    expect(sorry).toMatch(/\(Persuasion \d+ vs DC \d+: (critical )?success\)/)
    expect(sorry).toMatch(/"All right\. Will you still do it, then\?"/)
    expect(a.amends?.how).toBe('apologised')
    expect(relation(world.state, 'npc_mirte').affinity).toBeGreaterThan(before)
    const again = said(await engine.handle("I'll still do it, I promise."))
    expect(again).toMatch(/Two days, then\. I'll believe it when I see it\./)
    expect(again).toMatch(/You have given Mirte your word again/)
    const redo = world.state.agreements!.list.find((x) => x.remakes === a.id)!
    expect(redo).toMatchObject({ status: 'open', kind: 'give', by: 'player', to: 'npc_mirte' })
    await engine.handle('bye')
    world.state.player.inventory['peat'] = 1
    const gave = said(await engine.handle('give peat to mirte'))
    expect(gave, gave).toMatch(/You give/)
    expect(redo.status).toBe('kept')
    expect(a.amends?.how).toBe('made_good')
    engine.tick(60)
    expect(world.state.news?.facts.some((f) => f.kind === 'made_good' && f.about.includes('npc_mirte'))).toBe(true)
    expect(world.state.npcs['npc_mirte']!.thoughts?.map((t) => t.text)).toContain('The stranger let you down once, over bring Mirte a basket of peat, and made it good.')
  })

  it('explained: not the stranger\'s fault, and she did not know; now she does, with no check at all', async () => {
    const { engine, a } = await letMirteDown()
    a.outcome = { ...a.outcome!, fault: 'world', text: 'the mill stood still all week' }
    await engine.handle('talk mirte')
    const out = said(await engine.handle("Let me explain: I couldn't get any, the mill stood still."))
    expect(out).not.toMatch(/Persuasion/)
    expect(out).toMatch(/I didn't know that\. Well, then\. No harm meant\./)
    expect(a.judged).toBe('understood')
  })

  it('a gift worth what was promised makes it good too; whom it was for decides, and a hostile one says no to a second go', async () => {
    const { engine, world, a } = await letMirteDown()
    world.state.player.inventory['rye_bread'] = 30
    expect(said(await engine.handle('give 30 bread to mirte'))).toMatch(/That makes it good\. We'll say no more about it\./)
    expect(a.amends?.how).toBe('made_good')
    const next = await letMirteDown()
    relation(next.world.state, 'npc_mirte').affinity = -90
    relation(next.world.state, 'npc_mirte').trust = -90
    await next.engine.handle('talk mirte')
    expect(said(await next.engine.handle("Let me make it up to you."))).toMatch(/And wait for you again\? No\./)
    expect(next.a.amends?.how).toBe('refused')
  })
})
