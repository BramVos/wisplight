import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { wantFarPlace } from '../src/engine/growth/far'
import { recordFact } from '../src/engine/news'
import { readContentFiles } from '../src/node/content'

// M10.22: storylines across areas. News travels with the lines of transport
// (M10.12): word of something big on Skerrow reaches Havenmoor, over the sea
// and off the map, with the packet, as long as the crossing takes.

const DAY = 24 * 60

describe('M10.22: news across the sea', () => {
  it('reaches Havenmoor with the packet: not before the crossing, and after it', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 4, builder: true })
    engine.start()
    wantFarPlace(engine.world, 'havenmoor', { from: 'loc_skerrow_harbour', minutes: 2880, by: 'havenmoor_packet', water: true })
    const far = engine.state.growth!.far!['havenmoor']!
    const there = String(far.npcs[0]!['id'])
    const fact = recordFact(engine.world, { kind: 'storm', about: [], place: 'loc_skerrow_harbour', belang: 4, title: 'the great storm', text: { precise: 'A storm broke the harbour wall.', village: 'The harbour wall is broken.', far: 'Skerrow had a bad storm.' } })!
    const heard = () => Boolean(engine.state.news?.heard[there]?.[fact.id])
    engine.tick(DAY)
    expect(heard()).toBe(false)
    engine.tick(DAY + 120)
    expect(heard()).toBe(true)
  })
})
