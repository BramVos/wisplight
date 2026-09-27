import { z } from 'zod'
import type { Keys } from './prompt'
import type { ChronicleInput, ChronicleOutput, Limits, LineOp, LoreOp, NewsOp, QuestOp, ThoughtOp } from './types'

// Reading the reply: the shape must match, every key must be one of this
// overview, and texts must stay within their length. A part that fails is
// dropped with a reason; the rest of the reply stands (design, "Controle").
// Checks that need the world itself (names, who knows what) are the caller's.

const Str = z.string().default('')

const ReplySchema = z.object({
  lookup: z.array(z.string()).default([]),
  lore: z
    .array(z.object({ line: z.string(), name: z.string(), summary: z.string(), details: Str, story: Str, far: Str, teller: Str, links: z.array(z.string()).default([]) }))
    .default([]),
  lines: z
    .array(
      z.object({
        line: z.string(),
        summary: z.array(z.string()).default([]),
        roles: z.array(z.object({ role: z.string(), who: z.string() })).default([]),
        hooks: z.array(z.string()).default([]),
        next: Str,
        close: z.boolean().default(false),
      }),
    )
    .default([]),
  quests: z
    .array(z.object({ request: Str, line: z.string(), template: z.string(), giver: z.string(), item: Str, target: Str, name: z.string(), ask: z.string(), stakes: Str }))
    .default([]),
  thoughts: z.array(z.object({ who: z.string(), text: z.string() })).default([]),
  news: z.array(z.object({ area: z.string(), text: z.string() })).default([]),
})

export interface ReadReply {
  output: ChronicleOutput
  lookups: string[]
  problems: string[]
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

/** Shortens a text to whole sentences within the limit; undefined when not even one fits. */
export function within(text: string, max: number): string | undefined {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (words(clean) <= max) return clean
  const sentences = clean.split(/(?<=[.!?])\s+/)
  let kept = ''
  for (const sentence of sentences) {
    const next = kept ? `${kept} ${sentence}` : sentence
    if (words(next) > max) break
    kept = next
  }
  return kept || undefined
}

export function readReply(text: string, keys: Keys, input: ChronicleInput, limits: Limits): ReadReply {
  const problems: string[] = []
  const output: ChronicleOutput = { lore: [], lines: [], quests: [], thoughts: [], news: [] }
  let json: unknown
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return { output, lookups: [], problems: ['the reply is not JSON'] }
  }
  const parsed = ReplySchema.safeParse(json)
  if (!parsed.success) return { output, lookups: [], problems: [`the reply does not match the schema: ${parsed.error.issues[0]?.message ?? ''}`] }
  const reply = parsed.data

  const lookups = reply.lookup.map((k) => keys.id(k)).filter((id): id is string => Boolean(id))
  if (lookups.length) return { output, lookups: lookups.slice(0, limits.lookups), problems }

  const runLines = new Set(input.lines.map((l) => l.id))
  const as = (key: string, ...kinds: ReturnType<Keys['kindOf']>[]) => {
    const kind = keys.kindOf(key)
    return kind && kinds.includes(kind) ? keys.id(key) : undefined
  }
  const lineOf = (key: string, what: string) => {
    const id = as(key, 'line')
    if (!id || !runLines.has(id)) problems.push(`${what}: unknown storyline ${key}`)
    return id && runLines.has(id) ? id : undefined
  }

  for (const lore of reply.lore) {
    const line = lineOf(lore.line, `lore "${lore.name}"`)
    if (!line) continue
    if (output.lore.length >= limits.lore || output.lore.some((l) => l.line === line)) {
      problems.push(`lore "${lore.name}": one per storyline, ${limits.lore} per run`)
      continue
    }
    const summary = within(lore.summary, limits.textWords)
    const name = lore.name.trim()
    if (!name || !summary) {
      problems.push(`lore for ${lore.line}: no name or summary`)
      continue
    }
    const teller = lore.teller ? as(lore.teller, 'person') : undefined
    if (lore.teller && !teller) problems.push(`lore "${name}": unknown teller ${lore.teller}`)
    const op: LoreOp = {
      line,
      name,
      summary,
      details: within(lore.details, limits.textWords) ?? '',
      story: within(lore.story, limits.storyWords) ?? '',
      far: within(lore.far, limits.textWords) ?? '',
      links: lore.links.map((k) => as(k, 'lore', 'person', 'place')).filter((id): id is string => Boolean(id)),
      ...(teller ? { teller } : {}),
    }
    output.lore.push(op)
  }

  for (const note of reply.lines) {
    const line = lineOf(note.line, 'line note')
    if (!line || output.lines.some((l) => l.line === line)) continue
    const op: LineOp = {
      line,
      summary: note.summary.map((s) => within(s, limits.textWords)).filter((s): s is string => Boolean(s)).slice(0, limits.lineSummary),
      roles: note.roles.map((r) => ({ role: r.role.trim(), who: as(r.who, 'person') })).filter((r): r is { role: string; who: string } => Boolean(r.who && r.role)),
      hooks: note.hooks.map((h) => within(h, limits.textWords)).filter((h): h is string => Boolean(h)).slice(0, 3),
      next: within(note.next, limits.textWords) ?? '',
      close: note.close,
    }
    output.lines.push(op)
  }

  for (const quest of reply.quests) {
    const where = `quest "${quest.name}"`
    if (output.quests.length >= limits.quests) {
      problems.push(`${where}: at most ${limits.quests} per run`)
      continue
    }
    const line = lineOf(quest.line, where)
    const template = input.templates.find((t) => t.kind === quest.template)
    const giver = as(quest.giver, 'person')
    const item = quest.item ? as(quest.item, 'item') : undefined
    const target = quest.target ? as(quest.target, 'person') : undefined
    const request = quest.request ? as(quest.request, 'request') : undefined
    const ask = within(quest.ask, limits.textWords)
    if (!line) continue
    if (!template) problems.push(`${where}: unknown template ${quest.template}`)
    else if (!giver) problems.push(`${where}: unknown giver ${quest.giver}`)
    else if (template.needs.includes('item') && !item) problems.push(`${where}: ${template.kind} needs an item`)
    else if (template.needs.includes('target') && !target) problems.push(`${where}: ${template.kind} needs a target`)
    else if (quest.request && !request) problems.push(`${where}: unknown request ${quest.request}`)
    else if (!ask || !quest.name.trim()) problems.push(`${where}: no name or words to ask with`)
    else {
      const op: QuestOp = { line, template: template.kind, giver, name: quest.name.trim(), ask, stakes: within(quest.stakes, limits.textWords) ?? '' }
      if (request) op.request = request
      if (item) op.item = item
      if (target) op.target = target
      output.quests.push(op)
    }
  }

  for (const thought of reply.thoughts) {
    const who = as(thought.who, 'person')
    const said = within(thought.text, limits.textWords)
    if (!who || !said) problems.push(`thought: unknown person ${thought.who} or no text`)
    else if (output.thoughts.length < limits.thoughts) output.thoughts.push({ who, text: said } satisfies ThoughtOp)
  }

  for (const item of reply.news) {
    const area = as(item.area, 'area')
    const said = within(item.text, limits.textWords)
    if (!area || !said) problems.push(`news: unknown area ${item.area} or no text`)
    else if (!output.news.some((n) => n.area === area)) output.news.push({ area, text: said } satisfies NewsOp)
  }

  return { output, lookups: [], problems }
}
