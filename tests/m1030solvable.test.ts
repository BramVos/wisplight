import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, type Content } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { questlog } from '../src/engine/quests/engine'
import { endingProblems, questFromSketch, type QuestSketch } from '../src/engine/quests/sketch'
import { solvableProblems } from '../src/engine/quests/solvable'
import { readStories, storiesFixRequest, storiesRequest, storyChecks, storyScopes, STORY_STEP_RULES } from '../src/engine/storystep'
import { QuestSchema } from '../src/engine/content'
import { storySchema } from '../src/engine/growth/regionstory'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.30 (6), solvable and checked (Bram, 29 September 2026: is there a check
// that quests can be done?), with at least three endings for a quest a model
// writes (Bram, 30 September 2026: the design asks three real solutions).

const root = join(import.meta.dirname, '../content')
const files = await readContentFiles(root, 'quietreach')
const quiet = loadContent(files)

/** A quest played along its shortest way: at each stage the deed that moves it on, done where and with whom it asks. */
async function playShortest(content: Content, id: string): Promise<string | undefined> {
  const engine = new Engine(content, { seed: 7, builder: true })
  engine.start()
  await engine.handle(`@quest ${id}`)
  const quest = content.quests.get(id)!
  const solutions = new Set((quest.outcomes ?? []).filter((o) => o.solution !== false).flatMap((o) => o.when.flatMap((c) => ('flag' in c ? [c.flag] : []))))
  for (let step = 0; step < 12; step++) {
    const state = questlog(engine.world)[id]
    if (!state || state.outcome) return state?.outcome
    const stage = quest.stages!.find((s) => s.id === state.stage)!
    const wanted = new Set((stage.next.length ? stage.next.flatMap((n) => n.when) : quest.outcomes!.flatMap((o) => o.when)).flatMap((c) => ('flag' in c ? [c.flag] : [])))
    const flags = engine.state.flags ?? {}
    const open = (a: NonNullable<typeof quest.actions>[number]) => a.when.every((c) => ('flag' in c ? flags[c.flag] !== undefined : 'not_flag' in c ? flags[c.not_flag] === undefined : true))
    const moving = (quest.actions ?? []).filter((a) => open(a) && a.effects.some((e) => 'set' in e && wanted.has(e.set)))
    // A solution before a way it goes wrong.
    const action = moving.find((a) => a.effects.some((e) => 'set' in e && solutions.has(e.set))) ?? moving[0]
    if (!action) return undefined
    engine.state.player.location = action.at[0]!
    if (action.with) Object.assign(engine.state.npcs[action.with]!, { location: action.at[0], activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
    // A check may fail; the deed may be tried again.
    for (let tries = 0; tries < 20 && !action.effects.every((e) => !('set' in e) || flags[e.set] !== undefined); tries++) await engine.handle(action.intent ?? '')
  }
  return questlog(engine.world)[id]?.outcome
}

describe('M10.30 (6): solvable, and three endings for what a model writes', () => {
  it('finds no quest without a way on in the three worlds, and names one that has none', async () => {
    for (const world of ['base', 'isle', 'quietreach']) {
      const content = await loadContentFromDir(root, world)
      expect(warnings(content).filter((w) => /no way (on|to end)|cannot be had/.test(w)), world).toEqual([])
    }
    const q = quiet.quests.get('story_short_on_the_count')!
    const stuck = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, next: [{ when: [{ flag: 'nobody_sets_this' }], to: 's2', effects: [] }] } : s)) }
    expect(solvableProblems({ ...quiet, quests: new Map(quiet.quests).set(q.id, stuck) }, stuck)).toEqual(['quest story_short_on_the_count, stage s1: no way on, the flag nobody_sets_this is set nowhere'])
    const wants = { ...q, stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, next: [{ when: [{ has: 'field_lamp' }, { has: 'no_such_thing' }], to: 's2', effects: [] }] } : s)) }
    expect(solvableProblems(quiet, wants)).toEqual(['quest story_short_on_the_count, stage s1: no way on, there is no thing no_such_thing'])
  })

  it('plays every quest The Quiet Reach made along its shortest way to an ending, each with three or four', async () => {
    for (const id of ['story_short_on_the_count', 'story_a_second_opinion', 'story_the_orison_recordings']) {
      expect(await playShortest(quiet, id), id).toBe('end1')
      const outcomes = quiet.quests.get(id)!.outcomes!
      expect(outcomes.filter((o) => o.solution).length, id).toBeGreaterThanOrEqual(id === 'story_the_orison_recordings' ? 3 : 2)
      expect(outcomes.some((o) => !o.solution), id).toBe(true)
    }
  })

  it('builds the endings of a sketch: a deed each after the stages, an outcome each, solutions and a way it goes wrong', async () => {
    const draft = readStories(files, 'No deaths.', await Promise.all(storyScopes(quiet, 'story').map(async (scope) => ({ scope, text: (await new MockLlm().complete(storiesRequest(files, scope, 'story', 'No deaths.'))).text }))))
    expect(draft.result?.ok).toBe(true)
    const grown = loadContent(draft.result!.ok ? draft.result!.files : files)
    const made = draft.changes.map((c) => grown.quests.get(c.id)!)
    for (const quest of made) {
      expect(quest.outcomes!.length, quest.id).toBeGreaterThanOrEqual(3)
      expect(quest.outcomes!.filter((o) => o.solution !== false).length, quest.id).toBeGreaterThanOrEqual(quest.kind === 'main' ? 3 : 2)
      expect(quest.outcomes!.some((o) => o.solution === false), quest.id).toBe(true)
      // Every one plays to a solution along its shortest way.
      expect(await playShortest(grown, quest.id), quest.id).toMatch(/^end\d$/)
    }
    // Check keeps the rule of the design for written quests as advice (three solutions); a small made line may have two.
    const about = warnings(grown).filter((w) => made.some((q) => w.includes(q.id)))
    expect(about.filter((w) => !/: 2 solutions, the design asks for at least three$/.test(w))).toEqual([])
    expect(about.every((w) => made.find((q) => w.includes(q.id))!.kind !== 'main')).toBe(true)
  })

  it('asks the region round in play for endings, and builds them', async () => {
    const reply = JSON.parse((await new MockLlm().complete({ role: 'chronicler', system: '', prompt: '', schemaName: 'region_story', schema: {}, maxTokens: 3000, meta: { story: 'x', name: 'Tollby', people: [{ key: 'p1', name: 'Ansel Reed' }, { key: 'p2', name: 'Wenna Moss' }], places: ['l1', 'l2'], aftermath: [], skills: [] } })).text)
    expect(reply.quest.endings.map((e: { way: string; solution: boolean }) => [e.way, e.solution])).toEqual([['talk', true], ['deed', true], ['fail', false]])
    expect(endingProblems(reply.quest)).toEqual([])
    // Optional in the kind's schema, so the replies recorded before endings still read; the rule says every stage before the last has its deed.
    const schema = storySchema() as { properties: { quest: { anyOf: { required: string[] }[] } } }
    expect(schema.properties.quest.anyOf[0]!.required).not.toContain('endings')
    expect(STORY_STEP_RULES).toMatch(/only the last stage may leave its own say, at and done empty; every stage before it has its deed/)
  })

  it('names what a line lacks in endings, and sends such a scope back to the model once with the check\'s lines', async () => {
    const one: QuestSketch = { name: 'One Way', kind: 'request', summary: 'A matter.', giver: 'p1', ask: 'Would you?', stages: [{ text: 'It must be done.', say: 'do the thing', at: 'l1', with: '', skill: '', done: 'It is done.' }], outcome: { name: 'Done', text: 'It came right.' } }
    expect(endingProblems(one)).toEqual(['One Way: 0 ways to end, at least three are needed (the lapse counts)', 'One Way: 0 solutions, at least 2 are needed', 'One Way: no ending where it goes wrong or runs out (an ending that is no solution, or a lapse)'])
    const scope = storyScopes(quiet, 'story')[0]!
    const text = JSON.stringify({ why: 'x', quest: null, quests: [one], watchers: [], lore: null, secrets: [] })
    const checks = storyChecks(files, [{ scope, text }])
    expect(checks[0]!.problems[0]).toMatch(/^One Way: 0 ways to end/)
    const again = storiesFixRequest(files, scope, 'story', 'No deaths.', text, checks[0]!.problems)
    expect(again.schemaName).toBe('region_story')
    expect(again.prompt).toMatch(/YOUR ANSWER BEFORE:\n\{"why":"x"/)
    expect(again.prompt).toMatch(/WHAT THE CHECK SAYS OF IT:\n- One Way: 0 ways to end/)
    // A built quest from a sketch with endings: the last stage has no deed of its own.
    const three = { ...one, endings: [
      { name: 'Asked nicely', text: 'Words did it.', solution: true, way: 'talk', say: 'ask nicely', at: 'l1', with: '', skill: '' },
      { name: 'Fixed it', text: 'Hands did it.', solution: true, way: 'deed', say: 'fix the thing', at: 'l1', with: '', skill: '' },
      { name: 'Walked away', text: 'Nobody did it.', solution: false, way: 'fail', say: 'walk away from it', at: 'l1', with: '', skill: '' },
    ] }
    expect(endingProblems(three)).toEqual([])
    const quest = questFromSketch({ content: quiet }, three, 'story_three', { person: () => 'npc_mara_venn', place: () => 'loc_commons', places: [...quiet.locations.values()], skills: new Set(), dc: 12, minStages: 1, mostStages: 3 })!
    expect(QuestSchema.parse(quest).actions!.map((a) => a.id)).toEqual(['e1', 'e2', 'e3'])
    expect(quest['outcomes']).toMatchObject([{ id: 'end1', solution: true }, { id: 'end2', solution: true }, { id: 'end3', solution: false }])
  })
})
