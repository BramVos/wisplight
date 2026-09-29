import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { draftResult, Engine, loadContent, newWorldFiles, playWorldStep, readDraft, WORLD_STEPS, type ContentFile, type WorldStep } from '../src/engine'

// M10.20: the tests know real proposals (Bram, 28 September 2026: why do so
// many errors come out of building a world when it was tested? Because every
// test used the mock model). Each recorded build in
// tests/fixtures/worldbuild/<build>/ holds the real model's reply per step,
// made with npm run trial; this plays them again, step by step as the editor
// does, so every later change runs against real proposals. Every real build
// after it adds its own recordings.

const root = resolve(import.meta.dirname, '..')
const dir = resolve(import.meta.dirname, 'fixtures/worldbuild')

interface Fixture {
  build: string
  step: WorldStep['id']
  chapter: string
  said: string
  model: string
  date: string
  reply: string
  fix?: string | string[]
  /** A correction written by hand, never by a model (M10.29 M): a later check sends the recorded reply back, and this is what it asks for. */
  hand?: { note: string; because: string; fix: string }
}

const builds = existsSync(dir) ? readdirSync(dir).filter((d) => existsSync(join(dir, d, 'build.json'))) : []

describe('M10.20: the recorded real world builds play again', () => {
  it('has at least one recorded build', () => {
    expect(builds).toContain('quiet-reach')
  })

  for (const build of builds) {
    it(`plays ${build} step by step, and the world it makes loads and plays`, async () => {
      const about = JSON.parse(readFileSync(join(dir, build, 'build.json'), 'utf8')) as { folder: string; name: string }
      const steps = readdirSync(join(dir, build))
        .filter((f) => /^\d\d-[a-z]+\.json$/.test(f))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(dir, build, f), 'utf8')) as Fixture)
      expect(steps.map((s) => s.step)).toEqual(WORLD_STEPS.map((s) => s.id).filter((id) => steps.some((s) => s.step === id)))
      let files: ContentFile[] = [...newWorldFiles(about.folder, about.name), { path: 'CHRONICLER.md', text: readFileSync(resolve(root, 'content/CHRONICLER.md'), 'utf8') }]
      const outcome: string[] = []
      for (const fixture of steps) {
        // No key and no cost in a recording; the reply is the model's own JSON.
        expect(JSON.stringify(fixture)).not.toMatch(/sk-[A-Za-z0-9]{10}|"costUsd"|"usd"/)
        expect(readDraft(files, fixture.reply).problems).not.toContain('The chronicler did not answer in the agreed form.')
        const recorded = fixture.fix === undefined ? [] : Array.isArray(fixture.fix) ? fixture.fix : [fixture.fix]
        // A step a later check sends back is sent back with the check's own rule, and then put right by hand.
        if (fixture.hand) expect(playWorldStep(files, fixture.step, fixture.said, fixture.reply, recorded).draft.problems, fixture.step).toContain(fixture.hand.because)
        const played = playWorldStep(files, fixture.step, fixture.said, fixture.reply, [...recorded, ...(fixture.hand ? [fixture.hand.fix] : [])])
        outcome.push(`${fixture.step}: ${played.accepted ? 'loads' : played.draft.problems.slice(0, 2).join('; ')}`)
        files = played.files
      }
      expect(outcome).toEqual(steps.map((s) => `${s.step}: loads`))
      // The world as built loads, starts and answers the first commands.
      const content = loadContent(files)
      expect(content.world.name).toBe(about.name)
      expect(content.locations.size).toBeGreaterThan(5)
      const engine = new Engine(content, { seed: 1 })
      engine.start()
      for (const command of ['look', 'help', 'wait']) {
        const result = await engine.handle(command)
        expect(result.length, command).toBeGreaterThan(0)
      }
      // Nothing more to accept: the same world again changes nothing.
      expect(draftResult(files, { changes: [], files: [] }).ok).toBe(true)
    }, 120_000)
  }
})
