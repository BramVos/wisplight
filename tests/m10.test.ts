import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, GameClock, loadContent, MockLlm, paletteRequest, paletteView, readPalette, savePalette, type SaveData } from '../src/engine'
import { hexMapData, mapView } from '../src/engine/map/view'
import { DEFAULT_PALETTE, mapStyle } from '../src/engine/map/palette'
import { readContentFiles } from '../src/node/content'
import { noise, regionMap } from '../src/engine/map/region'
import { hexId, look, seenBits } from '../src/engine/map/travel'
import { knownPlace, landMapData, walkTarget } from '../src/engine/map/known'
import { mayBeStuck } from '../src/engine/playtest'
import { content } from './helpers'

// Milestone M10 (docs/ROADMAP.md): the map in colour and layers. First what the
// map review of 27 September 2026 and the developer kit tests found.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
/** Every cell of a region map, through its public face. */
function cells(map: NonNullable<ReturnType<typeof regionMap>>) {
  const all = []
  for (let col = 0; col < map.cols; col++) for (let row = 0; row < map.rows; row++) {
    const cell = map.cell({ col, row })
    if (cell) all.push(cell)
  }
  return all
}

describe('M10: what the map review found', () => {
  it('draws each hex evenly: about one pool in ten fen hexes, and every tenth of the range as often', () => {
    const counts = new Array(10).fill(0)
    for (let c = 0; c < 80; c++) for (let r = 0; r < 80; r++) counts[Math.floor(noise(4242, c, r, 1) * 10)]++
    const mean = (80 * 80) / 10
    for (const n of counts) expect(Math.abs(n - mean)).toBeLessThan(mean * 0.2)
    const map = regionMap(content)!
    const fen = cells(map).filter((cell) => cell.land === 'fen')
    const pools = fen.filter((cell) => cell.feature === 'pool').length / fen.length
    expect(pools).toBeGreaterThan(0.06)
    expect(pools).toBeLessThan(0.14)
  })

  it('plays an old save on: what was seen stays seen, wherever the ground now lies otherwise', async () => {
    const save = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', 'save-base-m8.json'), 'utf8')) as SaveData
    const engine = Engine.fromSave(content, save)
    const map = regionMap(content)!
    const count = (bits: Uint8Array) => bits.reduce((n, b) => n + b.toString(2).replace(/0/g, '').length, 0)
    const before = count(seenBits(engine.world, map))
    engine.tick(60)
    await engine.handle('look')
    expect(count(seenBits(engine.world, map))).toBeGreaterThanOrEqual(before)
    expect(engine.mapView(true)?.rows.length).toBeGreaterThan(0)
  })

  it('shows the dry ridge as a path to whoever knows it, and fen to everyone else', () => {
    const engine = new Engine(content, { seed: 3 })
    const map = regionMap(content)!
    const ridge = cells(map).filter((cell) => cell.hidden === 'the_dry_ridge')
    expect(ridge.length).toBeGreaterThan(3)
    for (const cell of ridge) look(engine.world, map, cell, false)
    const paths = () => mapView(engine.world, { width: map.cols, height: map.rows, whole: true })!.rows.flat().filter((c) => c.cls === 'way').length
    const without = paths()
    ;(engine.state.player.journal ??= {})['the_dry_ridge'] = engine.world.now
    expect(paths()).toBeGreaterThan(without)
  })
})

