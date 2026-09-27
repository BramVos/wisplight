import type { Output } from './commands'
import { callName } from './content'
import { applyEffect } from './dialogue/relations'
import { expectHome, familyOf, homeOf, householdOf, livesWithParent, removeTie, setHome, setHousehold, setTie, setWork, staffOf } from './layer'
import { goAway } from './lod'
import { believes, heardBy, recordFact } from './news'
import { holdFeast } from './stories'
import { holds, type QuestHost } from './quests/engine'
import type { Selector, Verb, VerbText } from './quests/planschema'
import { planOf, runEffect, running, startPlan, type PlanState, type StepState } from './quests/plans'
import { shiftBond } from './social/deeds'
import { queueSignal } from './signals'
import { serviceKey, type Claim, type Signal } from './state'
import type { World } from './world'

// The standard aftermath and the verbs of plans (M8.1; design: signalen en
// nasleep). A signal from a watcher starts the plan of the content's
// aftermath for its kind, with the people and the place of the signal bound
// to $a, $b, $place, $subject and $value. Each verb changes something that
// lasts (a tie, a home, work, a household) or makes something happen (a
// feast, a return, a notice), and every step that is done is news, so the
// world hears of it by the usual ways. The code knows no wedding or war:
// only verbs, and the content puts them together.

export interface PlanContext {
  plan: PlanState
  bind: Record<string, string>
  host: QuestHost
  out: Output[]
}

const DAY = 24 * 60

// ---------------------------------------------------------------- the standard aftermath

/** The aftermath of the content for a signal: a plan for each that fits, unless one on the same topic already runs for these people. */
export function startAftermath(world: World, host: QuestHost, signal: Signal): Output[] {
  const out: Output[] = []
  const bind: Record<string, string> = { signal: signal.id, place: signal.place }
  signal.who.forEach((id, i) => (bind[String.fromCharCode(97 + i)] = id))
  if (signal.who[0]) bind['who'] = signal.who[0]
  if (signal.claim) {
    bind['subject'] = signal.claim.subject
    bind['value'] = signal.claim.value
    // A service key (loc_goose_common#taproom): the place it is at.
    if (signal.claim.subject.includes('#')) bind['at'] = signal.claim.subject.split('#')[0]!
  }
  const area = world.content.locations.get(signal.place)?.area
  if (area) bind['area'] = area
  const ctx: PlanContext = { plan: { plan: '', started: world.now, phase: 0, cause: '', groups: {} }, bind, host, out }
  for (const a of [...world.content.aftermath.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    if (a.signal !== signal.kind || (a.event && a.event !== signal.event)) continue
    if (!a.when.every((c) => holds(world, bindValue(world, c, ctx)))) continue
    // One plan per topic per person: a second signal about the same does not start a second plan (design: "Grenzen").
    const subjects = signal.who.length ? signal.who : [signal.place]
    const busy = (world.state.plans ?? []).some((p) => p.topic === a.topic && p.ended === undefined && running(world, p) && (p.subjects ?? []).some((s) => subjects.includes(s)))
    if (busy) continue
    out.push(...startPlan(world, host, `aftermath:${a.id}`, signal.kind, { source: 'rules', topic: a.topic, subjects, signal: signal.id, bind: { ...bind } }))
    signal.handled = 'rules'
  }
  signal.handled ??= 'none'
  return out
}

// ---------------------------------------------------------------- bindings and selectors

/** Fills in the bindings of a plan: "$a" becomes the person bound to a, in conditions and verbs alike. */
export function bindValue<T>(world: World, value: T, ctx: PlanContext): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.startsWith('$') && ctx.bind[v.slice(1)] !== undefined ? ctx.bind[v.slice(1)] : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value) as T
}

/** One person or place a selector points to. */
export function one(world: World, ctx: PlanContext, sel: Selector | undefined): string | undefined {
  return many(world, ctx, sel)[0]
}

