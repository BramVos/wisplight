import { describe, expect, it } from 'vitest'
import { departureHint, Engine, openThreads } from '../src/engine'
import { agree } from '../src/engine/agreements'
import { startQuest } from '../src/engine/quests/engine'
import { content, runUntil } from './helpers'

// M10.21: the hint at departure (Bram's idea, 28 September 2026). Whoever
// leaves the region with threads open gets one hint in the world, never a
// dialog: the two heaviest threads, with the name and where they stand, and
// what happens when the stranger goes. No question, no block, once a
// departure; the journal shows the same under the land map.

async function withThreads(): Promise<Engine> {
  const engine = new Engine(content, { seed: 5, builder: true })
  engine.start()
  runUntil(engine, 15, 9)
  startQuest(engine.world, (engine as unknown as { questHost: Parameters<typeof startQuest>[1] }).questHost, 'grey_cat_on_the_doorstep')
  const word = agree(engine.world, { kind: 'meet', by: 'player', to: 'npc_mirte', source: 'player', what: 'come by the bakery for the bread', due: engine.world.now + 2 * 24 * 60, terms: { place: 'loc_veenhoek_bakery', at: engine.world.now + 2 * 24 * 60 } })
  expect('id' in word).toBe(true)
  return engine
}

describe('M10.21: one hint on leaving with threads open', () => {
  it('weighs the threads: a promise that falls due on the way before a quest that can wait', async () => {
    const engine = await withThreads()
    const threads = openThreads(engine.world, 3 * 24 * 60)
    expect(threads.map((t) => t.kind).slice(0, 2)).toEqual(['word', 'quest'])
    expect(threads[0]!.text).toBe('You promised Mirte: come by the bakery for the bread, within 2 days.')
    expect(threads[0]!.then).toBe('Away, you will miss it, and it will be remembered.')
    expect(threads[1]!.then).toMatch(/^In \d+ days it goes on without you\.$/)
    // Without a companion it is the stranger's own thought; nothing is asked.
    const hint = departureHint(engine.world, 3 * 24 * 60)!
    expect(hint.kind).toBe('narration')
    expect(hint.text).toMatch(/^As you set off, you think of what you leave behind\. You promised Mirte: /)
  })

  it('comes once, as the stranger sets off over the edge of the region, and does not stop them', async () => {
    const engine = await withThreads()
    await engine.handle('@goto loc_oude_zijl_sluice')
    const said: string[] = []
    for (let i = 0; i < 4 && !engine.state.choice; i++) said.push(...(await engine.handle('head west')).map((o) => o.text))
    expect(said.join('\n')).not.toMatch(/you think of what you leave behind/)
    const off = (await engine.handle('1')).map((o) => o.text)
    expect(off.filter((t) => /you think of what you leave behind/.test(t))).toHaveLength(1)
    expect(engine.world.location(engine.state.player.location).name).not.toBe('Oude Zijl')
    // No hint on the way back into the region.
    const home = (await engine.handle('travel to oude zijl on foot')).map((o) => o.text)
    expect(home.join('\n')).not.toMatch(/you think of what you leave behind/)
  })

  it('shows the same threads in the journal, under the land map', async () => {
    const engine = await withThreads()
    const land = engine.page('land')?.land
    expect(land?.leaving).toContain('You promised Mirte: come by the bakery for the bread, within 2 days.')
    expect(land?.leaving?.some((l) => l.startsWith('The Grey Cat on the Doorstep: '))).toBe(true)
    expect(new Engine(content, { seed: 5 }).page('land')?.land?.leaving).toBeUndefined()
  })
})
