import { describe, expect, it } from 'vitest'
import { introduced, sceneryWarnings } from '../src/engine/builder'
import { answerChoice, choose } from '../src/engine/choice'
import { neighbour, type Hex } from '../src/engine/map/hexgrid'
import { DEFAULT_PALETTE, markColours, mapStyle } from '../src/engine/map/palette'
import { regionMap } from '../src/engine/map/region'
import { playerHex, trailAt, trailBits } from '../src/engine/map/travel'
import type { Engine } from '../src/engine'
import { content, newEngine } from './helpers'

// After the M10 playtest (Bram, 28 September 2026): a command that can mean
// one thing does it; an unknown or missing target gets the options, numbered;
// with none, a message. What a description names can be looked at and handled.

// What was said, without the experience for finding a place on the first command there.
const said = (out: { text: string }[]) =>
  out
    .map((o) => o.text)
    .filter((t) => !/^\+\d+ experience/.test(t))
    .join('\n')

function at(location: string, seed = 3) {
  const engine = newEngine(seed)
  engine.state.player.location = location
  return engine
}

describe('choices', () => {
  it('does the one option that fits, offers several, and says so when there are none', () => {
    const engine = newEngine()
    const options = [
      { label: 'Mirte', command: 'talk mirte' },
      { label: 'Saartje', command: 'talk saartje' },
    ]
    expect(choose(engine.world, 'mirte', 'Talk to whom?', options, 'nobody')).toEqual({ run: 'talk mirte' })
    expect(choose(engine.world, '', 'Talk to whom?', options.slice(0, 1), 'nobody')).toEqual({ run: 'talk mirte' })
    expect(choose(engine.world, '', 'Talk to whom?', [], 'There is nobody here but you.')).toEqual({ show: [{ kind: 'error', text: 'There is nobody here but you.' }] })
    const shown = choose(engine.world, 'kees', 'Talk to whom?', options, 'nobody')
    expect('show' in shown && said(shown.show)).toBe('Talk to whom?\n  1. Mirte\n  2. Saartje')
    expect(answerChoice(engine.world, '3')).toEqual({ error: 'Choose a number from 1 to 2, or type something else.' })
    expect(answerChoice(engine.world, 'saartje')).toEqual({ run: 'talk saartje' })
    expect(answerChoice(engine.world, '1')).toEqual({ error: 'There is nothing to choose from just now.' })
    expect(answerChoice(engine.world, 'look')).toBeUndefined()
  })

  it('follows the path from the Kabouterberg back to Veenhoek, whatever you call it', async () => {
    const engine = at('loc_kabouterberg')
    expect(said(await engine.handle('look'))).toMatch(/or follow the path to Veenhoek\./)
    const out = said(await engine.handle('follow path to kabouterberg'))
    expect(out).toMatch(/You follow the path to Veenhoek/)
    expect(engine.state.player.location).not.toBe('loc_kabouterberg')
  })

  it('asks which way along a way that runs both ways, and takes the number', async () => {
    const engine = at('loc_veenhoek_quay')
    const out = said(await engine.handle('follow tow path'))
    expect(out).toMatch(/Follow it which way\?\n {2}1\. the tow path west to Oude Zijl\n {2}2\. the tow path east to Waagdam/)
    expect(engine.status().choice?.options).toEqual(['the tow path west to Oude Zijl', 'the tow path east to Waagdam'])
    expect(said(await engine.handle('2'))).toMatch(/You follow the tow path east to Waagdam/)
    expect(engine.state.choice).toBeUndefined()
  })

  it('talks to the only one here, and asks whom when there are more', async () => {
    const lonely = at('loc_kabouterberg')
    expect(said(await lonely.handle('talk'))).toBe('There is nobody here but you.')
    const engine = newEngine(3)
    const crowded = [...content.locations.keys()].find((id) => engine.world.npcsAt(id).filter((n) => engine.world.npcState(n).activity !== 'asleep').length >= 2)!
    engine.state.player.location = crowded
    const out = said(await engine.handle('talk'))
    expect(out).toMatch(/^Talk to whom\?\n {2}1\. /)
    await engine.handle('1')
    expect(engine.state.talk).toBeDefined()
  })

  it('offers what there is to look at, take, drop and walk to when the words fit nothing', async () => {
    const engine = at('loc_veenhoek_quay')
    const look = said(await engine.handle('look xyz'))
    expect(look).toMatch(/You see no "xyz" here\.\nLook at what\?\n {2}1\. old stone/)
    expect(said(await engine.handle('1'))).toMatch(/A worn stone, waist-high/)
    expect(said(await engine.handle('take'))).toBe('There is nothing here to take.')
    expect(said(await engine.handle('drop xyz'))).toMatch(/You don't have "xyz"\.\nDrop what\?\n {2}1\. /)
    expect(said(await engine.handle('walk to qqq'))).toBe('You don\'t know a place called "qqq".')
  })

  it('walks to a hex you have seen, as a click on the minimap sends it, and not to one you have not', async () => {
    const engine = at('loc_veenhoek_quay')
    const you = engine.status().hexMap!.you!
    expect(said(await engine.handle(`walk to ${you.c + 30},${you.r}`))).toMatch(/You have not seen that land yet/)
    expect(said(await engine.handle(`walk to ${you.c},${you.r}`))).toBe('You are there already.')
    expect(said(await engine.handle(`walk to ${you.c + 2},${you.r}`))).toMatch(/You make your way towards the tow path, near Veenhoek/)
    expect(engine.state.player.location).not.toBe('loc_veenhoek_quay')
  })
})

describe('what a description names', () => {
  it('can be looked at, taken or not, and answers other verbs (the Kabouterberg)', async () => {
    const engine = at('loc_kabouterberg')
    expect(said(await engine.handle('look hollow'))).toMatch(/^The hollow opens between the roots of the oak/)
    expect(said(await engine.handle('l milk'))).toMatch(/^A wooden bowl of milk at the mouth of the hollow/)
    expect(said(await engine.handle('drink milk'))).toMatch(/That milk is not yours to drink\./)
    expect(said(await engine.handle('take milk'))).toBe('You leave the bowl where it is. It was put there for the kabouters, not for you.')
    expect(said(await engine.handle('dig hill'))).toMatch(/Nobody digs in the Kabouterberg/)
    // The Kabouterberg matters (M10.16): an act the rules do not know is improvised; without a model, the hill's own line.
    expect(said(await engine.handle('kick oak'))).toBe('The hill keeps its silence. Whatever you meant by it, the kabouters keep their own counsel.')
    expect(engine.state.player.inventory['milk'] ?? 0).toBe(0)
  })

  it('finds a thing with no detail in the sentence of the description it is in', async () => {
    const engine = at('loc_kabouterberg')
    expect(said(await engine.handle('look roots'))).toBe('Between its roots a hollow opens into the hill, and someone has left a bowl of milk at its mouth.')
    expect(said(await engine.handle('look at the quiet'))).toBe('It is very quiet here; even the wind seems to go round.')
    expect(said(await engine.handle('take roots'))).toBe('That belongs where it is. You leave it.')
  })

  it('names in the editor what a description brings in with no detail', () => {
    expect(introduced('A low hill of pale sand rises, crowned by an oak older than anyone. Between its roots a hollow opens, and someone has left a bowl of milk.')).toEqual(['hill', 'oak', 'hollow', 'bowl'])
    // A place whose details are taken away is named again.
    const locations = new Map(content.locations)
    locations.set('loc_kabouterberg', { ...locations.get('loc_kabouterberg')!, details: [] })
    expect(sceneryWarnings({ ...content, locations })).toEqual(['loc_kabouterberg: the description brings in "hollow", with no detail to look at or handle (details:)'])
  })

  it('leaves nothing a description brings in without a detail, in either world, but what changes with the place', async () => {
    const { loadContentFromDir } = await import('../src/node/content')
    const { resolve } = await import('node:path')
    const isle = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle')
    expect(sceneryWarnings(content)).toEqual([])
    expect(sceneryWarnings(isle)).toEqual([])
    // The cat on Grietje's doorstep is gone once she takes it in: LOOK reads the description as it is now.
    const engine = at('loc_visser_house')
    expect(said(await engine.handle('look cat'))).toMatch(/grey cat with one white paw, very upright/)
    engine.state.flags = { ...engine.state.flags, cat_taken_in: true }
    expect(said(await engine.handle('look cat'))).toMatch(/curled by the hearth/)
  })

  it('answers verbs the engine has a meaning of its own for, on a thing with its own line', async () => {
    const engine = at('loc_goose_crossroads')
    expect(said(await engine.handle('read sign'))).toBe('THE DROWNED GOOSE, in faded letters under the painted bird.')
    const yard = at('loc_goose_yard')
    expect(said(await yard.handle('drink pump'))).toMatch(/cold and tasting of iron/)
    expect(said(await yard.handle('look notice board'))).toMatch(/lost goats/)
  })

  it('gives the picture of the area you are in', () => {
    expect(at('loc_kabouterberg_oak').status().scene).toBe('area_kabouterberg')
  })
})

describe('the trail', () => {
  /** Whether the trail joins two hexes, step by step. */
  function joined(engine: Engine, a: Hex, b: Hex): boolean {
    const map = regionMap(content)!
    const bits = trailBits(engine.world, map)
    const links = new Map<string, string[]>()
    const link = (x: string, y: string) => (links.get(x) ?? links.set(x, []).get(x)!).push(y)
    for (let col = 0; col < map.cols; col++)
      for (let row = 0; row < map.rows; row++) {
        const mask = trailAt(bits, map, { col, row })
        for (const [bit, direction] of [[1, 'north'], [2, 'northeast'], [4, 'southeast']] as const) {
          if (!(mask & bit)) continue
          const n = neighbour({ col, row }, direction)
          link(`${col},${row}`, `${n.col},${n.row}`)
          link(`${n.col},${n.row}`, `${col},${row}`)
        }
      }
    const seen = new Set([`${a.col},${a.row}`])
    const queue = [...seen]
    while (queue.length) for (const next of links.get(queue.shift()!) ?? []) if (!seen.has(next) && seen.add(next)) queue.push(next)
    return seen.has(`${b.col},${b.row}`)
  }

  it('follows the hexes you walked, by a way, by the exits and across country', async () => {
    const engine = at('loc_veenhoek_quay')
    const quay = playerHex(engine.world)!
    expect(engine.state.player.map?.trail ?? '').toBe('')
    await engine.handle('follow the path to the kabouterberg')
    const crossroads = playerHex(engine.world)!
    expect(engine.state.player.location).toBe('loc_route_crossroads')
    expect(joined(engine, quay, crossroads)).toBe(true)
    await engine.handle('southwest')
    const hill = playerHex(engine.world)!
    expect(engine.state.player.location).toBe('loc_kabouterberg')
    expect(joined(engine, crossroads, hill)).toBe(true)
    await engine.handle('head east')
    expect(joined(engine, quay, playerHex(engine.world)!)).toBe(true)
  })

  it('goes to the map with each hex, beside its memory and its sign', async () => {
    const engine = at('loc_veenhoek_quay')
    await engine.handle('follow tow path east')
    const data = engine.status().hexMap!
    const flags = [] as number[]
    for (let i = 4; i < data.hexes.length; i += 5) flags.push(data.hexes[i]!)
    expect(flags.some((f) => f >> 5 !== 0)).toBe(true)
    expect(flags.every((f) => (f & 3) <= 2 && ((f >> 2) & 7) <= 5)).toBe(true)
  })

  it('has its colour and the colour of places visited in each palette, and a default for a palette without', () => {
    for (const world of [content.world.map?.palette]) {
      expect(world?.dark.visited).toMatch(/^#/)
      expect(world?.paper.trail).toMatch(/^#/)
    }
    const bare = { ...DEFAULT_PALETTE.dark, visited: undefined, trail: undefined }
    expect(markColours(bare, 'dark')).toEqual({ visited: DEFAULT_PALETTE.dark.visited, trail: DEFAULT_PALETTE.dark.trail })
    expect(markColours(mapStyle(undefined, 'bw'), 'bw').visited).toBe('#000000')
  })
})

describe('the dry ridge, known and not (after the M10 playtest)', () => {
  it('is just fen to whoever does not know it: nothing names it, and walking still goes everywhere', async () => {
    const engine = at('loc_peat_cuttings')
    expect(said(await engine.handle('look'))).not.toMatch(/ridge/)
    expect(said(await engine.handle('follow the ridge'))).toBe("You don't know of any ridge here.")
    expect(said(await engine.handle('follow'))).not.toMatch(/ridge/)
  })

  it('is walked to from a little way off, and asks which way, with where each leads', async () => {
    const engine = at('loc_peat_cuttings')
    engine.state.player.journal = { ...(engine.state.player.journal ?? {}), the_dry_ridge: engine.world.now }
    expect(said(await engine.handle('look'))).toMatch(/or the dry ridge\./)
    const out = said(await engine.handle('follow the ridge'))
    expect(out).toMatch(/You make your way towards the dry ridge/)
    expect(out).toMatch(/Follow the dry ridge which way\?\n {2}1\. north, towards Veenhoek\n {2}2\. south-east, towards the Kattenbroek/)
    await engine.handle('2')
    const map = regionMap(content)!
    expect(map.cell(playerHex(engine.world)!)!.hidden).toBe('the_dry_ridge')
  })
})
