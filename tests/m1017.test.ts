import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, recordFact, type Content } from '../src/engine'
import { contractMarkdown, unknownFields } from '../src/engine/contract'
import { applyEdits } from '../src/engine/edit'
import { draftResult, editorView, newWorldFiles, readDraft, worldStepRequest } from '../src/engine/editor'
import { WORLD_STEPS } from '../src/engine/worldguide'
import { MockLlm } from '../src/engine/dialogue/mock'
import { greyRider, makeCharacter, readyMade } from '../src/engine/rules/player'
import { formatMoney, parseMoney } from '../src/engine/items'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.17: every world, the contract of the content. What a world leaves out
// works with a neutral default, never with a Nethermarch value; the smallest
// world and Deepwell (tests/worlds/other) play without a Nethermarch word.

const deepwell = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')
const tiny = loadContent(newWorldFiles('tiny', 'Tiny'))

/** Words that belong to the Nethermarch alone: its places, people, faith, calendar, coins and landscape. */
const NETHERMARCH =
  /\b(Nethermarch|Holleveen|Graafhaven|schout|guilders?|gulden|stuivers?|duit(?:en)?|Waag(?:dam)?|Veenhoek|Molenend|the Count|Lantern|Grey Rider|Wild Hunt|Haakman|Aaltje|Wouter|Mirte|Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Rustdag|Herfstmaand|Dyke Days|AW|fen|peat|reeds?|barge|Vaart|tow path|trekschuit|Blackmere|Goat-Riders?|polder)\b/

async function play(world: Content, commands: string[]) {
  const mock = new MockLlm('good')
  const engine = new Engine(world, { seed: 7, llm: mock })
  const out = [...engine.start()]
  for (const c of commands) out.push(...(await engine.handle(c)))
  // Saved and loaded, then a week of the world, and a round of the chronicler.
  const loaded = Engine.fromSave(world, JSON.parse(JSON.stringify(engine.save())) as ReturnType<Engine['save']>)
  out.push(...(await loaded.handle('look')))
  loaded.tick(7 * 24 * 60)
  out.push(...(await loaded.handle('look')), ...(await loaded.handle('time')))
  const here = loaded.state.player.location
  recordFact(loaded.world, { kind: 'fire', about: [], place: here, belang: 4, title: 'a fire breaks out', text: { precise: 'A fire broke out.', village: 'There was a fire!', far: 'A fire.' } })
  const runs = await loaded.runChronicler()
  const text = [...out.map((o) => o.text), JSON.stringify(loaded.status())].join('\n')
  const prompts = mock.calls.map((c) => `${c.system}\n${c.prompt}`).join('\n')
  return { engine: loaded, out, text, prompts, runs, mock }
}

const COMMANDS = ['look', 'help', 'wait', 'sleep', 'journal', 'time', 'inventory', 'map', 'pray', 'look sky', 'rent a room', 'hire punt', 'wait 60']

describe('M10.17: the contract', () => {
  it('docs/CONTENT.md is what the schemas say (npm run content:contract)', () => {
    expect(readFileSync(resolve(import.meta.dirname, '../docs/CONTENT.md'), 'utf8')).toBe(contractMarkdown())
  })

  it('refuses a field the contract does not have, with the fields there are', () => {
    expect(unknownFields('npcs', { id: 'npc_x', name: 'X', mood_ring: 3 })).toMatch(/^"mood_ring" is not in the contract; npcs has: id, name, /)
    const files = newWorldFiles('tiny', 'Tiny')
    const result = applyEdits(files, [{ kind: 'area', id: 'first_area', data: { id: 'first_area', name: 'The first area', kind: 'hamlet', summary: 'Here.', colour: 'red' } }])
    expect(result.problems.join(' ')).toMatch(/colour.*is not in the contract/)
  })
})