describe('M10: what the developer kit tests found', () => {
  it('talks to someone about something: TALK TO AALTJE ABOUT THE GREY CAT', async () => {
    const engine = new Engine(content, { seed: 7 })
    for (const c of ['north', 'west', 'east', 'north', 'west']) await engine.handle(c)
    const out = said(await engine.handle('talk to aaltje about the grey cat'))
    expect(out).toMatch(/That's Kaatje's work/)
    expect(engine.state.questlog?.['grey_cat_on_the_doorstep']?.stage).toBe('the_cat_is_fenna')
  })

  it('names people by their short name in @who-knows, and finds them by id in build commands', async () => {
    const engine = new Engine(content, { seed: 7, builder: true })
    const rows = said(await engine.handle('@who-knows haakman')).split('\n').slice(1)
    // Not the first word of the full name ("the", "Black", "Ouwe") but the short name.
    expect(rows.some((r) => /^(the|Black|Ouwe)\s+level/.test(r))).toBe(false)
    expect(rows.some((r) => /^the Haakman\s+level/.test(r))).toBe(true)
    expect(rows.some((r) => /^Black Mathijs\s+level/.test(r))).toBe(true)
    expect(said(await engine.handle('@where npc_haakman'))).toMatch(/^\[build\] the Haakman: /)
    expect(said(await engine.handle('@where haakman'))).toMatch(/^\[build\] the Haakman: /)
  })

  it('counts nobody as stuck who cannot be: spirits, creatures without a day, and whoever is away', () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    expect(mayBeStuck(world, 'npc_haakman')).toBe(false)
    expect(mayBeStuck(world, 'npc_fenna')).toBe(false)
    world.state.npcs['npc_mirte']!.activity = 'working'
    expect(mayBeStuck(world, 'npc_mirte')).toBe(true)
    world.state.npcs['npc_mirte']!.absent = true
    expect(mayBeStuck(world, 'npc_mirte')).toBe(false)
  })
})

describe('M10: what the playtest of the lost girl found', () => {
  it('checks the mist once a walk, so a place in the mist can be reached by walking on', async () => {
    let reached = 0
    for (let seed = 1; seed <= 12; seed++) {
      const engine = new Engine(content, { seed })
      const world = engine.world
      world.state.player.location = 'loc_veenhoek_green'
      ;(world.state.player.seenAreas ??= []).push('kattenbroek')
      ;(world.state.player.journal ??= {})['kattenbroek'] = world.now
      for (let walk = 0; walk < 8 && world.state.player.location !== 'loc_kattenbroek_edge'; walk++) {
        world.state.weather = { kind: 'fog', since: world.now }
        const out = said(await engine.handle('walk to the kattenbroek'))
        // At most one stray a walk, and it ends the walk.
        expect((out.match(/lose your bearings/g) ?? []).length).toBeLessThanOrEqual(1)
      }
      if (world.state.player.location === 'loc_kattenbroek_edge') reached++
    }
    expect(reached).toBeGreaterThanOrEqual(10)
  }, 120_000)

  it('does not say "already there" where the tellers put a place you cannot see: a landmark in sight leads on', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    ;(world.state.player.journal ??= {})['kattenbroek'] = world.now
    ;(world.state.player.sources ??= {})['kattenbroek'] = [{ from: 'npc_aaltje', t: world.now, level: 2 }]
    const place = knownPlace(world, 'kattenbroek')!
    expect(place.status).toBe('heard')
    world.state.player.location = hexId(walkTarget(world, place)!)
    world.state.weather = { kind: 'fog', since: world.now }
    const out = said(await engine.handle('walk to the kattenbroek'))
    expect(out).not.toMatch(/already at/)
    expect(out).toMatch(/You make your way towards the Kattenbroek|about where they said the Kattenbroek would be/)
  })
})

// The map in colour (M10, approved 28 September 2026): the palette is content
// per world, every hex a tint from its seed, a feature, how well it is
// remembered; night and mist shrink what is clear; levels, one at a time.

