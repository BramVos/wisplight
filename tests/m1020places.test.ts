import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { descriptionCheck, newWorldFiles, PLACE_RULES, placesToPolish, polishRequest, readPolish, worldStepRequest, type LlmRequest } from '../src/engine'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import type { Provider } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.20: the places of a built world read like the Nethermarch's (the first
// real build, The Quiet Reach, averaged 88 words a place against 56, named no
// topic in [brackets], listed every way out and opened each place with its
// own name). The rules go in the places step itself, the Check measures them,
// and a polish round rewrites only descriptions, as a safety net.

const root = resolve(import.meta.dirname, '../content')
const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('M10.20: places that read by the rules', () => {
  it('puts the place rules in the places step, and the voice before it', () => {
    const files = newWorldFiles('reach', 'The Reach')
    const places = worldStepRequest(files, 'places', 'A port.').system
    expect(places).toContain(PLACE_RULES)
    expect(PLACE_RULES).toContain('at most 70 words')
    expect(PLACE_RULES).toContain('Never a list of every exit')
    expect(worldStepRequest(files, 'frame', 'Cold islands.').system).not.toContain('HOW A PLACE READS')
    // The voice kit, once there, is shown to the steps that add to it, whole.
    const voiced = [...files, { path: 'reach/data/voice.yaml', text: 'voice:\n  oaths: {}\n  sayings: [Hold pressure.]\n' }]
    expect(worldStepRequest(voiced, 'faiths', 'Two faiths.').prompt).toContain('DATA/VOICE.YAML NOW (send it whole, with your part added):\nvoice:')
    expect(worldStepRequest(voiced, 'calendar', 'CR.').prompt).not.toContain('DATA/VOICE.YAML NOW')
  })

  it('measures descriptions for the Check the way the review did, in all three worlds', async () => {
    const base = descriptionCheck(await loadContentFromDir(root, 'base'))
    expect(base.summary).toMatch(/^87 places: 56 words on average .* 18 with a topic in \[brackets\]/)
    const reach = descriptionCheck(await loadContentFromDir(root, 'quietreach'))
    expect(reach.summary).toMatch(/^10 places: \d+ words on average/)
    // A proposal's own places only, compared with the whole world for openings.
    const isle = await loadContentFromDir(root, 'isle')
    const one = descriptionCheck(isle, new Set(['loc_skerrow_headland']))
    expect(one.summary).toMatch(/^1 places: 80 words on average/)
    expect(one.places).toEqual([expect.stringMatching(/^loc_skerrow_headland: 80 words; names all 3 ways out/)])
  })

  it('polishes only descriptions, of the places the Check names, and says what a place no longer names', async () => {
    const files = await readContentFiles(root, 'isle')
    const isle = await loadContentFromDir(root, 'isle')
    const request: LlmRequest = polishRequest(files)
    expect(request).toMatchObject({ role: 'chronicler', tier: 'light', schemaName: 'world_polish', meta: { step: 'polish', prefix: 'isle/' } })
    expect(request.meta?.['places']).toEqual(placesToPolish(isle))
    expect(request.system).toContain('Change only the day and night descriptions.')
    expect(request.prompt).toMatch(/--- loc_skerrow_headland: .*\nways out: /)
    expect(polishRequest(files, ['loc_skerrow_headland'], false)).not.toHaveProperty('tier')
    const headland = isle.locations.get('loc_skerrow_headland')!
    const day = 'Wind scours the bare turf of the headland, and the grass hisses flat against the rock. Far below, the sea booms in a cave you cannot see. The path back down to the [Hythe] is the only way off.'
    const polished = readPolish(files, JSON.stringify({ say: 'Shorter, one way out.', places: [{ id: 'loc_skerrow_headland', day, night: '' }, { id: 'loc_nowhere', day: 'x', night: '' }] }))
    expect(polished.changes).toEqual([expect.objectContaining({ kind: 'location', id: 'loc_skerrow_headland', merge: true })])
    expect(polished.problems).toEqual(['loc_nowhere: no such place'])
    const after = polished.result!.content!.locations.get('loc_skerrow_headland')!
    expect(after.description.day.trim()).toBe(day)
    // Everything else of the place stays: its exits, details and night.
    expect(after.exits).toEqual(headland.exits)
    expect(after.details).toEqual(headland.details)
    expect(after.description.night?.trim()).toBe(headland.description.night?.trim())
    const lost = headland.details.filter((d) => d.words.every((w) => !day.toLowerCase().includes(w.toLowerCase())))
    if (lost.length) expect(polished.say).toContain(`loc_skerrow_headland no longer names "${lost[0]!.words[0]}"`)
  })

  it('sends a light task to the model the player chose for the brain', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1020places-'))
    folders.push(dir)
    const asked: string[] = []
    const provider: Provider = { id: 'openai', listModels: async () => [], complete: async (model) => (asked.push(model), { text: '{}', provider: 'openai', model, usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0 }, latencyMs: 1 }) }
    const roles: Record<string, string> = { chronicler: 'gpt-4.1', brain: 'gpt-4.1-mini' }
    const g = new Gateway({ role: (r) => (roles[r] ? { provider: 'openai', model: roles[r]! } : undefined), provider: () => provider, budgetUsdPerHour: () => 5, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')) })
    const request: LlmRequest = { role: 'chronicler', system: 's', prompt: 'p', schemaName: 'world_polish', schema: {}, maxTokens: 100 }
    await g.complete({ ...request, tier: 'light' })
    await g.complete(request)
    expect(asked).toEqual(['gpt-4.1-mini', 'gpt-4.1'])
  })
})
