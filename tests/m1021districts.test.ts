import { describe, expect, it } from 'vitest'
import { checkContent, Engine, loadContent, MockLlm } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.21: a town grows by district, not all at once. The world book names a
// far town's quarters; the first is made playable when the stranger does
// something there, each other one when they go there by its street, and
// passing through makes none. The chronicler writes the words; the engine
// fixes the shape; the whole is checked as content and kept in the save.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const districts = (engine: Engine) => Object.values(engine.state.growth?.districts ?? {}).map((d) => `${d.id}:${d.by}`)

/** To Graafhaven as a player goes (so the log holds it all): west from Oude Zijl to the edge, and on. */
async function inGraafhaven(engine: Engine): Promise<void> {
  engine.start()
  await engine.handle('@goto loc_oude_zijl_sluice')
  for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
  await engine.handle('1')
  await engine.handle('@goto loc_graafhaven_market')
  await engine.handle('@time 11')
}

describe('M10.21: a town grows by district', () => {
  it('makes no district for passing through, the first when the stranger does something there, another when they go into it', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    await inGraafhaven(engine)
    await engine.handle('look')
    await engine.handle('in')
    await engine.handle('out')
    expect(districts(engine)).toEqual([])
    await engine.handle('ask lammert about the holleveen')
    await engine.handle('bye')
    expect(districts(engine)).toEqual(['gate:template', 'guilds:stub', 'court:stub', 'brandaris:stub', 'harbour:stub'])
    // The streets lead off the market; walking into one makes that district.
    const guilds = engine.state.growth!.districts!['graafhaven:guilds']!
    const into = said(await engine.handle(guilds.joins[0]!.direction))
    expect(into).toMatch(/You come into the guild houses of Graafhaven\. Tall guild houses round a square/)
    expect(engine.state.growth!.districts!['graafhaven:guilds']!.by).toBe('template')
    expect(said(await engine.handle('look'))).toMatch(/Here: \w+ the labourer/)
    expect(checkContent(engine.content)).toEqual([])
    // The others wait until the stranger goes there.
    expect(engine.state.growth!.districts!['graafhaven:court']!.by).toBe('stub')
  })

  it('with a model the chronicler words a district; the log plays back to the same town; words that break the rules are not used', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 6, builder: true, llm })
    await inGraafhaven(engine)
    const asked = said(await engine.handle('ask lammert about the holleveen'))
    expect(asked).toMatch(/The chronicler is working out the Dyke Gate and the fish market of Graafhaven\./)
    await engine.runModels()
    const gate = engine.state.growth!.districts!['graafhaven:gate']!
    expect(gate.by).toBe('chronicler')
    expect(gate.locations.map((l) => l['name'])).toEqual(['The Chandlery', "The Cooper's Yard"])
    expect(gate.npcs.map((n) => n['name'])).toEqual(['Hester Vlieland', 'Joris Kuipers'])
    expect(llm.calls.filter((c) => c.schemaName === 'district')).toHaveLength(1)
    expect(checkContent(engine.content)).toEqual([])
    const replayed = await Engine.replay(content, 6, engine.save().log)
    expect(replayed.state.growth!.districts).toEqual(engine.state.growth!.districts)
    // A second visit, or asking again, costs nothing.
    await engine.handle('bye')
    await engine.handle('ask lammert about graafhaven')
    await engine.runModels()
    expect(llm.calls.filter((c) => c.schemaName === 'district')).toHaveLength(1)
    // Words that break the rules: the template takes their place.
    const strict = new Engine(content, { seed: 7, builder: true, llm: new MockLlm('invalid') })
    await inGraafhaven(strict)
    await strict.handle('ask lammert about the holleveen')
    await strict.runModels()
    expect(strict.state.growth!.districts!['graafhaven:gate']!.by).toBe('template')
  })

  it('grows Havenmoor on the mainland of Skerrow the same way, and a town without districts not at all', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 8, builder: true })
    engine.start()
    await engine.handle('@goto loc_skerrow_harbour')
    // Over the sea by the packet: the far place as the line makes it.
    const far = await import('../src/engine/growth/far')
    far.wantFarPlace(engine.world, 'havenmoor', { from: 'loc_skerrow_harbour', minutes: 2880, by: 'havenmoor_packet', water: true })
    const quay = String(engine.state.growth!.far!['havenmoor']!.locations[0]!['id'])
    await engine.handle(`@goto ${quay}`)
    await engine.handle('in')
    await engine.handle('@time 11')
    const here = engine.world.npcsAt(engine.state.player.location)
    await engine.handle(`ask ${engine.world.npc(here[0]!).name.split(' ')[0]} about skerrow`)
    expect(districts(engine)).toEqual(['quays:template', 'upper_town:stub'])
    // Hunnenloo names no districts: its far place is all there is.
    const plain = new Engine(content, { seed: 9, builder: true })
    plain.start()
    ;(plain.state.player.journal ??= {})['hunnenloo'] = plain.world.now
    await plain.handle('travel to hunnenloo on foot')
    await plain.handle('@goto loc_hunnenloo_market')
    await plain.handle('@time 11')
    await plain.handle('ask about the heath')
    expect(districts(plain)).toEqual([])
  })

  it('names a town whose districts can never be reached under Check', () => {
    const topics = new Map(content.topics)
    topics.set('nowhere', { ...content.topics.get('graafhaven')!, id: 'nowhere', pos: undefined })
    expect(warnings({ ...content, topics }).join('\n')).toMatch(/topic nowhere: its districts can never be reached/)
    expect(warnings(content).join('\n')).not.toMatch(/districts can never be reached/)
  })
})
