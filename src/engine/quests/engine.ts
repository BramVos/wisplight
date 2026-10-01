import { knob } from '../knobs'
import { characterOf } from '../economy/ledger'
import { built } from '../growth/growth'
import { tensionOf } from '../social/realms'
import { GameClock, weekdayName } from '../clock'
import type { Output } from '../commands'
import { callName, type Deed, type Quest } from '../content'
import { applyEffect, attitude, type Attitude } from '../dialogue/relations'
import { add } from '../items'
import { die } from '../life'
import { farFromPlayer } from '../lod'
import { homeOf, livesWithParent } from '../layer'
import { believes, recordFact } from '../news'
import { tieTo } from '../people'
import { addClock, favour, gainXp, playerCheck, tickClock, type Clock } from '../rules/player'
import { blessed } from '../rules/blessings'
import { approve, companionOf } from '../social/companions'
import { repute } from '../social/factions'
import { mayLieAbout } from '../social/gates'
import type { World } from '../world'
import type { Condition, KnowsClaim, PlaceStateName, QuestAction, QuestEffect } from './schema'
import { saidHolds, talkedHolds } from '../said'
import { addEvidence, holdsEvidence, questEvidence } from '../dossier'

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
  /** The stages whose asks line the giver has said to open a talk (M10.33 E): once a stage. */
  asked?: string[]
  /** Who has spoken of the ending with the stranger since (M10.34 G): a thank-you once, not at every visit. */
  told?: string[]
}

/** What the quest engine needs from the engine: time, effect plans and encounters. */
export interface QuestHost {
  pass(minutes: number): Output[]
  plan?(id: string): void
  encounter?(id: string): Output[]
  /** The player read this (M9.4): the people and places it names go in the journal as heard of, from whoever said it. */
  heard?(text: string, from?: string): void
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
  if ('holds' in c) return holdsEvidence(world, c.holds)
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
  if ('around' in c) {
    const s = world.state.npcs[c.around]
    return Boolean(s && !s.dead && !s.absent && !s.following)
  }
  if ('carries' in c) return (world.state.npcs[c.carries]?.inventory[c.item] ?? 0) > 0
  if ('built' in c) return built(world, c.built)
  if ('idle' in c) return Object.values(world.state.economy?.ledgers ?? {}).some((l) => l.idle[c.idle] !== undefined)
  if ('tension' in c) return tensionOf(world, c.tension[0], c.tension[1]) >= c.at_least
  if ('character' in c) {
    const area = world.content.areas.has(c.character) ? c.character : world.content.locations.get(c.character)?.area
    return Boolean(area) && characterOf(world, area!).includes(c.is)
  }
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
  if ('weekday' in c) return weekdayName(world.now, world.calendar) === c.weekday
  if ('said' in c) return saidHolds(world, c)
  if ('talked' in c) return talkedHolds(world, c)
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
    return !belief || belief.doubt || !['flooded', 'destroyed', 'occupied'].includes(belief.value)
  }
  if ('tie' in c) return tieTo(world, c.tie[0], c.tie[1])?.role === c.role
  if ('would_lie' in c) return world.content.npcs.has(c.would_lie) && mayLieAbout(world, c.would_lie)
  if ('needs_from' in c) return needsFrom(world, c.needs_from[0], c.needs_from[1])
  if ('same' in c) return c.same[0] === c.same[1]
  if ('did' in c) return (world.state.news?.facts ?? []).some((f) => f.kind === c.did && f.about[0] === c.who && f.about.includes(c.to))
  if ('any' in c) return c.any.some((x) => holds(world, x, questId))
  if ('all' in c) return c.all.every((x) => holds(world, x, questId))
  if ('not' in c) return !holds(world, c.not, questId)
  return false
}

