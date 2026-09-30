import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { improvisable, improviseRequest, readImprovisation } from '../src/engine/improvise'
import { parseCommand } from '../src/engine/parser'
import { concludes } from '../src/engine/quests/knows'
import { loadContentFromDir } from '../src/node/content'

// M10.33 J, the free narration keeps to the story (voorstel 1 of the review:
// CHECK ANTENNA said "the recordings are complete" against what the story
// keeps hidden). An improvisation at a place of a story gets what the story
// keeps hidden there, to be neither said nor denied, and a narration that
// draws a conclusion the thing does not draw itself is refused.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

describe('M10.33 J: the free narration keeps to the story', () => {
  it('knows a conclusion about a thing, unless the thing itself says so', () => {
    expect(concludes('You run the index. The recordings are complete, every segment in its place.', 'A rack of recording drives.')).toBe('complete')
    expect(concludes('Nothing is missing from the rack.', 'A rack of drives.')).toBe('nothing is missing')
    expect(concludes('The panel looks untouched.', 'A panel, untouched for years.')).toBeUndefined()
    expect(concludes('Dust lies thick on the consoles, and a fan whines somewhere.', 'Consoles.')).toBeUndefined()
  })

  it('gives an improvisation at a place of the story what it keeps hidden, and refuses a narration that says otherwise', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    await engine.handle('@goto loc_orison_listening_room')
    const imp = improvisable(engine.world, parseCommand('check the antenna'))!
    expect(imp).toBeDefined()
    expect(improviseRequest(engine.world, imp).prompt).toMatch(/KEPT HIDDEN HERE[^\n]*\n {2}Segments of the repeating transmission were removed/)
    const told = (narration: string) => readImprovisation(engine.world, imp, JSON.stringify({ narration, effect: { kind: 'nothing', id: '', delta: 0, title: '' }, spent: false }))
    expect(told('You look up at the mast. The cables groan, and one hangs slacker than the rest.')).not.toHaveProperty('problem')
    expect(told('You check the feed readouts. The recordings are complete, and nothing is wrong with the antenna.')).toEqual({ problem: 'invented' })
  })
})
