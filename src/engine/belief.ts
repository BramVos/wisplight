import { foodGoods, opennessOf } from './economy/ledger'
import { checkedClaims } from './claims'
import { relation } from './dialogue/relations'
import { factById } from './news'
import { planOf } from './quests/plans'
import type { Condition } from './quests/schema'
import { queueSignal, watchBelief } from './signals'
import type { Claim, Fact, Heard } from './state'
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

const AREA_OPENNESS: Record<string, number> = { city: 0.9, town: 0.8, inn: 0.7, village: 0.5, route: 0.5, hamlet: 0.3, wilderness: 0.2 }

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
  // Food short, by a plan or in the settlement's own ledger (M8.4): people look harder at a stranger.
  const ledger = loc ? world.state.economy?.ledgers[loc.area] : undefined
  const hungry = Object.entries(ledger?.short ?? {}).some(([item, days]) => days > 0 && foodGoods(world).has(item))
  if (hungry || Object.values(world.state.market ?? {}).some((f) => f < 0.8)) value -= 0.1
  // Its character (M8.4): a trading town is more open, a peat village a little less.
  if (loc) value += opennessOf(world, loc.area)
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
  const teller = heard.from
  settleStance(world, listener, fact, heard, stance)
  if (stance !== 'believes' && world.content.npcs.has(teller) && isStranger(world, listener, teller) && mayChaseAway(world, listener, teller)) {
    queueSignal(world, { kind: 'stranger_unwelcome', who: [listener, teller], place: world.state.npcs[listener]!.location, cause: [fact.id], belang: 2, watcher: 'rules' })
  }
}

/** The stance goes with what was heard: a belief is watched for, and doubt with something at stake is a signal. */
function settleStance(world: World, listener: string, fact: Fact, heard: Heard, stance: Stance): void {
  const teller = heard.from
  if (stance === 'believes') delete heard.stance
  else heard.stance = stance
  if (stance === 'believes') watchBelief(world, listener, fact, teller)
  else if (stance === 'doubts' && atStake(world, listener, fact.claim!.subject, fact.claim!.key)) {
    queueSignal(world, { kind: 'doubt', who: [listener, ...(world.content.npcs.has(teller) ? [teller] : [])], place: world.state.npcs[listener]!.location, cause: [fact.id], belang: 1, claim: fact.claim, watcher: 'rules' })
  }
}

/** Someone who comes to tell you to your face is heard out (M8.2, a report carried). */
export const IN_PERSON = 25
/** What an eyewitness adds to their word, told in person (M10.6): "I saw it with my own eyes." */
export const SAW_IT = 20
/** What someone adds who stands by a claim: beside the teller, or with their word given to say so (M10.6). */
export const BACKED = 15

const RANK: Record<Stance, number> = { rejects: 0, doubts: 1, believes: 2 }

/**
 * Thinking again (M10.6, the dyke at Oude Zijl): someone who doubted or
 * rejected a claim hears it once more from a word that weighs more: an
 * eyewitness in person, a persuasion that worked, or with others standing by
 * it. The rules judge again, with that teller and weight; a better stance
 * counts, a worse one does not. Once for each such word (as), so asking again
 * and again is no way round it.
 */
export function reconsider(world: World, listener: string, fact: Fact, from: string, bonus: number, as = from): Stance | undefined {
  const h = world.state.news?.heard[listener]?.[fact.id]
  if (!h || !fact.claim || !world.content.npcs.has(listener)) return undefined
  if (!h.stance) return 'believes'
  if (h.weighed?.includes(as)) return h.stance
  ;(h.weighed ??= []).push(as)
  const stance = judge(world, listener, fact, { ...h, from }, bonus)
  if (RANK[stance] <= RANK[h.stance]) return h.stance
  h.from = from
  settleStance(world, listener, fact, h, stance)
  return stance
}

/** Whether two claims say the same. */
function sameClaim(a: Claim | undefined, b: Claim | undefined): boolean {
  return Boolean(a && b && a.subject === b.subject && a.key === b.key && a.value === b.value)
}

/**
 * Who stands by a claim for this listener (M10.6): people beside them who
 * believe it (Teunis at the dyke house, who saw the leak), and, with
 * promises, who gave their word to tell them the same (an open report to them
 * in the register). An eyewitness weighs more.
 */