/** Everyone or everything a selector points to. */
export function many(world: World, ctx: PlanContext, sel: Selector | undefined): string[] {
  if (sel === undefined) return []
  if (typeof sel === 'string') {
    const v = sel.startsWith('$') ? ctx.bind[sel.slice(1)] : sel
    return v ? [v] : []
  }
  if ('home_of' in sel) return list(homeOf(world, one(world, ctx, sel.home_of) ?? ''))
  if ('work_of' in sel) {
    const who = one(world, ctx, sel.work_of)
    return list(who && world.content.npcs.has(who) ? world.npc(who).work : undefined)
  }
  if ('family_of' in sel) return familyOf(world, one(world, ctx, sel.family_of) ?? '')
  if ('household_of' in sel) {
    const who = one(world, ctx, sel.household_of)
    return who && world.content.npcs.has(who) ? householdOf(world, who) : []
  }
  if ('social_near' in sel) return list(nearest(world, placeOf(world, one(world, ctx, sel.social_near)), (id) => world.location(id).tags.includes('social')))
  if ('board_near' in sel) {
    const who = one(world, ctx, sel.board_near)
    const from = who && world.content.npcs.has(who) ? (world.npc(who).work ?? world.npc(who).home) : placeOf(world, who)
    return list(nearest(world, from, (id) => world.location(id).objects.some((o) => o.type === 'notice_board')) ?? from)
  }
  if ('step' in sel) return list(ctx.plan.steps?.[sel.step]?.where)
  if ('mover' in sel || 'stayer' in sel) {
    const [a, b] = ('mover' in sel ? sel.mover : sel.stayer).map((s) => one(world, ctx, s))
    if (!a || !b) return []
    // The player moves in with the one they marry; otherwise whoever still lives with a parent, else the second.
    const moves = a === 'player' ? a : b === 'player' ? b : livesWithParent(world, a) && !livesWithParent(world, b) ? a : b
    return ['mover' in sel ? moves : moves === a ? b : a]
  }
  return []
}

function list(value: string | undefined): string[] {
  return value ? [value] : []
}

/** A place: the place itself, or where someone lives. */
function placeOf(world: World, id: string | undefined): string | undefined {
  if (!id) return undefined
  if (world.content.locations.has(id)) return id
  return homeOf(world, id)
}

/** The nearest place that fits, by the walk from a place. */
function nearest(world: World, from: string | undefined, fits: (id: string) => boolean): string | undefined {
  if (!from) return undefined
  const candidates = [...world.content.locations.keys()].filter(fits).sort()
  let best: { id: string; minutes: number } | undefined
  for (const id of candidates) {
    const minutes = id === from ? 0 : world.route(from, id)?.minutes
    if (minutes !== undefined && (!best || minutes < best.minutes)) best = { id, minutes }
  }
  return best?.id
}

/** A name for running text: a person's call name, a place's name. */
export function nameOf(world: World, id: string | undefined): string {
  if (!id) return 'someone'
  if (id === 'player') return world.state.player.character?.name ?? 'the stranger'
  if (world.content.npcs.has(id)) return callName(world.npc(id))
  if (world.content.locations.has(id)) return world.location(id).name
  return world.content.topics.get(id)?.name ?? world.content.areas.get(id)?.name ?? id
}

/** Fills {a}, {b}, {who}, {place} and the like with names. */
function fill(world: World, text: string, vars: Record<string, string | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (vars[key] !== undefined ? nameOf(world, vars[key]) : whole))
}

// ---------------------------------------------------------------- the verbs

