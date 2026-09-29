import { askOutput, mustAsk } from '../asking'
import type { Output } from '../commands'
import { offer } from '../choice'
import { checkContent, LandSchema, lockedIds, TopicSchema, type Content } from '../content'
import { PassageSchema } from '../map/passageSchema'
import { cachedSystem, type LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { voiceSummary } from '../dialogue/voice'
import { recordFact } from '../news'
import { withoutReference } from '../quests/reference'
import { crossesLimits, readsAsInstruction, worldGuide, worldText } from '../safety'
import type { GameState } from '../state'
import type { World } from '../world'
import { growth } from './growth'

// The world book grows at its edge (M10.21; Bram, 28 September 2026: the
// chronicler must be able to widen the world book when the stranger runs
// into its borders, with a say for whoever wants one). Canon, but not
// closed. Where the stranger walks off the last edge of the map with nothing
// known beyond it, and chooses to go on, the chronicler charts one new
// region or one new land that way: from what the world book already
// suggests (its neighbours, routes, realms, tales from afar), within the
// frame that stands. One call writes its outline: a far place with its
// quarters, and for a land its frame; the layers of M10.21 make it playable
// when the stranger goes there. The play mode (M10.24) gives the say:
// continue charts it, think puts two outlines to the player, direct makes it
// a proposal. Without a model the edge stays the edge.

export type Wind = 'north' | 'east' | 'south' | 'west'
const WIND_STEP: Record<Wind, readonly [number, number]> = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] }
/** Some 35 km a day on foot, as a far place's road is laid out (far.ts). */
const KM_PER_DAY = 35

/** Where the stranger pushed at the edge. */
export interface ExpansionAsk {
  key: string
  wind: Wind
  /** Where they stood, in km on the map of the land. */
  from: readonly [number, number]
  /** The region whose edge it is. */
  region: string
  /** Asked at a harbour (M10.21: what lies beyond the sea): a boat from there goes to what is charted. */
  by?: { from: string }
  t: number
}

/** What the chronicler charts: one region or one land. */
export interface ExpansionOutline {
  id: string
  name: string
  kind: 'region' | 'land'
  summary: string
  details: string
  story?: string
  days: number
  districts: { id: string; name: string; line: string }[]
  land?: { frame: string; crossing?: string }
  /** How it came about, in a sentence: what of the world book it grows from. */
  why: string
}

export interface ExpansionReply {
  outlines: ExpansionOutline[]
}

/** What the rounds charted in this game, by key, and what waits. */
export interface ExpansionsState {
  made: Record<string, { ask: ExpansionAsk; outline: ExpansionOutline; t: number }>
  pending: ExpansionAsk[]
  /** Two outlines waiting for the player's choice (think). */
  choice?: { ask: ExpansionAsk; outlines: ExpansionOutline[] }
}

function expansions(world: World): ExpansionsState {
  const g = growth(world)
  return (g.expansions ??= { made: {}, pending: [] })
}

/**
 * The stranger chooses to go on into the unknown at an edge of the map: one
 * round, when a model is connected and none is waiting (asked first above the
 * player's threshold, M10.21).
 */
export function wantExpansion(world: World, ask: Omit<ExpansionAsk, 'key' | 't'>): Output[] {
  if (!world.aiLive) return [{ kind: 'text', text: 'You go on a little way, and the land gives you nothing to go on: nobody has told you what lies there, and you turn back.' }]
  const e = expansions(world)
  if (e.pending.length || e.choice) return [{ kind: 'text', text: 'You stand at the edge and look out, and wonder. What lies that way is still taking shape in your mind.' }]
  const full: ExpansionAsk = { ...ask, key: `${ask.region}:${ask.wind}:${Math.round(world.now / 60)}`, t: world.now }
  const asked = mustAsk(world, `expansion:${ask.region}:${ask.wind}`, `Charting what lies ${ask.wind} of ${world.content.regions.get(ask.region)?.name ?? ask.region}`, expansionRequest(world, full), `explore ${ask.wind}`)
  if (asked && 'declined' in asked) return []
  if (asked) return askOutput(world, asked.ask)
  e.pending.push(full)
  return [{ kind: 'system', text: `The chronicler is working out what lies ${ask.wind}.` }]
}

/** How many outlines a round asks for: two to choose from in think mode, one otherwise. */
function outlinesWanted(world: World): number {
  return world.state.playMode === 'think' ? 2 : 1
}

