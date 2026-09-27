import { minuteOfDay } from './clock'
import { isFamilyNews, nearOf, tieTo } from './people'
import { onFact } from './storylines'
import { concerns, triggerChoice } from './npc/goals'
import { watchFact } from './signals'
import { standingOf } from './standing'
import { heardClaim, provenWarnings } from './belief'
import type { Claim, Fact, Heard } from './state'
import type { World } from './world'

// News (design: lore and world change, "Wie weet wat"). A fact is written once
// by the motor. Witnesses know it at once; after that it goes from person to
// person where people meet, losing precision and certainty on the way, and
// small news is forgotten. No tokens: the model only words it when asked.

export interface FactInput {
  kind: string
  pattern?: string
  about: string[]
  place: string
  belang: number
  title: string
  text: Fact['text']
  /** Heard next door too: a fire, a fight, a scream. */
  loud?: boolean
  juice?: number
  /** Only these saw it (a crime someone noticed); without it, everyone there did. */
  witnesses?: string[]
  /** Not true: a rumour or a lie. */
  truth?: boolean
  /** What it says in a form the systems can check (M8.1). */
  claim?: Claim
  /** The facts that caused it; without it, what is causing things now (M9.2). */
  cause?: string[]
}

const DAY = 24 * 60
/** Small news is forgotten: belang 0 after a day, 1 after two days, 2 after two weeks. */
const FORGET_AFTER = [DAY, 2 * DAY, 14 * DAY]
const JUICE = [0.2, 0.5, 0.7, 0.8, 0.9, 1]

function news(world: World) {
  return (world.state.news ??= { seq: 0, facts: [], heard: {} })
}

export function heardBy(world: World, who: string): Record<string, Heard> {
  return (news(world).heard[who] ??= {})
}

/** The facts by id, per list: rebuilt when the list is another (a save loaded, the archive took some). */
const index = new WeakMap<Fact[], Map<string, Fact>>()

export function factById(world: World, id: string): Fact | undefined {
  const facts = world.state.news?.facts
  if (!facts) return undefined
  let byId = index.get(facts)
  if (!byId || byId.size !== facts.length) index.set(facts, (byId = new Map(facts.map((f) => [f.id, f]))))
  return byId.get(id)
}

