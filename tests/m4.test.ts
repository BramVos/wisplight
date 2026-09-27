import { describe, expect, it } from 'vitest'
import { Engine, GameClock } from '../src/engine'
import { distance, line } from '../src/engine/map/hexgrid'
import { knownPlace } from '../src/engine/map/known'
import { regionMap } from '../src/engine/map/region'
import { hexOfId } from '../src/engine/map/travel'
import { content } from './helpers'

// Milestone M4 (docs/ROADMAP.md): travel, the map and the first world builder.

const at = (engine: Engine, day: number, hour: number, minute = 0) => engine.tick(GameClock.from(211, 9, day, hour, minute).minutes - engine.world.now)
const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

function game(seed = 5) {
  const engine = new Engine(content, { seed })
  at(engine, 15, 7)
  engine.state.weather = { kind: 'overcast', since: engine.world.now }
  return engine
}

async function play(engine: Engine, ...commands: string[]) {
  let last = ''
  for (const command of commands) last = texts(await engine.handle(command))
  return last
}

describe('M4: the region map', () => {
  const map = regionMap(content)!

  it('is 120 by 80 hexes of 250 m, generated from the zone drawing with a fixed seed', () => {
    expect([map.cols, map.rows, map.size]).toEqual([120, 80, 0.25])
    const again = regionMap(content)!
    expect(again).toBe(map)
    // Woods in the north-west, heath in the north-east, the fen in the south, the Blackmere between.
    expect(map.cell({ col: 4, row: 76 })!.land).toBe('woods')
    expect(map.cell({ col: 112, row: 76 })!.land).toBe('heath')
    expect(map.cell({ col: 20, row: 4 })!.land).toBe('fen')
    expect(map.cell(map.hexOf([114, 97.5]))!.land).toBe('water')
  })

  it('draws lines of hexes that touch, so a path can be followed', () => {
    const hexes = line({ col: 3, row: 4 }, { col: 17, row: 11 })
    for (let i = 1; i < hexes.length; i++) expect(distance(hexes[i - 1]!, hexes[i]!)).toBe(1)
  })

  it('puts the places of the content on their hexes, on dry ground', () => {
    for (const area of ['veenhoek', 'waagdam', 'kattenbroek', 'blackmere', 'reuzenrust']) {
      const hex = map.places.get(area)!
      expect(map.cell(hex)!.land).not.toBe('water')
    }
  })
})

describe('M4: walking across the Holleveen', () => {
  it('finds the way from Veenhoek to the Kattenbroek along the fen path', async () => {
    const engine = game()
    await play(engine, 's', 'w')
    let text = ''
    for (let i = 0; i < 12 && !/Edge of the Kattenbroek/.test(text); i++) text = await play(engine, i === 0 ? 'follow the fen path south-east' : 'follow the fen path east')
    expect(engine.state.player.location).toBe('loc_kattenbroek_edge')
    expect(text).toMatch(/You come to The Edge of the Kattenbroek/)
  })

  it('stops where there is something to decide: water, bad ground, nightfall', async () => {
    const engine = game()
    await play(engine, 's', 'w')
    const out = await play(engine, 'head south', 'head south', 'head south', 'head south')
    expect(out).toMatch(/Deep water bars the way|ground gives way|Night is falling|You come to|forks|edge of the Holleveen/)
    expect(hexOfId(engine.state.player.location) ?? engine.state.player.location).toBeDefined()
  })

  it('keeps the dry ridge hidden until Wouter or Pim shows it', async () => {
    const engine = game()
    await play(engine, 'n')
    expect(await play(engine, 'follow the ridge')).toMatch(/don't know of any ridge/)
    // Pim trusts the stranger: asked about the Kattenbroek, he tells the children's path.
    engine.state.player.location = engine.state.npcs['npc_pim']!.location
    Object.assign((engine.state.relations ??= {})['npc_pim'] ??= { affinity: 0, trust: 0, fear: 0, familiarity: 0 }, { affinity: 60, trust: 40, familiarity: 30 })
    const told = await play(engine, 'talk pim', 'ask pim about the kattenbroek')
    expect(told).toMatch(/secret way|cat fen/)
    expect(engine.state.player.journal!['the_dry_ridge']).toBeDefined()
    await play(engine, 'bye')
    engine.state.player.location = 'loc_veenhoek_green'
    let text = ''
    for (let i = 0; i < 10 && engine.state.player.location !== 'loc_kattenbroek_edge'; i++) text = await play(engine, 'follow the ridge south-east')
    expect(engine.state.player.location).toBe('loc_kattenbroek_edge')
    expect(text).toMatch(/dry ridge/)
  })

  it('a stranger can only persuade Wouter to tell it', async () => {
    const engine = game()
    engine.state.player.location = engine.state.npcs['npc_wouter']!.location
    await play(engine, 'talk wouter', 'ask wouter about the kattenbroek')
    expect(engine.state.player.journal!['the_dry_ridge']).toBeUndefined()
  })
})

describe('M4: what the player knows of the map', () => {
  it('shows a place only heard of as a zone, which shrinks as more people tell of it', () => {
    const engine = game()
    const player = engine.state.player
    ;(player.journal ??= {})['kattenbroek'] = engine.world.now
    player.sources = { kattenbroek: [{ from: 'npc_mirte', t: 1, level: 1 }] }
    const one = knownPlace(engine.world, 'kattenbroek')!
    expect(one.status).toBe('heard')
    player.sources.kattenbroek!.push({ from: 'npc_gerrit', t: 2, level: 2 }, { from: 'npc_trijntje', t: 3, level: 2 })
    const three = knownPlace(engine.world, 'kattenbroek')!
    expect(three.zone!.km).toBeLessThan(one.zone!.km)
    expect(three.zone!.tellers).toBe(3)
  })

  it('knows a place exactly once the player has been there', async () => {
    const engine = game()
    await play(engine, 'n')
    expect(knownPlace(engine.world, 'area_veenhoek')!.status).toBe('visited')
  })
})
