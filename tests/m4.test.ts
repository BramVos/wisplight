import { describe, expect, it } from 'vitest'
import { Engine, GameClock, MockLlm } from '../src/engine'
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
    expect(out).toMatch(/Deep water bars the way|ground gives way|fen takes you|stuck fast|Night is falling|You come to|forks|edge of the Holleveen/)
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

describe('M4: the map and fast travel', () => {
  it('draws only what the player has seen, with the player on it', async () => {
    const engine = game()
    const before = engine.status().map!
    expect(before.rows.join('')).toContain('@')
    await play(engine, 's', 'w', 'follow the fen path south-east')
    const after = engine.status().map!
    const drawn = (rows: string[]) => rows.join('').replace(/\s/g, '').length
    expect(drawn(after.rows)).toBeGreaterThan(drawn(before.rows))
    expect(engine.page('map')!.lines.join('\n')).toMatch(/Veenhoek: been there/)
  })

  it('travels fast over a route walked before, and not over one never walked', async () => {
    const engine = game()
    await play(engine, 's', 'w')
    expect(await play(engine, 'travel to the blackmere')).toMatch(/don't know|only heard|don't know a place/)
    for (let i = 0; i < 6 && engine.state.player.location !== 'loc_blackmere_weirs'; i++) await play(engine, i === 0 ? 'follow the fen path south-east' : 'follow the fen path')
    expect(engine.state.player.location).toBe('loc_blackmere_weirs')
    const out = await play(engine, 'travel to veenhoek')
    expect(out).toMatch(/You travel to Veenhoek\. It takes/)
    expect(engine.world.location(engine.state.player.location).area).toBe('veenhoek')
  })

  it('runs the barge on its days, for a fare', async () => {
    const engine = game()
    // Dinsdag: no barge.
    expect(await play(engine, 'take the barge to waagdam')).toMatch(/No barge today/)
    at(engine, 16, 9) // Donderdag
    const money = engine.state.player.money
    const out = await play(engine, 'take the barge to waagdam')
    expect(out).toMatch(/step ashore at The Harbour/)
    expect(engine.state.player.money).toBe(money - 16)
  })

  it('lists the far places the player has heard of as directions and days', async () => {
    const engine = game()
    ;(engine.state.player.journal ??= {})['graafhaven'] = 1
    expect(engine.page('map')!.lines.join('\n')).toMatch(/BEYOND THE HOLLEVEEN[\s\S]*Graafhaven: about \d+ km west, 2 days on foot/)
  })
})

describe('M4: detail by distance', () => {
  it('lets people far off think every quarter of an hour, and those near every minute', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    at(engine, 15, 7)
    const { tierOf } = await import('../src/engine/lod')
    expect(tierOf(engine.world, 'npc_lubbert')).toBe('full')
    engine.state.player.location = 'loc_kattenbroek_edge'
    expect(tierOf(engine.world, 'npc_lubbert')).toBe('coarse')
    expect(tierOf(engine.world, 'npc_mirte')).toBe('coarse')
  })

  it('makes someone far away a note, and a person again on that spot when the player comes near', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    at(engine, 15, 7)
    engine.state.weather = { kind: 'overcast', since: engine.world.now }
    await play(engine, '@send wouter kattenbroek 3')
    expect(engine.state.npcs['npc_wouter']!.note!.unrest).toBe('travelling')
    engine.tick(8 * 60)
    const note = engine.state.npcs['npc_wouter']!.note!
    expect(note).toMatchObject({ unrest: 'fixed', where: 'loc_kattenbroek_edge' })
    expect(engine.world.npcsAt('loc_kattenbroek_edge')).not.toContain('npc_wouter')
    // The player goes there; near the place, Wouter is a person again, on that spot.
    engine.state.player.location = 'loc_kattenbroek_edge'
    engine.tick(1)
    expect(engine.state.npcs['npc_wouter']!.note).toBeUndefined()
    expect(engine.world.npcsAt('loc_kattenbroek_edge')).toContain('npc_wouter')
    expect(engine.state.npcs['npc_wouter']!.recent!.at(-1)!.text).toMatch(/came to The Edge of the Kattenbroek/)
  })

  it('walks NPCs across country to places no road reaches', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    at(engine, 15, 7)
    const { journey } = await import('../src/engine/lod')
    expect(journey(engine.world, 'npc_gerrit', 'loc_blackmere_weirs')).toBe(true)
    expect(engine.world.present('npc_gerrit')).toBe(false)
    engine.tick(4 * 60)
    expect(engine.state.npcs['npc_gerrit']!.note).toBeUndefined()
  })
})

