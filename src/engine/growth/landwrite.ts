import { askOutput, mustAsk } from '../asking'
import type { Output } from '../commands'
import { checkContent, LandSchema, type Content, type Land } from '../content'
import type { LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { voiceSummary } from '../dialogue/voice'
import { VoiceSchema } from '../dialogue/voiceSchema'
import { frameOf } from '../lands'
import { recordFact } from '../news'
import { withoutReference } from '../quests/reference'
import { worldGuide, worldText } from '../safety'
import type { GameState } from '../state'
import type { World } from '../world'
import { withExpansions } from './expansion'
import { growth } from './growth'

// A land the designer only framed (M10.23; roadmap: "the chronicler writes
// the land when the designer does not"). A land with its frame and nothing
// else plays at once: it takes the world's voice, names, coins and law. When
// the stranger first comes into it and a model is connected, the chronicler
// writes what makes it its own, from its frame: how its people speak and call
// a stranger, their names, their coins at a rate, who keeps the law, and what
// the stranger notices crossing in. Once, checked field by field, and kept in
// the save as a layer; whatever the designer wrote wins.

/** What the chronicler writes for a land. */
export interface LandWords {
  crossing?: string
  region?: string
  names?: { she: string[]; he: string[]; family: string[] }
  money?: { units: { short: string; name: string; value: number }[]; rate: number }
  law?: { where: string; officer: string }
  voice?: Record<string, unknown>
}

/** A land as it was before the chronicler wrote it: the designer's, or one a round at the edge charted (M10.21). */
function designed(world: World, id: string): Land | undefined {
  return world.base.lands.get(id) ?? withExpansions(world.base, world.state).lands.get(id)
}

/** A land that has its frame and no voice or names of its own: the chronicler may write the rest. */
export function unwritten(land: Land | undefined): boolean {
  return Boolean(land && !land.voice && !land.names)
}

/**
 * The stranger has come into a land (M10.23): if it is only framed, the
 * chronicler writes the rest, once, when a model is connected (asked first
 * above the player's threshold, M10.21). Without a model the land keeps the
 * world's voice, names, coins and law.
 */
export function wantLand(world: World, id: string): Output[] {
  const land = designed(world, id)
  const g = growth(world)
  if (!world.aiLive || !unwritten(land) || g.lands?.[id] || g.landPending?.includes(id)) return []
  const asked = mustAsk(world, `land:${id}`, `Writing how people live in ${land!.name}`, landRequest(world, id), `land ${id}`)
  if (asked && 'declined' in asked) return []
  if (asked) return askOutput(world, asked.ask)
  ;(g.landPending ??= []).push(id)
  return [{ kind: 'system', text: `The chronicler is writing how people live in ${land!.name}.` }]
}

/**
 * The request for the chronicler: the land's frame first (stable), with the
 * world's voice for contrast; then what is known of the land, its faiths and
 * the world's coins, and the shape of the answer.
 */
export function landRequest(world: World, id: string): LlmRequest {
  const content = world.content
  const land = content.lands.get(id)!
  const faiths = frameOf(content, id).faiths
  const coins = content.world.money?.units ?? []
  const areas = [...content.areas.values()].filter((a) => a.land === id)
  const places = [...content.topics.values()].filter((t) => t.kind === 'place' && t.land === id)
  const text = { type: 'string' }
  const list = { type: 'array', items: text }
  const object = (properties: Record<string, unknown>, optional: string[] = []) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties).filter((k) => !optional.includes(k)), properties })
  return {
    role: 'chronicler',
    system: [
      ...(content.chronicler ? [worldGuide(withoutReference(content.chronicler)), ''] : []),
      worldText(worldFrame(content, id)),
      '',
      'You write how people live in one land of this world, from its frame above: the frame is the truth, and you add nothing it does not allow. The land must sound like itself and not like the home land, whose voice is given for contrast.',
      'CROSSING: one or two sentences, second person, of what the stranger notices coming into the land: another way of address, other money on the table.',
      'NAMES: six first names for women (she), six for men (he), six family names, in the land\'s own sound.',
      'MONEY: only when the frame names coins of its own: its coins largest first (short, name, value in its smallest), and rate: how many of its smallest coin one of the WORLD\'S SMALLEST COIN buys, a whole number. Otherwise leave money out.',
      'LAW: where the law holds ("in X" or "on X") and the title of who keeps it.',
      'VOICE: oaths per faith (by the FAITHS ids only, two each), three sayings, how people call a stranger, someone they know, a friend and someone above them (address: stranger, known, friend, high; one or two forms each), three ways to tell time, two of distance, two measures, and not_here: words of our world or of the home land that do not belong here, each with instead where people here have a word for it.',
      'Plain words, in the tone of the frame. JSON only.',
    ].join('\n'),
    prompt: [
      `LAND: ${land.name} (${id})`,
      ...(areas.length ? [`ITS AREAS: ${areas.map((a) => `${a.name}: ${a.summary}`).join(' ')}`] : []),
      ...(places.length ? [`ITS FAR PLACES: ${places.map((t) => `${t.name}: ${t.summary}`).join(' ')}`] : []),
      `FAITHS: ${faiths.map((f) => `${f.id} (${f.name})`).join(', ') || 'none: nobody swears by a faith here'}`,
      `THE WORLD'S COINS: ${coins.map((u) => `${u.name} (${u.value})`).join(', ') || 'one plain coin'}; the WORLD'S SMALLEST COIN is ${coins.at(-1)?.name ?? 'a coin'}.`,
      `THE HOME LAND SPEAKS SO:\n${voiceSummary(content) || '(no kit)'}`,
    ].join('\n'),
    schemaName: 'land',
    schema: object(
      {
        crossing: text,
        names: object({ she: list, he: list, family: list }),
        money: object({ units: { type: 'array', items: object({ short: text, name: text, value: { type: 'integer' } }) }, rate: { type: 'integer' } }),
        law: object({ where: text, officer: text }),
        voice: object(
          {
            oaths: { type: 'object', additionalProperties: list },
            sayings: list,
            address: object({ stranger: list, known: list, friend: list, high: list }),
            time: list,
            distance: list,
            measures: list,
            not_here: { type: 'array', items: object({ word: text, instead: text }, ['instead']) },
          },
          ['oaths'],
        ),
      },
      ['money'],
    ),
    maxTokens: 1500,
    meta: { land: id, name: land.name, faiths: faiths.map((f) => f.id) },
  }
}

