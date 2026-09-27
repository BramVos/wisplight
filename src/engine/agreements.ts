import { z } from 'zod'
import { callName } from './content'
import { applyEffect } from './dialogue/relations'
import { heardBy } from './news'
import { routineNow } from './npc/brain'
import { queueSignal } from './signals'
import { validateGoals } from './npc/goals'
import { deed, shiftBond } from './social/deeds'
import { mayAttackFirst, mayLie } from './social/gates'
import type { Agreement, AgreementKind, AgreementStatus, AgreementTerms, GameState, Goal } from './state'
import type { World } from './world'

// The register of agreements (M10.2; design: signalen en nasleep, "Het
// verhaal- en afsprakenregister"). One action layer for dialogue, brain and
// chronicler: an offer, consent where it is needed, a recorded agreement or
// intention, the doing, the outcome, and what follows. An offer that went
// through (a companion's terms), an intention after a conversation and a
// promise of the player are all one record here, never only a memory note.
//
// The rules keep it without a model: every ten minutes they look at what is
// open, and past its time an agreement is settled with what really happened.
// A missed agreement is no betrayal: the outcome says what happened, and the
// other judges by what they know of it. Truth, belief and expectation stay
// apart: a leader goes where they think someone is, and a bluff is recorded as
// a bluff. A promise never lapses in silence, and a conversation never
// prescribes a death: an attack is an intention the combat system carries out.

const DAY = 24 * 60
/** An intention after a conversation lapses after a day (M10.2). */
export const INTENTION_LASTS = DAY
/** A report carried to someone, unless its maker says otherwise. */
const MESSAGE_LASTS = 2 * DAY
/** How long a leader waits at the place for the one they lead. */
const LEAD_WAITS = 60
/** An attack that does not come to it: the anger passes (as a grievance does). */
const ATTACK_LASTS = 3 * DAY
/** A meeting: from half an hour before the time until an hour after. */
const MEET_EARLY = 30
const MEET_LATE = 60
/** Closed agreements stay in the save this long, for the voice and the journal; then the archive keeps them. */
export const KEEP_CLOSED = 30 * DAY

