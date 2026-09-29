import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SpendSource } from './costs'

// Every model call, for the AI log in the world builder and for debugging
// (FO, chapter 15). Prompts are truncated; API keys never get here.

export interface AiLogEntry {
  time: string
  /** The kind of call (M10.29 U): the schema it answers, talk_reply, npc_goals, world_step. */
  kind?: string
  /** Where the call came from (M10.26): the game, the editor, a trial or a picture run; a line from before is the game's. */
  source?: SpendSource
  role: string
  provider: string
  model: string
  ok: boolean
  error?: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  /** Why nothing came from the cache (M10.26): the fixed part under the model's minimum, or written for the next call. */
  cache?: string
  costUsd?: number
  prompt: string
  response: string
  /** Replies of this call the engine threw away, and why (M10.8): schema, leak, invented, ... */
  rejected?: string[]
  /** What the guard put right in this reply or noted (M10.10): "oath: ...", "not_here: potatoes > turnips", "number: 12 was not given". */
  fixed?: string[]
}

/** How often the guard stepped in, per model and why (M10.10): replies thrown away and things put right. */
export interface GuardCount {
  provider: string
  model: string
  reasons: Record<string, number>
}

const KEEP = 200

/** The whole of a call (M10.29 U): the fixed part, the turns of a talk and the prompt, for the full log. */
export interface WholeCall {
  system?: string
  turns?: { role: string; text: string }[]
  prompt: string
}

/** A name as part of a file name: letters, digits and dashes. */
function fileSafe(name: string): string {
  return name.replace(/[^A-Za-z0-9-]+/g, '-').slice(0, 60) || 'game'
}

/** The full log of a game, or of another source (the editor, a trial), for the day of a call: ai-<game>-<date>.md. */
export function fullLogFile(dir: string, game: string, time: string): string {
  return join(dir, `ai-${fileSafe(game)}-${time.slice(0, 10)}.md`)
}

