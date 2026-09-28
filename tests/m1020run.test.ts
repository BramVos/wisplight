import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { draftResult, LlmError, newWorldFiles, WORLD_STEPS, worldStepRequest, type LlmRequest } from '../src/engine'
import { WEATHER_KINDS } from '../src/engine/weather'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import type { Provider } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'

// M10.20: what the real run of The Quiet Reach in the app taught (Bram, 28
// September 2026). The calendar step asked for weather without saying which
// kinds and fields the engine knows, so the first proposal did not load; the
// Places chapter was cut off at the reply's limit, and that cut-off reply,
// paid for all the same, was logged as costing nothing. No real API is called.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('M10.20: the real run of a world', () => {
  it('tells the calendar step every kind of weather the engine knows, and the fields of the weather', () => {
    const calendar = WORLD_STEPS.find((s) => s.id === 'calendar')!
    for (const kind of WEATHER_KINDS) expect(calendar.prompt).toContain(kind)
    for (const field of ['seasons', 'chances', 'stay', 'prevailing', 'readers', 'lines']) expect(calendar.prompt).toContain(field)
    expect(calendar.prompt).toMatch(/from 0 to 1/)
  })

  it('gives every step the exact fields of what it fills, nested ones and allowed values too', () => {
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    const places = worldStepRequest(files, 'places', 'A port.').system
    // Details were written with "id" and "names" when only the kind was named.
    expect(places).toContain('details?: list of { words: list of text; look: text; take?: text; verbs?: a map of names to text }')
    expect(places).toMatch(/SHAPE \d+: \(\{ flag: text/)
    const calendar = worldStepRequest(files, 'calendar', 'Thirteen months.').system
    expect(calendar).toContain('stay?: number from 0 to 1')
    expect(calendar).toContain('a map of names to a map of clear | overcast | rain | fog | storm | frost | snow to number from 0')
    // A shape inside itself (conditions of conditions) is not opened without end.
    for (const step of WORLD_STEPS) {
      const system = worldStepRequest(files, step.id, 'x').system
      expect(system, step.id).not.toMatch(/a map or a map/)
      expect(system.length, step.id).toBeLessThan(60000)
    }
  })

  it('loads a first proposal of places that moves the start, deletes the placeholder and writes each way once', () => {
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    const place = (id: string, exits: Record<string, { to: string; minutes?: number }>) => ({
      kind: 'location' as const,
      id,
      yaml: `id: ${id}\nname: ${id}\narea: port_vesper\ndescription:\n  day: You stand here. It smells of salt. A way leads on.\nexits: ${JSON.stringify(exits)}\n`,
    })
    const result = draftResult(files, {
      changes: [
        { kind: 'location', id: 'loc_first_place', yaml: '' },
        { kind: 'area', id: 'first_area', yaml: '' },
        { kind: 'area', id: 'port_vesper', yaml: 'id: port_vesper\nname: Port Vesper\nkind: village\nsummary: A small port.\n' },
        place('loc_arrival_lock', { north: { to: 'loc_commons', minutes: 2 }, east: { to: 'loc_workshop', minutes: 5 } }),
        place('loc_commons', { southeast: { to: 'loc_workshop', minutes: 4 } }),
        place('loc_workshop', {}),
      ],
      world: 'start: { location: loc_arrival_lock, year: 186, month: 9, day: 18, hour: 8 }',
      files: [],
    })
    expect(result.problems).toEqual([])
    const workshop = result.content!.locations.get('loc_workshop')!
    expect(workshop.exits).toMatchObject({ west: { to: 'loc_arrival_lock', minutes: 5 }, northwest: { to: 'loc_commons', minutes: 4 } })
    expect(result.content!.locations.get('loc_commons')!.exits).toMatchObject({ south: { to: 'loc_arrival_lock', minutes: 2 } })
  })

  it('counts a reply cut off at its limit in the budget and the log, with what it cost', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1020run-'))
    folders.push(dir)
    // 1,000,000 tokens in at $0.40 and 100,000 out at $1.60 a million: $0.56, paid for a reply that never came.
    const cutOff: Provider = { id: 'openai', listModels: async () => [], complete: async () => Promise.reject(new LlmError('invalid', 'reply was cut off', { inputTokens: 1_000_000, outputTokens: 100_000, cachedTokens: 0 })) }
    const log = new AiLog()
    const g = new Gateway({ role: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }), provider: () => cutOff, budgetUsdPerHour: () => 5, log, usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')) })
    const request: LlmRequest = { role: 'chronicler', system: 's', prompt: 'p', schemaName: 'world_step', schema: {}, maxTokens: 32000, timeoutMs: 600000 }
    await expect(g.complete(request)).rejects.toMatchObject({ kind: 'invalid' })
    expect(g.status().hourSpentUsd).toBeCloseTo(0.56, 6)
    expect(log.recent()[0]).toMatchObject({ ok: false, error: 'invalid: reply was cut off', inputTokens: 1_000_000, outputTokens: 100_000 })
    expect(log.recent()[0]?.costUsd).toBeCloseTo(0.56, 6)
  })
})
