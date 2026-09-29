import { describe, expect, it } from 'vitest'
import { Engine, MINUTES_PER_DAY, MockLlm, type LlmRequest } from '../src/engine'
import { asksModel } from '../src/engine/npc/goals'
import { GOALS_PER_GAME_DAY } from '../src/node/ai/frequency'
import { content } from './helpers'

// M10.27, the costs down: the goal choices drove the bill, 45 to 80 an hour
// where the guide counted 25, since everyone within eight km asked the model.
// Now only people near the player (people.model_km), in the player's area, in
// an open storyline or named in a running plan ask it; the others choose by
// the rules, as a person far off always did.

/** Goal choices per game day in three days of the Nethermarch with the mock, the player standing at the start. */
async function choicesPerDay(modelKm?: number): Promise<number[]> {
  const mock = new MockLlm('good')
  let engine: Engine
  const perDay = new Map<number, number>()
  const llm = {
    complete: async (r: LlmRequest) => {
      if (r.schemaName === 'npc_goals') {
        const day = Math.floor(engine.world.now / MINUTES_PER_DAY)
        perDay.set(day, (perDay.get(day) ?? 0) + 1)
      }
      return mock.complete(r)
    },
  }
  engine = new Engine(content, { seed: 1, llm })
  engine.setPlayMode('continue')
  engine.start()
  if (modelKm !== undefined) (engine.state.knobs ??= {})['people.model_km'] = modelKm
  const first = Math.floor(engine.world.now / MINUTES_PER_DAY)
  for (let hour = 0; hour < 72; hour++) {
    engine.tick(60)
    await engine.runModels()
  }
  return [1, 2, 3].map((d) => perDay.get(first + d) ?? 0)
}

describe('M10.27: fewer goal choices go to the model', () => {
  it('asks the model for people near the player, in their area, in an open storyline or named in a plan', () => {
    const engine = new Engine(content, { seed: 1, llm: new MockLlm('good') })
    engine.start()
    const world = engine.world
    const here = world.state.player.location
    const area = world.content.locations.get(here)!.area
    const near = Object.keys(world.state.npcs).find((id) => world.content.locations.get(world.npcState(id).location)?.area === area)!
    expect(asksModel(world, near)).toBe(true)
    // Someone in another village, some km off, chooses by the rules.
    const far = Object.keys(world.state.npcs).find((id) => {
      const loc = world.content.locations.get(world.npcState(id).location)
      return loc && loc.area !== area && !asksModel(world, id)
    })!
    expect(far).toBeDefined()
    // In an open storyline, or named in a running plan, they ask the model after all.
    const chronicle = (world.state.chronicle ??= { seq: 0, lines: [], lore: [] } as never) as { lines: { open: boolean; people: string[]; roles: { role: string; who: string }[] }[] }
    chronicle.lines.push({ open: true, people: [far], roles: [] } as never)
    expect(asksModel(world, far)).toBe(true)
    chronicle.lines.pop()
    ;(world.state.plans ??= []).push({ plan: 'x', started: 0, phase: 0, cause: '', groups: {}, bind: { who: far } })
    expect(asksModel(world, far)).toBe(true)
  })

  it('halves the goal choices of three days, and the rules still give the rest their day', async () => {
    const before = await choicesPerDay(8)
    const after = await choicesPerDay()
    const sum = (n: number[]) => n.reduce((a, b) => a + b, 0)
    expect(sum(before)).toBeGreaterThan(100)
    expect(sum(after)).toBeLessThan(sum(before) * 0.65)
    expect(after.every((n) => n > 5)).toBe(true)
    // The guide price counts the goal choices at this pace (src/node/ai/frequency.ts): it still fits.
    expect(Math.abs(sum(after) / 3 - GOALS_PER_GAME_DAY) / GOALS_PER_GAME_DAY).toBeLessThan(0.35)
  }, 240_000)
})
