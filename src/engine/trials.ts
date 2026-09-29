import { storyReply } from './growth/regionstory'
import { outlineRequest, readOutline } from '../chronicler/outline'
import { readReply } from '../chronicler/reply'
import { chatLine, chatLineRequest, longListen } from './chatter'
import { loadContent, type Content, type ContentFile } from './content'
import { parse, stringify } from 'yaml'
import { MockLlm } from './dialogue/mock'
import type { LlmClient, LlmRejection, LlmRequest, LlmResponse } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import { relation } from './dialogue/relations'
import { parseReply } from './dialogue/schema'
import { brainTrial, chroniclerTrial, runSituation, SITUATIONS } from './dialogue/testset'
import { withoutMap } from './map/regiondraft'
import { draftRequest, enhanceRequest, mapStepRequest, newWorldFiles, paletteRequest, polishRequest, readDraft, readEnhance, readMapStep, readPalette, readPolish, readVoice, voiceRequest, worldStepRequest } from './editor'
import { Engine } from './engine'
import { GameClock } from './clock'
import { recordFact } from './news'
import { districtWords } from './growth/districts'
import { weaveReply } from './growth/weave'
import { landWords } from './growth/landwrite'
import { expansionReply, expansionRequest } from './growth/expansion'
import { tideState, tidesReply, tidesRequest } from './tides'
import { farRequest, farWords } from './growth/far'
import { improvisable, improviseRequest, readImprovisation } from './improvise'
import { legendRequest, legendsOf } from './legend'
import { journeyRequest } from './map/journeyText'
import { fromKeys, goalRequest, validateGoals } from './npc/goals'
import { outlineInput } from './outlines'
import { parseCommand } from './parser'
import { crossesLimits, worldText } from './safety'
import { judged, judgeRequest } from './truth'
import { readSpark, sparkLines, sparkRequest } from './spark'
import { readScoreReply, readScoreRequest } from './dialogue/readscore'
import { buildInput } from './chronicler'
import { assignKeys, buildRequest, DEFAULT_LIMITS } from '../chronicler'

// A fixed situation for every kind of model call (M10.20; Bram, 28 September
// 2026: every kind of call really tried, and that written down). The same
// situation serves the mock test of every kind (tests/m1020coverage.test.ts),
// the real trial in the app (npm run trial -- --kind <kind>) and the replay
// of what a real model answered there: the reply is read as the game reads
// it, with its own readers and the hard limits, and what the game would not
// use is named.

export interface KindSituation {
  /** The situation in a line, for the record. */
  about: string
  request: LlmRequest
  /** What the game would not use of this reply; empty when it would use it. */
  check(text: string): string[]
}

/** The worlds a situation plays in: the Nethermarch for play, Skerrow's files for the editor. */
export interface TrialWorlds {
  base: Content
  isle: ContentFile[]
}

/**
 * The situation of a kind; `variant` 1 is a second one, other people or another night (M10.28: the schema test
 * builds each kind twice and wants the same schema).
 */
type Build = (worlds: TrialWorlds, variant: number) => Promise<KindSituation>

/** The first call of one kind in a game played with the mock, and a check that plays the reply as the game would. */
/**
 * A land as a designer might leave it (M10.23): its id, name, frame and
 * faiths, and nothing of its own besides: no voice kit, names, coins or law.
 */
export function framedOnly(files: ContentFile[], land: string): ContentFile[] {
  return files
    .filter((f) => !f.path.endsWith(`lands/${land}/voice.yaml`))
    .map((f) => {
      if (!f.path.endsWith(`lands/${land}/land.yaml`)) return f
      const l = (parse(f.text) as { land: Record<string, unknown> }).land
      return { ...f, text: stringify({ land: { id: l['id'], name: l['name'], frame: l['frame'], ...(l['faiths'] ? { faiths: l['faiths'] } : {}) } }) }
    })
}

