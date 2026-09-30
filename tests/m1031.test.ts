import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

const quietReach = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

// M10.31, the builder's items: F (the Nethermarch's peoples and money as what
// everyone knows), D (walking to a place you only heard of) and B (a hidden
// exit).

const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

describe('M10.31 F: what everyone in the Nethermarch knows', () => {
  it('knows its peoples, its money, the Count\'s men, the town and the priory from the start', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const known = engine.status().journal.lore.filter((l) => l.group === 'What you know of the world').map((l) => l.id)
    expect(known).toEqual(expect.arrayContaining(['the_fenfolk', 'the_dykelanders', 'the_heathborn', 'the_changelings', 'guilders_and_stuivers', 'the_counts_men', 'the_burghers_of_waagdam', 'the_priory']))
    expect(said(await engine.handle('recall veenvolk'))).toMatch(/The fenfolk are the people of the high fen/)
    expect(said(await engine.handle('recall stuivers'))).toMatch(/A guilder is twenty stuivers, and a stuiver is eight duiten/)
    expect(said(await engine.handle('recall the count\'s men'))).toMatch(/keep order and raise taxes/)
  })
})

describe('M10.31 D: walking to a place you only heard of', () => {
  it('goes as far as the places you know, then says which way you were pointed; a place never heard of stays unknown', async () => {
    const engine = new Engine(quietReach, { seed: 7 })
    engine.start()
    const heard = (id: string) => ((engine.state.player.journal ??= {})[id] = engine.world.now)
    expect(said(await engine.handle('walk to the hangar'))).toBe('You know no such place.')
    heard('loc_peregrine_hangar')
    expect(said(await engine.handle('walk to the hangar'))).toBe('Peregrine Hangar? Northeast from here, and on from there, they said.')
    heard('loc_workshop')
    expect(said(await engine.handle('walk to the hangar'))).toBe('Peregrine Hangar? Through Workshop, they said.')
    expect(engine.state.player.location).toBe('loc_arrival_lock')
    // Once the Workshop is seen, the walk goes that far.
    await engine.handle('northeast')
    await engine.handle('southwest')
    const walked = said(await engine.handle('walk to the hangar'))
    expect(engine.state.player.location).toBe('loc_workshop')
    expect(walked).toMatch(/Peregrine Hangar\? In from here, they said\.$/)
  })
})
