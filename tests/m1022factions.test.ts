import { describe, expect, it } from 'vitest'
import { checkContent, Engine, loadContent, MockLlm } from '../src/engine'
import { factionPage } from '../src/engine/social/factions'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.22: factions grow, within bounds. A faction has seats (a place with what
// it wants there); a town that grows in play brings no new factions, but a
// district may get a seat of one the world has.

describe('M10.22: seats of factions', () => {
  it('gives a district a seat of a faction the world has, never of one it made up, and the faction page names it once the stranger was there', async () => {
    const engine = new Engine(content, { seed: 6, builder: true, llm: new MockLlm('good') })
    engine.start()
    await engine.handle('@goto loc_oude_zijl_sluice')
    for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
    await engine.handle('1')
    await engine.handle('@goto loc_graafhaven_market')
    await engine.handle('@time 11')
    await engine.handle('ask lammert about the holleveen')
    await engine.runModels()
    const first = [...content.factions.keys()].sort()[0]!
    const gate = engine.state.growth!.districts!['graafhaven:gate']!
    expect(gate.seats).toEqual([{ faction: first, at: 'loc_graafhaven_gate_chandlery', wants: 'A say in who supplies the ships, and a share of what they pay.' }])
    expect(engine.content.factions.has('made_up_league')).toBe(false)
    expect(engine.content.factions.get(first)!.seats.map((s) => s.at)).toContain('loc_graafhaven_gate_chandlery')
    expect(checkContent(engine.content)).toEqual([])
    // Known once the stranger stood there.
    ;(engine.state.reputation ??= {})[first] = 0
    expect(factionPage(engine.world, first)!.join('\n')).not.toMatch(/The Chandlery/)
    await engine.handle('bye')
    await engine.handle(gate.joins[0]!.direction)
    expect(factionPage(engine.world, first)!.join('\n')).toMatch(/Also at: .*The Chandlery \(A say in who supplies the ships/)
  })

  it('reads seats from the content of each world, and refuses one at a place that does not exist', async () => {
    expect(content.factions.get('lantern_church')!.seats.map((s) => s.at)).toEqual(['loc_veenhoek_chapel', 'kloosterveen'])
    const isle = loadContent(await readContentFiles('content', 'isle'))
    expect(isle.factions.get('star_sailors')!.seats).toHaveLength(1)
    // Deepwell names none: the neutral default.
    const deepwell = loadContent(await readContentFiles('tests/worlds', 'other'))
    expect([...deepwell.factions.values()].every((f) => f.seats.length === 0)).toBe(true)
    const files = await readContentFiles('content', 'isle')
    const bad = files.map((f) => (f.path.endsWith('factions.yaml') ? { ...f, text: f.text.replace('at: loc_skerrow_harbour', 'at: loc_nowhere') } : f))
    expect(() => loadContent(bad)).toThrow(/star_sailors\.seats: loc_nowhere is no place or area/)
  })
})
