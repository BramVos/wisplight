import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Found by the other session after M10.25: `npx tsx scripts/ids.ts base isle`
// stopped on "Cannot access 'ENTITY_KINDS' before initialization". Loading
// edit.ts first went round through content.ts, the growth layers,
// regionstory.ts and regionfull.ts back into editor.ts while edit.ts was still
// loading. The state and the layer of a full build now live apart from its
// rounds (growth/fulllayer.ts). Tried as the script loads it: tsx, edit.ts first.

describe('M10.26: the engine loads from edit.ts first, as scripts/ids.ts does', () => {
  it('loads edit.ts before anything else of the engine, without a cycle through the editor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-cycle-'))
    const root = resolve(import.meta.dirname, '..')
    try {
      const entry = join(dir, 'first.mts')
      writeFileSync(entry, `const edit = await import(${JSON.stringify(join(root, 'src/engine/edit.ts'))})\nconsole.log(typeof edit.applyEdits)\n`)
      const out = execFileSync(join(root, 'node_modules/.bin/tsx'), [entry], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      expect(out.trim()).toBe('function')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