/** Records a fact and tells the witnesses. */
export function recordFact(world: World, input: FactInput): Fact {
  const store = news(world)
  const fact: Fact = {
    id: `fact_${++store.seq}`,
    kind: input.kind,
    ...(input.pattern ? { pattern: input.pattern } : {}),
    about: input.about,
    place: input.place,
    t: world.now,
    belang: input.belang,
    juice: input.juice ?? JUICE[input.belang] ?? 0.5,
    title: input.title,
    ...(input.truth === false ? { truth: false } : {}),
    text: input.text,
    ...(input.claim ? { claim: input.claim } : {}),
  }
  const cause = (input.cause ?? world.causing).filter((id) => id !== fact.id && factById(world, id))
  if (cause.length) fact.cause = [...new Set(cause)]
  store.facts.push(fact)
  // The index grows with the list (M9.3), rather than being built again.
  const byId = index.get(store.facts)
  if (byId && byId.size === store.facts.length - 1) byId.set(fact.id, fact)
  const places = new Set([input.place])
  if (input.loud) for (const exit of Object.values(world.location(input.place).exits)) places.add(exit.to)
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    // Whoever it is about knows it, even when their activity still says asleep.
    const concerned = input.about.includes(id)
    if (input.witnesses && !input.witnesses.includes(id)) continue
    // Someone far away or on a journey is not at their old place (M8.1): they hear it where they are, later.
    if (npc.note || npc.absent) continue
    if (places.has(npc.location) && (npc.activity !== 'asleep' || concerned) && !npc.dead) {
      heardBy(world, id)[fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
      noticed(world, id, fact)
    }
  }
  if (places.has(world.state.player.location)) {
    heardBy(world, 'player')[fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    ;(world.state.player.journal ??= {})[fact.id] = world.now
  }
  onFact(world, fact)
  watchFact(world, fact)
  provenWarnings(world, fact)
  return fact
}

/**
 * What someone believes about a claim (M8.1; FO, chapter 5): of all the facts
 * they heard with this subject and key, the newest counts, and of equally
 * new ones the most precise. Far away (level 1) the value may be the far one.
 */
export function believes(world: World, who: string, subject: string, key: string): { value: string; level: number; t: number; fact: Fact; doubt: boolean } | undefined {
  const heard = world.state.news?.heard[who]
  if (!heard) return undefined
  let best: { value: string; level: number; t: number; fact: Fact; doubt: boolean } | undefined
  for (const fact of world.state.news!.facts) {
    const claim = fact.claim
    const h = heard[fact.id]
    // What they reject does not count (M8.2); what they doubt counts, marked as doubt.
    if (!claim || !h || claim.subject !== subject || claim.key !== key || h.stance === 'rejects') continue
    const value = h.level === 1 && claim.far !== undefined ? claim.far : claim.value
    if (!best || fact.t > best.fact.t || (fact.t === best.fact.t && h.level > best.level)) best = { value, level: h.level, t: h.t, fact, doubt: h.stance === 'doubts' }
  }
  return best
}

/** The rumours of the content that are going round when a game starts. */
export function seedNews(world: World): void {
  const store = news(world)
  for (const item of [...world.content.news.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const fact: Fact = {
      id: `fact_${item.id}`,
      kind: 'rumour',
      about: item.about,
      place: item.place,
      t: world.now,
      belang: item.belang,
      juice: 0.8,
      title: item.title,
      text: item.text,
      ...(item.truth ? {} : { truth: false }),
    }
    store.facts.push(fact)
    for (const [who, from] of Object.entries(item.known_by)) {
      heardBy(world, who)[fact.id] = { level: 3, reliability: from === 'witness' ? 1 : 0.9, from: from ?? 'witness', t: world.now }
    }
    onFact(world, fact)
  }
}

/** How juicy a fact still is: it fades by the day, big news more slowly. */
export function juiceNow(world: World, fact: Fact): number {
  const days = (world.now - fact.t) / DAY
  return fact.juice * Math.pow(fact.belang >= 3 ? 0.95 : 0.85, days)
}

/** The version someone tells, by how well they know it. */
export function versionOf(fact: Fact, heard: Heard): string {
  if (heard.level >= 3) return fact.text.precise
  if (heard.level === 2) return fact.text.village
  return fact.text.far
}

const CHECKS_PER_HOUR = 4
/** At a crowded place a teller talks with at most this many others a quarter of an hour, chosen seeded (M9.3). */
const CONTACTS = 12

/** Every quarter of an hour: people who are together pass on news; once an hour small news is forgotten. */
export function spreadNews(world: World): void {
  const store = world.state.news
  if (!store || store.facts.length === 0) return
  if (minuteOfDay(world.now) % 60 === 0) {
    forget(world)
    newsArrives(world)
  }
  tellTheFamily(world)
  readBoards(world)
  const byPlace = new Map<string, string[]>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (npc.activity === 'asleep' || npc.dead || npc.note || npc.absent) continue
    const list = byPlace.get(npc.location) ?? []
    list.push(id)
    byPlace.set(npc.location, list)
  }
  for (const [place, people] of [...byPlace.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (people.length < 2) continue
    for (const teller of people) {
      // Bounded contacts (M9.3): in a crowd, a few of those present; in a small company, everyone as before.
      const others = people.filter((p) => p !== teller)
      const listeners = others.length <= CONTACTS ? others : pickSome(world, 'news', others, CONTACTS)
      for (const listener of listeners) {
        // The chances are per hour; spread them over the checks in that hour.
        const perHour = chanceToTell(world, place, teller, listener)
        if (world.rng.next('news') >= 1 - Math.pow(1 - perHour, 1 / CHECKS_PER_HOUR)) continue
        tell(world, teller, listener)
      }
    }
  }
}

/** So many of a list, chosen with a system's own randomness, in their order. */
export function pickSome(world: World, stream: string, list: string[], n: number): string[] {
  const chosen = new Set<number>()
  while (chosen.size < n) chosen.add(Math.floor(world.rng.next(stream) * list.length))
  return [...chosen].sort((a, b) => a - b).map((i) => list[i]!)
}

function chanceToTell(world: World, place: string, teller: string, listener: string): number {
  const a = world.npc(teller)
  const b = world.npc(listener)
  const location = world.location(place)
  let chance = a.home === b.home && place === a.home ? 0.9 : location.tags.includes('social') || world.npcState(teller).activity === 'chatting' ? 0.5 : 0.2
  if (a.quirks.includes('gossip')) chance *= 1.6
  chance *= 1 + 0.1 * b.personality.curiosity
  // People talk more with those they are close to, and little with those they cannot stand.
  const tie = tieTo(world, teller, listener)
  if (tie) chance *= 1 + 0.15 * (tie.bond - 1)
  // People two standings apart talk less (M8.2): one looks down, the other keeps their distance.
  else if (Math.abs(standingOf(world, teller) - standingOf(world, listener)) >= 2) chance *= 0.7
  // Night hours at home are for sleeping, not talking.
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  if (hour >= 23 || hour < 5) chance *= 0.3
  return Math.min(0.95, chance)
}

/**
 * Bad news about someone goes to their family first: someone runs to tell
 * them, wherever they are, within an hour or two (design, "Voorbeeld: Harmen
 * verdrinkt": Wouter bangs on the neighbours' door).
 */
function tellTheFamily(world: World): void {
  const store = world.state.news!
  // Only the last twelve hours, from the newest back (M9.3): the list is in the order things happened.
  for (let i = store.facts.length - 1; i >= 0 && world.now - store.facts[i]!.t <= 12 * 60; i--) {
    const fact = store.facts[i]!
    if (!isFamilyNews(fact)) continue
    const knowers = Object.keys(store.heard)
      .filter((who) => who !== 'player' && store.heard[who]![fact.id] && world.alive(who))
      .sort()
    if (knowers.length === 0) continue
    for (const person of fact.about.filter((id) => world.content.npcs.has(id))) {
      for (const near of nearOf(world, person)) {
        // Someone runs to tell them, even if a vague rumour got there first.
        if ((heardBy(world, near)[fact.id]?.level ?? 0) >= 3 || world.rng.next('news') >= 0.35) continue
        const teller = knowers.find((k) => k !== near)
        if (!teller) continue
        const h = (heardBy(world, near)[fact.id] = { level: 3, reliability: 1, from: teller, t: world.now })
        heardClaim(world, near, fact, h)
        noticed(world, near, fact)
      }
    }
  }
}

/** News that concerns an NPC makes it think again about what it wants (FO, chapter 7, triggers). */
function noticed(world: World, npcId: string, fact: Fact): void {
  if (npcId === 'player' || !world.content.npcs.has(npcId) || !concerns(world, npcId, fact)) return
  const heard = heardBy(world, npcId)[fact.id]
  triggerChoice(world, npcId, `You just heard: ${heard ? versionOf(fact, heard) : fact.text.village}`)
}

/** A short meeting, such as buying something at a counter: both may pass on news. */
export function meet(world: World, a: string, b: string): void {
  if (!world.state.news?.facts.length) return
  for (const [teller, listener] of [[a, b], [b, a]] as const) {
    let chance = 0.4
    if (world.npc(teller).quirks.includes('gossip')) chance *= 1.6
    if (world.rng.next('news') < Math.min(0.9, chance)) tell(world, teller, listener)
  }
}

/** A chat ends (M8.2): the teller passes on this one fact, by the same rules as any telling. */
export function passOn(world: World, teller: string, listener: string, factId: string): void {
  const heard = heardBy(world, teller)[factId]
  const fact = factById(world, factId)
  const theirs = heardBy(world, listener)
  if (!heard || !fact || theirs[factId] || !world.alive(listener)) return
  const grows = heard.grown || world.rng.next('news') < (world.npc(teller).quirks.includes('gossip') ? 0.25 : 0.1)
  const h: Heard = { level: Math.max(1, heard.level - 1) as Heard['level'], reliability: Math.round(heard.reliability * 0.9 * 100) / 100, from: teller, t: world.now, grown: grows || undefined }
  theirs[factId] = h
  heardClaim(world, listener, fact, h)
  noticed(world, listener, fact)
}

/**
 * The player tells an NPC something they heard (M9.4): the NPC hears it from
 * the stranger, one step less sure, and believes it as far as they trust the
 * stranger. Found in the playtest of the dyke: nobody could be warned.
 */
export function playerTells(world: World, listener: string, factId: string): Heard | undefined {
  const mine = heardBy(world, 'player')[factId]
  const fact = factById(world, factId)
  const theirs = heardBy(world, listener)
  if (!mine || !fact || !world.alive(listener)) return undefined
  if (theirs[factId]) return theirs[factId]
  const h: Heard = { level: Math.max(1, mine.level - 1) as Heard['level'], reliability: Math.round(mine.reliability * 0.9 * 100) / 100, from: 'player', t: world.now }
  theirs[factId] = h
  heardClaim(world, listener, fact, h)
  noticed(world, listener, fact)
  return h
}

/** The teller passes on the two juiciest facts the listener has not heard yet. */
function tell(world: World, teller: string, listener: string): void {
  const known = heardBy(world, teller)
  const theirs = heardBy(world, listener)
  // A witness who was paid or scared into silence keeps it to themselves (FO, chapter 8).
  const quiet = world.state.silenced?.[teller] ?? []
  const fresh = Object.entries(known)
    .map(([id, heard]) => ({ fact: factById(world, id)!, heard }))
    .filter(({ fact, heard }) => fact && !theirs[fact.id] && !quiet.includes(fact.id) && heard.stance !== 'rejects' && juiceNow(world, fact) >= 0.1)
    .sort((x, y) => juiceNow(world, y.fact) - juiceNow(world, x.fact) || x.fact.id.localeCompare(y.fact.id))
    .slice(0, 2)
  for (const { fact, heard } of fresh) {
    // A gossip tells it bigger; anyone may, now and then.
    const grows = heard.grown || world.rng.next('news') < (world.npc(teller).quirks.includes('gossip') ? 0.25 : 0.1)
    const h: Heard = { level: Math.max(1, heard.level - 1) as Heard['level'], reliability: Math.round(heard.reliability * 0.9 * 100) / 100, from: teller, t: world.now, grown: grows || undefined }
    theirs[fact.id] = h
    heardClaim(world, listener, fact, h)
    noticed(world, listener, fact)
  }
}

/**
 * News beyond the village (M8.1; design: lore and world change, "Wie weet
 * wat"): per area the game works out when news arrives, and from then on
 * the people there know it at the level of the distance. For someone away
 * (a note: on a journey, fled, far off) this is the only way news reaches
 * them; for everyone it carries big news (belang 4 and 5) through the region.
 */
function newsArrives(world: World): void {
  const store = world.state.news!
  // News still on its way: the last month at most, from the newest back (M9.3), in the order things happened.
  const recent: Fact[] = []
  for (let i = store.facts.length - 1; i >= 0 && world.now - store.facts[i]!.t <= 30 * DAY; i--) recent.push(store.facts[i]!)
  const fresh = recent.reverse().filter((f) => f.belang >= 2 && world.now - f.t <= (FORGET_AFTER[f.belang] ?? 30 * DAY))
  if (fresh.length === 0) return
  const km = new Map<string, number>()
  const areaOf = (place: string) => world.content.locations.get(place)?.area ?? place
  const kmOf = (a: string, b: string) => {
    const key = `${areaOf(a)}|${areaOf(b)}`
    let v = km.get(key)
    if (v === undefined) km.set(key, (v = areaKm(world, a, b)))
    return v
  }
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (npc.dead || npc.absent) continue
    const away = Boolean(npc.note)
    const where = npc.note?.where ?? npc.location
    const heard = heardBy(world, id)
    for (const fact of fresh) {
      if (heard[fact.id] || (!away && fact.belang < 4)) continue
      // Worked out once per area, not per person (M9.3).
      const km = kmOf(fact.place, where)
      if (km > REACH_KM[fact.belang]!) continue
      if (world.now < fact.t + (1 + km / 4) * 60) continue
      const h: Heard = { level: km <= 10 ? 2 : 1, reliability: km <= 10 ? 0.8 : 0.6, from: 'news', t: world.now }
      heard[fact.id] = h
      heardClaim(world, id, fact, h)
      if (!away) noticed(world, id, fact)
    }
  }
}

/** Notices on a board (M8.1): whoever is there reads them, precisely. */
function readBoards(world: World): void {
  for (const [place, facts] of Object.entries(world.state.boards ?? {}).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!facts.length) continue
    const readers = Object.keys(world.state.npcs)
      .sort()
      .filter((id) => {
        const npc = world.state.npcs[id]!
        return npc.location === place && !npc.note && !npc.dead && !npc.absent && npc.activity !== 'asleep'
      })
    if (world.state.player.location === place) readers.push('player')
    for (const who of readers) {
      const heard = heardBy(world, who)
      for (const id of facts) {
        if (heard[id] || !factById(world, id)) continue
        heard[id] = { level: 3, reliability: 1, from: 'board', t: world.now }
        if (who === 'player') (world.state.player.journal ??= {})[id] = world.now
        else {
          heardClaim(world, who, factById(world, id)!, heard[id]!)
          noticed(world, who, factById(world, id)!)
        }
      }
    }
  }
}

