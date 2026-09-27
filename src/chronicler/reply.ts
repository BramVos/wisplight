import { z } from 'zod'
import type { Keys } from './prompt'
import { lookupId, parseLookup } from './lookup'
import { PHASES, type CardKind, type ChronicleInput, type ChronicleOutput, type Limits, type LineOp, type LoreOp, type NewsOp, type Phase, type PlanEffectOp, type PlanOp, type QuestOp, type StepOp, type ThoughtOp } from './types'

// Reading the reply: the shape must match, every key must be one of this
// overview, and texts must stay within their length. A part that fails is
// dropped with a reason; the rest of the reply stands (design, "Controle").
// Checks that need the world itself (names, who knows what) are the caller's.

const Str = z.string().default('')

const ReplySchema = z.object({
  lookup: z.array(z.string()).default([]),
  lore: z
    .array(
      z.object({
        line: z.string(),
        name: z.string(),
        summary: z.string(),
        details: Str,
        story: Str,
        far: Str,
        teller: Str,
        links: z.array(z.string()).default([]),
        claims: z.array(z.object({ event: z.string(), subject: z.string(), key: z.string(), value: z.string() })).default([]),
      }),
    )
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
        phase: Str,
      }),
    )
    .default([]),
  quests: z
    .array(z.object({ request: Str, line: z.string(), template: z.string(), giver: z.string(), item: Str, target: Str, name: z.string(), ask: z.string(), stakes: Str }))
    .default([]),
  thoughts: z.array(z.object({ who: z.string(), text: z.string() })).default([]),
  news: z.array(z.object({ area: z.string(), text: z.string() })).default([]),
  tensions: z.array(z.object({ between: z.array(z.string()), delta: z.number(), why: z.string() })).default([]),
  plans: z
    .array(
      z.object({
        line: Str,
        signal: Str,
        name: z.string(),
        phases: z.array(z.object({ after: z.number(), effects: z.array(z.record(z.string(), z.union([z.string(), z.number()]))) })).default([]),
        steps: z.array(z.object({ after: z.number(), verb: z.string(), who: z.array(z.string()).default([]), target: Str, detail: Str })).default([]),
      }),
    )
    .default([]),
})

