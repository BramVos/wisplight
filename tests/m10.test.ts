import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type SaveData } from '../src/engine'
import { mapView } from '../src/engine/map/view'
import { noise, regionMap } from '../src/engine/map/region'
import { hexId, look, seenBits } from '../src/engine/map/travel'
import { knownPlace, walkTarget } from '../src/engine/map/known'
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
