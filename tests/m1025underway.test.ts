import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm } from '../src/engine'
import { readContentFiles } from '../src/node/content'
import { regionMap } from '../src/engine/map/region'
import { content } from './helpers'

// M10.25 (3): the world is built on the way. The calls for a region the
// stranger travels to begin when they set off; the travel text and the status
// bar say so in one line, and the arrival waits until the region is laid out.
// The same for a district they walk into. Without a model there is nothing to
// wait for.

const text = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

/** The Grey Saltings charted south of the Holleveen (the mock's expansion), and the stranger at the edge that way. */
async function charted(engine: Engine): Promise<void> {
  engine.start()
  const map = regionMap(engine.content)!
  await engine.handle(`@goto hex:${Math.floor(map.cols / 2)},0`)
  await engine.handle('explore south')
  await engine.runModels()
  expect(engine.content.topics.has('grey_saltings')).toBe(true)
}

/** Heads on from the edge to the Grey Saltings, by the choice the edge puts. */
async function setOffSouth(engine: Engine): Promise<string> {
  await engine.handle('head south')
  const go = engine.state.choice!.options.findIndex((o) => /Grey Saltings/.test(o.label)) + 1
  return text(await engine.handle(String(go)))
}

describe('M10.25: the world is built on the way', () => {
  it('the rounds start at setting off, the line is in the travel text and the status bar, and the arrival waits', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, builder: true, llm })
    await charted(engine)
    const away = await setOffSouth(engine)
    expect(away).toMatch(/go on across country for the Grey Saltings\. It takes [^.]+\.\nWhile you travel, the chronicler is laying out the Grey Saltings\./)
    // The rest of the way and the arrival wait.
    expect(away).not.toMatch(/You come to/)
    expect(engine.status().building).toBe('While you travel, the chronicler is laying out the Grey Saltings')
    expect(engine.status().location).toBe('On the way to the Grey Saltings')
    expect(engine.state.growth!.districtPending).toContain('grey_saltings:boiling_huts')
    // What needs no new place goes on; the rest hears the line.
    expect(text(await engine.handle('look'))).toMatch(/You are not there yet: the chronicler is laying out the Grey Saltings\. ARRIVE goes on at once/)
    expect(text(await engine.handle('journal'))).not.toMatch(/not there yet/)
    await engine.runModels()
    // Laid out: the next minute brings the arrival.
    const came = text(engine.tick(1))
    expect(came).toMatch(/You come to [^.]+\./)
    expect(engine.status().building).toBeUndefined()
    expect(engine.state.growth!.districts!['grey_saltings:boiling_huts']!.by).toBe('chronicler')
    // The log plays back to the same world, with nothing waiting.
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state.growth?.underway).toBeUndefined()
    expect(replayed.state.player.location).toBe(engine.state.player.location)
  })

  it('ARRIVE goes in at once, and the status bar says the chronicler is still at it', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    await charted(engine)
    await setOffSouth(engine)
    const went = text(await engine.handle('arrive'))
    expect(went).toMatch(/You come to [^.]+\.[\s\S]*The chronicler is still laying out the Grey Saltings; what is not ready yet comes into view when it is\./)
    expect(engine.status().building).toBe('The chronicler is laying out the Grey Saltings')
    expect(text(await engine.handle('look'))).not.toMatch(/not there yet/)
    await engine.runModels()
    engine.tick(1)
    expect(engine.status().building).toBeUndefined()
  })

  it('a district the stranger walks into is laid out on the way in too', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    await charted(engine)
    await setOffSouth(engine)
    await engine.runModels()
    engine.tick(1)
    // The other quarter's street leads off the market; walking in, it is laid out.
    const street = engine.state.growth!.districts!['grey_saltings:creek_landing']!
    expect(street.by).toBe('stub')
    const join = street.joins[0]!
    await engine.handle(`@goto ${join.from}`)
    const walked = text(await engine.handle(join.direction))
    expect(walked).toMatch(/^While you walk, the chronicler is laying out .+ of the Grey Saltings\.$/)
    expect(walked).not.toMatch(/working out/)
    await engine.runModels()
    expect(text(engine.tick(1))).toMatch(new RegExp(String(street.locations[0]!['name'])))
    expect(engine.state.growth!.districts!['grey_saltings:creek_landing']!.by).toBe('chronicler')
  })

  it('without a model there is nothing to wait for: the stranger simply arrives', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    await charted(engine)
    engine.setLlm(undefined)
    const away = await setOffSouth(engine)
    expect(away).toMatch(/You come to [^.]+\./)
    expect(away).not.toMatch(/laying out/)
    expect(engine.status().building).toBeUndefined()
  })

  it('a land the designer only framed is written on the way as well (think: the Amber Coast)', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    engine.setPlayMode('think')
    const map = regionMap(engine.content)!
    await engine.handle(`@goto hex:${Math.floor(map.cols / 2)},0`)
    await engine.handle('explore south')
    await engine.runModels()
    await engine.handle('time')
    await engine.handle('2')
    await engine.handle('head south')
    const go = engine.state.choice!.options.findIndex((o) => /Amber Coast/.test(o.label)) + 1
    const away = text(await engine.handle(String(go)))
    expect(away).toMatch(/While you travel, the chronicler is laying out the Amber Coast\./)
    expect(engine.state.growth!.landPending).toContain('amber_coast')
    await engine.runModels()
    expect(text(engine.tick(1))).toMatch(/You are in the Amber Coast now\./)
    expect(engine.state.growth!.lands!['amber_coast']).toBeDefined()
  })

  it('on Skerrow the boat over the sea waits the same way', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    await engine.handle('@goto loc_skerrow_harbour')
    await engine.handle('what lies beyond the sea?')
    await engine.handle('1')
    await engine.runModels()
    await engine.handle('@money 200')
    await engine.handle('@time 7')
    const away = text(await engine.handle('take the boat to the grey saltings'))
    expect(away).toMatch(/travel by the boat to the Grey Saltings from Skerrow Hythe to the Grey Saltings\. It takes 2 days\.\nWhile you travel, the chronicler is laying out the Grey Saltings\./)
    await engine.runModels()
    expect(text(engine.tick(1))).toMatch(/come ashore|You come to/)
  })
})
