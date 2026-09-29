import { emptyOutput, type ChronicleOutput, type NamedOp, type QuestOp } from '../chronicler'
import { applyOutput } from './chronicler'
import type { Output } from './commands'
import { offer } from './choice'
import { knob } from './knobs'
import { callName } from './content'
import { applyExpansion, type ExpansionAsk, type ExpansionOutline } from './growth/expansion'
import { applyWeave, type WeaveReply } from './growth/weave'
import { sketchById } from './sketches'
import type { ChronicleRun, Offered } from './state'
import { applyTides, type TidesReply } from './tides'
import type { World } from './world'

// Play modes (M10.24; Bram, 28 September 2026: the player sets the frames
// once and plays on, while the AI keeps bringing new places, stories, events
// and people; whoever wants a say can have one, but most players do not want
// to be asked). One setting, for the chronicler, the weave and the great
// lines; never for talks or improvising.
//
// - continue (the default): the chronicler makes what it makes within the
//   frames and the budget, and the chronicle says what came and why.
// - think: what a night round starts that is new (a request someone brings,
//   a letter or a visit) waits for the morning and comes as a choice in the
//   world: take one, or none, and the rest lies a week.
// - direct: what the chronicler, the weave or the month's judgement would do
//   is first a proposal, readable as a list of changes, which the player
//   accepts or rejects; rejected, the rules do it as without a model.

export type PlayMode = 'continue' | 'think' | 'direct'
export const PLAY_MODES: readonly PlayMode[] = ['continue', 'think', 'direct']

export function playModeOf(world: Pick<World, 'state'>): PlayMode {
  return world.state.playMode ?? 'continue'
}

const DAY = 24 * 60

/** Something new a night round brought, waiting for the player's choice (think). */
export interface HeldHook {
  id: string
  t: number
  until: number
  /** The run it came from, as it was, and what it was offered: applied as that run when taken. */
  run: ChronicleRun
  offered?: Offered
  quest?: QuestOp
  named?: NamedOp
  label: string
  /** Put to the player once, in the morning. */
  shown?: boolean
}

/** What the chronicler, the weave or the month's judgement would do, waiting for the player (direct). */
export interface Proposal {
  id: string
  t: number
  kind: 'chronicle' | 'weave' | 'tides' | 'expansion'
  run?: ChronicleRun
  offered?: Offered
  output?: ChronicleOutput | null
  key?: string
  weave?: WeaveReply | null
  tides?: TidesReply | null
  /** What a round at the edge would chart (M10.21). */
  expansion?: { ask: ExpansionAsk; outline: ExpansionOutline }
  /** The changes, one a line, as the player reads them. */
  lines: string[]
}

export interface ModesState {
  seq: number
  hooks: HeldHook[]
  proposals: Proposal[]
}

function modes(world: World): ModesState {
  return (world.state.modes ??= { seq: 0, hooks: [], proposals: [] })
}

const nameOf = (world: World, id: string) => (world.content.npcs.has(id) ? callName(world.npc(id)) : id)

// ---------------------------------------------------------------- think: hooks

/**
 * In think mode, the new things of a night round wait: a request someone
 * would bring and a named one's letter or visit are held as hooks, and the
 * rest of the round goes on as it is. Returns what is applied now.
 */
export function holdHooks(world: World, run: ChronicleRun, output: ChronicleOutput, offered?: Offered): ChronicleOutput {
  if (playModeOf(world) !== 'think') return output
  const fresh = output.quests.filter((q) => !q.request)
  const named = (output.named ?? []).slice(0, 1)
  if (!fresh.length && !named.length) return output
  const m = modes(world)
  for (const quest of fresh) {
    m.hooks.push({ id: `hook_${++m.seq}`, t: world.now, until: world.now + knob(world, 'story.hook_days') * DAY, run, ...(offered ? { offered } : {}), quest, label: `${nameOf(world, quest.giver)} wants a word with you: ${quest.name}` })
  }
  for (const op of named) {
    const sk = sketchById(world, op.who)
    const label = sk ? (op.how === 'letter' ? `A letter comes for ${nameOf(world, sk.of)} from ${sk.name}` : `${sk.name}, ${nameOf(world, sk.of)}'s ${sk.bond}, comes to stay`) : 'Someone spoken of comes into the story'
    m.hooks.push({ id: `hook_${++m.seq}`, t: world.now, until: world.now + knob(world, 'story.hook_days') * DAY, run, ...(offered ? { offered } : {}), named: op, label })
  }
  return { ...output, quests: output.quests.filter((q) => q.request), named: [] }
}

