import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { checkQuests, questWarnings } from '../src/engine/quests/check'
import { pointsOf, storyLines } from '../src/engine/quests/knows'
import { questFromSketch, type QuestSketch } from '../src/engine/quests/sketch'
import { loadContentFromDir } from '../src/node/content'

// M10.35 C, where someone may point: knows said what a person knows at a
// stage, not where they may send the stranger, so "what should I do?" got a
// made-up hint. Now each person of a stage has points: the Now line, a person,
// a place, or nothing; without it they say they do not know.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')

describe('M10.35 C: where someone may point', () => {
  it('tells the voice where it may point, and that it does not know where it may not', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    expect(storyLines(engine.world, 'npc_mara_venn').join('\n')).toMatch(/The Orison Recordings, if the stranger asks what to do: you may send them to Niko Serrin, and recommend nothing else\./)
    expect(storyLines(engine.world, 'npc_ilyan_sorell').join('\n')).toMatch(/The Orison Recordings, if the stranger asks what to do: you may point them to this, in your own words: Ask Niko about the station, and recommend nothing else\./)
    expect(storyLines(engine.world, 'npc_edda_vale').join('\n')).toMatch(/The Orison Recordings, if the stranger asks what to do: say honestly that you do not know, and recommend nothing\./)
    // Her own story's first stage too, which she gives at the greeting.
    expect(pointsOf(engine.world, 'npc_mara_venn')).toEqual(['Compare the cargo manifests at the Arrival Lock', 'Niko Serrin'])
    expect(pointsOf(engine.world, 'npc_edda_vale')).toEqual([])
    // Skerrow: Maren sends the castaway to Brannoc.
    const skerrow = new Engine(isle, { seed: 1, builder: true })
    skerrow.start()
    await skerrow.handle('@quest off_skerrow')
    expect(pointsOf(skerrow.world, 'npc_maren')).toEqual(['Brannoc Reed'])
  })

  it('Check names a stage where nobody points, and points to what is not there', () => {
    const q = quiet.quests.get('story_a_second_opinion')!
    const silent = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, points: { npc_tessa_rook: 'nothing', npc_ilyan_sorell: 'nothing' } } : s)) }
    expect(questWarnings({ ...quiet, quests: new Map(quiet.quests).set(q.id, silent) })).toContain('quest story_a_second_opinion, stage s1: nobody may point the stranger anywhere (points), so whoever is asked what to do says they do not know')
    const wrong = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, points: { npc_tessa_rook: 'loc_nowhere' } } : s)) }
    expect(checkQuests({ ...quiet, quests: new Map(quiet.quests).set(q.id, wrong) })).toContain('quest story_a_second_opinion.s1.points: npc_tessa_rook points to loc_nowhere, which is not now, nothing, a person or a place')
    for (const world of [quiet, isle]) expect(questWarnings(world).filter((w) => /nobody may point/.test(w))).toEqual([])
  })

  it('builds points from a written line, by its keys', () => {
    const sketch: QuestSketch = {
      name: 'The Ledger',
      kind: 'request',
      summary: 'A ledger page is missing.',
      giver: 'p1',
      ask: 'Would you find it?',
      stages: [{ text: 'A page is gone.', say: 'read the manifests', at: 'l1', with: '', skill: '', done: 'It is plain now.', knows: [{ who: 'p1', line: 'Tessa knows a page is gone.', points: 'l1' }, { who: 'p2', line: 'Mara knows nothing of it.', points: 'nothing' }] }, { text: 'Then who.', say: 'ask mara about the ledger', at: 'l1', with: 'p2', skill: '', done: 'She says.' }],
      outcome: { name: 'Found', text: 'It is found.' },
    }
    const scope = { person: (k?: string) => ({ p1: 'npc_tessa_rook', p2: 'npc_mara_venn' })[k as 'p1'], place: (k?: string) => (k === 'l1' ? 'loc_arrival_lock' : undefined), places: [...quiet.locations.values()], skills: new Set<string>(), dc: 12, minStages: 1, mostStages: 3 }
    const quest = questFromSketch({ content: quiet }, sketch, 'story_the_ledger', scope) as { stages: { points?: Record<string, string> }[] }
    expect(quest.stages[0]!.points).toEqual({ npc_tessa_rook: 'loc_arrival_lock', npc_mara_venn: 'nothing' })
  })
})
