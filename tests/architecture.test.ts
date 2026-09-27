import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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
})
