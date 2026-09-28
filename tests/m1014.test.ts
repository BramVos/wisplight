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