export function backers(world: World, listener: string, fact: Fact, promises: boolean): { id: string; saw: boolean; here: boolean }[] {
  const store = world.state.news
  const here = world.state.npcs[listener]?.location
  if (!store || !fact.claim || !here) return []
  const holds = (id: string): { saw: boolean } | undefined => {
    for (const [fid, h] of Object.entries(store.heard[id] ?? {})) {
      if (h.stance) continue
      const f = fid === fact.id ? fact : factById(world, fid)
      if (f && (f.id === fact.id || sameClaim(f.claim, fact.claim))) return { saw: h.from === 'witness' }
    }
    return undefined
  }
  const found: { id: string; saw: boolean; here: boolean }[] = []
  for (const id of Object.keys(world.state.npcs).sort()) {
    const s = world.state.npcs[id]!
    if (id === listener || s.dead || s.note || s.location !== here || s.activity === 'asleep') continue
    const h = holds(id)
    if (h) found.push({ id, saw: h.saw, here: true })
  }
  if (promises) {
    for (const a of world.state.agreements?.list ?? []) {
      if (a.status !== 'open' || a.kind !== 'message' || a.terms.recipient !== listener || found.some((b) => b.id === a.by) || !world.alive(a.by)) continue
      if (!(a.terms.facts ?? []).some((id) => id === fact.id || sameClaim(factById(world, id)?.claim, fact.claim))) continue
      found.push({ id: a.by, saw: Boolean(holds(a.by)?.saw), here: false })
    }
  }
  return found.slice(0, 2)
}

/** The weight of those who stand by it. */
export function backing(list: { saw: boolean }[]): number {
  return list.reduce((sum, b) => sum + BACKED + (b.saw ? SAW_IT : 0), 0)
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
  // What the stranger said and the trader says otherwise: the asker knows now what the stranger's word is worth (M10.3).
  checkedClaims(world, asker, subject, key)
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
      const said = factById(world, id)
      if (!said?.claim || said.t > fact.t || said.claim.subject !== claim.subject || said.claim.key !== claim.key || said.claim.value !== claim.value) continue
      delete h.stance
      queueSignal(world, { kind: 'warning_proven', who: [who, ...(world.content.npcs.has(h.from) ? [h.from] : [])], place: world.state.npcs[who]?.location ?? fact.place, cause: [fact.id, id], belang: 2, claim, watcher: 'rules' })
    }
  }
}

/** Someone goes to look at a place: the truth of it is what they believe now. */
export function lookForYourself(world: World, who: string, subject: string, key: string): void {
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
  // What the stranger said about it, and was not so, is found out (M10.3).
  checkedClaims(world, who, subject, key)
}

/** How far back a place's state can still be seen to be what was said. */
const SEEN_DAYS = 30
const visible = new WeakMap<Fact[], { n: number; list: Fact[] }>()

/** The recent claims of a place's state: the only ones a passer-by can see for themselves. */
function placeClaims(world: World): Fact[] {
  const facts = world.state.news?.facts ?? []
  const cached = visible.get(facts)
  if (cached && cached.n === facts.length) return cached.list
  const list: Fact[] = []
  for (let i = facts.length - 1; i >= 0 && world.now - facts[i]!.t <= SEEN_DAYS * 24 * 60; i--) {
    const f = facts[i]!
    if (f.claim?.key === 'state' && world.content.locations.has(f.claim.subject)) list.push(f)
  }
  visible.set(facts, { n: facts.length, list })
  return list
}

/**
 * Seeing is believing (M10.6, the dyke at Oude Zijl): whoever doubted or
 * rejected what was said of a place's state, and stands there awake, sees
 * what is true, and believes that. Every minute, so someone brought there to
 * see it sees it before they go; only those who heard such a claim, so a leak
 * nobody spoke of stays unseen until someone finds it.
 */
export function seeForYourself(world: World): void {
  const store = world.state.news
  const claims = store ? placeClaims(world) : []
  if (!claims.length) return
  for (const fact of claims) {
    const place = fact.claim!.subject
    for (const who in store!.heard) {
      if (!store!.heard[who]![fact.id]?.stance) continue
      const s = world.state.npcs[who]
      if (!s || s.location !== place || s.dead || s.activity === 'asleep' || !world.present(who)) continue
      lookForYourself(world, who, place, 'state')
    }
  }
}

/**
 * An eyewitness beside the stranger says it themselves (M10.6, Teunis at the
 * dyke house): the listener hears it from them, in person, with the
 * stranger's word beside it. Someone who did not believe it before thinks
 * again, once for this witness.
 */
export function witnessSays(world: World, listener: string, fact: Fact, witness: string, bonus: number): Heard | undefined {
  const store = world.state.news
  if (!store || !fact.claim || !world.alive(listener)) return undefined
  const theirs = (store.heard[listener] ??= {})
  const weight = IN_PERSON + SAW_IT + bonus
  if (theirs[fact.id]) {
    if (theirs[fact.id]!.stance) reconsider(world, listener, fact, witness, weight)
    return theirs[fact.id]
  }
  const h: Heard = { level: 3, reliability: 0.9, from: witness, t: world.now }
  theirs[fact.id] = h
  heardClaim(world, listener, fact, h, weight)
  return h
}
