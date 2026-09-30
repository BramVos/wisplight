import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { knownShort } from '../src/engine/acquaintance'
import { questPage } from '../src/engine/quests/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.33 S, one naming rule (Bram, 30 September 2026: "Here: the medic" and
// "Edda comes from inside" on one screen), and C, the goal in view (he sought
// Dr Sorell for a day while he stood beside him). A person's name is known
// after a talk or once the stranger heard or read it: the intro and the quest,
// someone else, the journal, the person themself. Until then it stands nowhere.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.33 S: one naming rule', () => {
  it('knows by name whom the quest of the start names, and nobody else yet', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    expect(engine.world.knowsName('npc_ilyan_sorell')).toBe(true)
    expect(engine.world.knowsName('npc_niko_serrin')).toBe(true)
    expect(engine.world.knowsName('npc_edda_vale')).toBe(false)
    expect(engine.world.seenName('npc_edda_vale')).toBe('the medic')
    expect(knownShort(engine.world, 'npc_edda_vale')).toBe('the medic')
  })

  it('names nobody the stranger does not know, in a line of someone walking either', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const lines = text(await engine.handle('wait 5'))
    for (const unknown of ['Edda', 'Mara', 'Tessa', 'Sana']) expect(lines, unknown).not.toMatch(new RegExp(`\\b${unknown}\\b`))
    expect(engine.world.say('{name} comes from inside.', 'npc_edda_vale')).toBe('The medic comes from inside.')
    expect(engine.world.say('{name} comes from inside.', 'npc_niko_serrin')).toMatch(/^Niko comes from inside\.$/)
  })

  it('learns a name the four ways: the quest, someone else, the journal, the person themself', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const w = engine.world
    // Someone else told of her.
    ;(w.state.player.sources ??= {})['npc_mara_venn'] = [{ from: 'npc_sana_holt', t: w.now, level: 2 }]
    expect(w.knowsName('npc_mara_venn')).toBe(true)
    expect(knownShort(w, 'npc_mara_venn')).toMatch(/^Mara(?: Venn)?, the port coordinator$/)
    // Read of her in the journal.
    ;(w.state.player.journal ??= {})['npc_tessa_rook'] = w.now
    expect(w.seenName('npc_tessa_rook')).toBe('Tessa')
    // Talked with her.
    for (const c of ['@goto loc_medical_bay', '@bring edda', 'talk edda', 'bye']) await engine.handle(c)
    expect(w.knowsName('npc_edda_vale')).toBe(true)
    expect(text(await engine.handle('look'))).toMatch(/Here: (?:Dr )?Edda(?: Vale)?, the medic/)
  })

  it('never says a name twice: a short that begins with it gives only the role after it', async () => {
    const engine = new Engine(await loadContentFromDir(root, 'base'), { seed: 9, builder: true })
    engine.start()
    for (const c of ['@goto loc_veenhoek_bakery', '@bring mirte', 'talk mirte']) await engine.handle(c)
    expect(engine.status().talk!.name).toBe('Mirte Bakker, the baker')
  })
})

describe('M10.33 C: the goal in view', () => {
  it('puts the quest of the start in the side panel with what to do now, and its page says who gave it and where', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const open = engine.status().journal.quests.find((q) => q.group === 'Open')!
    expect(open).toMatchObject({ name: 'The Orison Recordings', now: 'Ask Niko Serrin about the listening station' })
    const page = questPage(engine.world, 'story_the_orison_recordings')!
    expect(page.lines).toContain('Given by [Dr Ilyan Sorell].')
    expect(page.lines.join('\n')).toMatch(/Where: \[Orison Listening Room\]\./)
  })

  it('knows the lore a new background names from the first minute', async () => {
    const base = await loadContentFromDir(root, 'base')
    const engine = new Engine(base, { seed: 9, builder: true })
    engine.start()
    expect(text(await engine.handle('recall haakman'))).toMatch(/know nothing/)
    await engine.handle('create warden heathborn eel_fisher name=Tester')
    expect(text(await engine.handle('recall haakman'))).not.toMatch(/know nothing/)
  })
})
