import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContentError, Engine, GameClock, loadContent, parseCommand } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

const content = await loadContentFromDir(resolve(import.meta.dirname, '../content'))

describe('parser', () => {
  it('understands English and Dutch directions', () => {
    expect(parseCommand('n')).toMatchObject({ verb: 'go', args: ['north'] })
    expect(parseCommand('go east')).toMatchObject({ verb: 'go', args: ['east'] })
    expect(parseCommand('ga zuid')).toMatchObject({ verb: 'go', args: ['south'] })
  })

  it('maps verb aliases and speech', () => {
    expect(parseCommand('kijk').verb).toBe('look')
    expect(parseCommand("'Good evening")).toMatchObject({ verb: 'say', args: ['Good evening'] })
  })
})

describe('clock', () => {
  it('formats the starting date', () => {
    expect(GameClock.from(211, 9, 14, 16, 30).format()).toBe('Dinsdag 14 Herfstmaand 211 AW, 16:30 (afternoon)')
  })

  it('rolls over into the Dyke Days at the end of the year', () => {
    const clock = GameClock.from(211, 12, 30, 23, 59)
    clock.advance(1)
    expect(clock.parts).toMatchObject({ month: 13, day: 1, hour: 0 })
  })
})

describe('engine', () => {
  it('starts on the green with the intro', () => {
    const engine = new Engine(content)
    const outputs = engine.start()
    expect(outputs[0]?.text).toContain('The barge from Graafhaven')
    expect(outputs.at(-1)?.text).toContain('Veenhoek, the Green')
  })

  it('moves between locations and lets time pass', () => {
    const engine = new Engine(content)
    const before = engine.clock.minutes
    const [room] = engine.handle('e')
    expect(room?.text).toContain('The Bakery')
    expect(engine.clock.minutes).toBe(before + 1)
  })

  it('shows who is present', () => {
    const engine = new Engine(content)
    expect(engine.handle('east')[0]?.text).toContain('Here: Mirte the baker.')
  })

  it('refuses exits that do not exist', () => {
    const engine = new Engine(content)
    expect(engine.handle('ne')[0]).toMatchObject({ kind: 'error' })
  })
})

describe('content validation', () => {
  it('rejects an exit to a missing location', () => {
    const files = [
      { path: 'world.yaml', text: 'world: test\nname: Test\nstart: { location: loc_a, year: 1, month: 1, day: 1, hour: 8 }' },
      {
        path: 'locations.yaml',
        text: '- id: loc_a\n  name: A\n  area: test\n  description: { day: A place. }\n  exits:\n    north: { to: loc_missing }',
      },
    ]
    expect(() => loadContent(files)).toThrow(ContentError)
  })
})
