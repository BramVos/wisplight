import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { heardBy, passOn, recordFact } from '../src/engine/news'
import { checkQuests, questWarnings } from '../src/engine/quests/check'
import { questPage } from '../src/engine/quests/engine'
import { storyLines } from '../src/engine/quests/knows'
import { questFromSketch, type QuestSketch } from '../src/engine/quests/sketch'
import { loadContentFromDir } from '../src/node/content'

// M10.35 G, a lie with a reason (the researcher's lesson 5: players take an
// untruth with a motive, and turn from a character who says untruths for
// none). A lie is said as the speaker's own choice, shown up by a deed or by
// someone who knows better, and taken as they would when they are shown.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')
const lines = (engine: Engine, npc: string) => storyLines(engine.world, npc).join('\n')

describe('M10.35 G: a lie with a reason', () => {
  it('has Sorell lie about the gaps until the copies show otherwise, and caught when shown them; the quest page never says it', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    await engine.handle('@quest story_the_orison_recordings')
    expect(lines(engine, 'npc_ilyan_sorell')).toMatch(/what you tell the stranger, though it is not true, by your own choice \(to keep the drive test and the Peregrine out of it\): The gaps in the archive are where the failing station dropped whole minutes/)
    expect(lines(engine, 'npc_ilyan_sorell')).not.toMatch(/may know better/)
    // The copies made: the stranger may know better.
    Object.assign((engine.state.flags ??= {}), { story_the_orison_recordings_1: true })
    engine.tick(1)
    await engine.handle('@goto loc_orison_listening_room')
    await engine.handle('copy the original recordings')
    expect(lines(engine, 'npc_ilyan_sorell')).toMatch(/The stranger may know better now: if they confront you with it, Shown the copies, Ilyan goes quiet/)
    // Shown the copies: caught.
    await engine.handle('@bring ilyan')
    await engine.handle('show the copies to ilyan')
    expect(lines(engine, 'npc_ilyan_sorell')).toMatch(/the stranger has shown you it is not so\. Shown the copies, Ilyan goes quiet/)
    expect(questPage(engine.world, 'story_the_orison_recordings')!.lines.join('\n')).not.toMatch(/dropped whole minutes/)
  })

  it('has Brannoc blame the Kittiwake, until she is mended', async () => {
    const engine = new Engine(isle, { seed: 1, builder: true })
    engine.start()
    await engine.handle('@quest off_skerrow')
    expect(lines(engine, 'npc_brannoc')).toMatch(/The Kittiwake is past mending/)
    engine.state.questlog!['off_skerrow']!.done.push('mend_kittiwake')
    expect(lines(engine, 'npc_brannoc')).toMatch(/The stranger may know better now: if they confront you with it, Brannoc looks at the new seams a long while/)
  })

  it('Check names a lie with no way to be shown up, and one shown up by what is not there', () => {
    const q = quiet.quests.get('story_the_orison_recordings')!
    const trap = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, lies: { npc_ilyan_sorell: { ...s.lies!['npc_ilyan_sorell']!, shown_by: ['npc_haakman'] } } } : s)) }
    expect(checkQuests({ ...quiet, quests: new Map(quiet.quests).set(q.id, trap) })).toContain("quest story_the_orison_recordings.s1.lies: npc_ilyan_sorell's lie is shown up by npc_haakman, which is no deed of this quest and nobody")
    const nobody = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, lies: { npc_ilyan_sorell: { ...s.lies!['npc_ilyan_sorell']!, shown_by: ['npc_sana_holt'] } } } : s)) }
    // Sana knows of the story, so she may tell better: a game. Edda without a knows line at any stage would be a trap.
    expect(questWarnings({ ...quiet, quests: new Map(quiet.quests).set(q.id, nobody) }).filter((w) => /lie has no way/.test(w))).toEqual([])
    for (const world of [quiet, isle]) expect(questWarnings(world).filter((w) => /lie has no way/.test(w))).toEqual([])
  })

  it('builds a lie of a written line, shown up by the deed of its stage', () => {
    const sketch: QuestSketch = {
      name: 'The Ledger',
      kind: 'request',
      summary: 'A ledger page is missing.',
      giver: 'p1',
      ask: 'Would you find it?',
      stages: [
        { text: 'A page is gone.', say: 'read the manifests', at: 'l1', with: '', skill: '', done: 'It is plain now.', knows: [{ who: 'p2', line: 'Mara cut the page.', points: 'nothing', lies: 'No page was ever cut.', why: 'to hide her mistake', caught: 'All right. It was me.' }] },
        { text: 'Then who.', say: 'ask mara about the ledger', at: 'l1', with: 'p2', skill: '', done: 'She says.' },
      ],
      outcome: { name: 'Found', text: 'It is found.' },
    }
    const scope = { person: (k?: string) => ({ p1: 'npc_tessa_rook', p2: 'npc_mara_venn' })[k as 'p1'], place: (k?: string) => (k === 'l1' ? 'loc_arrival_lock' : undefined), places: [...quiet.locations.values()], skills: new Set<string>(), dc: 12, minStages: 1, mostStages: 3 }
    const quest = questFromSketch({ content: quiet }, sketch, 'story_the_ledger', scope) as { stages: { lies?: Record<string, unknown> }[] }
    expect(quest.stages[0]!.lies).toEqual({ npc_mara_venn: { says: 'No page was ever cut.', why: 'to hide her mistake', caught: 'All right. It was me.', shown_by: ['a1'] } })
  })

  it('takes three tellers of one rumour as one: a second teller adds nothing', () => {
    const engine = new Engine(quiet, { seed: 3 })
    engine.start()
    const fact = recordFact(engine.world, { kind: 'rumour', about: [], place: 'loc_commons', belang: 2, title: 'A rumour', text: { precise: 'x', village: 'x', far: 'x' } })
    const listener = 'npc_edda_vale'
    delete heardBy(engine.world, listener)[fact.id]
    passOn(engine.world, 'npc_sana_holt', listener, fact.id)
    const first = heardBy(engine.world, listener)[fact.id] && { ...heardBy(engine.world, listener)[fact.id]! }
    passOn(engine.world, 'npc_mara_venn', listener, fact.id)
    passOn(engine.world, 'npc_tessa_rook', listener, fact.id)
    expect(heardBy(engine.world, listener)[fact.id]).toEqual(first)
  })
})