/** Carries out one verb. False when it cannot be done now (the step then waits, is skipped or fails). */
export function runVerb(world: World, ctx: PlanContext, verb: Verb, st: StepState): boolean {
  const v = bindValue(world, verb, ctx)
  const vars = (extra: Record<string, string | undefined>) => ({ ...ctx.bind, ...extra })

  if ('set_tie' in v) {
    const [a, b] = v.set_tie
    if (!isPerson(world, a) || !isPerson(world, b) || a === b) return false
    setTie(world, a, b, v.role, v.bond ?? 2)
    return news(world, ctx, 'set_tie', [a, b], vars({ a, b, role: v.role }), placeOf(world, a) ?? ctx.bind['place'])
  }
  if ('end_tie' in v) {
    const [a, b] = v.end_tie
    if (!isPerson(world, a) || !isPerson(world, b)) return false
    removeTie(world, a, b)
    return news(world, ctx, 'end_tie', [a, b], vars({ a, b }), placeOf(world, a) ?? ctx.bind['place'])
  }
  if ('move_home' in v) {
    const who = one(world, ctx, v.move_home)
    const to = one(world, ctx, v.to)
    if (!who || !to || !world.content.locations.has(to) || !isPerson(world, who)) return false
    setHome(world, who, to)
    st.where = to
    return news(world, ctx, 'move_home', [who], vars({ who, place: to }), to)
  }
  if ('join_household' in v) {
    const who = one(world, ctx, v.join_household)
    const of = one(world, ctx, v.of)
    const home = of ? homeOf(world, of) : undefined
    if (!who || !of || !home || !isPerson(world, who)) return false
    setHome(world, who, home)
    // Later steps can speak of who moved and who stayed.
    ctx.plan.bind = { ...(ctx.plan.bind ?? {}), mover: who, stayer: of }
    if (world.content.npcs.has(of) && world.content.npcs.has(who)) {
      const house = world.npc(of).household ?? `hh_${of.replace(/^npc_/, '')}`
      if (!world.npc(of).household) setHousehold(world, of, house)
      setHousehold(world, who, house)
    }
    st.where = home
    return news(world, ctx, 'join_household', [who, of], vars({ who, of, place: home }), home)
  }
  if ('leave_household' in v) {
    const who = one(world, ctx, v.leave_household)
    if (!who || !world.content.npcs.has(who)) return false
    setHousehold(world, who, undefined)
    const to = one(world, ctx, v.to)
    if (to && world.content.locations.has(to)) setHome(world, who, to)
    return news(world, ctx, 'leave_household', [who], vars({ who, place: to ?? world.npc(who).home }), world.npc(who).home)
  }
  if ('set_work' in v) {
    const who = one(world, ctx, v.set_work)
    const at = one(world, ctx, v.at)
    if (!who || !at || !world.content.npcs.has(who) || !world.content.locations.has(at)) return false
    setWork(world, who, at, v.service, v.profession)
    st.where = at
    return news(world, ctx, 'set_work', [who], vars({ who, place: at }), at)
  }
  if ('quit_work' in v) {
    const who = one(world, ctx, v.quit_work)
    if (!who || !world.content.npcs.has(who)) return false
    const work = world.npc(who).work
    if (!work) return true
    // Where they served, a place comes open: news with a claim, for the watchers.
    const served = world.location(work).services.filter((s) => staffOf(world, work, s).includes(who))
    setWork(world, who, undefined)
    st.where = work
    if (!served.length) return news(world, ctx, 'quit_work', [who], vars({ who, place: work }), work)
    for (const s of served) {
      const trade = world.npc(who).profession
      const provider = s.provider
      const text = verbText(world, 'quit_work')
      const fact = recordFact(world, {
        kind: 'vacancy',
        about: [who, provider, work],
        place: work,
        belang: text.belang,
        title: fill(world, text.title, vars({ who, place: work, provider })),
        text: { precise: fill(world, text.precise, vars({ who, place: work, provider })), village: fill(world, text.village, vars({ who, place: work, provider })), far: fill(world, text.far, vars({ who, place: work, provider })) },
        claim: { subject: serviceKey(work, s.id), key: 'vacancy', value: world.content.professions.get(trade)?.id ?? trade },
      })
      // The one who needs someone in their place hears it from them, wherever they are.
      if (world.state.npcs[provider] && !world.state.npcs[provider]!.dead) heardBy(world, provider)[fact.id] ??= { level: 3, reliability: 1, from: who, t: world.now }
    }
    return true
  }
  if ('hire' in v) return hire(world, ctx, v.hire, v.reach, v.except.flatMap((e) => many(world, ctx, e)), st)
  if ('feast' in v) {
    const place = one(world, ctx, v.feast)
    if (!place || !world.content.locations.has(place)) return false
    const guests = v.guests.flatMap((g) => many(world, ctx, g)).filter((id) => world.content.npcs.has(id))
    holdFeast(world, place, world.now, world.now + v.hours * 60, guests)
    st.where = place
    return news(world, ctx, 'feast', ctx.plan.subjects?.filter((s) => isPerson(world, s)) ?? guests.slice(0, 2), vars({ place }), place)
  }
  if ('return' in v) {
    const who = one(world, ctx, v.return)
    if (!who || !world.content.npcs.has(who)) return false
    return comeHome(world, ctx, who)
  }
  if ('leave' in v) {
    const who = v.leave.flatMap((s) => many(world, ctx, s)).filter((id) => world.content.npcs.has(id) && world.alive(id))
    if (!who.length) return false
    for (const id of who) {
      const s = world.npcState(id)
      if (s.following) continue
      goAway(world, id, v.to, v.days)
    }
    return news(world, ctx, 'leave', who, vars({ who: who[0], a: who[0], b: who[1], place: v.to }), world.npc(who[0]!).home)
  }
  if ('post' in v) {
    const board = one(world, ctx, v.post)
    if (!board || !world.content.locations.has(board)) return false
    const fact = tell(world, ctx, v.fact, board)
    const boards = (world.state.boards ??= {})
    ;(boards[board] ??= []).push(fact)
    st.where = board
    return true
  }
  if ('thought' in v) {
    const who = one(world, ctx, v.thought)
    if (!who || !world.state.npcs[who]) return false
    const s = world.state.npcs[who]!
    s.thoughts = [...(s.thoughts ?? []).filter((t) => t.until > world.now), { text: fill(world, v.text, ctx.bind), t: world.now, until: world.now + v.days * DAY }].slice(-3)
    return true
  }
  if ('expect_home' in v) {
    const who = one(world, ctx, v.expect_home)
    const of = one(world, ctx, v.of)
    if (!who || !of || !world.content.npcs.has(who)) return false
    expectHome(world, who, of, v.nights)
    return true
  }
  if ('regard' in v) {
    const to = one(world, ctx, v.to)
    if (!to) return false
    for (const id of v.regard.flatMap((s) => many(world, ctx, s))) {
      if (!world.content.npcs.has(id) || id === to || world.state.npcs[id]?.dead) continue
      if (to === 'player') applyEffect(world, id, 'affinity', v.affinity)
      else if (world.content.npcs.has(to)) shiftBond(world, id, to, v.affinity, 0)
    }
    return true
  }
  if ('tell' in v) {
    tell(world, ctx, v.tell, one(world, ctx, v.tell.place) ?? ctx.bind['place'])
    return true
  }
  // Everything an effect plan could already do. A flight in a plan with steps has no end of its own.
  if ('news' in v && 'area' in v) {
    if (!world.content.areas.has(v.area)) return false
    ;(world.state.areaNews ??= {})[v.area] = fill(world, v.news, ctx.bind)
    return true
  }
  runEffect(world, ctx.host, ctx.plan, v, ctx.out, 'flee' in v ? (ctx.plan.expires ?? world.now + v.days * DAY) : undefined)
  return true
}

