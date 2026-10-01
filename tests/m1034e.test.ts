import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.34 E, an answer is said again only while it is true (V06 of the external
// review; the cause, in byrule.ts: the same question in the same words got the
// same answer back within a talk, also when a deed, a secret or a right had
// changed in between). An answer keeps the state it was true in: the stage of
// every quest, the secrets this person gave, the agreements with them.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.34 E: an answer said again only while it holds', () => {
  it('says the same answer again to the same words, and asks anew once the story moved on', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_workshop', '@bring tessa', 'talk tessa']) await engine.handle(c)
    const calls = () => good.calls.filter((c) => c.schemaName === 'npc_reply').length
    await engine.handle('"What do you make of the station?')
    const before = calls()
    // The same words, nothing changed: said again by the rules.
    expect(text(await engine.handle('"What do you make of the station?'))).toMatch(/As I said:/)
    expect(calls()).toBe(before)
    // The story moves on (the antenna fault found): the same words are asked anew.
    engine.state.flags!['story_the_orison_recordings_1'] = true
    engine.state.flags!['story_the_orison_recordings_2'] = true
    engine.state.flags!['story_the_orison_recordings_3'] = true
    engine.tick(1)
    expect(engine.state.questlog!['story_the_orison_recordings']!.stage).not.toBe('s1')
    expect(text(await engine.handle('"What do you make of the station?'))).not.toMatch(/As I said:/)
    expect(calls()).toBe(before + 1)
  })
})
