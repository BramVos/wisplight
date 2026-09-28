import { describe, expect, it } from 'vitest'
import { WorldSchema } from '../src/engine/content'
import { RulesSchema } from '../src/engine/rules/schema'
import { WORLD_GUIDE, WORLD_STEPS } from '../src/engine/worldguide'

// The chronicler as world builder (M10.17): the steps a new world is made in,
// with what to ask the designer, and the lessons from building Deepwell.

describe('the guide for a new world', () => {
  it('has every step once, in the order a world is built', () => {
    expect(WORLD_STEPS.map((s) => s.id)).toEqual(['frame', 'calendar', 'money', 'faiths', 'places', 'professions', 'people', 'economy', 'passages', 'watcher', 'voice', 'palette'])
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
    expect(step('faiths').fills).toContainEqual({ kind: 'rules', keys: ['death'] })
    expect(step('people').fills.map((f) => f.kind)).toContain('factions')
    expect(step('people').prompt).toMatch(/fines/)
    expect(step('passages').prompt).toMatch(/hires/)
    expect(step('passages').fills.map((f) => f.kind)).toContain('journey')
    expect(step('calendar').fills).toContainEqual({ kind: 'world', keys: ['calendar', 'start', 'weather'] })
    expect(step('calendar').prompt).toMatch(/start_weekday/)
    expect(step('palette').prompt).toMatch(/hex names/)
  })

  it('tells the chronicler to ask before inventing, never to borrow from another world, and what building Deepwell taught', () => {
    expect(WORLD_GUIDE).toMatch(/Ask before you invent/)
    expect(WORLD_GUIDE).toMatch(/Never fill a gap with a value from another world/)
    for (const lesson of [/aftermath:/, /area of its settlement/, /made somewhere or brought by a route/, /way on foot/, /legs/, /first block that matches/, /smallest coin/]) expect(WORLD_GUIDE).toMatch(lesson)
  })
})
