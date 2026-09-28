import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { die } from '../src/engine/life'
import { recordFact } from '../src/engine/news'
import { mourning } from '../src/engine/people'
import { loadContentFromDir } from '../src/node/content'

// Milestone M10.7 (docs/ROADMAP.md): Skerrow mourns. A death, a loss or a
// departure on the island leaves traces, as content in content/isle with the
// watchers and standard aftermath of M8.1 to M8.3; code only for what every
// world can use: a burial as a gathering the grieving come to, and a lasting
// mark at a place.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const DAY = 24 * 60

describe('M10.7: Skerrow mourns', () => {
  it('has watchers for death, loss and departure, and aftermath for each', () => {
    expect([...isle.watchers.keys()]).toEqual(expect.arrayContaining(['death', 'lost', 'departure']))
    expect([...isle.aftermath.keys()]).toEqual(expect.arrayContaining(['death', 'lost', 'departure']))
  })

  it('a death: Maren minds the empty place, the island buries the dead on the headland the day after, a cairn stays, and the Kettle sings', async () => {
    const engine = new Engine(isle, { seed: 7, builder: true })
    await engine.handle('@goto loc_skerrow_salt_kettle')
    await engine.handle('@time 12')
    die(engine.world, 'npc_wenna', { cause: 'drowned off the harbour wall', place: 'loc_skerrow_harbour' })
    engine.tick(60)
    expect(engine.state.signals!.log.some((s) => s.kind === 'death' && s.who[0] === 'npc_wenna')).toBe(true)
    // The innkeeper has the empty place on her mind for a week: it is in her prompt, and she says it.
    expect(engine.state.npcs['npc_maren']!.thoughts?.some((t) => /Wenna's place by the fire is empty/.test(t.text))).toBe(true)
    // The day after, at three: the burial on the headland, and the hamlet goes there.
    engine.tick(DAY + 3 * 60 - 60 + 30)
    const at = ['npc_maren', 'npc_brannoc'].filter((id) => engine.state.npcs[id]!.location === 'loc_skerrow_headland' || engine.state.npcs[id]!.plan.some((s) => 'to' in s && s.to === 'loc_skerrow_headland'))
    expect(at.length).toBeGreaterThan(0)
    engine.tick(8 * 60)
    const facts = engine.state.news!.facts
    expect(facts.some((f) => f.title === 'the burial of Wenna')).toBe(true)
    expect(facts.some((f) => f.title === 'a song for Wenna at the Salt Kettle')).toBe(true)
    // A lasting trace: the cairn is in the headland's description from now on.
    const look = said(await engine.handle('@goto loc_skerrow_headland'))
    expect(look).toMatch(/a new one of grey stones, with Wenna's name scratched on a slate/)
    engine.tick(20 * DAY)
    expect(said(await engine.handle('look'))).toMatch(/Wenna's name scratched on a slate/)
  }, 60_000)

  it('the grieving come to a burial, though they keep away from feasts for a week', async () => {
    const engine = new Engine(isle, { seed: 7, builder: true })
    await engine.handle('@time 12')
    // Brannoc's boy dies: his father grieves, and still goes up to the headland.
    die(engine.world, 'npc_pip', { cause: 'fell from the cliff path', place: 'loc_skerrow_cliff_path' })
    engine.tick(60)
    expect(mourning(engine.world, 'npc_brannoc')?.id).toBe('npc_pip')
    engine.tick(DAY + 3 * 60)
    const brannoc = engine.state.npcs['npc_brannoc']!
    expect(brannoc.location === 'loc_skerrow_headland' || brannoc.activity === 'at the burial' || brannoc.plan.some((s) => 'to' in s && s.to === 'loc_skerrow_headland')).toBe(true)
  }, 60_000)

  it('lost with nothing to bury: a name on the harbour wall; gone away: the Kettle is quieter', async () => {
    const engine = new Engine(isle, { seed: 8, builder: true })
    const world = engine.world
    recordFact(world, { kind: 'missing', about: ['npc_brannoc'], place: 'loc_skerrow_harbour', belang: 3, title: 'Brannoc lost at sea', text: { precise: 'Brannoc went out and did not come back.', village: 'Brannoc never came back from the fishing grounds.', far: 'A boatman was lost off Skerrow.' } })
    engine.tick(2 * DAY)
    expect(said(await engine.handle('@goto loc_skerrow_harbour'))).toMatch(/scratched Brannoc's name into the harbour wall/)
    recordFact(world, { kind: 'aftermath:leave', about: ['npc_tamsin'], place: 'loc_skerrow_harbour', belang: 1, title: 'Tamsin went away', text: { precise: 'Tamsin went away for a while.', village: 'Tamsin has gone.', far: 'Someone left.' } })
    engine.tick(60)
    expect(engine.state.npcs['npc_maren']!.thoughts?.some((t) => /Tamsin has gone off the island/.test(t.text))).toBe(true)
  }, 60_000)

  it('without the stranger, and without a death, Skerrow still gives no signals', () => {
    const engine = new Engine(isle, { seed: 12 })
    engine.tick(2 * DAY)
    expect(engine.state.signals?.log ?? []).toEqual([])
  })
})
