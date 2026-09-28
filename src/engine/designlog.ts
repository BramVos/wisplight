import { parse } from 'yaml'
import type { ContentFile } from './content'

// The design log of a world (M10.18; Bram, 28 September 2026): what the
// designer asked, what the chronicler said and asked back, and what was
// decided, per proposal; the designer's own notes on why the world is as it
// is; and the answers to the steps still being written, so nothing typed is
// lost. content/<world>/DESIGN.md, kept by the editor, readable by people
// (the Notes may be edited by hand) and by the world book, which makes a
// chapter of it ("How this world was made"). The chronicler gets the notes
// and the last decisions in its prompt, so it does not propose again what
// was turned down and knows what the world is meant to be.
//
// The format, agreed with the world book:
//
//   # Design log: <world name>
//
//   ## Notes
//   - <a note, one line each>
//
//   ## Answers
//   ### <step title>
//     <the answer as typed, lines and tables as they are, indented by two
//     spaces so a pasted heading cannot break the log>
//
//   ## Decisions
//   ### <YYYY-MM-DD HH:MM> · <step title or "Writing aid"> · <decision>
//   - Asked: <what the designer wrote; later lines indented by two spaces>
//   - Chronicler: <what it said>
//   - Questions back: <one per line, or none>
//   - Changed: <what the proposal touched, or nothing>
//   - Reason: <the designer's reason, if given>

export type DesignDecisionKind = 'accepted' | 'changed' | 'rejected' | 'skipped'

export interface DesignDecision {
  /** When, as YYYY-MM-DD HH:MM. */
  at: string
  /** The step's title, or "Writing aid". */
  step: string
  decision: DesignDecisionKind
  asked: string
  say: string
  questions: string[]
  changed: string[]
  reason: string
}

export interface DesignLog {
  notes: string[]
  /** Answers still being written, by step title. */
  answers: Record<string, string>
  decisions: DesignDecision[]
}

const DECISIONS: DesignDecisionKind[] = ['accepted', 'changed', 'rejected', 'skipped']
const HEADING = /^### (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+?) · (accepted|changed|rejected|skipped)\s*$/

/** The path of a world's design log among its files (content/<world>/DESIGN.md). */
export function designPath(files: ContentFile[]): string | undefined {
  const world = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))?.path
  return world ? world.replace(/world\.ya?ml$/, 'DESIGN.md') : undefined
}

/** A world's design log as it stands, empty when it has none. */
export function designLogOf(files: ContentFile[]): DesignLog {
  const path = designPath(files)
  return designLog(path ? files.find((f) => f.path === path)?.text : undefined)
}

/** Reads a design log; whatever does not fit the format is left out, never an error. */
export function designLog(text: string | undefined): DesignLog {
  const log: DesignLog = { notes: [], answers: {}, decisions: [] }
  if (!text) return log
  let section = ''
  let answer: string | undefined
  let decision: DesignDecision | undefined
  let field: keyof Pick<DesignDecision, 'asked' | 'say' | 'questions' | 'changed' | 'reason'> | undefined
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  for (const line of lines) {
    if (/^## /.test(line)) {
      section = line.slice(3).trim().toLowerCase()
      answer = undefined
      decision = undefined
      field = undefined
      continue
    }
    if (section === 'notes') {
      const note = /^- (.+)$/.exec(line)?.[1]?.trim()
      if (note) log.notes.push(note)
    } else if (section === 'answers') {
      const heading = /^### (.+)$/.exec(line)?.[1]?.trim()
      if (heading) {
        answer = heading
        log.answers[answer] = ''
      } else if (answer !== undefined) {
        const own = line.replace(/^ {2}/, '')
        log.answers[answer] = log.answers[answer] ? `${log.answers[answer]}\n${own}` : own
      }
    } else if (section === 'decisions') {
      const heading = HEADING.exec(line)
      if (heading) {
        decision = { at: heading[1]!, step: heading[2]!, decision: heading[3] as DesignDecisionKind, asked: '', say: '', questions: [], changed: [], reason: '' }
        log.decisions.push(decision)
        field = undefined
        continue
      }
      if (!decision) continue
      const item = /^- (Asked|Chronicler|Questions back|Changed|Reason): ?(.*)$/.exec(line)
      if (item) {
        field = ({ Asked: 'asked', Chronicler: 'say', 'Questions back': 'questions', Changed: 'changed', Reason: 'reason' } as const)[item[1] as 'Asked']
        add(decision, field, item[2]!)
      } else if (field && /^ {2}/.test(line)) add(decision, field, line.slice(2), true)
    }
  }
  for (const [step, text] of Object.entries(log.answers)) log.answers[step] = text.replace(/\n+$/, '').replace(/^\n+/, '')
  return log
}

function add(decision: DesignDecision, field: 'asked' | 'say' | 'questions' | 'changed' | 'reason', value: string, more = false): void {
  if (field === 'questions' || field === 'changed') {
    if (!more && /^(none|nothing)$/i.test(value.trim())) return
    if (value.trim()) decision[field].push(value.trim())
    return
  }
  decision[field] = more ? `${decision[field]}\n${value}` : value
}