/** What someone believes about a claim: a value, anything but some values, how precise, how recent (M8.1). */
function knowsClaim(world: World, k: KnowsClaim): boolean {
  const belief = believes(world, k.who, k.subject, k.key)
  // Knowing is believing: what someone only doubts is not enough to act on (M8.2).
  if (!belief || (belief.doubt && !k.doubting)) return false
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

export function applyEffects(world: World, host: QuestHost, questId: string | undefined, effects: QuestEffect[], out: Output[], by?: QuestAction): void {
  for (const e of effects) {
    if ('set' in e) flags(world)[e.set] = e.value
    // Evidence the stranger now holds (M10.34 C), from whom and by which deed.
    else if ('evidence' in e) addEvidence(world, e, { ...(questId ? { quest: questId } : {}), ...(by ? { deed: (by.intent ?? plainWords(by.say[0] ?? '')).trim(), text: by.text, ...(by.with ? { with: by.with } : {}) } : {}) })
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
/** What the player sees when the place they stand in changes (M9.4). */
const HAPPENING: Record<PlaceStateName, string> = {
  normal: 'The place around you is itself again.',
  flooded: 'Water comes in, brown and cold. It spreads over the ground and rises round your feet.',
  damaged: 'Something gives with a crack, and the place around you is broken.',
  destroyed: 'Fire and ruin take the place around you.',
  abandoned: 'People hurry off with what they can carry, and the place empties around you.',
  occupied: 'Soldiers march in and take the place. They look you over.',
  drained: 'The water drains away around you, and leaves stinking mud.',
}

export function setPlaceState(world: World, host: QuestHost, location: string, state: PlaceStateName, out: Output[]): void {
  const places = (world.state.places ??= {})
  const was = places[location]?.state
  if (state === 'normal') delete places[location]
  else places[location] = { state, since: world.now }
  // It happens where the player stands (M9.4): they see it happen, not only find it so later.
  if (location === world.state.player.location && state !== (was ?? 'normal')) out.push({ kind: 'narration', text: HAPPENING[state] })
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

/**
 * The region a quest plays in (M10.30): the far place its first place lies in,
 * or the home region. Its first place: where it begins, where its first deed
 * is done, or the home of its first giver.
 */
export function questRegion(world: World, quest: Quest): string {
  return regionOfPlace(world, [...(quest.starts?.at ?? []), ...(quest.actions ?? []).flatMap((a) => a.at), ...quest.givers.map((g) => world.content.npcs.get(g)?.home ?? '')].find(Boolean))
}

/** The region a place or area lies in (M10.30): a far place grown in play, or the home region. */
export function regionOfPlace(world: World, place: string | undefined): string {
  const area = place ? (world.content.locations.get(place)?.area ?? (world.content.areas.has(place) ? place : undefined)) : undefined
  const far = area ? Object.values(world.state.growth?.far ?? {}).find((f) => String(f.area['id']) === area) : undefined
  return far?.topic ?? 'home'
}

/** The quests running in a region beside the main line (M10.30). */
export function activeIn(world: World, region: string): string[] {
  return Object.entries(questlog(world))
    .filter(([id, q]) => !q.ended && world.content.quests.get(id)?.kind !== 'main' && questRegion(world, world.content.quests.get(id)!) === region)
    .map(([id]) => id)
}

/**
 * Whether a quest may begin now (M10.30, Bram: not five at once): the main
 * line always, another only while fewer than the knob story.quests_active run
 * in its region. One that would not wake again by itself (begun by another
 * quest, or at the start) waits its turn.
 */
function mayStart(world: World, quest: Quest): boolean {
  if (quest.kind === 'main' || activeIn(world, questRegion(world, quest)).length < knob(world, 'story.quests_active')) return true
  const s = quest.starts
  const wakesAgain = Boolean(s && (s.talk.length || s.at.length || s.when.length) && !s.at_start)
  const waiting = (world.state.questsWaiting ??= [])
  if (!wakesAgain && !waiting.includes(quest.id)) waiting.push(quest.id)
  return false
}

/** Begins a quest; `force` (the build command @quest) past the region's limit. */
export function startQuest(world: World, host: QuestHost, questId: string, force = false): Output[] {
  const quest = world.content.quests.get(questId)
  const log = questlog(world)
  if (!quest || log[questId] || !quest.stages?.length) return []
  if (!force && !mayStart(world, quest)) return []
  if (world.state.questsWaiting) world.state.questsWaiting = world.state.questsWaiting.filter((id) => id !== questId)
  const first = quest.stages[0]!
  log[questId] = { stage: first.id, started: world.now, stageAt: world.now, path: [first.id], done: [] }
  const out: Output[] = []
  const told = Boolean(quest.ask && quest.givers[0] && world.state.npcs[quest.givers[0]]?.location === world.state.player.location)
  if (told) out.push({ kind: 'speech', text: `${callName(world.npc(quest.givers[0]!))}: ${quest.ask}` })
  out.push({ kind: 'system', text: `New quest: ${quest.name}. ${first.text}` })
  // Who and where the quest names, the player now has heard of (found in the M9.4 playtest: "Lubbert in Waagdam").
  host.heard?.(`${told ? quest.ask : ''} ${first.text}`, told ? quest.givers[0] : undefined)
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
  // What to do now changes with it, in view (M10.33 AA).
  if (stage.goal?.trim()) out.push({ kind: 'system', text: `Now: ${stage.goal.trim()}` })
  host.heard?.(stage.text)
  applyEffects(world, host, questId, stage.on_enter ?? [], out)
}


export function endQuest(world: World, host: QuestHost, questId: string, outcomeId: string, out: Output[]): void {
  const quest = world.content.quests.get(questId)!
  const q = questlog(world)[questId]
  if (!q || q.ended) return
  const outcome = quest.outcomes?.find((o) => o.id === outcomeId)
  q.outcome = outcomeId
  q.ended = world.now
  out.push({ kind: 'system', text: `${quest.name}: ${outcome ? `${outcome.name}. ${outcome.text}` : 'It is over.'}` })
  // Experience for every solution, not only the violent ones (FO, chapter 14, "Beloningen").
  if (outcome?.solution) gainXp(world, knob(world, 'rules.quest_xp')[quest.kind] ?? 150, quest.name)
  // Every outcome is a fact the world can hear of (M8.1), unless it has one of its own.
  if (!outcome?.effects.some((e) => 'fact' in e)) outcomeFact(world, quest, outcomeId, outcome?.name, outcome?.text, outcome ? { news: outcome.news, byDeed: deedEnding(quest, q, outcome.when) } : undefined)
  if (outcome) applyEffects(world, host, questId, outcome.effects, out)
}

/** The fact of a quest's outcome: where the giver is, about the people with a part, with a claim for the watchers. */
function outcomeFact(world: World, quest: Quest, outcomeId: string, name: string | undefined, text: string | undefined, how?: { news?: { precise: string; village?: string; far?: string }; byDeed: boolean }): void {
  // Where it happened (M10.34 G): where the stranger did the deed that ended it, with whoever stood there as witnesses;
  // an ending that came by itself (the days ran out) where the giver is. Nobody else knows it until the news reaches them.
  const giver = quest.givers.find((g) => world.state.npcs[g] && !world.state.npcs[g]!.note) ?? quest.givers[0]
  const theirs = giver && world.state.npcs[giver] && !world.state.npcs[giver]!.dead ? world.state.npcs[giver]!.location : world.state.player.location
  const at = how?.byDeed ? world.state.player.location : theirs
  const place = world.content.locations.has(at) ? at : world.state.player.location
  const people = [...new Set([...quest.givers, ...quest.helpers, ...quest.opponents])].filter((id) => world.content.npcs.has(id))
  // As people tell it: the ending's news, or its text when it is not said to the stranger, or only its name.
  const plain = text && !/\byou(?:r|rs|rself)?\b/i.test(text) ? text : undefined
  const precise = how?.news?.precise ?? plain ?? `${quest.name} came to an end: ${(name ?? 'it is over').toLowerCase()}.`
  recordFact(world, {
    kind: `quest:${quest.id}`,
    about: people,
    place,
    belang: quest.kind === 'main' ? 3 : 2,
    title: `${quest.name}: ${name ?? 'the end of it'}`,
    text: { precise, village: how?.news?.village ?? precise, far: how?.news?.far ?? `Something came of it in ${world.content.areas.get(world.location(place).area)?.name ?? world.words.region}, they say.` },
    claim: { subject: quest.id, key: 'outcome', value: outcomeId },
  })
}

/** Whether an ending came by the stranger's deed (a flag a done deed set), not by itself. */
function deedEnding(quest: Quest, q: QuestState, when: Condition[]): boolean {
  const flags = new Set(when.flatMap((c) => ('flag' in c ? [c.flag] : 'any' in c ? c.any.flatMap((x) => ('flag' in x ? [x.flag] : [])) : [])))
  return (quest.actions ?? []).some((a) => q.done.includes(a.id) && a.effects.some((e) => 'set' in e && flags.has(e.set)))
}

/** Stages move on and endings are reached when their conditions hold; loops until nothing changes. */
export function evaluate(world: World, host: QuestHost): Output[] {
  const out: Output[] = []
  lapseQuests(world, host, out)
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
      if (questlog(world)[quest.id] || !quest.stages?.length || flags(world)[`lapsed:${quest.id}`] !== undefined) continue
      const s = quest.starts
      // A quest with a person or a place to begin at waits for them; the conditions are its gate.
      if (s && s.when.length && !s.talk.length && !s.at.length && !s.at_start && allHold(world, s.when)) {
        out.push(...startQuest(world, host, quest.id))
        if (questlog(world)[quest.id]) changed = true
      }
    }
    // A quest that waited for a place in its region (M10.30), the oldest first, once one has ended.
    for (const id of [...(world.state.questsWaiting ?? [])]) {
      out.push(...startQuest(world, host, id))
      if (questlog(world)[id]) changed = true
    }
    if (!changed) break
  }
  return out
}

/**
 * Quests that settle themselves without the player (M10.6, the missing girl):
 * so many days after they began, or after the game began for a quest the
 * player never took up, and only while the player is far from its people and
 * places. The effects of the content, and the quest is over: lapsed. A quest
 * near the player waits for them.
 */
function lapseQuests(world: World, host: QuestHost, out: Output[]): void {
  const f = flags(world)
  for (const quest of [...world.content.quests.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const lapses = quest.lapses
    if (!lapses || f[`lapsed:${quest.id}`] !== undefined) continue
    const q = questlog(world)[quest.id]
    if (q?.ended) continue
    if (world.now - (q?.started ?? startMinute(world)) < lapses.after_days * DAY) continue
    if (lapses.when_far && !farFromQuest(world, quest)) continue
    f[`lapsed:${quest.id}`] = world.now
    if (q) {
      q.outcome = 'lapsed'
      q.ended = world.now
      out.push({ kind: 'system', text: `${quest.name}: ${lapses.text ?? 'It was settled without you.'}` })
    }
    applyEffects(world, host, quest.id, lapses.effects, out)
  }
}

/** Whether the player is far from everything a quest is about: where it begins, and the homes and whereabouts of its givers. */
function farFromQuest(world: World, quest: Quest): boolean {
  const places = new Set<string>()
  for (const at of quest.starts?.at ?? []) {
    if (world.content.locations.has(at)) places.add(at)
    else for (const l of world.content.locations.values()) if (l.area === at) places.add(l.id)
  }
  for (const id of quest.givers) {
    const s = world.state.npcs[id]
    if (!s || s.dead) continue
    places.add(world.npc(id).home)
    if (world.content.locations.has(s.location)) places.add(s.location)
  }
  return [...places].every((place) => farFromPlayer(world, place))
}

/** The quests that would begin now by talking to this person (M10.8: the engine decides when in the talk). */
export function talkStarts(world: World, npcId: string): Quest[] {
  return [...world.content.quests.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((q) => !questlog(world)[q.id] && q.stages?.length && q.starts?.talk.includes(npcId) && flags(world)[`lapsed:${q.id}`] === undefined && (!q.starts.when.length || allHold(world, q.starts.when)))
}

/**
 * Quests that begin with the game but a game does not have (M10.30, stories
 * with hindsight): written after the game began. Loading its save begins them;
 * a stage whose conditions the game already meets passes at the next turn.
 */
export function unbegun(world: World): string[] {
  return [...world.content.quests.values()]
    .filter((q) => q.starts?.at_start && q.stages?.length && !questlog(world)[q.id] && flags(world)[`lapsed:${q.id}`] === undefined && (!q.starts.when.length || allHold(world, q.starts.when)))
    .map((q) => q.id)
    .sort()
}

/** Quests that begin when the player talks to someone, or comes somewhere. */
export function triggers(world: World, host: QuestHost, on: { talk?: string; at?: string; newGame?: boolean }): Output[] {
  const out: Output[] = []
  for (const quest of [...world.content.quests.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (questlog(world)[quest.id] || !quest.stages?.length || !quest.starts || flags(world)[`lapsed:${quest.id}`] !== undefined) continue
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
  const typed = input.trim().toLowerCase().replace(/[.!]+$/, '')
  // The Now line as it stands (M10.33 AE): "copy the original recordings in the Orison Listening Room" is the deed, the
  // place after it the place where you stand.
  const here = world.content.locations.get(world.state.player.location)
  const names = here ? [here.name, ...here.aliases].map((n) => n.toLowerCase().replace(/^the\s+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : []
  const text = names.length ? typed.replace(new RegExp(`\\s+(?:at|in|on|aboard|inside|by|up at|down at)\\s+(?:the\\s+)?(?:${names.join('|')})$`), '') : typed
  // The one it is meant for is elsewhere (found in the M9.4 playtest: "give rye to mirte" in her empty bakery said you had no rye).
  let away: string | undefined
  for (const [quest, q] of active(world)) {
    for (const action of quest.actions ?? []) {
      if (action.once && q.done.includes(action.id)) continue
      // The line as typed, or without the place where you stand after it (SPY ON THE CAMP names the camp as its thing).
      if (!action.say.some((p) => new RegExp(`^(?:${p})$`, 'i').test(typed) || new RegExp(`^(?:${p})$`, 'i').test(text))) continue
      const refusal = actionBlocked(world, quest.id, action)
      if (refusal !== undefined) {
        if (refusal) return [{ kind: 'narration', text: refusal }]
        if (action.with && world.state.npcs[action.with]?.location !== world.state.player.location) away ??= `${callName(world.npc(action.with))} isn't here.`
        continue
      }
      return perform(world, host, quest.id, q, action)
    }
  }
  return away ? [{ kind: 'narration', text: away }] : undefined
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
    // A deed shows as a deed (M10.33 AA): what you did, and where the story stands, before what it brings.
    out.push({ kind: 'system', text: deedLine(world, questId, q, action) })
    out.push({ kind: 'narration', text: action.text })
    applyEffects(world, host, questId, action.effects, out, action)
  } else {
    out.push({ kind: 'narration', text: action.fail_text ?? 'It does not work.' })
    applyEffects(world, host, questId, action.fail, out)
  }
  if (action.minutes) out.push(...host.pass(action.minutes))
  out.push(...evaluate(world, host))
  return out
}

/**
 * A deed on a thing of the world (M10.30, Bram: saw down a tree, press a
 * stone): what must hold, a check, what it does and its line, as a quest's
 * action; once under its key unless it says otherwise. Time passes, and the
 * quests look again at what changed.
 */
export function doDeed(world: World, host: QuestHost, key: string, deed: Deed): Output[] {
  const done = `deed:${key}`
  if (deed.once && flags(world)[done] !== undefined) return [{ kind: 'text', text: deed.done ?? 'That is done already.' }]
  if (!allHold(world, deed.when)) return [{ kind: 'text', text: deed.not_yet ?? 'Not like this: something is missing.' }]
  const out: Output[] = []
  let success = true
  if (deed.check) {
    const result = playerCheck(world, deed.check.skill, deed.check.dc)
    out.push({ kind: 'check', text: `(${cap(deed.check.skill)} ${result.total} vs DC ${deed.check.dc}: ${result.degree})` })
    success = result.degree === 'success' || result.degree === 'critical success'
  }
  if (success) {
    if (deed.once) flags(world)[done] = true
    out.push({ kind: 'narration', text: deed.text })
    applyEffects(world, host, undefined, deed.effects, out)
  } else out.push({ kind: 'narration', text: deed.fail_text ?? 'It does not work. You may try again.' })
  if (deed.minutes) out.push(...host.pass(deed.minutes))
  out.push(...evaluate(world, host))
  return out
}

/**
 * The quest actions that can be done here and now with someone (M7.2): the
 * voice gets them, so that free speech in a conversation can mean one of
 * them, even in other words than the fixed phrases. Only a deed with this
 * person (M10.33 AA: the voice chose "copy the recordings" and "trace the
 * fault" for the player in a talk with Niko); a deed on the world is the
 * player's own verb.
 */
export function conversationActions(world: World, npcId: string): { key: string; intent: string }[] {
  const list: { key: string; intent: string }[] = []
  for (const [quest, q] of active(world)) {
    for (const action of quest.actions ?? []) {
      if (action.once && q.done.includes(action.id)) continue
      if (action.with !== npcId) continue
      if (actionBlocked(world, quest.id, action) !== undefined) continue
      list.push({ key: `${quest.id}:${action.id}`, intent: action.intent ?? plainWords(action.say[0]!) })
    }
  }
  return list.slice(0, 12)
}

/** "You copy the original recordings. (The Orison Recordings, 2 of 5)": the deed in plain words, and the stage. */
function deedLine(world: World, questId: string, q: QuestState, action: QuestAction): string {
  const quest = world.content.quests.get(questId)!
  const stages = quest.stages ?? []
  const at = Math.max(0, stages.findIndex((s) => s.id === q.stage)) + 1
  let words = (action.intent ?? plainWords(action.say[0] ?? '')).trim().replace(/[.!]+$/, '')
  // The people it names by their names as written (intents are lower case: "ask niko about the station").
  for (const npc of world.content.npcs.values()) {
    const call = callName(npc)
    words = words.replace(new RegExp(`\\b${call.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), call)
  }
  return `You ${words}. (${quest.name}, ${at} of ${stages.length})`
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
  // Optional parts out, then the first of each choice, in turns until nothing changes (M10.33 D: a choice inside an
  // optional part, "(?:(?:the|a|an) )?", left "the" behind).
  for (let i = 0, before = ''; i < 10 && before !== text; i++) {
    before = text
    text = text.replace(/\(\?:[^()]*\)\?/g, '')
    text = text.replace(/\(\?:([^|()]*)(?:\|[^()]*)?\)(?!\?)/g, '$1')
  }
  // A class of letters is its first ("apologi[sz]e": apologise; M10.34 B found "APOLOGI[SZ]E" on the quest page).
  return text.replace(/\[\^?([^\]\\])[^\]]*\]/g, '$1').replace(/ \?/g, ' ').replace(/\.\?|\.\*|\\s|\\b|[\\^$?]/g, '').replace(/\s+/g, ' ').trim()
}

/** Why an action cannot be done now: a text to say, '' to try other actions, undefined when it can. */
function actionBlocked(world: World, questId: string, action: QuestAction): string | undefined {
  const here = world.state.player.location
  const area = world.content.locations.get(here)?.area
  if (action.at.length && !action.at.includes(here) && !(area && action.at.includes(area))) return ''
  if (action.with && world.state.npcs[action.with]?.location !== here) return ''
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
  // Only what the player has found out: the stages reached, never the summary (which gives the secret away). Since
  // M10.33 AF (Bram: "ik begrijp nog steeds niet het hele verhaal") in three parts: the story so far, with what each
  // deed brought after the stage it closed; what to do now; and what could be done, the ways it may end among them.
  const lines: string[] = ['So far:']
  const actions = quest.actions ?? []
  const sets = (a: QuestAction) => a.effects.flatMap((e) => ('set' in e ? [e.set] : []))
  const told = new Set<string>()
  for (const id of q.path) {
    const s = quest.stages?.find((x) => x.id === id)
    if (!s) continue
    lines.push(`- ${s.text}`)
    const closes = new Set(s.next.flatMap((n) => n.when.flatMap((c) => ('flag' in c ? [c.flag] : []))))
    for (const a of actions.filter((x) => q.done.includes(x.id) && !told.has(x.id) && sets(x).some((f) => closes.has(f)))) {
      told.add(a.id)
      lines.push(`  ${a.text.trim()}`)
    }
  }
  for (const a of actions.filter((x) => q.done.includes(x.id) && !told.has(x.id))) lines.push(`  ${a.text.trim()}`)
  // What the stranger can do now (M10.30), while it is open.
  const goal = q.ended ? undefined : quest.stages?.find((s) => s.id === q.stage)?.goal
  // What the story gave the stranger to hold (M10.34 C).
  const held = questEvidence(world, questId)
  if (held) lines.push(held)
  if (goal) lines.push(`Now: ${goal}`)
  if (!q.ended) {
    // Who gave it and where its next deed is (M10.33 C), each a link to its page: the page says the way.
    const givers = quest.givers.filter((g) => world.content.npcs.has(g) && world.state.npcs[g] && !world.state.npcs[g]!.dead).map((g) => `[${world.knowsName(g) ? world.npc(g).name : world.seenName(g)}]`)
    const now = lines.findIndex((l) => l.startsWith('Now: '))
    if (givers.length) lines.splice(now >= 0 ? now : lines.length, 0, `Given by ${givers.join(' and ')}.`)
    const open = (quest.actions ?? []).filter((a) => !(a.once && q.done.includes(a.id)) && allHold(world, a.when, quest.id))
    // Only places the stranger knows of: a secret one (the Cable Gallery) is found, not read here (M10.33 AA).
    const known = world.state.player.journal ?? {}
    const places = [...new Set(open.flatMap((a) => a.at))].filter((p) => known[p] !== undefined)
    const named = places.flatMap((p) => (world.content.locations.get(p)?.name ? [`[${world.content.locations.get(p)!.name}]`] : []))
    if (named.length) lines.push(`Where: ${named.join(', ')}.`)
    // A deed with someone is done where they are (M10.33 AA): with whom.
    const people = [...new Set(open.filter((a) => a.with && !a.at.length).map((a) => a.with!))].filter((n) => world.content.npcs.has(n))
    if (people.length) lines.push(`With: ${people.map((n) => `[${world.knowsName(n) ? world.npc(n).name : world.seenName(n)}]`).join(', ')}.`)
    // What could be done, as the player types it; the ways it may end in the player's own words, never their outcome.
    const ending = new Set((quest.outcomes ?? []).flatMap((o) => o.when.flatMap((c) => ('flag' in c ? [c.flag] : []))))
    const typed = (a: QuestAction) => `- ${plainWords(a.say[0] ?? a.intent ?? '').toUpperCase()}`
    const ways = open.filter((a) => !sets(a).some((f) => ending.has(f)))
    const ends = open.filter((a) => sets(a).some((f) => ending.has(f)))
    if (ways.length) lines.push('You could:', ...ways.map(typed))
    if (ends.length) lines.push('Ways it could end:', ...ends.map(typed))
  }
  const clock = Object.values(world.state.clocks ?? {}).find((c) => (c as Clock).id.startsWith(questId) || (quest.stages ?? []).some((s) => s.on_enter.some((e) => 'clock' in e && e.clock.id === (c as Clock).id))) as Clock | undefined
  if (clock && !q.ended) lines.push(`${clock.name}: ${clock.filled}/${clock.size}.`)
  if (q.ended) {
    const o = quest.outcomes?.find((x) => x.id === q.outcome)
    lines.push(o ? `${o.name}. ${o.text}` : q.outcome === 'lapsed' ? `Settled without you. ${quest.lapses?.text ?? ''}`.trim() : 'It is over.')
  }
  return { name: quest.name, lines }
}

/** QUESTS (M10.30): each quest taken up with where it stands and what to do now, the open ones first. */
export function questLines(world: World): { open: string[]; over: string[] } {
  const open: string[] = []
  const over: string[] = []
  for (const [id, q] of Object.entries(questlog(world)).sort((a, b) => a[1].started - b[1].started)) {
    const quest = world.content.quests.get(id)
    if (!quest) continue
    if (q.ended) {
      const o = quest.outcomes?.find((x) => x.id === q.outcome)
      over.push(`  ${quest.name}: ${o?.name ?? (q.outcome === 'lapsed' ? 'settled without you' : 'over')}.`)
      continue
    }
    const stage = quest.stages?.find((s) => s.id === q.stage)
    // What could be done now, as typed (M10.33 AF): the page of the quest has the whole of it.
    const could = (quest.actions ?? []).filter((a) => !(a.once && q.done.includes(a.id)) && allHold(world, a.when, id)).map((a) => plainWords(a.say[0] ?? a.intent ?? '').toUpperCase())
    open.push(`  ${quest.name}: ${stage?.text.trim() ?? ''}${stage?.goal ? ` Now: ${stage.goal}` : ''}${could.length ? ` You could: ${could.slice(0, 4).join('; ')}.` : ''}`)
  }
  return { open, over }
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

/**
 * Whether someone's work takes in what a place makes (M10.3): the objects of
 * their workplace consume what the objects there produce. The baker's oven
 * takes flour, and the mill makes it.
 */
export function needsFrom(world: World, who: string, place: string): boolean {
  if (!world.content.npcs.has(who) || !world.content.locations.has(place)) return false
  const npc = world.npc(who)
  if (npc.work === place) return false
  const made = new Set(world.location(place).objects.flatMap((o) => (world.content.objectTypes.get(o.type)?.affordances ?? []).flatMap((a) => Object.keys(a.produces ?? {}))))
  // Their objects: at their work and home, and any they keep (the baker's oven out in the yard).
  const mine = [...world.content.locations.values()].flatMap((l) => l.objects.filter((o) => o.provider === who || o.owner === who || l.id === npc.work || l.id === npc.home))
  const taken = mine.flatMap((o) => (world.content.objectTypes.get(o.type)?.affordances ?? []).flatMap((a) => Object.keys(a.consumes ?? {})))
  return taken.some((item) => made.has(item))
}
