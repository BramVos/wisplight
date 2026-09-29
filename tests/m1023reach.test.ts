import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { recordFact } from '../src/engine/news'
import { landsTrade, reachBetween, reachOf } from '../src/engine/reach'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.23: lands know each other in degrees (Bram: neighbours with many ties,
// a far chain of islands on its own, a Venice with ties everywhere), and news
// goes between them only as far as they know each other, in the time the way
// takes; the chronicle says what one land heard of the other and how late.

const root = resolve(import.meta.dirname, '../content')
const DAY = 24 * 60

async function isleWith(reach: string) {
  const files = await readContentFiles(root, 'isle')
  return loadContent(files.map((f) => (f.path === 'isle/world.yaml' ? { ...f, text: f.text.replace('reach: trade, why: The white boat', `reach: ${reach}, why: The white boat`) } : f)))
}

describe('M10.23: lands know each other in degrees', () => {
  it('reads the reach from the content, or works it out from the ways between them', async () => {
    const isle = await loadContentFromDir(root, 'isle')
    expect(reachOf(isle, 'skerrow', 'western_isles')).toBe('trade')
    expect(reachBetween(isle, 'loc_skerrow_harbour', 'loc_ynys_wen_landing')).toBe('trade')
    expect(reachOf(isle, 'skerrow', 'skerrow')).toBe('close')
    // Deepwell names no reach: a way on foot over the border makes them neighbours.
    const other = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')
    expect(reachOf(other, 'deepwell', 'kessler_claim')).toBe('close')
    // A land the content does not know is refused.
    const files = await readContentFiles(root, 'isle')
    expect(() => loadContent(files.map((f) => (f.path === 'isle/world.yaml' ? { ...f, text: f.text.replace('between: [skerrow, western_isles]', 'between: [skerrow, atlantis]') } : f)))).toThrow(/world.reach: unknown land atlantis/)
  })

  it('carries wares between two lands only where they trade', async () => {
    const trading = await isleWith('trade')
    const rumour = await isleWith('rumour')
    const route = { from: 'skerrow_hythe', to: 'ynys_wen' }
    expect(landsTrade(trading, route)).toBe(true)
    expect(landsTrade(rumour, route)).toBe(false)
    expect(landsTrade(rumour, { from: 'skerrow_hythe', to: 'skerrow_shore' })).toBe(true)
  })

  it('sends news over the border in the time the way takes, and never where the lands do not know each other', async () => {
    for (const [reach, days] of [['trade', 7], ['rumour', 28], ['none', undefined]] as const) {
      const content = await isleWith(reach)
      const engine = new Engine(content, { seed: 2 })
      const fact = recordFact(engine.world, { kind: 'disaster', about: [], place: 'loc_ynys_wen_landing', belang: 5, title: 'the hall of Ynys Wen burned', text: { precise: 'The hall of Ynys Wen burned.', village: 'The elves lost their hall!', far: 'A hall burned on a far isle.' } })
      const heard = () => Boolean(engine.state.news!.heard['npc_maren']?.[fact.id])
      engine.tick(days === undefined ? 30 * DAY : (days - 1) * DAY)
      expect(heard(), `${reach}: not yet`).toBe(false)
      if (days === undefined) continue
      engine.tick(2 * DAY)
      expect(heard(), `${reach}: by now`).toBe(true)
      const landHeard = engine.state.news!.landHeard!
      expect(Object.keys(landHeard)).toContain(`${fact.id}>skerrow`)
      expect(engine.chronicle()).toMatch(new RegExp(`NEWS BETWEEN THE LANDS\\n.*The hall of Ynys Wen burned: heard in .* on .*, ${days} days after\\.`, 'i'))
    }
  }, 120_000)

  it('a rumour carries only the greatest news', async () => {
    const content = await isleWith('rumour')
    const engine = new Engine(content, { seed: 2 })
    const small = recordFact(engine.world, { kind: 'quarrel', about: [], place: 'loc_ynys_wen_landing', belang: 4, title: 'a quarrel on Ynys Wen', text: { precise: 'p', village: 'v', far: 'f' } })
    engine.tick(30 * DAY)
    expect(engine.state.news!.heard['npc_maren']?.[small.id]).toBeUndefined()
  }, 60_000)
})
