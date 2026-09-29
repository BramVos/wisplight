import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Engine, MockLlm, pictureSubject, WORLD_STEPS, wantsPictures } from '../src/engine'
import { regionMap } from '../src/engine/map/region'
import { AiService } from '../src/node/ai/service'
import type { Cipher } from '../src/node/ai/settings'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.26: pictures per world, in the editor and in the game. A world says
// whether it wants them (pictures.wanted, left out: none made in the editor);
// the editor counts what is missing and makes only that; in the game the
// player's own switch decides, for what grows in play too, in the style of the
// world or of the land a place or a person is of.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

function cipher(): Cipher {
  const key = randomBytes(32)
  return {
    available: () => true,
    encrypt: (plain) => {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
    },
    decrypt: (stored) => {
      const raw = Buffer.from(stored, 'base64')
      const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
      d.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
    },
  }
}

/** An AI service with a fake image model: every picture it makes is counted. */
async function picturing(): Promise<{ ai: AiService; dir: string; calls: () => number }> {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-pictures-'))
  folders.push(dir)
  let calls = 0
  const ai = new AiService({
    dir,
    cipher: cipher(),
    content,
    providerFactory: (id) => ({
      id,
      listModels: async () => [{ id: 'gpt-4.1-mini-2025-04-14' }],
      complete: async () => ({ text: '{}', provider: 'fake', model: 'm', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, latencyMs: 1 }),
      listImageModels: async () => [{ id: 'gpt-image-1-mini' }],
      picture: async (model) => {
        calls++
        return { base64: Buffer.from('fake jpeg').toString('base64'), mime: 'image/jpeg', model, latencyMs: 5 }
      },
    }),
  })
  await ai.connect('openai', `sk-proj-unittest${randomBytes(8).toString('hex')}`)
  ai.choosePictures({ provider: 'openai', model: 'gpt-image-1-mini', quality: 'low' })
  return { ai, dir, calls: () => calls }
}

const worlds = resolve(import.meta.dirname, '../content')

describe('M10.26: pictures per world, in the editor and in the game', () => {
  it('lets Skerrow and The Quiet Reach want pictures, and Deepwell leave it out as the neutral default', async () => {
    expect(wantsPictures(await loadContentFromDir(worlds, 'isle'))).toBe(true)
    expect(wantsPictures(await loadContentFromDir(worlds, 'quietreach'))).toBe(true)
    // Deepwell has a picture style but says nothing about wanting pictures: the editor makes none and asks nothing.
    const deepwell = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')
    expect(deepwell.world.pictures?.style).toBeTruthy()
    expect(wantsPictures(deepwell)).toBe(false)
    // The Palette step asks it, with the price the editor shows.
    const palette = WORLD_STEPS.find((s) => s.id === 'palette')!
    expect(palette.ask.join(' ')).toMatch(/do you want them made in the editor\? One costs about what the editor shows/)
    expect(palette.prompt).toMatch(/pictures\.wanted: true when the designer wants pictures/)
  })

  it('draws a place or a person of a land in the style of that land', async () => {
    const isle = await loadContentFromDir(worlds, 'isle')
    const land = isle.lands.get('western_isles')!.pictures!.style!
    expect(pictureSubject(isle, 'area_ynys_wen')!.prompt).toContain(land)
    expect(pictureSubject(isle, 'npc_eluned')!.prompt).toContain(land)
    expect(pictureSubject(isle, 'area_skerrow_hythe')!.prompt).toContain(isle.world.pictures!.style!)
  })

  it('counts what a world misses, and the editor button makes only that', async () => {
    const { ai, dir, calls } = await picturing()
    const deepwell = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')
    const before = ai.pictureView(deepwell)
    expect(before.model).toBe('gpt-image-1-mini')
    expect(before.priceUsd).toBeGreaterThan(0)
    expect(before.kept).toBe(0)
    // Areas and named people; a generic figure costs nothing and never counts.
    const generic = [...deepwell.npcs.values()].filter((n) => n.portrait === 'generic').map((n) => n.name)
    expect(before.missing.some((m) => generic.includes(m.name))).toBe(false)
    await ai.picture(deepwell, before.missing.find((m) => m.kind === 'person') ? [...deepwell.npcs.values()].find((n) => n.portrait !== 'generic')!.id : 'x')
    const lines: string[] = []
    const made = await ai.drawAll([deepwell], 5, (line) => lines.push(line))
    expect(made.made).toBe(before.missing.length - 1)
    expect(made.kept).toBe(1)
    expect(lines.filter((l) => /^made .*, \$0\.\d+$/.test(l))).toHaveLength(made.made)
    expect(calls()).toBe(before.missing.length)
    expect(ai.pictureView(deepwell)).toMatchObject({ missing: [], kept: before.missing.length })
    expect(readdirSync(join(dir, 'pictures', deepwell.world.id)).length).toBe(before.missing.length)
  })

  it('gives a district that grew in play its picture while the switch is on, and makes none while it is off', async () => {
    const engine = new Engine(content, { seed: 3, builder: true, llm: new MockLlm('good') })
    engine.start()
    await engine.handle('frames region story')
    const map = regionMap(engine.content)!
    await engine.handle(`@goto hex:${Math.floor(map.cols / 2)},0`)
    await engine.handle('explore south')
    await engine.runModels()
    await engine.handle('head south')
    await engine.handle(String(engine.state.choice!.options.findIndex((o) => /Grey Saltings/.test(o.label)) + 1))
    // On the way and there: the models run as the app runs them, and the minute after brings the stranger in.
    for (let i = 0; i < 4; i++) {
      await engine.runModels()
      engine.tick(1)
      await engine.handle('look')
    }
    const grown = engine.content
    const place = [...grown.locations.values()].find((l) => l.area === 'grey_saltings')!.id
    const people = [...grown.npcs.values()].filter((n) => !content.npcs.has(n.id) && n.portrait !== 'generic').map((n) => n.id)
    expect(people.length).toBeGreaterThan(1)
    const { ai, calls } = await picturing()
    // The world as it was written has no such place: the game asks with its own content, what grew included.
    expect(await ai.picture(content, place)).toBeUndefined()
    expect(await ai.picture(grown, place)).toMatch(/^data:image\/jpeg;base64,/)
    expect(await ai.picture(grown, people[0]!)).toMatch(/^data:image\/jpeg;base64,/)
    expect(calls()).toBe(2)
    // The switch off: what is there is shown, nothing new is drawn.
    ai.picturesNew(false)
    expect(ai.settings.summary().picturesNew).toBe(false)
    expect(await ai.picture(grown, place)).toMatch(/^data:image\/jpeg;base64,/)
    expect(await ai.picture(grown, people[1]!)).toBeUndefined()
    expect(calls()).toBe(2)
    // On again (and on as soon as an image model is chosen, the default): it draws.
    ai.picturesNew(true)
    expect(await ai.picture(grown, people[1]!)).toMatch(/^data:image\/jpeg;base64,/)
    expect(calls()).toBe(3)
  }, 60_000)
})
