import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkContent, Engine, loadContent, MockLlm, type Content, type Output } from '../src/engine'
import { hasPlayed, playedOf } from '../src/engine/played'
import { questlog } from '../src/engine/quests/engine'
import { questFromSketch, type QuestSketch } from '../src/engine/quests/sketch'
import { talkedHolds } from '../src/engine/said'
import { solvableProblems } from '../src/engine/quests/solvable'
import { readStories, storiesRequest, storyScopes } from '../src/engine/storystep'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.30, stories with hindsight (Bram, 29 September 2026): a world that has
// a game going and no stories gets them from the step Stories, which reads
// what the game has lived; a quest is content, so the save loads the new
// stories, and a stage the game has already lived counts as done. The proof
// is Bram's own game of The Quiet Reach (see the milestone report); here a
// game like it.

const root = join(import.meta.dirname, '../content')
const files = await readContentFiles(root, 'quietreach')
const quiet = loadContent(files)
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

/** The Quiet Reach as it was before its stories: no quests. */
const bare: Content = { ...quiet, quests: new Map() }

/** A game of The Quiet Reach from before the stories, in which the stranger asked Niko about the signal. */
async function oldGame(): Promise<Engine> {
  const engine = new Engine(bare, { seed: 3, builder: true })
  engine.start()
  engine.state.pastTalks = {
    npc_niko_serrin: [
      { t: engine.world.now, you: true, text: 'How can we find the source of the signal?' },
      { t: engine.world.now, you: false, text: '"We would need the bearing stable enough to track."' },
    ],
    npc_tessa_rook: [{ t: engine.world.now, you: true, text: 'Do you sell lamps?' }],
  }
  return engine
}

