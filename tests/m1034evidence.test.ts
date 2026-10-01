import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { questWarnings } from '../src/engine/quests/check'
import { questFromSketch, endingProblems, type QuestSketch } from '../src/engine/quests/sketch'
import { allHold, questPage } from '../src/engine/quests/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.34 C, evidence is something you have (the external review of 30
// September, V03): "Tessa gives you the test telemetry" was a line and no
// more, so INVENTORY showed nothing, and the stranger could not read, show or
// use what the story had given.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')
const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
const said = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.34 C: evidence is something you have', () => {
  it('gives the test telemetry to hold: in INVENTORY, read with who gave it and who saw it, on the quest page, and shown in a talk', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    Object.assign((engine.state.flags ??= {}), { story_the_orison_recordings_1: true, story_the_orison_recordings_2: true, story_the_orison_recordings_3: true })
    await engine.handle('@quest story_the_orison_recordings')
    for (const c of ['@goto loc_commons', '@bring tessa', '@bring mara']) await engine.handle(c)
    // The stranger has heard of Tessa and Ilyan by name; the others are known as they were seen.
    Object.assign((engine.state.player.journal ??= {}), { npc_tessa_rook: 1, npc_ilyan_sorell: 1 })
    expect(said(await engine.handle('ask tessa about the drive test'))).toMatch(/She gives you the test telemetry/)
    expect(said(await engine.handle('inventory'))).toMatch(/You hold as evidence: the test telemetry \(from Tessa\)\./)
    const read = said(await engine.handle('read the telemetry'))
    expect(read).toMatch(/^The test telemetry \(from Tessa, by: ask Tessa about the drive test\): Telemetry of a drive test on Nacre/)
    // Everyone at breakfast saw it, as the stranger knows them.
    expect(read).toMatch(/ saw it\.$/)
    expect(read).toMatch(/the port coordinator|Mara/)
    expect(questPage(engine.world, 'story_the_orison_recordings')!.lines).toContain('Evidence: the test telemetry (from Tessa).')
    // Shown in a talk: the next answer hears it, and Ilyan remembers it.
    await engine.handle('@bring ilyan')
    await engine.handle('talk ilyan')
    expect(said(await engine.handle('show him the telemetry'))).toBe('You show Ilyan the test telemetry.')
    expect(engine.state.talk?.heard).toMatch(/^The stranger shows you the test telemetry: Telemetry of a drive test/)
    expect(engine.world.npcState('npc_ilyan_sorell').recent?.at(-1)?.text).toMatch(/The stranger showed you the test telemetry/)
    expect(said(await engine.handle('show the hangar plans'))).toMatch(/^You hold nothing called that\. You hold as evidence: the test telemetry/)
  })

  it('asks for it: an ending that plays the recordings needs the copies and the telemetry', () => {
    const e2 = quiet.quests.get('story_the_orison_recordings')!.actions!.find((a) => a.id === 'e2')!
    expect(e2.when).toEqual(expect.arrayContaining([{ holds: 'recording_copies' }, { holds: 'test_telemetry' }]))
    const engine = new Engine(quiet, { seed: 3 })
    engine.start()
    expect(allHold(engine.world, [{ holds: 'test_telemetry' }])).toBe(false)
  })

  it('Check names a deed that says it gives and gives nothing; the three worlds have none', () => {
    const q = quiet.quests.get('story_the_orison_recordings')!
    const bare = { ...q, actions: q.actions!.map((a) => (a.id === 'a4' ? { ...a, effects: a.effects.filter((e) => !('evidence' in e)) } : a)) }
    expect(questWarnings({ ...quiet, quests: new Map(quiet.quests).set(q.id, bare) })).toContain('quest story_the_orison_recordings, action a4: its text says "gives you the test telemetry", and nothing is given: add the thing (give) or evidence (evidence: id, name, text)')
    for (const world of [quiet, isle, deepwell]) expect(questWarnings(world).filter((w) => /nothing is given/.test(w))).toEqual([])
  })

  it('makes evidence of what a written line gives, and sends back one that says it gives and names nothing', () => {
    const sketch: QuestSketch = {
      name: 'The Ledger',
      kind: 'request',
      summary: 'A ledger page is missing.',
      giver: 'p1',
      ask: 'Would you find it?',
      stages: [
        { text: 'A page is gone.', say: 'ask tessa about the ledger', at: 'l1', with: 'p1', skill: '', done: 'Tessa hands you a copy of the page.', gives: 'a copy of the page' },
        { text: 'The copy shows who.', say: 'read the manifests', at: 'l2', with: '', skill: '', done: 'It is plain now.' },
      ],
      outcome: { name: 'Found', text: 'It is found.' },
    }
    const scope = { person: (k?: string) => (k === 'p1' ? 'npc_tessa_rook' : undefined), place: (k?: string) => (k === 'l1' ? 'loc_workshop' : k === 'l2' ? 'loc_arrival_lock' : undefined), places: [...quiet.locations.values()], skills: new Set<string>(), dc: 12, minStages: 1, mostStages: 3 }
    const quest = questFromSketch({ content: quiet }, sketch, 'story_the_ledger', scope) as { actions: { effects: unknown[] }[] }
    expect(quest.actions[0]!.effects).toContainEqual({ evidence: 'story_the_ledger_copy_of_the_page', name: 'a copy of the page', text: 'Tessa hands you a copy of the page.' })
    const nameless = { ...sketch, stages: sketch.stages.map((s) => ({ ...s, gives: '' })) }
    expect(endingProblems(nameless)).toContain('The Ledger: "hands you a copy of": name what the stranger is given in gives, so they hold it')
  })

  it('Skerrow has its own: Tamsin\'s counsel; Deepwell has no stories, and no evidence', async () => {
    const engine = new Engine(isle, { seed: 1, builder: true })
    engine.start()
    await engine.handle('@quest off_skerrow')
    await engine.handle('@bring tamsin')
    ;(engine.state.relations ??= {})['npc_tamsin'] = { ...(engine.state.relations['npc_tamsin'] ?? {}), affinity: 10 } as never
    said(await engine.handle('ask tamsin about the barrow'))
    expect(said(await engine.handle('read counsel'))).toMatch(/^Tamsin's counsel \(from Old Tamsin, by: ask Tamsin how to get into the wyrm's barrow safely\): Into the old gentleman's barrow by day/)
    const other = new Engine(deepwell, { seed: 1 })
    other.start()
    expect(said(await other.handle('inventory'))).not.toMatch(/evidence/)
    expect(said(await other.handle('show the letter'))).toBe('You hold no evidence of anything yet.')
  })
})
