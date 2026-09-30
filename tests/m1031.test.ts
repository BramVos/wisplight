import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { content } from './helpers'

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
