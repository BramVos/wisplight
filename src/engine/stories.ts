import { GameClock, minuteOfDay, startOfDay } from './clock'
import { areaTopicId, callName, type Npc, type Pattern } from './content'
import { applyEffect } from './dialogue/relations'
import { add, itemName, remedyItem, withArticle } from './items'
import { belangOf } from './life'
import { recordFact } from './news'
import { lineOf, risingLines, tenseAreas } from './storylines'
import { fulfil, openRequest } from './requests'
import { remember } from './npc/execute'
import { shiftBond } from './social/deeds'
import type { World } from './world'

// Stories (design: lore and world change, "Soorten verhalen" and "Tempo en
// toeval"). The rules of the world decide what happens; the pacing engine only
// decides how often a small story starts, from the patterns in the content.
// Each kind of pattern is one piece of the motor below. Lines running towards
// a crisis weigh on the pace (M8.3): fewer small stories while they run, and
// none in a village where two of them run at once.

export type Tempo = 'calm' | 'normal' | 'dramatic'

export interface Story {
  id: string
  pattern: string
  kind: Pattern['kind']
  started: number
  roles: Record<string, string>
  data: Record<string, string | number>
  next?: number
  done?: boolean
}

export interface StoriesState {
  seq: number
  tempo: Tempo
  lastIncident: number
  active: Story[]
  done: Story[]
}

const DAY = 24 * 60
/** Expected small stories per day, before the bonus for a quiet spell. */
const PER_DAY: Record<Tempo, number> = { calm: 0.4, normal: 0.8, dramatic: 1.6 }
const KEEP_DONE = 60
/** Fewer small stories a day for every storyline in rising or crisis. */
const RISING_WEIGHT = 0.2

export function stories(world: World): StoriesState {
  return (world.state.stories ??= { seq: 0, tempo: 'normal', lastIncident: world.now, active: [], done: [] })
}

/** Called every hour by the simulation. */
export function storyHour(world: World): void {
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  if (hour === 6) morning(world)
  const state = world.state.stories
  if (!state) return
  for (const story of [...state.active]) {
    if (story.next !== undefined && world.now >= story.next) beat(world, story)
  }
  for (const story of state.active.filter((s) => s.done)) {
    state.active.splice(state.active.indexOf(story), 1)
    state.done.push(story)
  }
  if (state.done.length > KEEP_DONE) state.done.splice(0, state.done.length - KEEP_DONE)
}

/** Each morning: feasts on their day, and a roll for how many small stories start. */
function morning(world: World): void {
  const state = stories(world)
  const today = new GameClock(world.now).parts
  for (const pattern of patterns(world, 'feast')) {
    if (pattern.date?.month === today.month && pattern.date.day === today.day) start(world, pattern)
  }
  const quietDays = Math.max(0, (world.now - state.lastIncident) / DAY - 2)
  const expected = PER_DAY[state.tempo] + Math.min(1, quietDays * 0.2) - RISING_WEIGHT * risingLines(world).length
  let started = 0
  for (let n = 0; n < 3 && world.rng.next('stories') < expected - n; n++) {
    const recent = new Set([...state.active, ...state.done].filter((s) => world.now - s.started < 2 * DAY).map((s) => s.pattern))
    const candidates = patterns(world).filter((p) => p.kind !== 'feast' && p.weight > 0 && !recent.has(p.id))
    const pattern = weighted(world, candidates)
    if (pattern && start(world, pattern)) started++
  }
  if (started > 0) state.lastIncident = world.now
}

function patterns(world: World, kind?: Pattern['kind']): Pattern[] {
  return [...world.content.patterns.values()].filter((p) => !kind || p.kind === kind).sort((a, b) => a.id.localeCompare(b.id))
}

function weighted(world: World, list: Pattern[]): Pattern | undefined {
  const total = list.reduce((sum, p) => sum + p.weight, 0)
  let roll = world.rng.next('stories') * total
  for (const p of list) {
    roll -= p.weight
    if (roll < 0) return p
  }
  return undefined
}

