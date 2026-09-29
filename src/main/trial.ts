import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { chapterStep, documentChapters, faithfulness, mergeFix, newWorldFiles, playWorldStep, readDraft, worldFixRequest, worldStepRequest, WORLD_STEPS, type ContentFile, type LlmRequest, type WorldStep } from '../engine'
import { LlmError, type LlmResponse } from '../engine/dialogue/llm'
import { askAdvice, testCall } from '../node/ai/advisor'
import { costUsd } from '../node/ai/pricing'
import { listWorlds, loadContentFromDir, readContentFiles } from '../node/content'
import { kindSituation } from '../engine/trials'
import { measuring, playRegion, regionReport, REGION_SETTINGS, type RegionSetting, type RegionTally } from '../node/regionplay'
import type { BuildStore } from '../node/ai/builds'
import type { AiService } from '../node/ai/service'

/** What a trial needs of the AI service: the gateway and the build budgets (a test gives it the mock). */
export type TrialAi = { builds: Pick<BuildStore, 'reset' | 'setLimit'>; gateway: { complete(request: LlmRequest): Promise<LlmResponse> } }

// WISPLIGHT_TRIAL (M10.20; Bram, 28 September 2026: every kind of model call
// is really tried, and that is written down). Runs in the app with the key
// and the models the player chose, never in CI; `npm run trial` starts it.
// Prints what it did and what it cost, never a key. The world build plays a
// designer's document step by step as the editor does, in a world that lives
// only in memory, within a build budget of its own, and records each real
// reply as a fixture for the tests.

export interface BuildTrial {
  /** The designer's document, with chapters "<n> <Title>". */
  document: string
  /** Where it is, relative to the app, for the record. */
  documentPath?: string
  /** The world's folder and name, as the editor makes a new world. */
  folder: string
  name: string
  /** tests/fixtures/worldbuild/<build>: where each reply is kept, and read from for the steps not played. */
  fixtures: string
  /** Where the world as built and the measurement go. */
  out: string
  capUsd: number
  /** Only these steps go to the model; the others are played from their fixtures. All when empty. */
  steps: string[]
  /** Every step on the chronicler's own model, the light ones too (the comparison of M10.20). */
  sameModel: boolean
  /** Keep the replies as fixtures. */
  record: boolean
}

export interface StepMeasure {
  step: string
  model: string
  effort?: string
  calls: number
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
  costUsd: number
  secs: number
  loads: boolean
  problems: string[]
  named: number
  kept: number
  missing: string[]
}

interface Fixture {
  build: string
  step: string
  chapter: string
  said: string
  model: string
  provider: string
  date: string
  effort?: string
  reply: string
  fix?: string | string[]
  usage: { inputTokens: number; cachedTokens: number; cacheWriteTokens: number; outputTokens: number }
}

// The player's own day, not UTC's.
const today = () => new Date().toLocaleDateString('sv-SE')

