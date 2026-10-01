import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { heardBy } from '../src/engine/news'
import { storyLines } from '../src/engine/quests/knows'
import { questWarnings } from '../src/engine/quests/check'
import { endingProblems, type QuestSketch } from '../src/engine/quests/sketch'
import { loadContentFromDir } from '../src/node/content'

// M10.34 G, an ending lives on with those who know it (the external review of
// 30 September, V08): after the end nobody knew what had happened, for the
// stage knowledge stops there; and an ending must not become known to
// everyone with a part at once, or the people are all-knowing. The ending is
// a fact where it happened, the people there its witnesses, and it goes on
// by the news as any fact does.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')

const ending = (engine: Engine, quest: string) => Object.values(engine.state.news?.facts ?? []).find((f) => f.kind === `quest:${quest}`)

describe('M10.34 G: an ending lives on with those who know it', () => {
  it('is a fact where the stranger ended it: a witness knows it, one far off does not, and a reload keeps it so', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    await engine.handle('@quest story_the_orison_recordings')
    Object.assign((engine.state.flags ??= {}), { story_the_orison_recordings_1: true, story_the_orison_recordings_2: true, story_the_orison_recordings_3: true, story_the_orison_recordings_4: true })
    const held = { text: 'x', quest: 'story_the_orison_recordings', t: 0, seen: [] }
    engine.state.player.dossier = { recording_copies: { name: 'your copies of the recordings', ...held }, test_telemetry: { name: 'the test telemetry', ...held } }
    engine.tick(1)
    await engine.handle('@goto loc_commons')
    // Tessa sits in the Commons; Niko is up on the ridge.
    engine.state.npcs['npc_tessa_rook']!.location = 'loc_commons'
    engine.state.npcs['npc_niko_serrin']!.location = 'loc_orison_listening_room'
    await engine.handle('play the recordings in the commons')
    expect(engine.state.questlog?.['story_the_orison_recordings']?.outcome).toBe('end2')
    const fact = ending(engine, 'story_the_orison_recordings')!
    expect(fact.place).toBe('loc_commons')
    expect(fact.text.precise).toMatch(/^At the evening meal the stranger put the raw copies/)
    expect(heardBy(engine.world, 'npc_tessa_rook')[fact.id]?.from).toBe('witness')
    expect(heardBy(engine.world, 'npc_niko_serrin')[fact.id]).toBeUndefined()
    // Her voice knows how it ended, as she saw it; his knows nothing of it.
    expect(storyLines(engine.world, 'npc_tessa_rook').join('\n')).toMatch(/The Orison Recordings, how it ended, as you saw it: At the evening meal the stranger/)
    expect(storyLines(engine.world, 'npc_niko_serrin').join('\n')).not.toMatch(/how it ended/)
    // A thank-you once: the next time she has spoken of it before.
    expect(storyLines(engine.world, 'npc_tessa_rook').join('\n')).toMatch(/You have spoken of it with the stranger before: do not thank them or tell it again unless they ask\./)
    // Leaving and coming back: the save keeps who saw it and who did not.
    const again = Engine.fromSave(quiet, engine.save())
    expect(heardBy(again.world, 'npc_tessa_rook')[fact.id]?.from).toBe('witness')
    expect(heardBy(again.world, 'npc_niko_serrin')[fact.id]).toBeUndefined()
  })

  it('tells Skerrow\'s ending in its own words, of the castaway', async () => {
    const engine = new Engine(isle, { seed: 1, builder: true })
    engine.start()
    await engine.handle('@quest off_skerrow')
    ;(engine.state.flags ??= {})['waystone_open'] = true
    engine.tick(1)
    expect(engine.state.questlog?.['off_skerrow']?.outcome).toBe('through_the_waystone')
    expect(ending(engine, 'off_skerrow')!.text).toMatchObject({ precise: 'The castaway went through the waystone in the grey light, and was gone.', village: 'The castaway walked into the standing stones and never came out, they say.' })
  })

  it('Check names an ending said to the stranger that nobody can tell; a written line tells its endings as people do', () => {
    const q = quiet.quests.get('story_the_orison_recordings')!
    const bare = { ...q, outcomes: q.outcomes!.map((o) => (o.id === 'end4' ? { ...o, news: undefined } : o)) }
    expect(questWarnings({ ...quiet, quests: new Map(quiet.quests).set(q.id, bare) })).toContain('quest story_the_orison_recordings, outcome end4: its text speaks to the stranger, and nobody can tell it so: give it news (precise, and village and far if they differ), as a witness would tell it')
    for (const world of [quiet, isle]) expect(questWarnings(world).filter((w) => /speaks to the stranger/.test(w))).toEqual([])
    const sketch = { name: 'One Way', kind: 'request', summary: 'A matter.', giver: 'p1', ask: 'Would you?', stages: [{ text: 'It must be done.', say: 'do the thing', at: 'l1', with: '', skill: '', done: 'It is done.' }], outcome: { name: 'Done', text: 'It came right.' }, endings: [{ name: 'Asked', text: 'You asked nicely, and it was done.', solution: true, way: 'talk', say: 'ask nicely', at: 'l1', with: '', skill: '' }, { name: 'Gone', text: 'Nobody did it.', solution: false, way: 'fail', say: 'walk away from it', at: 'l1', with: '', skill: '' }] } as QuestSketch
    expect(endingProblems(sketch)).toContain('One Way: the ending "Asked" says "you": tell what came of it as people tell it, the stranger as "the stranger"')
  })
})