const Party = z.string().min(1)
const Base = {
  by: Party,
  to: Party.optional(),
  source: z.enum(['offer', 'conversation', 'player', 'brain', 'chronicler', 'rules']),
  what: z.string().min(1).max(200),
  due: z.number().optional(),
  /** Whether the other was there when it was made. Offers, conversations and the player's word default to yes. */
  known: z.boolean().optional(),
  /** Something said that the maker knows to be untrue: recorded as a bluff, if they are one who lies. */
  bluff: z.string().optional(),
  part: z.string().optional(),
}
/** What may be proposed, per kind. The terms the engine works out itself (belief, arrival, delivery) are not input. */
export const AgreementInputSchema = z.discriminatedUnion('kind', [
  z.object({ ...Base, kind: z.literal('accompany'), terms: z.object({ until: z.number().optional(), untilPlace: z.string().optional(), wage: z.number().min(0), limits: z.array(z.string()), leaves: z.array(z.string()) }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('lead'), terms: z.object({ person: z.string().optional(), place: z.string(), waits: z.number().min(0).max(6 * 60).optional(), ifAbsent: z.enum(['wait', 'return', 'search']).optional(), ahead: z.boolean().optional(), bring: z.string().optional() }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('message'), terms: z.object({ recipient: z.string(), about: z.string(), facts: z.array(z.string()).min(1), condition: z.string().optional() }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('meet'), terms: z.object({ place: z.string(), at: z.number().optional() }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('wait'), terms: z.object({ place: z.string(), person: z.string().optional() }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('give'), terms: z.object({ item: z.string().optional(), amount: z.number().positive().optional(), debt: z.string().optional() }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('lend'), terms: z.object({ item: z.string() }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('attack'), terms: z.object({ target: z.string(), reason: z.string().min(1) }).strict() }).strict(),
  z.object({ ...Base, kind: z.literal('intention'), terms: z.object({ goal: z.string(), target: z.string().optional() }).strict() }).strict(),
])
export type AgreementInput = z.input<typeof AgreementInputSchema>

/** Words that prescribe a death. A conversation, the brain and the chronicler may not; the combat system decides. */
const DEATH = /\b(kill|killed|kills|murder|slay|slain|drown|strangle|poison|hang|dead|death|die|dies)\b/i

// ---------------------------------------------------------------- the register

export function agreements(world: World): Agreement[] {
  return world.state.agreements?.list ?? []
}

export function agreementById(world: World, id: string | undefined): Agreement | undefined {
  return id ? agreements(world).find((a) => a.id === id) : undefined
}

/** Open agreements, of one party if given. */
export function openAgreements(world: World, party?: string): Agreement[] {
  return agreements(world).filter((a) => a.status === 'open' && (!party || a.by === party || a.to === party))
}

const isNpc = (world: World, id: string | undefined): id is string => !!id && world.content.npcs.has(id)
const nameOf = (world: World, id: string | undefined): string => (!id ? 'nobody' : id === 'player' ? 'the stranger' : isNpc(world, id) ? callName(world.npc(id)) : (world.content.locations.get(id)?.name ?? id))

/**
 * Records an agreement after checking it against the world and the maker's
 * knowledge. What the engine works out itself is added here: where the maker
 * thinks someone is, the plan, the journal note and the expectation. Returns
 * the agreement, or why it cannot be made.
 */
export function agree(world: World, input: AgreementInput): Agreement | { rejected: string } {
  const parsed = AgreementInputSchema.safeParse(input)
  if (!parsed.success) return { rejected: `not an agreement the game knows: ${parsed.error.issues[0]?.message ?? 'bad terms'}` }
  const a = parsed.data
  const party = (id: string | undefined) => id === 'player' || (isNpc(world, id) && world.alive(id))
  if (!party(a.by)) return { rejected: `${nameOf(world, a.by)} cannot make an agreement` }
  if (a.to !== undefined && !party(a.to)) return { rejected: `${nameOf(world, a.to)} cannot be party to it` }
  if (a.to === a.by) return { rejected: 'an agreement is between two' }
  if ((a.source === 'conversation' || a.source === 'brain' || a.source === 'chronicler') && DEATH.test(a.what)) return { rejected: 'a conversation never prescribes a death; an attack is an intention, and the fight decides' }
  const terms: AgreementTerms = { ...a.terms }
  let due = a.due
  let belief: string | undefined
  let deceit: Agreement['deceit']
  const maker = a.by
  if (a.kind === 'lead') {
    if (!world.content.locations.has(a.terms.place)) return { rejected: `there is no place ${a.terms.place}` }
    // The leader's knowledge, not the truth: a place they know, and where they think the person is.
    if (isNpc(world, maker) && !world.knownLocations(maker).has(a.terms.place)) return { rejected: `${nameOf(world, maker)} does not know the way to ${nameOf(world, a.terms.place)}` }
    if (a.terms.person !== undefined) {
      if (!isNpc(world, a.terms.person)) return { rejected: `there is nobody called ${a.terms.person}` }
      const thinks = thinksIsAt(world, maker, a.terms.person)
      if (thinks === 'dead') return { rejected: `${nameOf(world, maker)} knows ${nameOf(world, a.terms.person)} is dead` }
      terms.thinks = thinks
      belief = `${nameOf(world, maker)} thinks ${nameOf(world, a.terms.person)} is at ${nameOf(world, thinks)}`
      const theirs = [world.npc(a.terms.person).home, world.npc(a.terms.person).work].filter(Boolean)
      if (thinks !== a.terms.place && !theirs.includes(a.terms.place)) {
        // Leading someone where you think the person is not: a lie, recorded as one, from one who lies.
        if (isNpc(world, maker) && !mayLie(world, maker)) return { rejected: `${nameOf(world, maker)} would not lead you where ${world.say('{they}', maker)} think${world.npc(maker).pronoun === 'they' ? '' : 's'} ${nameOf(world, a.terms.person)} is not` }
        deceit = { said: `${nameOf(world, a.terms.person)} would be at ${nameOf(world, a.terms.place)}`, knew: belief }
      }
    }
    terms.waits = a.terms.waits ?? LEAD_WAITS
    terms.ifAbsent = a.terms.ifAbsent ?? 'wait'
    due ??= world.now + (routeMinutes(world, maker, a.terms.place) ?? 180) + terms.waits + 60
  }
  if (a.kind === 'message') {
    if (!isNpc(world, a.terms.recipient)) return { rejected: `there is nobody called ${a.terms.recipient}` }
    if (isNpc(world, maker)) {
      const heard = heardBy(world, maker)
      const unknown = a.terms.facts.filter((id) => !heard[id] || heard[id]!.stance === 'rejects')
      if (unknown.length === a.terms.facts.length) return { rejected: `${nameOf(world, maker)} has nothing to tell about it` }
      terms.facts = a.terms.facts.filter((id) => !unknown.includes(id))
    }
    due ??= world.now + MESSAGE_LASTS
  }
  if (a.kind === 'meet' || a.kind === 'wait') {
    if (!world.content.locations.has(a.terms.place) && !a.terms.place.startsWith('hex_')) return { rejected: `there is no place ${a.terms.place}` }
    if (a.kind === 'meet' && !a.part) {
      terms.at = a.terms.at ?? world.now
      due ??= terms.at + MEET_LATE
    }
  }
  if (a.kind === 'lend') {
    // Lent to the player: the player's word to bring it back by the time; the thing stays the lender's.
    if (!world.content.items.has(a.terms.item)) return { rejected: `there is no thing ${a.terms.item}` }
    if (a.due === undefined) return { rejected: 'a loan has a time to bring it back' }
    if (a.by !== 'player' || !isNpc(world, a.to)) return { rejected: 'the stranger borrows from someone of the world' }
  }
  if (a.kind === 'give') {
    if (a.terms.item !== undefined && !world.content.items.has(a.terms.item)) return { rejected: `there is no thing ${a.terms.item}` }
    if (a.terms.item === undefined && a.terms.amount === undefined) return { rejected: 'give what?' }
  }
  if (a.kind === 'attack') {
    // The combat system fights with the player; between two others it has no fight yet.
    if (a.terms.target !== 'player') return { rejected: 'the combat system only knows fights with the stranger' }
    if (!isNpc(world, maker)) return { rejected: 'only someone of the world attacks the stranger' }
    // The rules checked their own gate already (a grievance, or the law's order); a conversation or a plan goes through it here.
    if (a.source !== 'rules' && !mayAttackFirst(world, maker, { provoked: true })) return { rejected: `${nameOf(world, maker)} is not one to go for the stranger` }
    due ??= world.now + ATTACK_LASTS
  }
  let goal: Goal | undefined
  if (a.kind === 'intention') {
    if (!isNpc(world, maker)) return { rejected: 'an intention is someone of the world\'s own' }
    // The same validator as the brain's choices.
    const checked = validateGoals(world, maker, { goals: [{ type: a.terms.goal, target: a.terms.target ?? 'none', priority: 0.9, why: a.what }], mood: 'calm', note: '' })
    goal = checked.accepted[0]
    if (!goal) return { rejected: checked.rejected[0] ?? `${nameOf(world, maker)} would not do that now` }
    due ??= world.now + INTENTION_LASTS
    goal.until = Math.min(goal.until ?? due, due)
  }
  if (a.bluff !== undefined && !deceit) {
    if (isNpc(world, maker) && !mayLie(world, maker)) return { rejected: `${nameOf(world, maker)} will not say what ${world.say('{they}', maker)} know${world.npc(maker).pronoun === 'they' ? '' : 's'} to be untrue` }
    deceit = { said: a.bluff, knew: a.what }
  }
  const register = (world.state.agreements ??= { seq: 0, list: [] })
  const agreement: Agreement = {
    id: `ag_${++register.seq}`,
    kind: a.kind,
    by: a.by,
    ...(a.to !== undefined ? { to: a.to } : {}),
    source: a.source,
    what: a.what,
    t: world.now,
    ...(due !== undefined ? { due } : {}),
    terms,
    status: 'open',
    known: a.known ?? (a.source === 'offer' || a.source === 'conversation' || a.source === 'player'),
    ...(belief ? { belief } : {}),
    ...(deceit ? { deceit } : {}),
    effects: [],
    ...(a.part ? { part: a.part } : {}),
  }
  register.list.push(agreement)
  // One choice, every effect it needs: a plan, a note in the player's journal, an expectation.
  if (goal) plan(world, agreement, maker, goal)
  // A leader who goes ahead of the player moves with the player's steps (leadAhead); one who fetches or goes alone walks there.
  if (a.kind === 'lead' && !a.terms.ahead) plan(world, agreement, maker, visit(world, a.terms.place, due!))
  if (a.kind === 'lead' && a.terms.ahead && isNpc(world, maker)) hold(world, maker, due!)
  if (a.kind === 'wait' && isNpc(world, maker) && !a.part && due !== undefined) hold(world, maker, due)
  if (agreement.by === 'player' || agreement.to === 'player') agreement.effects.push({ kind: 'journal', ref: 'promises' })
  if (isNpc(world, agreement.to)) agreement.effects.push({ kind: 'expect', ref: agreement.to })
  return agreement
}

/**
 * Where someone thinks another is: where they saw them; by their day if they
 * know it (the same house, family, or working together); else at home; and
 * "dead" when they heard the death. What they think, not what is true.
 */
export function thinksIsAt(world: World, who: string, person: string): string {
  const def = world.npc(person)
  const theirs = world.state.npcs[person]
  if (isNpc(world, who) && theirs) {
    const death = (world.state.news?.facts ?? []).find((f) => f.kind === 'death' && f.about.includes(person))
    if (death && heardBy(world, who)[death.id]) return 'dead'
    const mine = world.state.npcs[who]
    if (mine && mine.location === theirs.location && !theirs.dead) return theirs.location
    if (knowsTheDayOf(world, who, person)) return routineNow(world, person)?.place ?? def.home
  }
  return def.home
}

/** Whether someone knows another's day: the same house, close family, or the same place of work. */
export function knowsTheDayOf(world: World, who: string, person: string): boolean {
  const a = world.npc(who)
  const b = world.npc(person)
  if (a.household && a.household === b.household) return true
  if (a.home === b.home) return true
  if (a.work && a.work === b.work) return true
  return a.relations.some((r) => r.to === person && ['parent', 'child', 'spouse', 'sibling', 'sweetheart'].includes(r.role))
}

function routeMinutes(world: World, who: string, place: string): number | undefined {
  const from = who === 'player' ? world.state.player.location : world.state.npcs[who]?.location
  return from ? world.route(from, place)?.minutes : undefined
}

function visit(world: World, place: string, until: number): Goal {
  return { id: `g${++world.state.goalSeq}`, type: 'Visit', target: place, priority: 1, source: 'ai', created: world.now, until }
}

/** Gives the maker the goal that carries the agreement out. */
function plan(world: World, agreement: Agreement, npcId: string, goal: Goal): void {
  if (!isNpc(world, npcId)) return
  goal.agreement = agreement.id
  const s = world.npcState(npcId)
  s.goals.push(goal)
  s.plan = []
  s.planGoal = undefined
  s.busyUntil = Math.min(s.busyUntil, world.now)
  agreement.effects.push({ kind: 'plan', ref: goal.id })
}

// ---------------------------------------------------------------- settling

/**
 * Closes an agreement with what really happened. Kept, or not: then the other
 * judges it by what they know. The one at fault is the maker unless said
 * otherwise; "world" means neither could help it.
 */
export function settle(world: World, agreement: Agreement, status: Exclude<AgreementStatus, 'open'>, text: string, opts: { fault?: 'by' | 'to' | 'world'; fact?: string; told?: boolean; late?: boolean; quiet?: boolean } = {}): void {
  if (agreement.status !== 'open') return
  agreement.status = status
  agreement.outcome = { t: world.now, text, ...(opts.fault ? { fault: opts.fault } : {}), ...(opts.fact ? { fact: opts.fact } : {}), ...(opts.told ? { told: true } : {}) }
  // The plan it gave is done with (a report tried again is a new goal of the same agreement); a part of it ends with it.
  const refs = new Set(agreement.effects.filter((e) => e.kind === 'plan').map((e) => e.ref))
  for (const id of [agreement.by, agreement.to]) {
    if (!isNpc(world, id) || !world.state.npcs[id]) continue
    const s = world.npcState(id)
    const ours = (g: Goal) => refs.has(g.id) || g.agreement === agreement.id
    if (s.planGoal && s.goals.some((g) => g.id === s.planGoal && ours(g))) {
      s.plan = []
      s.planGoal = undefined
    }
    s.goals = s.goals.filter((g) => !ours(g))
    // Whoever waited for it is free again.
    if (s.activity === 'waiting for you' && !s.following) s.busyUntil = Math.min(s.busyUntil, world.now)
  }
  for (const part of agreements(world).filter((a) => a.part === agreement.id && a.status === 'open')) settle(world, part, status === 'kept' ? 'kept' : 'cancelled', text, { quiet: true, told: true })
  judge(world, agreement, opts.late ?? false)
  // The stranger's word kept or broken is a signal (M10.3): what follows is content (broken_promise, promise_kept).
  if (agreement.by === 'player' && agreement.known && isNpc(world, agreement.to) && world.alive(agreement.to) && (agreement.kind === 'give' || agreement.kind === 'lend' || agreement.kind === 'meet')) {
    const kept = status === 'kept' && !opts.late
    const broken = status === 'missed' && (opts.fault ?? 'by') === 'by'
    if (kept || broken) queueSignal(world, { kind: kept ? 'promise_kept' : 'broken_promise', who: [agreement.to], place: world.state.npcs[agreement.to]!.location, cause: [], belang: kept ? 1 : 2, claim: { subject: agreement.to, key: 'promise', value: promisePhrase(world, agreement) }, watcher: 'rules' })
  }
  if (!opts.quiet && (agreement.by === 'player' || agreement.to === 'player') && agreement.kind !== 'accompany') world.notices.push(`${capitalise(toPlayer(text))}.`)
}

/** What the other makes of it: only of what they knew of, and only by what they know of why. */
function judge(world: World, agreement: Agreement, late: boolean): void {
  const o = agreement.outcome!
  if (agreement.status === 'kept') {
    if (agreement.by === 'player' && isNpc(world, agreement.to) && world.alive(agreement.to) && !late) deed(world, agreement.to, 'promise_kept')
    return
  }
  const fault = o.fault ?? 'by'
  const culprit = fault === 'to' ? agreement.to : agreement.by
  const judgeId = fault === 'to' ? agreement.by : agreement.to
  if (!agreement.known || !judgeId || !culprit) return
  const knowsWhy = Boolean(o.told || (o.fact && isNpc(world, judgeId) && heardBy(world, judgeId)[o.fact]))
  agreement.judged = agreement.deceit && fault === 'by' ? 'betrayed' : knowsWhy || (judgeId === 'player' && fault === 'world') ? 'understood' : 'let_down'
  if (agreement.judged === 'understood' || !isNpc(world, judgeId) || !world.alive(judgeId)) return
  const hard = agreement.judged === 'betrayed'
  if (culprit === 'player') {
    deed(world, judgeId, 'promise_broken')
    if (hard) applyEffect(world, judgeId, 'trust', -10)
  } else if (isNpc(world, culprit)) {
    shiftBond(world, judgeId, culprit, hard ? -10 : -3, hard ? -20 : -8)
  }
  const s = world.npcState(judgeId)
  const line = `${nameOf(world, culprit)} ${hard ? 'lied to you' : 'did not keep their word'}: ${agreement.what}.`
  s.thoughts = [...(s.thoughts ?? []).filter((th) => th.until > world.now), { text: capitalise(line), t: world.now, until: world.now + 7 * DAY }].slice(-3)
}

/** A break along the way, with its end: paused, rerouted or ended, and whether they come back. */
export function interrupt(world: World, agreement: Agreement | undefined, why: string, then: 'pause' | 'reroute' | 'end', back: boolean): void {
  if (!agreement || agreement.status !== 'open') return
  ;(agreement.interruptions ??= []).push({ t: world.now, why, then, back })
}

/** They came back after a pause: the last break is over. */
export function resume(world: World, agreement: Agreement | undefined): void {
  const last = agreement?.interruptions?.at(-1)
  if (last && last.back && last.resumed === undefined) last.resumed = world.now
}

// ---------------------------------------------------------------- hooks from the systems that carry them out

/** A goal that carried an agreement ended (brain.ts): done, or given up. */
export function goalEnded(world: World, npcId: string, goal: Goal, success: boolean): void {
  const agreement = agreementById(world, goal.agreement)
  if (!agreement || agreement.status !== 'open') return
  if (agreement.kind === 'intention') {
    if (success) settle(world, agreement, 'kept', `${nameOf(world, npcId)} did what ${world.say('{they}', npcId)} meant to: ${agreement.what}`)
    else settle(world, agreement, 'missed', `${nameOf(world, npcId)} set out to ${agreement.what}, and it did not work out`, { fault: 'world' })
  }
  if (agreement.kind === 'lead') {
    if (success) {
      agreement.terms.arrived ??= world.now
      hold(world, npcId, world.now + (agreement.terms.waits ?? LEAD_WAITS))
    } else settle(world, agreement, 'missed', `${nameOf(world, npcId)} could not get to ${nameOf(world, agreement.terms.place)}`, { fault: 'world', told: world.state.player.location === world.state.npcs[npcId]?.location })
  }
  if (agreement.kind === 'meet' && success) came(agreement, npcId)
}

/** A report was told (brain.ts): only now does the other know it. */
export function delivered(world: World, goal: Goal): void {
  const agreement = agreementById(world, goal.agreement)
  if (!agreement || agreement.status !== 'open' || agreement.kind !== 'message') return
  agreement.terms.delivered = world.now
  settle(world, agreement, 'kept', `${nameOf(world, agreement.by)} told ${nameOf(world, agreement.terms.recipient)} about ${agreement.terms.about}`)
}

function came(agreement: Agreement, who: string): void {
  const list = (agreement.terms.came ??= [])
  if (!list.includes(who)) list.push(who)
}

// ---------------------------------------------------------------- every ten minutes, without a model

/** Looks at what is open: meetings, leaders, reports and intentions past their time. Nothing to do when nothing is open. */
export function agreementsTick(world: World): void {
  const open = agreements(world).filter((a) => a.status === 'open')
  if (!open.length) return
  for (const a of open) {
    // Whoever is dead cannot keep it any more; the death is the outcome.
    const gone = [a.by, a.to].find((id) => isNpc(world, id) && !world.alive(id))
    if (gone && a.kind !== 'accompany') {
      const death = (world.state.news?.facts ?? []).find((f) => f.kind === 'death' && f.about.includes(gone))
      settle(world, a, 'impossible', `${nameOf(world, gone)} died before it could be done`, { fault: 'world', ...(death ? { fact: death.id } : {}) })
      continue
    }
    if (a.kind === 'lead' && a.terms.bring) fetch(world, a)
    else if (a.kind === 'lead' && a.terms.ahead && a.terms.arrived === undefined) {
      if (a.due !== undefined && world.now >= a.due) settle(world, a, 'missed', `${nameOf(world, a.by)} waited for the stranger in vain`, { fault: 'to', told: true })
    } else if (a.kind === 'lead') lead(world, a)
    else if (a.kind === 'wait' && !a.part) waitFor(world, a)
    else if (a.kind === 'meet' && !a.part) meet(world, a)
    else if (a.kind === 'accompany') {
      // A companion who is no longer one without a word (an old path): the agreement ends, not in silence.
      if (!(world.state.companions ?? []).some((c) => c.agreement === a.id)) settle(world, a, 'cancelled', `${nameOf(world, a.by)} and the stranger parted`, { fault: 'world', quiet: true })
    } else if (a.due !== undefined && world.now >= a.due && !(a.kind === 'give' && a.terms.debt)) lapse(world, a)
  }
  // What closed a month ago goes to the archive with the rest (archive.ts); the save keeps the recent.
}

/** Past its time and not done: what really happened, and whose doing it was. */
function lapse(world: World, a: Agreement): void {
  const by = nameOf(world, a.by)
  if (a.kind === 'message') {
    const to = a.terms.recipient!
    if (!world.alive(to)) return settle(world, a, 'impossible', `${nameOf(world, to)} died before ${by} could tell them`, { fault: 'world' })
    if (!world.present(to)) return settle(world, a, 'missed', `${by} could not find ${nameOf(world, to)} to tell about ${a.terms.about}`, { fault: 'world' })
    const s = world.state.npcs[a.by]
    const why = reasonFact(world, a, a.by)
    if (s && ((s.sickUntil ?? 0) > world.now || (s.wounds ?? 0) > 0)) return settle(world, a, 'missed', `${by} was laid up and never told ${nameOf(world, to)} about ${a.terms.about}`, { fault: 'world', ...(why ? { fact: why } : {}) })
    return settle(world, a, 'missed', `${by} never told ${nameOf(world, to)} about ${a.terms.about}`, { fault: 'by' })
  }
  if (a.kind === 'attack') return settle(world, a, 'cancelled', `${by}'s anger passed before it came to blows`, { fault: 'by', quiet: true })
  if (a.kind === 'intention') return settle(world, a, 'missed', `${by} meant to ${a.what}, and a day went by without it`, { fault: 'by' })
  if (a.kind === 'give') return settle(world, a, 'missed', `${by} did not ${a.what} in time`, { fault: 'by' })
  if (a.kind === 'lend') return settle(world, a, 'missed', `${by} did not bring ${nameOf(world, a.to)}'s ${world.content.items.get(a.terms.item!)?.name ?? a.terms.item} back in time`, { fault: 'by' })
  settle(world, a, 'missed', `${a.what}: it did not come about in time`, { fault: 'by' })
}

/** A leader goes ahead; there they wait for the one they lead, and then for the person, as agreed. */
function lead(world: World, a: Agreement): void {
  const place = a.terms.place!
  const leader = a.by
  const player = world.state.player.location
  const by = nameOf(world, leader)
  // Already there when it was agreed (the planner has no steps for it): arrived at once.
  if (a.terms.arrived === undefined && isNpc(world, leader) && world.state.npcs[leader]!.location === place) {
    a.terms.arrived = world.now
    hold(world, leader, world.now + (a.terms.waits ?? LEAD_WAITS))
  }
  const arrived = a.terms.arrived
  if (arrived === undefined) {
    if (a.due !== undefined && world.now >= a.due) settle(world, a, 'missed', `${by} never got to ${nameOf(world, place)}`, { fault: 'by' })
    return
  }
  const here = isNpc(world, leader) ? world.state.npcs[leader]!.location === place : player === place
  const follower = a.to === 'player' ? player === place : isNpc(world, a.to) && world.state.npcs[a.to]!.location === place
  if (!follower) {
    if (world.now - arrived >= (a.terms.waits ?? LEAD_WAITS)) settle(world, a, 'missed', `${by} waited at ${nameOf(world, place)}, and ${nameOf(world, a.to)} never came`, { fault: 'to' })
    else if (here && isNpc(world, leader)) hold(world, leader, arrived + (a.terms.waits ?? LEAD_WAITS))
    return
  }
  const person = a.terms.person
  if (!person || world.state.npcs[person]?.location === place) {
    return settle(world, a, 'kept', `${by} brought ${nameOf(world, a.to)} to ${nameOf(world, place)}${person ? `, and ${nameOf(world, person)} was there` : ''}`)
  }
  // The person is not where the leader thought. The truth is in the outcome; the promise was the way there.
  const truth = world.alive(person) ? `${nameOf(world, person)} was not there` : `${nameOf(world, person)} was dead, and ${by} had not known`
  const since = (a.terms.met ??= world.now)
  if (a.terms.ifAbsent === 'search' && !a.interruptions?.length) {
    const work = world.npc(person).work
    if (work && work !== place && isNpc(world, leader) && world.knownLocations(leader).has(work) && world.alive(person)) {
      interrupt(world, a, truth, 'reroute', true)
      a.terms.place = work
      delete a.terms.arrived
      delete a.terms.met
      a.due = world.now + (routeMinutes(world, leader, work) ?? 120) + (a.terms.waits ?? LEAD_WAITS) + 60
      plan(world, a, leader, visit(world, work, a.due))
      world.notices.push(`${by}: "Not here. Then ${world.say('{they}', person)}'ll be at ${nameOf(world, work)}. Come on."`)
      return
    }
  }
  if (a.terms.ifAbsent === 'wait' && world.now - since < (a.terms.waits ?? LEAD_WAITS) && world.alive(person)) {
    if (isNpc(world, leader)) hold(world, leader, since + (a.terms.waits ?? LEAD_WAITS))
    return
  }
  settle(world, a, 'kept', `${by} brought ${nameOf(world, a.to)} to ${nameOf(world, place)}; ${truth}${a.terms.ifAbsent === 'wait' ? `, though ${by} waited` : ''}`, { told: true })
}

/** How many turns a leader waits for a player who does not follow, before giving up (M10.3). */
const GIVE_UP_TURNS = 4

/**
 * A leader going ahead of the player (M10.3, "Pip walks ahead"): when the
 * player is with them, they go on to the next place on the way and wait
 * there; when the player goes another way, they call which way it is; after a
 * few turns without following, they give up. Runs after each of the player's
 * commands, not on the clock.
 */
export function leadAhead(world: World): void {
  const here = world.state.player.location
  for (const a of agreements(world).filter((x) => x.status === 'open' && x.kind === 'lead' && x.terms.ahead && x.to === 'player' && x.terms.arrived === undefined)) {
    const leader = a.by
    if (!isNpc(world, leader) || !world.present(leader)) continue
    const s = world.npcState(leader)
    const place = a.terms.place!
    const name = nameOf(world, leader)
    if (here === place) {
      s.location = place
      a.terms.arrived = world.now
      hold(world, leader, world.now + (a.terms.waits ?? LEAD_WAITS))
      lead(world, a)
      continue
    }
    if (here === s.location) {
      const route = world.route(here, place)
      const next = route?.nodes[1]
      if (!route || !next) {
        settle(world, a, 'missed', `${name} could not find the way to ${nameOf(world, place)}`, { fault: 'by', told: true })
        continue
      }
      s.location = next
      hold(world, leader, a.due ?? world.now + 180)
      a.terms.turns = 0
      world.notices.push(`${name} goes on ahead, ${route.directions[0]}, and waits for you there.`)
      continue
    }
    a.terms.turns = (a.terms.turns ?? 0) + 1
    if (a.terms.turns >= GIVE_UP_TURNS) {
      settle(world, a, 'missed', `${name} gave up waiting; the stranger went another way`, { fault: 'to', told: true })
      s.busyUntil = world.now
      continue
    }
    // Close by: they call the way. Further off, they wait.
    const back = world.route(here, s.location)
    if (back && back.nodes.length === 2) world.notices.push(`${name} calls after you: "Not that way! ${capitalise(back.directions[0]!)}, this way!"`)
  }
}

/** Fetching someone (M10.3): go where they think the person is, and bring them back. */
function fetch(world: World, a: Agreement): void {
  const by = nameOf(world, a.by)
  const person = a.terms.person!
  const place = a.terms.place!
  const bring = a.terms.bring!
  const s = world.state.npcs[a.by]
  const p = world.state.npcs[person]
  if (!s || !p) return
  if (a.terms.arrived === undefined && s.location === place) a.terms.arrived = world.now
  if (p.location === bring) return settle(world, a, 'kept', `${by} fetched ${nameOf(world, person)}`)
  if (a.terms.arrived !== undefined && a.terms.met === undefined) {
    if (p.location !== place || !world.present(person)) {
      return settle(world, a, 'missed', `${by} went to ${nameOf(world, place)} for ${nameOf(world, person)}, who was not there`, { fault: 'world', told: true })
    }
    // Found: they both come back.
    a.terms.met = world.now
    plan(world, a, person, visit(world, bring, a.due ?? world.now + 180))
    plan(world, a, a.by, visit(world, bring, a.due ?? world.now + 180))
    return
  }
  if (a.due !== undefined && world.now >= a.due) settle(world, a, 'missed', `${by} did not come back with ${nameOf(world, person)} in time`, { fault: 'by' })
}

/** Waiting here with the player (M10.3, Guard): until the time, or until the one waited for comes. */
function waitFor(world: World, a: Agreement): void {
  const by = nameOf(world, a.by)
  const place = a.terms.place!
  const person = a.terms.person
  if (person && world.state.npcs[person]?.location === place && world.present(person)) return settle(world, a, 'kept', `${by} waited, and ${nameOf(world, person)} came`)
  if (a.due !== undefined && world.now >= a.due) settle(world, a, 'kept', `${by} waited at ${nameOf(world, place)} as agreed`)
}

/** Someone who waits stays where they are, until then. */
function hold(world: World, npcId: string, until: number): void {
  const s = world.npcState(npcId)
  if (until <= world.now) return
  s.busyUntil = Math.max(s.busyUntil, until)
  s.plan = []
  s.activity = 'waiting for you'
}

/** A meeting: whoever is of the world sets out in time; kept when both came. */
function meet(world: World, a: Agreement): void {
  const place = a.terms.place!
  const at = a.terms.at ?? a.t
  const parties = [a.by, a.to].filter((p): p is string => !!p)
  for (const p of parties) {
    if (!isNpc(world, p)) continue
    const s = world.state.npcs[p]!
    const route = routeMinutes(world, p, place) ?? 60
    const planned = a.effects.some((e) => e.kind === 'plan' && s.goals.some((g) => g.id === e.ref))
    if (s.location !== place && !planned && world.now >= at - route - 20 && world.now < at + MEET_LATE && world.present(p)) plan(world, a, p, visit(world, place, at + MEET_LATE))
  }
  if (world.now >= at - MEET_EARLY) for (const p of parties) if ((p === 'player' ? world.state.player.location : world.state.npcs[p]?.location) === place) came(a, p)
  const cameAll = parties.every((p) => (a.terms.came ?? []).includes(p))
  if (cameAll) return settle(world, a, 'kept', `${nameOf(world, a.by)} and ${nameOf(world, a.to)} met at ${nameOf(world, place)}`)
  if (world.now < (a.due ?? at + MEET_LATE)) return
  const missing = parties.filter((p) => !(a.terms.came ?? []).includes(p))
  const who = missing[0]!
  const s = isNpc(world, who) ? world.state.npcs[who] : undefined
  const laidUp = Boolean(s && ((s.sickUntil ?? 0) > world.now || (s.wounds ?? 0) > 0 || !world.present(who)))
  // What really kept them: a fact since, about them or the place. The other judges by whether they heard it.
  const why = reasonFact(world, a, who, place)
  const text = `${nameOf(world, who)} did not come to ${nameOf(world, place)}${laidUp ? `; ${who === 'player' ? 'they' : world.say('{they}', who)} could not` : ''}`
  settle(world, a, 'missed', text, { fault: laidUp || why ? 'world' : who === a.to ? 'to' : 'by', ...(why ? { fact: why } : {}) })
}

/** Why it could not be, as a fact: the latest since it was agreed, about the one who failed or about the place. */
function reasonFact(world: World, a: Agreement, who: string, place?: string): string | undefined {
  const facts = world.state.news?.facts ?? []
  for (let i = facts.length - 1; i >= 0; i--) {
    const f = facts[i]!
    if (f.t < a.t) break
    if (f.about.includes(who) || (place && (f.about.includes(place) || (f.place === place && f.kind.startsWith('place'))))) return f.id
  }
  return undefined
}

// ---------------------------------------------------------------- for the voice and the journal

function when(world: World, t: number | undefined): string {
  if (t === undefined) return ''
  const days = Math.floor(t / DAY) - Math.floor(world.now / DAY)
  if (days <= 0) return ', today'
  if (days === 1) return ', by tomorrow'
  return `, within ${days} days`
}

/**
 * What the register holds for a conversation (M10.2, frugal): the open
 * agreements between this person and the player, and a few of their own with
 * others, then how the last one with the player went. At most four lines.
 */
export function agreementLines(world: World, npcId: string): string[] {
  const mine = agreements(world).filter((a) => (a.by === npcId || a.to === npcId) && !a.part)
  if (!mine.length) return []
  const lines: string[] = []
  for (const a of mine.filter((x) => x.status === 'open' && (x.by === 'player' || x.to === 'player'))) {
    lines.push(a.by === npcId ? `YOUR WORD to the player: ${a.what}${when(world, a.due)}.` : `THE PLAYER'S WORD to you: ${a.what}${when(world, a.due)}.`)
  }
  for (const a of mine.filter((x) => x.status === 'open' && x.by !== 'player' && x.to !== 'player').slice(0, 2)) {
    lines.push(!a.to ? `YOU MEAN TO: ${a.what}${when(world, a.due)}.` : a.by === npcId ? `YOU PROMISED ${nameOf(world, a.to)}: ${a.what}${when(world, a.due)}.` : `YOU EXPECT ${nameOf(world, a.by)} to ${a.what}${when(world, a.due)}.`)
  }
  const last = mine.filter((x) => x.status !== 'open' && x.known && (x.by === 'player' || x.to === 'player') && world.now - (x.outcome?.t ?? 0) < 7 * DAY).at(-1)
  if (last) lines.push(`HOW IT WENT: ${last.what}: ${last.outcome!.text}${last.judged === 'let_down' ? ' (you feel let down)' : last.judged === 'betrayed' ? ' (you were lied to)' : ''}.`)
  return lines.slice(0, 4)
}

/** The journal page "Your word and theirs": what is open with the player, and how the last ones went. */
export function promiseLines(world: World): string[] {
  const withPlayer = agreements(world).filter((a) => (a.by === 'player' || a.to === 'player') && !a.part)
  const open = withPlayer.filter((a) => a.status === 'open')
  const done = withPlayer.filter((a) => a.status !== 'open' && world.now - (a.outcome?.t ?? 0) < 14 * DAY).slice(-6)
  const lines: string[] = []
  for (const a of open) lines.push(a.by === 'player' ? `You promised ${nameOf(world, a.to)}: ${a.what}${when(world, a.due)}.` : `${capitalise(nameOf(world, a.by))} agreed: ${toPlayer(a.what)}${when(world, a.due)}.`)
  if (done.length) lines.push('', 'How it went:', ...done.map((a) => `  ${capitalise(toPlayer(a.what))}: ${toPlayer(a.outcome!.text)} (${STATUS[a.status]}).`))
  return lines.length ? lines : ['You have given nobody your word, and nobody has given you theirs.']
}

const STATUS: Record<AgreementStatus, string> = { open: 'open', kept: 'kept', missed: 'missed', cancelled: 'called off', impossible: 'could not be' }

// ---------------------------------------------------------------- a new stranger

/** When a new stranger takes over (legacy.ts): what the old one agreed cannot be any more. */
export function forgetPlayerAgreements(state: GameState): void {
  for (const a of state.agreements?.list ?? []) {
    if (a.status !== 'open' || (a.by !== 'player' && a.to !== 'player')) continue
    a.status = 'impossible'
    a.outcome = { t: state.minutes, text: 'the stranger who made it is gone', fault: 'world' }
  }
}

/** The kinds, for the builder and tests. */
export const AGREEMENT_KINDS: AgreementKind[] = ['accompany', 'lead', 'message', 'meet', 'wait', 'give', 'lend', 'attack', 'intention']

/** The player gives a lent thing back to its owner (commands.ts): the loan is kept, or kept late. */
export function returnLent(world: World, npcId: string, item: string): string | undefined {
  const loan = agreements(world).find((a) => a.kind === 'lend' && a.by === 'player' && a.to === npcId && a.terms.item === item && (a.status === 'open' || (a.status === 'missed' && !a.terms.delivered)))
  if (!loan) return undefined
  const name = nameOf(world, npcId)
  loan.terms.delivered = world.now
  if (loan.status === 'open') {
    settle(world, loan, 'kept', `the stranger brought ${name}'s ${world.content.items.get(item)?.name ?? item} back`, { quiet: true })
    return world.say(`{name} takes it back and turns it over. "Good as your word."`, npcId)
  }
  // Late: it is back, but the promise was already broken.
  return world.say(`{name} takes it back without a word. It is late, and {they} ${world.npc(npcId).pronoun === 'they' ? 'let' : 'lets'} you see it.`, npcId)
}

/** What was promised, without the one it was promised to: "bring a coil of rope". */
function promisePhrase(world: World, a: Agreement): string {
  const thing = a.terms.item ? world.content.items.get(a.terms.item)?.name ?? a.terms.item : undefined
  if (a.kind === 'lend' && thing) return `bring the ${thing} back`
  if (a.kind === 'give' && thing) return `bring the ${thing}`
  if (a.kind === 'meet') return `meet at ${nameOf(world, a.terms.place)}`
  return a.what
}

/** A record's words as the player reads them: "you", not "the stranger". */
function toPlayer(text: string): string {
  return text.replace(/\bthe stranger's\b/g, 'your').replace(/\bthe stranger\b/g, 'you')
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