/** The world build of a document, played through the gateway; true when every step loaded. */
export async function buildTrial(ai: TrialAi, trial: BuildTrial, root: string, say: (line: string) => void): Promise<boolean> {
  const chapters = documentChapters(trial.document)
  const said = new Map<WorldStep['id'], { title: string; text: string }>()
  for (const c of chapters) {
    const step = chapterStep(c.title)
    if (step && !said.has(step)) said.set(step, { title: c.title, text: c.text })
  }
  const chronicler = readFileSync(join(root, 'CHRONICLER.md'), 'utf8')
  let files: ContentFile[] = [...newWorldFiles(trial.folder, trial.name), { path: 'CHRONICLER.md', text: chronicler }]
  // Its own budget, as a build in the editor has: the gateway stops at it.
  ai.builds.reset(trial.folder)
  ai.builds.setLimit(trial.folder, trial.capUsd)
  mkdirSync(trial.out, { recursive: true })
  // What the recordings are of, for the test that plays them back.
  if (trial.record) {
    mkdirSync(trial.fixtures, { recursive: true })
    writeFileSync(join(trial.fixtures, 'build.json'), `${JSON.stringify({ folder: trial.folder, name: trial.name, document: trial.documentPath ?? '' }, null, 2)}\n`)
  }
  const measures: StepMeasure[] = []
  let all = true
  for (const [i, step] of WORLD_STEPS.entries()) {
    const chapter = said.get(step.id)
    if (!chapter) {
      say(`${step.id}: no chapter, skipped`)
      continue
    }
    // A recording is found by its step, whatever number it had when the guide had fewer steps (M10.23 added Lands).
    const had = existsSync(trial.fixtures) ? readdirSync(trial.fixtures).find((f) => f.endsWith(`-${step.id}.json`)) : undefined
    const kept = join(trial.fixtures, had ?? `${String(i + 1).padStart(2, '0')}-${step.id}.json`)
    if (trial.steps.length && !trial.steps.includes(step.id)) {
      if (!existsSync(kept)) {
        say(`${step.id}: not asked and no recorded reply; stopped`)
        return false
      }
      const fixture = JSON.parse(readFileSync(kept, 'utf8')) as Fixture
      const played = playWorldStep(files, step.id, fixture.said, fixture.reply, fixture.fix)
      say(`${step.id}: from the recording of ${fixture.date} (${fixture.model}), ${played.accepted ? 'loads' : `does not load: ${played.draft.problems.slice(0, 3).join('; ')}`}`)
      files = played.files
      continue
    }
    const measure: StepMeasure = { step: step.id, model: '', calls: 0, inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0, secs: 0, loads: false, problems: [], named: 0, kept: 0, missing: [] }
    let provider = ''
    const ask = async (request: LlmRequest): Promise<string> => {
      const asked: LlmRequest = trial.sameModel ? { ...request } : request
      if (trial.sameModel) delete asked.tier
      const started = Date.now()
      const response = await ai.gateway.complete(asked)
      measure.calls += 1
      measure.model = response.model
      provider = response.provider
      measure.effort = request.effort
      measure.inputTokens += response.usage.inputTokens
      measure.cachedTokens += response.usage.cachedTokens
      measure.cacheWriteTokens += response.usage.cacheWriteTokens ?? 0
      measure.outputTokens += response.usage.outputTokens
      measure.costUsd += costUsd(response.model, response.usage) ?? 0
      measure.secs += Math.round((Date.now() - started) / 1000)
      return response.text
    }
    let reply = ''
    const fix: string[] = []
    try {
      reply = await ask(worldStepRequest(files, step.id, chapter.text))
      let draft = readDraft(files, reply)
      // Put right as the editor offers it, at most twice, while the proposal does not load.
      for (let round = 1; round <= 2 && !draft.result?.ok && draft.changes.length + (draft.world ? 1 : 0) + (draft.files?.length ?? 0) > 0; round++) {
        say(`${step.id}: does not load (${draft.problems.slice(0, 3).join('; ')}); round ${round} to put it right`)
        const text = await ask(worldFixRequest(files, step.id, chapter.text, draft, draft.problems))
        fix.push(text)
        draft = mergeFix(files, draft, text)
      }
    } catch (error) {
      measure.problems.push(error instanceof LlmError ? `${error.kind}: ${error.message}` : String(error))
      measures.push(measure)
      say(`${step.id}: stopped: ${measure.problems[0]}`)
      all = false
      break
    }
    const played = playWorldStep(files, step.id, chapter.text, reply, fix)
    const faith = faithfulness(chapter.text, played.draft)
    Object.assign(measure, { loads: played.accepted, problems: played.accepted ? [] : played.draft.problems, named: faith.named, kept: faith.kept, missing: faith.missing })
    measures.push(measure)
    say(`${step.id}: ${measure.model}${measure.effort ? ` (${measure.effort})` : ''}, ${measure.calls} call${measure.calls === 1 ? '' : 's'}, in ${measure.inputTokens} (cached ${measure.cachedTokens}, written ${measure.cacheWriteTokens}), out ${measure.outputTokens}, $${measure.costUsd.toFixed(3)}, ${measure.secs}s, ${played.accepted ? 'loads' : `does not load: ${played.draft.problems.slice(0, 3).join('; ')}`}; names kept ${faith.kept}/${faith.named}`)
    if (trial.record) {
      const fixture: Fixture = { build: trial.folder, step: step.id, chapter: chapter.title, said: chapter.text, model: measure.model, provider, date: today(), ...(measure.effort ? { effort: measure.effort } : {}), reply, ...(fix.length ? { fix: fix.length === 1 ? fix[0]! : fix } : {}), usage: { inputTokens: measure.inputTokens, cachedTokens: measure.cachedTokens, cacheWriteTokens: measure.cacheWriteTokens, outputTokens: measure.outputTokens } }
      writeFileSync(kept, `${JSON.stringify(fixture, null, 2)}\n`)
    }
    if (!played.accepted) all = false
    files = played.files
  }
  // The world as built, to look at, and the measurement.
  for (const file of files) {
    if (file.path === 'CHRONICLER.md') continue
    const path = join(trial.out, 'content', file.path)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, file.text)
  }
  writeFileSync(join(trial.out, 'measure.json'), `${JSON.stringify(measures, null, 2)}\n`)
  const total = measures.reduce((sum, m) => sum + m.costUsd, 0)
  say(`total: ${measures.length} steps asked, $${total.toFixed(3)}, ${measures.filter((m) => m.loads).length} load; world in ${trial.out}`)
  return all
}