/** Writes a design log out in the agreed format. */
export function designText(name: string, log: DesignLog): string {
  const out = [`# Design log: ${name}`, '', '## Notes', ...log.notes.map((n) => `- ${oneLine(n)}`), '']
  const answers = Object.entries(log.answers).filter(([, text]) => text.trim())
  if (answers.length) out.push('## Answers', ...answers.flatMap(([step, text]) => [`### ${oneLine(step)}`, ...text.replace(/\n+$/, '').split('\n').map((l) => `  ${l}`), '']))
  out.push('## Decisions')
  for (const d of log.decisions) {
    out.push('', `### ${d.at} · ${oneLine(d.step)} · ${d.decision}`)
    if (d.decision !== 'skipped' || d.asked) out.push(...block('Asked', d.asked))
    if (d.say) out.push(...block('Chronicler', d.say))
    if (d.decision !== 'skipped') {
      out.push(d.questions.length ? `- Questions back: ${d.questions.map(oneLine).join('\n  ')}` : '- Questions back: none')
      out.push(d.changed.length ? `- Changed: ${d.changed.map(oneLine).join('\n  ')}` : '- Changed: nothing')
    }
    if (d.reason) out.push(...block('Reason', d.reason))
  }
  return `${out.join('\n').replace(/\n+$/, '')}\n`
}

/** A field over several lines: the first after the label, the rest indented by two spaces. */
function block(label: string, text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
  return [`- ${label}: ${lines[0] ?? ''}`, ...lines.slice(1).map((l) => `  ${l}`)]
}

function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ').trim()
}

/** The time of a decision, as the log writes it. */
export function designTime(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

/** What the editor asks of the log: a note, the answer to a step as it is being written, or a decision. */
export type DesignChange = { note: string } | { answer: { step: string; text: string } } | { decision: Omit<DesignDecision, 'at'> & { at?: string } }

/** The log with one change made. An answer that is empty goes; a decision on a step clears its answer. */
export function withDesign(log: DesignLog, change: DesignChange, now = new Date()): DesignLog {
  if ('note' in change) {
    const note = oneLine(change.note)
    return note ? { ...log, notes: [...log.notes, note] } : log
  }
  if ('answer' in change) {
    const answers = { ...log.answers }
    if (change.answer.text.trim()) answers[change.answer.step] = change.answer.text.replace(/\n+$/, '')
    else delete answers[change.answer.step]
    return { ...log, answers }
  }
  const d = change.decision
  if (!DECISIONS.includes(d.decision)) return log
  const answers = { ...log.answers }
  if (d.decision !== 'changed') delete answers[d.step]
  return { ...log, answers, decisions: [...log.decisions, { ...d, at: d.at ?? designTime(now) }] }
}

/**
 * What the chronicler hears of the log: the designer's notes, and the last
 * decisions in short, with what was turned down and why, so it does not
 * propose it again. Empty when there is no log.
 */
export function designPrompt(files: ContentFile[], last = 8): string {
  const log = designLogOf(files)
  if (!log.notes.length && !log.decisions.length) return ''
  const lines = ['WHAT THE DESIGNER HAS SAID AND DECIDED BEFORE (keep to it; do not propose again what was turned down):']
  if (log.notes.length) lines.push('Notes:', ...log.notes.map((n) => `- ${n}`))
  const recent = log.decisions.slice(-last)
  if (recent.length) {
    lines.push('Last decisions:')
    for (const d of recent) {
      const what = d.changed.length ? ` (${d.changed.slice(0, 4).join(', ')}${d.changed.length > 4 ? ', ...' : ''})` : ''
      const asked = d.asked ? `: ${oneLine(d.asked).slice(0, 160)}` : ''
      lines.push(`- ${d.step}, ${d.decision}${what}${asked}${d.reason ? ` Reason: ${oneLine(d.reason)}` : ''}`)
    }
  }
  return lines.join('\n')
}

/**
 * The design log of a world after one change, as the editor writes it: the
 * file's path, its new text and the log. Without a change, the log as it
 * stands. Undefined for files without a world.yaml.
 */
export function designUpdate(files: ContentFile[], change?: DesignChange, now = new Date()): { path: string; text: string; log: DesignLog } | undefined {
  const path = designPath(files)
  if (!path) return undefined
  const before = designLogOf(files)
  const log = change ? withDesign(before, change, now) : before
  return { path, text: designText(worldName(files), log), log }
}

/** The name of the world, from its world.yaml, for the heading of the log. */
function worldName(files: ContentFile[]): string {
  const file = files.find((f) => /(^|\/)world\.ya?ml$/.test(f.path))
  try {
    const name = (parse(file?.text ?? '') as { world?: { name?: unknown } } | null)?.world?.name
    return typeof name === 'string' && name.trim() ? name.trim() : 'this world'
  } catch {
    return 'this world'
  }
}

/**
 * What the editor sent, checked: a note, an answer or a decision with text
 * fields of bounded length, or nothing. The main process trusts no shape.
 */
export function readDesignChange(value: unknown): DesignChange | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const text = (x: unknown, max = 20000) => (typeof x === 'string' ? x.slice(0, max) : '')
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string').slice(0, 50).map((i) => i.slice(0, 500)) : [])
  if (typeof v['note'] === 'string') return { note: text(v['note'], 2000) }
  const answer = v['answer'] as Record<string, unknown> | undefined
  if (answer && typeof answer === 'object' && typeof answer['step'] === 'string') return { answer: { step: text(answer['step'], 100), text: text(answer['text']) } }
  const d = v['decision'] as Record<string, unknown> | undefined
  if (d && typeof d === 'object' && typeof d['step'] === 'string' && DECISIONS.includes(d['decision'] as DesignDecisionKind)) {
    return { decision: { step: text(d['step'], 100), decision: d['decision'] as DesignDecisionKind, asked: text(d['asked']), say: text(d['say'], 4000), questions: list(d['questions']), changed: list(d['changed']), reason: text(d['reason'], 2000) } }
  }
  return undefined
}
