import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { chapterStep, documentChapters, DOCUMENT_STEPS, draftResult, faithfulness, mergeFix, newWorldFiles, readDraft, rootedFile, STEP_CALLS, stepMaxTokens, withSafety, worldFixRequest, worldKeys, worldStepRequest, WORLD_STEPS, type LlmRequest } from '../src/engine'
import { MockLlm } from '../src/engine/dialogue/mock'
import { buildTrial, recordedDocument } from '../src/main/trial'
import { costUsd } from '../src/node/ai/pricing'
import { systemBlocks, takesEffort } from '../src/node/ai/providers'
import { readContentFiles } from '../src/node/content'

// M10.20: the world build costs less without the world getting worse (the build
// of The Quiet Reach cost 10.09 dollars on Opus 5.5). The part of a step that
// stays the same is cached for an hour, a step is shown only the keys and kinds
// it needs, and writes, thinks and is answered by the model its kind needs.

const root = resolve(import.meta.dirname, '..')
const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})
const fixed = (r: LlmRequest) => r.system.slice(0, r.cacheBreak)
// Bram's document of The Quiet Reach, as the recordings of its build keep it (M10.25: his own text is not in the repo).
const reach = () => recordedDocument(resolve(root, 'tests/fixtures/worldbuild/quiet-reach'))!

