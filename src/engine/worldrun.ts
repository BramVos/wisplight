import type { ContentFile } from './content'
import { designUpdate } from './designlog'
import { mergeFix, readDraft, type Draft } from './editor'
import { WORLD_STEPS, type WorldStep } from './worldguide'

// A world build played through without the editor (M10.20; Bram, 28 September
// 2026: why do so many errors come out of building a world when it was
// tested? Because every test used the mock model). The same reading, fixing
// and accepting as the editor, for the recorded real proposals in the tests
// and for the trial run with the player's own key.

export interface Chapter {
  n: number
  title: string
  text: string
}

/**
 * The chapters of a designer's document: a heading "<n> <Title>" or
 * "<n>. <Title>" on a line of its own, the numbers rising, up to twelve.
 */
export function documentChapters(text: string): Chapter[] {
  const out: Chapter[] = []
  for (const line of text.split('\n')) {
    const m = /^(\d{1,2})\.? ([A-Z][A-Za-z ]+)$/.exec(line.trim())
    const n = m ? Number(m[1]) : NaN
    if (m && n >= 1 && n <= WORLD_STEPS.length && (!out.length || n > out[out.length - 1]!.n)) {
      out.push({ n, title: m[2]!.trim(), text: '' })
      continue
    }
    if (out.length) out[out.length - 1]!.text += `${line}\n`
  }
  return out.map((c) => ({ ...c, text: c.text.replace(/^\n+|\n+$/g, '') }))
}

const TITLES: [RegExp, WorldStep['id']][] = [
  [/frame|premise/i, 'frame'],
  [/voice|speech|speak|language/i, 'voice'],
  [/calendar|weather|season|time/i, 'calendar'],
  [/money|currenc|coin|credit/i, 'money'],
  [/faith|belief|religion|god/i, 'faiths'],
  [/profession|occupation|work/i, 'professions'],
  [/people|persons|characters|cast/i, 'people'],
  [/econom|trade|market/i, 'economy'],
  [/transport|passage|travel|journey|route/i, 'passages'],
  [/signal|danger|watcher|threat/i, 'watcher'],
  [/palette|colour|color|map|picture/i, 'palette'],
  [/place|location|setting/i, 'places'],
]

/** The step a chapter answers, by its title; the steps' own titles first. */
export function chapterStep(title: string): WorldStep['id'] | undefined {
  const own = WORLD_STEPS.find((s) => s.title.toLowerCase() === title.toLowerCase())
  return own?.id ?? TITLES.find(([pattern]) => pattern.test(title))?.[1]
}

/** What a proposal changed, as the editor writes it in the design log. */
export function changedBy(draft: Pick<Draft, 'changes' | 'world' | 'files'>): string[] {
  const out = draft.changes.map((c) => `${c.kind} ${c.id}${c.yaml.trim() ? '' : ' (removed)'}`)
  if (draft.world?.trim()) out.push(`world.yaml: ${draft.world.split('\n').filter((l) => /^[a-z_]+:/.test(l)).map((l) => l.split(':')[0]).join(', ') || 'keys'}`)
  for (const f of draft.files ?? []) out.push(f.path)
  return out
}

export interface PlayedStep {
  draft: Draft
  /** The world after the step: with the proposal and the decision in the design log when it loaded, as it was otherwise. */
  files: ContentFile[]
  accepted: boolean
}

/**
 * One step played as the designer in the editor plays it: the reply read, the
 * corrections put in, one round after another, while the proposal does not load, and,
 * when it loads, accepted with its decision in the design log.
 */
export function playWorldStep(files: ContentFile[], stepId: WorldStep['id'], said: string, reply: string, fix?: string | string[], now = new Date()): PlayedStep {
  const step = WORLD_STEPS.find((s) => s.id === stepId)!
  let draft = readDraft(files, reply)
  for (const round of fix === undefined ? [] : Array.isArray(fix) ? fix : [fix]) if (!draft.result?.ok) draft = mergeFix(files, draft, round)
  if (!draft.result?.ok) return { draft, files, accepted: false }
  const next = draft.result.files
  const log = designUpdate(next, { decision: { step: step.title, decision: 'accepted', asked: said, say: draft.say, questions: draft.questions, changed: changedBy(draft), reason: '' } }, now)
  if (!log) return { draft, files: next, accepted: true }
  const had = next.some((f) => f.path === log.path)
  return { draft, files: had ? next.map((f) => (f.path === log.path ? { ...f, text: log.text } : f)) : [...next, { path: log.path, text: log.text }], accepted: true }
}

const COMMON = new Set('A An And As At But By For From He Her His How I If In Into It Its No Not Of On One Or She So That The Their There They This To Two We What When Where Which Who With You Your Yes Each Every All Any Some Most Only Never Always Also Then Than Here Now'.split(' '))

/**
 * How much of what the designer named comes back in the proposal (M10.20: the
 * measure of faithfulness to the text when a step goes to a cheaper model):
 * of the names (capitalised words not at the start of a sentence) and the
 * numbers in the chapter, the share the proposal uses. Rough, but the same
 * for every model, so two runs compare.
 */
export function faithfulness(said: string, draft: Pick<Draft, 'changes' | 'world' | 'rules' | 'files' | 'say'>): { named: number; kept: number; missing: string[] } {
  const words = new Set<string>()
  for (const sentence of said.split(/(?<=[.!?:])\s+|\n+/)) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'-]*|\d+(?:[.,]\d+)?/g) ?? []
    tokens.forEach((token, i) => {
      if (/^\d/.test(token)) {
        if (token.length > 1 || Number(token) > 1) words.add(token)
      } else if (i > 0 && /^[A-Z][a-z]/.test(token) && !COMMON.has(token)) words.add(token)
    })
  }
  const text = [...draft.changes.map((c) => c.yaml), draft.world ?? '', draft.rules ?? '', ...(draft.files ?? []).map((f) => f.text)].join('\n').toLowerCase()
  const missing = [...words].filter((w) => !text.includes(w.toLowerCase()))
  return { named: words.size, kept: words.size - missing.length, missing }
}
