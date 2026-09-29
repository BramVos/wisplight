import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkContent, Engine, loadContent, MockLlm } from '../src/engine'
import { wantFarPlace } from '../src/engine/growth/far'
import { wantOutline } from '../src/engine/outlines'
import { readContentFiles } from '../src/node/content'
import { regionOf } from '../src/engine/growth/regionstory'
import { questlog } from '../src/engine/quests/engine'
import { content } from './helpers'

// M10.25: a new region with a story of its own. When a far place or a town's
// first district is made playable and the stranger is there, the chronicler
// writes in one call what there is to live through: a quest of two or three
// stages with the people there, watchers on the world's standard aftermath,
// lore, and a secret for one in three people. The engine fixes the shape and
// checks it as content; it is a layer of the save.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

/** To Graafhaven as a player goes: west from Oude Zijl to the edge, and on. */
async function inGraafhaven(engine: Engine): Promise<void> {
  engine.start()
  await engine.handle('@goto loc_oude_zijl_sluice')
  for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
  await engine.handle('1')
  await engine.handle('@goto loc_graafhaven_market')
  await engine.handle('@time 11')
}

/** In Graafhaven with its first district made, and the story round run. */
async function withStory(engine: Engine): Promise<void> {
  await inGraafhaven(engine)
  await engine.handle('ask lammert about the holleveen')
  await engine.handle('bye')
  await engine.runModels()
  await engine.handle('look')
  await engine.runModels()
}

