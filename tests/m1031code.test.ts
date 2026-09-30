import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, QuestSchema, type Content, type Output } from '../src/engine'
import { questlog } from '../src/engine/quests/engine'
import { endingProblems, questFromSketch, type QuestSketch } from '../src/engine/quests/sketch'
import { solvableProblems } from '../src/engine/quests/solvable'
import { readStories, storiesRequest, storyScopes } from '../src/engine/storystep'
import { readContentFiles } from '../src/node/content'

// M10.31 C, a code as a deed in what the model writes (a gap of M10.30: the
// quest form of the step Stories and the night round did not know a code as a
// deed, the contract did). A deed or an ending may be a word: said to someone
// in a talk, or said or typed at a place, where a lock may take it. The
// solvability check counts it, and asks that the word is told somewhere.

const files = await readContentFiles(join(import.meta.dirname, '../content'), 'quietreach')
const quiet = loadContent(files)
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

const keys: Record<string, string> = { p1: 'npc_mara_venn', p2: 'npc_niko_serrin', l1: 'loc_commons', l2: 'loc_orison_listening_room' }
const scope = {
  person: (k: string | undefined) => (k && keys[k]?.startsWith('npc_') ? keys[k] : undefined),
  place: (k: string | undefined) => (k && keys[k]?.startsWith('loc_') ? keys[k] : undefined),
  places: [...quiet.locations.values()],
  skills: new Set<string>(),
  dc: 12,
  minStages: 1,
  mostStages: 3,
}

/** A line of two stages whose second ends, among other ways, by a word said to Niko. */
const passphrase: QuestSketch = {
  name: 'The Old Callsign',
  kind: 'mystery',
  summary: 'Niko will only open the old logs to someone who knows the station callsign.',
  giver: 'p1',
  ask: 'Niko keeps the old logs locked. Find out the station callsign and he may open them.',
  stages: [
    { text: 'Mara says the callsign is painted somewhere in the Commons.', say: 'read the old roster', at: 'l1', with: '', skill: '', done: 'Under the new roster the old one shows through: station callsign ORISON-NINE.', goal: 'Read the old roster in the Commons.' },
    { text: 'You know the callsign now.', say: '', at: 'l2', with: 'p2', skill: '', done: '' },
  ],
  outcome: { name: 'Logs opened', text: 'Niko opens the old logs.' },
  endings: [
    { name: 'The callsign', text: 'Niko hears the callsign, nods, and opens the old logs to you.', solution: true, way: 'word', say: '', at: 'l2', with: 'p2', skill: '', word: 'orison nine' },
    { name: 'A favour', text: 'You fix his headset, and he opens the logs for you.', solution: true, way: 'deed', say: 'fix the headset', at: 'l2', with: 'p2', skill: '' },
    { name: 'Shut out', text: 'Niko shrugs and keeps the logs shut.', solution: false, way: 'fail', say: 'give up on the logs', at: 'l2', with: '', skill: '' },
  ],
}

/** The world with one more quest. */
const withQuest = (quest: Record<string, unknown>): Content => {
  const q = QuestSchema.parse(quest)
  return { ...quiet, quests: new Map(quiet.quests).set(q.id, q) }
}

describe('M10.31 C: a code as a deed in what the model writes', () => {
  it('builds a word as an ending: said to someone, an outcome that waits for it, and no command', () => {
    expect(endingProblems(passphrase)).toEqual([])
    const quest = questFromSketch({ content: quiet }, passphrase, 'story_old_callsign', scope)!
    const built = QuestSchema.parse(quest)
    expect(built.actions!.map((a) => a.id)).toEqual(['a1', 'e2', 'e3'])
    expect(built.outcomes![0]).toMatchObject({ id: 'end1', solution: true, when: [{ flag: 'story_old_callsign_1' }, { said: 'orison nine', to: 'npc_niko_serrin' }] })
    // The word is told in the first deed: the check finds a way.
    expect(solvableProblems(withQuest(quest), built)).toEqual([])
    // A stage whose only way on is a word nobody tells: the check names it.
    const untold: QuestSketch = { ...passphrase, stages: [{ ...passphrase.stages[0]!, done: 'Under the new roster the old one shows through.', say: '', with: 'p2', word: 'orison nine' }, passphrase.stages[1]!] }
    const hidden = QuestSchema.parse(questFromSketch({ content: quiet }, untold, 'story_old_callsign', scope)!)
    expect(solvableProblems(withQuest(hidden), hidden)).toEqual(['quest story_old_callsign, stage s1: no way on, the word "orison nine" is told nowhere a player could learn it'])
  })

  it('plays the word ending: the callsign said to Niko in a talk ends it', async () => {
    const content = withQuest(questFromSketch({ content: quiet }, passphrase, 'story_old_callsign', scope)!)
    const engine = new Engine(content, { seed: 4, builder: true })
    engine.start()
    for (const c of ['@quest story_old_callsign', '@goto loc_commons', 'read the old roster']) await engine.handle(c)
    expect(questlog(engine.world)['story_old_callsign']!.stage).toBe('s2')
    for (const c of ['@goto loc_orison_listening_room', '@bring niko', 'talk niko', 'The callsign is Orison Nine.', 'bye']) await engine.handle(c)
    expect(questlog(engine.world)['story_old_callsign']!.outcome).toBe('end1')
  })

  it('shows the step where a lock takes a code, and builds a stage of the proposal done by typing it', async () => {
    const scopes = storyScopes(quiet, 'story')
    const main = storiesRequest(files, scopes.at(-1)!, 'story', 'No deaths.')
    expect(main.system + main.prompt).toMatch(/A DEED MAY BE A WORD/)
    expect(main.prompt).toMatch(/Workshop: [^\n]*\(a lock here takes the code 7411\)/)
    const draft = readStories(files, 'No deaths.', [{ scope: scopes.at(-1)!, text: (await new MockLlm().complete(main)).text }])
    const grown = loadContent(draft.result!.ok ? draft.result!.files : files)
    const made = grown.quests.get(draft.changes[0]!.id)!
    // The second stage is the code: no command of its own, it passes when 4471 is typed at the place, with what it brings.
    expect(made.actions!.map((a) => a.id)).not.toContain('a2')
    expect(made.stages![1]!.next[0]).toMatchObject({ when: [{ said: '4471' }], to: 's3', effects: [{ set: `${made.id}_2` }, { text: 'The lock gives. A ledger, with a page cut out.' }] })
    expect(solvableProblems(grown, made)).toEqual([])
    const engine = new Engine(grown, { seed: 5, builder: true })
    engine.start()
    await engine.handle(`@flag ${made.id}_1`)
    engine.state.player.location = (made.stages![1]!.next[0]!.when[0] as { at: string }).at
    expect(text(await engine.handle('type 4471'))).toMatch(/The lock gives/)
    expect(questlog(engine.world)[made.id]!.stage).toBe('s3')
  })
})