/**
 * The request for the chronicler: the frame and the voice first (stable),
 * then what the world book knows at this edge (its places, lands and realms)
 * and where the stranger stands, and the shape of the outline.
 */
export function expansionRequest(world: World, ask: ExpansionAsk): LlmRequest {
  const content = world.content
  const count = outlinesWanted(world)
  const places = [...content.topics.values()].filter((t) => t.kind === 'place' && t.pos).map((t) => `${t.name} (${t.pos![0]}, ${t.pos![1]} km): ${t.summary}`)
  const lands = [...content.lands.values()].map((l) => `${l.name}${l.realm ? `, ${content.realms.get(l.realm)?.name ?? l.realm}` : ''}`)
  const realms = [...content.realms.values()].map((r) => `${r.name}: ruled by ${r.ruler}, capital ${r.capital}`)
  const far = [...content.topics.values()].filter((t) => t.kind === 'lore' && /far|beyond|across|over the sea|east|west|north|south/i.test(`${t.summary} ${t.details ?? ''}`)).slice(0, 6).map((t) => `${t.name}: ${t.summary}`)
  const taken = [...new Set([...content.topics.values()].map((t) => t.name).concat([...content.areas.values()].map((a) => a.name)))].sort()
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>, optional: string[] = []) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties).filter((k) => !optional.includes(k)), properties })
  return {
    role: 'chronicler',
    ...cachedSystem([
      ...(content.chronicler ? [worldGuide(withoutReference(content.chronicler)), ''] : []),
      worldText([worldFrame(content), voiceSummary(content)].filter(Boolean).join('\n\n')),
      '',
      'The stranger has walked to the edge of what the world book knows and wants to go on. You chart what lies that way: one new region, or one new land with a frame of its own. Grow it from what the world book already suggests (its neighbours, routes, realms, tensions and tales from afar); never contradict it, and never change the frame: no new genre, no magic or thing the frame does not allow, nothing of our world.',
      'Each outline: id (small letters, digits, _), name (not TAKEN), kind (region: part of the lands known; land: a land with a frame of its own), summary (what people would know, one sentence), details (two or three sentences), story (a tale told of it, or empty), days (on foot from the edge, 1 to 6), districts (two to four quarters, each id, name and a line: the first is where the stranger comes in), land (only for kind land: frame, three to six lines in the frame\'s own form, WORLD left out, with LAND, REGION and PEOPLE; and crossing: one sentence of what the stranger notices coming in), and why: in one sentence, what of the world book it grows from.',
      count > 1 ? `Give ${count} outlines that differ in kind or character, so the stranger has a real choice.` : 'Give one outline.',
      'Plain words, in the tone of the world. JSON only.',
    ].join('\n')),
    prompt: [
      ask.by
        ? `THE HARBOUR: ${content.locations.get(ask.by.from)?.name ?? ask.by.from}, looking out to sea ${ask.wind}, at ${Math.round(ask.from[0])}, ${Math.round(ask.from[1])} km: chart what lies across the water that way.`
        : `THE EDGE: ${ask.wind} of ${content.regions.get(ask.region)?.name ?? ask.region}, at ${Math.round(ask.from[0])}, ${Math.round(ask.from[1])} km.`,
      ...(places.length ? ['KNOWN PLACES:', ...places.map((p) => `  ${p}`)] : []),
      ...(lands.length ? [`OTHER LANDS: ${lands.join('; ')}`] : []),
      ...(realms.length ? ['REALMS:', ...realms.map((r) => `  ${r}`)] : []),
      ...(far.length ? ['TALES FROM AFAR:', ...far.map((f) => `  ${f}`)] : []),
      `TAKEN: ${taken.join(', ')}`,
    ].join('\n'),
    schemaName: 'expansion',
    schema: object({
      outlines: {
        type: 'array',
        items: object(
          {
            id: text,
            name: text,
            kind: { type: 'string', enum: ['region', 'land'] },
            summary: text,
            details: text,
            story: text,
            days: { type: 'integer' },
            districts: { type: 'array', items: object({ id: text, name: text, line: text }) },
            land: object({ frame: text, crossing: text }, ['crossing']),
            why: text,
          },
          ['story', 'land'],
        ),
      },
    }),
    maxTokens: 1800,
    meta: { expansion: ask.key, wind: ask.wind, count },
  }
}

/** The chronicler's reply, or null when it cannot be read. */
export function expansionReply(text: string): ExpansionReply | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as ExpansionReply
    return Array.isArray(v?.outlines) ? v : null
  } catch {
    return null
  }
}