describe('M10.25: the story round at arrival', () => {
  it('writes a quest, a watcher, lore and a secret for a new town, and leaves out what does not fit', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 6, builder: true, llm })
    await withStory(engine)
    const story = engine.state.growth!.stories!['graafhaven']!
    expect(story.by).toBe('chronicler')
    expect(llm.calls.filter((c) => c.schemaName === 'region_story')).toHaveLength(1)
    const quest = engine.content.quests.get(String(story.quest!['id']))!
    expect(quest.name).toBe('The Missing Tally')
    expect(quest.stages!.map((s) => s.id)).toEqual(['s1', 's2'])
    // One watcher on the world's own standard aftermath; the made-up signal is gone.
    expect(story.watchers.map((w) => w['signal'])).toHaveLength(1)
    expect(engine.content.aftermath.size).toBeGreaterThan(0)
    expect([...engine.content.aftermath.values()].some((a) => a.signal === story.watchers[0]!['signal'])).toBe(true)
    expect(engine.content.topics.get(String(story.lore!['id']))!.kind).toBe('lore')
    // One in three of the region's people has a secret: the district round gave one, the weave another, so the story adds none.
    const people = regionOf(engine.world, 'graafhaven')!.people
    expect(people.filter((n) => n.secrets.length).length).toBeGreaterThanOrEqual(Math.ceil(people.length / 3))
    expect(Object.keys(story.secrets)).toEqual([])
    expect(checkContent(engine.content)).toEqual([])
    // The chronicle says why it came.
    expect(engine.chronicle()).toMatch(/The story of Graafhaven[\s\S]*lives by what comes in on its road/i)
    // The request puts the fixed part of the world build first, and the region after it.
    const request = llm.calls.find((c) => c.schemaName === 'region_story')!
    expect(request.system).toMatch(/^YOU ARE BUILDING A NEW WORLD WITH THE DESIGNER/)
    expect(request.system).toMatch(/IN PLAY: THE STORY OF A NEW REGION/)
    expect(request.prompt).toMatch(/^REGION: Graafhaven\./m)
    // The log plays back to the same story.
    const replayed = await Engine.replay(content, 6, engine.save().log)
    expect(replayed.state.growth!.stories).toEqual(engine.state.growth!.stories)
  })

  it('makes a quest that can be played through: the giver asks, two deeds, and it ends', async () => {
    const engine = new Engine(content, { seed: 6, builder: true, llm: new MockLlm('good') })
    await withStory(engine)
    const story = engine.state.growth!.stories!['graafhaven']!
    const id = String(story.quest!['id'])
    const giver = (story.quest!['givers'] as string[])[0]!
    const actions = story.quest!['actions'] as { say: string[]; at: string[]; with?: string }[]
    await engine.handle(`@goto ${engine.content.npcs.get(giver)!.work ?? engine.content.npcs.get(giver)!.home}`)
    Object.assign(engine.state.npcs[giver]!, { location: engine.state.player.location, busyUntil: engine.world.now + 600, plan: [] })
    await engine.handle(`talk ${engine.content.npcs.get(giver)!.name.split(' ')[0]}`)
    expect(questlog(engine.world)[id]).toBeDefined()
    await engine.handle('bye')
    for (const a of actions) {
      await engine.handle(`@goto ${a.at[0]}`)
      if (a.with) Object.assign(engine.state.npcs[a.with]!, { location: engine.state.player.location, busyUntil: engine.world.now + 600, plan: [] })
      // The command as the player types it; a deed that asks for a skill may take a few tries.
      const command = a.say[0]!.replace(/\(\?:\(\?:the\|a\|an\) \)\?/g, '')
      for (let i = 0; i < 12 && engine.state.flags?.[`${id}_${actions.indexOf(a) + 1}`] === undefined; i++) await engine.handle(command)
    }
    expect(questlog(engine.world)[id]!.outcome).toBe('done')
  })

  it('without a model gives the region one watcher of the standard set and no quest', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    await inGraafhaven(engine)
    await engine.handle('ask lammert about the holleveen')
    await engine.handle('bye')
    const story = engine.state.growth!.stories!['graafhaven']!
    expect(story.by).toBe('rules')
    expect(story.quest).toBeUndefined()
    expect(story.watchers).toHaveLength(1)
    expect(checkContent(engine.content)).toEqual([])
  })

  it('holds the quest as a hook in think mode, and makes the whole a proposal in direct mode', async () => {
    const think = new Engine(content, { seed: 6, builder: true, llm: new MockLlm('good') })
    think.setPlayMode('think')
    await withStory(think)
    const held = think.state.growth!.stories!['graafhaven']!
    expect(held.held).toBe(true)
    expect(think.content.quests.has(String(held.quest!['id']))).toBe(false)
    const hook = think.state.modes!.hooks.find((h) => h.story === 'graafhaven')!
    expect(hook.label).toMatch(/wants a word with you: The Missing Tally/)
    expect(said(await think.handle(`hook ${hook.id}`))).toMatch(/will be glad to see you: "The tally stick is gone/)
    expect(think.content.quests.has(String(held.quest!['id']))).toBe(true)

    const direct = new Engine(content, { seed: 6, builder: true, llm: new MockLlm('good') })
    direct.setPlayMode('direct')
    await withStory(direct)
    expect(direct.state.growth!.stories?.['graafhaven']).toBeUndefined()
    expect(said(await direct.handle('proposals'))).toMatch(/The story of a new region[\s\S]*\+ a matter of \w+: The Missing Tally/)
    const proposal = direct.state.modes!.proposals.find((p) => p.kind === 'story')!
    await direct.handle(`reject ${proposal.id}`)
    expect(direct.state.growth!.stories!['graafhaven']!.by).toBe('rules')
  })

  it('plays for a far place of Deepwell, a world without a map, reached by its tram', async () => {
    // Deepwell names no far place; this test gives it one at the end of the tram, and nothing else.
    const files = await readContentFiles(resolve(import.meta.dirname, 'worlds'), 'other')
    const far = { path: 'other/data/rimward.yaml', text: 'topics:\n  - id: rimward\n    name: Rimward Station\n    kind: place\n    summary: A mining station at the rim of the crater, where the ice trains turn back.\n' }
    const deepwell = loadContent([...files, far])
    const llm = new MockLlm('good')
    const engine = new Engine(deepwell, { seed: 2, builder: true, llm })
    engine.start()
    wantFarPlace(engine.world, 'rimward', { from: 'loc_deepwell_works_platform', minutes: 180, by: 'works_tram', water: false })
    const gate = String(engine.state.growth!.far!['rimward']!.locations[0]!['id'])
    await engine.handle(`@goto ${gate}`)
    // Passing through costs nothing: no story until the place is worked out, when the stranger talks or stays there.
    await engine.handle('look')
    expect(engine.state.growth?.storyPending ?? []).toEqual([])
    wantOutline(engine.world, 'rimward')
    await engine.runModels()
    await engine.handle('look')
    await engine.runModels()
    const story = engine.state.growth!.stories!['rimward']!
    expect(story.by).toBe('chronicler')
    expect(story.quest).toBeDefined()
    // Deepwell has one standard aftermath (befriended): the watcher uses it.
    expect(story.watchers.map((w) => w['signal'])).toEqual(['befriended'])
    // Two people there, so one secret.
    expect(Object.keys(story.secrets).length + [...engine.content.npcs.values()].filter((n) => n.secrets.length && engine.content.locations.get(n.home)?.area === String(engine.state.growth!.far!['rimward']!.area['id'])).length).toBeGreaterThanOrEqual(1)
    expect(checkContent(engine.content)).toEqual([])
  })

  it('writes nothing when the game builds new regions to their outline only', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 6, builder: true, llm })
    engine.start()
    await engine.handle('frames region outline')
    await withStory(engine)
    expect(engine.state.growth!.stories).toBeUndefined()
    expect(llm.calls.filter((c) => c.schemaName === 'region_story')).toHaveLength(0)
  })
})