describe('M10.17: neutral defaults, never the Nethermarch', () => {
  it('the smallest world plays: look, wait, sleep, save and load, a week, a chronicler round', async () => {
    const { text, prompts, engine } = await play(tiny, COMMANDS)
    expect(text).not.toMatch(NETHERMARCH)
    expect(prompts).not.toMatch(NETHERMARCH)
    // The plain calendar, one plain coin, no weather.
    expect(engine.status().time).toMatch(/^Monday 8 January 1, /)
    expect(engine.status().money).toBe('50 c')
    expect(engine.status().clock).toMatchObject({ weather: '', wind: '' })
    expect(text).toContain('There is no weather here to speak of.')
  })

  it('Deepwell plays: a ten-day week, credits, no faith, no weather, a tram', async () => {
    const { text, prompts, engine, runs } = await play(deepwell, [...COMMANDS, 'e', 'drink from tap', 'down', 'take the tram', 'take the tram to the domes', 'take the tram to the ice works'])
    expect(text).not.toMatch(NETHERMARCH)
    expect(prompts).not.toMatch(NETHERMARCH)
    expect(runs.length).toBeGreaterThan(0)
    expect(engine.status().time).toMatch(/^\w+day \d+ \w+ 140 AL, /)
    expect(engine.status().money).toMatch(/ch$/)
    expect(text).toContain('Lines here: the Works tram.')
  })

  it('Deepwell: the tap by its own verb, the tram to the one other stop, and a stop named with "the"', async () => {
    const { out } = await play(deepwell, ['e', 'drink from tap', 'down', 'take the tram', 'take the tram to the domes'])
    const said = out.map((o) => o.text)
    expect(said).toContain('The water is ice-cold and tastes of metal, and it is free.')
    expect(said.filter((t) => /the tram slides off/.test(t))).toHaveLength(2)
  })

  it('money: one plain coin without units of its own; the Nethermarch names its own, gulden and all', () => {
    expect(formatMoney(170)).toBe('170 c')
    expect(parseMoney('1 gulden', content.world.money!.units)).toBe(160)
  })

  it('the sky: none without a weather block; the fen and the sea in their own words', async () => {
    const base = new Engine(content, { seed: 3 })
    base.world.state.weather = { kind: 'rain', since: base.world.now }
    expect(await base.handle('look sky')).toEqual([expect.objectContaining({ text: expect.stringMatching(/^Rain hisses on the reeds/) })])
    const isle = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle')
    const skerrow = new Engine(isle, { seed: 3 })
    skerrow.world.state.weather = { kind: 'rain', since: skerrow.world.now }
    expect((await skerrow.handle('look sky'))[0]!.text).toMatch(/^Rain comes in off the sea/)
  })
})

describe('M10.17: what was in code is content', () => {
  it('death: the Way of the Grey Rider from the Nethermarch rules; the Tidemother on Skerrow, with no price', async () => {
    const isle = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle')
    const skerrow = new Engine(isle, { seed: 4 })
    skerrow.start()
    makeCharacter(skerrow.world, readyMade(isle))
    const c = skerrow.state.player.character!
    c.deaths = 3
    const said = greyRider(skerrow.world, skerrow.state.player.location, () => []).map((o) => o.text).join(' ')
    // Skerrow's own words (after M10.17: every world its own version): the Tidemother gives you back to the shore.
    expect(said).toMatch(/^Cold water closes over you/)
    expect(said).not.toMatch(/Rider|Wild Hunt|barrow|chapel/)
    expect(skerrow.state.player.riderPrice).toBeUndefined()
    // Woken at the nearest holy place, the rite lifts the mark: no price first, whatever the count.
    expect((await skerrow.handle('rite'))[0]!.text).toMatch(/You tie a shell to the old birch/)
    const base = new Engine(content, { seed: 4 })
    base.start()
    makeCharacter(base.world, readyMade(content))
    expect(greyRider(base.world, base.state.player.location, () => []).map((o) => o.text).join(' ')).toMatch(/Wild Hunt.*Grey Rider/)
  })

  it('a hire from content: Wouter hires out his punt, and elsewhere nobody does', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    expect((await engine.handle('hire punt'))[0]!.text).toBe('A punt is hired from Wouter, the eel-fisher, at his hut south of the peat cuttings.')
    await engine.handle('@goto loc_wouter_hut')
    await engine.handle('@bring wouter')
    await engine.handle('@money 100')
    const [paid] = await engine.handle('hire the punt')
    expect(paid!.text).toMatch(/^You pay Wouter 2 st\. "Mind the pole/)
    expect(engine.state.player.hired?.['punt']).toMatchObject({ owner: 'npc_wouter', crosses: ['water'] })
    const other = new Engine(deepwell, { seed: 5 })
    other.start()
    expect((await other.handle('hire punt'))[0]!.text).not.toMatch(/Wouter/)
  })

  it('a fight touches the faction of the creatures, from the bestiary: the Goat-Riders and Veenhoek, once each', () => {
    const engine = new Engine(content, { seed: 8 })
    const foeRepute = (engine as unknown as { foeRepute: (foes: { creature?: string }[], outcome: string, delta: number, why: string) => void }).foeRepute.bind(engine)
    foeRepute([{ creature: 'goat_rider' }, { creature: 'goat_rider' }, { creature: 'black_mathijs' }], 'won', -5, 'you beat their men')
    // As before M10.17: -5 with the Goat-Riders (their rivals think a little better of you), +3 with Veenhoek (and its ally the Brotherhood a little).
    expect(engine.state.reputation).toMatchObject({ goat_riders: -5, veenhoek_villagers: 3, counts_men: 2, brotherhood: 3 })
    // A creature of no faction touches nobody.
    const quiet = new Engine(content, { seed: 8 })
    ;(quiet as unknown as { foeRepute: typeof foeRepute }).foeRepute.call(quiet, [{ creature: 'veenlijk' }], 'won', -5, 'you beat their men')
    expect(quiet.state.reputation ?? {}).toEqual({})
  })

  it('a wedding raises the faction of the faith of the holy place; a patron of another faith cools the pious', async () => {
    const engine = new Engine(content, { seed: 9, builder: true })
    await engine.handle('create warden heathborn peat_cutter name=Tester')
    engine.state.romance = { npc_wouter: { stage: 'together', since: engine.world.now } }
    for (const c of ['@goto loc_veenhoek_chapel', '@bring wouter', 'marry wouter']) await engine.handle(c)
    expect(engine.state.reputation?.['lantern_church']).toBe(5)
    const barrows = new Engine(content, { seed: 9, builder: true })
    await barrows.handle('create warden heathborn peat_cutter name=Tester')
    barrows.state.romance = { npc_wouter: { stage: 'together', since: barrows.world.now } }
    for (const c of ['@goto loc_reuzenrust_barrows', '@bring wouter', 'marry wouter']) await barrows.handle(c)
    expect(barrows.state.reputation?.['old_faith']).toBe(5)
    // Old words for an ancestry come from the rules: "veenvolk" is the Fenfolk.
    const made = new Engine(content, { seed: 9 })
    await made.handle('create warden veenvolk peat_cutter name=Tester')
    expect(made.state.player.character?.ancestry).toBe('fenfolk')
  })

  it('the widow\'s mist is a bar on the Kattenbroek in areas.yaml, and a tempting encounter in the bestiary', () => {
    expect(content.areas.get('kattenbroek')!.barred).toEqual([expect.objectContaining({ carrying: 'survey' })])
    expect(content.encounters.get('goat_riders_toll')!.tempts).toBe(true)
    // Every world its own (after M10.17): Deepwell seals the Works on Decday; the bar of a world names nothing of another.
    expect(deepwell.areas.get('ice_works')!.barred).toEqual([expect.objectContaining({ when: [{ weekday: 'Decday' }] })])
  })

  it('joining on terms from factions.yaml: the town rights at the Waag, for five guilders', async () => {
    const engine = new Engine(content, { seed: 6, builder: true })
    expect((await engine.handle('join the burghers of waagdam'))[0]!.text).toBe('The town rights of Waagdam are bought at the Waag.')
    await engine.handle('@goto loc_waagdam_waag')
    await engine.handle('@money 100')
    expect((await engine.handle('join the burghers of waagdam'))[0]!.text).toBe('The town rights cost five guilders.')
    await engine.handle('@money 900')
    expect((await engine.handle('join the burghers of waagdam'))[0]!.text).toMatch(/You are one of the burghers of Waagdam now/)
    expect(engine.state.player.money).toBe(100)
  })
})

