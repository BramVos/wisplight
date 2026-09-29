import { describe, expect, it } from 'vitest'
import { checkContent, Engine, lockedIds, loadContent, MockLlm, type Content } from '../src/engine'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.24: new stays within the frames, and the world stays whole. Thirty days
// in the continue mode with the mock model: what the chronicler, the weave
// and the growth rules make by themselves is content like any (it passes the
// same checks), within the season's limits, with ids that never take a
// committed or buried one, and the game still saves and loads. Nobody starves
// on the way: someone far from home eats where they are, and a talk the
// stranger never answers ends.

const DAY = 24 * 60

async function thirtyDays(world: Content, seed = 1): Promise<Engine> {
  const engine = new Engine(world, { seed, llm: new MockLlm('good') })
  engine.setPlayMode('continue')
  for (let h = 0; h < 30 * 24; h++) {
    engine.tick(60)
    await engine.runModels()
  }
  return engine
}

function whole(base: Content, engine: Engine): void {
  expect(checkContent(engine.content)).toEqual([])
  expect(engine.state.growth?.season?.arrived ?? 0).toBeLessThanOrEqual(base.world.newcomers_per_season)
  const locked = lockedIds(base)
  const grown = [...engine.content.npcs.keys(), ...engine.content.locations.keys()].filter((id) => !base.npcs.has(id) && !base.locations.has(id))
  expect(grown.filter((id) => locked.has(id))).toEqual([])
  const loaded = Engine.fromSave(base, engine.save())
  expect([...loaded.content.npcs.keys()].sort()).toEqual([...engine.content.npcs.keys()].sort())
  for (const [id, npc] of Object.entries(engine.state.npcs)) if (!npc.dead) expect(npc.needs.hunger, id).toBeGreaterThan(0)
}

describe('M10.24: within the frames, thirty days on', () => {
  it('the Nethermarch grows within its limits with the mock model, and stays whole', async () => {
    whole(content, await thirtyDays(content))
  }, 180_000)

  it('Skerrow too', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    whole(isle, await thirtyDays(isle))
  }, 180_000)

  it('someone hours from home and getting hungry eats where they are, before the next long walk', () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const s = engine.state.npcs['npc_mathijs']!
    s.location = 'loc_goose_common'
    s.needs.hunger = 20
    s.plan = []
    s.goals = []
    s.busyUntil = engine.world.now
    engine.tick(3 * 60)
    expect(s.needs.hunger).toBeGreaterThan(20)
  })

  it('a visitor the stranger never answers goes about their business after half an hour', () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const here = engine.state.player.location
    const id = 'npc_mirte'
    engine.state.npcs[id]!.location = here
    engine.state.npcs[id]!.seeking = { line: 'There you are.', since: engine.world.now, until: engine.world.now + DAY }
    engine.state.npcs[id]!.activity = 'standing about'
    engine.state.npcs[id]!.busyUntil = engine.world.now + 60
    const met = engine.tick(1).map((o) => o.text).join('\n')
    expect(met).toMatch(/Mirte comes up to you\./)
    expect(engine.state.talk?.npc).toBe(id)
    const left = engine.tick(40).map((o) => o.text).join('\n')
    expect(left).toMatch(/Mirte waits a while for an answer, then goes about her business\./)
    expect(engine.state.talk).toBeUndefined()
  })
})
