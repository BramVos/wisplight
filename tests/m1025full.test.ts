import { describe, expect, it } from 'vitest'
import { checkContent, Engine, MockLlm } from '../src/engine'
import { regionRounds } from '../src/engine/growth/rounds'
import { FULL_ROUNDS } from '../src/engine/growth/regionfull'
import { regionMap } from '../src/engine/map/region'
import { content } from './helpers'

// M10.25: how full a new region is built is the player's choice. In full,
// the world build's own steps run over a region charted in play (Places,
// Professions, People, Economy, Signals, with the polish round after the
// places), its outline and the frame for the designer's answer; what they
// make that is the region's is kept as a layer of the save, and the story
// round comes last.

const said = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

/** South of the Holleveen, charted by a round at the edge, and on the way there: what setting off said. */
async function toTheSaltings(engine: Engine, setting: string): Promise<string> {
  engine.start()
  await engine.handle(`frames region ${setting}`)
  const map = regionMap(engine.content)!
  await engine.handle(`@goto hex:${Math.floor(map.cols / 2)},0`)
  await engine.handle('explore south')
  await engine.runModels()
  await engine.handle('head south')
  const go = engine.state.choice!.options.findIndex((o) => /Grey Saltings/.test(o.label)) + 1
  return said(await engine.handle(String(go)))
}

describe('M10.25: a new region built in full', () => {
  it('says what a charted region still needs by the setting, and nothing for a far place of the world book', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    await toTheSaltings(engine, 'full')
    const rounds = regionRounds(engine.world, 'grey_saltings').map((r) => r.key)
    expect(rounds).toEqual(['district:grey_saltings:boiling_huts', ...FULL_ROUNDS.map((r) => `step:grey_saltings:${r}`), 'story:grey_saltings'])
    await engine.handle('frames region story')
    expect(regionRounds(engine.world, 'grey_saltings').map((r) => r.key)).toEqual(['district:grey_saltings:boiling_huts', 'story:grey_saltings'])
    await engine.handle('frames region outline')
    expect(regionRounds(engine.world, 'grey_saltings')).toEqual([])
    expect(regionRounds(engine.world, 'graafhaven')).toEqual([])
  }, 60_000)

  it('runs the world build over the region with the mock, keeps what is the region\'s, and then its story', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, builder: true, llm })
    await toTheSaltings(engine, 'full')
    // Arrived: the rounds are asked for (no price with the mock, so no question), and run.
    await engine.handle('look')
    for (let i = 0; i < 4; i++) {
      await engine.runModels()
      await engine.handle('look')
    }
    const full = engine.state.growth!.fulls!['grey_saltings']!
    expect([...full.done].sort()).toEqual([...FULL_ROUNDS].sort())
    const area = String(engine.state.growth!.far!['grey_saltings']!.area['id'])
    expect(engine.content.locations.get(`loc_${area}_back_lane`)?.area).toBe(area)
    expect(engine.content.npcs.has(`npc_wobbe_${area}`)).toBe(true)
    expect(engine.content.professions.has(`${area}_netmender`)).toBe(true)
    expect(engine.content.items.has(`${area}_mended_net`)).toBe(true)
    // The steps were the world build's own, over the region, with the fixed part first.
    const steps = llm.calls.filter((c) => c.schemaName === 'world_step')
    expect(steps.map((c) => c.meta?.['step'])).toEqual(['places', 'professions', 'people', 'economy', 'watcher'])
    expect(steps[0]!.system).toMatch(/^YOU ARE BUILDING A NEW WORLD WITH THE DESIGNER/)
    expect(steps[0]!.system).toMatch(/IN PLAY: YOU ARE BUILDING ONE REGION OF THIS WORLD: the Grey Saltings/)
    expect(steps[0]!.prompt).toMatch(/THE DESIGNER SAYS: the Grey Saltings: /)
    expect(llm.calls.some((c) => c.schemaName === 'world_polish')).toBe(true)
    // Then its story, last.
    expect(engine.state.growth!.stories!['grey_saltings']).toBeDefined()
    expect(checkContent(engine.content)).toEqual([])
    expect(engine.chronicle()).toMatch(/the Grey Saltings built in full/i)
    // The log plays back to the same region, without the model.
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state.growth!.fulls).toEqual(engine.state.growth!.fulls)
    expect(replayed.content.npcs.has(`npc_wobbe_${area}`)).toBe(true)
  }, 120_000)

  it('asks once for the whole build, above the player\'s threshold', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.world.costAsk = (id) => (id.startsWith('full:') ? 0.3 : undefined)
    // The rounds start at departure (underway.ts), so the question comes as the stranger sets off.
    const asked = await toTheSaltings(engine, 'full')
    expect(asked).toMatch(/Building the Grey Saltings in full, in 6 rounds costs about \$1\.80 with the model you chose\./)
  }, 60_000)
})
