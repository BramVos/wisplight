import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Output } from '../src/engine'
import { checkTextIds, loadContent } from '../src/engine/content'
import { craftProgress, craftTitle, rankUp } from '../src/engine/crafts'
import { idWordsIn } from '../src/engine/idwords'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.29 M, never an id in text (Bram's journal said "The stranger is a
// journeyman npc_tessa_rook now"): every text the player sees in the three
// worlds (what the game says, the journal and its pages, the news, the
// cards) is read for a word that looks like an id.

const root = join(import.meta.dirname, '../content')

/** Keys that hold an id or a code for the interface, never words for the player. */
const KEYS = new Set(['id', 'npc', 'scene', 'location', 'area', 'kind', 'source', 'pronoun', 'light', 'map', 'hexMap', 'land', 'classes', 'rows', 'improvise', 'sound', 'picture'])

/** Every string a value shows the player, leaving out the keys that hold ids. */
function shown(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) shown(v, out)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!KEYS.has(k)) shown(v, out)
  return out
}

/** What a stranger sees in a day or two of a world: looking, talking, a rank in each craft, the journal and every page of it. */
async function everythingSeen(world: string): Promise<string[]> {
  const content = await loadContentFromDir(root, world)
  const engine = new Engine(content, { seed: 5, llm: new MockLlm('good') })
  const seen: string[] = []
  const keep = (out: Output[]) => seen.push(...shown(out))
  keep(engine.start())
  for (const line of ['look', 'help', 'sheet', 'frames', 'journal']) keep(await engine.handle(line))
  const here = engine.world.npcsAt(engine.state.player.location)
  for (const npc of here.slice(0, 2)) {
    keep(await engine.handle(`talk ${engine.world.npc(npc).name.split(' ').at(-1)!.toLowerCase()}`))
    for (const line of ['1', '2', '3', 'bye']) keep(await engine.handle(line))
  }
  // A rank in every craft: the title is said, and the village hears of it (news, the journal).
  for (const craft of engine.world.content.crafts.values()) {
    craftProgress(engine.world, craft.id).practice = craft.practice[0]!
    keep(rankUp(engine.world, craft))
  }
  for (let hour = 0; hour < 36; hour++) {
    keep(engine.tick(60))
    await engine.runModels()
  }
  keep(await engine.handle('look'))
  seen.push(...shown(engine.status()))
  for (const id of Object.keys(engine.state.player.journal ?? {})) seen.push(...shown(engine.page(id)))
  return seen
}

describe('M10.29 M: never an id in text', () => {
  for (const world of ['base', 'isle', 'quietreach']) {
    it(`shows no id in anything the stranger sees in ${world}`, async () => {
      const seen = await everythingSeen(world)
      const leaks = seen.flatMap((text) => idWordsIn(text).map((id) => `${id} in "${text}"`))
      expect(leaks).toEqual([])
    }, 120_000)
  }

  it('refuses an id in a text field of the content, and a craft title never falls back on one', async () => {
    const files = await readContentFiles(root, 'quietreach')
    const bad = files.map((f) => (f.path.endsWith('data/crafts.yaml') ? { ...f, text: f.text.replace('maker: field technician', 'maker: npc_tessa_rook') } : f))
    expect(() => loadContent(bad)).toThrow(/craft field_electronics: maker holds npc_tessa_rook, an id; write it in words/)
    const quiet = loadContent(files)
    expect(checkTextIds(quiet, quiet.world)).toEqual([])
    const craft = quiet.crafts.get('field_electronics')!
    expect(craftTitle(craft, 1)).toBe('a journeyman field technician')
    expect(craftTitle({ ...craft, maker: 'npc_tessa_rook' }, 1)).toBe('a journeyman in field electronics')
  })
})
