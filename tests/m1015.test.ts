import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { newWorldFiles } from '../src/engine/editor'
import { soundNow } from '../src/engine/sound'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.15 (docs/ROADMAP.md): sound, modest. The engine says what is
// to be heard, from the content; the app makes it. The bell is a line in the
// text as well. A world with no sound in its content is quiet.

const at = (engine: Engine, location: string, hour: number) => {
  engine.state.player.location = location
  const day = Math.floor(engine.world.now / (24 * 60)) * 24 * 60
  engine.tick(Math.max(0, day + hour * 60 - engine.world.now) || 24 * 60)
}

describe('M10.15: the sound of a place', () => {
  it('a place of its own, else its area; birds by day and the reeds at night in Veenhoek; rain outside, and on the roof inside', () => {
    const engine = new Engine(content, { seed: 1 })
    const world = engine.world
    world.state.weather = { kind: 'clear', since: world.now }
    world.state.player.location = 'loc_goose_common'
    expect(soundNow(world)).toMatchObject({ kind: 'hearth', indoors: true })
    world.state.player.location = 'loc_veenhoek_green'
    expect(soundNow(world)?.kind).toBe(engine.status().clock.light === 'night' ? 'reeds' : 'birds')
    world.state.weather = { kind: 'rain', since: world.now }
    expect(soundNow(world)).toMatchObject({ kind: 'rain', indoors: false })
    world.state.player.location = 'loc_goose_common'
    expect(soundNow(world)).toMatchObject({ kind: 'rain', level: 0.35, indoors: true })
    expect(engine.status().sound?.kind).toBe('rain')
    // Out on the land map: the area that stands for the open land (the Holleveen: the reeds).
    world.state.weather = { kind: 'clear', since: world.now }
    world.state.player.location = 'hex:40,30'
    expect(soundNow(world)?.kind).toBe('reeds')
  })

  it('the chapel bell: plainly in Veenhoek, far off at the mill, not at all in Waagdam', () => {
    const engine = new Engine(content, { seed: 2 })
    engine.start()
    at(engine, 'loc_veenhoek_green', 12)
    expect(engine.state.bell).toMatchObject({ far: false })
    const noon = engine.state.bell!.t
    at(engine, 'loc_molenend_mill', 18)
    expect(engine.state.bell).toMatchObject({ far: true })
    expect(engine.state.bell!.t).toBeGreaterThan(noon)
    const far = engine.state.bell!.t
    at(engine, 'loc_waagdam_market', 6)
    expect(engine.state.bell!.t).toBe(far)
  })

  it('the bell says itself in the text, for whoever plays without sound', async () => {
    const builder = new Engine(content, { seed: 3, builder: true })
    builder.start()
    builder.state.player.location = 'loc_veenhoek_green'
    const said = (await builder.handle('@time 12')).map((o) => o.text).join('\n')
    expect(said).toMatch(/The chapel bell rings for noon\./)
  })

  it('Skerrow has its harbour bell and the sea; Deepwell hums and has no bell; a new world is quiet', async () => {
    const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
    const skerrow = new Engine(isle, { seed: 4, builder: true })
    skerrow.start()
    skerrow.state.player.location = 'loc_skerrow_harbour'
    skerrow.world.state.weather = { kind: 'clear', since: skerrow.world.now }
    expect(soundNow(skerrow.world)?.kind).toBe('sea')
    expect((await skerrow.handle('@time 18')).map((o) => o.text).join('\n')).toMatch(/The harbour bell rings for six, once for the boats\./)
    const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
    const dome = new Engine(deepwell, { seed: 5 })
    dome.start()
    expect(soundNow(dome.world)).toMatchObject({ kind: 'hum' })
    expect(deepwell.world.bells).toEqual([])
    const tiny = new Engine(loadContent(newWorldFiles('tiny', 'Tiny')), { seed: 6 })
    tiny.start()
    expect(soundNow(tiny.world)).toBeUndefined()
    expect(tiny.status().sound).toBeUndefined()
  })
})