function begin(world: World, pattern: Pattern, roles: Story['roles'], data: Story['data'], next?: number): Story {
  const state = stories(world)
  const story: Story = { id: `story_${++state.seq}`, pattern: pattern.id, kind: pattern.kind, started: world.now, roles, data, next }
  state.active.push(story)
  return story
}

/** Starts a pattern now, for tests and later for the world builder. Returns false when nobody fits. */
export function startStory(world: World, patternId: string): boolean {
  const pattern = world.content.patterns.get(patternId)
  return pattern ? start(world, pattern) : false
}

function start(world: World, pattern: Pattern): boolean {
  switch (pattern.kind) {
    case 'lost_thing':
      return startLost(world, pattern)
    case 'quarrel':
      return Boolean(begin(world, pattern, {}, {}, at(world, 20, 30)))
    case 'theft':
      return Boolean(begin(world, pattern, {}, {}, at(world, 3, 0)))
    case 'sickness':
      return startSickness(world, pattern)
    case 'feast':
      return Boolean(begin(world, pattern, {}, { place: pattern.place!, from: at(world, 9, 0), until: at(world, 10, 30) }, at(world, 10, 0)))
  }
}

function beat(world: World, story: Story): void {
  const pattern = world.content.patterns.get(story.pattern)
  if (!pattern) {
    story.done = true
    return
  }
  switch (story.kind) {
    case 'lost_thing':
      return searchLost(world, story, pattern)
    case 'quarrel':
      return playQuarrel(world, story, pattern)
    case 'theft':
      return playTheft(world, story, pattern)
    case 'sickness':
      story.done = true
      return
    case 'feast':
      return playFeast(world, story, pattern)
  }
}

// ---------------------------------------------------------------- the kinds

/** Someone loses a belonging. It really lies somewhere, and can be found and given back. */
function startLost(world: World, pattern: Pattern): boolean {
  const owner = pick(world, adults(world).filter((id) => world.npcState(id).activity !== 'asleep'))
  const thing = world.rng.pick('stories', pattern.items)
  if (!owner || !thing) return false
  const npc = world.npcState(owner)
  const places = outdoorsNear(world, npc.location)
  const place = world.rng.pick('stories', places)
  if (!place) return false
  add((world.state.ground[place] ??= {}), thing, 1)
  const vars = { owner: callName(world.npc(owner)), thing: thingName(world, thing), place: world.location(place).name, area: areaName(world, place) }
  const fact = record(world, pattern, npc.location, [owner, `item_${thing}`, place], vars, world.npc(owner))
  // Something lost is something the player can find: a request, as soon as the owner next talks to them.
  openRequest(world, { npc: owner, kind: 'recover', item: thing, line: lineOf(world, fact)?.id, source: 'motor' })
  if (pattern.scene) world.emit('story', npc.location, fill(pattern.scene, vars, world.npc(owner)), owner)
  remember(world, owner, `lost your ${vars.thing}`)
  begin(world, pattern, { owner }, { thing, place }, world.now + 60)
  return true
}

function searchLost(world: World, story: Story, pattern: Pattern): void {
  const owner = story.roles['owner']!
  const thing = String(story.data['thing'])
  const place = String(story.data['place'])
  const ground = world.state.ground[place] ?? {}
  story.next = world.now + 60
  if ((ground[thing] ?? 0) > 0) {
    const here = world.npcsAt(place).filter((id) => world.state.npcs[id]!.activity !== 'asleep')
    // It takes a while: the owner looks in the wrong places, others walk past it.
    const finder = here.includes(owner) && world.rng.next('stories') < 0.25 ? owner : here.filter((id) => id !== owner).find(() => world.rng.next('stories') < 0.04)
    if (finder) {
      add(ground, thing, -1)
      if (finder !== owner) {
        const vars = { finder: callName(world.npc(finder)), owner: callName(world.npc(owner)), thing: thingName(world, thing), place: world.location(place).name }
        recordFact(world, {
          kind: 'found',
          about: [owner, finder, `item_${thing}`],
          place,
          belang: pattern.belang,
          title: `${vars.finder} finding ${vars.owner}'s ${vars.thing}`,
          text: {
            precise: `${vars.finder} found ${vars.owner}'s ${vars.thing} near ${vars.place} and gave it back.`,
            village: `${vars.owner} has ${world.say('{their}', owner)} ${vars.thing} back.`,
            far: `Something lost in ${areaName(world, place)} turned up again, they say.`,
          },
        })
      }
      closeLost(world, story, owner, thing)
      return
    }
  }
  if (world.now - story.started > 5 * DAY) closeLost(world, story, owner, thing)
}

