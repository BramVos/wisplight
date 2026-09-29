import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { QuestSchema } from '../src/engine/content'
import { questFromSketch, readSketch, sketchSchema, type QuestSketch } from '../src/engine/quests/sketch'
import { loadContentFromDir } from '../src/node/content'

// M10.30, one form for a quest a model writes (quests/sketch.ts): the story
// round of a region, the step Stories and the night round all write it, and
// the engine builds the quest, now with what to do now (goal), who knows what
// at each stage (knows) and what the story keeps hidden (truths).

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const keys: Record<string, string> = { p1: 'npc_ilyan_sorell', p2: 'npc_niko_serrin', p3: 'npc_tessa_rook', l1: 'loc_commons', l2: 'loc_workshop', l3: 'loc_orison_listening_room' }
const scope = (minStages: number) => ({
  person: (k: string | undefined) => (k && keys[k.trim()]?.startsWith('npc_') ? keys[k.trim()] : undefined),
  place: (k: string | undefined) => (k && keys[k.trim()]?.startsWith('loc_') ? keys[k.trim()] : undefined),
  places: [...quiet.locations.values()],
  skills: new Set(['electronics']),
  dc: 12,
  minStages,
  mostStages: 5,
})

const signal: QuestSketch = {
  name: 'The Silent Ridge',
  kind: 'main',
  summary: 'Why the listening station fails, and whether its recordings were changed.',
  giver: 'p1',
  ask: 'Bring me the recordings from the ridge, and tell me why the station keeps failing.',
  begins: 'start',
  stages: [
    { text: 'The recordings are on the ridge.', goal: 'Climb to the Listening Room and copy the recordings.', say: 'copy the recordings', at: 'l3', with: '', skill: 'electronics', done: 'The copy runs; one file is shorter than the others.', knows: [{ who: 'p2', line: 'Niko knows the relay cabinet burnt out a week ago.' }, { who: 'p9', line: 'Nobody.' }] },
    { text: 'One recording is shorter than the others.', goal: 'Ask Tessa about the coupling.', say: 'ask tessa about the coupling', at: 'l2', with: 'p3', skill: '', done: 'Tessa admits the coupling was never synced.', knows: [{ who: 'p3', line: 'Tessa knows the coupling was never synced; she does not know who took the pages.' }] },
  ],
  outcome: { name: 'The signal read', text: 'The recordings, whole, go back to Harrow.' },
  truths: [{ text: 'Ilyan cut the recordings himself.', words: ['ilyan cut', 'cut the recordings'], from: 2 }, { text: 'Too short.', words: ['ab'], from: 1 }],
}

describe('M10.30: the quest sketch', () => {
  it('builds a quest that loads, with goals, what people know, and what stays hidden', () => {
    const quest = questFromSketch({ content: quiet }, signal, 'story_signal', scope(1))!
    expect(QuestSchema.safeParse(quest).success).toBe(true)
    expect(quest).toMatchObject({ kind: 'main', givers: ['npc_ilyan_sorell'], starts: { at_start: true } })
    const stages = quest['stages'] as { id: string; goal?: string; knows?: Record<string, string> }[]
    expect(stages[0]).toMatchObject({ id: 's1', goal: 'Climb to the Listening Room and copy the recordings.', knows: { npc_niko_serrin: 'Niko knows the relay cabinet burnt out a week ago.' } })
    // A key that is nobody is left out; a truth with no word of three letters too.
    expect(Object.keys(stages[0]!.knows!)).toEqual(['npc_niko_serrin'])
    expect(quest['truths']).toEqual([{ text: 'Ilyan cut the recordings himself.', words: ['ilyan\\s+cut', 'cut\\s+the\\s+recordings'], from: 's2' }])
    // A deed with someone moves to where they work.
    const actions = quest['actions'] as { at: string[]; with?: string; check?: { skill: string } }[]
    expect(actions[1]).toMatchObject({ at: ['loc_workshop'], with: 'npc_tessa_rook' })
    expect(actions[0]!.check).toEqual({ skill: 'electronics', dc: 12 })
  })

  it('takes a line of one stage when it may, and none without a giver or with too few stages', () => {
    const small: QuestSketch = { ...signal, kind: 'request', begins: undefined, stages: [signal.stages[0]!], truths: [] }
    const one = questFromSketch({ content: quiet }, small, 'story_small', scope(1))!
    expect(one).toMatchObject({ starts: { talk: ['npc_ilyan_sorell'] } })
    expect(questFromSketch({ content: quiet }, small, 'story_small', scope(2))).toBeUndefined()
    expect(questFromSketch({ content: quiet }, { ...small, giver: 'p9' }, 'story_small', scope(1))).toBeUndefined()
  })

  it('reads a sketch and keeps its schema fixed, with what came with M10.30 optional', () => {
    expect(readSketch(JSON.parse(JSON.stringify(signal)))).not.toBeNull()
    expect(readSketch({ name: 'x' })).toBeNull()
    const schema = sketchSchema() as { required: string[]; properties: { stages: { items: { required: string[] } } } }
    expect(schema.required).not.toContain('truths')
    expect(schema.properties.stages.items.required).not.toContain('knows')
    expect(JSON.stringify(sketchSchema())).toBe(JSON.stringify(sketchSchema()))
  })
})
