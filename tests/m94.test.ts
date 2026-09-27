import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Engine, MockLlm, runSituation, type LlmClient, type LlmRequest } from '../src/engine'
import { REPLY_WITHIN_MS } from '../src/engine/dialogue/conversation'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import type { Provider } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M9.4 (docs/ROADMAP.md): finishing and release. The non-functional
// requirements of FO chapter 18, measured where a test can measure them.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')

const folders: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-m94-'))
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('M9.4: a reply within six seconds, or the set line', () => {
  it('gives the second try only what is left of the six seconds', async () => {
    const good = new MockLlm('good')
    const leaky = new MockLlm('leak')
    const timeouts: number[] = []
    const client: LlmClient = {
      complete: async (r: LlmRequest) => {
        if (r.role !== 'voice') return good.complete(r)
        timeouts.push(r.timeoutMs ?? Infinity)
        // The first reply is slow and names what the speaker cannot know: it is asked again.
        await new Promise((done) => setTimeout(done, 120))
        return (timeouts.length === 1 ? leaky : good).complete(r)
      },
    }
    await runSituation(content, { id: 'mirte_local', npc: 'npc_mirte', lines: ['What happened to the mill?'] }, client)
    expect(timeouts[0]).toBeLessThanOrEqual(REPLY_WITHIN_MS)
    expect(timeouts[0]).toBeGreaterThan(REPLY_WITHIN_MS - 100)
    if (timeouts.length > 1) expect(timeouts[1]).toBeLessThanOrEqual(REPLY_WITHIN_MS - 120)
  })

  it('the gateway fails a call at once when no time is left, and stops a call that runs over', async () => {
    const dir = temp()
    const slow: Provider = {
      id: 'openai',
      listModels: async () => [],
      complete: (model, _r, signal) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ text: '{}', provider: 'openai', model, usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0 }, latencyMs: 300 }), 300)
          signal?.addEventListener('abort', () => (clearTimeout(timer), reject(new Error('aborted'))))
        }),
    }
    const gateway = new Gateway({ role: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }), provider: () => slow, budgetUsdPerHour: () => 1, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')) })
    const request: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 20 }
    await expect(gateway.complete({ ...request, timeoutMs: 0 })).rejects.toMatchObject({ kind: 'timeout' })
    const t = Date.now()
    await expect(gateway.complete({ ...request, timeoutMs: 50 })).rejects.toMatchObject({ kind: 'timeout' })
    expect(Date.now() - t).toBeLessThan(250)
    await expect(gateway.complete(request)).resolves.toMatchObject({ text: '{}' })
  })
})