function closeLost(world: World, story: Story, owner: string, thing: string): void {
  story.done = true
  story.next = undefined
  for (const request of world.state.requests) if (request.npc === owner && request.item === thing && request.status === 'open') request.status = 'done'
}

/** The player gives something to an NPC: a lost belonging coming back ends that story. */
export function giveBack(world: World, npcId: string, item: string): string | undefined {
  const story = world.state.stories?.active.find((s) => s.kind === 'lost_thing' && !s.done && s.roles['owner'] === npcId && s.data['thing'] === item)
  if (!story) return undefined
  const owner = callName(world.npc(npcId))
  const thing = thingName(world, item)
  applyEffect(world, npcId, 'affinity', 3)
  applyEffect(world, npcId, 'trust', 2)
  recordFact(world, {
    kind: 'returned',
    about: [npcId, `item_${item}`],
    place: world.state.player.location,
    belang: 1,
    title: `the stranger returning ${owner}'s ${thing}`,
    text: {
      precise: `The stranger found ${owner}'s ${thing} and brought it back.`,
      village: `The stranger brought ${owner}'s ${thing} back. Honest, that one.`,
      far: `That stranger returns what folk lose, they say.`,
    },
  })
  const paid = fulfil(world, npcId, item, 1, false)
  closeLost(world, story, npcId, item)
  return world.say(`{name} turns it over in {their} hands. "My ${thing}! Where did you find it?"`, npcId) + (paid ? ` ${paid}` : '')
}

/** In the evening, two people at a social place fall out, loudly. */
function playQuarrel(world: World, story: Story, pattern: Pattern): void {
  story.done = true
  const byPlace = new Map<string, string[]>()
  const tense = tenseAreas(world)
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (npc.dead || npc.note || npc.activity === 'asleep' || world.npc(id).child || !world.location(npc.location).tags.includes('social') || tense.has(world.location(npc.location).area)) continue
    byPlace.set(npc.location, [...(byPlace.get(npc.location) ?? []), id])
  }
  let best: { place: string; a: string; b: string; heat: number } | undefined
  for (const [place, people] of [...byPlace.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    for (let i = 0; i < people.length; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i]!
        const b = people[j]!
        // The same two do not fall out again within the week.
        if ((world.state.stories?.done ?? []).some((s) => s.kind === 'quarrel' && world.now - s.started < 7 * DAY && [a, b].every((x) => Object.values(s.roles).includes(x)))) continue
        const heat = world.npc(a).personality.temper + world.npc(b).personality.temper + world.rng.next('stories') * 2
        if (!best || heat > best.heat) best = { place, a, b, heat }
      }
    }
  }
  if (!best) return
  const reason = world.rng.pick('stories', pattern.reasons) ?? 'nothing at all'
  const vars = { a: callName(world.npc(best.a)), b: callName(world.npc(best.b)), reason, place: world.location(best.place).name, area: areaName(world, best.place) }
  story.roles = { a: best.a, b: best.b }
  story.data = { place: best.place, reason }
  record(world, pattern, best.place, [best.a, best.b, best.place], vars, undefined, true)
  if (pattern.scene) world.emit('story', best.place, fill(pattern.scene, vars), best.a)
  remember(world, best.a, `quarrelled with ${vars.b} about ${reason}`)
  remember(world, best.b, `quarrelled with ${vars.a} about ${reason}`)
  // A quarrel leaves a grudge (M8.2): made up, or a feud after a week.
  grudge(world, best.a, best.b)
}

/** Two people fall out: less liking both ways, and a grudge from now until it is made up. */
export function grudge(world: World, a: string, b: string): void {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    shiftBond(world, x, y, -15, -5)
    const bond = world.state.bonds![x]![y]!
    bond.grudge ??= world.now
  }
}

