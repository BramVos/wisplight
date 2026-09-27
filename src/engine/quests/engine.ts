import { GameClock } from '../clock'
import type { Output } from '../commands'
import { callName, type Quest } from '../content'
import { applyEffect, attitude, type Attitude } from '../dialogue/relations'
import { add } from '../items'
import { die } from '../life'
import { homeOf, livesWithParent } from '../layer'
import { believes, recordFact } from '../news'
import { tieTo } from '../people'
import { addClock, favour, gainXp, playerCheck, tickClock, type Clock } from '../rules/player'
import { blessed } from '../rules/blessings'
import { approve, companionOf } from '../social/companions'
import { repute } from '../social/factions'
import type { World } from '../world'
import type { Condition, KnowsClaim, PlaceStateName, QuestAction, QuestEffect } from './schema'

// The quest engine (FO, chapter 14): a quest gives NPCs a part and goals and
// lets the systems do the rest. Stages move on when their conditions hold,
// actions of the quest's own let the player do what the story needs, and an
// ending is reached by any road that leads there. The world does not wait:
// clocks run, people die, places flood, and a quest reacts to that.

export interface QuestState {
  stage: string
  started: number
  stageAt: number
  path: string[]
  done: string[]
  outcome?: string
  ended?: number
}

/** What the quest engine needs from the engine: time, effect plans and encounters. */
export interface QuestHost {
  pass(minutes: number): Output[]
  plan?(id: string): void
  encounter?(id: string): Output[]
}

const DAY = 24 * 60
const ORDER: Attitude[] = ['Hostile', 'Unfriendly', 'Wary', 'Neutral', 'Friendly', 'Warm', 'Devoted']

export function questlog(world: World): Record<string, QuestState> {
  return (world.state.questlog ??= {})
}

export function flags(world: World): Record<string, string | number | boolean> {
  return (world.state.flags ??= {})
}

export function active(world: World): [Quest, QuestState][] {
  const log = questlog(world)
  return Object.keys(log)
    .sort()
    .filter((id) => !log[id]!.ended && world.content.quests.has(id))
    .map((id) => [world.content.quests.get(id)!, log[id]!])
}

// ---------------------------------------------------------------- conditions

