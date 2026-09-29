import { describe, expect, it } from 'vitest'
import { Engine, frameOf, loadContent, MockLlm, type Content } from '../src/engine'
import { unwritten } from '../src/engine/growth/landwrite'
import { framedOnly } from '../src/engine/trials'
import { readContentFiles } from '../src/node/content'

// M10.23: a land the designer only framed plays at once, on the world's
// voice, names, coins and law. When the stranger first comes in and a model
// is connected, the chronicler writes what makes it its own, once, from its
// frame; the game keeps what checks out, field by field, in the save.

async function framed(): Promise<Content> {
  return loadContent(framedOnly(await readContentFiles('content', 'isle'), 'western_isles'))
}

const text = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

describe('M10.23: the chronicler writes a land the designer only framed', () => {
  it('writes the voice, names, coins and law of the land when the stranger first comes in, once; the log plays back to the same land', async () => {
    const content = await framed()
    expect(unwritten(content.lands.get('western_isles'))).toBe(true)
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 7, builder: true, llm })
    engine.start()
    expect(text(await engine.handle('@goto loc_ynys_wen_landing'))).toMatch(/The chronicler is writing how people live in the Western Isles\./)
    await engine.runModels()
    const west = frameOf(engine.content, 'western_isles')
    expect(west.voice?.address.stranger).toEqual(['traveller'])
    expect(west.names?.family).toContain('Mori')
    expect(west.coins.map((c) => c.short)).toEqual(['ryo', 'mon'])
    expect(west.rate).toBe(3)
    expect(west.law).toMatchObject({ where: 'in the Western Isles', officer: 'magistrate' })
    expect(engine.content.lands.get('western_isles')!.crossing).toMatch(/bow a little/)
    // Oaths only by the faiths the land holds: the made-up one is dropped.
    expect(Object.keys(west.voice!.oaths)).toEqual(['old_stars'])
    // The stranger plays under it at once: money told in mon.
    expect(engine.world.money(10)).toBe('30 mon')
    // Once: back home and in again, no second call.
    await engine.handle('@goto loc_skerrow_harbour')
    await engine.handle('@goto loc_ynys_wen_landing')
    await engine.runModels()
    expect(llm.calls.filter((c) => c.schemaName === 'land')).toHaveLength(1)
    const replayed = await Engine.replay(content, 7, engine.save().log)
    expect(replayed.state.growth?.lands).toEqual(engine.state.growth?.lands)
    expect(frameOf(Engine.fromSave(content, engine.save()).content, 'western_isles').rate).toBe(3)
  })

  it('writes nothing without a model: the land plays on the world\'s voice, names and coins', async () => {
    const content = await framed()
    const engine = new Engine(content, { seed: 7, builder: true })
    engine.start()
    await engine.handle('@goto loc_ynys_wen_landing')
    expect(engine.state.growth?.landPending ?? []).toEqual([])
    const west = frameOf(engine.content, 'western_isles')
    expect(west.voice).toBe(content.voice)
    expect(west.names).toBe(content.world.names)
    expect(engine.world.money(35)).toBe('3 sp 5 cp')
  })

  it("never writes over the designer's own: a land with its kit or its names is left alone", async () => {
    const content = loadContent(await readContentFiles('content', 'isle'))
    expect(unwritten(content.lands.get('western_isles'))).toBe(false)
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 7, builder: true, llm })
    engine.start()
    await engine.handle('@goto loc_ynys_wen_landing')
    await engine.runModels()
    expect(llm.calls.filter((c) => c.schemaName === 'land')).toHaveLength(0)
  })

  it('keeps what checks out and drops the rest, field by field', async () => {
    const content = await framed()
    const engine = new Engine(content, { seed: 7, builder: true, llm: new MockLlm('invalid') })
    engine.start()
    await engine.handle('@goto loc_ynys_wen_landing')
    await engine.runModels()
    const written = engine.state.growth!.lands!['western_isles']!
    // Three names each is too few: the world's stay; the rest is kept.
    expect(written['names']).toBeUndefined()
    expect(frameOf(engine.content, 'western_isles').names).toBe(content.world.names)
    expect(frameOf(engine.content, 'western_isles').voice?.address.stranger).toEqual(['traveller'])
  })
})
