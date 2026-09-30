import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, type ContentFile } from '../src/engine'
import { warnings } from '../src/engine/builder'
import { storySchema } from '../src/engine/growth/regionstory'
import { readStories, storiesRequest, storyScopes, type StoryFullness } from '../src/engine/storystep'
import { LAND_STEPS, WORLD_STEPS } from '../src/engine/worldguide'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.30 (1), the step Stories of the world build (Bram's play log of 29
// September 2026: The Quiet Reach had no quest at all, so every voice made the
// plot up and nothing could be solved). The story round of a region is the
// motor: a call for each settlement, one for the land between and one for the
// main line, each writing sketches the engine builds into quests.

const root = join(import.meta.dirname, '../content')
const files = await readContentFiles(root, 'quietreach')
const quiet = loadContent(files)
const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
const said = 'The signal is a real message. Ilyan cut the recordings himself to keep the find. No deaths.'

async function step(fullness: StoryFullness, from: ContentFile[] = files) {
  const parts = []
  for (const scope of storyScopes(loadContent(from), fullness)) parts.push({ scope, text: (await new MockLlm().complete(storiesRequest(from, scope, fullness, said))).text })
  return readStories(from, said, parts)
}

describe('M10.30 (1): the step Stories', () => {
  it('is a step of the world build after Signals, not of a land, and without it Check says the world has no stories', () => {
    expect(WORLD_STEPS.map((s) => s.id)).toEqual(expect.arrayContaining(['watcher', 'stories']))
    expect(WORLD_STEPS.findIndex((s) => s.id === 'stories')).toBe(WORLD_STEPS.findIndex((s) => s.id === 'watcher') + 1)
    expect(LAND_STEPS.some((s) => s.id === 'stories')).toBe(false)
    expect(warnings(quiet)).toContain('This world has no stories: people make the plot up as they talk, and nothing can be solved. The step Stories of the world build writes them.')
    // Deepwell leaves stories out on purpose: the warning is its neutral default.
    expect(warnings(deepwell).some((w) => w.startsWith('This world has no stories'))).toBe(true)
  })

  it('makes a call for each settlement and one for the main line, as the region dial says, on the story round\'s own schema', () => {
    expect(storyScopes(quiet, 'outline').map((s) => `${s.kind}:${s.id}`)).toEqual(['place:port_vesper'])
    expect(storyScopes(quiet, 'story').map((s) => `${s.kind}:${s.id}`)).toEqual(['place:port_vesper', 'main:main'])
    const [place, main] = storyScopes(quiet, 'story')
    const request = storiesRequest(files, place!, 'story', said)
    expect(request).toMatchObject({ role: 'chronicler', schemaName: 'region_story', effort: 'medium' })
    expect(JSON.stringify(request.schema)).toBe(JSON.stringify(storySchema()))
    // The rules, the world and the designer's words are shared by every call of the step, in the cache.
    expect(request.system).toContain('Ilyan cut the recordings himself')
    expect(request.cacheBreak).toBeGreaterThan(request.cacheShared!)
    expect(request.prompt).toMatch(/THE SETTLEMENT: Port Vesper/)
    expect(request.prompt).toMatch(/WRITE: two or three small lines of different kinds; no main line\./)
    expect(storiesRequest(files, main!, 'story', said).prompt).toMatch(/WRITE: the main line only/)
  })

  it('reads the replies into one proposal that loads: the lines, their goals and knows, the main line\'s truth, and the truth in CHRONICLER.md', async () => {
    const draft = await step('story')
    expect(draft.problems).toEqual([])
    expect(draft.result?.ok).toBe(true)
    expect(draft.changes.map((c) => c.kind)).toEqual(['quest', 'quest', 'quest'])
    expect(draft.files?.[0]).toMatchObject({ path: 'CHRONICLER.md' })
    expect(draft.files![0]!.text).toMatch(/## The hidden truth of the stories\n\nThe designer: The signal is a real message\./)
    // The truth the main line keeps is written down too: a fixed truth of the world from then on.
    expect(draft.files![0]!.text).toMatch(/What the main line keeps hidden until its stage \(a fixed truth of this world\):\n- \w+ cut the page from the ledger\./)
    const grown = loadContent(draft.result!.ok ? draft.result!.files : files)
    const main = [...grown.quests.values()].find((q) => q.kind === 'main')!
    expect(main.starts).toMatchObject({ at_start: true })
    expect(main.lapses).toMatchObject({ after_days: 30 })
    expect(main.stages?.[0]?.goal).toBeTruthy()
    expect(main.truths?.[0]).toMatchObject({ from: 's3' })
    expect(warnings(grown).some((w) => w.startsWith('This world has no stories'))).toBe(false)
    // The world plays with them: the main line is there from the start.
    const engine = new Engine(grown, { seed: 1 })
    engine.start()
    expect((await engine.handle('quests')).map((o) => o.text).join('\n')).toContain(main.name)
  })

  it('writes one small line a settlement at outline, and personal lines at full', async () => {
    expect((await step('outline')).changes).toHaveLength(1)
    const full = await step('full')
    expect(full.result?.ok).toBe(true)
    expect(full.changes.some((c) => /kind: personal/.test(c.yaml))).toBe(true)
  })
})
