import { describe, expect, it } from 'vitest'
import { APP_KNOBS, Engine, MockLlm } from '../src/engine'
import { GameLog } from '../src/node/gamelog'
import { content } from './helpers'

// M10.29 S, picking a game up with the last lines in view (Bram, 29 September
// 2026: after a restart the window was empty on "You pick up where you left
// off."): the last lines typed and shown, read from the end of the game log,
// with the day they began, and none of the notes or events.

describe('M10.29 S: the game before, when you pick it up again', () => {
  it('gives the last lines typed and shown, with their day, up to the save on a loaded branch', async () => {
    const log = new GameLog(':memory:')
    const session = log.start('game-1')
    const engine = new Engine(content, { seed: 21, llm: new MockLlm('good') })
    engine.onLog((line) => log.write(session, line))
    engine.start()
    await engine.handle('look')
    log.append(session, engine.world.now, 'note', 'Continued')
    await engine.handle('wait 30')
    const saved = log.position(session)
    await engine.handle('north')
    const earlier = log.earlier(session, 6, engine.world.calendar)!
    expect(earlier.when).toMatch(/^\w+ \d+$/)
    expect(earlier.lines).toHaveLength(6)
    expect(earlier.lines.some((l) => l.you && l.text === 'north')).toBe(true)
    expect(earlier.lines.some((l) => l.text === 'Continued')).toBe(false)
    // A save loaded after more was played: only what came before it.
    const loaded = log.earlier(log.fork(session, saved), 40, engine.world.calendar)!
    expect(loaded.lines.at(-1)!.text).toMatch(/Time passes\./)
    expect(loaded.lines.some((l) => l.text === 'north')).toBe(false)
    // None wanted, or none there.
    expect(log.earlier(session, 0)).toBeUndefined()
    expect(log.earlier(log.start('empty'), 40)).toBeUndefined()
  })

  it('is an app knob, 40 lines unless the player sets it', () => {
    expect(APP_KNOBS.recall_lines).toMatchObject({ default: 40, min: 0 })
  })
})
