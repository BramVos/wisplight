import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { talksOf } from '../src/engine/chronicler'
import { askedOfStranger, confided } from '../src/engine/dialogue/aftertalk'
import { knob } from '../src/engine/knobs'
import { activeIn, evaluate, startQuest, type QuestHost } from '../src/engine/quests/engine'
import type { Storyline } from '../src/engine/state'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.30 (7), the parts the night round's own quest builds on (Bram, 29
// September 2026: not five at once; not the whole history, but what was said
// since the last round). A region runs at most story.quests_active quests
// beside the main line; the night round gets per storyline what its people
// remember of their talks with the stranger since it last told of it, at most
// ten; and a talk in which someone asks the stranger to do something, or
// tells a secret, is a fact of weight 3 that wakes the night round.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const host = (engine: Engine) => (engine as unknown as { questHost: QuestHost }).questHost

describe('M10.30 (7): at most so many quests at once in a region', () => {
  it('holds back a quest above the limit, lets the main line through, and starts a waiting one when a place frees', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    expect(knob(world, 'story.quests_active')).toBe(2)
    startQuest(world, host(engine), 'flour_for_veenhoek')
    startQuest(world, host(engine), 'the_honest_scale')
    expect(activeIn(world, 'home')).toEqual(['flour_for_veenhoek', 'the_honest_scale'])
    // Full: one that wakes again by itself (a talk, a place) simply does not begin now.
    startQuest(world, host(engine), 'the_surveyors_lights')
    expect(engine.state.questlog?.['the_surveyors_lights']).toBeUndefined()
    expect(engine.state.questsWaiting ?? []).not.toContain('the_surveyors_lights')
    // One begun by another quest waits its turn.
    startQuest(world, host(engine), 'the_vissers_to_safety')
    expect(engine.state.questsWaiting).toEqual(['the_vissers_to_safety'])
    // The main line always.
    startQuest(world, host(engine), 'grey_cat_on_the_doorstep')
    expect(engine.state.questlog?.['grey_cat_on_the_doorstep']).toBeDefined()
    // A quest ends: the waiting one begins.
    engine.state.questlog!['the_honest_scale']!.ended = world.now
    evaluate(world, host(engine))
    expect(engine.state.questlog?.['the_vissers_to_safety']).toBeDefined()
    expect(engine.state.questsWaiting).toEqual([])
  })

  it('Skerrow keeps one matter at a time; the build command @quest goes past the limit', async () => {
    const engine = new Engine(isle, { seed: 3, builder: true })
    expect(knob(engine.world, 'story.quests_active')).toBe(1)
    const nethermarch = new Engine(content, { seed: 3, builder: true })
    for (const id of ['flour_for_veenhoek', 'the_honest_scale', 'the_surveyors_lights']) await nethermarch.handle(`@quest ${id}`)
    expect(activeIn(nethermarch.world, 'home')).toHaveLength(3)
  })
})

describe('M10.30 (7): the night round sees what was said', () => {
  it('takes the talks of a storyline since it was last told of, from its people or about them, at most ten', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    const t0 = world.now
    const line = { id: 'line_1', title: 'the mill', facts: [], people: ['npc_harmen'], places: ['loc_molenend_mill'], summary: [], roles: [], hooks: [], reported: [], open: true, changed: false, told: t0 } as unknown as Storyline
    const remember = (npc: string, dt: number, note: string, topics: string[], talk = true) => (world.state.npcs[npc]!.memory ??= []).push({ t: t0 + dt, note, topics, valence: 0, ...(talk ? { talk: true as const } : {}) })
    remember('npc_harmen', -5, 'Before the last round.', [])
    remember('npc_harmen', 5, 'The stranger asked about my sails.', [])
    remember('npc_mirte', 6, 'The stranger asked me about Harmen.', ['npc_harmen'])
    remember('npc_mirte', 7, 'The stranger asked me about bread.', ['bread'])
    remember('npc_harmen', 8, 'Someone has been at my chest.', [], false)
    for (let i = 0; i < 12; i++) remember('npc_harmen', 20 + i, `Talk ${i}.`, [])
    const talks = talksOf(world, line, [])
    expect(talks).toHaveLength(10)
    expect(talks.at(-1)).toMatch(/^Harmen \([^)]+\): Talk 11\.$/)
    const early = talksOf(world, { ...line }, []).join('\n')
    expect(early).not.toMatch(/Before the last round|about bread|at my chest/)
    world.state.npcs['npc_harmen']!.memory = world.state.npcs['npc_harmen']!.memory!.filter((m) => !/^Talk/.test(m.note))
    expect(talksOf(world, line, [])).toEqual([expect.stringMatching(/^Harmen \(.+\): The stranger asked about my sails\.$/), expect.stringMatching(/^Mirte \(.+\): The stranger asked me about Harmen\.$/)])
  })

  it('makes a fact of weight 3 of a talk that asks the stranger to do something, once a day, and of a secret told, heard by nobody', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    const asked = askedOfStranger(world, 'npc_mirte', 'Harmen looks poorly. Could you go and check on him for me? I would be grateful.')!
    expect(asked).toMatchObject({ kind: 'asked_stranger', belang: 3, about: ['npc_mirte'] })
    expect(asked.text.precise).toBe('Mirte asked the stranger: "Could you go and check on him for me?"')
    expect(askedOfStranger(world, 'npc_mirte', 'Would you bring me some rye?')).toBeUndefined()
    expect(askedOfStranger(world, 'npc_harmen', 'The sails are torn, and the wind is up.')).toBeUndefined()
    expect(askedOfStranger(world, 'npc_harmen', 'Hm.', 'I asked the stranger to find sailcloth.')).toMatchObject({ belang: 3 })
    const secret = world.npc('npc_kaatje').secrets.find((s) => s.id === 'fenna_lied')!
    const told = confided(world, 'npc_kaatje', secret)
    expect(told).toMatchObject({ kind: 'confided', belang: 3 })
    expect(Object.entries(world.state.news?.heard ?? {}).filter(([, h]) => h[told.id])).toEqual([])
    // At four in the morning the night round takes the storyline it went into.
    const DAY = 24 * 60
    engine.tick(((4 * 60 - (world.now % DAY)) + DAY) % DAY || DAY)
    // Without a model the rules write the round at once: the storylines they went into were told of.
    for (const id of [asked.id, told.id]) {
      const line = world.state.chronicle!.lines.find((l) => l.facts.includes(id))!
      expect(line.reported).toContain(id)
      expect(line.told).toBeGreaterThan(asked.t)
    }
  })
})
