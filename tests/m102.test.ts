import { describe, expect, it } from 'vitest'
import { Engine, recordFact } from '../src/engine'
import { answerLookup } from '../src/engine/lookups'
import { lineOf, lineStatus } from '../src/engine/storylines'
import { GameLog } from '../src/node/gamelog'
import { content } from './helpers'

// Milestone M10.2 (docs/ROADMAP.md): the register of stories and agreements.
// First the stories: a line closes only by an outcome, sleeps without change,
// and wakes with what it came from; the archive weighs where a line stands and
// can be read back.

const DAY = 24 * 60

/** A quarrel between Aaltje and the widow Kaatje, who hardly meet, with an open question. */
function quarrel(engine: Engine) {
  const world = engine.world
  // What it came from happened on its own: the herbs taken from the widow's garden.
  const cause = recordFact(world, { kind: 'herbs_taken', about: [], place: 'loc_kattenbroek_hut', belang: 1, title: 'the herbs Aaltje never paid for', text: { precise: 'Herbs went from the widow\'s garden and were never paid for.', village: 'Someone took the widow\'s herbs.', far: 'Herbs were taken.' } })
  const fact = recordFact(world, { kind: 'quarrel', about: ['npc_aaltje', 'npc_kaatje'], place: 'loc_aaltje_cottage', belang: 2, title: 'the quarrel between Aaltje and the widow', text: { precise: 'Aaltje and the widow Kaatje quarrelled over an old debt.', village: 'Aaltje and the widow are at odds.', far: 'Two old women quarrel.' }, cause: [cause.id] })
  const line = lineOf(world, fact.id)!
  line.hooks = ['Will Aaltje ever pay the widow?']
  return { line, cause, fact }
}

describe('M10.2: stories that sleep and wake', () => {
  it('goes dormant with an open question, and closes only when nothing is left open', () => {
    const engine = new Engine(content, { seed: 5 })
    const { line } = quarrel(engine)
    const quiet = recordFact(engine.world, { kind: 'omen', about: ['npc_everhard'], place: 'loc_schout_house', belang: 1, title: 'a crow on the schout\'s roof', text: { precise: 'p', village: 'v', far: 'f' } })
    const plain = lineOf(engine.world, quiet.id)!
    expect(lineStatus(line)).toBe('active')
    engine.world.state.npcs['npc_kaatje']!.absent = true
    engine.tick(16 * DAY)
    expect(lineStatus(line)).toBe('dormant')
    expect(line.open).toBe(false)
    expect(line.dormantSince).toBeDefined()
    // A line with nothing open closes; it does not sleep.
    expect(lineStatus(plain)).toBe('closed')
  }, 60_000)

  it('wakes after a hundred days by a return, with its cause, and no model runs for it meanwhile', async () => {
    const engine = new Engine(content, { seed: 5 })
    const { line, cause } = quarrel(engine)
    engine.world.state.npcs['npc_kaatje']!.absent = true
    engine.tick(100 * DAY)
    expect(lineStatus(line)).toBe('dormant')
    engine.world.state.npcs['npc_kaatje']!.absent = false
    const back = recordFact(engine.world, { kind: 'return', about: ['npc_kaatje'], place: 'loc_kattenbroek_hut', belang: 2, title: 'the widow back in the Kattenbroek', text: { precise: 'The widow Kaatje came back to her hut.', village: 'The widow is back.', far: 'Someone came home.' } })
    expect(lineStatus(line)).toBe('active')
    expect(line.facts).toContain(back.id)
    expect(line.resumed?.at(-1)?.by).toBe(back.id)
    expect(line.cause).toContain(cause.id)
    expect(line.hooks).toEqual(['Will Aaltje ever pay the widow?'])
  }, 120_000)

  it('archives only closed lines; a dormant one stays as its record, and its old facts are looked up in the archive', () => {
    const log = new GameLog(':memory:')
    const session = log.start('sleeping-quarrel')
    const engine = new Engine(content, { seed: 5 })
    engine.onLog((l) => log.write(session, l))
    engine.world.archive = { fact: (id) => log.archivedFact(session, id) }
    const { line, cause } = quarrel(engine)
    engine.world.state.npcs['npc_kaatje']!.absent = true
    // Nobody remembers the quarrel after a while: then its facts may go.
    engine.tick(20 * DAY)
    for (const heard of Object.values(engine.state.news!.heard)) {
      for (const id of [...line.facts, cause.id]) delete heard[id]
    }
    engine.tick(60 * DAY)
    expect(engine.state.chronicle!.lines).toContain(line)
    expect(lineStatus(line)).toBe('dormant')
    // What the line came from stays with it: the cause is protected.
    expect(engine.state.news!.facts.some((f) => f.id === cause.id)).toBe(true)
    // Its own old facts went to the archive, and the chronicler's lookup finds them there.
    const gone = line.facts.filter((id) => !engine.state.news!.facts.some((f) => f.id === id))
    expect(gone.length).toBeGreaterThan(0)
    expect(log.archivedFact(session, gone[0]!)).toBeDefined()
    const why = answerLookup(engine.world, 'chronicler', { fn: 'why', line: line.id })
    expect('text' in why && why.text).toMatch(/the herbs Aaltje never paid for/)
    expect(answerLookup(engine.world, 'chronicler', { fn: 'why', line: line.id })).toMatchObject({ text: expect.stringMatching(/Still open: Will Aaltje ever pay the widow\?/) })
  }, 120_000)
})
