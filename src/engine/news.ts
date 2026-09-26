import { minuteOfDay } from './clock'
import type { Fact, Heard } from './state'
import type { World } from './world'

// News (design: lore and world change, "Wie weet wat"). A fact is written once
// by the motor. Witnesses know it at once; after that it goes from person to
// person where people meet, losing precision and certainty on the way, and
// small news is forgotten. No tokens: the model only words it when asked.

export interface FactInput {
  kind: string
  about: string[]
  place: string
  belang: number
  title: string
  text: Fact['text']
  /** Heard next door too: a fire, a fight, a scream. */
  loud?: boolean
  juice?: number
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

export function factById(world: World, id: string): Fact | undefined {
  return world.state.news?.facts.find((f) => f.id === id)
}

/** Records a fact and tells the witnesses. */
export function recordFact(world: World, input: FactInput): Fact {
  const store = news(world)
  const fact: Fact = {
    id: `fact_${++store.seq}`,
    kind: input.kind,
    about: input.about,
    place: input.place,
    t: world.now,
    belang: input.belang,
    juice: input.juice ?? JUICE[input.belang] ?? 0.5,
    title: input.title,
    text: input.text,
  }
  store.facts.push(fact)
  const places = new Set([input.place])
  if (input.loud) for (const exit of Object.values(world.location(input.place).exits)) places.add(exit.to)
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (places.has(npc.location) && npc.activity !== 'asleep') heardBy(world, id)[fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
  }
  if (places.has(world.state.player.location)) heardBy(world, 'player')[fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
  return fact
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

/** Every quarter of an hour: people who are together pass on news; once an hour small news is forgotten. */
export function spreadNews(world: World): void {
  const store = world.state.news
  if (!store || store.facts.length === 0) return
  if (minuteOfDay(world.now) % 60 === 0) forget(world)
  const byPlace = new Map<string, string[]>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (npc.activity === 'asleep') continue
    const list = byPlace.get(npc.location) ?? []
    list.push(id)
    byPlace.set(npc.location, list)
  }
  for (const [place, people] of [...byPlace.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (people.length < 2) continue
    for (const teller of people) {
      for (const listener of people) {
        if (teller === listener) continue
        // The chances are per hour; spread them over the checks in that hour.
        const perHour = chanceToTell(world, place, teller, listener)
        if (world.rng.next('news') >= 1 - Math.pow(1 - perHour, 1 / CHECKS_PER_HOUR)) continue
        tell(world, teller, listener)
      }
    }
  }
}

function chanceToTell(world: World, place: string, teller: string, listener: string): number {
  const a = world.npc(teller)
  const b = world.npc(listener)
  const location = world.location(place)
  let chance = a.home === b.home && place === a.home ? 0.9 : location.tags.includes('social') || world.npcState(teller).activity === 'chatting' ? 0.5 : 0.2
  if (a.quirks.includes('gossip')) chance *= 1.6
  chance *= 1 + 0.1 * b.personality.curiosity
  // Night hours at home are for sleeping, not talking.
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  if (hour >= 23 || hour < 5) chance *= 0.3
  return Math.min(0.95, chance)
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

/** The teller passes on the two juiciest facts the listener has not heard yet. */
function tell(world: World, teller: string, listener: string): void {
  const known = heardBy(world, teller)
  const theirs = heardBy(world, listener)
  const fresh = Object.entries(known)
    .map(([id, heard]) => ({ fact: factById(world, id)!, heard }))
    .filter(({ fact }) => fact && !theirs[fact.id] && juiceNow(world, fact) >= 0.1)
    .sort((x, y) => juiceNow(world, y.fact) - juiceNow(world, x.fact) || x.fact.id.localeCompare(y.fact.id))
    .slice(0, 2)
  for (const { fact, heard } of fresh) {
    // A gossip tells it bigger; anyone may, now and then.
    const grows = heard.grown || world.rng.next('news') < (world.npc(teller).quirks.includes('gossip') ? 0.25 : 0.1)
    theirs[fact.id] = { level: Math.max(1, heard.level - 1) as Heard['level'], reliability: Math.round(heard.reliability * 0.9 * 100) / 100, from: teller, t: world.now, grown: grows || undefined }
  }
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