function isPerson(world: World, id: string | undefined): id is string {
  return id === 'player' || (!!id && world.content.npcs.has(id))
}

/** A fact from a template of the content, with names and claim filled in. */
function tell(world: World, ctx: PlanContext, t: Extract<Verb, { tell: unknown }>['tell'], place: string | undefined): string {
  const where = place && world.content.locations.has(place) ? place : (ctx.bind['place'] ?? world.state.player.location)
  const vars = { ...ctx.bind, place: where }
  const claim: Claim | undefined = t.claim ? { ...t.claim, subject: bindValue(world, t.claim.subject, ctx), value: bindValue(world, t.claim.value, ctx) } : undefined
  return recordFact(world, {
    kind: t.kind,
    about: bindValue(world, t.about, ctx).filter((id) => world.content.npcs.has(id) || world.content.topics.has(id) || world.content.locations.has(id)),
    place: world.content.locations.has(where) ? where : world.state.player.location,
    belang: t.belang,
    title: fill(world, t.title, vars),
    text: { precise: fill(world, t.precise, vars), village: fill(world, t.village, vars), far: fill(world, t.far, vars) },
    ...(claim ? { claim } : {}),
  }).id
}

/** Every step that is done is news (design: "Elke stap wordt nieuws"): the belang and versions of its verb. */
function news(world: World, ctx: PlanContext, verb: VerbText['id'], about: string[], vars: Record<string, string | undefined>, place: string | undefined): true {
  const text = verbText(world, verb)
  if (text.belang <= 0) return true
  const where = place && world.content.locations.has(place) ? place : world.state.player.location
  const role = vars['role']
  const filled = (s: string) => fill(world, s, vars).replace('{role}', role ? ROLE_WORDS[role] ?? role : '')
  recordFact(world, {
    kind: `aftermath:${verb}`,
    about: about.filter((id) => world.content.npcs.has(id)),
    place: where,
    belang: text.belang,
    title: filled(text.title),
    text: { precise: filled(text.precise), village: filled(text.village), far: filled(text.far) },
  })
  void ctx
  return true
}

