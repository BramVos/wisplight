import { describe, expect, it } from 'vitest'
import { checkContent, Engine, loadContent, warnings, type ContentFile } from '../src/engine'
import { wantFarPlace } from '../src/engine/growth/far'
import { readContentFiles } from '../src/node/content'

// M10.23: a border is content, never distance. Every way from one land into
// another goes through an area with `border: true`; crossing, the scene shows
// the land's own line, the money is changed at its rate (less the changer's
// share), and the chronicle keeps it. Where an area blends with the land the
// stranger comes from, both coins are good and nothing is changed.

const deepwellFiles = () => readContentFiles('tests/worlds', 'other')
const text = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

describe('M10.23: borders', () => {
  it('crosses into the Kessler Claim at its gate: the scene, the money changed, the chronicle; and back again', async () => {
    const deepwell = loadContent(await deepwellFiles())
    const engine = new Engine(deepwell, { seed: 5, builder: true })
    engine.start()
    await engine.handle('@goto loc_deepwell_works_platform')
    expect(engine.state.player.land).toBeUndefined()
    const into = text(await engine.handle('east'))
    expect(into).toMatch(/You are in the Kessler Claim now\. At the gate a machine takes your chits/)
    // 90 chits, less 2% for the changer, two scrip to the chit.
    expect(into).toMatch(/The changer changes your 4 cr 10 ch into 178 sc, and keeps 2 sc for it\./)
    expect(engine.state.player.money).toBe(89)
    expect(engine.state.player.land).toBe('kessler_claim')
    expect(engine.state.news!.facts.find((f) => f.kind === 'crossing')).toMatchObject({ belang: 0, title: 'the stranger crossed into the Kessler Claim' })
    // Walking about inside the land crosses nothing.
    expect(text(await engine.handle('north'))).not.toMatch(/You are in/)
    await engine.handle('south')
    const back = text(await engine.handle('west'))
    expect(back).toMatch(/You are back in the Oru system\./)
    expect(back).toMatch(/The changer changes your 178 sc into 4 cr 8 ch, and keeps 1 ch for it\./)
    expect(engine.state.player.land).toBeUndefined()
    // The log plays back to the same purse and land.
    const replayed = await Engine.replay(deepwell, 5, engine.save().log)
    expect(replayed.state.player.money).toBe(engine.state.player.money)
    expect(replayed.state.news!.facts.filter((f) => f.kind === 'crossing')).toHaveLength(2)
  })

  it('changes nothing where the area the stranger leaves blends with the land they go into: both coins are good', async () => {
    const files = (await deepwellFiles()).map((f) => (f.path.endsWith('data/areas.yaml') && !f.path.includes('/lands/') ? { ...f, text: f.text.replace("summary: The mine at the end of the tram line", 'blend: kessler_claim\n    summary: The mine at the end of the tram line') } : f))
    const deepwell = loadContent(files)
    const engine = new Engine(deepwell, { seed: 5, builder: true })
    engine.start()
    await engine.handle('@goto loc_deepwell_works_platform')
    const into = text(await engine.handle('east'))
    expect(into).toMatch(/You are in the Kessler Claim now\./)
    expect(into).not.toMatch(/changer/)
    expect(engine.state.player.money).toBe(90)
  })

  it('refuses a way from one land into another that goes through no border, by foot or by a line', async () => {
    const files = await deepwellFiles()
    const load = (edit: (f: ContentFile) => ContentFile) => {
      try {
        loadContent(files.map(edit))
        return ''
      } catch (error) {
        return String(error)
      }
    }
    const noBorder = (f: ContentFile) => (f.path.endsWith('kessler_claim/data/areas.yaml') ? { ...f, text: f.text.replace('border: true', 'border: false') } : f)
    expect(load(noBorder)).toMatch(/loc_deepwell_works_platform: the way east to loc_claim_gate crosses from the home land into the land kessler_claim, and neither area is a border/)
    const isle = await readContentFiles('content', 'isle')
    const boat = isle.map((f) => (f.path.endsWith('western_isles/data/areas.yaml') ? { ...f, text: f.text.replace('border: true', 'border: false') } : f))
    expect(() => loadContent(boat)).toThrow(/passage white_boat: loc_skerrow_harbour and loc_ynys_wen_landing are in different lands, and neither area is a border/)
  })

  it('warns of a land nobody can cross into', async () => {
    const files = (await deepwellFiles()).map((f) => (f.path.endsWith('kessler_claim/data/areas.yaml') ? { ...f, text: f.text.replace('border: true', 'border: false') } : f.path.endsWith('ice_works/locations.yaml') ? { ...f, text: f.text.replace('      east: { to: loc_claim_gate, minutes: 40 }\n', '') } : f.path.endsWith('claim_gate/locations.yaml') ? { ...f, text: f.text.replace('      west: { to: loc_deepwell_works_platform, minutes: 40 }\n', '') } : f))
    expect(warnings(loadContent(files))).toContain('land kessler_claim: none of its areas is a border (border: true), so nobody can cross into it')
  })

  it('makes a far place of another land a border of that land, and the stranger crosses in there', async () => {
    const files = (await readContentFiles('content', 'isle')).map((f) => (f.path.endsWith('isle/data/topics.yaml') ? { ...f, text: f.text.replace('  - id: havenmoor\n    name: Havenmoor\n', '  - id: havenmoor\n    name: Havenmoor\n    land: western_isles\n') } : f))
    const isle = loadContent(files)
    const engine = new Engine(isle, { seed: 4, builder: true })
    engine.start()
    wantFarPlace(engine.world, 'havenmoor', { from: 'loc_skerrow_harbour', minutes: 2880, by: 'havenmoor_packet', water: true })
    const area = engine.content.areas.get(engine.state.growth!.far!['havenmoor']!.area['id'] as string)!
    expect(area).toMatchObject({ land: 'western_isles', border: true })
    expect(checkContent(engine.content)).toEqual([])
  })
})
