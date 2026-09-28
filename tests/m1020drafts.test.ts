import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { DraftStore } from '../src/node/drafts'

// M10.20: an open proposal survives a restart (the build of The Quiet Reach,
// 28 September 2026: two good proposals were lost when the app restarted for
// a new version). Kept per world and step, with the words it was asked for,
// until it is accepted or thrown away.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('M10.20: open proposals kept over a restart', () => {
  it('keeps a proposal per world and step, gives it back after a restart, and forgets it when told', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1020drafts-'))
    folders.push(dir)
    const path = join(dir, 'drafts.json')
    const draft = { say: 'Six people.', questions: [], changes: [{ kind: 'npc', id: 'npc_mara_venn', yaml: 'id: npc_mara_venn\n' }], problems: ['one line of YAML'], diffs: [] }
    const store = new DraftStore(path)
    store.set('quietreach', 'people', { draft, asked: 'The first six characters ...' })
    store.set('quietreach', 'economy', { draft: { ...draft, say: 'Meals.' }, asked: 'A small colony ...' })
    // After a restart: a new store on the same file.
    const again = new DraftStore(path)
    expect(again.get('quietreach', 'people')).toMatchObject({ draft, asked: 'The first six characters ...' })
    expect(again.get('quietreach', 'people')?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(again.get('isle', 'people')).toBeUndefined()
    again.set('quietreach', 'people', null)
    expect(new DraftStore(path).get('quietreach', 'people')).toBeUndefined()
    expect(new DraftStore(path).get('quietreach', 'economy')?.asked).toBe('A small colony ...')
    // A damaged file starts over rather than failing the editor.
    expect(new DraftStore(join(dir, 'missing.json')).get('quietreach', 'people')).toBeUndefined()
  })
})
