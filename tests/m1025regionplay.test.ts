import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { outOfFight } from '../src/node/regionplay'
import { content } from './helpers'

// M10.25: the harness of the played proof plays a new region as a new player
// would. The real run of full met smugglers at the Tolwaard, and every command
// after it was a blow in a fight the harness did not know; now it pays a
// demand it can pay, else runs, and gives up when running fails.

describe('M10.25: the region play gets out of a fight', () => {
  it('runs from a fight, ending a turn when too few actions are left', async () => {
    const engine = new Engine(content, { seed: 7, builder: true })
    engine.start()
    await engine.handle('@fight goat_rider 2')
    expect(engine.state.combat).toBeDefined()
    const out: string[] = []
    await outOfFight(engine, out)
    expect(!engine.state.combat || engine.state.combat.over).toBeTruthy()
    expect(out.join('\n')).toMatch(/> (flee|surrender)   \[in a fight\]/)
  })

  it('pays a toll it can pay, and runs from one it cannot', async () => {
    const paying = new Engine(content, { seed: 7, builder: true })
    paying.start()
    await paying.handle('@money 500')
    await paying.handle('@fight goat_riders_toll')
    expect(paying.state.combat?.parley).toBeDefined()
    const out: string[] = []
    await outOfFight(paying, out)
    expect(out.join('\n')).toMatch(/> pay   \[in a fight\]/)
    expect(!paying.state.combat || paying.state.combat.over).toBeTruthy()

    const poor = new Engine(content, { seed: 7, builder: true })
    poor.start()
    await poor.handle('@money 0')
    await poor.handle('@fight goat_riders_toll')
    const fled: string[] = []
    await outOfFight(poor, fled)
    expect(fled[0]).toMatch(/> flee   \[in a fight\]/)
    expect(!poor.state.combat || poor.state.combat.over).toBeTruthy()
  })
})
