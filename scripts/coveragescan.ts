import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODEL_KINDS, type ModelKind } from '../src/engine/modelkinds'
import { tokensAbout } from '../src/engine/dialogue/llm'
import { withSafety } from '../src/engine/safety'
import { kindSituation, SITUATION_KINDS, type TrialWorlds } from '../src/engine/trials'
import { cacheMinimum } from '../src/node/ai/pricing'

// docs/COVERAGE.md (M10.20): per kind of model call, whether a test answers it
// with the mock model, which real replies are recorded as fixtures (with date
// and model), and when the last real trial ran. Made by npm run coverage; a
// test checks that the file is what this writes, and that the code makes no
// kind of call without a row.

export interface CoverageRow extends ModelKind {
  /** Test files that make this kind of call with the mock model or play its recorded replies. */
  tests: string[]
  /** Recorded real replies: date and model, newest first. */
  recorded: { date: string; model: string; where: string }[]
}

/** The kinds of call the code makes: every `schemaName: '...'` under src. */
export function kindsInCode(root: string): string[] {
  const found = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.tsx?$/.test(entry.name)) for (const m of readFileSync(path, 'utf8').matchAll(/schemaName: '([a-z_]+)'/g)) found.add(m[1]!)
    }
  }
  walk(join(root, 'src'))
  return [...found].sort()
}

type Recording = { kind?: string; step?: string; model?: string; date?: string }

