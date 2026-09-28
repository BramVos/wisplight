import { GameClock } from './clock'
import type { LlmRequest } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import { ledgerOf } from './economy/ledger'
import { knob } from './knobs'
import { recordFact } from './news'
import { setAreaMood } from './quests/plans'
import { worldText } from './safety'
import { tensionOf } from './social/realms'
import type { Driver, Tide } from './tideschema'
import { season } from './weather'
import type { World } from './world'

// The great lines (M10.22; Bram, 28 September 2026). A layer that thinks per
// month, not per night: per great danger of a world (a war between two
// realms, a flood, a famine, a plague, an uprising, in the content's `tides`)
// the engine adds up what pushes it every day, and on the first day of each
// month judges each line once: nothing, a threat (a mood of threat in its
// areas, news, prices up), or the event itself, a plan of the content that
// the engine plays, with a fact of belang 5. At most one event per season per
// line, and a cooldown after it. With a model the chronicler judges, within
// what the rules allow; without one the rule does it at the thresholds.

const DAY = 24 * 60

export type Judged = 'nothing' | 'threat' | 'event'

/** Where a line stands in a game. */
export interface TideState {
  pressure: number
  stage: 'calm' | 'threat' | 'event'
  /** What pushed it on the last day it moved, for the chronicler and the journal. */
  moved: string[]
  /** When it broke. */
  events: number[]
  cooldownUntil?: number
  /** Every judgement, with why (the chronicle of the line). */
  history: { t: number; judged: Judged; pressure: number; why: string }[]
}

export interface TidesState {
  lines: Record<string, TideState>
  /** A month's judgement waiting for the chronicler. */
  pending?: boolean
}

/** What the chronicler answers: one judgement per line. */
export interface TidesReply {
  lines: { id: string; judged: string; why: string }[]
}

function tidesState(world: World): TidesState {
  return (world.state.tides ??= { lines: {} })
}

export function tideState(world: World, id: string): TideState {
  return (tidesState(world).lines[id] ??= { pressure: 0, stage: 'calm', moved: [], events: [], history: [] })
}

/** How much a driver pushes today, and in what words. */
function push(world: World, d: Driver): { weight: number; what: string } | undefined {
  if ('fact' in d) {
    const since = world.now - DAY
    const facts = (world.state.news?.facts ?? []).filter(
      (f) =>
        f.t > since &&
        (!d.fact.kind || f.kind === d.fact.kind || f.pattern === d.fact.kind) &&
        (d.fact.belang === undefined || f.belang >= d.fact.belang) &&
        (!d.fact.about || f.about.includes(d.fact.about)) &&
        (!d.fact.by || f.by === 'player' || f.about.includes('player')),
    )
    return facts.length ? { weight: facts.length * d.weight, what: facts.map((f) => f.title).join('; ') } : undefined
  }
  if ('tension' in d) {
    const t = tensionOf(world, d.tension[0], d.tension[1])
    return t >= d.at_least ? { weight: d.weight, what: `tension ${Math.round(t)} between ${d.tension.map((r) => world.content.realms.get(r)?.name ?? r).join(' and ')}` } : undefined
  }
  if ('season' in d) return season(world.now, world) === d.season ? { weight: d.weight, what: d.season } : undefined
  if ('short' in d) {
    const short = ledgerOf(world, d.short.settlement)?.short ?? {}
    const items = Object.entries(short).filter(([item, days]) => days > 0 && (!d.short.item || item === d.short.item))
    return items.length ? { weight: d.weight, what: `${d.short.settlement} short of ${items.map(([i]) => world.content.items.get(i)?.name ?? i).join(', ')}` } : undefined
  }
  return world.state.flags?.[d.flag] ? { weight: d.weight, what: d.flag } : undefined
}

/**
 * Once a day (M10.22): each line takes what pushes it today, and loses a
 * little of what it had (the world calms when nothing pushes).
 */
export function tidesDay(world: World): void {
  const lines = [...world.content.tides.values()]
  if (!lines.length) return
  const decay = knob(world, 'tides.decay')
  for (const tide of lines) {
    const st = tideState(world, tide.id)
    const pushed = tide.drivers.map((d) => push(world, d)).filter((p): p is { weight: number; what: string } => Boolean(p))
    const add = pushed.reduce((sum, p) => sum + p.weight, 0)
    st.pressure = Math.max(0, Math.round((st.pressure * (1 - decay) + add) * 100) / 100)
    if (pushed.length) st.moved = pushed.map((p) => p.what)
  }
}

/** Whether a line may break now: out of its cooldown, and not yet this season. */
function mayBreak(world: World, tide: Tide, st: TideState): boolean {
  if (st.cooldownUntil !== undefined && world.now < st.cooldownUntil) return false
  const last = st.events.at(-1)
  return last === undefined || !(season(last, world) === season(world.now, world) && world.now - last < knob(world, 'tides.cooldown_days') * DAY)
}

/** What a line may be judged now, by the rules: the chronicler chooses among these. */
export function allowed(world: World, tide: Tide): Judged[] {
  const st = tideState(world, tide.id)
  if (st.pressure < tide.threat) return ['nothing']
  if (st.pressure < tide.threshold || !mayBreak(world, tide, st)) return ['nothing', 'threat']
  return ['threat', 'event']
}

/** The rule, without a model: at the threshold it breaks, from the threat it threatens. */
function byRule(world: World, tide: Tide): Judged {
  const may = allowed(world, tide)
  return may.includes('event') ? 'event' : may.includes('threat') ? 'threat' : 'nothing'
}