async function captured(kind: string, play: (llm: LlmClient) => Promise<void>): Promise<LlmRequest> {
  const mock = new MockLlm('good')
  let found: LlmRequest | undefined
  const llm: LlmClient = {
    complete: async (request): Promise<LlmResponse> => {
      if (request.schemaName === kind && !found) found = request
      return mock.complete(request)
    },
  }
  await play(llm)
  if (!found) throw new Error(`the situation for ${kind} made no such call`)
  return found
}

/** The JSON of a reply, or why not. */
function json(text: string): { value?: unknown; problems: string[] } {
  try {
    return { value: JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')), problems: [] }
  } catch {
    return { problems: ['the reply is not JSON'] }
  }
}

/** What the reply's texts cross of the hard limits, if anything (M10.19). */
function limits(text: string): string[] {
  const crossed = crossesLimits(text)
  return crossed ? [`the reply crosses the hard limits (${crossed})`] : []
}

/**
 * Where a value does not have the shape of a JSON schema, as far as the
 * game's schemas go: types, required and extra fields, enums, items, anyOf.
 */
export function schemaProblems(schema: unknown, value: unknown, path = 'reply'): string[] {
  const s = (schema ?? {}) as { type?: string | string[]; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown; items?: unknown; enum?: unknown[]; anyOf?: unknown[] }
  if (s.anyOf) return s.anyOf.some((option) => !schemaProblems(option, value, path).length) ? [] : [`${path} matches none of its shapes`]
  if (s.enum && !s.enum.includes(value)) return [`${path} is not one of ${s.enum.map(String).join(', ')}`]
  const types = s.type === undefined ? [] : Array.isArray(s.type) ? s.type : [s.type]
  const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
  if (types.length && !types.some((t) => t === typeOf(value) || (t === 'number' && typeof value === 'number'))) return [`${path} is ${typeOf(value)}, not ${types.join(' or ')}`]
  if (typeOf(value) === 'object') {
    const v = value as Record<string, unknown>
    const out = (s.required ?? []).filter((k) => !(k in v)).map((k) => `${path}.${k} is missing`)
    if (s.additionalProperties === false && s.properties) out.push(...Object.keys(v).filter((k) => !(k in s.properties!)).map((k) => `${path}.${k} is not in the schema`))
    for (const [k, sub] of Object.entries(s.properties ?? {})) if (k in v) out.push(...schemaProblems(sub, v[k], `${path}.${k}`))
    return out
  }
  if (typeOf(value) === 'array' && s.items) return (value as unknown[]).flatMap((item, i) => schemaProblems(s.items, item, `${path}[${i}]`))
  return []
}

/** The JSON and its schema, then what the game's own reader says. */
function checked(request: LlmRequest, text: string, read: (value: unknown) => string[] = () => []): string[] {
  const parsed = json(text)
  if (parsed.problems.length) return parsed.problems
  const shape = schemaProblems(request.schema, parsed.value)
  return [...shape.slice(0, 5), ...limits(text), ...(shape.length ? [] : read(parsed.value))]
}


const SITUATION_BUILDS: Record<string, Build> = {
  npc_reply: async ({ base }, variant) => {
    const situation = SITUATIONS.find((s) => s.id === (variant ? 'gerrit_far' : 'mirte_local')) ?? SITUATIONS[0]!
    const request = await captured('npc_reply', async (llm) => void (await runSituation(base, situation, llm)))
    return { about: `a conversation (${situation.id})`, request, check: (text) => (parseReply(text) ? limits(text) : ['the reply does not match the reply schema']) }
  },
  party_reply: async ({ base }, variant) => {
    const request = await captured('party_reply', async (llm) => {
      const engine = new Engine(base, { seed: 1, llm })
      const party: [string, string][] = [['npc_wouter', 'wouter'], ['npc_gerrit', 'gerrit'], ...(variant ? ([['npc_aaltje', 'aaltje']] as [string, string][]) : [])]
      for (const [id, name] of party) {
        Object.assign(relation(engine.state, id), { affinity: 60, trust: 40 })
        Object.assign(engine.state.npcs[id]!, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
        await engine.handle(`recruit ${name}`)
      }
      await engine.handle('ask party about the haakman')
    })
    return { about: 'two companions answer together about the Haakman', request, check: (text) => checked(request, text) }
  },
  chat_line: async ({ base }, variant) => {
    let context: { engine: Engine } | undefined
    const request = await captured('chat_line', async (llm) => {
      const engine = new Engine(base, { seed: 28, builder: true, llm })
      context = { engine }
      engine.tick(GameClock.from(211, 9, 15, 14, 0).minutes - engine.world.now)
      await engine.handle('@goto loc_veenhoek_green')
      const here = engine.state.player.location
      const fact = variant
        ? recordFact(engine.world, { kind: 'rumour', about: ['npc_harmen'], place: 'loc_waagdam_market', belang: 2, title: 'the sails', text: { precise: 'Harmen has ordered new sails from Waagdam, they say.', village: 'Harmen has new sails coming!', far: 'A miller ordered sails.' }, witnesses: [] })
        : recordFact(engine.world, { kind: 'rumour', about: ['npc_harmen'], place: 'loc_waagdam_market', belang: 2, title: 'the mill', text: { precise: 'Harmen has sold the mill, they say.', village: 'Harmen has sold the mill!', far: 'A mill was sold.' }, witnesses: [] })
      engine.state.news!.heard['npc_mirte']![fact.id] = { level: 3, reliability: 1, from: 'witness', t: engine.world.now }
      for (const id of ['npc_mirte', 'npc_grietje_visser']) Object.assign(engine.state.npcs[id]!, { location: 'loc_veenhoek_bakery', plan: [{ kind: 'move', to: here }], busyUntil: engine.world.now, goals: [] })
      engine.state.bonds!['npc_mirte']!['npc_grietje_visser'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
      engine.state.bonds!['npc_grietje_visser']!['npc_mirte'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
      for (let m = 0; m < 15 && !engine.state.chatter?.chats.length; m++) await engine.handle('wait 1')
      await engine.handle('listen')
      await engine.handle('listen')
    })
    return {
      about: 'Mirte and Grietje talk about the mill while the stranger listens',
      request,
      check: (text) => {
        const chat = context && longListen(context.engine.world)
        return [...checked(request, text), ...(chat && !chatLine(context!.engine.world, chat, text).length ? ['the game would not use the line'] : [])]
      },
    }
  },
  journey: async ({ base }) => {
    const engine = new Engine(base, { seed: 2, builder: true })
    const paragraph = 'You follow the dyke path west for an hour. The wind comes off the water and the reeds lean with it. By noon you reach the sluice.'
    const request = journeyRequest(engine.world, paragraph, worldText(worldFrame(base)))
    return { about: 'an hour on foot along the dyke', request, check: (text) => checked(request, text, (v) => (typeof (v as { text?: unknown }).text === 'string' && (v as { text: string }).text.trim() ? [] : ['no paragraph in the reply'])) }
  },
  improvise: async ({ base }, variant) => {
    const engine = new Engine(base, { seed: 31, builder: true })
    engine.start()
    await engine.handle('@goto loc_kabouterberg')
    engine.state.player.inventory['milk'] = 2
    const imp = improvisable(engine.world, parseCommand(variant ? 'sing to the oak' : 'pour milk on the oak'))
    if (!imp) throw new Error('no place to improvise in this world')
    const request = improviseRequest(engine.world, imp)
    return {
      about: 'an offering the rules have no way for',
      request,
      check: (text) => {
        const read = readImprovisation(engine.world, imp, text)
        return 'problem' in read ? [`the game would not use it (${read.problem})`] : []
      },
    }
  },
  npc_goals: async ({ base }, variant) => {
    const engine = brainTrial(base)
    const choice = engine.state.brain?.pending[variant] ?? engine.state.brain?.pending[0]
    if (!choice) throw new Error('no goal choice waiting')
    const request = goalRequest(engine.world, choice)
    const keys = (request.meta?.['keys'] ?? undefined) as Record<string, string> | undefined
    return {
      about: 'a villager chooses the day\'s goals',
      request,
      check: (text) => {
        const parsed = json(text)
        if (parsed.problems.length) return parsed.problems
        const result = validateGoals(engine.world, choice.npc, fromKeys(parsed.value, keys))
        return result.rejected.map((r) => `rejected: ${r}`)
      },
    }
  },
  chronicle: async ({ base }, variant) => {
    const engine = (await chroniclerTrial(base)).filter((e) => e.state.chronicle?.pending[0])[variant]
    const run = engine?.state.chronicle?.pending[0]
    if (!engine || !run) throw new Error('no chronicle run waiting')
    const input = buildInput(engine.world, run)
    const keys = assignKeys(input)
    const request: LlmRequest = { ...buildRequest(input, keys, DEFAULT_LIMITS, [], 0), priority: 'low' }
    return { about: 'the night after a drowning', request, check: (text) => readReply(text, keys, input, DEFAULT_LIMITS).problems }
  },
  spark: async ({ base }, variant) => {
    // A quiet night after a drowning (M10.27): the storyline is open, and nothing new came of it.
    const engine = (await chroniclerTrial(base)).filter((e) => e.state.chronicle?.pending[0])[variant]!
    const run = { id: 'run_spark', t: engine.world.now, reason: 'spark' as const, lines: sparkLines(engine.world).map((l) => l.id) }
    const { request, keys } = sparkRequest(engine.world, run)
    return { about: 'a quiet night after a drowning', request, check: (text) => readSpark(text, keys).problems }
  },
  read_score: async ({ base }, variant) => {
    // Three answers of Mirte to read (M10.28): one good, one flat, one that talks like anyone.
    const mirte = base.npcs.get('npc_mirte')!
    const card = `${mirte.name}, ${mirte.short}.${mirte.speech ? ` Speech: ${mirte.speech}` : ''}`
    const items = [
      { card, said: 'What do you bake here?', answer: 'Mirte wipes her hands on her apron. "Rye, mostly, and a fen loaf on Saturdays. You look like you could do with one. Where are you headed?"' },
      { card, said: 'Is the mill working?', answer: 'Mirte says. "No."' },
      { card, said: 'Tell me about the village.', answer: '"Great question! The village is a wonderful place with many interesting features and friendly people."' },
    ]
    const request = readScoreRequest(variant ? items.slice(0, 2) : items)
    return { about: 'three answers of Mirte to read', request, check: (text) => (readScoreReply(text, variant ? 2 : items.length) ? [] : ['the read score could not be read']) }
  },
  lore_check: async (_worlds, variant) => {
    const op = variant
      ? { name: 'The sails of De Zwaan', summary: 'Harmen sold the torn sails of De Zwaan to a carter from Waagdam.', details: 'Mirte says he got a poor price.', story: 'After the storm Harmen sold the torn sails to a carter from Waagdam, for less than they were worth.', far: 'A miller sold his sails.' }
      : { name: 'The night the dyke broke', summary: 'Harmen drowned in the Blackmere the night the dyke broke.', details: 'Mirte saw it from the bakery.', story: 'The dyke broke in the night and the water took Harmen before anyone could reach him. Mirte saw it from the bakery.', far: 'A man drowned in the marsh.' }
    const events = [{ id: 'e1', when: 'day 15, night', place: 'the Blackmere', who: ['Harmen'], witnesses: ['Mirte'], belang: 4, text: 'Harmen drowned in the Blackmere when the dyke broke.' }]
    const request = judgeRequest(op, events as Parameters<typeof judgeRequest>[1])
    return { about: 'a second look at the lore of a drowning', request, check: (text) => (judged(text) ? [] : ['the second look could not be read']) }
  },
  legends: async ({ base }) => {
    const engine = new Engine(base, { seed: 108 })
    ;(engine.state.chronicle ??= { seq: 0, lines: [], lore: [], news: {}, pending: [], runs: 0 }).lore.push({
      id: 'chr_lore_1',
      name: "Mirte's drowned oven",
      summary: 'Mirte Bakker pulled Harmen out of the Blackmere the night the dyke broke.',
      details: 'Harmen still owes her a sack of flour, Mirte says.',
      story: 'The water came over the green. Mirte went in after Harmen with a rope. Wendela rang the bell all night.',
      far: 'Folk in Veenhoek say the baker saved the miller from the water.',
      teller: 'npc_mirte',
      fame: 4,
      place: 'loc_veenhoek_green',
      line: 'line_1',
      facts: ['fact_1'],
      links: ['npc_harmen'],
      t: 100,
      by: 'template',
    })
    const legends = legendsOf(base, engine.state)
    const request = legendRequest(base, legends)
    return { about: 'the lore of a drowning retold as a legend, years later', request, check: (text) => checked(request, text) }
  },
  outline: async ({ base }) => {
    const engine = new Engine(base, { seed: 1 })
    const far = farTopic(base)
    const input = outlineInput(engine.world, far)
    const request = outlineRequest(input) as LlmRequest
    return { about: `the outline of a far place (${far})`, request, check: (text) => readOutline(text, input).problems }
  },
  far_place: async ({ base }) => {
    const engine = new Engine(base, { seed: 1 })
    const far = farTopic(base)
    const request = farRequest(engine.world, far)
    return { about: `a far place made playable (${far})`, request, check: (text) => (farWords(text) ? limits(text) : ['the names and lines could not be read']) }
  },
  district: async ({ base }, variant) => {
    const request = await captured('district', async (llm) => {
      const engine = new Engine(base, { seed: 6 + variant, builder: true, llm })
      await doneInGraafhaven(engine)
      await engine.runModels()
    })
    return { about: 'the gate district of Graafhaven, the first time the stranger does something there', request, check: (text) => (districtWords(text) ? checked(request, text) : ['the names and lines could not be read']) }
  },
  region_story: async ({ base }, variant) => {
    const request = await captured('region_story', async (llm) => {
      const engine = new Engine(base, { seed: 6 + variant, builder: true, llm })
      await doneInGraafhaven(engine)
      await engine.handle('bye')
      await engine.runModels()
      await engine.handle('look')
      await engine.runModels()
    })
    return { about: "the story of Graafhaven, once its gate district is made and the stranger is there", request, check: (text) => (storyReply(text) ? checked(request, text) : ['the story could not be read']) }
  },
  weave: async ({ base }, variant) => {
    const request = await captured('weave', async (llm) => {
      const engine = new Engine(base, { seed: 11 + variant, builder: true, llm })
      await doneInGraafhaven(engine)
      await engine.handle('bye')
      await engine.runModels()
      await engine.runModels()
    })
    return { about: 'the new people of Graafhaven\'s gate district woven into the world', request, check: (text) => (weaveReply(text) ? checked(request, text) : ['the weave could not be read']) }
  },
  expansion: async ({ base }) => {
    const engine = new Engine(base, { seed: 1 })
    const region = [...base.regions.values()][0]!
    const request = expansionRequest(engine.world, { key: 'trial', wind: 'south', from: [region.origin[0] + region.size[0] / 2, region.origin[1]], region: region.id, t: engine.world.now })
    return { about: `the stranger goes on into the unknown south of ${region.name}`, request, check: (text) => (expansionReply(text) ? checked(request, text) : ['the outline could not be read']) }
  },
  land: async ({ isle }, variant) => {
    // A second situation: the same land told in other words.
    const framed = framedOnly(isle, 'western_isles').map((f) => (variant && f.path.endsWith('lands/western_isles/land.yaml') ? { ...f, text: f.text.replace(/frame: (\|-?\n\s*|>-?\n\s*)?/, (m) => `${m}Wind and grey water all round. `) } : f))
    const content = loadContent(framed)
    const request = await captured('land', async (llm) => {
      const engine = new Engine(content, { seed: 7, builder: true, llm })
      engine.start()
      await engine.handle('@goto loc_ynys_wen_landing')
      await engine.runModels()
    })
    return { about: "Skerrow's Western Isles with only their frame, the first time the stranger comes in", request, check: (text) => (landWords(text) ? checked(request, text) : ['the land could not be read']) }
  },
  tides: async ({ base }) => {
    const engine = new Engine(base, { seed: 1 })
    // The great flood has come to its threshold: the chronicler may say threat or event.
    for (const id of base.tides.keys()) tideState(engine.world, id).pressure = 95
    const request = tidesRequest(engine.world)
    return { about: 'the great lines of the Nethermarch on the first of a month, the great flood at its threshold', request, check: (text) => (tidesReply(text) ? checked(request, text) : ['the judgement could not be read']) }
  },
  builder_draft: async ({ isle }) => {
    const request = draftRequest(isle, 'A small hamlet near here, with three people and a story.', { kind: 'location', id: 'loc_skerrow_green' })
    return { about: 'the writing aid asked for a hamlet in Skerrow', request, check: (text) => readDraft(isle, text).problems }
  },
  world_step: async (_worlds, variant) => {
    const files = newWorldFiles('trial', 'Trial')
    const request = variant ? worldStepRequest(files, 'money', 'Copper bits and silver marks, ten bits to the mark; a meal is two bits.') : worldStepRequest(files, 'calendar', 'Thirteen months of thirty days; winter is long, and a storm season runs from the ninth month to the eleventh.')
    return { about: 'the calendar step of a new world', request, check: (text) => readDraft(files, text).problems }
  },
  world_enhance: async ({ isle }) => {
    const request = enhanceRequest(isle, 'money', 'Gold, silver and copper; fishers pay in dried cod.')
    return { about: 'enhance the money of Skerrow', request, check: (text) => readEnhance(text).problems }
  },
  world_polish: async ({ isle }) => {
    const request = polishRequest(isle)
    return { about: 'the polish round of Skerrow\'s places', request, check: (text) => readPolish(isle, text).problems }
  },
  map_paint: async ({ isle }, variant) => {
    // Skerrow without its map, laid out from its places and painted from what its world says of the island.
    const files = withoutMap(isle)
    const said = variant ? 'A windswept island of grey rock, a harbour to the east and marsh behind it.' : 'A small, rocky island in a grey sea: black shingle on the strand, heather and grey stone on the heights, a salt marsh behind the harbour, and the beacon on the headland.'
    const { layout, request } = mapStepRequest(files, said)
    return { about: 'the map of Skerrow, laid out from its places and painted as a table', request: request!, check: (text) => readMapStep(files, layout, text).problems }
  },
  palette_draft: async ({ isle }) => {
    const request = paletteRequest(isle, 'colder, like a winter sea')
    return { about: 'the colours of Skerrow, colder', request, check: (text) => readPalette(text).problems }
  },
  voice_draft: async ({ isle }) => {
    const files = isle.filter((f) => !f.path.endsWith('voice.yaml'))
    const request = voiceRequest(files, 'Islanders who swear by the sea and the tar.')
    return { about: 'the voice kit of Skerrow', request, check: (text) => readVoice(text).problems }
  },
}

/** To Graafhaven as a player goes: west from Oude Zijl over the edge, then something done at the market. */
async function doneInGraafhaven(engine: Engine): Promise<void> {
  engine.start()
  await engine.handle('@goto loc_oude_zijl_sluice')
  for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
  await engine.handle('1')
  await engine.handle('@goto loc_graafhaven_market')
  await engine.handle('@time 11')
  await engine.handle('ask lammert about the holleveen')
}

/** A far place of the world: the Nethermarch's Zwolderkamp, or the first place topic. */
function farTopic(content: Content): string {
  return content.topics.has('zwolderkamp') ? 'zwolderkamp' : ([...content.topics.values()].find((t) => t.kind === 'place')?.id ?? '')
}

/** The kinds with a situation in the engine; model_advice and test_call are tried in the app's own code. */
export const SITUATION_KINDS = Object.keys(SITUATION_BUILDS)

export async function kindSituation(kind: string, worlds: TrialWorlds, variant = 0): Promise<KindSituation | undefined> {
  const build = SITUATION_BUILDS[kind]
  return build ? build(worlds, variant) : undefined
}