describe('M10.30: stories with hindsight', () => {
  it('knows a talk with someone, about a word from either side, and checks the person', async () => {
    const world = (await oldGame()).world
    expect(talkedHolds(world, { talked: 'npc_niko_serrin' })).toBe(true)
    expect(talkedHolds(world, { talked: 'npc_niko_serrin', about: ['signal'] })).toBe(true)
    expect(talkedHolds(world, { talked: 'npc_niko_serrin', about: ['bearing stable'] })).toBe(true)
    // Whole words: "sign" is not "signal"; and nothing with someone never talked to.
    expect(talkedHolds(world, { talked: 'npc_niko_serrin', about: ['sign'] })).toBe(false)
    expect(talkedHolds(world, { talked: 'npc_mara_venn' })).toBe(false)
    // A person who is not there is an error under Check, and no way on for the solvability check.
    const q = quiet.quests.get('story_the_orison_recordings')!
    const wrong = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, next: [{ when: [{ talked: 'npc_nobody', about: ['signal'] }], to: 's2', effects: [] }] } : s)) }
    const content = { ...quiet, quests: new Map(quiet.quests).set(q.id, wrong) }
    expect(checkContent(content).some((p) => p.includes('npc_nobody'))).toBe(true)
    expect(solvableProblems(content, wrong)).toEqual([`quest ${q.id}, stage s1: no way on, there is nobody npc_nobody`])
  })

  it('begins the main line when a save from before it is loaded, where the stranger stands, and replays it the same', async () => {
    const old = (await oldGame()).save()
    const loaded = await Engine.restore(quiet, old)
    expect(questlog(loaded.world)['story_the_orison_recordings']).toBeUndefined()
    const said = text(loaded.beginWritten())
    expect(said).toMatch(/New quest: The Orison Recordings/)
    // The stranger talked with Niko about the signal: the first stage is lived, and its deed's flag is set for the next.
    expect(questlog(loaded.world)['story_the_orison_recordings']!.stage).toBe('s2')
    expect(loaded.state.flags?.['story_the_orison_recordings_1']).toBe(true)
    expect(loaded.beginWritten()).toEqual([])
    // The small lines still wait for their givers; only a quest that begins with the game begins at the load.
    expect(questlog(loaded.world)['story_short_on_the_count']).toBeUndefined()
    // In the log: a replay of the same game begins it at the same point.
    const begun = loaded.save().log.filter((e) => e.k === 'begun')
    expect(begun).toMatchObject([{ k: 'begun', v: ['story_the_orison_recordings'] }])
    const again = await Engine.resume(quiet, old, begun)
    expect(questlog(again.world)['story_the_orison_recordings']!.stage).toBe('s2')
  })

  it('begins at the beginning in a game that never talked about it', async () => {
    const engine = new Engine(bare, { seed: 4, builder: true })
    engine.start()
    const loaded = await Engine.restore(quiet, engine.save())
    loaded.beginWritten()
    expect(questlog(loaded.world)['story_the_orison_recordings']!.stage).toBe('s1')
  })

  it('shows the step what a game has lived, for the main line only, and builds a lived stage', async () => {
    const played = playedOf((await oldGame()).world)
    expect(hasPlayed(played)).toBe(true)
    expect(played.talks.map((t) => t.npc)).toEqual(['npc_niko_serrin', 'npc_tessa_rook'])
    const scopes = storyScopes(quiet, 'story')
    const main = storiesRequest(files, scopes.find((s) => s.kind === 'main')!, 'story', 'No deaths.', played)
    expect(main.prompt).toMatch(/WHAT HAS BEEN PLAYED: a game of this world is under way/)
    expect(main.prompt).toMatch(/stranger: How can we find the source of the signal\?/)
    // A settlement's call does not read it, and a step without a game is as it was: the same prompt, the same cache.
    const place = scopes.find((s) => s.kind === 'place')!
    expect(storiesRequest(files, place, 'story', 'No deaths.', played).prompt).toBe(storiesRequest(files, place, 'story', 'No deaths.').prompt)
    expect(storiesRequest(files, scopes.at(-1)!, 'story', 'No deaths.').prompt).not.toMatch(/WHAT HAS BEEN PLAYED/)
    // The mock marks the first stage lived with the words the stranger said; the built quest passes it by that talk.
    const draft = readStories(files, 'No deaths.', [{ scope: scopes.at(-1)!, text: (await new MockLlm().complete(main)).text }])
    const grown = loadContent(draft.result!.ok ? draft.result!.files : files)
    const made = grown.quests.get(draft.changes[0]!.id)!
    expect(made.stages![0]!.next[1]).toMatchObject({ when: [{ talked: 'npc_niko_serrin', about: ['source', 'signal'] }], to: 's2', effects: [{ set: `${made.id}_1` }] })
  })

  it('leaves a lived stage out when it names nobody or no word, and never lives the last', () => {
    const sketch: QuestSketch = {
      name: 'Looked Back',
      kind: 'request',
      summary: 'A matter.',
      giver: 'p1',
      ask: 'Would you?',
      stages: [
        { text: 'First.', say: 'ask niko about it', at: 'l1', with: 'p1', skill: '', done: 'Done.', lived: { who: 'p9', words: ['signal'] } },
        { text: 'Second.', say: 'look at the dish', at: 'l1', with: '', skill: '', done: 'Done.', lived: { who: 'p1', words: ['ab'] } },
        { text: 'Third.', say: 'copy the files', at: 'l1', with: '', skill: '', done: 'Done.', lived: { who: 'p1', words: ['signal'] } },
      ],
      outcome: { name: 'Done', text: 'It came right.' },
    }
    const quest = questFromSketch({ content: quiet }, sketch, 'story_looked_back', { person: (k) => (k === 'p1' ? 'npc_niko_serrin' : undefined), place: () => 'loc_orison_listening_room', places: [...quiet.locations.values()], skills: new Set(), dc: 12, minStages: 1, mostStages: 3 })!
    const stages = quest['stages'] as { next: unknown[] }[]
    expect(stages.map((s) => s.next.length)).toEqual([1, 1, 0])
  })

  it('Skerrow: what Tamsin told in a talk about the barrow is her counsel', async () => {
    const isle = await loadContentFromDir(root, 'isle')
    const engine = new Engine(isle, { seed: 5 })
    engine.start()
    for (const c of ['e', 'e', 'buy salt fish', 'n', 'w', 'n']) await engine.handle(c)
    engine.state.pastTalks = { npc_tamsin: [{ t: engine.world.now, you: true, text: 'How would a body get into the barrow?' }] }
    await engine.handle('n')
    expect(text(await engine.handle('enter the barrow'))).toContain('You leave a salt fish by the standing stones')
    expect(engine.state.player.inventory['rune_key']).toBe(1)
  })
})