/** At night someone takes goods from a shop; the owner finds out when opening up. */
function playTheft(world: World, story: Story, pattern: Pattern): void {
  if (story.data['stage'] === 'found') {
    story.done = true
    const place = String(story.data['place'])
    const victim = String(story.data['victim'])
    const vars = { victim: callName(world.npc(victim)), goods: String(story.data['goods']), place: world.location(place).name, area: areaName(world, place) }
    const fact = record(world, pattern, place, [victim, place], vars, world.npc(victim))
    // The owner notices, wherever they are.
    const heard = (world.state.news!.heard[victim] ??= {})
    heard[fact] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    return
  }
  const tense = tenseAreas(world)
  const shops = [...world.content.locations.values()].filter((l) => !tense.has(l.area)).flatMap((location) =>
    location.services.flatMap((service) => pattern.items.filter((item) => (world.stock(location.id, service.id)[item] ?? 0) > 0).map((item) => ({ location: location.id, service, item }))),
  )
  const target = world.rng.pick('stories', shops.sort((a, b) => `${a.location}${a.item}`.localeCompare(`${b.location}${b.item}`)))
  if (!target) {
    story.done = true
    return
  }
  const stock = world.stock(target.location, target.service.id)
  const qty = Math.min(stock[target.item] ?? 0, world.rng.int('stories', 1, 3))
  add(stock, target.item, -qty)
  story.roles = { victim: target.service.provider }
  story.data = { stage: 'found', place: target.location, victim: target.service.provider, goods: qty === 1 ? withArticle(itemName(world.content, target.item)) : itemName(world.content, target.item, qty) }
  story.next = at(world, 7, 30)
}

/** Someone falls ill and keeps to bed for a few days. */
function startSickness(world: World, pattern: Pattern): boolean {
  const who = pick(world, adults(world).filter((id) => !world.npcState(id).sickUntil || world.npcState(id).sickUntil! < world.now))
  if (!who) return false
  const npc = world.npcState(who)
  npc.sickUntil = world.now + world.rng.int('stories', 1, 3) * DAY
  const home = world.npc(who).home
  const vars = { name: callName(world.npc(who)), area: areaName(world, home) }
  const fact = record(world, pattern, home, [who], vars, world.npc(who))
  for (const id of Object.keys(world.state.npcs)) {
    if (id === who || world.npc(id).home === home) (world.state.news!.heard[id] ??= {})[fact] = { level: 3, reliability: 1, from: 'witness', t: world.now }
  }
  remember(world, who, 'fell ill with a fever')
  begin(world, pattern, { name: who }, { until: npc.sickUntil }, npc.sickUntil)
  askForHerbs(world, who, fact)
  return true
}

/** A fever mends sooner with the world's remedy: someone in the house asks the player to fetch it. */
function askForHerbs(world: World, sick: string, fact: string): void {
  const remedy = remedyItem(world.content, 'sickened')
  const seller = remedy ? [...world.content.locations.values()].flatMap((l) => l.services).find((s) => remedy in s.sells)?.provider : undefined
  if (!remedy || !seller || seller === sick) return
  const house = world.npc(sick).household
  const giver = Object.keys(world.state.npcs)
    .sort()
    .find((id) => id !== sick && house && world.npc(id).household === house && world.alive(id) && !world.npc(id).child) ?? sick
  const herbalist = callName(world.npc(seller))
  const thing = itemName(world.content, remedy)
  const ask =
    giver === sick
      ? `This fever has me flat on my back. ${cap(withArticle(thing))} from ${herbalist} would help, if you could fetch one.`
      : `${callName(world.npc(sick))} is down with a fever. ${cap(withArticle(thing))} from ${herbalist} would help, if you could fetch one.`
  openRequest(world, { npc: giver, kind: 'fetch', item: remedy, name: `${thing.charAt(0).toUpperCase()}${thing.slice(1)} for ${callName(world.npc(sick))}`, ask, line: lineOf(world, fact)?.id, source: 'motor' })
}

