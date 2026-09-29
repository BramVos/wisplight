import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, type Content } from '../src/engine'
import { contentFilesOf } from '../src/engine/contentfiles'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.25: a region built in full in play runs the world build's own steps,
// and those read files. The content of a game written out as files loads
// again as the same content.

const plain = (c: Content) => JSON.parse(JSON.stringify(c, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v))) as unknown

describe('M10.25: the content of a game as files', () => {
  it('loads again as the same content, for every world', async () => {
    const root = resolve(import.meta.dirname, '../content')
    for (const c of [content, await loadContentFromDir(root, 'isle'), await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')]) {
      expect(plain(loadContent(contentFilesOf(c))), c.world.id).toEqual(plain(c))
    }
  })

  it('holds what grew in the game: a far town with its district and its story', async () => {
    const engine = new Engine(content, { seed: 6, builder: true, llm: new MockLlm('good') })
    engine.start()
    await engine.handle('@goto loc_oude_zijl_sluice')
    for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
    await engine.handle('1')
    await engine.handle('@goto loc_graafhaven_market')
    await engine.handle('ask lammert about the holleveen')
    await engine.handle('bye')
    await engine.runModels()
    await engine.handle('look')
    await engine.runModels()
    expect(engine.state.growth?.stories?.['graafhaven']).toBeDefined()
    expect(plain(loadContent(contentFilesOf(engine.content)))).toEqual(plain(engine.content))
  })
})
