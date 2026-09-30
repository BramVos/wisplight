import { describe, expect, it } from 'vitest'
import { Engine, GameClock } from '../src/engine'
import { recordFact } from '../src/engine/news'
import { content } from './helpers'

// M10.29 L (Bram, 29 September 2026: he saw two people talking and did not
// know LISTEN exists): the first "X and Y stand talking." of a game says how
// to catch it, HELP names it with the talking, and a second LISTEN says that
// whoever stays hears more. No new call: the same chat line as before.

const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

/** Mirte and Grietje come to the green to talk about the mill, the stranger there. */
async function chatOnTheGreen(): Promise<{ engine: Engine; seen: string }> {
  const engine = new Engine(content, { seed: 28, builder: true })
  engine.tick(GameClock.from(211, 9, 15, 14, 0).minutes - engine.world.now)
  await engine.handle('@goto loc_veenhoek_green')
  const here = engine.state.player.location
  const fact = recordFact(engine.world, { kind: 'rumour', about: ['npc_harmen'], place: 'loc_waagdam_market', belang: 2, title: 'the mill', text: { precise: 'Harmen has sold the mill, they say.', village: 'Harmen has sold the mill!', far: 'A mill was sold.' }, witnesses: [] })
  engine.state.news!.heard['npc_mirte']![fact.id] = { level: 3, reliability: 1, from: 'witness', t: engine.world.now }
  for (const id of ['npc_mirte', 'npc_grietje_visser']) Object.assign(engine.state.npcs[id]!, { location: 'loc_veenhoek_bakery', plan: [{ kind: 'move', to: here }], busyUntil: engine.world.now, goals: [] })
  engine.state.bonds!['npc_mirte']!['npc_grietje_visser'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
  engine.state.bonds!['npc_grietje_visser']!['npc_mirte'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
  let seen = ''
  for (let m = 0; m < 15 && !engine.state.chatter?.chats.length; m++) seen += said(await engine.handle('wait 1'))
  return { engine, seen }
}

describe('M10.29 L: listening is to be found', () => {
  it('says once a game how to catch two people talking, names LISTEN in HELP, and says that staying hears more', async () => {
    const { engine, seen } = await chatOnTheGreen()
    const look = said(await engine.handle('look'))
    // The first time the stranger sees two people talk, and never again.
    expect(`${seen}\n${look}`).toMatch(/stand talking[^\n]*\(LISTEN to catch it\.\)/)
    expect(`${seen}\n${look}`.match(/LISTEN to catch it/g)).toHaveLength(1)
    expect(said(await engine.handle('look'))).not.toMatch(/LISTEN to catch it/)
    expect(said(await engine.handle('help talk'))).toMatch(/Two people talking: listen/)
    expect(said(await engine.handle('listen'))).toMatch(/You stand close enough to hear/)
    expect(said(await engine.handle('listen'))).toMatch(/Stay a while, and you may hear what \w+ says back\./)
    expect(said(await engine.handle('listen'))).not.toMatch(/Stay a while/)
  })
})