export function holds(world: World, c: Condition, questId?: string): boolean {
  const f = flags(world)
  const player = world.state.player
  if ('flag' in c) return c.is === undefined ? Boolean(f[c.flag]) : f[c.flag] === c.is
  if ('not_flag' in c) return !f[c.not_flag]
  if ('knows' in c) return typeof c.knows === 'string' ? (player.journal ?? {})[c.knows] !== undefined || Boolean(f[`knows:${c.knows}`]) : knowsClaim(world, c.knows)
  if ('has' in c) return (player.inventory[c.has] ?? 0) >= (c.qty ?? 1)
  if ('money' in c) return player.money >= c.money
  if ('attitude' in c) return world.content.npcs.has(c.attitude) && ORDER.indexOf(attitude(world, c.attitude).band) >= ORDER.indexOf(c.at_least)
  if ('clock' in c) return ((world.state.clocks?.[c.clock] as Clock | undefined)?.filled ?? 0) >= c.at_least
  if ('clock_full' in c) {
    const clock = world.state.clocks?.[c.clock_full] as Clock | undefined
    return Boolean(clock && clock.filled >= clock.size)
  }
  if ('at' in c) return player.location === c.at || world.content.locations.get(player.location)?.area === c.at
  if ('npc_at' in c) return world.state.npcs[c.npc_at]?.location === c.place || world.content.locations.get(world.state.npcs[c.npc_at]?.location ?? '')?.area === c.place
  if ('dead' in c) return Boolean(world.state.npcs[c.dead]?.dead)
  if ('alive' in c) return Boolean(world.state.npcs[c.alive] && !world.state.npcs[c.alive]!.dead)
  if ('stage' in c) {
    const [q, s] = c.stage.split(':')
    return questlog(world)[q!]?.stage === s
  }
  if ('outcome' in c) {
    const [q, o] = c.outcome.split(':')
    return questlog(world)[q!]?.outcome === o || (o === '*' && Boolean(questlog(world)[q!]?.outcome))
  }
  if ('days' in c) {
    const q = questId ? questlog(world)[questId] : undefined
    return Boolean(q && world.now - q.started >= c.days * DAY)
  }
  if ('day' in c) return Math.floor((world.now - startMinute(world)) / DAY) >= c.day
  if ('reputation' in c) return (world.state.reputation?.[c.reputation] ?? 0) >= c.at_least
  if ('companion' in c) return Boolean(companionOf(world, c.companion))
  if ('place_state' in c) return (world.state.places?.[c.place_state]?.state ?? 'normal') === c.is
  if ('fact' in c) return (world.state.news?.facts ?? []).some((x) => x.kind === c.fact)
  if ('level' in c) return (player.character?.level ?? 1) >= c.level
  if ('since' in c) return f[c.since] === undefined || world.now - Number(f[c.since]) >= c.hours * 60
  if ('count' in c) return Number(f[c.count] ?? 0) >= c.at_least
  if ('weekday' in c) return new GameClock(world.now).parts.weekday === c.weekday
  if ('night' in c) return new GameClock(world.now).isNight === c.night
  if ('wields' in c) {
    const weapon = player.character?.gear.weapon
    return Boolean(weapon && world.content.items.get(weapon)?.weapon?.iron)
  }
  if ('here' in c) return world.npcsAt(player.location).includes(c.here)
  if ('weather' in c) return (world.state.weather?.kind ?? 'clear') === c.weather
  if ('object' in c) {
    const state = world.state.objects[c.object] ?? {}
    return Object.entries(c.state).every(([k, v]) => (state[k] ?? false) === v)
  }
  // About people, for plans (M8.1).
  if ('is_player' in c) return c.is_player === 'player'
  if ('has_work' in c) return world.content.npcs.has(c.has_work) && Boolean(world.npc(c.has_work).work)
  if ('lives_with_parent' in c) return livesWithParent(world, c.lives_with_parent)
  if ('commute' in c) {
    if (!world.content.npcs.has(c.commute)) return false
    const npc = world.npc(c.commute)
    return Boolean(npc.work) && (world.route(npc.home, npc.work!)?.minutes ?? Infinity) >= c.at_least
  }
  if ('thinks_home_stands' in c) {
    const home = homeOf(world, c.thinks_home_stands)
    const belief = home ? believes(world, c.thinks_home_stands, home, 'state') : undefined
    return !belief || !['flooded', 'destroyed', 'occupied'].includes(belief.value)
  }
  if ('tie' in c) return tieTo(world, c.tie[0], c.tie[1])?.role === c.role
  if ('any' in c) return c.any.some((x) => holds(world, x, questId))
  if ('all' in c) return c.all.every((x) => holds(world, x, questId))
  if ('not' in c) return !holds(world, c.not, questId)
  return false
}

/** What someone believes about a claim: a value, anything but some values, how precise, how recent (M8.1). */
function knowsClaim(world: World, k: KnowsClaim): boolean {
  const belief = believes(world, k.who, k.subject, k.key)
  if (!belief) return false
  const list = (v: string | string[] | undefined) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])
  const want = list(k.value)
  const not = list(k.not)
  if (want && !want.includes(belief.value)) return false
  if (not && not.includes(belief.value)) return false
  if (k.level !== undefined && belief.level < k.level) return false
  if (k.days !== undefined && world.now - belief.t > k.days * DAY) return false
  return true
}

export function allHold(world: World, list: Condition[], questId?: string): boolean {
  return list.every((c) => holds(world, c, questId))
}

function startMinute(world: World): number {
  const s = world.content.world.start
  return GameClock.from(s.year, s.month, s.day, s.hour, s.minute).minutes
}

// ---------------------------------------------------------------- effects

