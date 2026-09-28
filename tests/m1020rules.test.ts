import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { draftResult, Engine, newWorldFiles, patchWorld, worldStepRequest } from '../src/engine'
import { hasCharacters } from '../src/engine/rules/character'
import { readContentFiles } from '../src/node/content'

// M10.20: a proposal can add to the rules (the build of The Quiet Reach,
// 28 September 2026: the faith step asks for patrons and for death's own
// words, but the proposal form could not write them, so its faiths named
// patrons that existed nowhere). Patrons, conditions and ancestries are kinds
// in the rules; death is a block set through `rules`. A world without
// characters may have them all the same, without character creation.

const faithful = (files: ReturnType<typeof newWorldFiles>) => patchWorld(files, 'faiths:\n  - { id: keeping, name: The Keeping, patrons: [the_remembered] }\n').files

describe('M10.20: a proposal adds to the rules', () => {
  it('gives a world without rules its patrons and death, and no characters for it', async () => {
    const files = faithful(newWorldFiles('reach', 'The Reach'))
    const result = draftResult(files, {
      changes: [{ kind: 'patron', id: 'the_remembered', yaml: 'id: the_remembered\nname: the Remembered\ntext: The dead whom people know by name.\nsworn: A promise made in the name of the dead.\n' }],
      rules: [
        'death:',
        '  guide: Morrow',
        '  vision: "A silent arrival hall. {guide}: Stay with the voice."',
        '  wake: The hall thins into the hiss of a recovery cradle.',
        '  mark: "Your {lost} stayed where you fell."',
        '  rite_where: the recovery cradle',
        '  rite_done: Someone sat beside the cradle and Held the Name.',
        '  rite_nothing: Nobody sat beside the cradle.',
      ].join('\n'),
      files: [],
    })
    expect(result.problems).toEqual([])
    expect(result.changes.map((c) => c.path)).toContain('reach/rules/rules.yaml')
    const content = result.content!
    expect(content.rules?.patrons.map((p) => p.id)).toEqual(['the_remembered'])
    expect(content.rules?.death?.guide).toBe('Morrow')
    expect(hasCharacters(content)).toBe(false)
    // It plays as before: no character is made, nothing to create, no fights.
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    await engine.handle('look')
    expect(engine.state.player.character).toBeUndefined()
    expect(engine.creationData()).toBeUndefined()
    // A craft's skill of its own stays fine: skills are checked only where the world has them.
    const crafted = draftResult(result.files, { changes: [{ kind: 'craft', id: 'field_electronics', yaml: 'id: field_electronics\nname: Field Electronics\nskill: electronics\nranks:\n  novice: { practise: [] }\n' }], files: [] })
    expect(crafted.problems.filter((p) => /which is no skill/.test(p))).toEqual([])
    // The faith step says so.
    expect(worldStepRequest(files, 'faiths', 'Two faiths.').system).toContain('as kind patron')
  })

  it('writes a new patron into the rules a world already has', async () => {
    const files = await readContentFiles(resolve(import.meta.dirname, '../content'), 'isle')
    const result = draftResult(files, { changes: [{ kind: 'patron', id: 'the_drowned', yaml: 'id: the_drowned\nname: the Drowned\ntext: Those the sea kept.\nsworn: A promise to the sea.\n' }], files: [] })
    expect(result.problems).toEqual([])
    expect(result.changes.map((c) => c.path)).toEqual(['isle/rules/rules.yaml', 'isle/ids.lock'])
    expect(result.content!.rules?.patrons.some((p) => p.id === 'the_drowned')).toBe(true)
    expect(hasCharacters(result.content!)).toBe(true)
  })
})
