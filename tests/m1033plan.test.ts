import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { planHere } from '../src/engine/plan'
import { loadContentFromDir } from '../src/node/content'
import { worksApart } from './helpers'

// M10.33 I, the plan and the exits say where a way goes (three findings of
// Bram: the Workshop, of Vesper Works, was never on the plan of Port Vesper;
// "Exits:" named only directions, so OUT said nothing of the coast; the dots
// of people stood where he last saw them, as if they were there now).

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const exits = (out: Output[]) => out.map((o) => o.text).join('\n').split('\n').find((l) => l.startsWith('Exits:'))

describe('M10.33 I: where a way goes', () => {
  // Vesper Works went into Port Vesper (M10.33 L, 1 October 2026); what joins two areas is played in the Quiet Reach
  // as the world build made it.
  it('puts the Workshop on the plan of Port Vesper once seen, with its own area by it', async () => {
    const engine = new Engine(worksApart(quiet), { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_workshop', '@goto loc_commons']) await engine.handle(c)
    const workshop = planHere(engine.world)!.boxes.find((b) => b.id === 'loc_workshop')
    expect(workshop).toMatchObject({ kind: 'seen', other: 'Vesper Works' })
  })

  it('names where in, out and a way into another area go, once the stranger knows it', async () => {
    const engine = new Engine(worksApart(quiet), { seed: 3, builder: true })
    engine.start()
    expect(exits(await engine.handle('look'))).toBe('Exits: east, northeast')
    ;(engine.state.player.journal ??= {})['loc_workshop'] = engine.world.now
    expect(exits(await engine.handle('look'))).toBe('Exits: east, northeast (Workshop)')
  })

  it('shows someone seen here now as a filled dot, one last seen as a hollow one with how long ago, gone after two hours', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana', 'bye']) await engine.handle(c)
    // Seen here, as the quarter-hourly look of the simulation notes it.
    ;((engine.state.player.people ??= {})['npc_sana_holt'] ??= {} as never).seen = { where: 'loc_commons', t: engine.world.now }
    const dot = () => planHere(engine.world)!.boxes.find((b) => b.id === 'loc_commons')!.people.find((p) => p.id === 'npc_sana_holt')
    expect(dot()).toMatchObject({ now: true })
    await engine.handle('@goto loc_guest_quarters')
    expect(planHere(engine.world)!.boxes.find((b) => b.id === 'loc_commons')!.people.find((p) => p.id === 'npc_sana_holt')).toMatchObject({ now: false, ago: 'just now' })
    engine.tick(40)
    expect(dot()).toMatchObject({ now: false, ago: '40 minutes ago' })
    engine.tick(120)
    expect(dot()).toBeUndefined()
  })
})
