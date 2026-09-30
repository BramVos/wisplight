import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { personView } from '../src/engine/acquaintance'
import { promised } from '../src/engine/dialogue/guard'
import { loadContentFromDir } from '../src/node/content'

// M10.33 F, the talk does what it says (Bram's playtest and the review of 30
// September 2026): the option row showed Trade and Come with me to everyone
// and mixed questions with moves; What's new told the stranger their own
// question back; YES in the talk window was taken for speech, so Sana's offer
// stayed open; and a quest had to be told in fifty words.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.33 F: the talk does what it says', () => {
  it('offers Trade only with someone who keeps a trade here, and Come with me only with someone who can come', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana']) await engine.handle(c)
    expect(engine.status().talk).toMatchObject({ trades: true, joins: false })
    // Edda sells dressings in her own bay; Ilyan beside her sells nothing.
    for (const c of ['bye', '@goto loc_medical_bay', '@bring edda', '@bring ilyan', 'talk edda']) await engine.handle(c)
    expect(engine.status().talk).toMatchObject({ trades: true, joins: false })
    for (const c of ['bye', 'talk ilyan']) await engine.handle(c)
    expect(engine.status().talk).toMatchObject({ npc: 'npc_ilyan_sorell', trades: false, joins: false })
    const base = new Engine(await loadContentFromDir(root, 'base'), { seed: 3, builder: true })
    base.start()
    for (const c of ['@goto loc_peat_cuttings', '@bring gerrit', 'talk gerrit']) await base.handle(c)
    expect(base.status().talk).toMatchObject({ joins: true })
  })

  it('shows the work beside the talk as soon as its head says it', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_medical_bay', '@bring edda', 'talk edda']) await engine.handle(c)
    expect(engine.status().talk!.name).toMatch(/the medic/)
    expect(personView(engine.world, 'npc_edda_vale').work).not.toBe('?')
  })

  it('never tells the stranger their own deed as news', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana', 'ask about ilyan', 'ask about niko']) await engine.handle(c)
    const news = text(await engine.handle('2'))
    expect(news).not.toMatch(/\bthe stranger\b|\byou asked\b/i)
  })

  it('takes a yes in the talk window for a yes, and closes the offer with it', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana']) await engine.handle(c)
    await engine.handle('where is the guest quarters')
    expect(engine.status().talk!.proposal).toMatch(/offers to/)
    // The window sends what is typed as speech: a quoted yes.
    const yes = text(await engine.handle('"Yes.'))
    expect(yes).not.toMatch(/The AI gave no answer/)
    expect(engine.status().talk?.proposal).toBeUndefined()
  })

  it('gives the giver of a running quest room to explain, and to tell the whole of it when asked', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    const limit = () => good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!.meta?.wordLimit
    for (const c of ['@goto loc_medical_bay', '@bring ilyan', 'talk ilyan']) await engine.handle(c)
    await engine.handle('"Who keeps the station running?')
    expect(limit()).toBe(90)
    await engine.handle('"Sorry, you are going a bit fast. What are we looking at?')
    expect(limit()).toBe(180)
    // Someone outside every quest keeps to the ordinary length.
    for (const c of ['bye', '@goto loc_commons', '@bring sana', 'talk sana']) await engine.handle(c)
    await engine.handle('"Who keeps the station running?')
    expect(limit()).toBe(50)
  })

  it('reads a meeting only in the sentence that promises it, and the one after', () => {
    // With room to tell the whole of it, Pip's wyrm that "sleeps soundest at noon" became a meeting at noon.
    const pip = 'Pip looks up. "Come on, I\'ll take you there myself. They say a wyrm sleeps under the barrow. Nobody living has seen him. Tamsin says he sleeps soundest at noon."'
    expect(promised(pip)).not.toMatch(/noon/)
    expect(promised('Mirte nods. "I\'ll be done at six. Wait by the green." She goes back to her dough.')).toMatch(/done at six\. Wait by the green\./)
  })
})