/** The recorded builds, for the coverage table: tests/fixtures/worldbuild/<build>/<nn>-<step>.json. */
export function recordedBuilds(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((d) => !d.startsWith('.')) : []
}

/**
 * The trial asked for in WISPLIGHT_TRIAL: a kind of model call, or several
 * separated by commas. The world build takes its settings from
 * WISPLIGHT_TRIAL_DOC, _BUILD, _CAP (dollars, default 1), _STEPS, _SAME_MODEL,
 * _RECORD and _OUT, which npm run trial sets from its arguments.
 */
export async function trialRun(ai: AiService, kinds: string, contentRoot: string, appPath: string, say: (line: string) => void): Promise<boolean> {
  const env = (name: string) => process.env[`WISPLIGHT_TRIAL_${name}`] ?? ''
  const cap = Math.max(0.01, Math.min(Number(env('CAP')) || 1, 20))
  let ok = true
  for (const kind of kinds.split(',').map((k) => k.trim()).filter(Boolean)) {
    if (kind === 'world_step') {
      const document = env('DOC') || join(appPath, 'docs/worldbuild/quiet-reach-prompts.md')
      const build = env('BUILD') || 'quiet-reach'
      ok = (await buildTrial(
        ai,
        {
          document: readFileSync(document, 'utf8'),
          documentPath: relative(appPath, document),
          folder: `${build.replace(/[^a-z0-9]/g, '')}_trial`,
          name: env('NAME') || 'The Quiet Reach',
          fixtures: join(appPath, 'tests/fixtures/worldbuild', build),
          out: env('OUT') || join(tmpdir(), 'wisplight-trial-out', build),
          capUsd: cap,
          steps: env('STEPS').split(',').map((s) => s.trim()).filter(Boolean),
          sameModel: env('SAME_MODEL') === '1',
          record: env('RECORD') === '1',
        },
        contentRoot,
        say,
      )) && ok
      continue
    }
    if (kind === 'region_play') {
      ok = (await regionTrial(ai, contentRoot, appPath, { capUsd: cap, setting: env('SETTING') as RegionSetting | '', record: env('RECORD') === '1' }, say)) && ok
      continue
    }
    ok = (await kindTrial(ai, kind, contentRoot, join(appPath, 'tests/fixtures/model', kind), env('RECORD') === '1', say)) && ok
  }
  return ok
}

/**
 * The played proof of a new region (M10.25 (4)), with the player's models:
 * the Holleveen's south edge explored once per setting of the fourth dial,
 * and Skerrow over the sea at `story`, three game days each (the harness in
 * src/node/regionplay.ts). Within the cap over all of it. Transcripts and the
 * comparison go to docs/playtest/region-*; with record, every reply as a
 * fixture under tests/fixtures/model/<kind>/, read again as its kind's
 * situation reads it.
 */
export async function regionTrial(ai: TrialAi, contentRoot: string, appPath: string, how: { capUsd: number; setting: RegionSetting | ''; record: boolean }, say: (line: string) => void): Promise<boolean> {
  const dir = join(appPath, 'docs/playtest')
  mkdirSync(dir, { recursive: true })
  const base = await loadContentFromDir(contentRoot, 'base')
  const isle = await readContentFiles(contentRoot, 'isle')
  let spent = 0
  let all = true
  for (const world of ['base', 'isle'] as const) {
    const content = world === 'base' ? base : await loadContentFromDir(contentRoot, 'isle')
    const settings = REGION_SETTINGS.filter((s) => (how.setting ? s === how.setting : world === 'base' || s === 'story'))
    const tallies: RegionTally[] = []
    for (const setting of settings) {
      const llm = measuring(ai.gateway, { price: costUsd, capUsd: Math.max(0, how.capUsd - spent) })
      const started = Date.now()
      const { transcript, tally } = await playRegion({ content, world, setting, llm, seed: 7 })
      const cost = llm.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0)
      spent += cost
      tallies.push(tally)
      writeFileSync(join(dir, `region-${world}-${setting}.txt`), `${world === 'base' ? 'The Holleveen, south edge' : 'Skerrow, over the sea'}; the dial at ${setting}; seed 7; ${llm.calls[0]?.model ?? 'no model'}\n${transcript}\n`)
      say(`${world} ${setting}: ${tally.region?.name ?? 'nothing charted'}, ${tally.places.count} places, ${tally.people.count} people, ${tally.quests.length} quests, ${llm.calls.length} calls, $${cost.toFixed(3)}, ${Math.round((Date.now() - started) / 1000)}s`)
      if (!tally.region) all = false
      if (how.record) {
        for (const [n, call] of llm.calls.entries()) {
          const situation = await kindSituation(call.kind, { base, isle })
          const entry = { kind: call.kind, about: `region play: ${world}, the dial at ${setting}, call ${n + 1}`, model: call.model, provider: '', date: today(), usage: { inputTokens: call.inputTokens, cachedTokens: call.cachedTokens, outputTokens: call.outputTokens }, reply: call.reply, problems: situation ? situation.check(call.reply) : [] }
          const folder = join(appPath, 'tests/fixtures/model', call.kind)
          mkdirSync(folder, { recursive: true })
          writeFileSync(join(folder, `${entry.date}-${call.model.replace(/[^a-z0-9.-]/gi, '_')}-region-${world}-${setting}-${String(n + 1).padStart(2, '0')}.json`), `${JSON.stringify(entry, null, 2)}\n`)
        }
      }
      if (spent >= how.capUsd) {
        say(`the cap of $${how.capUsd} is spent; stopped`)
        break
      }
    }
    if (!how.setting && tallies.length) writeFileSync(join(dir, `region-${world}.md`), `${regionReport(tallies, { title: world === 'base' ? 'Een nieuwe streek ten zuiden van de Holleveen, per stand' : 'Een nieuwe streek over de zee van Skerrow', model: tallies.flatMap((t) => t.calls)[0]?.model ?? '', date: today(), mock: false })}\n`)
    if (spent >= how.capUsd) break
  }
  say(`total: $${spent.toFixed(3)}`)
  return all
}

