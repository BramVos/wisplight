import { describe, expect, it } from 'vitest'
import { calendarOf, ContentError, GameClock, loadContent, parseCommand, splitQuantity } from '../src/engine'
import { content, newEngine } from './helpers'

describe('parser', () => {
  it('understands English and Dutch directions', () => {
    expect(parseCommand('n')).toMatchObject({ verb: 'go', args: ['north'] })
    expect(parseCommand('go east')).toMatchObject({ verb: 'go', args: ['east'] })
    expect(parseCommand('ga zuid')).toMatchObject({ verb: 'go', args: ['south'] })
    expect(parseCommand('in')).toMatchObject({ verb: 'go', args: ['in'] })
  })

  it('maps verb aliases, speech and phrasings', () => {
    expect(parseCommand('kijk').verb).toBe('look')
    // A leading article names nothing (M10.29 N).
    expect(parseCommand('look at the oven')).toMatchObject({ verb: 'examine', args: ['oven'] })
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
    expect(GameClock.from(211, 9, 14, 16, 30).format(calendarOf(content.world))).toBe('Dinsdag 14 Herfstmaand 211 AW, 16:30 (afternoon)')
    // A world without a calendar of its own gets plain names, never the Nethermarch's (M10.17); its start is the first day of the week.
    expect(GameClock.from(211, 9, 14, 16, 30).format(calendarOf({ start: { year: 211, month: 9, day: 14 } }))).toBe('Monday 14 September 211, 16:30 (afternoon)')
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
    // The intro as a moment card (M10.29 C).
    expect(outputs[0]).toMatchObject({ kind: 'card', card: { kind: 'intro' } })
    expect(outputs[0]?.text).toContain('The barge from Graafhaven')
    // Then why you are here (M10.9), whom you were told to ask for and whom you know (M10.29 C), before the place itself.
    expect(outputs[1]?.text).toMatch(/^You ran goods past the Count's tolls/)
    expect(outputs[2]?.text).toMatch(/You were told to ask for Trijntje/)
    // Trijntje, known from before, is the contact already named.
    expect(outputs[3]?.text).toBe('Why you are here is in your journal.')
    expect(outputs[4]?.text).toContain('Canal Quay')
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
    await engine.handle('n')
    await engine.handle('e')
    expect((await engine.handle('ne'))[0]).toMatchObject({ kind: 'error' })
  })

  it('steps out onto the land from the edge of a place (FO, chapter 4)', async () => {
    const engine = newEngine()
    const out = await engine.handle('ne')
    expect(engine.state.player.location).toMatch(/^hex:/)
    // The mill rising into view is a moment of its own (M10.11), after the land.
    expect(out.filter((o) => !o.text.includes('experience') && o.kind !== 'card').at(-1)!.text).toMatch(/Ways on:/)
    expect(out.at(-1)).toMatchObject({ kind: 'card', card: { kind: 'sighting', title: 'The Mill De Zwaan, to the north-east' } })
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