describe('M10.20: the world steps are cached and measured', () => {
  it('puts what stays the same first, the same for every step and after every step', async () => {
    const files = await readContentFiles(resolve(root, 'content'), 'quietreach')
    const requests = WORLD_STEPS.map((s) => worldStepRequest(files, s.id, 'A chapter.'))
    const first = fixed(requests[0]!)
    expect(first.length).toBeGreaterThan(20000)
    for (const r of requests) {
      expect(fixed(r)).toBe(first)
      expect(r.cacheHour).toBe(true)
    }
    // The step, its fields and the design log change, so they come after the cache mark.
    expect(first).toContain('WHAT A WORLD CAN HAVE')
    expect(first).not.toContain('THE STEPS:')
    expect(first).not.toContain('WHAT THE DESIGNER HAS SAID AND DECIDED BEFORE')
    expect(first).not.toMatch(/This world has \d+|Empty now:/)
    const places = requests[WORLD_STEPS.findIndex((s) => s.id === 'places')]!
    expect(places.system.slice(places.cacheBreak)).toContain('HOW A PLACE READS')
    // A world with one more place reads the same cached part; its counts go with the step.
    const more = [...files, { path: 'quietreach/areas/extra.yaml', text: 'locations:\n  - id: loc_extra\n    name: Extra\n    area: nacre\n    description: { day: A room. }\n' }]
    expect(fixed(worldStepRequest(more, 'people', 'x'))).toBe(first)
    expect(worldStepRequest(files, 'people', 'x').prompt).toMatch(/THIS WORLD HAS NOW: .*locations 11/)
    // The hard limits come in front for every call, and the mark moves with them.
    const safe = withSafety(requests[0]!)
    expect(safe.system.slice(safe.cacheBreak).startsWith('THE STEPS:')).toBe(true)
    // A round to put it right reads the same cached part.
    expect(fixed(worldFixRequest(files, 'people', 'x', { changes: [] }, ['x: wrong']))).toBe(first)
  }, 60_000)

  it('sends Anthropic the fixed part with an hour-long cache mark and the rest after it', () => {
    const blocks = systemBlocks({ system: 'FIXED\nSTEP', cacheBreak: 6, cacheHour: true })
    expect(blocks).toEqual([
      { type: 'text', text: 'FIXED\n', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: 'STEP' },
    ])
    expect(systemBlocks({ system: 'ALL' })).toEqual([{ type: 'text', text: 'ALL', cache_control: { type: 'ephemeral' } }])
    expect(takesEffort('claude-opus-5-5')).toBe(true)
    expect(takesEffort('claude-sonnet-5')).toBe(true)
    expect(takesEffort('claude-haiku-4-5-20251001')).toBe(false)
    // An hour in the cache costs twice the input, five minutes 1.25 times.
    const hour = costUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0, cacheWriteTokens: 1_000_000, cacheWriteHourTokens: 1_000_000 })
    const five = costUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0, cacheWriteTokens: 1_000_000 })
    expect(hour).toBeCloseTo(8)
    expect(five).toBeCloseTo(5)
  })

  it('shows a step only the keys of world.yaml it needs, and gives it its own measure, effort and model', async () => {
    const files = await readContentFiles(resolve(root, 'content'), 'quietreach')
    const calendar = worldStepRequest(files, 'calendar', 'Thirteen months.')
    expect(calendar.prompt).toMatch(/WORLD\.YAML NOW \(the keys this step needs\):\nworld:\n {2}id: quietreach/)
    expect(calendar.prompt).toContain('  weather:')
    expect(calendar.prompt).not.toContain('  pictures:')
    expect(calendar.prompt).toMatch(/# not shown here: .*map/)
    expect(calendar).toMatchObject({ effort: 'low', tier: 'light' })
    const places = worldStepRequest(files, 'places', 'A port.')
    expect(places).toMatchObject({ effort: 'medium' })
    expect(places).not.toHaveProperty('tier')
    expect(places.prompt).not.toContain('  weather:')
    expect(places.prompt).not.toMatch(/^professions: /m)
    expect(worldStepRequest(files, 'people', 'x').prompt).toMatch(/^professions: /m)
    // The most a step writes grows with the chapter, up to 48,000.
    expect(stepMaxTokens('frame', '')).toBe(STEP_CALLS.frame.maxTokens)
    expect(stepMaxTokens('places', 'x'.repeat(6000))).toBe(16000 + 9000)
    expect(stepMaxTokens('people', 'x'.repeat(100000))).toBe(48000)
    expect(worldKeys('not: [yaml', ['x'])).toBe('not: [yaml')
  })

  it('reads a designer\'s document in chapters and finds the step of each, in the old order too', () => {
    // Bram's twelve chapters, in the order he wrote them.
    const titles = ['Frame', 'Calendar and weather', 'Currency', 'Faith and belief', 'Places', 'Professions', 'People', 'Economy', 'Transport', 'Signals and dangers', 'Voice', 'Palette']
    const chapters = documentChapters(titles.map((t, i) => `${i + 1} ${t}\nWhat the designer says.`).join('\n\n'))
    expect(chapters.map((c) => chapterStep(c.title))).toEqual(['frame', 'calendar', 'money', 'faiths', 'places', 'professions', 'people', 'economy', 'passages', 'watcher', 'voice', 'palette'])
    expect(chapters[3]!.title).toBe('Faith and belief')
    // The same chapters again from the recordings, in the order of the steps, each with the text it was played with.
    const recorded = documentChapters(reach())
    expect(recorded.map((c) => c.title).sort()).toEqual([...titles].sort())
    expect(recorded.map((c) => chapterStep(c.title))).toEqual(DOCUMENT_STEPS.map((s) => s.id).filter((s) => s !== 'lands'))
    expect(recorded.find((c) => c.title === 'Frame')!.text).toMatch(/^Genre, tone and boundaries\nThe world is called The Quiet Reach/)
    const faith = faithfulness('The coin is the Belt credit. It has 100 bits.', { say: '', changes: [{ kind: 'item', id: 'x', yaml: 'name: credit\nprice: 100' }] })
    expect(faith).toEqual({ named: 2, kept: 1, missing: ['Belt'] })
  })

  it('puts back the top-level key of a whole voice kit that a proposal left out', () => {
    // The voice step on the lighter model (the trial run of 29 September 2026) wrote the kit's fields at the root.
    const bare = 'sayings:\n  - Hold pressure.\ntime:\n  - shift\n'
    expect(rootedFile('data/voice.yaml', bare)).toBe('voice:\n  sayings:\n    - Hold pressure.\n  time:\n    - shift\n')
    expect(rootedFile('data/voice.yaml', 'voice:\n  sayings: []\n')).toBe('voice:\n  sayings: []\n')
    expect(rootedFile('data/voice.yaml', 'sayings: []\nweather: {}\n')).toBe('sayings: []\nweather: {}\n')
    expect(rootedFile('CHRONICLER.md', 'time: x')).toBe('time: x')
    const result = draftResult(newWorldFiles('reach', 'The Reach'), { changes: [], files: [{ path: 'data/voice.yaml', text: bare }] })
    expect(result.problems).toEqual([])
    expect(result.content?.voice?.sayings).toEqual(['Hold pressure.'])
  })

  it('keeps a correction of a change that adds to a thing an addition', async () => {
    // The trial run's palette step added to a region; the round to put it right sent the region back
    // without merge, with only those fields, so the region lost its places, size and legend.
    const files = await readContentFiles(resolve(root, 'content'), 'isle')
    const add = { kind: 'area', id: 'skerrow', yaml: 'summary: "A rock: wet"\n', merge: true }
    const draft = readDraft(files, JSON.stringify({ say: 'x', questions: [], changes: [{ ...add, yaml: 'summary: [broken\n' }], world: '', files: [] }))
    expect(draft.result?.ok).not.toBe(true)
    const fixed = mergeFix(files, draft, JSON.stringify({ say: 'Quoted it.', questions: [], changes: [{ kind: 'area', id: 'skerrow', yaml: add.yaml }], world: '', files: [] }))
    expect(fixed.changes).toEqual([expect.objectContaining({ kind: 'area', id: 'skerrow', merge: true })])
    expect(fixed.problems).toEqual([])
    expect(fixed.result?.content?.areas.get('skerrow')?.name).toBe('Skerrow')
    expect(worldFixRequest(files, 'palette', 'x', draft, ['x']).system).toContain('a change that had merge: true again with merge: true')
  })

  it('plays a whole document through the trial with the mock, records it, and plays it back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1020cost-'))
    folders.push(dir)
    const mock = new MockLlm()
    const limits: number[] = []
    const ai = { builds: { reset: () => ({}) as never, setLimit: (_w: string, usd: number) => (limits.push(usd), {}) as never }, gateway: mock }
    const document = reach()
    const lines: string[] = []
    const trial = { document, folder: 'reach_trial', name: 'The Quiet Reach', fixtures: join(dir, 'fixtures'), out: join(dir, 'out'), capUsd: 3, steps: [], sameModel: false, record: true }
    const ok = await buildTrial(ai, trial, resolve(root, 'content'), (line) => lines.push(line))
    expect(lines.filter((l) => /does not load|stopped/.test(l))).toEqual([])
    expect(ok).toBe(true)
    expect(limits).toEqual([3])
    // Bram's document has no chapter on lands (M10.23): that step is skipped, and one land it is.
    expect(readdirSync(join(dir, 'fixtures'))).toEqual([...DOCUMENT_STEPS.map((s, i) => `${String(i + 1).padStart(2, '0')}-${s.id}.json`).filter((f) => !f.endsWith('-lands.json')), 'build.json'])
    const frame = JSON.parse(readFileSync(join(dir, 'fixtures/01-frame.json'), 'utf8')) as Record<string, unknown>
    expect(frame).toMatchObject({ build: 'reach_trial', step: 'frame', chapter: 'Frame', model: 'mock-1', provider: 'mock' })
    expect(JSON.stringify(frame)).not.toMatch(/usd|cost/i)
    expect(readFileSync(join(dir, 'out/content/reach_trial/DESIGN.md'), 'utf8')).toContain('accepted')
    // Only the palette asked again; the other steps come from the recording.
    const calls = mock.calls.length
    lines.length = 0
    expect(await buildTrial(ai, { ...trial, steps: ['palette'] }, resolve(root, 'content'), (line) => lines.push(line))).toBe(true)
    expect(mock.calls.length - calls).toBe(1)
    expect(lines.filter((l) => /from the recording/.test(l))).toHaveLength(11)
  })
})
