import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { questPage } from '../src/engine/quests/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.33 AF, the story so far and what you can do now (Bram, 30 September
// 2026: "ik begrijp nog steeds niet het hele verhaal"; he put the evidence to
// Sorell in plain sentences and the line stayed at stage 5, the endings of
// its last stage out of sight). The quest page has three parts: so far, now,
// and what could be done, the ways it may end in the player's own words.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.33 AF: the story so far and what you can do now', () => {
  it('tells the stages and what each deed brought, in order, then what to do now and what could be done', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_orison_listening_room', '@bring niko', 'ask niko about the station']) await engine.handle(c)
    const lines = questPage(engine.world, 'story_the_orison_recordings')!.lines
    const at = (pattern: RegExp) => lines.findIndex((l) => pattern.test(l))
    expect(lines[0]).toBe('So far:')
    // Stage one, what Niko told, then stage two.
    expect(at(/^- Dr Sorell wants the original recordings/)).toBeLessThan(at(/^ {2}Niko gives you the access sequence/))
    expect(at(/^ {2}Niko gives you the access sequence/)).toBeLessThan(at(/^- The originals are in the archive/))
    expect(at(/^Now: /)).toBeGreaterThan(at(/^- The originals are in the archive/))
    expect(lines.slice(at(/^You could:$/))).toContain('- COPY ORIGINAL RECORDINGS')
  })

  it('shows the ways it may end at its last stage, as typed, never what comes of them', async () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    Object.assign((engine.state.flags ??= {}), { story_the_orison_recordings_1: true, story_the_orison_recordings_2: true, story_the_orison_recordings_3: true, story_the_orison_recordings_4: true })
    engine.tick(1)
    const lines = questPage(engine.world, 'story_the_orison_recordings')!.lines
    const ends = lines.slice(lines.indexOf('Ways it could end:') + 1)
    expect(ends).toEqual(expect.arrayContaining(['- CONFRONT SORELL ABOUT RECORDINGS', '- PLAY RECORDINGS IN COMMONS']))
    // Never the outcome itself.
    expect(ends.join(' ')).not.toMatch(/admits|does not deny/)
    // QUESTS gives what could be done too.
    expect(text(await engine.handle('quests'))).toMatch(/The Orison Recordings: [^\n]*You could: [^\n]*CONFRONT SORELL ABOUT RECORDINGS/)
  })
})
