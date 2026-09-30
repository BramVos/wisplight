import { describe, expect, it } from 'vitest'
import { Engine, loadContent, type Content } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.29 P (Bram, 29 September 2026: Mara is "a Nacrean woman", and the
// stranger could not know what a Nacrean is): what everyone in a world knows
// (common: true) is in the journal from the start, under What you know of the
// world; every person knows it; RECALL answers from what the stranger knows;
// the Check tab names a people or the money no topic tells of.

const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')
const load = async (root: string, world: string): Promise<Content> => loadContent(await readContentFiles(root, world))

describe('M10.29 P: what everyone here knows, and RECALL', () => {
  it('puts what everyone knows in the journal from the start, and RECALL answers from it', async () => {
    const reach = await load('content', 'quietreach')
    const engine = new Engine(reach, { seed: 1 })
    engine.start()
    const known = engine.status().journal.lore.filter((l) => l.group === 'What you know of the world').map((l) => l.id)
    expect(known).toEqual(expect.arrayContaining(['nacreans', 'belt_credits', 'vesper_settlement_compact']))
    expect(said(await engine.handle('recall nacreans'))).toMatch(/^Nacreans: Nacreans are the local colonists/)
    expect(said(await engine.handle('remember the credits'))).toMatch(/^Belt credits: People in the Lantern Belt pay in Belt credits/)
    expect(said(await engine.handle('recall echo nine'))).toMatch(/Echo Nine/)
    expect(said(await engine.handle('recall the dragon kings'))).toBe('You know nothing of that.')
  })

  it('every person knows what everyone knows, and Skerrow has its own', async () => {
    const reach = await load('content', 'quietreach')
    const engine = new Engine(reach, { seed: 1 })
    const packet = (engine as unknown as { dialogue: { knowledge: { level(n: string, t: string): number } } }).dialogue.knowledge
    for (const npc of reach.npcs.keys()) expect(packet.level(npc, 'belt_credits'), npc).toBeGreaterThanOrEqual(2)
    const isle = await load('content', 'isle')
    const skerrow = new Engine(isle, { seed: 1 })
    skerrow.start()
    expect(skerrow.status().journal.lore.filter((l) => l.group === 'What you know of the world').map((l) => l.id)).toEqual(expect.arrayContaining(['the_tidemother', 'the_tide', 'coin_of_the_isles']))
  })

  it('Deepwell plays the default: only what you hear; and the Check tab names a people or the money with no topic', async () => {
    const deepwell = await load('tests/worlds', 'other')
    const engine = new Engine(deepwell, { seed: 1 })
    engine.start()
    expect(engine.status().journal.lore.some((l) => l.group === 'What you know of the world')).toBe(false)
    // The Nethermarch tells of its peoples and money since M10.31 F; without those topics, Check names them.
    expect(warnings(content).filter((w) => /^ancestry |^money: /.test(w))).toEqual([])
    const bare = { ...content, topics: new Map([...content.topics].filter(([, t]) => !t.common)) }
    expect(warnings(bare).some((w) => /^ancestry dykelander: no topic tells what Dykelander are/.test(w))).toBe(true)
    expect(warnings(bare).some((w) => /^money: no topic tells of the guilders/.test(w))).toBe(true)
    const reach = await load('content', 'quietreach')
    expect(warnings(reach).some((w) => /^money: /.test(w))).toBe(false)
  })
})
