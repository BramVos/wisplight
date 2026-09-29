import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { stepsFromOp } from '../src/engine/planning'
import { content } from './helpers'

// M10.25, found by the played proof at outline: the chronicler's night round
// had the Goat-Riders "keep watch over Cornelis's stakes", a plan step with the
// verb goal, Visit, and Cornelis himself as its target. The plan took it (it
// only asked for a target), the goal went to the brain, and the game stopped
// on "Unknown location npc_cornelis". A goal's target is now of the goal's own
// kind, and a Visit that holds no place (a save from before) is let go.

describe('M10.25: a goal of a plan has a target of its own kind', () => {
  it('refuses a Visit with a person as its place, and takes one with a place', () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const problems: string[] = []
    expect(stepsFromOp(engine.world, { after: 0, verb: 'goal', who: ['npc_gerrit'], target: 'npc_cornelis', detail: 'Visit' }, 0, problems)).toEqual([])
    expect(problems).toContainEqual('goal Visit: its target must be a place')
    const kept = stepsFromOp(engine.world, { after: 0, verb: 'goal', who: ['npc_gerrit'], target: 'loc_veenhoek_green', detail: 'Visit' }, 0, [])
    expect(kept.length).toBe(1)
    // A person where a person belongs is fine.
    expect(stepsFromOp(engine.world, { after: 0, verb: 'goal', who: ['npc_gerrit'], target: 'npc_cornelis', detail: 'Talk' }, 0, []).length).toBe(1)
  })

  it('lets a Visit to a person go when a save holds one, and plays on', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const gerrit = engine.world.npcState('npc_gerrit')
    gerrit.goals.push({ type: 'Visit', target: 'npc_cornelis', priority: 0.99, source: 'ai' } as (typeof gerrit.goals)[number])
    for (let i = 0; i < 6; i++) engine.tick(30)
    expect(gerrit.goals.some((g) => g.type === 'Visit' && g.target === 'npc_cornelis')).toBe(false)
    expect((await engine.handle('look')).length).toBeGreaterThan(0)
  })
})