function recordings(root: string): { kind: string; date: string; model: string; where: string }[] {
  const out: { kind: string; date: string; model: string; where: string }[] = []
  const models = join(root, 'tests/fixtures/model')
  if (existsSync(models)) {
    for (const kind of readdirSync(models)) {
      for (const file of readdirSync(join(models, kind)).filter((f) => f.endsWith('.json'))) {
        const r = JSON.parse(readFileSync(join(models, kind, file), 'utf8')) as Recording
        if (r.date && r.model) out.push({ kind, date: r.date, model: r.model, where: `tests/fixtures/model/${kind}/${file}` })
      }
    }
  }
  const builds = join(root, 'tests/fixtures/worldbuild')
  if (existsSync(builds)) {
    for (const build of readdirSync(builds)) {
      const steps = readdirSync(join(builds, build)).filter((f) => /^\d\d-.*\.json$/.test(f))
      const read = steps.map((f) => JSON.parse(readFileSync(join(builds, build, f), 'utf8')) as Recording)
      const dates = [...new Set(read.map((r) => r.date).filter(Boolean))].sort()
      const models = [...new Set(read.map((r) => r.model).filter(Boolean))].sort()
      if (dates.length) out.push({ kind: 'world_step', date: dates.at(-1)!, model: models.join(', '), where: `tests/fixtures/worldbuild/${build} (${steps.length} steps)` })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export function coverage(root: string): { rows: CoverageRow[]; unlisted: string[]; stale: string[] } {
  const tests = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.ts')).sort()
  const texts = new Map(tests.map((f) => [f, readFileSync(join(root, 'tests', f), 'utf8')]))
  const recorded = recordings(root)
  const rows = MODEL_KINDS.map((k) => ({
    ...k,
    // A test that names the kind: the coverage test plays every kind; others make it through the game.
    tests: tests.filter((f) => texts.get(f)!.includes(`'${k.kind}'`) || texts.get(f)!.includes(`"${k.kind}"`)).map((f) => `tests/${f}`),
    recorded: recorded.filter((r) => r.kind === k.kind).map(({ date, model, where }) => ({ date, model, where })),
  }))
  const code = kindsInCode(root)
  return { rows, unlisted: code.filter((c) => !MODEL_KINDS.some((k) => k.kind === c)), stale: MODEL_KINDS.filter((k) => !code.includes(k.kind)).map((k) => k.kind) }
}

/** What a kind of call keeps the same from call to call, and what the next call reads from the cache (M10.26). */
export interface CacheMeasure {
  kind: string
  /** The model its latest recorded real reply came from, whose minimum counts; none without a recording. */
  model?: string
  input: number
  /** What it marks (M10.27): nothing, one part, or the shared part and one subject's part; and whether for an hour. */
  mark: 'none' | 'one' | 'both'
  hour: boolean
  /** The part before the cache mark: the same for the next call with this subject. */
  fixed: number
  /** The part every call of the kind shares, marked on its own (a new speaker reads it): where there is one. */
  shared?: number
  minimum?: number
  /** The fixed part is the block of an area (M10.28): everyone who speaks there reads it, and a talk reads what it said before. */
  area?: boolean
}

/**
 * The cache per kind (M10.26): its fixed situation as the gateway sends it
 * (the hard limits in front), in tokens about: the fixed part, the part every
 * call shares, and the minimum of the model it runs on.
 */
export async function cacheMeasures(worlds: TrialWorlds, rows: CoverageRow[]): Promise<CacheMeasure[]> {
  const out: CacheMeasure[] = []
  for (const kind of SITUATION_KINDS) {
    const situation = await kindSituation(kind, worlds)
    if (!situation) continue
    const r = withSafety(situation.request)
    const model = rows.find((row) => row.kind === kind)?.recorded[0]?.model.split(', ')[0]
    out.push({
      kind,
      ...(model ? { model, minimum: cacheMinimum(model) } : {}),
      input: tokensAbout(r.system + r.prompt),
      mark: r.cacheBreak === 0 ? 'none' : r.cacheShared !== undefined ? 'both' : 'one',
      hour: Boolean(r.cacheHour),
      fixed: tokensAbout(r.system.slice(0, r.cacheBreak ?? r.system.length)),
      ...(r.cacheShared !== undefined ? { shared: tokensAbout(r.system.slice(0, r.cacheShared)) } : {}),
      ...(r.cacheTail ? { area: true } : {}),
    })
  }
  return out
}

/** What the next call reads from the cache, in words: a share, or why nothing. */
export function cacheRead(m: CacheMeasure): string {
  if (m.mark === 'none') return 'not marked: nothing reads it back in time, so a mark would only pay a write'
  if (!m.minimum) return 'no recorded model yet'
  const pct = (n: number) => `${Math.round((100 * n) / m.input)}%`
  if (m.fixed < m.minimum) return 'nothing: the fixed part is under the minimum'
  if (m.area) return `the next line in these parts ${pct(m.fixed)} for an hour, whoever speaks, and within a talk all that was said before it`
  const next = `the next call ${pct(m.fixed)}`
  return m.shared !== undefined ? `${next}; one about someone or something else ${m.shared >= m.minimum ? pct(m.shared) : 'nothing (the shared part is under the minimum)'}` : next
}

export function coverageMarkdown(rows: CoverageRow[], cache: CacheMeasure[] = []): string {
  const lines = [
    '# Coverage of the model calls',
    '',
    'Generated by `npm run coverage` from `src/engine/modelkinds.ts`, the tests and the recorded replies; do not edit by hand.',
    '',
    'Every kind of model call the game makes, whether a test answers it with the mock model, and which replies of a real model are recorded as fixtures. A real trial runs in the app with the key and models of the player, never in CI: `npm run trial -- --kind <kind>` (after `npm run build`) plays a fixed situation, checks the reply with the same readers and guard as the game, and with `--record` keeps it under `tests/fixtures/model/<kind>/`. The world build records a whole designer\'s document under `tests/fixtures/worldbuild/<build>/`, and `tests/m1020fixtures.test.ts` plays it again.',
    '',
    `${rows.length} kinds; ${rows.filter((r) => r.recorded.length).length} with a recorded real reply.`,
    '',
    '| Kind | Role | When | What it is for | Mock test | Recorded real replies | Last real trial |',
    '|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| \`${r.kind}\` | ${r.role} | ${r.when} | ${r.does} | ${r.tests.length ? r.tests.map((t) => t.replace('tests/', '')).join(', ') : 'none'} | ${r.recorded.length ? r.recorded.map((x) => `${x.model} (${x.where})`).join('; ') : 'none'} | ${r.recorded[0]?.date ?? 'never'} |`),
    '',
    ...(cache.length
      ? [
          '## The cache per kind',
          '',
          'Every kind puts what stays the same first and what changes after it (M10.26). A cache mark costs a write at 1.25 times the input it covers (twice for an hour) and pays only when a second call reads it back within five minutes (or the hour), so a kind marks only where that is likely (M10.27): a talk its shared part and the speaker\'s card, a goal choice the part every person shares, the world steps and the writing aid for an hour, and nothing else. A model caches nothing shorter than its minimum (Haiku 4.5 4,096 tokens, Sonnet 5 1,024, Opus 5.5 512); the game does not pad a part to reach it, and the log says so in place of 0%. Measured on each kind\'s fixed situation as the gateway sends it, in tokens about (four characters a token), against the model of its latest recorded real reply.',
          '',
          '| Kind | Model | In | Mark | Fixed part | Shared by every call | Minimum | Read from the cache |',
          '|---|---|---|---|---|---|---|---|',
          ...cache.map((m) => `| \`${m.kind}\` | ${m.model ?? '-'} | ${m.input.toLocaleString('en-GB')} | ${m.mark === 'none' ? 'none' : `${m.mark === 'both' ? 'shared and own' : 'one'}${m.hour ? ', an hour' : ''}`} | ${m.mark === 'none' ? '-' : m.fixed.toLocaleString('en-GB')} | ${m.shared !== undefined ? m.shared.toLocaleString('en-GB') : '-'} | ${m.minimum?.toLocaleString('en-GB') ?? '-'} | ${cacheRead(m)} |`),
          '',
        ]
      : []),
  ]
  return lines.join('\n')
}

/**
 * The tokens of the latest recorded real reply of every kind (M10.21: the
 * guide price per hour of play in the settings), as a module the app ships
 * with: src/node/ai/measured.ts, made by npm run coverage.
 */
export function measuredModule(root: string): string {
  const dir = join(root, 'tests/fixtures/model')
  const rows: string[] = []
  if (existsSync(dir)) {
    for (const kind of readdirSync(dir).sort()) {
      const latest = readdirSync(join(dir, kind))
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(dir, kind, f), 'utf8')) as { date: string; model: string; usage?: { inputTokens: number; outputTokens: number } })
        .filter((r) => r.usage && r.usage.inputTokens > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      if (latest?.usage) rows.push(`  ${kind}: { inputTokens: ${latest.usage.inputTokens}, outputTokens: ${latest.usage.outputTokens}, model: '${latest.model}', date: '${latest.date}' },`)
    }
  }
  return [
    '// Generated by npm run coverage from tests/fixtures/model: do not edit by hand.',
    '// The tokens of the latest real reply of each kind of call, for the guide price per hour (M10.21).',
    '',
    'export interface Measured {',
    '  inputTokens: number',
    '  outputTokens: number',
    '  model: string',
    '  date: string',
    '}',
    '',
    'export const MEASURED: Record<string, Measured> = {',
    ...rows,
    '}',
    '',
  ].join('\n')
}
