import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'
import { committedWorlds } from './helpers'

// The engine must stay headless so it runs in Electron, the terminal,
// the tests and the browser (CLAUDE.md, architecture rules).

const engineDir = resolve(import.meta.dirname, '../src/engine')
const forbidden = [/from ['"]electron['"]/, /from ['"]react(-dom)?(\/[^'"]*)?['"]/, /from ['"]node:/]

describe('architecture', () => {
  it('keeps src/engine free of Electron, React and Node imports', async () => {
    const files = (await readdir(engineDir, { recursive: true })).filter((file) => file.endsWith('.ts'))
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(join(engineDir, file), 'utf8')
      for (const pattern of forbidden) {
        if (pattern.test(source)) offenders.push(`${file}: ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the chronicler on its own: nothing from the game, so other applications can use it', async () => {
    const dir = resolve(import.meta.dirname, '../src/chronicler')
    const files = (await readdir(dir, { recursive: true })).filter((file) => file.endsWith('.ts'))
    const offenders: string[] = []
    for (const file of files) {
      const source = await readFile(join(dir, file), 'utf8')
      for (const pattern of [...forbidden, /from ['"]\.\.\//]) if (pattern.test(source)) offenders.push(`${file}: ${pattern}`)
    }
    expect(files.length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('every world, and the test world Deepwell, loads and plays a day (M10.17: generic for every world)', async () => {
    const roots = [resolve(import.meta.dirname, '../content'), resolve(import.meta.dirname, 'worlds')]
    // A world being made in the editor is not played until it is committed (tests/helpers.ts).
    const committed = committedWorlds()
    const played: string[] = []
    for (const root of roots) {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (root === roots[0] && committed && !committed.has(entry.name)) continue
        const has = await readFile(join(root, entry.name, 'world.yaml'), 'utf8').then(() => true, () => false)
        if (!has) continue
        const engine = new Engine(await loadContentFromDir(root, entry.name), { seed: 1 })
        engine.start()
        engine.tick(24 * 60)
        await engine.handle('look')
        played.push(entry.name)
      }
    }
    expect(played).toEqual(expect.arrayContaining(['base', 'isle', 'other']))
  })
})
