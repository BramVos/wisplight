import { relation } from './dialogue/relations'
import { planOf } from './quests/plans'
import type { Condition } from './quests/schema'
import { queueSignal, watchBelief } from './signals'
import type { Fact, Heard } from './state'
import type { World } from './world'

// Belief (M8.2; design: signalen en nasleep, "Vreemden, geloof en vergeten").
// Whoever hears a claim believes it, doubts it or rejects it, by rules: how
// far they trust who told them, how well they know them, whether others say
// the same, whether it fits what they already know, and how open their place
// is to strangers. Doubt with much at stake is a signal: ask around first.
// A stranger who is not believed may be chased off, but only by someone the
// gates let through (temper, little warmth); that it is one in a village
// follows from the numbers.

export type Stance = 'believes' | 'doubts' | 'rejects'

const AREA_OPENNESS: Record<string, number> = { town: 0.8, inn: 0.7, village: 0.5, route: 0.5, hamlet: 0.3, wilderness: 0.2 }

/**
 * How open a place is to strangers, 0 to 1: its rank (a town is open, a
 * hamlet not), its traffic (a market, a quay, an inn), and the need of the
 * moment (war or a flood near, scarce goods).
 */
export function openness(world: World, location: string): number {
  const loc = world.content.locations.get(location)
  const area = loc ? world.content.areas.get(loc.area) : undefined
  let value = AREA_OPENNESS[area?.kind ?? 'village'] ?? 0.5
  const places = [...world.content.locations.values()].filter((l) => l.area === loc?.area)
  if (places.some((l) => l.services.length > 0 && l.tags.includes('social'))) value += 0.1
  if (places.some((l) => world.state.places?.[l.id] && world.state.places[l.id]!.state !== 'normal')) value -= 0.15
  if (Object.values(world.state.market ?? {}).some((f) => f < 0.8)) value -= 0.1
  if (Object.values(world.state.tension ?? {}).some((t) => t >= 80)) value -= 0.1
  return Math.max(0, Math.min(1, value))
}

/** The trust someone starts with in a stranger, and the fear (design: "Hoe open een plek is"). */
export function strangerStart(world: World, npcId: string, place: string): { trust: number; fear: number } {
  const npc = world.npc(npcId)
  const open = openness(world, place)
  const superstitious = npc.quirks.includes('superstitious') ? 10 : 0
  return {
    trust: Math.round(open * 60 - 20 + npc.personality.warmth * 8 + npc.personality.curiosity * 3 - superstitious),
    fear: Math.max(0, Math.round((1 - open) * 30 - npc.personality.courage * 5 + superstitious)),
  }
}

/** Traders and boatmen know places: their word counts for more about a place or a realm. */
export function isTrader(world: World, npcId: string): boolean {
  if (!world.content.npcs.has(npcId)) return false
  const trade = world.npc(npcId).profession
  return world.content.world.knowledge?.modifiers.some((m) => m.profession?.includes(trade) && (m.kinds?.includes('place') || m.kinds?.includes('area')) && m.fame > 0) ?? false
}

/** How far someone trusts the one they heard it from. */
export function trustIn(world: World, listener: string, from: string): number {
  if (from === 'witness') return 100
  if (from === 'news') return 25
  if (from === 'board') return 30
  if (from === 'player') return relation(world.state, listener).trust
  if (!world.content.npcs.has(from) || !world.content.npcs.has(listener)) return 20
  const bond = world.state.bonds?.[listener]?.[from]
  if (bond) return bond.trust
  // Someone of the same village is a neighbour; anyone else a stranger, as open as the place is.
  const home = (id: string) => world.content.locations.get(world.npc(id).home)?.area
  if (home(listener) === home(from)) return 20
  return strangerStart(world, listener, world.state.npcs[listener]?.location ?? world.npc(listener).home).trust
}

/**
 * Whether someone believes a fact with a claim they just heard: the rules,
 * with a seeded roll. Witnesses believe what they saw.
 */
export function judge(world: World, listener: string, fact: Fact, heard: Heard, bonus = 0): Stance {
  const claim = fact.claim
  if (!claim || heard.from === 'witness' || listener === 'player') return 'believes'
  let score = trustIn(world, listener, heard.from) + bonus
  // Big news going round is hard to doubt: everyone is saying it.
  if (heard.from === 'news') score += fact.belang * 5
  if (isTrader(world, heard.from) && (claim.key === 'state' || claim.key === 'stance')) score += 15
  const value = heard.level === 1 && claim.far !== undefined ? claim.far : claim.value
  const store = world.state.news!
  const mine = store.heard[listener] ?? {}
  let same = 0
  let other: { value: string; witness: boolean } | undefined
  for (const f of store.facts) {
    const h = mine[f.id]
    if (!h || f.id === fact.id || !f.claim || f.claim.subject !== claim.subject || f.claim.key !== claim.key || h.stance === 'rejects') continue
    const v = h.level === 1 && f.claim.far !== undefined ? f.claim.far : f.claim.value
    if (v === value && h.from !== heard.from) same++
    else if (v !== value) other = { value: v, witness: h.from === 'witness' || Boolean(other?.witness) }
  }
  score += Math.min(30, same * 15)
  if (other) score -= other.witness ? 40 : 10
  if (heard.level === 1) score -= 10
  score += Math.round((world.rng.next('belief') - 0.5) * 40)
  return score >= 35 ? 'believes' : score >= 5 ? 'doubts' : 'rejects'
}

/**
 * Hearing a claim: the stance goes with what was heard, a belief is watched
 * for, doubt with something at stake is a signal, and a stranger who is not
 * believed may be unwelcome.
 */
