import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { relation } from '../src/engine/dialogue/relations'
import { languageBarrier } from '../src/engine/language'
import { loadContentFromDir } from '../src/node/content'

// M10.23: language as a knob, optional. A land may have a tongue; whoever
// does not know it gets greetings, gestures, names and numbers from its people,
// by the rules and without a model, until they learn it by talking (Lore helps)
// or bring someone who speaks it. Without `language:` everyone speaks the
// stranger's tongue, as before (Deepwell's second land).

const isle = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle')

async function atYnysWen(llm?: MockLlm): Promise<Engine> {
  const engine = new Engine(isle, { seed: 4, builder: true, ...(llm ? { llm } : {}) })
  engine.start()
  await engine.handle('@goto loc_ynys_wen_landing')
  const here = engine.state.player.location
  Object.assign(engine.state.npcs['npc_gwion']!, { location: here, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
  return engine
}

describe('M10.23: a tongue of its own', () => {
  it('lets only a greeting, names and numbers through, without asking the model', async () => {
    const llm = new MockLlm('good')
    const engine = await atYnysWen(llm)
    expect(languageBarrier(engine.world, 'npc_gwion')).toEqual({ land: 'western_isles', name: 'the Old Tongue' })
    const greeted = (await engine.handle('talk gwion')).map((o) => o.text).join('\n')
    expect(greeted).toMatch(/greets you in the Old Tongue\. You have none of it, beyond the greeting\./)
    const said = (await engine.handle('"Does the boat go back to Skerrow on day 3?"')).map((o) => o.text).join('\n')
    expect(said).toMatch(/says something in the Old Tongue\. You catch (Skerrow and 3|Does and Skerrow and 3)/)
    expect(llm.calls.filter((c) => c.schemaName === 'npc_reply')).toEqual([])
  })

  it('is learnt by talking, and then the talk goes on as ever', async () => {
    const engine = await atYnysWen()
    engine.state.player.tongues = { western_isles: 18 }
    await engine.handle('talk gwion')
    const said = (await engine.handle('"Hello there."')).map((o) => o.text).join('\n')
    expect(said).toMatch(/You find you can follow the Old Tongue now, slowly\./)
    expect(engine.state.player.languages).toContain('western_isles')
    expect(languageBarrier(engine.world, 'npc_gwion')).toBeUndefined()
  })

  it('needs no learning with someone along who speaks it', async () => {
    const engine = await atYnysWen()
    engine.state.companions = [{ npc: 'npc_elowen', since: engine.world.now } as never]
    Object.assign(relation(engine.state, 'npc_elowen'), { trust: 50 })
    Object.assign(engine.state.npcs['npc_elowen']!, { location: engine.state.player.location })
    expect(languageBarrier(engine.world, 'npc_gwion')).toBeUndefined()
  })

  it('Deepwell\'s second land has no tongue of its own: everyone speaks the stranger\'s', async () => {
    const other = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')
    expect([...other.lands.values()].some((l) => l.language)).toBe(false)
    const engine = new Engine(other, { seed: 1 })
    expect(languageBarrier(engine.world, 'npc_rook_adeyemi')).toBeUndefined()
  })
})
