import { welcomingIn } from './social/groups'
import { orderGoods } from './economy/ledger'
import { arrive, startProject, templateFor } from './growth/growth'
import type { Output } from './commands'
import { callName } from './content'
import { applyEffect } from './dialogue/relations'
import { expectHome, familyOf, homeOf, householdOf, livesWithParent, removeTie, setHome, setHousehold, setTie, setWork, staffOf } from './layer'
import { farFromPlayer, goAway } from './lod'
import { believes, factById, heardBy, recordFact } from './news'
import { holdFeast } from './stories'
import { holds, type QuestHost } from './quests/engine'
import type { Selector, Verb, VerbText } from './quests/planschema'
import { planOf, runEffect, running, setAreaNews, startPlan, type PlanState, type StepState } from './quests/plans'
import { setMood, shiftBond } from './social/deeds'
import { causeOf, queueSignal, watchBelief } from './signals'
import { askTrader, isTrader, mayChaseAway } from './belief'
import { remember } from './npc/execute'
import { setRank } from './social/rank'
import { addCrowd } from './growth/crowds'
import { openRequest } from './requests'
import { GOAL_CATALOGUE, triggerChoice } from './npc/goals'
import { brainMayChoose, offered } from './npc/intentions'
import { escalates, toChronicler } from './planning'
import { relation } from './dialogue/relations'
import { mayLieAbout } from './social/gates'
import { againstNewcomer } from './social/groups'
import { serviceKey, type Claim, type Goal, type Signal } from './state'
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
    bind['key'] = signal.claim.key
    bind['value'] = signal.claim.value
    // A service key (loc_goose_common#taproom): the place it is at.
    if (signal.claim.subject.includes('#')) bind['at'] = signal.claim.subject.split('#')[0]!
  }
  const area = world.content.locations.get(signal.place)?.area
  if (area) bind['area'] = area
  const ctx: PlanContext = { plan: { plan: '', started: world.now, phase: 0, cause: '', groups: {} }, bind, host, out }
  // The brain of the one it is about may choose an intention of the content instead (M8.2):
  // one person or household, small news, near the player, a model and budget, and intentions to choose from.
  // Each person it is about gets a turn when intentions fit them (two at most: a quarrel has two sides).
  let brainTurn = false
  let chronicler = false
  for (const brainOf of signal.who.filter((id) => world.content.npcs.has(id)).slice(0, 2)) {
    if (!brainMayChoose(world, signal, brainOf) || !offered(world, signal, brainOf).length) continue
    if (triggerChoice(world, brainOf, `Something changed for you: ${signal.kind.replace(/_/g, ' ')}${signal.event ? ` (${signal.event})` : ''}.`, 'signal', signal.id)) brainTurn = true
  }
  if (brainTurn) signal.handled = 'brain'
  // What touches many, matters a lot or fits no intention goes to the chronicler (M8.3); his part waits for his run.
  else if (escalates(world, signal)) {
    toChronicler(world, signal)
    chronicler = true
  }
  for (const a of [...world.content.aftermath.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    if (a.signal !== signal.kind || (a.event && a.event !== signal.event)) continue
    if (!a.when.every((c) => holds(world, bindValue(world, c, ctx)))) continue
    // What the brain may do instead waits for its choice; back from the brain, only that part runs.
    // What goes to the chronicler waits whole for his run; back from him without a plan, all of it runs.
    if (chronicler || (brainTurn && a.brain) || (signal.rules && !signal.whole && !a.brain)) continue
    // One plan per topic per person: a second signal about the same does not start a second plan (design: "Grenzen").
    const subjects = signal.who.length ? (a.about === 'first' ? signal.who.slice(0, 1) : signal.who) : [signal.place]
    const busy = (world.state.plans ?? []).some((p) => p.topic === a.topic && p.ended === undefined && running(world, p) && (p.subjects ?? []).some((s) => subjects.includes(s)))
    if (busy) continue
    out.push(...startPlan(world, host, `aftermath:${a.id}`, signal.kind, { source: 'rules', topic: a.topic, subjects, signal: signal.id, bind: { ...bind } }))
    signal.handled ??= 'rules'
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
  if ('neighbours_of' in sel) {
    const who = one(world, ctx, sel.neighbours_of)
    if (!who || !world.content.npcs.has(who)) return []
    // Grown people who live within three quarters of an hour's walk: a hamlet's neighbours are the next village too.
    const home = world.npc(who).home
    const house = new Set(householdOf(world, who))
    return Object.keys(world.state.npcs)
      .sort()
      .filter((id) => !house.has(id) && world.alive(id) && world.content.npcs.has(id) && !world.npc(id).child && !world.npc(id).quirks.includes('spirit') && !world.npc(id).creature && (world.route(home, world.npc(id).home)?.minutes ?? Infinity) <= 45)
  }
  if ('welcoming' in sel) {
    const at = one(world, ctx, sel.welcoming)
    const area = at && world.content.areas.has(at) ? at : at ? world.content.locations.get(at)?.area : undefined
    return area ? welcomingIn(world, area) : []
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
  return world.content.topics.get(id)?.name ?? world.content.areas.get(id)?.name ?? (world.content.items.has(id) ? (world.content.items.get(id)!.plural ?? `${world.content.items.get(id)!.name}s`) : undefined) ?? world.content.routes.get(id)?.name ?? world.content.outlands.get(id)?.name ?? id
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
    st.where = place
    if (farFromPlayer(world, place)) {
      // Far from the player (M9.1): nobody walks to it; the guests had a good day, and the village hears of it.
      for (const id of guests) if (world.alive(id)) setMood(world, id, 5, 24, 'a good feast')
      for (const a of guests) for (const b of guests) if (a < b && world.alive(a) && world.alive(b)) shiftBond(world, a, b, 2)
      return news(world, ctx, 'feast', ctx.plan.subjects?.filter((s) => isPerson(world, s)) ?? guests.slice(0, 2), vars({ place }), place)
    }
    holdFeast(world, place, world.now, world.now + v.hours * 60, guests)
    return news(world, ctx, 'feast', ctx.plan.subjects?.filter((s) => isPerson(world, s)) ?? guests.slice(0, 2), vars({ place }), place)
  }
  if ('return' in v) {
    const who = one(world, ctx, v.return)
    if (!who || !world.content.npcs.has(who)) return false
    settledElsewhere(world, ctx, who)
    return comeHome(world, ctx, who)
  }
  if ('settle' in v) {
    const who = one(world, ctx, v.settle)
    const at = one(world, ctx, v.at)
    if (!who || !at || !world.content.npcs.has(who) || !world.content.locations.has(at)) return false
    // A free house in that area if there is one, else the place itself.
    const area = world.location(at).area
    const house = Object.keys(world.state.layer?.empty ?? {}).sort().find((h) => world.location(h).area === area) ?? at
    const s = world.npcState(who)
    setHome(world, who, house)
    if (world.npc(who).household) setHousehold(world, who, undefined)
    s.stayAt = undefined
    if (s.note) s.note = { ...s.note, until: world.now, home: false, where: house }
    settledElsewhere(world, ctx, who)
    st.where = house
    const name = nameOf(world, who)
    const areaName = world.content.areas.get(area)?.name ?? nameOf(world, at)
    recordFact(world, { kind: 'settled', about: [who], place: at, belang: 2, title: `${name} stays in ${areaName}`, text: { precise: `${name} is not going back: ${world.say('{they}', who)} lives at ${nameOf(world, house)} now.`, village: `${name} is staying in ${areaName} for good, they say.`, far: 'Some who fled stayed where they found shelter.' } })
    return true
  }
  // Growth (M8.5).
  if ('arrive' in v) {
    const to = world.content.settlements.has(v.to) ? v.to : world.content.locations.get(v.to)?.area
    const template = world.content.newcomers.has(v.arrive) ? v.arrive : templateFor(world, v.arrive)?.id
    const people = to && template ? arrive(world, template, to) : undefined
    if (people?.[0]) st.where = world.npc(people[0]).home
    return Boolean(people)
  }
  if ('build' in v) return startProject(world, v.build)
  if ('crowd' in v) {
    const at = one(world, ctx, v.at)
    if (!at || !world.content.locations.has(at)) return false
    const name = fill(world, v.crowd, ctx.bind)
    addCrowd(world, { id: `crowd_${ctx.plan.id ?? ctx.plan.plan}_${name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`, name, one: fill(world, v.one, ctx.bind), count: v.count, at, from: fill(world, v.from, ctx.bind), profession: v.profession, until: world.now + v.days * 24 * 60, cause: ctx.plan.id ?? ctx.plan.plan })
    const place = world.location(at)
    return Boolean(recordFact(world, { kind: 'crowd', about: [place.area], place: at, belang: 2, title: `${name} at ${place.name}`, text: { precise: `${v.count} ${name} have come to ${place.name}.`, village: `There are ${name} at ${place.name} now, a whole crowd of them.`, far: `There are ${name} in ${world.content.areas.get(place.area)?.name ?? place.area}.` } }))
  }
  if ('rank' in v) {
    const target = fill(world, v.rank, ctx.bind)
    const area = world.content.areas.has(target) ? target : world.content.locations.get(target)?.area
    return Boolean(area) && setRank(world, area!, v.kind, v.cost, v.by ? fill(world, v.by, ctx.bind) : undefined)
  }
  // The economy (M8.4).
  if ('order' in v) {
    const to = world.content.settlements.has(v.to) ? v.to : world.content.locations.get(v.to)?.area
    return Boolean(to) && orderGoods(world, to!, v.order, v.qty, v.days, fill(world, v.by, ctx.bind))
  }
  if ('form_group' in v) {
    const members = v.form_group.flatMap((s) => many(world, ctx, s)).filter((id) => world.content.npcs.has(id) && world.alive(id))
    const area = world.content.areas.has(v.about) ? v.about : world.content.locations.get(v.about)?.area
    if (!members.length || !area) return false
    const groups = (world.state.groups ??= [])
    if (groups.some((g) => !g.ended && g.area === area && g.aim === v.aim)) return true
    const group = { id: `group_${groups.length + 1}`, name: fill(world, v.name, ctx.bind), aim: v.aim, area, members: [...new Set(members)].sort(), since: world.now }
    groups.push(group)
    const names = group.members.map((m) => nameOf(world, m))
    const areaName = world.content.areas.get(area)?.name ?? area
    recordFact(world, { kind: 'group', about: group.members, place: world.npc(group.members[0]!).home, belang: 3, title: `${group.name} in ${areaName}`, text: { precise: `${names.join(', ')} have banded together ${v.aim === 'against' ? 'against the newcomers' : 'to help the newcomers'} in ${areaName}.`, village: v.aim === 'against' ? `Some in ${areaName} want the newcomers gone, and they say so out loud.` : `Some in ${areaName} are taking the newcomers in hand.`, far: 'There is trouble over newcomers somewhere.' } })
    for (const m of group.members) {
      const s = world.state.npcs[m]!
      s.thoughts = [...(s.thoughts ?? []).filter((t) => t.until > world.now), { text: v.aim === 'against' ? `You and ${names.filter((n) => n !== nameOf(world, m)).join(' and ') || 'others'} have had enough of the newcomers.` : `You and the others will see the newcomers through.`, t: world.now, until: world.now + 14 * DAY }].slice(-3)
    }
    return true
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
  if ('goal' in v && 'who' in v) {
    const who = one(world, ctx, v.who)
    const entry = GOAL_CATALOGUE[v.goal]
    if (!who || !world.content.npcs.has(who) || !entry || !world.alive(who)) return false
    const target = one(world, ctx, v.target)
    const s = world.npcState(who)
    const goal: Goal = { id: `g${++world.state.goalSeq}`, type: entry.type, priority: v.priority, source: 'ai', created: world.now, until: world.now + v.hours * 60 }
    if (entry.target === 'item' || entry.target === 'mine') Object.assign(goal, { item: target, qty: 1 })
    else if (entry.target === 'object' && target) Object.assign(goal, { target: target.split('/')[0], object: target.split('/')[1] })
    else if (entry.target !== 'none') {
      if (!target) return false
      goal.target = target
    }
    s.goals.push(goal)
    s.plan = []
    s.planGoal = undefined
    s.busyUntil = Math.min(s.busyUntil, world.now)
    return true
  }
  if ('request' in v) {
    const who = one(world, ctx, v.request)
    const target = one(world, ctx, v.target)
    if (!who || !world.content.npcs.has(who) || !world.alive(who)) return false
    if (v.kind === 'visit' && (!target || !world.content.npcs.has(target))) return false
    if (v.kind === 'fetch' && (!v.item || !world.content.items.has(v.item))) return false
    openRequest(world, { npc: who, kind: v.kind, ...(target ? { target } : {}), ...(v.item ? { item: v.item } : {}), name: fill(world, v.name, ctx.bind), ask: fill(world, v.ask, ctx.bind), source: 'motor' })
    return true
  }
  if ('ask_around' in v) {
    const who = one(world, ctx, v.ask_around)
    if (!who || !world.content.npcs.has(who) || !world.alive(who)) return false
    const [subject, key] = v.about
    const from = world.state.npcs[who]!.location
    // A place within two hours they go and see for themselves: what is true there, they believe.
    if (world.content.locations.has(subject) && (world.route(from, subject)?.minutes ?? Infinity) <= 120) {
      lookForYourself(world, who, subject, key)
      remember(world, who, `went to see ${nameOf(world, subject)} for ${world.say('{them}', who)}self`)
      st.where = subject
      return true
    }
    // Not the one it came from: the nearest trader or traveller within two hours.
    const sources = new Set(Object.entries(world.state.news?.heard[who] ?? {}).filter(([id]) => factById(world, id)?.claim?.subject === subject).map(([, h]) => h.from))
    const trader = Object.keys(world.state.npcs)
      .sort()
      .filter((id) => id !== who && !sources.has(id) && world.present(id) && isTrader(world, id))
      .map((id) => ({ id, minutes: world.route(from, world.state.npcs[id]!.location)?.minutes ?? Infinity }))
      .filter((t) => t.minutes <= 120)
      .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id))[0]?.id
    if (!trader) return false
    const answer = askTrader(world, who, trader, subject, key)
    remember(world, who, `asked ${nameOf(world, trader)} whether it was true; ${answer ? `they said: ${answer}` : 'they did not know'}`)
    st.where = world.state.npcs[trader]!.location
    return true
  }
  if ('carry_word' in v) {
    const who = one(world, ctx, v.carry_word)
    const to = one(world, ctx, v.to)
    if (!who || !to || who === to || !world.content.npcs.has(who) || !world.content.npcs.has(to) || !world.alive(who) || !world.alive(to)) return false
    const heard = world.state.news?.heard[who] ?? {}
    const message = (world.state.news?.facts ?? []).filter((f) => heard[f.id] && heard[f.id]!.stance !== 'rejects' && (f.claim?.subject === v.about || f.about.includes(v.about))).map((f) => f.id)
    if (!message.length) return false
    const s = world.npcState(who)
    s.goals.push({ id: `g${++world.state.goalSeq}`, type: 'Talk', target: to, priority: 1, source: 'ai', created: world.now, until: world.now + 2 * DAY, message })
    s.plan = []
    s.planGoal = undefined
    s.busyUntil = Math.min(s.busyUntil, world.now)
    return true
  }
  if ('chase_away' in v) {
    const [a, b] = v.chase_away.map((x) => one(world, ctx, x))
    if (!a || !b || !world.content.npcs.has(a) || !world.content.npcs.has(b) || !world.present(a) || !world.present(b) || !mayChaseAway(world, a, b)) return true
    const sb = world.npcState(b)
    const place = world.state.npcs[a]!.location
    // Off they go: home, and they keep away from the place for some days.
    sb.stayAt = undefined
    sb.avoid = { place, until: world.now + 3 * DAY }
    sb.plan = []
    sb.planGoal = undefined
    sb.busyUntil = world.now
    sb.thoughts = [...(sb.thoughts ?? []).filter((t) => t.until > world.now), { text: `${nameOf(world, a)} ran you out of ${areaOf(world, place)} without hearing you out.`, t: world.now, until: world.now + 7 * DAY }].slice(-3)
    shiftBond(world, b, a, -20, -20)
    world.emit('chase', place, `${nameOf(world, a)} shouts at ${nameOf(world, b)} to be off, and ${nameOf(world, b)} goes.`, a)
    recordFact(world, { kind: 'chased', about: [a, b], place, belang: 2, loud: true, title: `${nameOf(world, a)} chased a stranger out of ${areaOf(world, place)}`, text: { precise: `${nameOf(world, a)} ran ${nameOf(world, b)} out of ${areaOf(world, place)} and would not listen to a word.`, village: `${nameOf(world, a)} chased a stranger off, they say.`, far: 'Somebody was chased out of a village.' } })
    st.where = place
    return true
  }
  if ('mediate' in v) return mediate(world, ctx, v.mediate.map((x) => one(world, ctx, x)) as [string | undefined, string | undefined], one(world, ctx, v.by), st)
  if ('recall' in v) {
    const who = one(world, ctx, v.recall)
    const of = one(world, ctx, v.of)
    if (!who || !of || !world.state.npcs[who] || !world.content.npcs.has(of)) return false
    const s = world.npcState(who)
    const memory = [...(s.memory ?? [])].reverse().find((m) => m.topics.includes(of))
    const line = memory ? memory.note : `You knew ${nameOf(world, of)} once.`
    s.thoughts = [...(s.thoughts ?? []).filter((t) => t.until > world.now), { text: `${nameOf(world, of)} is back. ${line}`, t: world.now, until: world.now + 7 * DAY }].slice(-3)
    const row = ((world.state.bonds ??= {})[who] ??= {})
    const bond = (row[of] ??= { affinity: 0, trust: 0, fear: 0, familiarity: 0 })
    bond.familiarity = Math.max(bond.familiarity, 30)
    return true
  }
  if ('spread_rumour' in v) {
    const who = one(world, ctx, v.spread_rumour)
    if (!who || !world.content.npcs.has(who) || !world.present(who) || !mayLieAbout(world, who)) return false
    const t = v.fact
    const where = world.state.npcs[who]!.location
    const vars = { ...ctx.bind, who, place: where }
    const claim = t.claim ? { ...t.claim, subject: bindValue(world, t.claim.subject, ctx), value: bindValue(world, t.claim.value, ctx) } : undefined
    // Only they know it at first, and not as a witness: they pass it on as news.
    const fact = recordFact(world, { kind: t.kind, about: [], place: where, belang: t.belang, truth: false, witnesses: [], title: fill(world, t.title, vars), text: { precise: fill(world, t.precise, vars), village: fill(world, t.village, vars), far: fill(world, t.far, vars) }, ...(claim ? { claim } : {}) })
    heardBy(world, who)[fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    const s = world.npcState(who)
    s.goals.push({ id: `g${++world.state.goalSeq}`, type: 'Spread', priority: 0.9, source: 'ai', created: world.now, until: world.now + DAY })
    s.busyUntil = Math.min(s.busyUntil, world.now)
    return true
  }
  // Everything an effect plan could already do. A flight in a plan with steps has no end of its own.
  if ('news' in v && 'area' in v) {
    if (!world.content.areas.has(v.area)) return false
    setAreaNews(world, v.area, fill(world, v.news, ctx.bind), ctx.out)
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
  const finders = t.witnesses ? bindValue(world, t.witnesses, ctx).filter((id) => world.content.npcs.has(id)) : undefined
  const fact = recordFact(world, {
    kind: t.kind,
    about: bindValue(world, t.about, ctx).filter((id) => world.content.npcs.has(id) || world.content.topics.has(id) || world.content.locations.has(id)),
    place: world.content.locations.has(where) ? where : world.state.player.location,
    belang: t.belang,
    title: fill(world, t.title, vars),
    text: { precise: fill(world, t.precise, vars), village: fill(world, t.village, vars), far: fill(world, t.far, vars) },
    ...(claim ? { claim } : {}),
    ...(finders ? { witnesses: finders } : {}),
  })
  // Who came upon it knows it, wherever they are by now (M9.4): the leak Teunis saw on the dyke road.
  for (const id of finders ?? []) if (world.alive(id)) heardBy(world, id)[fact.id] ??= { level: 3, reliability: 1, from: 'witness', t: world.now }
  return fact.id
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

/** Whoever goes home or stays for good by this plan is no longer waited for by the return step of their flight. */
function settledElsewhere(world: World, ctx: PlanContext, who: string): void {
  for (const p of world.state.plans ?? []) {
    if (p === ctx.plan || p.ended !== undefined || !Object.values(p.groups).flat().includes(who)) continue
    for (const step of planOf(world, p.plan)?.steps ?? []) {
      if (!step.each || !(p.groups[step.each] ?? []).includes(who)) continue
      const st = ((p.steps ??= {})[step.id] ??= {})
      ;(st.members ??= {})[who] ??= -world.now
    }
  }
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
    // Far from the player nobody walks (M9.1): they are home, as a change of state.
    if (farFromPlayer(world, s.location) && farFromPlayer(world, home)) {
      s.location = home
      s.activity = 'home again'
    }
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
      // Someone of a group against the newcomers will not take one on (M8.3).
      if (againstNewcomer(world, service.provider, id)) return false
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
  for (const [board, list] of Object.entries(world.state.boards ?? {})) world.state.boards![board] = list.filter((f) => factById(world, f)?.claim?.subject !== key)
  return true
}

/** The player (or anyone) tries to make peace between two with a grudge: 'reconciled', 'worse', or 'none' when there was nothing to settle. */
export function mediateBetween(world: World, a: string, b: string, by: string): 'reconciled' | 'worse' | 'none' {
  const bonds = world.state.bonds ?? {}
  if (!bonds[a]?.[b]?.grudge && !bonds[b]?.[a]?.grudge) return 'none'
  const ctx: PlanContext = { plan: { plan: '', started: world.now, phase: 0, cause: '', groups: {} }, bind: {}, host: { pass: () => [] }, out: [] }
  mediate(world, ctx, [a, b], by, {})
  return bonds[a]?.[b]?.grudge === undefined && bonds[b]?.[a]?.grudge === undefined ? 'reconciled' : 'worse'
}

/** Someone goes to look at a place: the truth of it is what they believe now. */
function lookForYourself(world: World, who: string, subject: string, key: string): void {
  const store = world.state.news
  if (!store) return
  const facts = store.facts.filter((f) => f.claim?.subject === subject && f.claim.key === key)
  const truth = [...facts].reverse().find((f) => f.truth !== false)
  const mine = (store.heard[who] ??= {})
  for (const f of facts) {
    const h = mine[f.id]
    if (!h) continue
    const value = h.level === 1 && f.claim!.far !== undefined ? f.claim!.far : f.claim!.value
    if (truth && value === truth.claim!.value) delete h.stance
    else h.stance = 'rejects'
  }
  if (truth) {
    mine[truth.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    watchBelief(world, who, truth, 'witness')
  }
}

/** Trust that counts for making peace is a bond: a plain neighbour is no mediator. */
function trustFor(world: World, from: string, to: string): number {
  const village = (id: string) => world.content.locations.get(world.npc(id).home)?.area
  return to === 'player' ? relation(world.state, from).trust : (world.state.bonds?.[from]?.[to]?.trust ?? (village(from) === village(to) ? 10 : 0))
}

/** Who two people at odds both trust most: the mediators to choose from. */
export function mediators(world: World, a: string, b: string, n: number): string[] {
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => id !== a && id !== b && world.present(id) && !world.npc(id).child && !world.npc(id).quirks.includes('spirit'))
    .map((id) => ({ id, score: Math.min(trustFor(world, a, id), trustFor(world, b, id)) }))
    .filter((m) => m.score > 0)
    .sort((x, y) => y.score - x.score || x.id.localeCompare(y.id))
    .slice(0, n)
    .map((m) => m.id)
}

/**
 * Making peace (design: "Een ruzie die blijft"): who mediates decides how it
 * ends. Someone both trust makes it up between them; someone only one side
 * trusts makes the other feel ganged up on, and the grudge goes deeper.
 * Without a mediator nothing changes, and a week later it is a feud.
 */
function mediate(world: World, ctx: PlanContext, [a, b]: [string | undefined, string | undefined], by: string | undefined, st: StepState): boolean {
  if (!a || !b || !world.content.npcs.has(a) || !world.content.npcs.has(b)) return false
  const bonds = world.state.bonds ?? {}
  if (!bonds[a]?.[b]?.grudge && !bonds[b]?.[a]?.grudge) return true
  const trust = (from: string, to: string) => trustFor(world, from, to)
  const mediator = by ?? mediators(world, a, b, 1)[0]
  if (!mediator) return true
  const ta = trust(a, mediator)
  const tb = trust(b, mediator)
  const place = world.state.npcs[a]?.location ?? world.npc(a).home
  st.where = place
  const names = { a: nameOf(world, a), b: nameOf(world, b), m: nameOf(world, mediator) }
  if (ta >= 20 && tb >= 20) {
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const bond = ((world.state.bonds ??= {})[x] ??= {})[y]
      if (bond) delete bond.grudge
      shiftBond(world, x, y, 10, 5)
    }
    recordFact(world, { kind: 'reconciled', about: [a, b, ...(world.content.npcs.has(mediator) ? [mediator] : [])], place, belang: 1, title: `${names.m} made peace between ${names.a} and ${names.b}`, text: { precise: `${names.m} sat ${names.a} and ${names.b} down together, and they shook on it.`, village: `${names.a} and ${names.b} have made it up, they say. ${names.m} saw to that.`, far: 'Two who quarrelled made it up.' } })
    return true
  }
  // Trusted by one side only: the other feels ganged up on.
  const sore = ta >= 20 ? b : a
  const other = sore === a ? b : a
  shiftBond(world, sore, other, -10, -5)
  if (world.content.npcs.has(mediator)) shiftBond(world, sore, mediator, -10, -10)
  recordFact(world, { kind: 'mediation_failed', about: [a, b, ...(world.content.npcs.has(mediator) ? [mediator] : [])], place, belang: 1, title: `${names.m} took sides between ${names.a} and ${names.b}`, text: { precise: `${names.m} tried to make peace, but ${nameOf(world, sore)} says ${names.m} was on the other side from the start.`, village: `${names.m} meddled between ${names.a} and ${names.b}, and made it worse.`, far: 'A quarrel got worse.' } })
  void ctx
  return true
}

function areaOf(world: World, place: string): string {
  const loc = world.content.locations.get(place)
  return (loc && world.content.areas.get(loc.area)?.name) ?? world.words.region
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

// ---------------------------------------------------------------- the standard conditions of verbs (M9.2)

const UNSAFE = ['flooded', 'destroyed', 'occupied']

const unsafe = (world: World, place: string | undefined) => Boolean(place && UNSAFE.includes(world.state.places?.[place]?.state ?? 'normal'))

/** What drove someone away: what their flight waits to know otherwise, or the newest big claim on the plan's storyline. */
function dangerOf(world: World, who: string, p: PlanState): Claim | undefined {
  const flight = causeOf(world, [who])
  if (flight) return flight
  const line = p.line ? world.state.chronicle?.lines.find((l) => l.id === p.line) : undefined
  return line?.facts
    .map((id) => factById(world, id))
    .filter((f) => f?.claim && f.belang >= 4)
    .at(-1)?.claim
}

/**
 * Why a verb may not happen now, whoever planned it (M9.2; design: "Na M9.1:
 * waarheid en samenhang"), or undefined when it may. Checked when the step
 * runs, not when it was planned. The words are in verbs.ts (GUARDS).
 */
export function verbGuard(world: World, ctx: PlanContext, v: Verb): string | undefined {
  if ('return' in v) {
    const who = one(world, ctx, v.return)
    if (!who || !world.content.npcs.has(who)) return undefined
    if (unsafe(world, world.npc(who).home)) return 'their house is not safe'
    if (!holds(world, { thinks_home_stands: who })) return 'they do not believe their house stands'
    const cause = dangerOf(world, who, ctx.plan)
    if (cause && !holds(world, { knows: { who, subject: cause.subject, key: cause.key, not: cause.value } })) return 'they do not know it is over'
    return undefined
  }
  if ('feast' in v) return unsafe(world, one(world, ctx, v.feast)) ? 'the place is not safe' : undefined
  if ('move_home' in v) return unsafe(world, one(world, ctx, v.to)) ? 'the place is not safe' : undefined
  if ('settle' in v) return unsafe(world, one(world, ctx, v.at)) ? 'the place is not safe' : undefined
  return undefined
}
