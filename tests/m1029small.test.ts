import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'
import { content as nethermarch } from './helpers'

// M10.29 T, the commands of Bram's log of 29 September 2026 (the design
// session read quietreach-3357f810-818): wait <person>, follow where there is
// no edge, hold in a world without characters, an unknown verb on a thing or
// person here, a name cut short, and "l 8" after the list.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

function at(location: string, content = quiet): Engine {
  const engine = new Engine(content, { seed: 1 })
  engine.start()
  engine.state.player.location = location
  return engine
}
const said = async (engine: Engine, line: string) => (await engine.handle(line)).map((o) => o.text).join('\n')
function stay(engine: Engine, npcId: string): void {
  const s = engine.state.npcs[npcId]!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
}

describe('M10.29 T: small things of the commands', () => {
  it('(b) WAIT NIKO is WAIT FOR NIKO; WAIT A BIT is still ten minutes', async () => {
    const engine = at('loc_commons')
    stay(engine, 'npc_niko_serrin')
    expect(await said(engine, 'wait niko')).toMatch(/^Niko is here\./)
    // WAIT A BIT is still a wait of time: up to ten minutes, and it stops early when someone a quest needs comes by.
    const before = engine.world.now
    expect(await said(engine, 'wait a bit')).toMatch(/Time passes\./)
    expect(engine.world.now - before).toBeGreaterThan(0)
    expect(engine.world.now - before).toBeLessThanOrEqual(10)
  })

  it('(c) FOLLOW where there is no edge names the exit to each way, never the path to where you stand', async () => {
    const engine = at('loc_ridge_shelter')
    const follow = await said(engine, 'follow')
    expect(follow).toMatch(/^Which way\? From in here you go out first:/)
    expect(follow).toMatch(/the path south-west: southwest from here/)
    expect(follow).toMatch(/the path to Orison Ridge north: up from here/)
    expect(follow).not.toMatch(/path to Ridge Shelter/)
    expect(await said(engine, '1')).toMatch(/^Coastal Service Path/)
  })

  it('(f) a verb of character rules in a world without them is a verb the world does not know', async () => {
    const engine = at('loc_commons')
    expect(await said(engine, 'hold')).toMatch(/^You can't "hold" here\. Type HELP for a list of commands\./)
    expect(await said(engine, 'train electronics')).toMatch(/^You can't "train electronics" here\./)
    // The Nethermarch has them.
    expect(await said(at(nethermarch.world.start.location, nethermarch), 'hold')).not.toMatch(/You can't "hold" here/)
  })

  it('(g) an unknown verb on someone or something here says what you could do; a name may be cut short', async () => {
    const engine = at('loc_ridge_shelter')
    stay(engine, 'npc_tessa_rook')
    expect(await said(engine, 'poke tessa')).toBe("You can't poke Tessa. You could talk to her, look at her or give her something.")
    expect(await said(engine, 'operate cabinet')).toBe('You think better of it, and leave the cabinet be. You could look at it, open it or repair it.')
    expect(await said(engine, 'open cab')).toMatch(/^The door is already open\./)
    expect(await said(engine, 'read cab')).toBe('There is nothing to read on the cabinet.')
  })

  it('(h) a verb with a number picks from the list, also one command after it was set aside', async () => {
    const engine = at('loc_workshop')
    expect(await said(engine, 'l xyz')).toMatch(/Look at what\?\n {2}1\. electronics bench\n {2}2\. fabrication bench/)
    expect(await said(engine, 'l 2')).toMatch(/printer and cutting bed/)
    await said(engine, 'l xyz')
    await said(engine, 'time')
    expect(await said(engine, 'l 1')).toMatch(/electronics bench|antistatic/i)
    // Only one command longer.
    await said(engine, 'time')
    expect(await said(engine, 'l 2')).toMatch(/You see no "2" here/)
  })
})