export function applyEffects(world: World, host: QuestHost, questId: string | undefined, effects: QuestEffect[], out: Output[]): void {
  for (const e of effects) {
    if ('set' in e) flags(world)[e.set] = e.value
    else if ('unset' in e) delete flags(world)[e.unset]
    else if ('give' in e) add(world.state.player.inventory, e.give, e.qty)
    else if ('take' in e) {
      const inv = world.state.player.inventory
      inv[e.take] = Math.max(0, (inv[e.take] ?? 0) - e.qty)
      if (!inv[e.take]) delete inv[e.take]
    } else if ('pay' in e) world.state.player.money = Math.max(0, world.state.player.money + e.pay)
    else if ('xp' in e) gainXp(world, e.xp, e.why)
    else if ('reputation' in e) repute(world, e.reputation, e.delta, questId ? world.content.quests.get(questId)?.name ?? 'a quest' : 'what you did')
    else if ('relation' in e) {
      if (!world.content.npcs.has(e.relation)) continue
      if (e.affinity) applyEffect(world, e.relation, 'affinity', e.affinity)
      if (e.trust) applyEffect(world, e.relation, 'trust', e.trust)
      if (e.fear) applyEffect(world, e.relation, 'fear', e.fear)
    } else if ('fact' in e) {
      const place = e.fact.place ?? world.state.player.location
      recordFact(world, { kind: e.fact.kind ?? (questId ? `quest:${questId}` : 'quest'), about: e.fact.about.filter((t) => world.content.topics.has(t) || world.content.npcs.has(t) || world.content.locations.has(t)), place, belang: e.fact.belang, title: e.fact.title, text: { precise: e.fact.precise, village: e.fact.village, far: e.fact.far }, ...(e.fact.claim ? { claim: e.fact.claim } : {}) })
    } else if ('goal' in e) {
      const s = world.state.npcs[e.goal]
      if (!s || s.dead || s.following) continue
      const id = `quest_${questId ?? 'x'}_${e.goal}`
      s.goals = s.goals.filter((g) => g.id !== id)
      s.goals.push({ id, type: e.type, target: e.target, priority: 1, source: 'ai', created: world.now, until: world.now + e.hours * 60 })
      s.plan = []
      s.planGoal = undefined
      s.busyUntil = Math.min(s.busyUntil, world.now)
    } else if ('grievance' in e) {
      const s = world.state.npcs[e.grievance]
      if (s && !s.dead) s.grievance = { reason: questId ?? 'quest', t: world.now, line: e.line }
    } else if ('clock' in e) addClock(world, { id: e.clock.id, name: e.clock.name, size: e.clock.size, full: e.clock.full })
    else if ('tick' in e) {
      const clock = world.state.clocks?.[e.tick] as Clock | undefined
      if (!clock) continue
      if (e.n < 0) clock.filled = Math.max(0, clock.filled + e.n)
      else if (tickClock(world, e.tick, e.n)) out.push({ kind: 'system', text: `${clock.name}: full. ${clock.full}` })
    } else if ('stage' in e) {
      if (questId) enterStage(world, host, questId, e.stage, out)
    } else if ('outcome' in e) {
      if (questId) endQuest(world, host, questId, e.outcome, out)
    } else if ('restore' in e) {
      const s = world.state.npcs[e.restore]
      if (!s) continue
      s.absent = false
      s.location = e.at ?? world.npc(e.restore).home
      s.busyUntil = world.now
      s.activity = 'home again'
    } else if ('move' in e) {
      const s = world.state.npcs[e.move]
      if (s && !s.dead) {
        s.location = e.to
        s.plan = []
        s.planGoal = undefined
        if (e.days) s.stayAt = { where: e.to, until: world.now + e.days * DAY }
      }
    } else if ('place' in e) setPlaceState(world, host, e.place, e.state, out)
    else if ('plan' in e) host.plan?.(e.plan)
    else if ('favour' in e) favour(world, e.favour)
    else if ('approve' in e) approve(world, e.approve)
    else if ('text' in e) out.push({ kind: 'narration', text: e.text })
    else if ('start' in e) out.push(...startQuest(world, host, e.start))
    else if ('kill' in e) die(world, e.kill, { cause: e.cause })
    else if ('learn' in e) (world.state.player.journal ??= {})[e.learn] ??= world.now
    else if ('player_condition' in e) {
      const c = world.state.player.character
      if (c) {
        c.conditions[e.player_condition] = 1
        ;(world.state.player.conditionsUntil ??= {})[e.player_condition] = world.now + e.hours * 60
      }
    } else if ('encounter' in e) out.push(...(host.encounter?.(e.encounter) ?? []))
    else if ('stamp' in e) flags(world)[e.stamp] = world.now
    else if ('count' in e) flags(world)[e.count] = Number(flags(world)[e.count] ?? 0) + e.n
    else if ('hand' in e) {
      const inv = world.state.player.inventory
      const n = Math.min(e.qty, inv[e.hand] ?? 0)
      if (n <= 0 || !world.state.npcs[e.to]) continue
      inv[e.hand]! -= n
      if (!inv[e.hand]) delete inv[e.hand]
      add(world.npcState(e.to).inventory, e.hand, n)
    } else if ('send' in e) {
      const s = world.state.npcs[e.send]
      if (s && !s.dead && !s.following) {
        s.stayAt = { where: e.to, until: world.now + e.hours * 60 }
        s.plan = []
        s.planGoal = undefined
        s.busyUntil = Math.min(s.busyUntil, world.now)
      }
    } else if ('vanish' in e) {
      const s = world.state.npcs[e.vanish]
      if (s && !s.dead) {
        s.absent = true
        s.plan = []
        s.goals = []
      }
    } else if ('join' in e) {
      const m = (world.state.memberships ??= [])
      if (!m.includes(e.join)) m.push(e.join)
    } else if ('seize' in e) {
      const inv = world.state.npcs[e.from]?.inventory
      const n = Math.min(e.qty, inv?.[e.seize] ?? 0)
      if (!inv || n <= 0) continue
      inv[e.seize]! -= n
      if (!inv[e.seize]) delete inv[e.seize]
      add(world.state.player.inventory, e.seize, n)
    }
  }
}