describe('M10: the palette is content per world', () => {
  it('the Nethermarch has the palette of the proposal page, Skerrow its own; black and white is paper in greys', async () => {
    const isle = loadContent(await readContentFiles(resolve(import.meta.dirname, '../content'), 'isle'))
    const base = content.world.map!.palette!
    expect(base.dark.terrain['fen']).toEqual(DEFAULT_PALETTE.dark.terrain['fen'])
    expect(base.paper.ways.road).toBe('#8a6d43')
    const own = isle.world.map!.palette!
    expect(Object.keys(own.dark.terrain)).toEqual(expect.arrayContaining(['water', 'fields', 'cliff', 'dune']))
    expect(own.names['fields']).toBe('salt grass')
    expect(own.dark.terrain['water']).not.toEqual(base.dark.terrain['water'])
    const bw = mapStyle(base, 'bw')
    for (const tint of bw.terrain['fen']!) expect(tint).toMatch(/^#([0-9a-f]{2})\1\1$/)
    expect(content.world.map!.levels.map((l) => l.name)).toEqual(['under the ground', 'ground level', 'the crowns'])
    // A world without a palette draws with the default.
    expect(mapStyle(undefined, 'dark').terrain['fen']).toEqual(DEFAULT_PALETTE.dark.terrain['fen'])
  })
})

describe('M10: the map in colour', () => {
  it('gives every known hex a terrain, one of its tints from the seed, and its feature; nothing the player has not seen', async () => {
    const engine = new Engine(content, { seed: 3 })
    await engine.handle('look')
    const data = hexMapData(engine.world, { whole: true })!
    const map = regionMap(content)!
    const seen = seenBits(engine.world, map)
    const known = seen.reduce((n, b) => n + b.toString(2).replace(/0/g, '').length, 0)
    expect(data.hexes.length / 5).toBe(known)
    const tints = new Array(4).fill(0)
    for (let i = 0; i < data.hexes.length; i += 5) tints[data.hexes[i + 3]!]++
    // Every tint is used: the seeded variation per hex.
    const whole = hexMapData(Object.assign(engine.world, {}), { whole: true })!
    expect(whole.hexes.length).toBeGreaterThan(0)
    for (const t of tints) expect(t).toBeGreaterThan(0)
    expect(data.legend.map((l) => l.key)).toEqual(expect.arrayContaining(['fields']))
    expect(data.legend.find((l) => l.key === 'fen')?.name ?? 'fen').toBe('fen')
    expect(data.palette.dark.terrain['fen']).toEqual(DEFAULT_PALETTE.dark.terrain['fen'])
    // The panel is a window round the player, who is in it.
    const panel = hexMapData(engine.world, { width: 41, height: 29 })!
    expect(panel.you).toBeDefined()
    expect(panel.you!.c).toBeGreaterThanOrEqual(panel.left)
    expect(panel.you!.c).toBeLessThan(panel.left + panel.width)
  })

  it('what is in sight now is clear; by day what was seen lately too; at night only what is in sight, the rest as memory', async () => {
    const engine = new Engine(content, { seed: 3 })
    const map = regionMap(content)!
    const world = engine.world
    const at = (c: number, r: number) => {
      const data = hexMapData(world, { whole: true })!
      for (let i = 0; i < data.hexes.length; i += 5) if (data.hexes[i] === c && data.hexes[i + 1] === r) return data.hexes[i + 4]! & 3
      return undefined
    }
    // Walk a little way out into the land, looking.
    world.state.player.location = hexId({ col: 60, row: 40 })
    look(world, map, { col: 60, row: 40 })
    world.state.player.location = hexId({ col: 70, row: 40 })
    look(world, map, { col: 70, row: 40 })
    // By day: the hex under you now, and the one you left, clear.
    const night = new GameClock(world.now).isNight
    if (!night) {
      expect(at(70, 40)).toBe(2)
      expect(at(60, 40)).toBe(1)
    }
    // Past the fresh stretch, what you saw long ago is vaguer.
    world.state.minutes += 7 * 24 * 60
    expect(at(60, 40)).toBe(0)
    // At night only what is in sight is clear.
    look(world, map, { col: 60, row: 40 }, false)
    while (!new GameClock(world.now).isNight) world.state.minutes += 60
    expect(at(60, 40)).toBe(0)
    expect(at(70, 40)).toBe(2)
  })

  it('shows one level at a time; a tunnel you do not know is not on your map, and its ends are stairs', () => {
    const base = regionMap(content)!.region
    const tunnel = { kind: 'path' as const, name: 'the old tunnel', via: [[20, 10], [24, 10]] as [number, number][], level: 'under', topic: 'kabouter_milk' }
    const world2 = { ...content, regions: new Map([[base.id, { ...base, paths: [...base.paths, tunnel] }]]) }
    const engine = new Engine(world2, { seed: 3 })
    const map = regionMap(world2)!
    const start = map.hexOf([base.origin[0] + 20, base.origin[1] + 10])
    const end = map.hexOf([base.origin[0] + 24, base.origin[1] + 10])
    expect(map.cell(start)!.stairs?.[0]?.level).toBe('under')
    for (let col = start.col - 2; col <= end.col + 2; col++) look(engine.world, map, { col, row: start.row }, false)
    engine.world.state.player.location = hexId(start)
    // Not known: no level to see, no stairs, no tunnel.
    let data = hexMapData(engine.world, { whole: true })!
    expect(data.levels.map((l) => l.id)).toEqual(['surface'])
    expect(data.stairs).toHaveLength(0)
    expect(hexMapData(engine.world, { whole: true, level: 'under' })!.level).toBe('surface')
    // Known: the level is there, with its tunnel and its stairs.
    ;(engine.state.player.journal ??= {})['kabouter_milk'] = engine.world.now
    data = hexMapData(engine.world, { whole: true })!
    expect(data.levels.map((l) => l.name)).toEqual(['under the ground', 'ground level'])
    expect(data.stairs.some((s) => s.c === start.col && s.r === start.row && s.dir === 'down')).toBe(true)
    const under = hexMapData(engine.world, { whole: true, level: 'under' })!
    expect(under.level).toBe('under')
    expect(under.keys).toContain('tunnel')
    expect(under.ways.length).toBeGreaterThan(2)
    expect(under.places).toHaveLength(0)
  })

  it('a way on a level the world does not name is refused when the content loads', async () => {
    const files = await readContentFiles(resolve(import.meta.dirname, '../content'), 'base')
    const region = files.find((f) => f.path.endsWith('region.yaml'))!
    const changed = files.map((f) => (f === region ? { ...f, text: f.text.replace(/\n( *)paths:\n/, '\n$1paths:\n$1  - { kind: path, name: the deep way, via: [veenhoek, molenend], level: deep }\n') } : f))
    expect(() => loadContent(changed)).toThrow(/the deep way runs on the level deep, which world\.yaml does not name/)
  })

  it('the land map: the region as a box, the stranger in it, the far places known and the routes to them', async () => {
    const engine = new Engine(content, { seed: 3 })
    const journal = (engine.state.player.journal ??= {})
    journal['zwolderkamp'] = engine.world.now
    const land = landMapData(engine.world)!
    expect(land.region.name).toBeTruthy()
    expect(land.places.map((p) => p.name)).toContain('Zwolderkamp')
    expect(land.routes.some((r) => /Oostweg/.test(r.name))).toBe(true)
    const page = engine.page('land')!
    expect(page.kind).toBe('land')
    expect(page.lines.join('\n')).toMatch(/Zwolderkamp: about \d+ km east/)
    expect(engine.page('map')?.hexMap?.width).toBe(regionMap(content)!.cols)
  })
})

describe('M10: the palette in the editor', () => {
  it('shows the palette on a map of the world, or on a sample with a band per terrain; saves it into world.yaml and keeps the rest', async () => {
    const base = await readContentFiles(resolve(import.meta.dirname, '../content'), 'base')
    const isle = await readContentFiles(resolve(import.meta.dirname, '../content'), 'isle')
    const view = paletteView(base)
    expect(view.own).toBe(true)
    expect(view.preview!.places.some((p) => p.name === 'Veenhoek')).toBe(true)
    const sample = paletteView(isle).preview!
    expect(sample.keys).toEqual(expect.arrayContaining(['water', 'fields', 'cliff', 'dune']))
    expect(sample.legend.find((l) => l.key === 'fields')?.name).toBe('salt grass')
    // Saving: world.yaml gets the new palette; its comments and the rest stay.
    const warmer = { ...view.palette, dark: { ...view.palette.dark, ground: '#121410' } }
    const saved = savePalette(base, warmer)
    expect(saved.ok).toBe(true)
    const text = saved.changes[0]!.text
    expect(text).toMatch(/ground: "?#121410"?/)
    expect(text).toMatch(/# Who knows what \(FO, chapter 5\)/)
    expect(savePalette(base, { ...warmer, dark: { ...warmer.dark, ground: 'blue' } }).ok).toBe(false)
  })

  it('the writing aid proposes a palette from the frame of the world; nothing is saved until the designer does', async () => {
    const isle = await readContentFiles(resolve(import.meta.dirname, '../content'), 'isle')
    const request = paletteRequest(isle, 'colder')
    expect(request.schemaName).toBe('palette_draft')
    expect(request.system).toMatch(/Skerrow/)
    expect(request.system).toMatch(/AT THE MAP PALETTE/)
    const proposal = readPalette((await new MockLlm().complete(request)).text)
    expect(proposal.problems).toEqual([])
    expect(proposal.palette!.dark.terrain['water']).not.toEqual(paletteView(isle).palette.dark.terrain['water'])
    expect(proposal.palette!.names['fields']).toBe('salt grass')
    expect(readPalette('not json').problems[0]).toMatch(/agreed form/)
  })
})