/** The world's WORLD block of its frame, to stand before a new land's own lines. */
function worldPart(content: Content): string {
  const frame = worldFrame(content)
  const lines = frame.split('\n')
  const end = lines.findIndex((l, i) => i > 0 && /^(REGION|LAND|PEOPLE)\b/.test(l))
  return (end > 0 ? lines.slice(0, end) : lines.slice(0, 1)).join('\n')
}

/** Whether an outline may stand in this world: free ids and names, sound words, in bounds. */
function sound(world: World, o: ExpansionOutline): string | undefined {
  const content = world.content
  const locked = lockedIds(world.base)
  const id = /^[a-z0-9_]{3,40}$/
  if (!o || typeof o !== 'object' || !id.test(String(o.id))) return 'no id'
  if (content.topics.has(o.id) || content.areas.has(o.id) || content.lands.has(o.id) || locked.has(o.id)) return `the id ${o.id} is taken`
  const names = new Set([...content.topics.values()].map((t) => t.name.toLowerCase()).concat([...content.areas.values()].map((a) => a.name.toLowerCase())))
  if (!o.name?.trim() || names.has(o.name.trim().toLowerCase())) return `the name ${o.name} is taken`
  if (!Number.isInteger(o.days) || o.days < 1 || o.days > 6) return 'days out of bounds'
  if (!Array.isArray(o.districts) || o.districts.length < 2 || o.districts.length > 4 || o.districts.some((d) => !id.test(String(d?.id)) || !d.name?.trim() || !d.line?.trim())) return 'districts out of bounds'
  if (o.kind === 'land' && !o.land?.frame?.trim()) return 'a land without a frame'
  const texts = [o.summary, o.details, o.story ?? '', o.why, ...o.districts.map((d) => d.line), o.land?.frame ?? '', o.land?.crossing ?? ''].filter(Boolean)
  for (const t of texts) {
    if (t.length > 900) return 'a text too long'
    if (crossesLimits(t)) return 'crosses the hard limits'
    if (readsAsInstruction(t)) return 'reads like an instruction to a model'
  }
  return undefined
}

/** The outlines of an answer that may stand, as many as the mode wants. */
export function soundOutlines(world: World, reply: ExpansionReply | null): ExpansionOutline[] {
  return (reply?.outlines ?? []).filter((o) => !sound(world, o)).slice(0, outlinesWanted(world))
}

/** A round done without charting (direct: it waits as a proposal): no longer pending. */
export function unpend(world: World, key: string): void {
  const e = expansions(world)
  e.pending = e.pending.filter((p) => p.key !== key)
}

/**
 * The round's answer, by the play mode: in continue the first sound outline
 * is charted at once; in think two wait for the player's choice; direct makes
 * it a proposal (modes.ts calls applyExpansion when accepted).
 */
export function settleExpansion(world: World, ask: ExpansionAsk, reply: ExpansionReply | null): void {
  const e = expansions(world)
  e.pending = e.pending.filter((p) => p.key !== ask.key)
  const outlines = (reply?.outlines ?? []).filter((o) => !sound(world, o)).slice(0, outlinesWanted(world))
  if (!outlines.length) {
    world.notices.push('Nobody can tell you more of what lies that way, and the edge stays the edge for now.')
    return
  }
  if (world.state.playMode === 'think' && outlines.length > 1) {
    e.choice = { ask, outlines }
    return
  }
  applyExpansion(world, ask, outlines[0]!)
}

/** The choice in think mode, put to the player at their next step: two outlines, or neither. */
export function expansionChoice(world: World): Output[] {
  const c = world.state.growth?.expansions?.choice
  if (!c || world.state.choice || world.state.talk || world.state.combat) return []
  return offer(world, `Two things are said of what lies ${c.ask.wind}. Which will you believe, and go looking for?`, [
    ...c.outlines.map((o) => ({ label: `${o.name}: ${o.summary}`, command: `chart ${o.id}` })),
    { label: 'Neither: the edge can stay the edge', command: 'chart none' },
  ])
}

/** The player's choice (CHART <id> / CHART NONE). */
export function chartChoice(world: World, id: string): Output[] {
  const e = world.state.growth?.expansions
  const c = e?.choice
  if (!e || !c) return [{ kind: 'error', text: 'There is nothing to choose between just now.' }]
  e.choice = undefined
  const o = c.outlines.find((x) => x.id === id)
  if (!o) return [{ kind: 'text', text: 'You let it be. The edge stays the edge.' }]
  return applyExpansion(world, c.ask, o) ? [] : [{ kind: 'text', text: 'It will not come clear after all.' }]
}