const ROLE_WORDS: Record<string, string> = { spouse: 'married', sweetheart: 'sweethearts', friend: 'friends', rival: 'at odds', neighbour: 'neighbours' }

/** How a verb is news: the world's own words, or these. */
function verbText(world: World, verb: VerbText['id']): VerbText {
  return world.content.verbTexts.get(verb) ?? DEFAULT_TEXTS[verb]
}

const DEFAULT_TEXTS: Record<VerbText['id'], VerbText> = {
  set_tie: { id: 'set_tie', belang: 1, title: '{a} and {b} are {role}', precise: '{a} and {b} are {role} now.', village: '{a} and {b} are {role} now, they say.', far: 'Two people are {role} now.' },
  end_tie: { id: 'end_tie', belang: 1, title: '{a} and {b} have parted', precise: '{a} and {b} have parted ways.', village: "{a} and {b} aren't together any more.", far: 'Two people have parted.' },
  move_home: { id: 'move_home', belang: 1, title: '{who} lives at {place} now', precise: '{who} has moved to {place}.', village: '{who} has moved house, they say.', far: 'Someone has moved house.' },
  join_household: { id: 'join_household', belang: 1, title: '{who} has moved in with {of}', precise: '{who} has moved in with {of}, at {place}.', village: '{who} lives with {of} now.', far: 'Someone has moved in with someone.' },
  leave_household: { id: 'leave_household', belang: 1, title: '{who} has left home', precise: '{who} has left home and lives at {place} now.', village: '{who} has left home, they say.', far: 'Someone has left home.' },
  set_work: { id: 'set_work', belang: 1, title: '{who} works at {place} now', precise: '{who} has started work at {place}.', village: '{who} works at {place} now.', far: 'Someone has new work.' },
  quit_work: { id: 'quit_work', belang: 2, title: '{who} has left {place}', precise: '{who} has stopped working at {place}, and {provider} needs someone in {who}\'s place.', village: '{who} has left {place}. {provider} is looking for someone.', far: 'Somebody is looking for help, they say.' },
  hire: { id: 'hire', belang: 1, title: '{who} has taken the place at {place}', precise: '{who} has taken the open place at {place}.', village: '{who} works at {place} now.', far: 'Someone found work.' },
  feast: { id: 'feast', belang: 2, title: 'a feast at {place}', precise: 'There is a feast at {place} for {a} and {b}.', village: 'There is a feast at {place}!', far: 'There was a feast somewhere.' },
  return: { id: 'return', belang: 1, title: '{who} has come home', precise: '{who} has come home to {place}.', village: '{who} is back, they say.', far: 'Some who fled have gone home.' },
  leave: { id: 'leave', belang: 1, title: '{who} has gone away', precise: '{a} has gone away to {place}.', village: '{a} has gone off to {place}, they say.', far: 'Someone has gone away.' },
}