/** A place changes (design: toestand van plekken): flooded, damaged, destroyed, abandoned, occupied, drained. */
export function setPlaceState(world: World, host: QuestHost, location: string, state: PlaceStateName, out: Output[]): void {
  const places = (world.state.places ??= {})
  const was = places[location]?.state
  if (state === 'normal') delete places[location]
  else places[location] = { state, since: world.now }
  // A place that is itself again is news with a claim (M8.1): whoever hears it knows they can go back.
  if (state === 'normal' && was && was !== 'drained' && world.content.locations.has(location)) {
    const name = world.location(location).name
    recordFact(world, { kind: 'place', about: [location], place: location, belang: 2, title: `${name} is itself again`, text: { precise: `${name} is ${was === 'occupied' ? 'free again' : 'safe again'}; people can go back.`, village: `${name} is ${was === 'occupied' ? 'free again' : 'all right again'}, they say.`, far: `Things are better in ${world.content.areas.get(world.location(location).area)?.name ?? world.words.region}, they say.` }, claim: { subject: location, key: 'state', value: 'normal' } })
  }
  // Quests react to the state of the world, not to text.
  for (const [quest, q] of active(world)) {
    const to = quest.on_place?.[`${location}:${state}`] ?? (state !== 'normal' ? quest.on_place?.[location] : undefined)
    if (to) route(world, host, quest.id, to, out)
    void q
  }
}

function route(world: World, host: QuestHost, questId: string, to: string, out: Output[]): void {
  const quest = world.content.quests.get(questId)!
  if (quest.outcomes?.some((o) => o.id === to)) endQuest(world, host, questId, to, out)
  else if (quest.stages?.some((s) => s.id === to)) enterStage(world, host, questId, to, out)
  else if (world.content.quests.has(to)) {
    endQuest(world, host, questId, 'overtaken', out)
    out.push(...startQuest(world, host, to))
  }
}

// ---------------------------------------------------------------- the course of a quest

export function startQuest(world: World, host: QuestHost, questId: string): Output[] {
  const quest = world.content.quests.get(questId)
  const log = questlog(world)
  if (!quest || log[questId] || !quest.stages?.length) return []
  const first = quest.stages[0]!
  log[questId] = { stage: first.id, started: world.now, stageAt: world.now, path: [first.id], done: [] }
  const out: Output[] = []
  if (quest.ask && quest.givers[0] && world.state.npcs[quest.givers[0]]?.location === world.state.player.location) out.push({ kind: 'speech', text: `${callName(world.npc(quest.givers[0]))}: ${quest.ask}` })
  out.push({ kind: 'system', text: `New quest: ${quest.name}. ${first.text}` })
  applyEffects(world, host, questId, first.on_enter ?? [], out)
  return out
}