interface KindRecord {
  kind: string
  about: string
  model: string
  provider: string
  date: string
  usage: { inputTokens: number; cachedTokens: number; outputTokens: number }
  reply: string
  /** What the game would not use of it; empty when it would. */
  problems: string[]
}

/**
 * One kind of call in its fixed situation, answered by the model the player
 * chose for its role, read as the game reads it. With record, the reply is
 * kept under tests/fixtures/model/<kind>/<date>-<model>.json.
 */
export async function kindTrial(ai: AiService, kind: string, contentRoot: string, fixtures: string, record: boolean, say: (line: string) => void): Promise<boolean> {
  const started = Date.now()
  let entry: KindRecord
  if (kind === 'model_advice' || kind === 'test_call') {
    // The advice and the test call are the app's own: tried through the same functions the settings use.
    const roles = ai.overview().settings.roles
    const chosen = roles.chronicler ?? roles.brain ?? roles.voice
    if (!chosen) {
      say(`${kind}: no model chosen under Settings > AI`)
      return false
    }
    let reply = ''
    let problems: string[] = []
    try {
      if (kind === 'model_advice') reply = JSON.stringify(await askAdvice(ai.gateway, chosen.provider, await ai.listModels(chosen.provider)))
      else {
        const problem = await testCall(ai.gateway, chosen.provider, chosen.model)
        reply = problem ? '' : '{"ok":true}'
        problems = problem ? [problem] : []
      }
    } catch (error) {
      problems = [error instanceof Error ? error.message : String(error)]
    }
    const last = ai.recentLog(1)[0]
    entry = { kind, about: kind === 'model_advice' ? 'advice for the three roles' : 'a short call to the chronicler\'s model', model: last?.model ?? chosen.model, provider: chosen.provider, date: today(), usage: { inputTokens: last?.inputTokens ?? 0, cachedTokens: 0, outputTokens: last?.outputTokens ?? 0 }, reply, problems }
  } else {
    const worlds = await listWorlds(contentRoot)
    const base = await loadContentFromDir(contentRoot, worlds.some((w) => w.folder === 'base') ? 'base' : worlds[0]!.folder)
    const situation = await kindSituation(kind, { base, isle: await readContentFiles(contentRoot, 'isle') })
    if (!situation) {
      say(`${kind}: no situation for this kind`)
      return false
    }
    try {
      const response = await ai.gateway.complete(situation.request)
      entry = { kind, about: situation.about, model: response.model, provider: response.provider, date: today(), usage: { inputTokens: response.usage.inputTokens, cachedTokens: response.usage.cachedTokens, outputTokens: response.usage.outputTokens }, reply: response.text, problems: situation.check(response.text) }
      say(`${kind}: ${response.model}, in ${response.usage.inputTokens}, out ${response.usage.outputTokens}, $${(costUsd(response.model, response.usage) ?? 0).toFixed(4)}`)
    } catch (error) {
      say(`${kind}: stopped: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
  say(`${kind}: ${entry.problems.length ? `the game would not use it: ${entry.problems.slice(0, 3).join('; ')}` : 'the game takes it'} (${Math.round((Date.now() - started) / 1000)}s)`)
  if (record) {
    mkdirSync(fixtures, { recursive: true })
    writeFileSync(join(fixtures, `${entry.date}-${entry.model.replace(/[^a-z0-9.-]/gi, '_')}.json`), `${JSON.stringify(entry, null, 2)}\n`)
  }
  return entry.problems.length === 0
}
