import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { content } from './helpers'

// M10.21: the world grows only where you go. The runner (Bram, 28 September
// 2026: what if someone runs north like an idiot, day after day?) gets a thin,
// cheap world: a far place passed through is made from its templates without
// a model, beyond the last land the world book names nothing is made, and the
// chronicler works a place out only when the stranger talks or stays there.

const DAY = 24 * 60
const GROWS = ['far_place', 'outline']

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('M10.21: the world grows only where you go', () => {
  it('runs north every day for thirty days: at most sketches, no call that makes a place, the known world ends', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 21, llm })
    engine.start()
    const heard: string[] = []
    for (let day = 0; day < 30; day++) {
      for (let tries = 0; tries < 4; tries++) {
        const out = said(await engine.handle('head north'))
        heard.push(out)
        // At the edge: go on, whatever lies that way.
        if (engine.state.choice?.options[0]?.label.startsWith('Go on to')) heard.push(said(await engine.handle('1')))
      }
      await engine.runModels()
      engine.tick(Math.max(1, DAY - (engine.world.now % DAY)))
    }
    const growing = llm.calls.filter((c) => GROWS.includes(c.schemaName))
    expect(growing.map((c) => c.schemaName)).toEqual([])
    // What was made on the way: only the far place the world book names that way, from its templates.
    const far = engine.state.growth?.far ?? {}
    expect(Object.keys(far)).toEqual(['stavermouth'])
    expect(far['stavermouth']!.by).toBe('template')
    expect(heard.join('\n')).toMatch(/North of Stavermouth, the world as far as anyone has told you runs out/)
    expect(engine.state.outlines?.pending ?? []).toEqual([])
  }, 600_000)

  it('works a far place out only when the stranger stays or talks there, once; a second visit costs nothing', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 22, builder: true, llm })
    engine.start()
    ;(engine.state.player.journal ??= {})['zwolderkamp'] = engine.world.now
    await engine.handle('@goto loc_waagdam_east_gate')
    const arrive = said(await engine.handle('travel to zwolderkamp on foot'))
    expect(arrive).not.toMatch(/working out/)
    expect(engine.state.player.location).toBe('loc_zwolderkamp_gate')
    expect(llm.calls.filter((c) => GROWS.includes(c.schemaName))).toEqual([])
    // A night there is staying: the chronicler works it out to its outline.
    await engine.handle('in')
    await engine.handle('sleep')
    expect(engine.state.outlines?.pending).toEqual(['zwolderkamp'])
    await engine.runModels()
    expect(engine.state.outlines?.done['zwolderkamp']).toBeDefined()
    // Home and back: nothing more is made.
    const calls = llm.calls.filter((c) => GROWS.includes(c.schemaName)).length
    await engine.handle('out')
    await engine.handle('west')
    await engine.handle('travel to zwolderkamp on foot')
    await engine.handle('in')
    await engine.handle('talk')
    await engine.runModels()
    expect(llm.calls.filter((c) => GROWS.includes(c.schemaName)).length).toBe(calls)
  }, 300_000)
})