/** How far news of each belang travels, in km. */
const REACH_KM = [0, 0, 10, 30, 100, Infinity]

/** Between the areas of two places, in km; far beyond the region for a place that is not on the map. */
function areaKm(world: World, a: string, b: string): number {
  const pos = (place: string) => {
    const loc = world.content.locations.get(place)
    const area = loc ? world.content.areas.get(loc.area) : undefined
    return area?.pos
  }
  const pa = pos(a)
  const pb = pos(b)
  if (!pa || !pb) return pa || pb ? 150 : 0
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1])
}

function forget(world: World): void {
  const store = world.state.news!
  for (const [who, heard] of Object.entries(store.heard)) {
    if (who === 'player') continue
    for (const id of Object.keys(heard)) {
      const fact = factById(world, id)
      const after = fact ? FORGET_AFTER[fact.belang] : 0
      if (!fact || (after !== undefined && world.now - fact.t > after)) delete heard[id]
    }
  }
}

/** Facts an NPC has heard about any of these topics, juiciest first. */
export function newsAbout(world: World, npcId: string, topics: string[], max = 2): { fact: Fact; heard: Heard }[] {
  const heard = world.state.news?.heard[npcId] ?? {}
  return Object.entries(heard)
    .map(([id, h]) => ({ fact: factById(world, id)!, heard: h }))
    .filter(({ fact }) => fact && (topics.length === 0 || fact.about.some((t) => topics.includes(t))))
    .sort((x, y) => juiceNow(world, y.fact) - juiceNow(world, x.fact) || y.fact.t - x.fact.t)
    .slice(0, max)
}