describe('M9.4: what the playtest of the storylines found', () => {
  const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
  const game = () => new Engine(content, { seed: 7, builder: true })

  it('puts the people and places a quest names in the journal, as heard of from the one who asked', async () => {
    const engine = game()
    for (const c of ['north', 'east', 'talk mirte', 'bye']) await engine.handle(c)
    const journal = engine.state.player.journal ?? {}
    expect(journal['npc_lubbert']).toBeDefined()
    expect(Object.keys(journal).some((id) => /waagdam/.test(id))).toBe(true)
    expect(engine.state.player.sources?.['npc_lubbert']?.[0]?.from).toBe('npc_mirte')
    // One entry for one name: the news of the missing girl, not the girl twice.
    await engine.handle('west')
    await engine.handle('west')
    const names = Object.keys(engine.state.player.journal ?? {}).filter((id) => id === 'fenna' || id === 'npc_fenna')
    expect(names).toHaveLength(1)
  })

  it('says who is away when a quest action is for someone who is not here', async () => {
    const engine = game()
    for (const c of ['north', 'east', 'talk mirte', 'bye', '@give rye_grain 3', 'west']) await engine.handle(c)
    expect(said(await engine.handle('give three sacks of rye to mirte'))).toBe("Mirte isn't here.")
    await engine.handle('@bring mirte')
    expect(said(await engine.handle('give three sacks of rye to mirte'))).toMatch(/Rye!/)
  })

  it('in a conversation, asking about something reaches the quest of the one you talk to', async () => {
    const engine = game()
    for (const c of ['north', 'west', 'east', 'north', 'west', 'talk aaltje']) await engine.handle(c)
    const out = said(await engine.handle('ask about the cat'))
    expect(out).toMatch(/That's Kaatje's work/)
    expect(engine.state.questlog?.['grey_cat_on_the_doorstep']?.stage).toBe('the_cat_is_fenna')
  })

  it('stops waiting when someone a quest needs comes by', async () => {
    const engine = game()
    for (const c of ['north', 'west', '@flag cat_is_fenna', '@goto loc_kattenbroek_hut', '@time 9']) await engine.handle(c)
    const start = engine.world.now
    const out = said(await engine.handle('wait 8 hours'))
    expect(out).toMatch(/Kaatje is here\. You stop waiting\./)
    expect(engine.world.now - start).toBeLessThan(8 * 60)
    expect(engine.world.npcsAt(engine.state.player.location)).toContain('npc_kaatje')
  })

  it('lets someone come upon a leak, and the news finds its way; the player can pass it on', async () => {
    const engine = new Engine(content, { seed: 1, builder: true })
    await engine.handle('@plan dyke_leak')
    const leak = engine.state.news!.facts.find((f) => f.claim?.value === 'leaking')!
    // Teunis came upon it on the dyke road, wherever he is now.
    expect(engine.state.news!.heard['npc_teunis']![leak.id]).toBeDefined()
    for (const c of ['@goto loc_waagdam_horse_mill', '@time 9', 'talk teunis', '2', 'bye']) await engine.handle(c)
    expect(engine.state.news!.heard['player']![leak.id]).toBeDefined()
    // Where it happened is heard of now: the stranger can walk there.
    expect(Object.keys(engine.state.player.journal ?? {}).some((id) => /oude_zijl/.test(id))).toBe(true)
    for (const c of ['@goto loc_oude_zijl_dykehouse', 'wait for sijbrand']) await engine.handle(c)
    const told = said(await engine.handle('tell sijbrand about the dyke'))
    expect(told).toMatch(/The dyke's leaking at Oude Zijl/)
    const theirs = engine.state.news!.heard['npc_sijbrand']![leak.id]!
    expect(theirs.from).toBe('player')
  })

  it('tells the news of an area to the player there, once, and shows a place changing around them', async () => {
    const engine = game()
    await engine.handle('north')
    const out = said(await engine.handle('@plan dyke_breach'))
    const later = said(engine.tick(90))
    expect(`${out}\n${later}`).toMatch(/The dyke at Oude Zijl has broken, and the water is in Veenhoek\./)
    expect(`${out}\n${later}`).toMatch(/Water comes in, brown and cold/)
    expect(said(engine.tick(60))).not.toMatch(/The dyke at Oude Zijl has broken/)
  })

  it('does not tell the stranger their own coming as news', async () => {
    const engine = game()
    for (const c of ['@goto loc_goose_common', '@time 19']) await engine.handle(c)
    const someone = engine.world.npcsAt(engine.state.player.location).find((id) => engine.world.npcState(id).activity !== 'asleep')!
    const name = engine.world.npc(someone).short.toLowerCase()
    for (const c of [`talk ${name}`]) await engine.handle(c)
    expect(said(await engine.handle('2'))).not.toMatch(/stranger from Graafhaven came/)
  })

  it('says someone named is not here, rather than speaking to whoever is', async () => {
    const engine = game()
    await engine.handle('north')
    expect(said(await engine.handle('tell sijbrand about the dyke'))).toBe("Sijbrand isn't here.")
  })

  it('waits for someone, and stops when they come', async () => {
    const engine = game()
    for (const c of ['@goto loc_veenhoek_bakery', '@time 3']) await engine.handle(c)
    const out = said(await engine.handle('wait for mirte'))
    expect(out).toMatch(/Mirte is here\./)
    expect(engine.world.npcsAt('loc_veenhoek_bakery')).toContain('npc_mirte')
  })

  it('on Skerrow: takes all there is, waits for a sleeper to wake, and lights the beacon once the oil is in', async () => {
    const engine = new Engine(isle, { seed: 7, builder: true })
    expect(said(await engine.handle('take all'))).toMatch(/You pick up a cask of lamp oil, a coil of rope and a bolt of sailcloth\./)
    for (const c of ['@goto loc_skerrow_headland', 'take all', '@give lamp_oil 1', 'fill the beacon']) await engine.handle(c)
    expect(engine.state.flags?.['beacon_fuelled']).toBe(true)
    const waited = said(await engine.handle('wait for garrick'))
    expect(waited).toMatch(/Garrick is here\./)
    expect(engine.world.npcState('npc_garrick').activity).not.toBe('asleep')
    // With the oil in, a lower mark: a few tries do it.
    for (let i = 0; i < 12 && !engine.state.flags?.['garrick_ready']; i++) {
      await engine.handle('ask garrick to tend the beacon')
      if (!engine.state.flags?.['garrick_ready']) await engine.handle('wait 30')
    }
    expect(engine.state.flags?.['garrick_ready']).toBe(true)
    expect(said(await engine.handle('light the beacon'))).toMatch(/green lens/)
  })

  it('answers about someone dead with the death, and knows its own goods when the thief brings them back', async () => {
    const engine = new Engine(isle, { seed: 7, builder: true })
    for (const c of ['@goto loc_skerrow_salt_kettle', '@time 12', '@kill wenna drowned off the harbour wall', 'wait 2 hours', 'talk maren']) await engine.handle(c)
    expect(said(await engine.handle('ask about wenna'))).toMatch(/Wenna is dead/)
    await engine.handle('bye')
    const thief = new Engine(isle, { seed: 7, builder: true })
    for (const c of ['@goto loc_skerrow_salt_kettle', '@time 2', 'steal pitch', 'wait 6 hours', 'talk maren']) await thief.handle(c)
    expect(said(await thief.handle('give pitch to maren'))).toMatch(/That's mine/)
    expect(thief.state.crimes?.[0]?.returned).toBe(true)
    // A sentence that starts with "I" is said, not the inventory.
    expect(said(await thief.handle('I am sorry. I took it in the night.'))).not.toMatch(/You carry/)
  })

  it('says there is nobody to ask when nobody is there', async () => {
    const engine = game()
    await engine.handle('@goto loc_kattenbroek_edge')
    expect(said(await engine.handle('where is lubbert'))).toMatch(/There is nobody here to ask/)
  })
})