const STATES = ['flooded', 'damaged', 'destroyed', 'abandoned', 'occupied', 'normal'] as const
const MAX_PLAN_EFFECTS = 10
const MAX_STEPS = 10

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

  // A key to know more about, or a question (M9.3): knows <person> <topic>, why <storyline>, bond <person> <person>, near <place>.
  const lookups = reply.lookup
    .map((k) => {
      const q = parseLookup(k, (key) => keys.id(key))
      return q ? lookupId(q) : keys.id(k)
    })
    .filter((id): id is string => Boolean(id))
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
      // Claims in ids; a value that is a key becomes its id too. What does not resolve stays as written, for the caller to refuse.
      claims: lore.claims.map((c) => ({ event: as(c.event, 'event') ?? c.event, subject: as(c.subject, 'person', 'place', 'item', 'area') ?? c.subject, key: c.key.trim(), value: as(c.value, 'person', 'place', 'item', 'area') ?? c.value.trim() })),
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
    if (PHASES.includes(note.phase as Phase)) op.phase = note.phase as Phase
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

  // Realms: one small shift at most, only when realms were given.
  for (const t of reply.tensions.slice(0, 1)) {
    const [a, b] = t.between.map((k) => as(k, 'realm'))
    const why = within(t.why, limits.textWords)
    if (!input.realms?.length || !a || !b || a === b || !why) problems.push('tension: needs two different realms and a reason')
    else (output.tensions ??= []).push({ between: [a, b], delta: Math.max(-5, Math.min(5, Math.round(t.delta))), why })
  }
  if (reply.tensions.length > 1) problems.push('tensions: one per run')

  // Plans: for storylines marked PLAN (phases and steps), for signals to plan for (steps),
  // and one beat for any other storyline of the run (one step); in the caller's verbs, within bounds.
  const beaten = new Set<string>()
  for (const plan of reply.plans) {
    const where = `plan "${plan.name}"`
    const signal = plan.signal ? as(plan.signal, 'signal') : undefined
    const line = plan.line ? as(plan.line, 'line') : undefined
    const marked = Boolean(line && input.mayPlan?.includes(line))
    if (plan.signal && !signal) {
      problems.push(`${where}: unknown signal ${plan.signal}`)
      continue
    }
    if (!signal && (!line || !runLines.has(line))) {
      problems.push(`${where}: not a storyline or signal to plan for`)
      continue
    }
    if (!signal && !marked && !input.verbs?.length) {
      problems.push(`${where}: not a storyline to plan for`)
      continue
    }
    if (!signal && !marked && beaten.has(line!)) {
      problems.push(`${where}: one beat per storyline`)
      continue
    }
    let count = 0
    const phases: PlanOp['phases'] = []
    for (const phase of marked ? plan.phases.slice(0, 3) : []) {
      const effects: PlanEffectOp[] = []
      for (const e of phase.effects) {
        if (count >= MAX_PLAN_EFFECTS) break
        const effect = planEffect(e)
        if (effect) {
          effects.push(effect)
          count++
        } else problems.push(`${where}: an effect outside the vocabulary: ${JSON.stringify(e)}`)
      }
      if (effects.length) phases.push({ after: Math.max(0, Math.min(240, Math.round(phase.after))), effects })
    }
    const steps: StepOp[] = []
    const max = signal || marked ? MAX_STEPS : 1
    for (const s of plan.steps) {
      if (steps.length >= max) {
        problems.push(`${where}: at most ${max} step${max === 1 ? '' : 's'}`)
        break
      }
      const verb = input.verbs?.find((v) => v.name === s.verb)
      const who = s.who.map((k) => as(k, 'person'))
      const target = s.target ? keys.id(s.target) : undefined
      const detail = s.detail ? within(s.detail, limits.textWords) : undefined
      if (!verb) problems.push(`${where}: a verb outside the list: ${s.verb}`)
      else if (who.some((w) => !w)) problems.push(`${where}: ${s.verb} with someone unknown`)
      else if ((verb.who === 'one' && who.length !== 1) || (verb.who === 'two' && who.length !== 2) || (verb.who === 'many' && !who.length) || (verb.who === 'none' && who.length)) problems.push(`${where}: ${s.verb} needs ${verb.who} person${verb.who === 'one' ? '' : 's'}`)
      else if (verb.target && (!target || !verb.target.includes(keys.kindOf(s.target) as CardKind))) problems.push(`${where}: ${s.verb} needs a target of ${verb.target.join(' or ')}`)
      else if (verb.detail && !detail) problems.push(`${where}: ${s.verb} needs ${verb.detail}`)
      else steps.push({ after: Math.max(0, Math.min(720, Math.round(s.after))), verb: verb.name, who: who as string[], ...(target ? { target } : {}), ...(detail ? { detail } : {}) })
    }
    if (!plan.name.trim() || (!phases.length && !steps.length)) continue
    if (!signal && !marked) beaten.add(line!)
    ;(output.plans ??= []).push({ ...(line ? { line } : {}), ...(signal ? { signal } : {}), name: plan.name.trim(), phases, ...(steps.length ? { steps } : {}) })
  }

  return { output, lookups: [], problems }

  function planEffect(e: Record<string, string | number>): PlanEffectOp | undefined {
    if (typeof e['place'] === 'string') {
      const place = as(e['place'], 'place')
      const state = STATES.find((s) => s === e['state'])
      return place && state ? { place, state } : undefined
    }
    if (typeof e['news'] === 'string') {
      const area = as(String(e['area'] ?? ''), 'area')
      const said = within(e['news'], limits.textWords)
      return area && said ? { news: said, area } : undefined
    }
    if (typeof e['market'] === 'string') {
      const item = as(e['market'], 'item')
      const factor = Number(e['factor'])
      return item && factor >= 0.5 && factor <= 1.5 ? { market: item, factor } : undefined
    }
    if (typeof e['flee'] === 'string') {
      const area = as(e['flee'], 'area')
      const to = as(String(e['to'] ?? ''), 'place')
      const days = Math.max(1, Math.min(14, Math.round(Number(e['days']) || 1)))
      return area && to ? { flee: area, to, days } : undefined
    }
    return undefined
  }
}