describe('M4: the first world builder', () => {
  async function copy() {
    const { cp, mkdtemp } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join, resolve } = await import('node:path')
    const dir = await mkdtemp(join(tmpdir(), 'wisplight-builder-'))
    await cp(resolve(import.meta.dirname, '../content'), dir, { recursive: true })
    return dir
  }

  it('writes a change to a place into its YAML file, and the game shows it at once', async () => {
    const { saveChange } = await import('../src/node/builder')
    const { readFile } = await import('node:fs/promises')
    const dir = await copy()
    const engine = new Engine(content, { seed: 1 })
    const day = 'Grey water slaps against the planks. A new stone stands here now. It smells of tar. The green is north.\n'
    const result = await saveChange(dir, 'location', 'loc_veenhoek_quay', { 'description.day': day })
    expect(result).toMatchObject({ ok: true, file: 'base/regions/holleveen/areas/veenhoek/locations.yaml' })
    const text = await readFile(`${dir}/${result.file}`, 'utf8')
    expect(text).toContain('A new stone stands here now.')
    // Comments in the file stay where they were.
    expect(text.split('\n')[0]).toMatch(/^#|^locations:/)
    const next = engine.withContent(result.content!)
    expect(texts(await next.handle('look'))).toMatch(/A new stone stands here now\./)
  })

  it('changes a person, and refuses a change that would break the content', async () => {
    const { saveChange, builderData } = await import('../src/node/builder')
    const dir = await copy()
    const ok = await saveChange(dir, 'npc', 'npc_mirte', { appearance: 'A tall woman with flour in her hair.', personality: { warmth: 3, courage: -1, honesty: 1, temper: 0, curiosity: 2, diligence: 2 } })
    expect(ok.ok).toBe(true)
    const engine = new Engine(ok.content!, { seed: 1 })
    await play(engine, 'n', 'e')
    expect(await play(engine, 'examine mirte')).toMatch(/A tall woman with flour in her hair\./)
    const broken = await saveChange(dir, 'location', 'loc_veenhoek_quay', { exits: { north: { to: 'loc_nowhere' } } })
    expect(broken.ok).toBe(false)
    expect(broken.problems.join(' ')).toMatch(/loc_nowhere/)
    const data = await builderData(dir)
    expect(data.problems).toEqual([])
    expect(data.locations.find((l) => l.id === 'loc_veenhoek_quay')!.exits['north']!.to).toBe('loc_veenhoek_green')
  })

  it('points out what loads but deserves a look', async () => {
    const { builderData } = await import('../src/node/builder')
    const data = await builderData((await import('node:path')).resolve(import.meta.dirname, '../content'))
    expect(data.problems).toEqual([])
    expect(Array.isArray(data.warnings)).toBe(true)
  })
})

describe('M4: the world beyond the map', () => {
  it('works a far place out to its outline once, when the player sets off for it', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 1, llm: mock })
    ;(engine.state.player.journal ??= {})['graafhaven'] = 1
    const out = texts(await engine.handle('walk to graafhaven'))
    expect(out).toMatch(/lies beyond the Holleveen\. It lies about \d+ km west/)
    expect(engine.outlinesWaiting).toBe(1)
    await engine.runModels()
    const page = engine.page('graafhaven')!
    expect(page.lines.join('\n')).toMatch(/the Salt Hall, guild hall/)
    expect(page.lines.join('\n')).toMatch(/Worked out by the chronicler/)
    // Once only: setting off again asks for nothing more.
    await engine.handle('travel to graafhaven')
    expect(engine.outlinesWaiting).toBe(0)
    const replayed = await Engine.replay(content, 1, engine.save().log)
    expect(replayed.state.outlines).toEqual(engine.state.outlines)
  })

  it('keeps names that are already taken out of an outline, and without a model tells what the world book says', async () => {
    const mock = new MockLlm('invent')
    const engine = new Engine(content, { seed: 1, llm: mock })
    ;(engine.state.player.journal ??= {})['hunnenloo'] = 1
    await engine.handle('walk to hunnenloo')
    await engine.runModels()
    expect(engine.page('hunnenloo')!.lines.join('\n')).not.toMatch(/Veenhoek, gate/)
    const plain = new Engine(content, { seed: 1 })
    ;(plain.state.player.journal ??= {})['hunnenloo'] = 1
    await plain.handle('walk to hunnenloo')
    expect(plain.page('hunnenloo')!.lines[0]).toBe(content.topics.get('hunnenloo')!.summary)
  })
})