/** A game's full log from a moment on (M10.29 U: `log export` takes it along beside the story log), or none. */
export function fullLogOf(dir: string, game: string, since?: string): string | undefined {
  if (!existsSync(dir)) return undefined
  const prefix = `ai-${fileSafe(game)}-`
  const days = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.md') && (!since || f.slice(prefix.length, -3) >= since.slice(0, 10))).sort()
  const calls = days.flatMap((f) => readFileSync(join(dir, f), 'utf8').split(/^(?=## \d{4}-)/m)).filter((block) => block.startsWith('## ') && (!since || block.slice(3, 27) >= since))
  return calls.length ? `# The model calls of this game${since ? ` since ${since}` : ''}\n\n${calls.join('')}` : undefined
}

/** Anything that looks like a key never reaches the full log, whatever a prompt held. */
const KEYLIKE = /\b(?:sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})\b/g
const unkeyed = (text: string) => text.replace(KEYLIKE, '[a key]')

/** One call in the full log, as Markdown, readable beside the story log. */
export function fullBlock(entry: AiLogEntry, whole?: WholeCall): string {
  const cache = [`in ${entry.inputTokens}`, `read from the cache ${entry.cachedTokens}`, ...(entry.cache ? [entry.cache] : [])].join(', ')
  const cost = entry.costUsd === undefined ? 'unpriced' : `$${entry.costUsd.toFixed(4)}`
  const parts = [
    `## ${entry.time}  ${entry.role}  ${entry.kind ?? '-'}`,
    '',
    `Model: ${entry.provider}/${entry.model}; ${entry.ok ? 'answered' : `failed (${entry.error ?? 'no reason'})`}; ${cost}; out ${entry.outputTokens}; cache: ${cache}; ${(entry.latencyMs / 1000).toFixed(1)} s.`,
    ...(whole?.system ? ['', '### The fixed part', '', whole.system] : []),
    ...(whole?.turns?.length ? ['', '### The talk so far', '', ...whole.turns.map((t) => `${t.role}: ${t.text}`)] : []),
    '',
    '### Prompt',
    '',
    whole?.prompt ?? entry.prompt,
    '',
    '### Answer',
    '',
    entry.response || '(none)',
    '',
    '',
  ]
  return unkeyed(parts.join('\n'))
}

export class AiLog {
  private readonly entries: AiLogEntry[] = []
  /** The full log a role's last call went to (M10.29 U), for what the guard does with it afterwards. */
  private readonly lastFull = new Map<string, string>()

  constructor(
    private readonly path?: string,
    /** How many calls are kept (M10.20: the player's app knob). */
    private readonly keep: () => number = () => KEEP,
    /** Where a call goes whole (M10.29 U: the knob ai_log_full), or nowhere. */
    private readonly full?: (entry: AiLogEntry) => string | undefined,
  ) {
    if (path) mkdirSync(dirname(path), { recursive: true })
  }

  add(entry: AiLogEntry, whole?: WholeCall): void {
    const trimmed = { ...entry, prompt: entry.prompt.slice(0, 4000), response: entry.response.slice(0, 2000) }
    this.entries.push(trimmed)
    const keep = this.keep()
    if (this.entries.length > keep) this.entries.splice(0, this.entries.length - keep)
    if (this.path) appendFileSync(this.path, `${JSON.stringify(trimmed)}\n`, { mode: 0o600 })
    const file = this.full?.(entry)
    if (file) {
      mkdirSync(dirname(file), { recursive: true })
      appendFileSync(file, fullBlock(entry, whole), { mode: 0o600 })
      this.lastFull.set(entry.role, file)
    }
  }

  /** What the guard did with the last call of a role, under it in the full log. */
  private guardNote(role: string, note: string): void {
    const file = this.lastFull.get(role)
    if (file && this.full) appendFileSync(file, `Guard (${role}): ${unkeyed(note)}\n\n`, { mode: 0o600 })
  }

  /** The engine threw away the last reply of this role (M10.8): the reason goes with that call. */
  reject(role: string, reason: string): void {
    const last = [...this.entries].reverse().find((e) => e.role === role && e.ok)
    if (!last) return
    ;(last.rejected ??= []).push(reason)
    if (this.path) appendFileSync(this.path, `${JSON.stringify({ time: last.time, role, rejected: reason })}\n`, { mode: 0o600 })
    this.guardNote(role, `threw the answer away: ${reason}`)
  }

  /** Text the guard held back before any call (M10.19): a line of its own, with the reason and the text, cut like a prompt. */
  hold(role: string, reason: string, text: string, time: string): void {
    this.add({ time, role, provider: 'guard', model: '-', ok: false, error: `held back: ${reason}`, latencyMs: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, prompt: text, response: '', rejected: [reason] })
  }

  /** A line the rules answered without a model (M10.28): in the log beside the calls, at no cost. */
  byRule(role: string, why: string, said: string, time: string, source: SpendSource): void {
    this.add({ time, source, role, provider: 'rules', model: 'by rule', ok: true, latencyMs: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, prompt: said, response: why })
  }

  /** The guard put something right in the last reply of this role, or noted it (M10.10). */
  fix(role: string, what: string): void {
    const last = [...this.entries].reverse().find((e) => e.role === role && e.ok)
    if (!last) return
    ;(last.fixed ??= []).push(what)
    if (this.path) appendFileSync(this.path, `${JSON.stringify({ time: last.time, role, fixed: what })}\n`, { mode: 0o600 })
    this.guardNote(role, `put right: ${what}`)
  }

  /** Per model, how often the guard threw a reply away or put one right, and why (M10.10), over the calls kept here. */
  guardCounts(): GuardCount[] {
    const out = new Map<string, GuardCount>()
    for (const e of this.entries) {
      const reasons = [...(e.rejected ?? []), ...(e.fixed ?? []).map((f) => f.split(':')[0]!)]
      if (!reasons.length) continue
      const key = `${e.provider}/${e.model}`
      const count = out.get(key) ?? { provider: e.provider, model: e.model, reasons: {} }
      for (const r of reasons) count.reasons[r] = (count.reasons[r] ?? 0) + 1
      out.set(key, count)
    }
    return [...out.values()]
  }

  /**
   * The last calls, newest first: from the file, so a trial, the editor or a
   * picture run in another process shows too (M10.26), each with its source;
   * without a file, this process's own.
   */
  recent(count = 50): AiLogEntry[] {
    if (!this.path || !existsSync(this.path)) return this.entries.slice(-count).reverse()
    const size = statSync(this.path).size
    // A call's line is at most some 6 kB (prompt and reply are cut); read enough of the end for the count asked.
    const length = Math.min(size, count * 7000)
    const buffer = Buffer.alloc(length)
    const fd = openSync(this.path, 'r')
    try {
      readSync(fd, buffer, 0, length, size - length)
    } finally {
      closeSync(fd)
    }
    const lines = buffer.toString('utf8').split('\n')
    if (length < size) lines.shift()
    const calls: AiLogEntry[] = []
    for (const line of lines) {
      if (!line.trim()) continue
      let e: Partial<AiLogEntry> & { rejected?: string | string[]; fixed?: string | string[] }
      try {
        e = JSON.parse(line) as typeof e
      } catch {
        continue
      }
      // A reason added to an earlier call (reject, fix): with that call.
      if (!('provider' in e)) {
        const call = [...calls].reverse().find((c) => c.time === e.time && c.role === e.role)
        if (call && typeof e.rejected === 'string') (call.rejected ??= []).push(e.rejected)
        if (call && typeof e.fixed === 'string') (call.fixed ??= []).push(e.fixed)
        continue
      }
      calls.push(e as AiLogEntry)
    }
    return calls.slice(-count).reverse()
  }

  /** Spend in the last hour of real time. */
  spentLastHour(now = Date.now()): number {
    const since = now - 60 * 60 * 1000
    return this.entries.filter((e) => Date.parse(e.time) >= since).reduce((sum, e) => sum + (e.costUsd ?? 0), 0)
  }
}