/** Someone who fled or stayed away goes home; a home that is gone is a signal of its own. */
function comeHome(world: World, ctx: PlanContext, who: string): boolean {
  const s = world.npcState(who)
  const home = world.npc(who).home
  if (s.note) {
    const from = s.note.where
    s.note = { unrest: 'travelling', where: home, from, since: world.now, until: world.now + 8 * 60, activity: `on the way home to ${world.location(home).name}` }
    s.activity = s.note.activity
  } else if (s.stayAt) {
    s.stayAt = undefined
    s.plan = []
    s.planGoal = undefined
    s.busyUntil = world.now
    s.activity = 'setting off home'
  } else return true
  const state = world.state.places?.[home]?.state
  if (state && ['flooded', 'destroyed', 'occupied'].includes(state)) queueSignal(world, { kind: 'house_lost', who: [who], place: home, cause: ctx.plan.signal ? [ctx.plan.signal] : [], belang: 2, watcher: 'rules' })
  return news(world, ctx, 'return', [who], { ...ctx.bind, who, place: home }, home)
}

/**
 * Someone without work who heard of the open place takes it (Bram, 27
 * September): who hears it first, near the place or at the board, and lives
 * within reach. Until then the step waits.
 */
function hire(world: World, ctx: PlanContext, key: string, reach: number, except: string[], st: StepState): boolean {
  const [location, serviceId] = key.split('#')
  const service = location && serviceId ? world.service(location, serviceId) : undefined
  if (!location || !service) return false
  const facts = world.state.news?.facts ?? []
  const latest = [...facts].reverse().find((f) => f.claim?.subject === key && f.claim.key === 'vacancy')
  // Nothing open, or someone took it already.
  if (!latest || latest.claim!.value === 'filled') return true
  const trade = latest.claim!.value
  const knows = (id: string) => {
    const belief = believes(world, id, key, 'vacancy')
    return belief && belief.value !== 'filled' ? belief : undefined
  }
  const candidates = Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      const s = world.state.npcs[id]!
      const npc = world.npc(id)
      if (except.includes(id) || s.dead || s.absent || s.following || s.note || npc.child || npc.age < 16 || npc.work || npc.quirks.includes('spirit') || npc.creature) return false
      return Boolean(knows(id)) && (world.route(npc.home, location)?.minutes ?? Infinity) <= reach
    })
    .sort((a, b) => knows(a)!.t - knows(b)!.t || a.localeCompare(b))
  const who = candidates[0]
  if (!who) return false
  setWork(world, who, location, service.id, world.content.professions.has(trade) ? trade : undefined)
  st.where = location
  const text = verbText(world, 'hire')
  const vars = { ...ctx.bind, who, place: location }
  recordFact(world, { kind: 'vacancy', about: [who, service.provider, location], place: location, belang: text.belang, title: fill(world, text.title, vars), text: { precise: fill(world, text.precise, vars), village: fill(world, text.village, vars), far: fill(world, text.far, vars) }, claim: { subject: key, key: 'vacancy', value: 'filled' } })
  // The notice comes down.
  for (const [board, list] of Object.entries(world.state.boards ?? {})) world.state.boards![board] = list.filter((f) => facts.find((x) => x.id === f)?.claim?.subject !== key)
  return true
}

/** For the editor and the inspector: the plans that are running, in plain words. */
export function planLines(world: World, who?: string): string[] {
  return (world.state.plans ?? [])
    .filter((p) => p.ended === undefined && running(world, p) && (!who || (p.subjects ?? []).includes(who) || Object.values(p.groups).flat().includes(who)))
    .map((p) => {
      const plan = planOf(world, p.plan)!
      const steps = plan.steps.map((s) => {
        const st = p.steps?.[s.id]
        const mark = st?.done !== undefined ? 'done' : st?.skipped !== undefined ? 'skipped' : st?.due !== undefined ? `due ${world.date(st.due).split(',')[0]}` : 'waiting'
        return `${s.id} (${mark})`
      })
      const phases = plan.phases.length ? [`phase ${p.phase}/${plan.phases.length}`] : []
      return `${plan.name}${p.topic ? ` [${p.topic}]` : ''}${p.subjects?.length ? ` for ${p.subjects.map((s) => nameOf(world, s)).join(' and ')}` : ''}: ${[...phases, ...steps].join(', ')}`
    })
}
