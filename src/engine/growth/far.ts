import { frameOf, landOfArea } from '../lands'
import { AreaSchema, checkContent, lockedIds, LocationSchema, NpcSchema, type Content, type Direction } from '../content'
import type { LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { worldText } from '../safety'
import { SettlementSchema } from '../economy/schema'
import { recordFact } from '../news'
import { newNpcState, type GameState } from '../state'
import { outlineOf } from '../outlines'
import type { World } from '../world'
import { grownContent, growth } from './growth'
import { sketchById, sketchNpc, sketchPhrase, sketchProfession } from '../sketches'
import { voiceSummary } from '../dialogue/voice'

// A far place made playable (M9.1; design: lore and world change, "De wereld
// buiten de kaart", level 3). When the player sets off for a far place that
// has its outline, it becomes an area of its own in a layer of the savegame:
// places with descriptions, named people with a card, a market and an inn,
// and for a region that trades with ours a settlement with its own ledger,
// so the route from it keeps its id. The same schemas and the same checks as
// the content the designer writes; the editor could adopt it later. The
// chronicler words it when a model is there; without one a template does,
// from what the world book and the outline say.

const DAY = 24 * 60

/** A far place as the game made it playable: raw content, parsed and checked like any. */
export interface FarPlace {
  topic: string
  by: 'chronicler' | 'template'
  t: number
  area: Record<string, unknown>
  locations: Record<string, unknown>[]
  npcs: Record<string, unknown>[]
  settlement?: Record<string, unknown>
  /** The outland it was: it stays (its id is a key), and its settlement's ledger now stands behind the route. */
  outland?: string
  /**
   * The way in from the region: an exit from a place at its edge, and back.
   * By a passage only (M10.12, `by`): a place over the sea has no road; the
   * line that brought you is the way back, and there are no exits.
   */
  link: { from: string; direction: Direction; minutes: number; by?: string }
  /** People named in talks who live here (M10.9), and the person each became. */
  sketches?: Record<string, string>
}

/** How a far place is reached when no road leads there (M10.12): a passage from one of its stops. */
export interface FarVia {
  from: string
  minutes: number
  /** The passage. */
  by: string
  water: boolean
}

/** What the chronicler writes for it: names and words, never the shape. */
export interface FarWords {
  places: { key: string; name: string; description: string }[]
  people: { key: string; name: string; pronoun: 'she' | 'he'; looks: string; speech: string; fact: string }[]
}

const OPPOSITE: Record<string, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest' }

export function farPlaceOf(world: Pick<World, 'state'>, topic: string): FarPlace | undefined {
  return world.state.growth?.far?.[topic]
}

/** The layers of far places, for the content of a game. */
export function withFarPlaces(content: Content, state: GameState): Content {
  const far = Object.values(state.growth?.far ?? {})
  if (!far.length) return content
  const areas = new Map(content.areas)
  const locations = new Map(content.locations)
  const npcs = new Map(content.npcs)
  const settlements = new Map(content.settlements)
  for (const f of far.sort((a, b) => a.topic.localeCompare(b.topic))) {
    const area = AreaSchema.parse(f.area)
    areas.set(area.id, area)
    for (const raw of f.locations) {
      const l = LocationSchema.parse(raw)
      locations.set(l.id, l)
    }
    for (const raw of f.npcs) {
      const n = NpcSchema.parse(raw)
      if (!npcs.has(n.id)) npcs.set(n.id, n)
    }
    if (f.settlement) {
      const s = SettlementSchema.parse(f.settlement)
      settlements.set(s.id, s)
    }
    const from = locations.get(f.link.from)
    const gate = (f.locations[0] as { id: string }).id
    // A place reached by a passage only (M10.12) has no road from the region.
    if (from && !f.link.by) locations.set(from.id, { ...from, exits: { ...from.exits, [f.link.direction]: { to: gate, minutes: f.link.minutes } } })
  }
  return { ...content, areas, locations, npcs, settlements }
}

/**
 * The place at the edge of the region the road leaves from, and the way from
 * it: where the trade of the far place comes in (its toll gate, or an edge of
 * the settlement it trades with), or else the edge nearest to it.
 */
function edgeTowards(world: World, pos: readonly [number, number], outland?: string): { from: string; direction: Direction; km: number } | undefined {
  // A place at the edge lies where it says, or where its area does (M10.21: Oude Zijl's sluice has no pos of its own, and the road to Graafhaven left from the Blackmere).
  const at = (l: { pos?: readonly [number, number]; area: string }) => l.pos ?? world.content.areas.get(l.area)?.pos
  const edges = [...world.content.locations.values()].filter((l) => l.tags.includes('edge') && at(l)).sort((a, b) => a.id.localeCompare(b.id))
  const routes = [...world.content.routes.values()].filter((r) => outland && r.from === outland)
  const trade = edges.filter((l) => routes.some((r) => r.toll?.at === l.id || r.to === l.area))
  const near = (trade.length ? trade : edges).sort((a, b) => Math.hypot(at(a)![0] - pos[0], at(a)![1] - pos[1]) - Math.hypot(at(b)![0] - pos[0], at(b)![1] - pos[1]))
  for (const edge of near) {
    const dx = pos[0] - at(edge)![0]
    const dy = pos[1] - at(edge)![1]
    // The map's y runs north (Stavermouth, north of the Holleveen, has the larger y); found in the M10.25 region play,
    // where a region charted south had its road leave the edge northwards and its gate send the stranger back south.
    const angle = (Math.atan2(dx, dy) * 180) / Math.PI
    const winds: Direction[] = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
    const first = Math.round(((angle + 360) % 360) / 45) % 8
    // The nearest wind the edge has free; a gate that has its east way open takes it.
    for (const step of [0, 1, -1, 2, -2]) {
      const direction = winds[(first + step + 8) % 8]!
      if (!edge.exits[direction]) return { from: edge.id, direction, km: Math.hypot(dx, dy) }
    }
  }
  return undefined
}

/** Ids for what the game makes: never one the world has, or ever had. */
export function freeId(world: World, stem: string, taken: Set<string>): string {
  const locked = lockedIds(world.base)
  const used = (id: string) => taken.has(id) || locked.has(id) || world.content.locations.has(id) || world.content.npcs.has(id) || world.content.areas.has(id)
  let id = stem
  for (let n = 2; used(id); n++) id = `${stem}_${n}`
  taken.add(id)
  return id
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length

/** A description as the content rules want it: three to five sentences, in the second person. */
export function fitsRoom(text: string | undefined): text is string {
  return Boolean(text && sentences(text) >= 3 && sentences(text) <= 5 && /\byou\b/i.test(text) && text.length < 900)
}

/**
 * The far place, made: the template's shape, with the chronicler's words
 * where they pass. Undefined when the world has nothing to make it from.
 */
export function makeFarPlace(world: World, topic: string, words: FarWords | null, via?: FarVia): FarPlace | undefined {
  const t = world.content.topics.get(topic)
  if (!t) return undefined
  const outland = [...world.content.outlands.values()].find((o) => (o.topic ?? o.id) === topic)
  // The road from the edge of the region; or, for a place only a passage reaches (M10.12: a ferry over the sea), the stop it leaves from.
  const road = t.pos ? edgeTowards(world, t.pos, outland?.id) : undefined
  const edge = road ?? (via ? { from: via.from, direction: 'out' as Direction, km: (via.minutes / DAY) * 35 } : undefined)
  if (!edge) return undefined
  const outline = outlineOf(world, topic)
  // Names of the land it lies in (M10.23).
  const names = frameOf(world.content, t.land).names
  const taken = new Set<string>()
  const areaId = outland?.id ?? (world.content.areas.has(topic) ? freeId(world, topic, taken) : topic)
  const slug = areaId.replace(/^area_/, '')
  const ids = { gate: freeId(world, `loc_${slug}_gate`, taken), market: freeId(world, `loc_${slug}_market`, taken), inn: freeId(world, `loc_${slug}_inn`, taken) }
  const days = Math.max(1, Math.round(edge.km / 35))
  const back = OPPOSITE[edge.direction] ?? 'out'
  const region = world.words.region
  const name = t.name
  const word = (key: string) => words?.places.find((p) => p.key === key)
  const room = (key: string, fallback: string) => (fitsRoom(word(key)?.description) ? word(key)!.description : fallback)
  const title = (key: string, fallback: string) => {
    const n = word(key)?.name?.trim()
    return n && n.length < 60 && !/\n/.test(n) ? n : fallback
  }
  const sends = outland?.sends ?? []
  const asks = outland?.asks ?? []
  const itemName = (id: string) => world.content.items.get(id)?.plural ?? world.content.items.get(id)?.name ?? id
  const wares = sends.length ? sends.slice(0, 3).map(itemName).join(', ') : 'cloth, salt and pots'
  // Over the sea (M10.12): a quay instead of a gate, and no road back, only the passage.
  const sea = !road && via?.water
  const locations = [
    {
      id: ids.gate,
      name: title('gate', sea ? `The Quay of ${name}` : `The Gate of ${name}`),
      area: areaId,
      tags: ['public', 'edge'],
      aliases: sea ? ['quay', 'harbour'] : ['gate'],
      description: {
        day: sea
          ? room('gate', `You step ashore on the quay of ${name} after ${days === 1 ? 'a day' : `${days} days`} at sea. The quay is crowded with barrels and nets, and the air smells of tar, fish and wet stone. Gulls scream over the masts, and the dockhands call out to each other in a quick, flat speech. The market lies ahead, and the ships leave from here.`)
          : room('gate', `You come to the gate of ${name} after ${days === 1 ? 'a day' : `${days} days`} on the road from ${region}. The walls are higher than any you have seen at home, and the air smells of tar, smoke and wet stone. Carts stand in line to be let in, and the gatekeepers call out to each other in a quick, flat speech. The market lies ahead, and the road back to ${region} runs ${back}.`),
      },
      exits: road ? { [back]: { to: edge.from, minutes: days * DAY }, in: { to: ids.market, minutes: 3 } } : { in: { to: ids.market, minutes: 3 } },
    },
    {
      id: ids.market,
      name: title('market', `The Market of ${name}`),
      area: areaId,
      tags: ['public', 'social', 'market'],
      aliases: ['market'],
      description: {
        day: room('market', `You stand in the market of ${name}, among stalls of ${wares}. Traders shout their prices over each other, and you smell pitch and hot fat from the cookshops. Nobody here has heard of ${region} or cares what happens there. An inn stands at the corner, and the gate is back out.`),
      },
      exits: { out: { to: ids.gate, minutes: 3 }, in: { to: ids.inn, minutes: 1 } },
      services: [
        {
          id: `${slug}_goods`,
          provider: '',
          hours: '07-18',
          sells: Object.fromEntries(sends.map((i) => [i, { stock: 10, target: 20 }])),
          buys: asks,
          supply: sends.map((i) => ({ item: i, amount: 10, every: 'day', at: 7 })),
        },
      ],
    },
    {
      id: ids.inn,
      name: title('inn', `The Carters' Inn`),
      area: areaId,
      tags: ['public', 'social', 'inn'],
      aliases: ['inn'],
      description: {
        day: room('inn', `You duck into a low inn where carters from half the land sit over their beer. It is warm in here, and loud, and it smells of wet wool and onions. The innkeeper keeps an eye on the door and another on the purses. The market is back out.`),
      },
      exits: { out: { to: ids.market, minutes: 1 } },
      services: [{ id: `${slug}_inn`, provider: '', hours: '06-23', lodging: 12, sells: {} }],
    },
  ]
  // Two people with a card: who sells and who keeps the inn.
  const rng = (lo: number, hi: number) => world.rng.int('growth', lo, hi)
  const person = (key: 'merchant' | 'innkeeper', profession: string, home: string, work: string) => {
    const w = words?.people.find((p) => p.key === key)
    const pronoun: 'she' | 'he' = w?.pronoun === 'she' || w?.pronoun === 'he' ? w.pronoun : rng(0, 1) ? 'she' : 'he'
    const pool = names ? names[pronoun] : ['Anna', 'Jan']
    const family = names ? names.family : ['Smit']
    const given = w?.name?.split(' ')[0]?.trim()
    const good = w?.name && w.name.length < 40 && /^[A-Z][\p{L}'-]+(?: [\p{L}'-]+){0,2}$/u.test(w.name) && ![...world.content.npcs.values()].some((n) => n.name === w.name)
    const fullName = good ? w!.name : `${pool[rng(0, pool.length - 1)]} ${family[rng(0, family.length - 1)]}`
    const first = good && given ? given : fullName.split(' ')[0]!
    const id = freeId(world, `npc_${first}_${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, ''), taken)
    const job = world.content.professions.get(profession)?.name ?? profession
    return {
      id,
      name: fullName,
      short: `${first} the ${job}`,
      pronoun,
      age: rng(30, 60),
      profession,
      home,
      work,
      fame: 0,
      appearance: w?.looks && w.looks.length < 300 ? w.looks : `A ${pronoun === 'she' ? 'woman' : 'man'} of ${name} with quick eyes and ink on the fingers.`,
      personality: { warmth: rng(-1, 1), courage: rng(0, 1), honesty: rng(-1, 1), temper: rng(-1, 1), curiosity: rng(0, 2), diligence: rng(1, 2) },
      aliases: [first.toLowerCase(), job],
      public_facts: [w?.fact && w.fact.length < 200 ? w.fact : `${first} has kept ${key === 'innkeeper' ? 'the inn' : 'a stall'} in ${name} for years.`],
      ...(w?.speech && w.speech.length < 200 ? { speech: w.speech } : {}),
      money: 60,
      inventory: {},
      knows_areas: [areaId],
      // A portrait of their own when the player's switch makes pictures of new people (M10.26); a crowd stays plain.
      ...(outland?.faith ? { faith: outland.faith } : {}),
    }
  }
  // A trade the world has (M10.12: Skerrow has no merchants of its own): a merchant, a pedlar, an innkeeper, or any.
  const trader = ['merchant', 'pedlar', 'innkeeper'].find((p) => world.content.professions.has(p)) ?? [...world.content.professions.keys()].sort()[0] ?? 'merchant'
  const merchant = person('merchant', trader, ids.inn, ids.market)
  const keeper = person('innkeeper', world.content.professions.has('innkeeper') ? 'innkeeper' : trader, ids.inn, ids.inn)
  // People named in talks who live here (M10.9), two at most: now they are people, with the bond the talk gave.
  const named = namedAt(world, topic)
  const sketched = named.map((sk) =>
    sketchNpc(world, sk, { id: freeId(world, `npc_${sk.name}_${slug}`.toLowerCase().replace(/[^a-z0-9_]/g, ''), taken), home: ids.inn, work: ids.market, area: areaId, profession: sketchProfession(world, sk, trader) }, words?.people.find((p) => p.key === sk.id)),
  )
  locations[1]!.services![0]!.provider = merchant.id
  locations[2]!.services![0]!.provider = keeper.id
  const settlement = outland
    ? {
        id: areaId,
        tags: ['trade_town'],
        people: 600,
        use: Object.fromEntries(asks.map((i) => [i, 2])),
        keep: { ...Object.fromEntries(sends.map((i) => [i, 60])), ...Object.fromEntries(asks.map((i) => [i, 20])) },
        workshops: sends.length ? [{ id: `${slug}_trades`, name: `the workshops of ${name}`, at: ids.market, makes: Object.fromEntries(sends.map((i) => [i, 30])), workers: 12 }] : [],
        income: 300,
      }
    : undefined
  return {
    topic,
    by: words ? 'chronicler' : 'template',
    t: world.now,
    // A far place of another land (M10.23) is of that land, and where the stranger comes into it from elsewhere, a border.
    area: { id: areaId, name, kind: 'town', aliases: t.aliases, summary: outline?.summary ?? t.summary, fame: t.fame, pos: t.pos, topic, ...(t.land ? { land: t.land, border: landOfArea(world.content, world.location(edge.from).area)?.id !== t.land } : {}) },
    locations,
    npcs: [merchant, keeper, ...sketched],
    ...(named.length ? { sketches: Object.fromEntries(named.map((sk, i) => [sk.id, String(sketched[i]!['id'])])) } : {}),
    ...(settlement ? { settlement } : {}),
    ...(outland ? { outland: outland.id } : {}),
    link: { from: edge.from, direction: edge.direction, minutes: days * DAY, ...(road || !via ? {} : { by: via.by }) },
  }
}

/**
 * Makes a far place playable, once, and fixes it in the savegame. It is
 * checked as content first: when the world would not load with it, it is not
 * made (and a template is tried when the chronicler's words were the trouble).
 */
export function applyFarPlace(world: World, topic: string, words: FarWords | null, via?: FarVia): FarPlace | undefined {
  const g = growth(world)
  if (g.far?.[topic]) return g.far[topic]
  g.farPending = (g.farPending ?? []).filter((p) => p !== topic)
  // A place a passage reaches (M10.12) remembers how, for when the chronicler's words come later.
  const how = via ?? g.farVia?.[topic]
  for (const attempt of words ? [words, null] : [null]) {
    const made = makeFarPlace(world, topic, attempt, how)
    if (!made) return undefined
    const state = { ...world.state, growth: { ...g, far: { ...(g.far ?? {}), [topic]: made } } }
    let next: Content
    try {
      // Checked on the whole game's content (M10.21: a far place a round at the edge charted is in no base).
      next = grownContent(world.base, state)
    } catch {
      continue
    }
    if (checkContent(next).length) continue
    ;(g.far ??= {})[topic] = made
    world.regrow()
    for (const raw of made.npcs) {
      const n = world.content.npcs.get(String(raw['id']))!
      world.state.npcs[n.id] ??= { ...newNpcState(n, world.now), location: n.work ?? n.home }
    }
    for (const [sketch, npc] of Object.entries(made.sketches ?? {})) {
      const named = sketchById(world, sketch)
      if (named) named.npc = npc
    }
    const to = world.content.topics.get(topic)?.name ?? topic
    recordFact(world, {
      kind: 'far_place',
      about: [topic],
      place: made.link.from,
      belang: 1,
      title: made.link.by ? `the passage to ${to}` : `the road to ${to}`,
      text: made.link.by
        ? { precise: `From ${world.location(made.link.from).name} you can sail to ${to}.`, village: `There are ships to ${to} from here, they say.`, far: `Ships sail to ${to}.` }
        : { precise: `The road from ${world.location(made.link.from).name} runs on to ${to}.`, village: `You can walk to ${to} from here, they say.`, far: `There is a road to ${to}.` },
    })
    return made
  }
  return undefined
}

/** People named in talks who live at a far place and are no people yet (M10.9): two at most, oldest first. */
function namedAt(world: World, topic: string) {
  return (world.state.lore?.people ?? []).filter((sk) => !sk.npc && sk.place === topic).slice(0, 2)
}

/**
 * A far place the player sets off for: made playable now, from its templates,
 * with a model or without (M10.21: passing through costs nothing; the
 * chronicler works a place out only when the stranger stays or talks there,
 * and the district comes when they do something). A save from before, with
 * a place still waiting for the chronicler's words, keeps waiting.
 */
export function wantFarPlace(world: World, topic: string, via?: FarVia): void {
  const g = growth(world)
  if (g.far?.[topic] || g.farPending?.includes(topic)) return
  if (via) (g.farVia ??= {})[topic] = via
  applyFarPlace(world, topic, null, via)
}

/** The far place a location belongs to, by the topic it was made for (M10.21). */
export function farTopicAt(world: Pick<World, 'state' | 'content'>, location: string): string | undefined {
  const area = world.content.locations.get(location)?.area
  if (!area) return undefined
  return Object.entries(world.state.growth?.far ?? {}).find(([, far]) => String(far.area['id']) === area)?.[0]
}

/** The request for the chronicler: the names and words of the places and people, in the tone of the world. */
export function farRequest(world: World, topic: string): LlmRequest {
  const t = world.content.topics.get(topic)!
  const outline = outlineOf(world, topic)
  const taken = [...new Set([...world.content.npcs.values()].map((n) => n.name))].sort()
  const sketches = namedAt(world, topic)
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  return {
    role: 'chronicler',
    system: [
      // The world's voice (M10.10): the people of the far place talk like the world.
      // In another land, its frame and voice (M10.23).
      worldText([worldFrame(world.content, t.land), voiceSummary(world.content, t.land)].filter(Boolean).join('\n\n')),
      '',
      'You make a far place playable in a text game: you name and describe three places and two people. The shape is fixed; you write the words.',
      'Places: gate (where the road comes in, or the quay where the ship comes in when it lies over the sea), market, inn. Each description: three to five sentences, second person, present tense, one sense that is not sight, and a hint at a way out. Plain words, late-medieval, the tone of the world.',
      'People: merchant (sells at the market), innkeeper. A full name that fits the place, she or he, what people see first (one sentence), how they speak (a few words), one thing anyone may know of them.',
      'Never contradict what is KNOWN. Never use a TAKEN name. JSON only.',
    ].join('\n'),
    prompt: [
      `PLACE: ${t.name}. ${t.summary}`,
      'KNOWN:',
      ...(outline ? [outline.summary, ...outline.places.map((p) => `${p.name}: ${p.text}`), ...outline.people.map((p) => `${p.role}: ${p.text}`)] : []),
      // People named in talks who live here (M10.9): the chronicler makes them people too, as they were spoken of.
      ...(sketches.length ? ['NAMED (people spoken of in talks who live here; a person each too, key the id, the same first name and a family name, as they were spoken of):', ...sketches.map((sk) => `  ${sk.id}: ${sk.name}, ${sketchPhrase(world, sk)}. "${sk.line}"`)] : []),
      `TAKEN: ${taken.join(', ')}`,
    ].join('\n'),
    schemaName: 'far_place',
    schema: object({
      places: { type: 'array', items: object({ key: text, name: text, description: text }) },
      people: { type: 'array', items: object({ key: text, name: text, pronoun: text, looks: text, speech: text, fact: text }) },
    }),
    maxTokens: 1600,
    meta: { far: topic, name: t.name, ...(sketches.length ? { named: sketches.map((sk) => ({ key: sk.id, name: sk.name, pronoun: sk.pronoun })) } : {}) },
  }
}

/** The chronicler's reply, or null when it cannot be read. */
export function farWords(text: string): FarWords | null {
  try {
    const v = JSON.parse(text) as FarWords
    return Array.isArray(v.places) && Array.isArray(v.people) ? v : null
  } catch {
    return null
  }
}