describe('M10.17: the chronicler as world builder', () => {
  it('builds a new world step by step: the frame with CHRONICLER.md, then the calendar; each a diff, saved when accepted', async () => {
    const mock = new MockLlm('good')
    let files = newWorldFiles('rimehold', 'Rimehold')
    const step = async (id: string, said: string) => {
      const request = worldStepRequest(files, id, said)
      expect(request.system).toContain(WORLD_STEPS.find((s) => s.id === id)!.prompt)
      expect(request.system).toContain('WHAT A WORLD CAN HAVE')
      const draft = readDraft(files, (await mock.complete(request)).text)
      expect(draft.problems).toEqual([])
      const saved = draftResult(files, draft)
      expect(saved.ok).toBe(true)
      files = saved.files
      return saved
    }
    const frame = await step('frame', 'A mining station at the edge of settled space, where the air is running out.')
    expect(frame.changes.map((c) => c.path).sort()).toEqual(['rimehold/CHRONICLER.md', 'rimehold/world.yaml'])
    await step('calendar', 'A ten-day week, numbered months, no weather under the dome.')
    const world = loadContent(files)
    // The mock keeps the name the designer gave (M10.20: no more renaming the world).
    expect(world.world.words).toMatchObject({ land: 'Rimehold', region: 'Rimehold' })
    expect(world.world.calendar?.weekdays).toHaveLength(10)
    // The start and the rest of world.yaml stay as they were.
    expect(world.world.start.location).toBe('loc_first_place')
    const game = new Engine(world, { seed: 2 })
    game.start()
    expect(game.status().time).toMatch(/^Unday 1 One 1 AL/)
    // The contract tab shows what is set and what takes the default.
    expect(editorView(files).worldKeys).toContainEqual({ key: 'calendar', set: true })
    expect(editorView(files).worldKeys).toContainEqual({ key: 'weather', set: false })
  })

  it('refuses a world key outside the contract, and a whole file other than CHRONICLER.md or the voice kit', () => {
    const files = newWorldFiles('rimehold', 'Rimehold')
    expect(draftResult(files, { changes: [], world: 'climate: cold\n' }).problems.join(' ')).toMatch(/"climate" is not in the contract; world has: /)
    expect(draftResult(files, { changes: [], files: [{ path: 'data/palette.yaml', text: 'palette: {}' }] }).problems.join(' ')).toMatch(/may write only CHRONICLER\.md, data\/voice\.yaml, data\/journey\.yaml and a land's lands\/<id>\/land\.yaml and voice\.yaml/)
  })
})
