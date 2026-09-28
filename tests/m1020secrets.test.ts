import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { fieldsOf, FIELD_NOTES, stepFields } from '../src/engine/contract'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// Milestone M10.20 (docs/ROADMAP.md): a secret may be about a person or a
// place (found building The Quiet Reach: a proposal with a secret about a
// person did not load). The game knows every person, place and area as a
// topic already; now the load check does too, and the contract says so.

const worlds = join(import.meta.dirname, 'worlds')

describe('M10.20: a secret about a person or a place', () => {
  it('Deepwell: Teo tells someone he holds dear about Ilse, and the stranger learns the place', async () => {
    const deepwell = await loadContentFromDir(worlds, 'other')
    expect(deepwell.npcs.get('npc_teo_marsh')!.secrets[0]).toMatchObject({ about: ['npc_ilse_varga', 'loc_deepwell_warden_office'], teaches: 'loc_deepwell_warden_office' })
    const engine = new Engine(deepwell, { seed: 5, builder: true })
    engine.start()
    for (const command of ['@goto loc_deepwell_fab_shop', '@bring teo', '@like teo 60 60']) await engine.handle(command)
    const said = (await engine.handle('ask teo about ilse')).map((o) => o.text).join('\n')
    expect(engine.state.flags?.['secret:npc_teo_marsh:second_key']).toBe(true)
    // Without a model the set line leads in; the model tells the secret itself.
    expect(said).toMatch(/it stays between us/)
    expect(engine.state.player.journal?.['loc_deepwell_warden_office']).toBeDefined()
  })

  it('an id that is no topic, person, place or area still does not load; the contract and the step say what may go in', async () => {
    const files = await readContentFiles(worlds, 'other')
    const wrong = files.map((f) => (f.path.endsWith('domes/npcs.yaml') ? { ...f, text: f.text.replace('about: [npc_ilse_varga, loc_deepwell_warden_office]', 'about: [npc_ilse_varga, nobody_at_all, area_deepwell_domes]') } : f))
    expect(() => loadContent(wrong)).toThrow(/npc_teo_marsh\.secrets\.second_key: about nobody_at_all, which is no topic, person, place or area_<id>/)
    expect(() => loadContent(wrong)).not.toThrow(/about area_deepwell_domes/)
    expect(fieldsOf('npcs').some((f) => f.name === 'secrets')).toBe(true)
    expect(FIELD_NOTES['npcs']!.join(' ')).toMatch(/a person \(an NPC id\), a place \(a location id\) or an area/)
    expect(stepFields([{ kind: 'npcs' }])).toMatch(/Note: `secrets`: `about` and `teaches` take ids/)
  })
})
