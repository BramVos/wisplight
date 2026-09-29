import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type LlmRequest } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { callName } from '../src/engine/content'
import { journalPage } from '../src/engine/journal'
import { loadContentFromDir } from '../src/node/content'

// M10.29, names and the journal, from Bram's playtest of The Quiet Reach:
// Dr Ilyan Sorell was "Dr" on his page and in every line; the Commons said
// "Sana sells hot meals here." three times; "guest quarters" in Mara's line
// was not bracketed the first time; the talk window and the Here: line never
// showed a name once known; and a sealed hangar named in a talk stood in the
// journal as if the stranger had been there.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')
const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')

function stay(engine: Engine, npcId: string): void {
  const s = engine.state.npcs[npcId]!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  s.note = undefined
}

describe('M10.29 F: the name people use', () => {
  it('skips a title, takes the world\'s call, and keeps the first name where there is neither', () => {
    expect(callName({ name: 'Dr Ilyan Sorell' })).toBe('Ilyan')
    expect(callName({ name: 'Prof. Anna Berg' })).toBe('Anna')
    expect(callName(quiet.npcs.get('npc_ilyan_sorell')!)).toBe('Ilyan')
    expect(callName(quiet.npcs.get('npc_edda_vale')!)).toBe('Edda')
    // Skerrow's own: the island calls her by what she is to it.
    expect(callName(isle.npcs.get('npc_tamsin')!)).toBe('Old Tamsin')
    // Deepwell has neither: the first word, as ever.
    for (const npc of deepwell.npcs.values()) expect(callName(npc)).toBe(npc.name.split(' ')[0])
  })

  it('warns under Check of a title with no call, and not in The Quiet Reach', () => {
    const titled = { ...quiet, npcs: new Map(quiet.npcs) }
    titled.npcs.set('npc_ilyan_sorell', { ...quiet.npcs.get('npc_ilyan_sorell')!, call: undefined })
    expect(warnings(titled).some((w) => /npc_ilyan_sorell: the name starts with the title Dr; set call/.test(w))).toBe(true)
    expect(warnings(quiet).some((w) => /starts with the title/.test(w))).toBe(false)
  })
})

describe('M10.29 F: the journal', () => {
  it('says once what a provider sells at a place, with the hours when not all day', () => {
    const engine = new Engine(quiet, { seed: 1 })
    engine.start()
    const player = engine.state.player
    ;(player.journal ??= {})['loc_commons'] = 1
    player.seen = [...(player.seen ?? []), 'loc_commons']
    const lines = journalPage(engine.world, engine.topics, 'loc_commons')!.lines.filter((l) => /^Sana sells/.test(l))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^Sana sells .*hot meals here, 07-20; hot meals 07-09, 12-14, 18-20\.$/)
  })

  it('marks a place only heard of, after those seen, in the index and on the area page', () => {
    const engine = new Engine(quiet, { seed: 1 })
    engine.start()
    const player = engine.state.player
    ;(player.journal ??= {})['loc_peregrine_hangar'] = 1
    player.journal['loc_workshop'] = 1
    player.journal['area_vesper_works'] = 1
    player.seen = [...(player.seen ?? []).filter((id) => id !== 'loc_peregrine_hangar'), 'loc_workshop']
    const names = engine.status().journal.places.map((p) => p.name)
    expect(names).toContain('Peregrine Hangar (heard of)')
    expect(names).toContain('Workshop')
    expect(names.indexOf('Peregrine Hangar (heard of)')).toBeGreaterThan(names.indexOf('Workshop'))
    const links = journalPage(engine.world, engine.topics, 'area_vesper_works')!.links
    expect(links.find((l) => l.id === 'loc_peregrine_hangar')?.label).toBe('heard of')
    expect(links.find((l) => l.id === 'loc_workshop')?.label).toBe('place')
  })
})

describe('M10.29 F: in the talk and in the room', () => {
  it('brackets a place the speaker names the first time, and puts it in the journal', async () => {
    const mock = new MockLlm('good')
    const llm = {
      complete: async (r: LlmRequest) => {
        const response = await mock.complete(r)
        if (r.schemaName !== 'npc_reply') return response
        return { ...response, text: JSON.stringify({ ...JSON.parse(response.text), reply: 'The medical bay is past the guest quarters, if you need it.' }) }
      },
    }
    const engine = new Engine(quiet, { seed: 1, llm })
    engine.start()
    delete engine.state.player.journal?.['loc_medical_bay']
    stay(engine, 'npc_mara_venn')
    await engine.handle('talk mara')
    const said = (await engine.handle('"Where can I see a doctor?')).map((o) => o.text).join('\n')
    expect(said).toMatch(/\[medical bay\]/i)
    expect(engine.state.player.journal?.['loc_medical_bay']).toBeDefined()
  })

  it('shows the name with the role in the talk window and on the Here: line once they talked', async () => {
    const engine = new Engine(quiet, { seed: 1, llm: new MockLlm('good') })
    engine.start()
    stay(engine, 'npc_mara_venn')
    const before = (await engine.handle('look')).map((o) => o.text).join('\n')
    expect(before).not.toMatch(/Here: .*Mara Venn/)
    await engine.handle('talk mara')
    await engine.handle('"Hello.')
    expect(engine.status().talk?.name).toMatch(/^Mara Venn, /)
    await engine.handle('bye')
    const after = (await engine.handle('look')).map((o) => o.text).join('\n')
    expect(after).toMatch(/Here: .*Mara Venn, /)
  })

  it('asks which of them when the words fit several people here alike: "talk dr" with both doctors in the room', async () => {
    const engine = new Engine(quiet, { seed: 1 })
    engine.start()
    engine.state.player.location = 'loc_commons'
    for (const id of ['npc_ilyan_sorell', 'npc_edda_vale']) stay(engine, id)
    const asked = (await engine.handle('talk dr')).map((o) => o.text).join('\n')
    expect(asked).toMatch(/^Which of them do you mean\?\n {2}1\. Dr Edda Vale\n {2}2\. Dr Ilyan Sorell/)
    expect((await engine.handle('2')).map((o) => o.text).join('\n')).toMatch(/You are talking with the research lead\./)
    await engine.handle('bye')
    expect((await engine.handle('look dr')).map((o) => o.text).join('\n')).toMatch(/^Which of them do you mean\?/)
    expect((await engine.handle('1')).map((o) => o.text).join('\n')).toMatch(/^The medic\. /)
    // A whole name is never asked about.
    expect((await engine.handle('talk ilyan')).map((o) => o.text).join('\n')).toMatch(/You are talking with the research lead\./)
  })
})
