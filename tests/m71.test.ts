import { describe, expect, it } from 'vitest'
import { Engine, GameClock, MockLlm, type Output } from '../src/engine'
import { content } from './helpers'

// Milestone M7.1 (docs/ROADMAP.md): after the M7 playtest. Conversations in a
// window of their own, the journal near things first with a small map, and
// people who know where their acquaintances are.

const texts = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')

function game(seed = 4) {
  const mock = new MockLlm('good')
  const engine = new Engine(content, { seed, llm: mock, builder: true })
  return { engine, mock }
}

async function at(engine: Engine, day: number, hour: number): Promise<void> {
  const target = GameClock.from(211, 9, day, hour, 0).minutes
  if (target > engine.world.now) engine.tick(target - engine.world.now)
}

describe('M7.1: where people are', () => {
  it('someone close knows the day schedule to the place', async () => {
    const { engine, mock } = game()
    await at(engine, 15, 10)
    engine.state.npcs['npc_mirte']!.location = 'loc_veenhoek_bakery'
    engine.state.npcs['npc_mirte']!.sightings = {}
    engine.state.npcs['npc_aaltje']!.sightings = {}
    await engine.handle('@goto loc_aaltje_cottage')
    await engine.handle('@bring aaltje')
    await engine.handle('talk aaltje')
    await engine.handle('where is mirte')
    const prompt = mock.calls.at(-1)!.prompt
    expect(prompt).toMatch(/Mirte the baker (is usually at|Around this time).*The Bakery|Around this time Mirte the baker is usually at The Bakery/)
    expect(prompt).toMatch(/What Mirte the baker looks like:/)
  })

  it('what someone saw beats the schedule', async () => {
    const { engine, mock } = game()
    await at(engine, 15, 10)
    engine.state.npcs['npc_aaltje']!.sightings = { npc_mirte: { where: 'loc_veenhoek_quay', t: engine.world.now - 30 } }
    await engine.handle('@goto loc_aaltje_cottage')
    await engine.handle('@bring aaltje')
    await engine.handle('talk aaltje')
    await engine.handle('where is mirte')
    expect(mock.calls.at(-1)!.prompt).toMatch(/You saw Mirte the baker at Canal Quay an hour ago\./)
  })

  it('notes who saw whom as the day goes by', () => {
    const { engine } = game()
    engine.tick(6 * 60)
    const seen = Object.values(engine.state.npcs).filter((n) => Object.keys(n.sightings ?? {}).length > 0)
    expect(seen.length).toBeGreaterThan(10)
  })
})

describe('M7.1: the conversation window', () => {
  it('sends what you type in quotes as speech, even when it begins like a command', async () => {
    const { engine } = game()
    await engine.handle('@goto loc_visser_house')
    await engine.handle('@bring grietje')
    await engine.handle('talk grietje')
    const out = texts(await engine.handle('"Go on, tell me about your daughter.'))
    expect(engine.state.player.location).toBe('loc_visser_house')
    expect(engine.state.talk?.npc).toBe('npc_grietje_visser')
    expect(out).not.toMatch(/You can't go/)
  })

  it('still lets a quest hear its own words in quotes', async () => {
    const { engine } = game()
    await engine.handle('@goto loc_visser_house')
    await engine.handle('@like aaltje 30 30')
    await engine.handle('@bring aaltje')
    await engine.handle('talk aaltje')
    await engine.handle('"ask aaltje about the cat')
    expect(engine.state.flags?.['cat_is_fenna']).toBe(true)
  })
})

describe('M7.1: the journal, near things first', () => {
  it('gives every entry with a place its distance, and a small map on its page', async () => {
    const { engine } = game()
    await engine.handle('@goto loc_visser_house')
    await engine.handle('@goto loc_waagdam_market')
    const j = engine.status().journal
    const quay = j.places.find((p) => p.id === 'loc_veenhoek_quay')!
    const market = j.places.find((p) => p.id === 'loc_waagdam_market')!
    expect(market.km).toBeLessThan(1)
    expect(quay.km).toBeGreaterThan(market.km!)
    const page = engine.page('loc_veenhoek_quay')!
    expect(page.map!.rows.join('')).toMatch(/[*@]/)
    expect(page.map!.classes.join('')).toMatch(/x|@/)
  })
})