function enterStage(world: World, host: QuestHost, questId: string, stageId: string, out: Output[]): void {
  const quest = world.content.quests.get(questId)!
  const q = questlog(world)[questId]
  const stage = quest.stages?.find((s) => s.id === stageId)
  if (!q || q.ended || !stage || q.stage === stageId) return
  q.stage = stageId
  q.stageAt = world.now
  q.path.push(stageId)
  out.push({ kind: 'system', text: `${quest.name}: ${stage.text}` })
  applyEffects(world, host, questId, stage.on_enter ?? [], out)
}

export const QUEST_XP: Record<string, number> = { main: 400, personal: 250, conflict: 300, threat: 200, mystery: 200, bargain: 150, discovery: 150, social: 150, trial: 200, request: 100 }

export function endQuest(world: World, host: QuestHost, questId: string, outcomeId: string, out: Output[]): void {
  const quest = world.content.quests.get(questId)!
  const q = questlog(world)[questId]
  if (!q || q.ended) return
  const outcome = quest.outcomes?.find((o) => o.id === outcomeId)
  q.outcome = outcomeId
  q.ended = world.now
  out.push({ kind: 'system', text: `${quest.name}: ${outcome ? `${outcome.name}. ${outcome.text}` : 'It is over.'}` })
  // Experience for every solution, not only the violent ones (FO, chapter 14, "Beloningen").
  if (outcome?.solution) gainXp(world, QUEST_XP[quest.kind] ?? 150, quest.name)
  // Every outcome is a fact the world can hear of (M8.1), unless it has one of its own.
  if (!outcome?.effects.some((e) => 'fact' in e)) outcomeFact(world, quest, outcomeId, outcome?.name, outcome?.text)
  if (outcome) applyEffects(world, host, questId, outcome.effects, out)
}

/** The fact of a quest's outcome: where the giver is, about the people with a part, with a claim for the watchers. */
function outcomeFact(world: World, quest: Quest, outcomeId: string, name: string | undefined, text: string | undefined): void {
  const giver = quest.givers.find((g) => world.state.npcs[g] && !world.state.npcs[g]!.note) ?? quest.givers[0]
  const at = giver && world.state.npcs[giver] && !world.state.npcs[giver]!.dead ? world.state.npcs[giver]!.location : world.state.player.location
  const place = world.content.locations.has(at) ? at : world.state.player.location
  const people = [...new Set([...quest.givers, ...quest.helpers, ...quest.opponents])].filter((id) => world.content.npcs.has(id))
  const told = text ?? `${quest.name} is over.`
  recordFact(world, {
    kind: `quest:${quest.id}`,
    about: people,
    place,
    belang: quest.kind === 'main' ? 3 : 2,
    title: `${quest.name}: ${name ?? 'the end of it'}`,
    text: { precise: told, village: told, far: `Something happened in ${world.content.areas.get(world.location(place).area)?.name ?? world.words.region}, they say.` },
    claim: { subject: quest.id, key: 'outcome', value: outcomeId },
  })
}

/** Stages move on and endings are reached when their conditions hold; loops until nothing changes. */
export function evaluate(world: World, host: QuestHost): Output[] {
  const out: Output[] = []
  // Clocks that run by themselves while their quest is on.
  for (const [quest, q] of active(world)) {
    const timer = quest.timer
    if (!timer) continue
    const key = `timer:${quest.id}`
    // The clock runs from the moment it exists.
    if (!world.state.clocks?.[timer.clock]) {
      flags(world)[key] = world.now
      continue
    }
    const last = Number(flags(world)[key] ?? q.started)
    const every = timer.every_hours * 60
    for (let t = last + every; t <= world.now; t += every) {
      flags(world)[key] = t
      // Paused while its conditions hold: the widow waits while her price is being paid.
      if (timer.unless.length && allHold(world, timer.unless, quest.id)) continue
      applyEffects(world, host, quest.id, [{ tick: timer.clock, n: 1 }], out)
    }
  }
  for (let round = 0; round < 20; round++) {
    let changed = false
    for (const [quest, q] of active(world)) {
      const ending = quest.outcomes?.find((o) => o.when.length > 0 && allHold(world, o.when, quest.id))
      if (ending) {
        endQuest(world, host, quest.id, ending.id, out)
        changed = true
        continue
      }
      const stage = quest.stages?.find((s) => s.id === q.stage)
      const next = stage?.next.find((n) => allHold(world, n.when, quest.id))
      if (next) {
        applyEffects(world, host, quest.id, next.effects, out)
        route(world, host, quest.id, next.to, out)
        changed = true
      }
    }
    for (const quest of world.content.quests.values()) {
      if (questlog(world)[quest.id] || !quest.stages?.length) continue
      const s = quest.starts
      // A quest with a person or a place to begin at waits for them; the conditions are its gate.
      if (s && s.when.length && !s.talk.length && !s.at.length && !s.at_start && allHold(world, s.when)) {
        out.push(...startQuest(world, host, quest.id))
        changed = true
      }
    }
    if (!changed) break
  }
  return out
}

