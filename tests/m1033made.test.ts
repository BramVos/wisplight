import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { readScoreReply, readScoreRequest } from '../src/engine/dialogue/readscore'
import { loadContentFromDir } from '../src/node/content'

// M10.33 W, embroidery measured (Bram, 30 September 2026: "de NPC's verzinnen
// er op los"; the rule "only facts from KNOWLEDGE, SCENE and your card" was
// never measured, so the choice of model and effort for the voice was a
// guess). The read score counts per answer the facts its GIVEN and the card
// do not hold; SCENE says colour is the speaker's, events are not. The
// measurement itself is a run on the player's key, with Q.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

describe('M10.33 W: made-up facts counted', () => {
  it('reads each answer against what it was given, and counts only those', () => {
    const items = [
      { card: 'Sana Holt, the steward.', said: 'Anything new?', answer: '"The supply ship came in this morning."', given: 'KNOWLEDGE: the supply ship came in this morning.' },
      { card: 'Sana Holt, the steward.', said: 'And Niko?', answer: '"Niko quit his post last night and means to leave on the next ship."', given: 'KNOWLEDGE: Niko works up at the listening station.' },
      { card: 'Sana Holt, the steward.', said: 'Tea?', answer: '"Always."' },
    ]
    const request = readScoreRequest(items)
    expect(request.system).toMatch(/invented: how many facts the answer states that its GIVEN and the card do not hold/)
    expect(request.prompt).toMatch(/2\. \[1\] The player: "And Niko\?"\n {3}Answer: [^\n]*\n {3}GIVEN: KNOWLEDGE: Niko works/)
    const reply = JSON.stringify({ answers: [{ n: 1, person: 2, natural: 3, answers: 2, onward: 1, invented: 0 }, { n: 2, person: 2, natural: 3, answers: 2, onward: 1, invented: 2 }, { n: 3, person: 3, natural: 3, answers: 2, onward: 0, invented: 5 }], weakest: [] })
    // The third was read without GIVEN: it does not count.
    expect(readScoreReply(reply, 3, [true, true, false])?.invented).toBe(1)
  })

  it('tells the voice that colour is its own and events are not', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana', '"Anything new?']) await engine.handle(c)
    const call = good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!
    expect(call.prompt).toMatch(/SCENE: [^\n]*Colour of your own work and this place is yours; events, decisions and plans are not\./)
  })
})
