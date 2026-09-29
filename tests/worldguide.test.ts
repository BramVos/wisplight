import { describe, expect, it } from 'vitest'
import { WorldSchema } from '../src/engine/content'
import { RulesSchema } from '../src/engine/rules/schema'
import { WORLD_GUIDE, WORLD_STEPS } from '../src/engine/worldguide'

// The chronicler as world builder (M10.17): the steps a new world is made in,
// with what to ask the designer, and the lessons from building Deepwell.

describe('the guide for a new world', () => {
  it('has every step once, in the order a world is built: the voice right after the frame (M10.20)', () => {
    expect(WORLD_STEPS.map((s) => s.id)).toEqual(['frame', 'voice', 'lands', 'calendar', 'money', 'faiths', 'places', 'professions', 'people', 'economy', 'passages', 'watcher', 'palette'])
  })

  it('asks at most three things per step, and says what happens when a step is skipped', () => {
    for (const step of WORLD_STEPS) {
      expect(step.ask.length, step.id).toBeGreaterThan(0)
      expect(step.ask.length, step.id).toBeLessThanOrEqual(3)
      expect(step.skipped, step.id).toMatch(/\S/)
      expect(step.checks.length, step.id).toBeGreaterThan(0)
      expect(step.prompt, step.id).toMatch(/^STEP: /)
    }
    // Only the steps a world cannot do without are required.
    expect(WORLD_STEPS.filter((s) => !s.optional).map((s) => s.id)).toEqual(['frame', 'places', 'people'])
  })

  it('writes only keys world.yaml and the rules have', () => {
    const keys = { world: Object.keys(WorldSchema.shape), rules: Object.keys(RulesSchema.shape) }
    for (const step of WORLD_STEPS)
      for (const fill of step.fills.filter((f) => f.kind === 'world' || f.kind === 'rules')) for (const key of fill.keys ?? []) expect(keys[fill.kind as 'world' | 'rules'], `${step.id}: ${key}`).toContain(key)
  })

  it('asks for what a world can hold in the step it belongs to (the rule in CLAUDE.md)', () => {
    const step = (id: string) => WORLD_STEPS.find((s) => s.id === id)!
    expect(step('frame').prompt).toMatch(/sleep with a sentence each for room, home and rough/)
    expect(step('money').prompt).toMatch(/aliases/)
    expect(step('faiths').fills).toContainEqual({ kind: 'rules', keys: ['death', 'patrons'] })
    expect(step('people').fills.map((f) => f.kind)).toContain('factions')
    expect(step('people').prompt).toMatch(/fines/)
    expect(step('passages').prompt).toMatch(/hires/)
    expect(step('passages').fills.map((f) => f.kind)).toContain('journey')
    expect(step('calendar').prompt).toMatch(/start_weekday/)
    expect(step('palette').prompt).toMatch(/hex names/)
    expect(step('faiths').prompt).toMatch(/sworn/)
    expect(step('places').prompt).toMatch(/barred/)
    expect(step('people').fills).toContainEqual({ kind: 'rules', keys: ['ancestries'] })
    expect(step('economy').checks.join(' ')).toMatch(/tag light/)
    expect(step('watcher').fills.map((f) => f.kind)).toEqual(expect.arrayContaining(['creatures', 'encounters']))
    expect(step('watcher').prompt).toMatch(/tempts/)
    expect(step('economy').prompt).toMatch(/failure: outcome poor, damaged, leftover or lost/)
    expect(step('economy').prompt).toMatch(/quality poor with of, and used/)
    expect(step('watcher').checks.join(' ')).toMatch(/made_good .* pupil_learnt/)
    expect(step('watcher').checks.join(' ')).toMatch(/tell with grows/)
    expect(step('watcher').fills).toContainEqual({ kind: 'rules', keys: ['conditions'] })
    expect(step('calendar').fills).toContainEqual({ kind: 'world', keys: ['calendar', 'start', 'weather', 'bells'] })
    expect(step('places').prompt).toMatch(/a sound/)
    expect(step('places').checks.join(' ')).toMatch(/Left out: silence/)
    expect(step('places').checks.join(' ')).toMatch(/improvise: a domain \(offering, curse, spirit, lore or craft\)/)
    expect(step('watcher').checks.join(' ')).toMatch(/signal improvised/)
  })

  it('tells the chronicler to ask before inventing, never to borrow from another world, and what building Deepwell taught', () => {
    expect(WORLD_GUIDE).toMatch(/Ask before you invent/)
    expect(WORLD_GUIDE).toMatch(/Never fill a gap with a value from another world/)
    expect(WORLD_GUIDE).toMatch(/paste tables \(rows with \| or tabs\) and lists\. Read each row as a record/)
    for (const lesson of [/aftermath:/, /area of its settlement/, /made somewhere or brought by a route/, /way on foot/, /legs/, /first block that matches/, /smallest coin/]) expect(WORLD_GUIDE).toMatch(lesson)
  })
})