/** The chronicler's reply, or null when it cannot be read. */
export function landWords(text: string): LandWords | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as LandWords
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

/**
 * Keeps what checks out of the chronicler's words for a land, field by
 * field, only where the designer wrote nothing: the land plays under them
 * from now on, and the save keeps them. False when nothing could be kept.
 */
export function applyLand(world: World, id: string, words: LandWords | null): boolean {
  const g = growth(world)
  g.landPending = (g.landPending ?? []).filter((x) => x !== id)
  const land = designed(world, id)
  if (!words || !land || g.lands?.[id]) return false
  const shape = LandSchema.shape
  const own: Record<string, unknown> = {}
  const keep = (key: 'crossing' | 'names' | 'money' | 'law', value: unknown) => {
    if (value === undefined || land[key] !== undefined) return
    const read = shape[key].safeParse(value)
    if (read.success && read.data !== undefined) own[key] = read.data
  }
  keep('crossing', typeof words.crossing === 'string' && words.crossing.trim() && words.crossing.length < 400 ? words.crossing.trim() : undefined)
  keep('names', words.names && ['she', 'he', 'family'].every((k) => Array.isArray((words.names as Record<string, unknown>)[k]) && (words.names as Record<string, string[]>)[k]!.length >= 3) ? words.names : undefined)
  keep('money', words.money)
  keep('law', words.law ? { where: words.law.where, officer: words.law.officer } : undefined)
  // The kit, with oaths only by the faiths the land holds.
  if (!land.voice && words.voice) {
    const held = new Set(frameOf(world.content, id).faiths.map((f) => f.id))
    const raw = { ...words.voice, oaths: Object.fromEntries(Object.entries((words.voice['oaths'] as Record<string, unknown>) ?? {}).filter(([faith]) => held.has(faith))) }
    const kit = VoiceSchema.safeParse(raw)
    if (kit.success) own['voice'] = kit.data
  }
  if (!Object.keys(own).length) return false
  ;(g.lands ??= {})[id] = own
  world.regrow()
  if (checkContent(world.content).length) {
    delete g.lands[id]
    world.regrow()
    return false
  }
  // In the chronicle, as a district is (M10.21): a fact nobody tells.
  recordFact(world, { kind: 'land_written', about: [], place: world.state.player.location, belang: 0, witnesses: [], title: `how people live in ${land.name}`, text: { precise: `The chronicler wrote how people live in ${land.name}.`, village: '', far: '' } })
  return true
}

/** The lands with what the chronicler wrote for them in this game (M10.23): the designer's own wins. */
export function withLands(content: Content, state: GameState): Content {
  const made = state.growth?.lands
  if (!made || !Object.keys(made).length) return content
  const lands = new Map(content.lands)
  for (const [id, raw] of Object.entries(made)) {
    const land = lands.get(id)
    if (!land) continue
    const { voice, ...rest } = raw as Record<string, unknown>
    const kit = !land.voice && voice ? VoiceSchema.safeParse(voice) : undefined
    lands.set(id, { ...(rest as Partial<Land>), ...land, ...(kit?.success ? { voice: kit.data } : {}) })
  }
  return { ...content, lands }
}
