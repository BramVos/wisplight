import { describe, expect, it } from 'vitest'
import { ContentError, GameClock, loadContent, parseCommand, splitQuantity } from '../src/engine'
import { newEngine } from './helpers'

describe('parser', () => {
  it('understands English and Dutch directions', () => {
    expect(parseCommand('n')).toMatchObject({ verb: 'go', args: ['north'] })
    expect(parseCommand('go east')).toMatchObject({ verb: 'go', args: ['east'] })
    expect(parseCommand('ga zuid')).toMatchObject({ verb: 'go', args: ['south'] })
    expect(parseCommand('in')).toMatchObject({ verb: 'go', args: ['in'] })
  })

  it('maps verb aliases, speech and phrasings', () => {
    expect(parseCommand('kijk').verb).toBe('look')
    expect(parseCommand('look at the oven')).toMatchObject({ verb: 'examine', args: ['the', 'oven'] })
    expect(parseCommand('pick up knife')).toMatchObject({ verb: 'take', args: ['knife'] })
    expect(parseCommand('koop brood')).toMatchObject({ verb: 'buy', args: ['brood'] })
    expect(parseCommand("'Good evening")).toMatchObject({ verb: 'say', args: ['Good evening'] })
  })

  it('splits quantities', () => {
    expect(splitQuantity(['2', 'loaves', 'of', 'bread'])).toEqual({ qty: 2, text: 'bread' })
    expect(splitQuantity(['bread', '3'])).toEqual({ qty: 3, text: 'bread' })
    expect(splitQuantity(['all', 'peat'])).toEqual({ qty: 'all', text: 'peat' })
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
  it('starts on the quay with the intro', () => {
    const outputs = newEngine().start()
    expect(outputs[0]?.text).toContain('The barge from Graafhaven')
    expect(outputs[1]?.text).toContain('Canal Quay')
    expect(outputs.at(-1)?.text).toContain('TEMPO CALM')
  })

  it('moves between locations and lets time pass', async () => {
    const engine = newEngine()
    const before = engine.world.now
    const [room] = await engine.handle('n')
    expect(room?.text).toContain('Veenhoek, the Green')
    expect(engine.world.now).toBe(before + 1)
  })

  it('refuses exits that do not exist', async () => {
    const engine = newEngine()
    expect((await engine.handle('ne'))[0]).toMatchObject({ kind: 'error' })
  })
})

describe('content validation', () => {
  const world = 'world: { id: t, name: T, start: { location: loc_a, year: 1, month: 1, day: 1, hour: 8 }, player: { money: 0 } }'
  const area = 'areas: [{ id: a, name: A, kind: village, summary: A. }]'

  it('rejects an exit to a missing location', () => {
    const files = [
      { path: 'world.yaml', text: world },
      { path: 'areas.yaml', text: area },
      { path: 'locations.yaml', text: 'locations:\n  - id: loc_a\n    name: A\n    area: a\n    description: { day: A place. }\n    exits:\n      north: { to: loc_missing }' },
    ]
    expect(() => loadContent(files)).toThrow(ContentError)
  })

  it('rejects an exit without a way back', () => {
    const files = [
      { path: 'world.yaml', text: world },
      { path: 'areas.yaml', text: area },
      {
        path: 'locations.yaml',
        text: 'locations:\n  - { id: loc_a, name: A, area: a, description: { day: A. }, exits: { north: { to: loc_b } } }\n  - { id: loc_b, name: B, area: a, description: { day: B. } }',
      },
    ]
    expect(() => loadContent(files)).toThrow(/no way back/)
  })
})
