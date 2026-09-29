import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { framesView } from '../src/engine/frames'
import { knob } from '../src/engine/knobs'
import { recordFact } from '../src/engine/news'
import { loadContentFromDir } from '../src/node/content'

// M10.24: the frames once. At the start of a game the frames are on one
// screen (the world and its lands, the great lines, three dials, the play
// mode, and the app's budget and threshold beside them), and after that only
// in Settings. The dials are knobs of this game over the world's own, set by
// the command FRAMES, so a replay sets them as the game did.

const root = resolve(import.meta.dirname, '../content')
const text = async (engine: Engine, command: string) => (await engine.handle(command)).map((o) => o.text).join('\n')

describe('M10.24: the frames of a game', () => {
  it('shows Skerrow with its second land, its great line, the dials and the play mode', async () => {
    const engine = new Engine(await loadContentFromDir(root, 'isle'), { seed: 1 })
    engine.start()
    const view = framesView(engine.world)
    expect(view.lands).toEqual([{ id: 'western_isles', name: 'the Western Isles', reach: 'trade', why: expect.stringMatching(/white boat/), tongue: 'the Old Tongue' }])
    expect(view.lines.map((l) => [l.name, l.stage])).toEqual([['the great storm', 'calm']])
    expect(view.dials.map((d) => [d.id, d.chosen])).toEqual([
      ['events', 'normal'],
      ['lines', 'world'],
      ['growth', 'world'],
    ])
    expect(view.mode).toBe('continue')
    const said = await text(engine, 'frames')
    expect(said).toMatch(/The lands:\n {2}the Western Isles: joined by trade .*; they speak the Old Tongue\./)
    expect(said).toMatch(/The great lines:\n {2}the great storm \(storm\): calm; driven by /)
    expect(said).toMatch(/How often a storyline comes looking for you: as the world has it \(FRAMES LINES OFTEN, WORLD, SELDOM\)\./)
    expect(engine.page('frames')!.frames!.world.name).toBe(view.world.name)
  })

  it('sets the dials as knobs of this game, within their bounds, and back to the world\'s', async () => {
    const engine = new Engine(await loadContentFromDir(root, 'isle'), { seed: 1 })
    engine.start()
    const world = engine.world
    expect(await text(engine, 'frames lines often')).toBe('How often a storyline comes looking for you: often.')
    expect([knob(world, 'story.urgent_belang'), knob(world, 'story.hooks_per_week')]).toEqual([3, 4])
    await engine.handle('frames lines seldom')
    expect([knob(world, 'story.urgent_belang'), knob(world, 'story.hooks_per_week')]).toEqual([5, 1])
    await engine.handle('frames growth much')
    expect([knob(world, 'sketches.per_day'), knob(world, 'sketches.per_area_season'), knob(world, 'props.per_week')]).toEqual([4, 12, 6])
    await engine.handle('frames growth little')
    expect([knob(world, 'sketches.per_day'), knob(world, 'sketches.per_area_season'), knob(world, 'props.per_week')]).toEqual([1, 3, 2])
    await engine.handle('frames events dramatic')
    expect(framesView(world).dials.map((d) => d.chosen)).toEqual(['dramatic', 'seldom', 'little'])
    await engine.handle('frames lines world')
    await engine.handle('frames growth world')
    expect(world.state.knobs).toEqual({})
    expect(knob(world, 'story.urgent_belang')).toBe(4)
    expect(await text(engine, 'frames growth enormous')).toMatch(/FRAMES GROWTH LITTLE, WORLD or MUCH/)
  })

  it('calls the chronicler by day for smaller news when the storylines come often', async () => {
    const engine = new Engine(await loadContentFromDir(root, 'isle'), { seed: 1 })
    engine.start()
    const world = engine.world
    const news = (title: string) => recordFact(world, { kind: 'quarrel', about: ['npc_maren'], place: 'loc_skerrow_harbour', belang: 3, title, text: { precise: title, village: title, far: title } })
    news('a quarrel at the harbour')
    expect(world.state.chronicle?.pending.some((r) => r.reason === 'urgent') ?? false).toBe(false)
    await engine.handle('frames lines often')
    engine.tick(24 * 60)
    news('another quarrel at the harbour')
    expect(world.state.chronicle!.pending.some((r) => r.reason === 'urgent')).toBe(true)
  })

  it('keeps the dials in a save and in a replay of the log', async () => {
    const content = await loadContentFromDir(root, 'isle')
    const engine = new Engine(content, { seed: 3 })
    engine.start()
    await engine.handle('frames lines often')
    await engine.handle('frames growth much')
    expect(Engine.fromSave(content, engine.save()).world.state.knobs).toEqual(engine.world.state.knobs)
    const again = await Engine.replay(content, 3, engine.save().log)
    expect(again.world.state.knobs).toEqual({ 'story.urgent_belang': 3, 'story.hooks_per_week': 4, 'sketches.per_day': 4, 'sketches.per_area_season': 12, 'props.per_week': 6 })
    expect(framesView(again.world).dials.map((d) => d.chosen)).toEqual(['normal', 'often', 'much'])
  })

  it('shows each world as it is: the Nethermarch has no second land, Deepwell a land next door and the long dark', async () => {
    const base = new Engine(await loadContentFromDir(root, 'base'), { seed: 1 })
    base.start()
    expect(framesView(base.world).lands).toEqual([])
    expect(framesView(base.world).lines.length).toBeGreaterThan(0)
    const other = new Engine(await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other'), { seed: 1 })
    other.start()
    const view = framesView(other.world)
    expect(view.lands).toEqual([{ id: 'kessler_claim', name: 'the Kessler Claim', reach: 'close' }])
    expect(view.lines).toEqual([{ id: 'long_dark', name: 'the long dark', kind: 'failure', stage: 'calm', driven: 'want in the Domes' }])
    expect(await text(other, 'frames')).toMatch(/the Kessler Claim: close neighbours\./)
  })
})