export function heardClaim(world: World, listener: string, fact: Fact, heard: Heard, bonus = 0): void {
  if (!fact.claim || !world.content.npcs.has(listener)) return
  const stance = judge(world, listener, fact, heard, bonus)
  if (stance === 'believes') delete heard.stance
  else heard.stance = stance
  const teller = heard.from
  if (stance === 'believes') watchBelief(world, listener, fact, teller)
  else if (stance === 'doubts' && atStake(world, listener, fact.claim.subject, fact.claim.key)) {
    queueSignal(world, { kind: 'doubt', who: [listener, ...(world.content.npcs.has(teller) ? [teller] : [])], place: world.state.npcs[listener]!.location, cause: [fact.id], belang: 1, claim: fact.claim, watcher: 'rules' })
  }
  if (stance !== 'believes' && world.content.npcs.has(teller) && isStranger(world, listener, teller) && mayChaseAway(world, listener, teller)) {
    queueSignal(world, { kind: 'stranger_unwelcome', who: [listener, teller], place: world.state.npcs[listener]!.location, cause: [fact.id], belang: 2, watcher: 'rules' })
  }
}

/** Someone from elsewhere, whom this NPC has no bond with. */
export function isStranger(world: World, npcId: string, other: string): boolean {
  if (world.state.bonds?.[npcId]?.[other]) return false
  const home = (id: string) => world.content.locations.get(world.npc(id).home)?.area
  return home(npcId) !== home(other)
}

/**
 * Chasing someone off is no choice of the AI (design): only who has little
 * warmth, some temper and no trust in the other gets through, never a child.
 */
export function mayChaseAway(world: World, npcId: string, other: string): boolean {
  const npc = world.npc(npcId)
  if (npc.child || npc.quirks.includes('spirit') || world.npc(other).child) return false
  const p = npc.personality
  return p.warmth <= -1 && p.temper >= 1 && p.courage >= 0 && trustIn(world, npcId, other) <= 10
}

/** Something hangs on this claim for this person: their home, or a step of a plan waiting to know it. */
export function atStake(world: World, npcId: string, subject: string, key: string): boolean {
  if (key === 'state' && subject === world.npc(npcId).home) return true
  for (const p of world.state.plans ?? []) {
    if (p.ended !== undefined) continue
    const plan = planOf(world, p.plan)
    if (!plan) continue
    for (const step of plan.steps) {
      const st = p.steps?.[step.id]
      if (st?.done !== undefined || st?.skipped !== undefined) continue
      const mine = step.each ? (p.groups[step.each] ?? []).includes(npcId) && st?.members?.[npcId] === undefined : (p.subjects ?? []).includes(npcId)
      if (step.when.some((c) => mentions(c, subject, key, mine ? undefined : npcId))) return true
    }
  }
  return false
}

/** A condition on knowing this claim; with who, only when it names them (a plan waiting for someone to know). */
function mentions(c: Condition, subject: string, key: string, who?: string): boolean {
  if ('knows' in c && typeof c.knows !== 'string') return c.knows.subject === subject && c.knows.key === key && (who === undefined || c.knows.who === who)
  if ('any' in c) return c.any.some((x) => mentions(x, subject, key, who))
  if ('all' in c) return c.all.some((x) => mentions(x, subject, key, who))
  if ('not' in c) return mentions(c.not, subject, key, who)
  return false
}

/**
 * Asking around (design: "Navragen"): a trader or traveller is asked what is
 * true of a claim. Traders know more about places, so their answer is the
 * truth four times in five; otherwise what they believe. What the asker
 * heard that says otherwise, they now reject; what agrees, they believe.
 * Returns the answer, or undefined when the trader could not say.
 */
export function askTrader(world: World, asker: string, trader: string, subject: string, key: string): string | undefined {
  const store = world.state.news
  if (!store) return undefined
  const facts = store.facts.filter((f) => f.claim?.subject === subject && f.claim.key === key)
  const truth = [...facts].reverse().find((f) => f.truth !== false)
  const theirs = [...facts].reverse().find((f) => store.heard[trader]?.[f.id] && store.heard[trader]![f.id]!.stance !== 'rejects')
  const told = truth && world.rng.next('belief') < 0.8 ? truth : (theirs ?? truth)
  if (!told) return undefined
  const answer = told.claim!.value
  const mine = (store.heard[asker] ??= {})
  for (const f of facts) {
    const h = mine[f.id]
    if (!h) continue
    const v = h.level === 1 && f.claim!.far !== undefined ? f.claim!.far : f.claim!.value
    if (v === answer) delete h.stance
    else h.stance = 'rejects'
  }
  mine[told.id] ??= { level: 2, reliability: 0.9, from: trader, t: world.now }
  delete mine[told.id]!.stance
  return answer
}

/**
 * A warning that comes true (M8.3; design: "Een wedloop die niemand plant"):
 * a true fact says what someone rejected or doubted before. They believe it
 * now, and it is a signal about them and whoever told them, once.
 */
export function provenWarnings(world: World, fact: Fact): void {
  const claim = fact.claim
  const store = world.state.news
  if (!claim || fact.truth === false || !store) return
  for (const [who, heard] of Object.entries(store.heard).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (who === 'player' || !world.content.npcs.has(who)) continue
    for (const [id, h] of Object.entries(heard)) {
      if (!h.stance || id === fact.id) continue
      const said = store.facts.find((f) => f.id === id)
      if (!said?.claim || said.t > fact.t || said.claim.subject !== claim.subject || said.claim.key !== claim.key || said.claim.value !== claim.value) continue
      delete h.stance
      queueSignal(world, { kind: 'warning_proven', who: [who, ...(world.content.npcs.has(h.from) ? [h.from] : [])], place: world.state.npcs[who]?.location ?? fact.place, cause: [fact.id, id], belang: 2, claim, watcher: 'rules' })
    }
  }
}
