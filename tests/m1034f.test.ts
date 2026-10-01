import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { metBand } from '../src/engine/acquaintance'
import { loadContentFromDir } from '../src/node/content'

// M10.34 F, a meeting counts (R08 of the external review; the cause:
// familiarity grows by 1 a talk and 2 a line, and LISTENER called anyone below
// 6 "a stranger; you have done nothing together", so Sana greeted Bram as new
// after two short talks). Who has spoken with the stranger once has met them.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.34 F: a meeting counts', () => {
  it('greets the stranger as met after one short talk, and the voice hears it, through a save and a load', async () => {
    const good = new MockLlm('good')
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: good })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana']) await engine.handle(c)
    await engine.handle('talk sana')
    expect(metBand(engine.world, 'npc_sana_holt')).toBe('never met')
    await engine.handle('bye')
    expect(metBand(engine.world, 'npc_sana_holt')).toBe('met')
    // Saved and loaded: the same.
    const again = await Engine.restore(quiet, JSON.parse(JSON.stringify(engine.save())), good)
    expect(metBand(again.world, 'npc_sana_holt')).toBe('met')
    await again.handle('talk sana')
    await again.handle('"What do you make of the signal?')
    const call = good.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!
    expect(call.prompt).toMatch(/LISTENER: the player is someone you have met once before/)
    expect(call.prompt).not.toMatch(/you have done nothing together/)
  })

  it('greets by the rules as met after one talk, not as new', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana', 'bye']) await engine.handle(c)
    // Warm enough for a greeting with words.
    engine.state.relations!['npc_sana_holt']!.affinity = 60
    const greeting = text(await engine.handle('talk sana'))
    expect(greeting).not.toMatch(/You'll be new here/)
    expect(greeting).toMatch(/There you are again/)
  })
})