/**
 * Charts an outline (M10.21): a far place with its quarters that way, and for
 * a land its frame; kept in the save, known to the stranger, in the chronicle
 * with how it came about, and canon for every round after.
 */
export function applyExpansion(world: World, ask: ExpansionAsk, outline: ExpansionOutline): boolean {
  if (sound(world, outline)) return false
  const e = expansions(world)
  e.made[outline.id] = { ask, outline: { ...outline, districts: outline.districts.map((d) => ({ id: d.id, name: d.name.trim(), line: d.line.trim() })) }, t: world.now }
  world.regrow()
  if (!world.content.topics.has(outline.id) || checkContent(world.content).length) {
    delete e.made[outline.id]
    world.regrow()
    return false
  }
  ;(world.state.player.journal ??= {})[outline.id] = world.now
  recordFact(world, { kind: 'expansion', about: [], place: world.state.player.location, belang: 0, witnesses: [], title: `${outline.name} charted`, text: { precise: `${outline.name}: ${outline.why}`, village: '', far: '' } })
  world.notices.push(ask.by ? `What lies across the water ${ask.wind}, as the skippers tell it: ${outline.name}. ${outline.summary} A boat goes there from ${world.content.locations.get(ask.by.from)?.name ?? 'the harbour'}.` : `What lies ${ask.wind}, as far as you can make out: ${outline.name}. ${outline.summary} Head ${ask.wind} at the edge to go on.`)
  return true
}

/** The content with what the rounds charted in this game (M10.21): far places, new lands with their frames, and a boat from the harbour. */
export function withExpansions(content: Content, state: GameState): Content {
  const made = state.growth?.expansions?.made
  if (!made || !Object.keys(made).length) return content
  const topics = new Map(content.topics)
  const lands = new Map(content.lands)
  const passages = new Map(content.passages)
  for (const { ask, outline } of Object.values(made)) {
    const [dx, dy] = WIND_STEP[ask.wind]
    const km = outline.days * KM_PER_DAY
    const pos: [number, number] = [Math.round(ask.from[0] + dx * km), Math.round(ask.from[1] + dy * km)]
    if (outline.kind === 'land' && outline.land && !lands.has(outline.id)) {
      const land = LandSchema.safeParse({ id: outline.id, name: outline.name, frame: `${worldPart(content)}\n${outline.land.frame.trim()}`, ...(outline.land.crossing ? { crossing: outline.land.crossing } : {}) })
      if (land.success) lands.set(outline.id, land.data)
    }
    if (topics.has(outline.id)) continue
    const topic = TopicSchema.safeParse({
      id: outline.id,
      name: outline.name,
      kind: 'place',
      summary: outline.summary,
      details: outline.details,
      ...(outline.story ? { story: outline.story } : {}),
      pos,
      fame: 1,
      districts: outline.districts,
      ...(outline.kind === 'land' && lands.has(outline.id) ? { land: outline.id } : {}),
    })
    if (topic.success) topics.set(outline.id, topic.data)
    // Charted from a harbour: a skipper who knows the way takes the stranger there, and back.
    if (ask.by && !passages.has(`${outline.id}_boat`) && content.locations.has(ask.by.from)) {
      const boat = PassageSchema.safeParse({
        id: `${outline.id}_boat`,
        name: `the boat to ${outline.name}`,
        kind: 'boat',
        aliases: [`the boat to ${outline.name}`, `boat to ${outline.name}`],
        stops: [ask.by.from, outline.id],
        departs: ['08:00'],
        fare: outline.days * 10,
        legs: { [`${ask.by.from}>${outline.id}`]: outline.days * 24 * 60 },
        water: true,
        crew: 'skipper',
        text: 'You pay {fare}, and a skipper who knows the way takes you out past the last marks. After {duration} you come ashore at {place}.',
        closed: 'The skipper sails at eight in the morning, when the tide serves.',
        where: `The boat to ${outline.name} leaves from ${content.locations.get(ask.by.from)!.name}.`,
      })
      if (boat.success) passages.set(boat.data.id, boat.data)
    }
  }
  return { ...content, topics, lands, passages }
}

/** Whether a line over water stops here (M10.21): a harbour, where one may ask what lies beyond the sea. */
export function seaStop(content: Pick<Content, 'passages'>, location: string): boolean {
  return [...content.passages.values()].some((p) => p.water && p.stops.includes(location))
}