/** A feast day: the people of the place gather there for a while. */
function playFeast(world: World, story: Story, pattern: Pattern): void {
  story.done = true
  const place = String(story.data['place'])
  const vars = { place: world.location(place).name, area: areaName(world, place) }
  record(world, pattern, place, [place, areaTopicId(world.content, world.location(place).area)], vars)
  if (pattern.scene) world.emit('story', place, fill(pattern.scene, vars))
}

/**
 * A feast of a plan (M8.1): a date and a place that are only known in play,
 * and guests from further off besides the people of the place.
 */
export function holdFeast(world: World, place: string, from: number, until: number, guests: string[]): void {
  const state = stories(world)
  state.active.push({ id: `story_${++state.seq}`, pattern: '', kind: 'feast', started: world.now, roles: {}, data: { place, from, until, guests: guests.join(',') }, next: until })
}

/** Where a feast is on right now for this NPC, if any. */
export function feastFor(world: World, npcId: string): { place: string; until: number } | undefined {
  const home = world.location(world.npc(npcId).home).area
  for (const story of world.state.stories?.active ?? []) {
    if (story.kind !== 'feast') continue
    const place = String(story.data['place'])
    const from = Number(story.data['from'])
    const until = Number(story.data['until'])
    const guest = String(story.data['guests'] ?? '').split(',').includes(npcId)
    if (world.now >= from && world.now < until && (guest || world.location(place).area === home)) return { place, until }
  }
  return undefined
}

// ---------------------------------------------------------------- helpers

function record(world: World, pattern: Pattern, place: string, about: string[], vars: Record<string, string>, subject?: Npc, loud = false): string {
  return recordFact(world, {
    kind: pattern.kind,
    pattern: pattern.id,
    about,
    place,
    belang: belangOf(world, pattern.belang, about),
    loud,
    title: fill(pattern.text.title, vars, subject),
    text: { precise: fill(pattern.text.precise, vars, subject), village: fill(pattern.text.village, vars, subject), far: fill(pattern.text.far, vars, subject) },
  }).id
}

function fill(template: string, vars: Record<string, string>, subject?: Npc): string {
  const forms = { she: ['she', 'her', 'her'], he: ['he', 'his', 'him'], they: ['they', 'their', 'them'] }[subject?.pronoun ?? 'they']
  return template
    .replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole)
    .replaceAll('{they}', forms[0]!)
    .replaceAll('{their}', forms[1]!)
    .replaceAll('{them}', forms[2]!)
}

/** Who a small story may start with: grown, mortal, free, and neither living nor being in a village where two lines run towards a crisis. */
function adults(world: World): string[] {
  const tense = tenseAreas(world)
  return Object.keys(world.state.npcs)
    .filter((id) => world.present(id) && !world.npc(id).child && !world.npc(id).quirks.includes('spirit') && !(world.state.stories?.active ?? []).some((s) => Object.values(s.roles).includes(id)))
    .filter((id) => !tense.has(world.location(world.npc(id).home).area) && !tense.has(world.location(world.state.npcs[id]!.location).area))
    .sort()
}

function pick(world: World, list: string[]): string | undefined {
  return world.rng.pick('stories', list)
}

/** Places one or two steps away, outdoors: where something dropped on the way may lie. */
function outdoorsNear(world: World, from: string): string[] {
  const one = Object.values(world.location(from).exits).map((e) => e.to)
  const two = one.flatMap((id) => Object.values(world.location(id).exits).map((e) => e.to))
  return [...new Set([...one, ...two])].filter((id) => id !== from && !world.location(id).tags.includes('private')).sort()
}

function thingName(world: World, item: string): string {
  return withArticle(itemName(world.content, item)).replace(/^(a|an) /, '')
}

function areaName(world: World, location: string): string {
  return world.content.areas.get(world.location(location).area)?.name ?? world.location(location).name
}

/** Today at this time, or tomorrow if that has passed. */
function at(world: World, hour: number, minute: number): number {
  const today = startOfDay(world.now) + hour * 60 + minute
  return today > world.now ? today : today + DAY
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
