import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { offer } from '../src/engine/choice'
import { lookThere } from '../src/engine/looking'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.29, from Bram's playtest of The Quiet Reach: `l hangar` in the Workshop
// named the Peregrine Hangar and told of the experimental ship behind its
// sealed door, a place he had never seen; and "Use what? 1. electronics
// bench" did not say how to leave it, so he typed x, which is examine.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

async function inWorkshop(): Promise<Engine> {
  const engine = new Engine(quiet, { seed: 1 })
  engine.start()
  engine.world.state.player.location = 'loc_workshop'
  return engine
}
const said = async (engine: Engine, command: string) => (await engine.handle(command)).map((o) => o.text).join('\n')

describe('M10.29: looking through a way out shows only what can be seen from here', () => {
  it('finds the hangar door by any word of its name, not the hangar behind it', async () => {
    const engine = await inWorkshop()
    const text = await said(engine, 'l hangar')
    expect(text).not.toMatch(/experimental ship/)
    expect(text).not.toMatch(/Peregrine Hangar/)
  })

  it('looking in says the way and the door, and names the place only once heard of, and tells of it once seen', async () => {
    const engine = await inWorkshop()
    const player = engine.world.state.player
    delete player.journal?.['loc_peregrine_hangar']
    player.seen = (player.seen ?? []).filter((id) => id !== 'loc_peregrine_hangar')
    const look = (words: string) => lookThere(engine.world, words)?.text ?? ''
    const unknown = look('in')
    expect(unknown).toMatch(/^In: .*3 minutes on foot\.$/)
    expect(unknown).not.toMatch(/Peregrine|experimental/)
    ;(player.journal ??= {})['loc_peregrine_hangar'] = 1
    const heard = look('in')
    expect(heard).toMatch(/^In: Peregrine Hangar, as you have heard; you have not been there\./)
    expect(heard).not.toMatch(/experimental/)
    player.seen = [...(player.seen ?? []), 'loc_peregrine_hangar']
    expect(look('in')).toMatch(/^In: Peregrine Hangar\. The locked hangar/)
  })

  it('a way out with no door to see is a way not taken yet (the Nethermarch)', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const player = engine.world.state.player
    const here = engine.world.content.locations.get(player.location)!
    const [dir, exit] = Object.entries(here.exits)[0]!
    delete player.journal?.[exit.to]
    player.seen = (player.seen ?? []).filter((id) => id !== exit.to)
    const text = lookThere(engine.world, dir)?.text ?? ''
    expect(text).toMatch(/It is (a few steps|\d+ (minutes|hours) on foot)\.$/)
    expect(text).not.toContain(engine.world.location(exit.to).name)
  })
})

describe('M10.29: a choice says how to leave it', () => {
  it('ends the numbered list with the way out', async () => {
    const engine = await inWorkshop()
    const text = offer(engine.world, 'Use what?', [{ label: 'electronics bench', command: 'use electronics bench' }, { label: 'fabrication bench', command: 'use fabrication bench' }])[0]!.text
    expect(text).toBe('Use what?\n  1. electronics bench\n  2. fabrication bench\n(a number, the name, or anything else to leave it)')
  })
})
