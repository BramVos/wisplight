import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Engine, LlmError, type LlmClient, type LlmRequest } from '../src/engine'
import { LINK_BACK, LINK_DOWN } from '../src/engine/dialogue/conversation'
import { promises } from '../src/engine/dialogue/guard'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.29 V, from the analysis of Bram's sessions of 29 September 2026 (Q):
// (a) a provider outage gave four times the same set line with the technical
// reason; now the game says once that the link is down, answers by the rules
// for thirty seconds, and then asks again quietly. (b) GO OUTSIDE, GO COMMON
// ROOM, WALK TO 5,6 in the Workshop, SIT and FLY. (d) A thing handed across in
// words is a deed like "hands you".

const quietReach = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')
const DAY = 24 * 60

/** A model that fails for want of a connection until told otherwise, then answers. */
function flaky(): LlmClient & { calls: LlmRequest[]; up: boolean } {
  const calls: LlmRequest[] = []
  const client = {
    calls,
    up: false,
    complete: async (request: LlmRequest) => {
      calls.push(request)
      if (!client.up) throw new LlmError('network', '503 Service Unavailable: overloaded')
      const text = JSON.stringify({ reply: 'Rye, and a little barley bread.', names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked about bread.', ends_conversation: false, keep_talking: 'no' })
      return { text, provider: 'mock', model: 'flaky-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
  }
  return client
}

afterEach(() => vi.restoreAllMocks())

describe('M10.29 V (a): an outage is said once, and the talk tries again quietly', () => {
  it('says the link is down once, without a technical reason, answers by the rules for thirty seconds, then asks again', async () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const llm = flaky()
    const engine = new Engine(content, { seed: 4, llm })
    engine.tick(((10 * 60 - (engine.world.now % DAY)) + DAY) % DAY)
    Object.assign(engine.state.npcs['npc_mirte']!, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
    await engine.handle('talk mirte')
    const first = said(await engine.handle('What bread do you have today?'))
    expect(first).toContain(LINK_DOWN)
    expect(first).not.toMatch(/503|overloaded|\(No answer/)
    const asked = llm.calls.length
    // Within the thirty seconds: the rules answer, the model is not asked, and nothing more is said of it.
    now += 10_000
    const second = said(await engine.handle('And is there any rye?'))
    expect(llm.calls.length).toBe(asked)
    expect(second).not.toContain(LINK_DOWN)
    // After them, a quiet try; the link is back, and that is said once.
    now += 25_000
    llm.up = true
    const third = said(await engine.handle('What happened to the mill?'))
    expect(llm.calls.length).toBeGreaterThan(asked)
    expect(third).toContain(LINK_BACK)
    expect(said(await engine.handle('Who is the miller?'))).not.toContain(LINK_BACK)
  }, 30_000)
})

describe('M10.29 V (b): going by the words Bram used', () => {
  async function inPortVesper(where: string) {
    const engine = new Engine(quietReach, { seed: 7, builder: true })
    engine.start()
    await engine.handle(`@goto ${where}`)
    return engine
  }

  it('GO OUTSIDE takes the way out, GO COMMON ROOM finds the Commons, and saying where you are says so', async () => {
    const engine = await inPortVesper('loc_commons')
    await engine.handle('go outside')
    expect(engine.state.player.location).toBe('loc_coastal_service_path')
    await engine.handle('go in')
    await engine.handle('go northwest')
    expect(engine.state.player.location).toBe('loc_workshop')
    await engine.handle('go common room')
    expect(engine.state.player.location).toBe('loc_commons')
    expect(said(await engine.handle('go common room'))).toBe('You are here already: Commons.')
  })

  it('WALK TO a place a door away goes by the door, and WALK TO a map cell from indoors goes out first', async () => {
    const engine = await inPortVesper('loc_commons')
    // Bram had been in the Workshop: it is a place he knows.
    await engine.handle('go northwest')
    await engine.handle('go southeast')
    const walked = said(await engine.handle('walk to workshop'))
    expect(engine.state.player.location).toBe('loc_workshop')
    expect(walked).not.toMatch(/You make your way/)
    const out = said(await engine.handle('walk to 5,6'))
    expect(out).not.toMatch(/can't strike out across country/)
    expect(engine.state.player.location).not.toBe('loc_workshop')
  })

  it('SIT and FLY say what can be done here instead', async () => {
    const engine = await inPortVesper('loc_commons')
    const sit = said(await engine.handle('sit'))
    expect(sit).toMatch(/^You can't "sit" here\. Here you could go [^.]*out[^.]*\. HELP lists every command\.$/)
    expect(said(await engine.handle('fly'))).toMatch(/Here you could go/)
  })
})

describe('M10.29 V (d): a thing handed across in words is a deed', () => {
  it('knows "slides his notebook across" and "holds out a ration bar", and lets a handshake and the weather be', () => {
    for (const deed of ['Niko slides his notebook across the table.', 'She pushes the tablet toward you.', 'He hands the key to you.', 'Niko holds out a ration bar.']) expect(promises(deed)).toBe(true)
    for (const words of ['The fog passes over the ridge.', 'Niko holds out his hand.', 'Mara passes the salt to Ilyan.', 'She gives a short laugh.']) expect(promises(words)).toBe(false)
  })
})
