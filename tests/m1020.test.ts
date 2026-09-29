import { describe, expect, it } from 'vitest'
import { draftResult, Engine, loadContent, MockLlm, newWorldFiles, readDraft, warnings, WORLD_STEPS, worldStepRequest, type ContentFile } from '../src/engine'

// M10.20: building a world, the second round. Bram's first real world (The
// Quiet Reach) came as twelve chapters with tables and lists. The mock
// chronicler answers all twelve steps from such words, and the world that
// comes out loads, plays and keeps its name.

const CHAPTERS: Record<string, string> = {
  frame: 'A reach of cold islands where the lighthouses have gone dark.\nNo magic, no gods that answer.',
  calendar: [
    'Era: QR',
    '| Month | Days |',
    '| --- | --- |',
    ...['Frostmere', 'Thawing', 'Seedfall', 'Greening', 'Longlight', 'Highsun', 'Harvest', 'Mistfall', 'Stormturn', 'Darkening', 'Deepcold', 'Yearsend', 'Quiet Days'].map((m) => `| ${m} | 30 |`),
    'Weekdays: Oneday, Twoday, Threeday, Fourday, Fiveday, Sixday',
  ].join('\n'),
  money: '| Coin | Value |\n| --- | --- |\n| mark | 12 |\n| penny | 1 |',
  faiths: 'No faith: nobody prays in the Reach.',
  places: '- Harbour Steps | where the boats come in\n- The Lamp House\n- Gull Rock',
  professions: '- Keeper\n- Fisher',
  people: '| Name | Who |\n| --- | --- |\n| Ada Wren | she is the keeper at the Lamp House |\n| Tom Sallow | he is a fisher |',
  economy: '| Item | Price |\n| --- | --- |\n| Fish stew | 3 |\n| Lamp oil | 5 |',
  passages: 'A ferry runs out to Gull Rock.',
  watcher: 'When someone becomes a friend.',
  voice: 'They swear by the sea.',
  lands: 'It is all one land.',
  palette: 'Grey ink and a cold blue wash.',
}

describe('M10.20: building a world, all twelve steps', () => {
  it('builds a world from chapters with tables and lists, step by step, that loads, plays and keeps its name', async () => {
    const mock = new MockLlm('good')
    let files: ContentFile[] = newWorldFiles('quietreach', 'The Quiet Reach')
    for (const step of WORLD_STEPS) {
      const request = worldStepRequest(files, step.id, CHAPTERS[step.id]!)
      // Pasted tables stay rows in the prompt.
      if (step.id === 'calendar') expect(request.prompt).toContain('| Frostmere | 30 |\n| Thawing | 30 |')
      const draft = readDraft(files, (await mock.complete(request)).text)
      expect(draft.problems, step.id).toEqual([])
      const saved = draftResult(files, draft)
      expect(saved.problems, step.id).toEqual([])
      files = saved.files
    }
    const world = loadContent(files)
    expect(world.world.name).toBe('The Quiet Reach')
    expect(world.world.calendar?.months[0]).toBe('Frostmere')
    expect(world.world.calendar?.weekdays).toHaveLength(6)
    expect(world.world.money?.units.map((u) => [u.name, u.value])).toEqual([['mark', 12], ['penny', 1]])
    expect(world.world.faiths).toEqual([])
    expect([...world.locations.keys()]).toEqual(expect.arrayContaining(['loc_harbour_steps', 'loc_the_lamp_house', 'loc_gull_rock']))
    expect(world.npcs.get('npc_ada_wren')).toMatchObject({ pronoun: 'she', profession: 'keeper' })
    expect(world.items.get('fish_stew')?.tags).toContain('food')
    expect(world.passages.size).toBe(1)
    // A people or the money with no topic (M10.29 P) is a hint for the chronicler, not a fault of the recorded build.
    expect(warnings(world).filter((w) => !/ledger|made nowhere|^money: |^ancestry /.test(w))).toEqual([])
    const game = new Engine(world, { seed: 3 })
    game.start()
    expect(game.status().time).toMatch(/^Oneday 1 Frostmere 1 QR/)
    for (const c of ['look', 'east', 'east', 'east', 'west']) await game.handle(c)
    expect(game.state.player.location).toBe('loc_the_lamp_house')
  })

  it('keeps the name the designer gave, and asks back where the words do not say enough', async () => {
    const mock = new MockLlm('good')
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    const frame = readDraft(files, (await mock.complete(worldStepRequest(files, 'frame', 'Cold islands.'))).text)
    expect(frame.world).not.toMatch(/Rimehold/)
    expect(frame.world).toMatch(/region: The Quiet Reach/)
    const people = readDraft(files, (await mock.complete(worldStepRequest(files, 'people', 'Nobody yet.'))).text)
    expect(people.changes).toEqual([])
    expect(people.questions).toEqual(['Who does the stranger meet first?'])
  })
})