/** Hooks still waiting, and those whose week is out dropped. */
export function waitingHooks(world: World): HeldHook[] {
  const m = world.state.modes
  if (!m) return []
  m.hooks = m.hooks.filter((h) => h.until > world.now)
  return m.hooks
}

/**
 * In the morning (from six), what the night brought is put to the player as
 * a choice in the world, once: take one, or none; the rest lies a week.
 */
export function morningHooks(world: World): Output[] {
  const hour = Math.floor((world.now % DAY) / 60)
  if (hour < 6 || world.state.choice || world.state.talk || world.state.combat) return []
  const fresh = waitingHooks(world).filter((h) => !h.shown)
  if (!fresh.length) return []
  for (const h of fresh) h.shown = true
  return hookChoice(world, 'The morning brings something new. Take it up, or let it lie a week:')
}

/** The waiting hooks as a choice (HOOKS). */
export function hookChoice(world: World, question = 'Waiting for you:'): Output[] {
  const hooks = waitingHooks(world)
  if (!hooks.length) return [{ kind: 'text', text: 'Nothing new is waiting for you.' }]
  return offer(world, question, [...hooks.map((h) => ({ label: h.label, command: `hook ${h.id}` })), { label: 'Let it all lie for now', command: 'hooks later' }])
}

/** Takes one hook up (HOOK <id>): it happens now, as the round that brought it would have done it. */
export function takeHook(world: World, id: string): Output[] {
  const m = world.state.modes
  const hook = waitingHooks(world).find((h) => h.id === id)
  if (!m || !hook) return [{ kind: 'error', text: 'That is no longer waiting.' }]
  m.hooks = m.hooks.filter((h) => h !== hook)
  const problems = applyOutput(world, hook.run, { ...emptyOutput(), quests: hook.quest ? [hook.quest] : [], named: hook.named ? [hook.named] : [] }, 'chronicler', hook.offered)
  if (problems.length) return [{ kind: 'text', text: 'It came to nothing after all: the moment has passed.' }]
  const request = hook.quest ? world.state.requests.find((r) => r.npc === hook.quest!.giver && r.status === 'open' && r.name === hook.quest!.name) : undefined
  return [{ kind: 'narration', text: request ? `${nameOf(world, hook.quest!.giver)} will be glad to see you: "${hook.quest!.ask}"` : `${hook.label}.` }]
}

// ---------------------------------------------------------------- direct: proposals

/** The changes a round of the chronicler would make, one a line, as the player reads them. */
export function chronicleLines(world: World, output: ChronicleOutput): string[] {
  const out: string[] = []
  for (const l of output.lore) out.push(`+ lore: ${l.name}. ${l.summary}`)
  for (const l of output.lines) out.push(`~ storyline ${l.line}: ${l.close ? 'closes' : `next, ${l.next}`}`)
  for (const q of output.quests) out.push(`${q.request ? '~' : '+'} request of ${nameOf(world, q.giver)}: ${q.name}. "${q.ask}"`)
  for (const t of output.thoughts) out.push(`+ on ${nameOf(world, t.who)}'s mind: ${t.text}`)
  for (const n of output.news) out.push(`+ news in ${world.content.areas.get(n.area)?.name ?? n.area}: ${n.text}`)
  for (const t of output.tensions ?? []) out.push(`~ ${t.between.map((r) => world.content.realms.get(r)?.name ?? r).join(' and ')}: ${t.delta > 0 ? '+' : ''}${t.delta}, ${t.why}`)
  for (const p of output.plans ?? []) out.push(`+ plan: ${p.name}`)
  for (const n of output.named ?? []) out.push(`+ ${sketchById(world, n.who)?.name ?? n.who} by ${n.how}: ${n.text}`)
  return out.length ? out : ['(nothing new)']
}

function weaveLines(world: World, reply: WeaveReply | null): string[] {
  if (!reply) return ['(nothing)']
  return [
    ...reply.bonds.map((b) => `+ bond: ${nameOf(world, b.a)} and ${nameOf(world, b.b)}, ${b.role}: ${b.why}`),
    ...reply.secrets.map((s) => `+ secret of ${nameOf(world, s.who)}: ${s.text}`),
    ...(reply.thread ? [`+ request: ${reply.thread.name}. "${reply.thread.ask}"`] : []),
    ...(reply.echo ? [`+ a storyline runs on here: ${reply.echo.text}`] : []),
  ]
}

