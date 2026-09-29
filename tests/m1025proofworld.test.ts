import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockLlm } from '../src/engine'
import { keepRegion } from '../src/node/proofworld'
import { listWorlds, loadContentFromDir } from '../src/node/content'
import { playRegion } from '../src/node/regionplay'
import { content } from './helpers'

// M10.25, Bram's question after the played proof: leave what the chronicler
// grew in a copy of the world, numbered, so he can look at it in the editor;
// one copy may hold every region. The region play keeps each region it grew in
// content/<world>_proofs/grown/<n>-<name>/, and the copy loads as a world.

describe('M10.25: the regions of the played proof, kept in a copy of the world', () => {
  it('keeps each region as the next number in one copy, which loads and says what each one is', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wisplight-proofs-'))
    cpSync(resolve(import.meta.dirname, '../content/base'), join(root, 'base'), { recursive: true })
    cpSync(resolve(import.meta.dirname, '../content/CHRONICLER.md'), join(root, 'CHRONICLER.md'))
    const kept = []
    for (const setting of ['story', 'outline'] as const) {
      const played = await playRegion({ content, world: 'base', setting, llm: new MockLlm('good'), seed: 7, days: 1 })
      kept.push(await keepRegion(root, 'base', content, played.content, { name: played.tally.region!.name, lines: [`The dial at ${setting}.`] }))
    }
    expect(kept.map((k) => [k.folder, k.n, k.problems])).toEqual([
      ['base_proofs', 1, []],
      ['base_proofs', 2, []],
    ])
    // The mock charts the same region twice: the second one's ids carry its number, so both are there whole.
    expect(kept[1]!.kept).toBeGreaterThan(0)
    expect(existsSync(join(root, 'base_proofs/grown/1-grey-saltings/locations.yaml'))).toBe(true)
    const worlds = await listWorlds(root)
    expect(worlds.map((w) => [w.folder, w.name])).toContainEqual(['base_proofs', 'The Nethermarch, with the proof regions'])
    const copy = await loadContentFromDir(root, 'base_proofs')
    expect(copy.world.id).toBe('nethermarch')
    expect(copy.areas.get('grey_saltings')?.name).toMatch(/^1\. .*Grey Saltings$/)
    expect(copy.areas.get('grey_saltings2')?.name).toMatch(/^2\. .*Grey Saltings$/)
    expect(copy.locations.get('loc_grey_saltings2_gate')?.area).toBe('grey_saltings2')
    expect(copy.locations.size).toBeGreaterThan(content.locations.size)
    const proofs = readFileSync(join(root, 'base_proofs/PROOFS.md'), 'utf8')
    expect(proofs).toMatch(/## 1\. the Grey Saltings\n\nThe dial at story\.[\s\S]*In `grown\/1-grey-saltings\/`: 1 area, \d+ places, \d+ people[^\n]*\nIn the game it joined the world by loc_grey_saltings_gate/)
    expect(proofs).toMatch(/## 2\. the Grey Saltings[\s\S]*this one's ids carry its number: grey_saltings2/)
    expect(existsSync(join(root, 'base_proofs/WORLDBOOK.md'))).toBe(true)
  }, 180_000)
})
