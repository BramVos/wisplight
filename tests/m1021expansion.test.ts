import { describe, expect, it } from 'vitest'
import { discoveredBook, Engine, loadContent, MockLlm } from '../src/engine'
import { readContentFiles } from '../src/node/content'
import { regionMap } from '../src/engine/map/region'
import { content } from './helpers'

// M10.21: the world book grows at its edge. Where nothing is known beyond an
// edge of the map and the stranger chooses to go on, the chronicler charts
// one new region or land that way, within the frame; by the play mode it is
// charted at once (continue), chosen from two (think) or proposed (direct).
// It becomes a far place with its quarters, known to the stranger, canon from
// then on, and the layers of M10.21 make it playable when they go there.

const text = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

/** On the south edge of the Holleveen, in the middle (a build command, so the log has it). */
async function onSouthEdge(engine: Engine): Promise<void> {
  const map = regionMap(engine.content)!
  await engine.handle(`@goto hex:${Math.floor(map.cols / 2)},0`)
}

describe('M10.21: a round at the edge of the world book', () => {
  it('continue: charts a region beyond the edge, known from then on, and the way on goes there', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, builder: true, llm })
    engine.start()
    await onSouthEdge(engine)
    expect(text(await engine.handle('explore south'))).toMatch(/The chronicler is working out what lies south\./)
    await engine.runModels()
    const t = engine.content.topics.get('grey_saltings')!
    expect(t).toMatchObject({ kind: 'place', name: 'the Grey Saltings' })
    expect(t.districts.map((d) => d.id)).toEqual(['boiling_huts', 'creek_landing'])
    expect(engine.state.player.journal?.['grey_saltings']).toBeDefined()
    expect(engine.state.news!.facts.some((f) => f.kind === 'expansion' && /the salt comes into the land/.test(f.text.precise))).toBe(true)
    expect(text(await engine.handle('look'))).toMatch(/What lies south, as far as you can make out: the Grey Saltings\./)
    // At the edge the way on goes there now, on foot; and it is made playable when they go.
    const edge = text(await engine.handle('head south'))
    expect(edge).toMatch(/Go on to the Grey Saltings on foot, about 2 days south/)
    const go = engine.state.choice!.options.findIndex((o) => /Grey Saltings/.test(o.label)) + 1
    await engine.handle(String(go))
    expect(engine.state.growth!.far!['grey_saltings']).toBeDefined()
    // South of the edge, the road leaves southwards and runs back north (M10.25: the map's y runs north).
    expect(engine.state.growth!.far!['grey_saltings']!.link.direction).toMatch(/^south/)
    expect((engine.state.growth!.far!['grey_saltings']!.locations[0]!['description'] as { day: string }).day).toMatch(/the road back to the Holleveen runs north/)
    // The game's own book has it, beyond the book, with how it came about.
    expect(discoveredBook(engine)).toMatch(/## \d+\. Beyond the book[\s\S]*### The Grey Saltings[\s\S]*How it came about: charted on .*The world book says the salt comes into the land/)
    // Once: a second round waits for nothing, and the log plays back to the same world.
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.content.topics.get('grey_saltings')?.pos).toEqual(t.pos)
    expect(llm.calls.filter((c) => c.schemaName === 'expansion')).toHaveLength(1)
  })

  it('think: two outlines to choose between in the world; a land comes with its own frame', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    engine.setPlayMode('think')
    await onSouthEdge(engine)
    await engine.handle('explore south')
    await engine.runModels()
    const shown = text(await engine.handle('time'))
    expect(shown).toMatch(/Two things are said of what lies south\. Which will you believe, and go looking for\?\n {2}1\. the Grey Saltings: .*\n {2}2\. the Amber Coast: .*\n {2}3\. Neither/)
    await engine.handle('2')
    const land = engine.content.lands.get('amber_coast')!
    expect(land.frame).toMatch(/^WORLD: /)
    expect(land.frame).toMatch(/LAND: The Amber Coast/)
    expect(engine.content.topics.get('amber_coast')).toMatchObject({ land: 'amber_coast' })
    expect(engine.content.topics.has('grey_saltings')).toBe(false)
  })

  it('direct: what it would chart is a proposal first', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    engine.setPlayMode('direct')
    await onSouthEdge(engine)
    await engine.handle('explore south')
    await engine.runModels()
    expect(engine.content.topics.has('grey_saltings')).toBe(false)
    expect(text(await engine.handle('proposals'))).toMatch(/What lies beyond the edge \(proposal_\d+\):\n {2}\+ a region south, 2 days on: the Grey Saltings\./)
    const id = engine.state.modes!.proposals.find((p) => p.kind === 'expansion')!.id
    await engine.handle(`accept ${id}`)
    expect(engine.content.topics.has('grey_saltings')).toBe(true)
  })

  it('without a model the edge stays the edge, and nothing is offered past it', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    engine.start()
    await onSouthEdge(engine)
    expect(text(await engine.handle('explore south'))).toMatch(/nobody has told you what lies there, and you turn back/)
    expect(engine.state.growth?.expansions?.pending ?? []).toEqual([])
  })

  it('refuses what does not fit: a name that is taken, quarters too few, too far', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('invalid') })
    engine.start()
    await onSouthEdge(engine)
    await engine.handle('explore south')
    await engine.runModels()
    expect(Object.keys(engine.state.growth!.expansions!.made)).toEqual([])
    expect(text(await engine.handle('look'))).toMatch(/Nobody can tell you more of what lies that way/)
  })

  it('plays on Skerrow too, past the island\'s edge into the sea; Deepwell has no map, so no edge to go past', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    const map = regionMap(engine.content)!
    await engine.handle(`@goto hex:${Math.floor(map.cols / 2)},${map.rows - 1}`)
    expect(text(await engine.handle('explore north'))).toMatch(/The chronicler is working out what lies north\./)
    await engine.runModels()
    expect(engine.content.topics.get('grey_saltings')?.districts).toHaveLength(2)
    const deepwell = new Engine(loadContent(await readContentFiles('tests/worlds', 'other')), { seed: 3, builder: true, llm: new MockLlm('good') })
    deepwell.start()
    expect(text(await deepwell.handle('explore north'))).toMatch(/only from the edge of the map/)
  })

  it("asked at a harbour what lies beyond the sea, a skipper may be found: the round charts a place across the water, and a boat goes there", async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    await engine.handle('@goto loc_skerrow_harbour')
    const asked = text(await engine.handle('what lies beyond the sea?'))
    expect(asked).toMatch(/Will you look for a skipper who will sail further\?\n {2}1\. Find a skipper who will sail further out/)
    expect(text(await engine.handle('1'))).toMatch(/The chronicler is working out what lies (north|east|south|west)\./)
    await engine.runModels()
    const boat = engine.content.passages.get('grey_saltings_boat')!
    expect(boat).toMatchObject({ stops: ['loc_skerrow_harbour', 'grey_saltings'], water: true })
    expect(text(await engine.handle('look'))).toMatch(/What lies across the water .*: the Grey Saltings\. .*A boat goes there from Skerrow Hythe, the Harbour\./)
    // The boat takes the stranger there, and it is made playable on arrival.
    await engine.handle('@money 200')
    await engine.handle('@time 7')
    expect(text(await engine.handle('take the boat to the grey saltings'))).toMatch(/travel by the boat to the Grey Saltings from Skerrow Hythe to the Grey Saltings\. It takes 2 days\./)
    expect(engine.state.growth!.far!['grey_saltings']).toBeDefined()
    // Without a model the quay has no more to say.
    const plain = new Engine(isle, { seed: 3, builder: true })
    plain.start()
    await plain.handle('@goto loc_skerrow_harbour')
    expect(text(await plain.handle('what lies beyond the sea?'))).toMatch(/Nobody on the quay can tell you what lies past where the boats go\./)
    expect(plain.state.choice).toBeUndefined()
  })
})
