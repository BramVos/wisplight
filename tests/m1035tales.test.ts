import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { taleWarnings } from '../src/engine/builder'
import { Knowledge } from '../src/engine/dialogue/knowledge'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.35 A, a bank of tales per person: what is fun came from the model
// alone, for the content gave a person only facts, sample lines and
// knowledge. Sana's "That's Mara's chair, that's Tessa's, and Niko's is the
// empty one" is the kind of line that works; now it is content, true to the
// world, told in the voice's own words when the talk comes to it.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const base = await loadContentFromDir(root, 'base')
const isle = await loadContentFromDir(root, 'isle')
const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')

describe('M10.35 A: a bank of tales per person', () => {
  it('gives every person of the three worlds three to five tales, about people and places that are there, and Check finds nothing', () => {
    for (const world of [quiet, isle, base]) {
      for (const n of world.npcs.values()) {
        expect(n.tales.length, n.id).toBeGreaterThanOrEqual(3)
        expect(n.tales.length, n.id).toBeLessThanOrEqual(5)
      }
      expect(taleWarnings(world)).toEqual([])
    }
  })

  it('gives the voice a tale with its topic when the talk asks for one, by the rule for lore, and never one about the dead', () => {
    const engine = new Engine(quiet, { seed: 1 })
    engine.start()
    const commons = engine.topics.find('the Commons')!
    const knowledge = new Knowledge(engine.world, engine.topics)
    expect(knowledge.packet('npc_sana_holt', [commons], true).known[0]).toMatchObject({ story: expect.stringMatching(/^Sana keeps the chairs at the long table as they were/), tale: true })
    // Not asked for a story: facts only.
    expect(knowledge.packet('npc_sana_holt', [commons]).known[0]!.story).toBeUndefined()
    const isleGame = new Engine(isle, { seed: 1 })
    isleGame.start()
    const wenna = isleGame.topics.find('Wenna')!
    isleGame.state.npcs['npc_wenna']!.dead = true
    expect(new Knowledge(isleGame.world, isleGame.topics).packet('npc_maren', [wenna], true).known[0]?.tale).toBeUndefined()
  })

  it('Check names a tale with a name the world does not have, or a truth a story keeps hidden; a tale about nothing there does not load', async () => {
    const npcs = new Map(base.npcs)
    const pim = npcs.get('npc_pim')!
    npcs.set(pim.id, { ...pim, tales: [{ text: 'Pim says Bartholomew from the city once gave him a penny.', about: ['npc_pim'] }, { text: 'He knows the grey cat is Fenna, and tells nobody.', about: ['loc_visser_house'] }] })
    const warned = taleWarnings({ ...base, npcs })
    expect(warned).toContainEqual(expect.stringMatching(/^npc_pim: a tale names Bartholomew, who or what this world does not have/))
    expect(warned).toContainEqual(expect.stringMatching(/^npc_pim: a tale tells what The Grey Cat on the Doorstep keeps hidden/))
    const files = await readContentFiles(root, 'quietreach')
    const bad = files.map((f) => (f.path.endsWith('port_vesper/npcs.yaml') ? { ...f, text: f.text.replace('about: [loc_medical_bay]', 'about: [loc_nowhere]') } : f))
    expect(() => loadContent(bad)).toThrow(/a tale is about loc_nowhere, which is no person, place, area or topic/)
  })

  it('Deepwell has no tales: the voice has its facts only, and Check says nothing', () => {
    expect([...deepwell.npcs.values()].every((n) => n.tales.length === 0)).toBe(true)
    expect(taleWarnings(deepwell)).toEqual([])
  })
})
