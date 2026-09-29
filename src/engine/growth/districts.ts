import { idWordsIn } from '../idwords'
import { frameOf } from '../lands'
import { checkContent, LocationSchema, NpcSchema, type Content, type Direction } from '../content'
import { cachedSystem, type LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { voiceSummary } from '../dialogue/voice'
import { recordFact } from '../news'
import { crossesLimits, readsAsInstruction, worldText } from '../safety'
import { newNpcState, type GameState } from '../state'
import type { World } from '../world'
import { farPlaceOf, farTopicAt, fitsRoom, freeId } from './far'
import { grownContent, growth } from './growth'
import { askOutput, mustAsk } from '../asking'
import type { Output } from '../commands'
import { sketchById, sketchNpc, sketchProfession } from '../sketches'

// A far town grows by district, not all at once (M10.21; Bram, 28 September
// 2026: a whole town with all its people, events and chances costs far more
// than a sketch). The world book names a town's quarters (a place topic's
// `districts`). The first, where the stranger comes in, is made playable only
// when they do something there (buy, ask, rent a bed); each other one only
// when they go there, by the street that leads off the market. The chronicler
// writes the names and the words, with the rules of the Places and People
// steps of world building; the engine fixes the shape, and the whole is
// checked as content before it is kept in the save. Without a model a
// district is made from templates and the world book's line.

/** A way into a district from a place outside it: an exit, laid when the district is. */
export interface Join {
  from: string
  direction: Direction
  to: string
}

/** A district of a far town as the game made it: raw content, parsed and checked like any. */
export interface District {
  topic: string
  id: string
  /** A stub is only the street into it, until the stranger goes there. */
  by: 'stub' | 'template' | 'chronicler'
  t: number
  /** Its places; for another district the first is its street. The first district has none of its own at first: the town's gate, market and inn are its heart. */
  locations: Record<string, unknown>[]
  npcs: Record<string, unknown>[]
  /** The ways in from places outside it (the market, the gate). */
  joins: Join[]
  /** People named in talks who live in this town (M10.9), and the person each became here (M10.22). */
  sketches?: Record<string, string>
  /** Seats of factions the world has, at a place of this district, with what they want there (M10.22). */
  seats?: { faction: string; at: string; wants: string }[]
}

/** What the chronicler writes for a district: names and words, never the shape. */
export interface DistrictWords {
  places: { key: string; name: string; description: string; near?: string }[]
  /** For about one in three of the people, a secret and its hint (M10.25). */
  people: { key: string; name: string; pronoun: string; looks: string; speech: string; fact: string; trade?: string; at?: string; secret?: { text: string; hint: string } | null }[]
  /** Factions of the world that sit here (M10.22): never a new one. */
  seats?: { faction: string; at: string; wants: string }[]
}

/** The most places and people a district may add, so a call stays small and a town stays a town. */
const MOST_PLACES = 6
const MOST_PEOPLE = 6
/** The seats of factions one district may hold. */
const MOST_SEATS = 2

const keyOf = (topic: string, id: string) => `${topic}:${id}`
const WINDS: Direction[] = ['north', 'east', 'south', 'west', 'northeast', 'northwest', 'southeast', 'southwest']
const OPPOSITE: Record<string, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest' }

export function districtOf(world: Pick<World, 'state'>, topic: string, id: string): District | undefined {
  return world.state.growth?.districts?.[keyOf(topic, id)]
}

/** The quarters of a town, as its topic names them; the first is where the stranger comes in. */
export function districtsOf(content: Content, topic: string): { id: string; name: string; line: string }[] {
  return content.topics.get(topic)?.districts ?? []
}

/** The layers of districts, for the content of a game: their places and people, and the ways in. */
export function withDistricts(content: Content, state: GameState): Content {
  const all = Object.values(state.growth?.districts ?? {})
  if (!all.length) return content
  const locations = new Map(content.locations)
  const npcs = new Map(content.npcs)
  const factions = new Map(content.factions)
  const sorted = all.sort((a, b) => `${a.topic}:${a.id}`.localeCompare(`${b.topic}:${b.id}`))
  // Seats of the world's factions in the districts (M10.22).
  for (const d of sorted) {
    for (const seat of d.seats ?? []) {
      const f = factions.get(seat.faction)
      if (f && !f.seats.some((s) => s.at === seat.at)) factions.set(f.id, { ...f, seats: [...f.seats, { at: seat.at, wants: seat.wants }] })
    }
  }
  for (const d of sorted) {
    for (const raw of d.locations) {
      const l = LocationSchema.parse(raw)
      locations.set(l.id, l)
    }
    for (const raw of d.npcs) {
      const n = NpcSchema.parse(raw)
      if (!npcs.has(n.id)) npcs.set(n.id, n)
    }
  }
  for (const d of sorted) {
    for (const j of d.joins) {
      const from = locations.get(j.from)
      if (from && locations.has(j.to)) locations.set(from.id, { ...from, exits: { ...from.exits, [j.direction]: { to: j.to, minutes: 3 } } })
    }
  }
  return { ...content, locations, npcs, factions }
}

/** The town's heart: the place its districts lead off (its market), from the far place the game made. */
function heartOf(world: Pick<World, 'state'>, topic: string): string | undefined {
  const far = farPlaceOf(world, topic)
  return far ? String((far.locations[1] ?? far.locations[0])!['id']) : undefined
}

/** A secret or its hint as the content wants it: one sentence or two, within the limits, and no instruction to a model. */
const secretFits = (text: unknown): text is string => typeof text === 'string' && text.trim().length > 0 && text.length <= 240 && !crossesLimits(text) && !readsAsInstruction(text) && !idWordsIn(text).length

/** A description as the content rules want it, or the template's. */
const room = (text: string | undefined, fallback: string) => (fitsRoom(text) ? text : fallback)

/**
 * Where new places may join: the free ways out of a place, whether it is one
 * of the world's (with the exits it has) or one being made (with its own).
 */
class Ways {
  private readonly used = new Set<string>()
  constructor(
    private readonly world: World,
    private readonly own: Record<string, unknown>[],
  ) {}

  free(at: string): Direction | undefined {
    const raw = this.own.find((l) => l['id'] === at)
    const exits = (raw ? (raw['exits'] as Record<string, unknown>) : this.world.content.locations.get(at)?.exits) ?? {}
    const wind = WINDS.find((w) => !(exits as Record<string, unknown>)[w] && !this.used.has(`${at}:${w}`))
    if (wind) this.used.add(`${at}:${wind}`)
    return wind
  }
}

/**
 * The district, made: the shape is the engine's, the words the chronicler's
 * where they pass. Each new place lies off the one the chronicler names as
 * near it, or off the district's entrance; each new person lives and works
 * at one of its places.
 */
export function makeDistrict(world: World, topic: string, id: string, words: DistrictWords | null, taken = new Set<string>()): District | undefined {
  const t = world.content.topics.get(topic)
  const far = farPlaceOf(world, topic)
  const quarters = districtsOf(world.content, topic)
  const q = quarters.find((d) => d.id === id)
  if (!t || !far || !q) return undefined
  const first = quarters[0]!.id === id
  const stub = districtOf(world, topic, id)
  const entrance = first ? heartOf(world, topic)! : String(stub?.locations[0]?.['id'] ?? '')
  if (!entrance) return undefined
  const area = String(far.area['id'])
  const slug = `${area}_${id}`.replace(/[^a-z0-9_]/g, '')
  const locations: Record<string, unknown>[] = first ? [] : structuredClone(stub?.locations ?? [])
  const joins: Join[] = [...(stub?.joins ?? [])]
  const ways = new Ways(world, locations)
  const placed = new Map<string, string>()
  for (const p of (words?.places ?? []).slice(0, MOST_PLACES)) {
    const name = p.name?.trim()
    if (!name || name.length > 60 || /\n/.test(name) || !fitsRoom(p.description)) continue
    const near = (p.near && placed.get(p.near)) || entrance
    const wind = ways.free(near)
    if (!wind) continue
    const lid = freeId(world, `loc_${slug}_${p.key}`.toLowerCase().replace(/[^a-z0-9_]/g, ''), taken)
    placed.set(p.key, lid)
    locations.push({ id: lid, name, area, tags: ['public'], description: { day: p.description }, exits: { [OPPOSITE[wind]!]: { to: near, minutes: 3 } } })
    const inside = locations.find((l) => l['id'] === near)
    if (inside) inside['exits'] = { ...(inside['exits'] as Record<string, unknown>), [wind]: { to: lid, minutes: 3 } }
    else joins.push({ from: near, direction: wind, to: lid })
  }
  const trades = [...world.content.professions.keys()].sort()
  const names = new Set([...world.content.npcs.values()].map((n) => n.name))
  const rng = (lo: number, hi: number) => world.rng.int('growth', lo, hi)
  const npcs: Record<string, unknown>[] = []
  const person = (name: string, pronoun: 'she' | 'he', trade: string, at: string, looks: string, fact: string, speech?: string, secret?: { text: string; hint: string }) => {
    const firstName = name.split(' ')[0]!
    const job = world.content.professions.get(trade)?.name ?? trade
    npcs.push({
      id: freeId(world, `npc_${firstName}_${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, ''), taken),
      name,
      short: `${firstName} the ${job}`,
      pronoun,
      age: rng(20, 65),
      profession: trade,
      home: at,
      work: at,
      fame: 0,
      appearance: looks,
      personality: { warmth: rng(-1, 1), courage: rng(0, 1), honesty: rng(-1, 1), temper: rng(-1, 1), curiosity: rng(0, 2), diligence: rng(0, 2) },
      aliases: [firstName.toLowerCase(), job],
      public_facts: [fact],
      ...(speech ? { speech } : {}),
      ...(secret ? { secrets: [{ id: 'own_1', text: secret.text, hint: secret.hint, dc: 16, about: [] }] } : {}),
      money: 30,
      inventory: {},
      knows_areas: [area],
      // A portrait of their own when the player's switch makes pictures of new people (M10.26); a crowd stays plain.
    })
  }
  const people = (words?.people ?? []).slice(0, MOST_PEOPLE)
  // A secret for about one in three of them (M10.25), no more.
  let secretsLeft = Math.ceil(people.length / 3)
  for (const w of people) {
    const good = w.name && w.name.length < 40 && /^[A-Z][\p{L}'-]+(?: [\p{L}'-]+){0,2}$/u.test(w.name) && !names.has(w.name)
    if (!good || (w.pronoun !== 'she' && w.pronoun !== 'he')) continue
    names.add(w.name)
    const at = (w.at && placed.get(w.at)) || String(locations[0]?.['id'] ?? entrance)
    const trade = w.trade && world.content.professions.has(w.trade) ? w.trade : trades.includes('merchant') ? 'merchant' : trades[0]!
    const hid = w.secret && secretsLeft > 0 && secretFits(w.secret.text) && secretFits(w.secret.hint) ? { text: w.secret.text.trim(), hint: w.secret.hint.trim() } : undefined
    if (hid) secretsLeft--
    // Never an id in what the player reads of them (M10.29 M): such a line gives way to the template.
    const clean = (s: string | undefined, most: number) => (s && s.length < most && !idWordsIn(s).length ? s : undefined)
    person(w.name, w.pronoun, trade, at, clean(w.looks, 300) ?? `Someone of ${t.name}, busy with their own affairs.`, clean(w.fact, 200) ?? `${w.name.split(' ')[0]} lives in ${q.name} of ${t.name}.`, clean(w.speech, 200), hid)
  }
  // People named in talks who live in this town and are no people yet (M10.9) become people of its first district, two at most, as they were spoken of (M10.22).
  const sketched: Record<string, string> = {}
  if (first) {
    const trader = trades.includes('merchant') ? 'merchant' : trades[0]!
    for (const sk of (world.state.lore?.people ?? []).filter((x) => !x.npc && x.place === topic).slice(0, 2)) {
      const pid = freeId(world, `npc_${sk.name}_${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, ''), taken)
      const at = String(locations[0]?.['id'] ?? entrance)
      npcs.push(sketchNpc(world, sk, { id: pid, home: at, work: at, area, profession: sketchProfession(world, sk, trader) }))
      sketched[sk.id] = pid
    }
  }
  // Only what passed counts as the chronicler's; without any, another district gets one person who lives there, from the world's names.
  const theirs = placed.size > 0 || npcs.length > 0
  const pool = frameOf(world.content, world.content.topics.get(topic)?.land).names
  if (!theirs && !first && pool) {
    const pronoun: 'she' | 'he' = rng(0, 1) ? 'she' : 'he'
    const full = `${pool[pronoun][rng(0, pool[pronoun].length - 1)]} ${pool.family[rng(0, pool.family.length - 1)]}`
    if (!names.has(full)) person(full, pronoun, trades.includes('labourer') ? 'labourer' : trades[0]!, entrance, `Someone who has lived in ${q.name} all their life.`, `${full.split(' ')[0]} knows every door in ${q.name}.`)
  }
  // Seats of factions the world has, at a place the chronicler made here; never a new faction.
  const seats: NonNullable<District['seats']> = []
  for (const seat of (words?.seats ?? []).slice(0, MOST_SEATS)) {
    const at = placed.get(seat.at)
    const wants = typeof seat.wants === 'string' ? seat.wants.trim() : ''
    if (!at || !world.content.factions.has(seat.faction) || !wants || wants.length > 200 || seats.some((s) => s.faction === seat.faction)) continue
    seats.push({ faction: seat.faction, at, wants })
  }
  return { topic, id, by: theirs ? 'chronicler' : 'template', t: world.now, locations, npcs, joins, ...(Object.keys(sketched).length ? { sketches: sketched } : {}), ...(seats.length ? { seats } : {}) }
}

/** A stub: the street into a district not yet made, off the town's heart. */
function makeStub(world: World, topic: string, q: { id: string; name: string; line: string }, taken: Set<string>, ways: Ways): District | undefined {
  const far = farPlaceOf(world, topic)
  const heart = heartOf(world, topic)
  if (!far || !heart) return undefined
  const wind = ways.free(heart)
  if (!wind) return undefined
  const area = String(far.area['id'])
  const town = world.content.topics.get(topic)!.name
  const lid = freeId(world, `loc_${area}_${q.id}`.replace(/[^a-z0-9_]/g, ''), taken)
  const back = OPPOSITE[wind]!
  const line = q.line.trim().replace(/([^.!?])$/, '$1.')
  return {
    topic,
    id: q.id,
    by: 'stub',
    t: world.now,
    locations: [
      {
        id: lid,
        name: q.name.replace(/^the /, 'The '),
        area,
        tags: ['public'],
        aliases: [q.name.replace(/^the /, '')],
        description: { day: `You come into ${q.name} of ${town}. ${line} The street is full of people who know where they are going, and it smells of smoke and wet stone. The market is back ${back}.` },
        exits: { [back]: { to: heart, minutes: 5 } },
      },
    ],
    npcs: [],
    joins: [{ from: heart, direction: wind, to: lid }],
  }
}

/**
 * Makes a district playable, once, and fixes it in the savegame; the first
 * brings the streets to the others. Checked as content first: when the world
 * would not load with the chronicler's words, the template is tried.
 */
export function applyDistrict(world: World, topic: string, id: string, words: DistrictWords | null): District | undefined {
  const g = growth(world)
  const key = keyOf(topic, id)
  const had = g.districts?.[key]
  if (had && had.by !== 'stub') return had
  g.districtPending = (g.districtPending ?? []).filter((k) => k !== key)
  const quarters = districtsOf(world.content, topic)
  const first = quarters[0]?.id === id
  for (const attempt of words ? [words, null] : [null]) {
    const taken = new Set<string>()
    const made = makeDistrict(world, topic, id, attempt, taken)
    if (!made) return undefined
    const next: Record<string, District> = { ...(g.districts ?? {}), [key]: made }
    // The first district opens the streets to the others, off the market.
    if (first) {
      const ways = new Ways(world, [])
      for (const j of made.joins) ways.free(j.from) // the market's ways the district took
      for (const q of quarters.slice(1)) {
        if (next[keyOf(topic, q.id)]) continue
        const stub = makeStub(world, topic, q, taken, ways)
        if (stub) next[keyOf(topic, q.id)] = stub
      }
    }
    const state = { ...world.state, growth: { ...g, districts: next } }
    let content: Content
    try {
      // Checked on the whole game's content, as far places are.
      content = grownContent(world.base, state)
    } catch {
      continue
    }
    if (checkContent(content).length) continue
    g.districts = next
    world.regrow()
    for (const raw of made.npcs) {
      const n = world.content.npcs.get(String(raw['id']))
      if (n) world.state.npcs[n.id] ??= { ...newNpcState(n, world.now), location: n.work ?? n.home }
    }
    for (const [sketch, npc] of Object.entries(made.sketches ?? {})) {
      const named = sketchById(world, sketch)
      if (named) named.npc = npc
    }
    // The chronicler weaves the new people into the world (M10.22), once, when there is a model to do it.
    if (world.aiLive && made.npcs.length) (g.weavePending ??= []).push(key)
    const q = quarters.find((d) => d.id === id)!
    const town = world.content.topics.get(topic)?.name ?? topic
    // A change of the world, in the log and the chronicle; not news anyone tells, and no storyline (belang 0, no witnesses).
    recordFact(world, {
      kind: 'district',
      about: [topic],
      place: String(made.locations[0]?.['id'] ?? heartOf(world, topic)),
      belang: 0,
      witnesses: [],
      title: `${q.name} of ${town}`,
      text: { precise: `${q.name} of ${town}: ${q.line}`, village: `${town} has ${q.name}, they say.`, far: `${town} is a big place.` },
    })
    return made
  }
  return undefined
}

/**
 * The district due where the stranger is (M10.21): the first district of the
 * far town they are in, when they do something there; or the district whose
 * street they stand in, when they go there.
 */
export function districtDue(world: World, doing: boolean): { topic: string; id: string } | undefined {
  const here = world.state.player.location
  const topic = farTopicAt(world, here)
  if (!topic) return undefined
  const quarters = districtsOf(world.content, topic)
  if (!quarters.length) return undefined
  for (const d of Object.values(world.state.growth?.districts ?? {})) if (d.topic === topic && d.by === 'stub' && d.locations[0]?.['id'] === here) return { topic, id: d.id }
  const first = quarters[0]!
  if (doing && !districtOf(world, topic, first.id)) return { topic, id: first.id }
  return undefined
}

/**
 * A district wanted: made now from templates without a model, or waiting for
 * the chronicler, once. Above the player's threshold it asks first, as a
 * choice in the game (M10.21, asking.ts): go on, not now (no district for the
 * rest of the game day), or always. What to show: the question, or the line
 * while it waits.
 */
export function wantDistrict(world: World, topic: string, id: string): Output[] {
  const g = growth(world)
  const key = keyOf(topic, id)
  if ((g.districts?.[key] && g.districts[key]!.by !== 'stub') || g.districtPending?.includes(key)) return []
  if (!world.aiLive) {
    applyDistrict(world, topic, id, null)
    return []
  }
  const q = districtsOf(world.content, topic).find((d) => d.id === id)
  const town = world.content.topics.get(topic)?.name ?? topic
  const asked = q ? mustAsk(world, `district:${key}`, `Making ${q.name} of ${town} playable`, districtRequest(world, key), `district ${topic} ${id}`) : undefined
  if (asked && 'declined' in asked) return []
  if (asked) return askOutput(world, asked.ask)
  ;(g.districtPending ??= []).push(key)
  return q ? [{ kind: 'system', text: `The chronicler is working out ${q.name} of ${town}.` }] : []
}

/**
 * The request for the chronicler: the names and words of a district's places
 * and people, with the rules of the Places and People steps. The stable part
 * first (the frame, the voice, the rules), what this district is after it.
 */
export function districtRequest(world: World, key: string): LlmRequest {
  const [topic, id] = key.split(':') as [string, string]
  const t = world.content.topics.get(topic)!
  const quarters = districtsOf(world.content, topic)
  const q = quarters.find((d) => d.id === id)!
  const first = quarters[0]?.id === id
  const far = farPlaceOf(world, topic)!
  const known = [...far.locations, ...Object.values(world.state.growth?.districts ?? {}).filter((d) => d.topic === topic).flatMap((d) => d.locations)].map((l) => `${String(l['name'])}`)
  const stub = districtOf(world, topic, id)?.locations[0]
  const taken = [...new Set([...world.content.npcs.values()].map((n) => n.name))].sort()
  const trades = [...world.content.professions.values()].map((p) => `${p.id} (${p.name})`).join(', ')
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>, optional: string[] = []) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties).filter((k) => !optional.includes(k)), properties })
  return {
    role: 'chronicler',
    ...cachedSystem([
      // The frame of the land the town is in (M10.23).
      worldText([worldFrame(world.content, world.content.topics.get(topic)?.land), voiceSummary(world.content, world.content.topics.get(topic)?.land)].filter(Boolean).join('\n\n')),
      '',
      'You make one district of a far town playable in a text game: you name and describe its places and people. The shape is fixed by the game; you write the words. Never contradict what is known of the town; use no name that is TAKEN.',
      `PLACES: up to ${MOST_PLACES}, each with a key, a name, a description, and near: the key of the place it lies next to (or leave it out: next to the way in). A description has three to five sentences and at most seventy words, second person, present tense, one sense that is not sight, a hint at one way out rather than a list, and never opens with its own name. Plain words, in the tone of the world.`,
      `PEOPLE: up to ${MOST_PEOPLE}, each with a key, a full name that fits the town, she or he, what people see first (one sentence), how they speak (a few words), one thing anyone may know of them, a trade from TRADES, and at: the key of the place they live and work. For about one in three of them, a secret: what they hide (one sentence) and a hint someone watchful might notice (one sentence); for the rest, null.`,
      `SEATS: up to ${MOST_SEATS}, where one of the FACTIONS has a hall, a church or an office at one of your places (by the place's key), with what they want in this town (one sentence). Never a faction that is not listed: a new town brings no new factions.`,
      'JSON only.',
    ].join('\n'), '', '', 'none'),
    prompt: [
      `TOWN: ${t.name}. ${t.summary}`,
      `DISTRICT: ${q.name}. ${q.line}`,
      first ? 'This is where the stranger comes in: the gate, the market and the inn are there already; add what else stands around them.' : `The way in is ${String(stub?.['name'] ?? q.name)}, off the market.`,
      `KNOWN PLACES OF THE TOWN: ${known.join('; ')}`,
      `TRADES: ${trades}`,
      `FACTIONS: ${[...world.content.factions.values()].map((f) => `${f.id} (${f.name}: ${f.wants})`).join('; ')}`,
      `TAKEN: ${taken.join(', ')}`,
    ].join('\n'),
    schemaName: 'district',
    schema: object({
      places: { type: 'array', items: object({ key: text, name: text, description: text, near: text }, ['near']) },
      people: { type: 'array', items: object({ key: text, name: text, pronoun: text, looks: text, speech: text, fact: text, trade: text, at: text, secret: { anyOf: [object({ text, hint: text }), { type: 'null' }] } }, ['secret']) },
      seats: { type: 'array', items: object({ faction: text, at: text, wants: text }) },
    }),
    maxTokens: 3000,
    meta: { district: key, town: t.name, name: q.name, factions: [...world.content.factions.keys()].sort() },
  }
}

/** The chronicler's reply, or null when it cannot be read. */
export function districtWords(text: string): DistrictWords | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as DistrictWords
    return Array.isArray(v.places) && Array.isArray(v.people) ? v : null
  } catch {
    return null
  }
}
