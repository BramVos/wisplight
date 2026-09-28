import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { draftResult, LlmError, mergeFix, newWorldFiles, readDraft, WORLD_STEPS, worldFixRequest, worldStepRequest, type LlmRequest } from '../src/engine'
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
    // A text of a fixed form says which (the hours of a service came as "07:00 to 12:00").
    expect(worldStepRequest(files, 'economy', 'Meals.').system).toContain('hours: text matching /^\\d{2}(:\\d{2})?-\\d{2}(:\\d{2})?$/')
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

  it('shows a step the things it may change as they stand, so it can add to them', () => {
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    // The economy step fills places too (services, benches, forage): it sees the first place whole.
    const economy = worldStepRequest(files, 'economy', 'Meals at the Commons.').prompt
    expect(economy).toMatch(/WHAT THIS STEP MAY CHANGE, AS IT STANDS[^\n]*\n--- location loc_first_place\nid: loc_first_place\nname: The First Place/)
    expect(economy).toContain('You stand in the first place of a new world.')
    // A step that fills no kind of thing sees none.
    expect(worldStepRequest(files, 'frame', 'Cold islands.').prompt).not.toContain('AS IT STANDS')
  })

  it('adds to a thing that exists with only the fields a change sets', () => {
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    const result = draftResult(files, {
      changes: [
        // The economy step gives the first place a detail and a name to call it by, and nothing else of it.
        { kind: 'location', id: 'loc_first_place', yaml: 'aliases: [the lock]\ndetails:\n  - words: [tap]\n    look: A steel tap.\n', merge: true },
        // A merge without fields deletes nothing.
        { kind: 'area', id: 'first_area', yaml: '', merge: true },
      ],
      files: [],
    })
    expect(result.problems).toEqual([])
    const place = result.content!.locations.get('loc_first_place')!
    expect(place.aliases).toEqual(['the lock'])
    expect(place.details[0]?.words).toEqual(['tap'])
    expect(place.description.day).toMatch(/You stand in the first place of a new world/)
    expect(place.area).toBe('first_area')
    expect(result.content!.areas.has('first_area')).toBe(true)
    expect(worldStepRequest(files, 'economy', 'x').system).toContain('merge: true with only the fields you set')
  })

  it('lets the transport step write the journey whole, and says how a leg is keyed', () => {
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    const result = draftResult(files, { changes: [], files: [{ path: 'data/journey.yaml', text: 'journey:\n  night:\n    - Your lamp makes a small room of light on the wet stone.\n' }] })
    expect(result.problems).toEqual([])
    expect(result.content!.journey?.night).toEqual(['Your lamp makes a small room of light on the wet stone.'])
    const transport = worldStepRequest(files, 'passages', 'A crawler to the ridge.').system
    expect(transport).toContain('data/journey.yaml whole in `files`')
    expect(transport).toContain('keyed `<stop>><stop>` with a `>` between the ids')
  })

  it('puts right a proposal that did not load, with only what the chronicler corrects', () => {
    const files = newWorldFiles('quietreach', 'The Quiet Reach')
    const topic = (id: string, summary: string) => ({ kind: 'topic' as const, id, yaml: `id: ${id}\nname: ${id}\nkind: lore\nsummary: ${summary}\n` })
    // One good topic, one with a line of YAML that does not read (People, try 2 of the real run).
    const answer = JSON.stringify({ say: 'Two things people talk about.', questions: ['Is that right?'], changes: [topic('winter_supplies', 'Whether the stores last the winter.'), topic('night_of_the_open_door', 'The night: the door stood open.')], world: '', files: [] })
    const draft = readDraft(files, answer)
    expect(draft.problems.join()).toMatch(/night_of_the_open_door: Nested mappings/)
    const request = worldFixRequest(files, 'people', 'Six people.', draft, draft.problems)
    expect(request.prompt).toContain('--- topic winter_supplies')
    expect(request.prompt).toMatch(/WHY IT DID NOT LOAD:\n- night_of_the_open_door: Nested mappings/)
    expect(request.system).toContain('Correct only what the problems name')
    expect(request.meta?.['fix']).toEqual(draft.problems)
    // An earlier failed call is not a reason it did not load.
    expect(worldFixRequest(files, 'people', 'Six people.', draft, ['The chronicler did not answer: the hourly budget is used up', ...draft.problems]).prompt).not.toContain('hourly budget')
    // The chronicler sends back only the topic it corrects.
    const fixed = mergeFix(files, draft, JSON.stringify({ say: 'Quoted the summary.', questions: [], changes: [topic('night_of_the_open_door', '"The night: the door stood open."')], world: '', files: [] }))
    expect(fixed.problems).toEqual([])
    expect(fixed.changes.map((c) => c.id)).toEqual(['winter_supplies', 'night_of_the_open_door'])
    expect(fixed.say).toBe('Two things people talk about.\n\nPut right: Quoted the summary.')
    expect(fixed.questions).toEqual(['Is that right?'])
    expect(fixed.result?.content?.topics.get('night_of_the_open_door')?.summary).toBe('The night: the door stood open.')
    // A correction never takes away: an empty change in the answer is left out.
    const emptied = mergeFix(files, draft, JSON.stringify({ say: 'Corrected.', questions: [], changes: [{ kind: 'topic', id: 'winter_supplies', yaml: '', merge: true }], world: '', files: [] }))
    expect(emptied.changes.find((c) => c.id === 'winter_supplies')?.yaml).toContain('Whether the stores last the winter.')
    // An answer out of form leaves the proposal as it was.
    expect(mergeFix(files, draft, 'sorry').problems).toEqual(['The chronicler did not answer in the agreed form; the proposal is as it was.'])
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
