import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { questWarnings } from '../src/engine/quests/check'
import { loadContentFromDir } from '../src/node/content'

// M10.33 E, the giver says what they want (voorstel 14 and S3 of the review of
// 30 September 2026): nobody ever opened a talk with it, and without a model
// "what should I do?" got a stock line. A stage now has `asks`, in the giver's
// voice: they open a talk with it once a stage, a chip asks for more, and
// without a model their answer is what they ask and what to do now.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')
const SAYS = /Start with \[?Niko Serrin\]?\. He found the signal/

describe('M10.33 E: the giver says what they want', () => {
  it('opens a talk with what they want, once a stage, and offers Tell me more', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_medical_bay', '@bring ilyan']) await engine.handle(c)
    expect(text(await engine.handle('talk ilyan'))).toMatch(SAYS)
    expect(engine.status().talk).toMatchObject({ matter: true })
    await engine.handle('bye')
    expect(text(await engine.handle('talk ilyan'))).not.toMatch(SAYS)
    // Someone with no matter with the stranger has no chip.
    for (const c of ['bye', '@goto loc_commons', '@bring sana', 'talk sana']) await engine.handle(c)
    expect(engine.status().talk).toMatchObject({ matter: false })
  })

  it('answers what they want and what to do now without a model, asked or chosen', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_medical_bay', '@bring ilyan', 'talk ilyan']) await engine.handle(c)
    const chosen = text(await engine.handle('9'))
    expect(chosen).toMatch(SAYS)
    expect(chosen).toMatch(/Now: Ask Niko Serrin about the listening station/)
    expect(text(await engine.handle('"What should I do?'))).toMatch(/Now: Ask Niko Serrin/)
  })

  it('gives the voice what they want of the stranger now', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_medical_bay', '@bring ilyan', 'talk ilyan']) await engine.handle(c)
    await engine.handle('"What do you need of me?')
    const call = good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!
    expect(call.prompt).toMatch(/The Orison Recordings, what you want of the stranger now: Start with Niko Serrin/)
  })

  it('opens with nothing where a stage has no asks, and answers with its goal (the neutral default)', async () => {
    const quests = new Map([...quiet.quests].map(([id, q]) => [id, { ...q, stages: q.stages?.map(({ asks: _, ...s }) => s) }]))
    const engine = new Engine({ ...quiet, quests }, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_medical_bay', '@bring ilyan']) await engine.handle(c)
    expect(text(await engine.handle('talk ilyan'))).not.toMatch(SAYS)
    expect(text(await engine.handle('9'))).toMatch(/Ask \[?Niko Serrin\]? about \[?the listening station\]?\. That is what I need from you now\./)
    // Check names each such stage.
    expect(questWarnings({ ...quiet, quests }).join('\n')).toMatch(/quest story_the_orison_recordings, stage s1: the giver never says what they want here \(asks\)/)
  })

  it('has every stage with something to do say it, in all three worlds, and Maren on Skerrow opens with hers', async () => {
    for (const world of ['base', 'isle', 'quietreach']) expect(questWarnings(await loadContentFromDir(root, world)).filter((w) => /\(asks\)/.test(w))).toEqual([])
    const isle = new Engine(await loadContentFromDir(root, 'isle'), { seed: 3, builder: true })
    isle.start()
    for (const c of ['@goto loc_skerrow_salt_kettle', '@bring maren']) await isle.handle(c)
    expect(text(await isle.handle('talk maren'))).toMatch(/No ship will call while the beacon is dark/)
  })
})