/** Quests that begin when the player talks to someone, or comes somewhere. */
export function triggers(world: World, host: QuestHost, on: { talk?: string; at?: string; newGame?: boolean }): Output[] {
  const out: Output[] = []
  for (const quest of [...world.content.quests.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (questlog(world)[quest.id] || !quest.stages?.length || !quest.starts) continue
    const s = quest.starts
    const hit = (on.talk && s.talk.includes(on.talk)) || (on.at && (s.at.includes(on.at) || s.at.includes(world.content.locations.get(on.at)?.area ?? ''))) || (on.newGame && s.at_start)
    if (hit && (!s.when.length || allHold(world, s.when))) out.push(...startQuest(world, host, quest.id))
  }
  return out
}

/**
 * The quest's own verbs (FO, chapter 14): a sentence that matches one of an
 * action's patterns, at the right place, with the conditions met, and a
 * check where the action has one.
 */
export function questAction(world: World, host: QuestHost, input: string): Output[] | undefined {
  const text = input.trim().toLowerCase().replace(/[.!]+$/, '')
  for (const [quest, q] of active(world)) {
    for (const action of quest.actions ?? []) {
      if (action.once && q.done.includes(action.id)) continue
      if (!action.say.some((p) => new RegExp(`^(?:${p})$`, 'i').test(text))) continue
      const refusal = actionBlocked(world, quest.id, action)
      if (refusal !== undefined) {
        if (refusal) return [{ kind: 'narration', text: refusal }]
        continue
      }
      return perform(world, host, quest.id, q, action)
    }
  }
  return undefined
}

/** Carries out a quest action: the check, the text and the effects, the time it takes, and what follows. */
function perform(world: World, host: QuestHost, questId: string, q: QuestState, action: QuestAction): Output[] {
  const out: Output[] = []
  let success = true
  if (action.check) {
    // Oath-bound (Baduhenna): +2 on checks that serve a word you gave; a quest you took on is one.
    const oath = blessed(world.content, world.state.player.character, 'Oath-bound') ? 2 : 0
    const result = playerCheck(world, action.check.skill, action.check.dc - oath)
    out.push({ kind: 'check', text: `(${cap(action.check.skill)} ${result.total} vs DC ${action.check.dc}: ${result.degree})` })
    success = result.degree === 'success' || result.degree === 'critical success'
  }
  if (success) {
    q.done.push(action.id)
    out.push({ kind: 'narration', text: action.text })
    applyEffects(world, host, questId, action.effects, out)
  } else {
    out.push({ kind: 'narration', text: action.fail_text ?? 'It does not work.' })
    applyEffects(world, host, questId, action.fail, out)
  }
  if (action.minutes) out.push(...host.pass(action.minutes))
  out.push(...evaluate(world, host))
  return out
}

/**
 * The quest actions that can be done here and now with someone (M7.2): the
 * voice gets them, so that free speech in a conversation can mean one of
 * them, even in other words than the fixed phrases.
 */
export function conversationActions(world: World, npcId: string): { key: string; intent: string }[] {
  const here = world.state.player.location
  const area = world.content.locations.get(here)?.area
  const list: { key: string; intent: string }[] = []
  for (const [quest, q] of active(world)) {
    for (const action of quest.actions ?? []) {
      if (action.once && q.done.includes(action.id)) continue
      const withThem = action.with === npcId
      const hereOnly = !action.with && (action.at.length === 0 || action.at.includes(here) || (area !== undefined && action.at.includes(area)))
      if (!withThem && !hereOnly) continue
      if (actionBlocked(world, quest.id, action) !== undefined) continue
      list.push({ key: `${quest.id}:${action.id}`, intent: action.intent ?? plainWords(action.say[0]!) })
    }
  }
  return list.slice(0, 12)
}

/** A quest action by its key, when the voice recognised it in what the player said. */
export function runQuestAction(world: World, host: QuestHost, key: string): Output[] | undefined {
  const [questId, actionId] = key.split(':')
  const q = questlog(world)[questId ?? '']
  const action = world.content.quests.get(questId ?? '')?.actions?.find((a) => a.id === actionId)
  if (!q || q.ended || !action || (action.once && q.done.includes(action.id)) || actionBlocked(world, questId!, action) !== undefined) return undefined
  return perform(world, host, questId!, q, action)
}

/** A pattern read as words: optional parts left out, the first of each choice kept. */
export function plainWords(pattern: string): string {
  let text = pattern
  for (let i = 0; i < 5; i++) text = text.replace(/\(\?:[^()]*\)\?/g, '')
  for (let i = 0; i < 5; i++) text = text.replace(/\(\?:([^|()]*)(?:\|[^()]*)?\)/g, '$1')
  return text.replace(/ \?/g, ' ').replace(/\.\?|\.\*|\\s|\\b|[\\^$?]/g, '').replace(/\s+/g, ' ').trim()
}

/** Why an action cannot be done now: a text to say, '' to try other actions, undefined when it can. */
function actionBlocked(world: World, questId: string, action: QuestAction): string | undefined {
  const here = world.state.player.location
  const area = world.content.locations.get(here)?.area
  if (action.at.length && !action.at.includes(here) && !(area && action.at.includes(area))) return ''
  if (action.with && world.state.npcs[action.with]?.location !== here) return action.not_yet ?? ''
  if (!allHold(world, action.when, questId)) return action.not_yet ?? ''
  return undefined
}

/** Someone with a part in a quest died: the quest ends or changes (design: quests react to the world). */
export function questsOnDeath(world: World, host: QuestHost, npcId: string): Output[] {
  const out: Output[] = []
  for (const [quest] of active(world)) {
    const to = quest.on_death?.[npcId]
    if (to) route(world, host, quest.id, to, out)
    else if (quest.givers.includes(npcId) && quest.givers.every((g) => world.state.npcs[g]?.dead || !world.state.npcs[g])) {
      const q = questlog(world)[quest.id]!
      q.outcome = 'giver_dead'
      q.ended = world.now
      out.push({ kind: 'system', text: `${quest.name}: with ${callName(world.npc(npcId))} dead, it cannot go on as it was.` })
      outcomeFact(world, quest, 'giver_dead', 'the giver dead', `With ${callName(world.npc(npcId))} dead, nothing came of it.`)
    }
  }
  return out
}

/** The journal page of a quest: what it is about, the stages reached, and how it ended. */
export function questPage(world: World, questId: string): { name: string; lines: string[] } | undefined {
  const quest = world.content.quests.get(questId)
  const q = questlog(world)[questId]
  if (!quest || !q) return undefined
  // Only what the player has found out: the stages reached, never the summary (which gives the secret away).
  const lines: string[] = []
  for (const id of q.path) {
    const s = quest.stages?.find((x) => x.id === id)
    if (s) lines.push(`- ${s.text}`)
  }
  const clock = Object.values(world.state.clocks ?? {}).find((c) => (c as Clock).id.startsWith(questId) || (quest.stages ?? []).some((s) => s.on_enter.some((e) => 'clock' in e && e.clock.id === (c as Clock).id))) as Clock | undefined
  if (clock && !q.ended) lines.push(`${clock.name}: ${clock.filled}/${clock.size}.`)
  if (q.ended) {
    const o = quest.outcomes?.find((x) => x.id === q.outcome)
    lines.push(o ? `${o.name}. ${o.text}` : 'It is over.')
  }
  return { name: quest.name, lines }
}

/** Player conditions with a time on them wear off. */
export function expireConditions(world: World): void {
  const until = world.state.player.conditionsUntil ?? {}
  const c = world.state.player.character
  for (const [name, t] of Object.entries(until)) {
    if (world.now < t) continue
    delete until[name]
    if (c) delete c.conditions[name]
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
