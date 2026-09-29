import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chapterStep, draftResult, loadContent, newWorldFiles, readDraft, WORLD_STEPS, worldStepRequest } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { MockLlm } from '../src/engine/dialogue/mock'
import { reachOf } from '../src/engine/reach'
import { readContentFiles } from '../src/node/content'

// M10.23: a Lands step in the world guide, after the frame and the voice: which
// lands there are, which areas belong to each, their borders and how well they
// know each other. Skipped, the world is one land and the reach is worked out
// from its ways; nothing is guessed.

const root = resolve(import.meta.dirname, '../content')

describe('M10.23: the Lands step', () => {
  it('comes after the frame and the voice, and shows the exact fields of a land', () => {
    expect(WORLD_STEPS.map((s) => s.id).slice(0, 3)).toEqual(['frame', 'voice', 'lands'])
    const request = worldStepRequest(newWorldFiles('reach', 'The Reach'), 'lands', 'Two lands.')
    expect(request.system).toContain('STEP: LANDS.')
    expect(request.system).toMatch(/land:\n {2}id: text matching/)
    expect(request.system).toContain('lands/<id>/land.yaml under land:')
    expect(chapterStep('Lands and borders')).toBe('lands')
  })

  it('takes a proposal of a new land, its border and its reach, and the world plays it', async () => {
    const files = await readContentFiles(root, 'isle')
    const proposal = {
      say: 'The Eastern Reef, a rumour only.',
      questions: [],
      changes: [{ kind: 'area', id: 'skerrow_shore', yaml: 'border: true\n', merge: true }],
      world: 'reach:\n  - { between: [skerrow, western_isles], reach: trade }\n  - { between: [skerrow, eastern_reef], reach: rumour, why: A wreck washed up once. }\n',
      files: [{ path: 'lands/eastern_reef/land.yaml', text: 'land:\n  id: eastern_reef\n  name: the Eastern Reef\n  frame: "LAND: the Eastern Reef, where the sea-folk dive for pearls."\n' }],
    }
    const draft = readDraft(files, JSON.stringify(proposal))
    expect(draft.problems).toEqual([])
    const content = draft.result!.content!
    expect(content.lands.get('eastern_reef')?.name).toBe('the Eastern Reef')
    expect(content.areas.get('skerrow_shore')?.border).toBe(true)
    expect(reachOf(content, 'skerrow', 'eastern_reef')).toBe('rumour')
    expect(draft.result!.changes.map((c) => c.path)).toContain('isle/lands/eastern_reef/land.yaml')
  })

  it('without a word from the designer the mock keeps one land, and Check names a reach that contradicts a line', async () => {
    const files = newWorldFiles('reach', 'The Reach')
    const draft = readDraft(files, (await new MockLlm('good').complete(worldStepRequest(files, 'lands', 'It is all one land.'))).text)
    expect(draft.problems).toEqual([])
    expect(draftResult(files, draft).content?.lands.size).toBe(0)
    const isle = await readContentFiles(root, 'isle')
    const none = loadContent(isle.map((f) => (f.path === 'isle/world.yaml' ? { ...f, text: f.text.replace('reach: trade, why: The white boat', 'reach: none, why: The white boat') } : f)))
    expect(warnings(none)).toContain('world.reach: skerrow and western_isles know nothing of each other (none), yet a line of transport runs between them')
  })
})
