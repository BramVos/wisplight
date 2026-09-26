import { describe, expect, it } from 'vitest'
import { Engine, GameClock, MockLlm, peopleLine, questsOf, systemPrompt, ties, tieTo } from '../src/engine'
import { content } from './helpers'

// Milestone M3.1 (docs/ROADMAP.md): relations between people, death and grief
// (brought forward from M6 at Bram's request), the chronicler and the AI goal choice.

const at = (engine: Engine, day: number, hour: number, minute = 0) => engine.tick(GameClock.from(211, 9, day, hour, minute).minutes - engine.world.now)
const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('M3.1: who people are to each other', () => {
  const engine = new Engine(content, { seed: 1 })
  const world = engine.world

  it('writes a relation once and derives the other side', () => {
    expect(tieTo(world, 'npc_pim', 'npc_grietje_visser')).toMatchObject({ role: 'parent', kind: 'family', name: 'Grietje' })
    expect(tieTo(world, 'npc_gerrit', 'npc_jan_visser')).toMatchObject({ role: 'crew', kind: 'work' })
    // A private relation stays private on the other side too.
    expect(tieTo(world, 'npc_lubbert', 'npc_kobus')).toMatchObject({ role: 'employee', private: true })
    expect(ties(world, 'npc_mirte').map((t) => t.name)).toEqual(expect.arrayContaining(['Joris', 'Harmen']))
  })

  it('tells the voice who its own people are, and what is private', () => {
    const line = peopleLine(world, 'npc_grietje_visser')!
    expect(line).toMatch(/Jan, your husband/)
    expect(line).toMatch(/Pim, your son/)
    expect(line).toMatch(/Fenna, your daughter \(missing\)/)
    expect(peopleLine(world, 'npc_kobus')).toMatch(/PRIVATE, not for people you do not trust: Lubbert, your employer/)
    expect(systemPrompt(world, 'npc_mirte')).toMatch(/YOUR PEOPLE: Joris, your husband \(away\)/)
  })

  it('knows who has a role in which quest', () => {
    expect(questsOf(world, 'npc_harmen').map((q) => q.id)).toEqual(expect.arrayContaining(['flour_for_veenhoek', 'what_the_haakman_wants']))
    expect(questsOf(world, 'npc_teunis')).toEqual([])
  })
})

describe('M3.1: death and grief', () => {
  function game(seed = 3) {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed, llm: mock, builder: true })
    at(engine, 15, 11)
    return { engine, mock }
  }

  it('takes the dead out of the world, and the family hears it first', async () => {
    const { engine } = game()
    const out = await engine.handle('@kill jan drowned in the Blackmere')
    expect(texts(out)).toMatch(/Jan Visser drowned in the Blackmere\. Belang 4\./)
    const jan = engine.state.npcs['npc_jan_visser']!
    expect(jan.dead).toBeDefined()
    expect(engine.world.npcsAt(jan.location)).not.toContain('npc_jan_visser')
    engine.tick(3 * 60)
    const heard = engine.state.news!.heard
    // Wherever they were, his wife and son know within a few hours, precisely.
    for (const near of ['npc_grietje_visser', 'npc_pim']) expect(heard[near]![jan.dead!.fact]).toMatchObject({ level: 3 })
    expect(engine.state.npcs['npc_jan_visser']!.location).toBe(jan.location)
    engine.tick(60)
    expect(await engine.handle('@kill jan again')).toMatchObject([{ kind: 'error' }])
  })

  it('makes the near ones grieve: mood, the prompt, and a day at home', async () => {
    const { engine, mock } = game()
    await engine.handle('@kill jan drowned in the Blackmere')
    engine.tick(3 * 60)
    const grietje = engine.state.npcs['npc_grietje_visser']!
    expect(grietje.location).toBe(content.npcs.get('npc_grietje_visser')!.home)
    engine.state.player.location = grietje.location
    await engine.handle('talk grietje')
    await engine.handle('How are you?')
    const prompt = mock.calls.at(-1)!.prompt
    expect(prompt).toMatch(/Mood: grieving for Jan/)
    expect(prompt).toMatch(/YOUR PEOPLE NOW: Jan, your husband, is dead: Jan Visser drowned in the Blackmere\. You are grieving\./)
    expect(prompt).toMatch(/LISTENER: the player is a stranger/)
  })

  it('keeps grief from strangers when there is no model', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    at(engine, 15, 11)
    await engine.handle('@kill jan drowned in the Blackmere')
    engine.tick(3 * 60)
    engine.state.player.location = engine.state.npcs['npc_grietje_visser']!.location
    await engine.handle('talk grietje')
    const stranger = texts(await engine.handle('ask grietje about jan'))
    expect(stranger).toMatch(/My husband\. I'd rather not speak of him to a stranger\./)
    Object.assign(engine.state.relations!['npc_grietje_visser']!, { familiarity: 40, trust: 40 })
    expect(texts(await engine.handle('ask grietje about jan'))).not.toMatch(/stranger/)
  })

  it('only runs build commands in the world builder, but replays them from a log', async () => {
    const plain = new Engine(content, { seed: 3 })
    expect(await plain.handle('@kill harmen')).toMatchObject([{ kind: 'error', text: expect.stringMatching(/world builder/) }])
    const { engine } = game()
    await engine.handle('@kill harmen fell from the mill')
    engine.tick(30)
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  })
})

describe('M3.1: the pace of events is the player\'s choice', () => {
  it('sets the tempo with a command', async () => {
    const engine = new Engine(content, { seed: 1 })
    expect(texts(await engine.handle('tempo dramatisch'))).toMatch(/dramatic: a lot happens/)
    expect(engine.state.stories!.tempo).toBe('dramatic')
    expect(await engine.handle('tempo wild')).toMatchObject([{ kind: 'error' }])
  })
})