function expansionLines(e: Proposal['expansion']): string[] {
  if (!e) return ['(nothing)']
  const o = e.outline
  return [`+ ${o.kind === 'land' ? 'a land' : 'a region'} ${e.ask.wind}, ${o.days} day${o.days === 1 ? '' : 's'} on: ${o.name}. ${o.summary}`, ...o.districts.map((d) => `+ quarter: ${d.name}. ${d.line}`), `  why: ${o.why}`]
}

function tidesLines(world: World, reply: TidesReply | null): string[] {
  return (reply?.lines ?? []).map((l) => `~ ${world.content.tides.get(l.id)?.name ?? l.id}: ${l.judged}. ${l.why}`)
}

/** In direct mode, what would happen waits as a proposal; says whether it did. */
export function propose(world: World, p: Omit<Proposal, 'id' | 't' | 'lines'>): boolean {
  if (playModeOf(world) !== 'direct') return false
  const m = modes(world)
  const lines = p.kind === 'chronicle' ? chronicleLines(world, p.output ?? emptyOutput()) : p.kind === 'weave' ? weaveLines(world, p.weave ?? null) : p.kind === 'expansion' ? expansionLines(p.expansion) : tidesLines(world, p.tides ?? null)
  m.proposals.push({ ...p, id: `proposal_${++m.seq}`, t: world.now, lines })
  return true
}

/** The waiting proposals, as the player reads them (PROPOSALS). */
export function proposalsText(world: World): Output[] {
  const waiting = world.state.modes?.proposals ?? []
  if (!waiting.length) return [{ kind: 'text', text: 'The chronicler proposes nothing just now.' }]
  const what = { chronicle: 'The night round', weave: 'The new people of a district', tides: "The month's judgement of the great lines", expansion: 'What lies beyond the edge' }
  return [{ kind: 'text', text: [`The chronicler proposes (ACCEPT or REJECT, the first first):`, ...waiting.flatMap((p) => [`${what[p.kind]} (${p.id}):`, ...p.lines.map((l) => `  ${l}`)])].join('\n') }]
}

/**
 * The player's answer to a proposal (ACCEPT / REJECT): accepted, it happens
 * as the model would have done it; rejected, the rules do it, as without a
 * model.
 */
export function decide(world: World, accept: boolean, id?: string): Output[] {
  const m = world.state.modes
  const p = id ? m?.proposals.find((x) => x.id === id) : m?.proposals[0]
  if (!m || !p) return [{ kind: 'error', text: 'The chronicler proposes nothing just now.' }]
  m.proposals = m.proposals.filter((x) => x !== p)
  if (p.kind === 'chronicle' && p.run) applyOutput(world, p.run, accept ? (p.output ?? null) : null, accept && p.output ? 'chronicler' : 'template', p.offered)
  else if (p.kind === 'weave' && p.key) applyWeave(world, p.key, accept ? (p.weave ?? null) : null)
  else if (p.kind === 'tides') applyTides(world, accept ? (p.tides ?? null) : null)
  else if (p.kind === 'expansion' && p.expansion && accept) applyExpansion(world, p.expansion.ask, p.expansion.outline)
  return [{ kind: 'system', text: accept ? 'Done as proposed.' : 'Not that: the world takes its own course.' }]
}

/** The journal page of what waits (M10.24): the play mode, the hooks of a night, and the proposals. */
export function waitingLines(world: World): string[] {
  const mode = playModeOf(world)
  const says = { continue: 'The world goes on by itself: what the chronicler brings, the chronicle tells.', think: 'What a night brings that is new waits for you in the morning: take it up, or let it lie a week.', direct: 'What the chronicler would do waits for you as a proposal: ACCEPT or REJECT.' }
  const hooks = waitingHooks(world)
  const proposals = world.state.modes?.proposals ?? []
  const day = (t: number) => Math.max(1, Math.ceil((t - world.now) / DAY))
  return [
    says[mode],
    ...(hooks.length ? ['', 'Waiting for you (HOOKS):', ...hooks.map((h) => `  ${h.label} (${day(h.until)} day${day(h.until) === 1 ? '' : 's'} left)`)] : []),
    ...(proposals.length ? ['', 'Proposals (ACCEPT or REJECT, the first first):', ...proposals.flatMap((p) => [`  ${p.id}:`, ...p.lines.map((l) => `    ${l}`)])] : []),
  ]
}
