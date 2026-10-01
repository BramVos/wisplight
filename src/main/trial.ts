import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { callName, chapterStep, documentChapters, faithfulness, mergeFix, newWorldFiles, playWorldStep, readDraft, worldFixRequest, worldStepRequest, WORLD_STEPS, DOCUMENT_STEPS, type Content, type ContentFile, type LlmRequest, type WorldStep } from '../engine'
import { LlmError, type LlmResponse } from '../engine/dialogue/llm'
import { askAdvice, readScore, testCall, trial, type KeptAnswer } from '../node/ai/advisor'
import { costUsd } from '../node/ai/pricing'
import { openAiStrict } from '../node/ai/providers'
import { listWorlds, loadContentFromDir, readContentFiles } from '../node/content'
import { MODEL_KINDS } from '../engine/modelkinds'
import { kindSituation } from '../engine/trials'
import { keepRegion } from '../node/proofworld'
import { mapTrial } from './maptrial'
import { keepTally, keptTallies, measuring, playRegion, REGION_KINDS, regionReport, REGION_SETTINGS, type RegionSetting } from '../node/regionplay'
import type { BuildStore } from '../node/ai/builds'
import type { AiService } from '../node/ai/service'
import { STORY_TALKS, blockKept, playTwenty, TWENTY_ANYWHERE, TWENTY_LINES } from '../node/talktrial'

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
  for (const [i, step] of DOCUMENT_STEPS.entries()) {
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

/**
 * A designer's document as the recordings of its build keep it (M10.25; Bram,
 * 29 September 2026: his own text is not for the public repo). Each step's
 * fixture carries the chapter it was played with, its title and its text, so
 * the chapters in the order of the steps are the document again. Undefined
 * when the build has no recordings.
 */
export function recordedDocument(fixtures: string): string | undefined {
  const steps = existsSync(fixtures) ? readdirSync(fixtures).filter((f) => /^\d+-[a-z_]+\.json$/.test(f)).sort() : []
  if (!steps.length) return undefined
  return steps
    .map((f, i) => {
      const step = JSON.parse(readFileSync(join(fixtures, f), 'utf8')) as Fixture
      return `${i + 1} ${step.chapter}\n${step.said}`
    })
    .join('\n\n')
}

/** The recorded builds, for the coverage table: tests/fixtures/worldbuild/<build>/<nn>-<step>.json. */
export function recordedBuilds(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((d) => !d.startsWith('.')) : []
}

/**
 * The trial asked for in WISPLIGHT_TRIAL: a kind of model call, or several
 * separated by commas. The world build takes its settings from
 * WISPLIGHT_DOC (or WISPLIGHT_TRIAL_DOC, a document outside the repo; without
 * it, the chapters its recordings keep), WISPLIGHT_TRIAL_BUILD, _CAP (dollars, default 1), _STEPS, _SAME_MODEL,
 * _RECORD and _OUT, which npm run trial sets from its arguments.
 */
export async function trialRun(ai: AiService, kinds: string, contentRoot: string, appPath: string, say: (line: string) => void): Promise<boolean> {
  const env = (name: string) => process.env[`WISPLIGHT_TRIAL_${name}`] ?? ''
  const cap = Math.max(0.01, Math.min(Number(env('CAP')) || 1, 20))
  // Said before anything is spent (M10.26): on the player's key, in the game's log and budget, and at most this.
  say(`on the player's key, in the same AI log and hourly budget as the game (source: trial): at most $${cap.toFixed(2)} for ${kinds}`)
  let ok = true
  for (const kind of kinds.split(',').map((k) => k.trim()).filter(Boolean)) {
    if (kind === 'world_step') {
      const build = env('BUILD') || 'quiet-reach'
      const fixtures = join(appPath, 'tests/fixtures/worldbuild', build)
      // The designer's document: a file outside the repo (WISPLIGHT_DOC, or --doc), or the chapters the build's
      // recordings keep (M10.25: Bram's own text is not in the public repo). The record names only the file, never its folder.
      const file = process.env['WISPLIGHT_DOC'] || env('DOC')
      const document = file ? readFileSync(file, 'utf8') : recordedDocument(fixtures)
      if (!document) {
        say(`world_step: no document; give one with --doc <file outside the repo>, or record ${build} first`)
        ok = false
        continue
      }
      ok = (await buildTrial(
        ai,
        {
          document,
          documentPath: file ? basename(file) : relative(appPath, fixtures),
          folder: `${build.replace(/[^a-z0-9]/g, '')}_trial`,
          name: env('NAME') || 'The Quiet Reach',
          fixtures,
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
    if (kind === 'map_measure') {
      // The map painted as a table with each model asked for (M10.26): --models a,b --times n.
      const models = env('MODELS').split(',').map((m) => m.trim()).filter(Boolean)
      ok = (await mapTrial(ai, contentRoot, appPath, { models: models.length ? models : ['claude-sonnet-5', 'claude-haiku-4-5-20251001'], times: Math.max(1, Math.min(Number(env('TIMES')) || 2, 5)), record: env('RECORD') === '1', capUsd: cap }, say)) && ok
      continue
    }
    if (kind === 'voice_set') {
      // The talk on the situation set (M10.27): as the settings try a voice model, with the rules' character score.
      const chosen = ai.overview().settings.roles.voice
      if (!chosen) {
        say('voice_set: no model chosen for the voice under Settings > AI')
        ok = false
        continue
      }
      const content = await loadContentFromDir(contentRoot, 'base')
      // Another model than the voice's with --model (M10.28): its provider from its name.
      const model = env('MODEL') || chosen.model
      const provider = model === chosen.model ? chosen.provider : providerOf(model)
      for (let n = 1; n <= Math.max(1, Math.min(Number(env('TIMES')) || 1, 10)); n++) {
        // More situations than the six of a settings try, for a comparison (M10.33 Q).
        const r = await trial(ai.gateway, content, provider, model, 'voice', Number(env('COUNT')) || undefined)
        // Every answer kept to a file (M10.33 Q): the model's reply and what it was given, to read beside another prompt.
        if (env('DUMP') && r.kept) for (const k of r.kept) appendFileSync(env('DUMP'), `${JSON.stringify({ label: env('LABEL') || 'now', model: r.model, series: n, ...k })}\n`)
        // What it cost as billed, the cache read and written included (M10.28); without a price, at the full input price.
        const usd = r.costUsd ?? costUsd(r.model, { inputTokens: r.inputTokens, outputTokens: r.outputTokens, cachedTokens: 0 }) ?? 0
        // Every answer kept, and how the series reads (M10.28: the rules score words and facts, not how a line reads).
        const read = r.kept && env('READ') !== '0' ? await readScore(ai.gateway, content, r.kept).catch(() => undefined) : undefined
        const counts = `${r.answers} answers, ${r.valid} valid, ${r.retries} retries, ${r.fallbacks} set lines, character ${r.characterScore?.toFixed(3) ?? '-'}, leaks ${r.leaks}, invented ${r.factualErrors}, breaks ${r.characterBreaks}, ${(r.averageLatencyMs / 1000).toFixed(1)}s an answer (at most ${(r.maxLatencyMs / 1000).toFixed(1)}s)`
        if (r.kept) keepAnswers(appPath, content, r.model, `The situation set, series ${n}`, r.kept, `${counts}, $${usd.toFixed(4)}`, read)
        say(`voice_set #${n}: ${r.model}, ${counts}, in ${r.inputTokens} (read ${r.cachedTokens ?? 0}), out ${r.outputTokens}, $${usd.toFixed(4)}${read ? `; read ${read.score.toFixed(3)} (${read.model}, $${read.costUsd.toFixed(4)})` : ''}${r.errors.length ? `; ${r.errors.join('; ')}` : ''}`)
      }
      continue
    }
    if (kind === 'read_dumps') {
      // The read score of each kept series (M10.33 Q, W): per label, the model's own replies, the made-up facts counted.
      const content = await loadContentFromDir(contentRoot, 'base')
      const rows = env('DUMP').split(',').filter(Boolean).flatMap((file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as KeptAnswer & { label: string; model: string; reply?: string }))
      for (const label of [...new Set(rows.map((r) => r.label))]) {
        if (ai.usage.summary().session.costUsd >= cap) {
          say(`read_dumps ${label}: not read, the cap of $${cap.toFixed(2)} is spent`)
          ok = false
          continue
        }
        const kept = rows.filter((r) => r.label === label && r.reply).map((r) => ({ ...r, answer: r.reply!, byModel: true }))
        const read = await readScore(ai.gateway, content, kept).catch(() => undefined)
        say(read ? `read_dumps ${label}: ${kept.length} answers, read ${read.score.toFixed(3)} (this person ${read.byQuestion.person.toFixed(2)}, natural ${read.byQuestion.natural.toFixed(2)}, answers ${read.byQuestion.answers.toFixed(2)}, onward ${read.byQuestion.onward.toFixed(2)}), made-up facts per answer ${read.invented?.toFixed(2) ?? '-'}, words per answer ${(kept.reduce((s, k) => s + k.answer.split(/\s+/).length, 0) / Math.max(1, kept.length)).toFixed(1)}, by ${read.model}, $${read.costUsd.toFixed(4)}${read.weakest.map((w) => `; weakest ${w.n}: ${w.why}`).join('')}` : `read_dumps ${label}: the read score could not be read`)
        if (!read) ok = false
      }
      continue
    }
    if (kind === 'story_twenty') {
      ok = (await storyTrial(ai, contentRoot, { model: env('MODEL'), capUsd: cap, appPath }, say)) && ok
      continue
    }
    if (kind === 'talk_twenty' || kind === 'keep_warm') {
      ok = (await talkTrial(ai, kind, contentRoot, { model: env('MODEL'), capUsd: cap, appPath, read: env('READ') !== '0', world: env('WORLD'), npc: env('NPC') }, say)) && ok
      continue
    }
    if (kind === 'region_play') {
      ok = (await regionTrial(ai, contentRoot, appPath, { capUsd: cap, setting: env('SETTING') as RegionSetting | '', world: env('WORLD'), record: env('RECORD') === '1' }, say)) && ok
      continue
    }
    // The cap said at the start holds over every kind asked for (M10.27): what this trial spent so far, in the usage.
    if (ai.usage.summary().session.costUsd >= cap) {
      say(`${kind}: not tried, the cap of $${cap.toFixed(2)} is spent`)
      ok = false
      continue
    }
    const effort = env('EFFORT')
    ok = (await kindTrial(ai, kind, contentRoot, join(appPath, 'tests/fixtures/model', kind), env('RECORD') === '1', say, { ...(effort === 'low' || effort === 'medium' || effort === 'high' ? { effort } : {}), times: Number(env('TIMES')) || 1, capUsd: cap, ...(env('MODEL') ? { model: env('MODEL') } : {}) })) && ok
  }
  return ok
}

/** The provider of a model by its name (M10.28: a trial with --model). */
function providerOf(model: string): 'openai' | 'anthropic' {
  return /^(gpt|o\d|chatgpt)/.test(model) ? 'openai' : 'anthropic'
}

/**
 * The measures of M10.28 on the player's key: a talk of twenty lines with the
 * baker of Veenhoek on the voice's model (or --model), per line what it read
 * from the cache, wrote to it and cost; or whether a ping keeps the block of
 * a place stays in the cache (keep_warm: a line, and one after six minutes).
 */
/**
 * Niko and Tessa on the recordings (M10.30 (5)): ten lines to each in The
 * Quiet Reach, on the player's voice model, every answer kept for reading side
 * by side, with the guard's reasons where it asked again (a hidden truth named
 * too early is a leak).
 */
export async function storyTrial(ai: AiService, contentRoot: string, how: { model: string; capUsd: number; appPath?: string }, say: (line: string) => void): Promise<boolean> {
  const chosen = ai.overview().settings.roles.voice
  if (!chosen) {
    say('story_twenty: no model chosen for the voice under Settings > AI')
    return false
  }
  const content = await loadContentFromDir(contentRoot, 'quietreach')
  const model = (response: LlmResponse) => response.model
  const other = how.model && how.model !== chosen.model ? { provider: providerOf(how.model), model: how.model } : undefined
  const llm = other ? { complete: (r: LlmRequest) => ai.gateway.complete(r, other), report: ai.gateway.report.bind(ai.gateway) } : ai.gateway
  let spent = 0
  const kept: KeptAnswer[] = []
  try {
    for (const talk of STORY_TALKS) {
      const lines = await playTwenty(content, llm, {
        model,
        npc: talk.npc,
        lines: talk.lines,
        onLine: (m, n) => {
          spent += m.costUsd
          say(`${callName(content.npcs.get(talk.npc)!)} ${n}: ${m.calls} call${m.calls === 1 ? '' : 's'}${m.rejected.length ? ` (asked again: ${m.rejected.join(', ')})` : ''}, $${m.costUsd.toFixed(4)}; "${m.line}" -> ${m.said}`)
          if (spent > how.capUsd) throw new Error(`the cap of $${how.capUsd.toFixed(2)} is spent`)
        },
      })
      kept.push(...lines.map((l) => ({ npc: talk.npc, said: l.line, answer: l.said, byModel: l.calls > 0 })))
    }
  } catch (error) {
    say(`story_twenty: stopped: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
  say(`story_twenty: ${other?.model ?? chosen.model}, ${kept.filter((k) => k.byModel).length} lines asked, $${spent.toFixed(4)} in all`)
  if (how.appPath) keepAnswers(how.appPath, content, other?.model ?? chosen.model, 'Niko and Tessa on the recordings (M10.30)', kept, `$${spent.toFixed(4)}`, undefined)
  return true
}

export async function talkTrial(ai: AiService, kind: 'talk_twenty' | 'keep_warm', contentRoot: string, how: { model: string; capUsd: number; appPath?: string; read?: boolean; world?: string; npc?: string }, say: (line: string) => void): Promise<boolean> {
  const chosen = ai.overview().settings.roles.voice
  if (!chosen) {
    say(`${kind}: no model chosen for the voice under Settings > AI`)
    return false
  }
  // Another world with --world (M10.28: whether a small world reaches the cache's minimum), with someone of its own and lines that fit anywhere.
  const world = how.world || 'base'
  const content = await loadContentFromDir(contentRoot, world)
  const npc = how.npc || (world === 'base' ? 'npc_mirte' : world === 'isle' ? 'npc_maren' : [...content.npcs.values()].find((n) => n.household && !n.child)?.id)
  if (!npc || !content.npcs.has(npc)) {
    say(`${kind}: nobody to talk to in ${world}; name someone with --npc`)
    return false
  }
  const twenty = world === 'base' && npc === 'npc_mirte' ? TWENTY_LINES : TWENTY_ANYWHERE
  const model = (response: LlmResponse) => response.model
  const other = how.model && how.model !== chosen.model ? { provider: providerOf(how.model), model: how.model } : undefined
  const llm = other ? { complete: (r: LlmRequest) => ai.gateway.complete(r, other), report: ai.gateway.report.bind(ai.gateway) } : ai.gateway
  if (kind === 'keep_warm') {
    const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))
    const r = await blockKept(content, llm, { wait, afterMs: 360_000, model, say })
    say(`keep_warm: ${other?.model ?? chosen.model}, the line six minutes later read ${r.second.cachedTokens} of ${r.second.inputTokens} from the cache and wrote ${r.second.cacheWriteTokens}: ${r.second.cachedTokens > r.second.inputTokens / 2 ? 'the block was still there' : 'the block was gone'}`)
    return true
  }
  let spent = 0
  let lines: Awaited<ReturnType<typeof playTwenty>>
  try {
    lines = await playTwenty(content, llm, {
      model,
      npc,
      lines: twenty,
      onLine: (m, n) => {
        spent += m.costUsd
        say(`line ${n}: ${m.calls} call${m.calls === 1 ? '' : 's'}${m.rejected.length ? ` (asked again: ${m.rejected.join(', ')})` : ''}, in ${m.inputTokens} (read ${m.cachedTokens}, written ${m.cacheWriteTokens}), out ${m.outputTokens}, $${m.costUsd.toFixed(4)}, ${(m.latencyMs / 1000).toFixed(1)}s; "${m.line}" -> ${m.said.slice(0, 120)}`)
        if (spent > how.capUsd) throw new Error(`the cap of $${how.capUsd.toFixed(2)} is spent`)
      },
    })
  } catch (error) {
    say(`talk_twenty: stopped: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
  const asked = lines.filter((l) => l.calls)
  const rest = asked.slice(1)
  const each = (f: (l: (typeof asked)[number]) => number) => asked.reduce((n, l) => n + f(l), 0)
  say(`talk_twenty: ${other?.model ?? chosen.model}, ${asked.length} lines asked, $${spent.toFixed(4)} in all; the first $${(asked[0]?.costUsd ?? 0).toFixed(4)}, the rest $${(rest.reduce((n, l) => n + l.costUsd, 0) / Math.max(1, rest.length)).toFixed(4)} a line on average; read ${each((l) => l.cachedTokens)} of ${each((l) => l.inputTokens)} input tokens from the cache, wrote ${each((l) => l.cacheWriteTokens)}; ${(each((l) => l.latencyMs) / Math.max(1, asked.length) / 1000).toFixed(1)}s a line`)
  // Every line kept, and how the talk reads (M10.28).
  if (how.appPath) {
    const kept: KeptAnswer[] = lines.map((l) => ({ npc: 'npc_mirte', said: l.line, answer: l.said, byModel: l.calls > 0 }))
    const read = how.read ? await readScore(ai.gateway, content, kept).catch(() => undefined) : undefined
    const used = other?.model ?? chosen.model
    keepAnswers(how.appPath, content, used, 'A talk of twenty lines with Mirte', kept, `${asked.length} lines asked, $${spent.toFixed(4)}, ${(each((l) => l.latencyMs) / Math.max(1, asked.length) / 1000).toFixed(1)}s a line`, read)
    if (read) say(`talk_twenty: read ${read.score.toFixed(3)} (${read.model}, $${read.costUsd.toFixed(4)})`)
  }
  return true
}

/**
 * The played proof of a new region (M10.25 (4)), with the player's models:
 * the Holleveen's south edge explored once per setting of the fourth dial,
 * and Skerrow over the sea at `story`, three game days each (the harness in
 * src/node/regionplay.ts). Within the cap over all of it. Each setting's
 * tally is kept in docs/playtest/region-<world>-<setting>.json, and the
 * comparison is made from every tally there, so settings played in separate
 * hours (--setting, and --world for one world) make one report. With record, the replies of the calls
 * that build the region (REGION_KINDS) become fixtures under
 * tests/fixtures/model/<kind>/, read again as its kind's situation reads it.
 */
export async function regionTrial(ai: TrialAi, contentRoot: string, appPath: string, how: { capUsd: number; setting: RegionSetting | ''; world?: string; record: boolean }, say: (line: string) => void): Promise<boolean> {
  const dir = join(appPath, 'docs/playtest')
  mkdirSync(dir, { recursive: true })
  const base = await loadContentFromDir(contentRoot, 'base')
  const isle = await readContentFiles(contentRoot, 'isle')
  let spent = 0
  let all = true
  for (const world of (['base', 'isle'] as const).filter((w) => !how.world || w === how.world)) {
    const content = world === 'base' ? base : await loadContentFromDir(contentRoot, 'isle')
    const settings = REGION_SETTINGS.filter((s) => (how.setting ? s === how.setting : world === 'base' || s === 'story'))
    for (const setting of settings) {
      const llm = measuring(ai.gateway, { price: costUsd, capUsd: Math.max(0, how.capUsd - spent) })
      const started = Date.now()
      const { transcript, tally, content: grown } = await playRegion({ content, world, setting, llm, seed: 7 })
      const cost = llm.calls.reduce((n, c) => n + (c.costUsd ?? 0), 0)
      spent += cost
      keepTally(dir, 'region', { ...tally, capUsd: Math.max(0, how.capUsd - (spent - cost)) })
      const where = world === 'base' ? 'The Holleveen, south edge' : 'Skerrow, over the sea'
      writeFileSync(join(dir, `region-${world}-${setting}.txt`), `${where}; the dial at ${setting}; seed 7; ${llm.calls[0]?.model ?? 'no model'}\n${transcript}\n`)
      say(`${world} ${setting}: ${tally.region?.name ?? 'nothing charted'}, ${tally.places.count} places, ${tally.people.count} people, ${tally.quests.length} quests, ${llm.calls.length} calls, $${cost.toFixed(3)}, ${Math.round((Date.now() - started) / 1000)}s`)
      // What it grew, as the next numbered region in a copy of the world, to look at in the editor (Bram's question).
      if (tally.region) {
        const kept = await keepRegion(contentRoot, world, content, grown, {
          name: tally.region.name,
          lines: [`${where}, the dial at \`${setting}\`, ${today()}, ${llm.calls[0]?.model ?? 'no model'}, ${llm.calls.length} calls, $${cost.toFixed(2)}. The game as it was played: \`docs/playtest/region-${world}-${setting}.txt\`.`, '', tally.region.summary],
        })
        say(`kept as region ${kept.n} in content/${kept.folder}${kept.problems.length ? `, aside: ${kept.problems[0]}` : ''}`)
      }
      if (!tally.region) all = false
      if (how.record) {
        for (const [n, call] of llm.calls.entries()) {
          if (!REGION_KINDS.includes(call.kind)) continue
          const situation = await kindSituation(call.kind, { base, isle })
          // A step of the world build or its polish round is read again in its kind's fixed situation, not the region's:
          // what the region kept of it is in the report.
          const judged = call.kind === 'world_step' || call.kind === 'world_polish' ? `; problems as its kind's fixed situation reads it, what the region kept is in docs/playtest/region-${world}.md` : ''
          const entry = { kind: call.kind, about: `region play: ${world}, the dial at ${setting}, call ${n + 1}${judged}`, model: call.model, provider: '', date: today(), usage: { inputTokens: call.inputTokens, cachedTokens: call.cachedTokens, outputTokens: call.outputTokens }, reply: call.reply, problems: situation ? situation.check(call.reply) : [] }
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
    const kept = keptTallies(dir, 'region', world)
    if (kept.length) writeFileSync(join(dir, `region-${world}.md`), `${regionReport(kept, { title: world === 'base' ? 'Een nieuwe streek ten zuiden van de Holleveen, per stand' : 'Een nieuwe streek over de zee van Skerrow', mock: false })}\n`)
    if (spent >= how.capUsd) break
  }
  say(`total: $${spent.toFixed(3)}`)
  return all
}

interface KindRecord {
  kind: string
  about: string
  model: string
  /** The effort it was made at (M10.27): asked for in the trial, or else the kind's own. */
  effort?: string
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
export async function kindTrial(ai: AiService, kind: string, contentRoot: string, fixtures: string, record: boolean, say: (line: string) => void, how: { effort?: 'low' | 'medium' | 'high'; times?: number; capUsd?: number; model?: string } = {}): Promise<boolean> {
  const started = Date.now()
  let entry: KindRecord
  // Kept as a fixture: a later trial of the same model on the same day beside the earlier one (M10.27): -r2, -r3.
  const keep = (e: KindRecord) => {
    if (!record) return
    mkdirSync(fixtures, { recursive: true })
    const stem = `${e.date}-${e.model.replace(/[^a-z0-9.-]/gi, '_')}`
    let file = join(fixtures, `${stem}.json`)
    for (let round = 2; existsSync(file); round++) file = join(fixtures, `${stem}-r${round}.json`)
    writeFileSync(file, `${JSON.stringify(e, null, 2)}\n`)
  }
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
    // An effort asked for (M10.27: low measured against the recorded medium), as often as asked; each reply kept.
    const request = how.effort ? { ...situation.request, effort: how.effort } : situation.request
    const effort = request.effort ?? MODEL_KINDS.find((k) => k.kind === kind)?.effort
    const times = Math.max(1, Math.min(how.times ?? 1, 5))
    let all = true
    for (let n = 1; n <= times; n++) {
      if (how.capUsd !== undefined && ai.usage.summary().session.costUsd >= how.capUsd) {
        say(`${kind} #${n}: not asked, the cap of $${how.capUsd.toFixed(2)} is spent`)
        break
      }
      try {
        // Another model than the role's with --model (M10.28: gpt-5-mini against Haiku for the voice), its provider from its name.
        const response = await ai.gateway.complete(request, how.model ? { provider: providerOf(how.model), model: how.model } : undefined)
        const usd = costUsd(response.model, response.usage) ?? 0
        const e: KindRecord = { kind, about: situation.about, model: response.model, provider: response.provider, date: today(), ...(effort ? { effort } : {}), usage: { inputTokens: response.usage.inputTokens, cachedTokens: response.usage.cachedTokens, outputTokens: response.usage.outputTokens }, reply: response.text, problems: situation.check(response.text) }
        // On OpenAI a schema goes strict only where every field is required and every object closed (M10.20); else it guides.
        const strict = response.provider === 'openai' ? `, ${openAiStrict(request.schema) ? 'strict' : 'schema not strict'}` : ''
        say(`${kind}${times > 1 ? ` #${n}` : ''}${how.effort ? ` at ${how.effort}` : ''}: ${response.model}${strict}, in ${response.usage.inputTokens} (read ${response.usage.cachedTokens}), out ${response.usage.outputTokens}, ${(response.latencyMs / 1000).toFixed(1)}s, $${usd.toFixed(4)}; ${e.problems.length ? `the game would not use it: ${e.problems.slice(0, 3).join('; ')}` : 'the game takes it'}`)
        all = all && e.problems.length === 0
        if (n < times) keep(e)
        entry = e
      } catch (error) {
        say(`${kind}: stopped: ${error instanceof Error ? error.message : String(error)}`)
        return false
      }
    }
    if (!all) say(`${kind}: not every reply was taken`)
    // Nothing asked (the cap was spent before the first): nothing to keep.
    if (!entry!) return false
  }
  say(`${kind}: ${entry!.problems.length ? `the game would not use it: ${entry!.problems.slice(0, 3).join('; ')}` : 'the game takes it'} (${Math.round((Date.now() - started) / 1000)}s)`)
  keep(entry!)
  return entry!.problems.length === 0
}

/**
 * The answers of a voice series kept side by side per model (M10.28; Bram:
 * the rules score words and facts, not how the lines read, so the answers
 * themselves are kept to be read): docs/playtest/voice/<date>-<model>.md, a
 * section a series, the model's answers numbered as the read score names them.
 */
function keepAnswers(appPath: string, content: Content, model: string, title: string, answers: KeptAnswer[], counts: string, read?: Awaited<ReturnType<typeof readScore>>): void {
  const dir = join(appPath, 'docs/playtest/voice')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${today()}-${model.replace(/[^a-z0-9.-]/gi, '_')}.md`)
  const head = existsSync(file) ? '' : `# The voice on ${model}, ${today()}\n\nEvery answer of the comparison of M10.28 (5), with the player's line before it, as the player read it. The model's answers are numbered as the read score names them; a line the rules answered is marked (rules).\n`
  let n = 0
  const name = (npc: string) => content.npcs.get(npc)?.name ?? npc
  const lines = answers.map((a) => (a.byModel ? `${++n}. ${name(a.npc)}. The player: "${a.said}"\n   ${a.answer}` : `- ${name(a.npc)}. The player: "${a.said}"\n   ${a.answer} (rules)`))
  const scored = read
    ? [`Read score ${read.score.toFixed(2)} (0 to 1; per question 0 to 3: this person ${read.byQuestion.person.toFixed(1)}, natural ${read.byQuestion.natural.toFixed(1)}, answers and adds ${read.byQuestion.answers.toFixed(1)}, keeps it going ${read.byQuestion.onward.toFixed(1)})${read.invented !== undefined ? `; made-up facts per answer ${read.invented.toFixed(2)}` : ''}, read by ${read.model}.`, ...read.weakest.map((w) => `Weakest: ${w.n}, ${w.why}`)]
    : []
  appendFileSync(file, `${head}\n## ${title}\n\n${counts}.\n${scored.length ? `\n${scored.join('\n')}\n` : ''}\n${lines.join('\n')}\n`)
}