/** Whether today is the first of a month, at the hour of the nightly round. */
export function monthBegins(world: World): boolean {
  const p = new GameClock(world.now).parts
  return p.day === 1 && p.hour === 4 && p.minute === 0
}

/**
 * The first day of the month (M10.22), in the nightly round: each line is
 * judged once. With a model the chronicler judges; without one the rule.
 */
export function tidesMonth(world: World): void {
  if (!world.content.tides.size || !monthBegins(world)) return
  if (world.aiLive) tidesState(world).pending = true
  else applyTides(world, null)
}

/**
 * The request for the chronicler: per line where it stands, what pushed it,
 * and what the rules allow; one judgement each, with why. The stable part
 * first (the frame and the rules), the month's lines after it.
 */
export function tidesRequest(world: World): LlmRequest {
  const big = (world.state.news?.facts ?? []).filter((f) => f.belang >= 4 && world.now - f.t < 30 * DAY).map((f) => `  ${f.title}`)
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  return {
    role: 'chronicler',
    system: [
      worldText(worldFrame(world.content)),
      '',
      'Once a month you judge the great lines of this world: the great dangers that grow in the background, with or without the stranger. For each line choose one thing from what it ALLOWS: nothing, threat (people feel it coming: a mood, news, prices up) or event (it breaks now: the world plays it out). Choose the event only where the line has truly come to it; a world where great things happen every month is a poorer world. Say why in one plain sentence.',
      'JSON only.',
    ].join('\n'),
    prompt: [
      'LINES:',
      ...[...world.content.tides.values()].map((t) => {
        const st = tideState(world, t.id)
        return `  ${t.id}: ${t.name} (${t.kind}, in ${t.areas.map((a) => world.content.areas.get(a)?.name ?? a).join(', ')}). Pressure ${Math.round(st.pressure)}; it may threaten from ${t.threat} and break from ${t.threshold}. Now: ${st.stage}. Pushed lately by: ${st.moved.join('; ') || 'nothing'}. ALLOWS: ${allowed(world, t).join(', ')}.`
      }),
      ...(big.length ? ['BIG NEWS OF THE MONTH:', ...big] : []),
    ].join('\n'),
    schemaName: 'tides',
    schema: object({ lines: { type: 'array', items: object({ id: text, judged: text, why: text }) } }),
    maxTokens: 600,
    meta: { tides: [...world.content.tides.keys()], allowed: Object.fromEntries([...world.content.tides.values()].map((t) => [t.id, allowed(world, t)])) },
  }
}

/** The chronicler's reply, or null when it cannot be read. */
export function tidesReply(text: string): TidesReply | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as TidesReply
    return Array.isArray(v.lines) ? v : null
  } catch {
    return null
  }
}

/** A place in an area, for its news. */
function placeIn(world: World, area: string): string {
  return [...world.content.locations.values()].find((l) => l.area === area)?.id ?? world.content.world.start.location
}

/**
 * The month's judgement, applied: the chronicler's where it keeps to what the
 * rules allow, else the rule's. Each is kept in the line's history and in the
 * chronicle (a fact of belang 0 that nobody tells); a threat sets its mood,
 * news and prices; an event records its fact of belang 5 and waits its plan,
 * which the engine plays.
 */
export function applyTides(world: World, reply: TidesReply | null): void {
  const state = tidesState(world)
  state.pending = false
  for (const tide of [...world.content.tides.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const st = tideState(world, tide.id)
    const may = allowed(world, tide)
    const said = reply?.lines.find((l) => l.id === tide.id)
    const theirs = said && may.includes(said.judged as Judged) ? (said.judged as Judged) : undefined
    const judged = theirs ?? byRule(world, tide)
    const why = theirs && typeof said!.why === 'string' && said!.why.trim() && said!.why.length < 240 ? said!.why.trim() : `pressure ${Math.round(st.pressure)} of ${tide.threshold}`
    st.history.push({ t: world.now, judged, pressure: st.pressure, why })
    if (st.history.length > 24) st.history.splice(0, st.history.length - 24)
    const where = placeIn(world, tide.areas[0]!)
    recordFact(world, { kind: 'tide_judged', about: [], place: where, belang: 0, witnesses: [], title: `${tide.name}: ${judged}`, text: { precise: why, village: why, far: why } })
    if (judged === 'nothing') {
      st.stage = 'calm'
      continue
    }
    if (judged === 'threat') {
      st.stage = 'threat'
      const t = tide.threatens
      for (const area of tide.areas) {
        setAreaMood(world, area, 'threat', t.days, t.line)
        if (t.prices > 1) (world.state.prices ??= {})[area] = { factor: t.prices, until: world.now + t.days * DAY }
      }
      recordFact(world, { kind: 'tide_threat', about: [], place: where, belang: 3, title: tide.name, text: { precise: t.news, village: t.news, far: t.news } })
      continue
    }
    // It breaks: the fact of belang 5, and the plan of the content, which the engine plays from the next hour.
    const fact = recordFact(world, { kind: 'tide', about: [], place: where, belang: 5, title: tide.breaks.title, text: { precise: tide.breaks.precise, village: tide.breaks.village, far: tide.breaks.far } })
    ;(world.state.pendingPlans ??= []).push(tide.plan)
    ;(world.state.pendingCauses ??= {})[tide.plan] = fact.id
    st.stage = 'event'
    st.events.push(world.now)
    st.cooldownUntil = world.now + (tide.cooldown ?? knob(world, 'tides.cooldown_days')) * DAY
    st.pressure = 0
  }
}
