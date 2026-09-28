import type { ChronicleMeta } from '../../chronicler/prompt'
import { askedFor, proposal, type Offer } from './offers'
import { stringify } from 'yaml'
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm'

// A stand-in model for tests and the browser preview. It answers from the
// knowledge packet in request.meta and can misbehave on purpose, so tests can
// prove that the guardrails catch it.

export type MockMode = 'good' | 'leak' | 'long' | 'invalid' | 'throw' | 'anachronism' | 'topics' | 'invent' | 'far' | 'twofar' | 'lookup' | 'quest' | 'plan' | 'promise'

export interface MockMeta {
  npcName: string
  act: string
  wordLimit: number
  known: { topic: string; facts: string[]; story?: string; toldBy?: string }[]
  unknown: { topic: string; name: string }[]
  referral?: { npc: string; name: string; call: string }
  check?: string
  secret?: string
  questActions?: { key: string; intent: string }[]
  playerText?: string
  /** The offers of this turn (M10.3): the mock picks by the same rules as the game without a model. */
  offers?: Offer[]
  /** What the rules would have the NPC do after the talk (M10.3); the mock chooses the same. */
  after?: { kind: 'tell' | 'visit'; target: string }
  /** A claim may be read from the stranger's words (M10.3, left over): who it may be about. */
  claimable?: string[]
  /** Someone new may be named (M10.9): the bonds and places the game offers. */
  sketch?: { bonds: string[]; places: string[] }
}

const COMMON = new Set(['about', 'what', 'with', 'that', 'this', 'from', 'your', 'have', 'there', 'they', 'them', 'will', 'would', 'could', 'know', 'want', 'wants'])

/** The mock recognises a quest action when the player's words share its main words. */
function recognised(meta: MockMeta): string | undefined {
  const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3 && !COMMON.has(w)))
  const said = words(meta.playerText ?? '')
  return meta.questActions?.find((a) => {
    const wanted = [...words(a.intent)]
    const shared = wanted.filter((w) => said.has(w) || said.has(`${w}s`) || said.has(w.replace(/s$/, ''))).length
    return wanted.length > 0 && shared >= Math.min(2, wanted.length)
  })?.key
}

/** The offer the player's words ask for, or else one the rules would propose: as the game does without a model. */
function offerChoice(meta: MockMeta): { action: string; propose: string } {
  const asked = askedFor(meta.offers!, meta.playerText ?? '')
  const proposed = asked ? undefined : proposal(meta.offers!, meta.act)
  return { action: asked?.key ?? 'none', propose: proposed?.key ?? 'none' }
}

export class MockLlm implements LlmClient {
  calls: LlmRequest[] = []
  /** For tests: more for the chronicler to write, given the overview and the line marked PLAN, if any. */
  chronicle?: (meta: ChronicleMeta, planned: string | undefined) => Record<string, unknown>
  /** For tests: what the second look at big lore finds that no fact says (M9.2); without it, nothing. */
  judge?: (story: string, facts: string[]) => string[]
  /** For tests: the questions a brain asks before it chooses (M9.3), and what it heard back. */
  ask?: (npc: string, keys: Record<string, string>) => string[]
  heard?: (answers: string) => void
  /** For tests: the intention a brain chooses when a signal lets it (M8.2), with its open bindings; without it, none and custom decides. */
  intend?: (npc: string, offered: string[], keys: Record<string, string>) => { choice: string; fill?: { name: string; key: string }[] } | undefined
  /** For tests: the claim the voice reads in the stranger's words when one may be read (M10.3, left over). */
  claim?: { subject: string; key: string; value: string }
  /** For tests: someone new the voice names (M10.9), whether or not the game offered it; the place, when not given, is the first offered. */
  someone?: { name: string; bond?: string; place?: string; what?: string; pronoun?: string }

  constructor(
    public mode: MockMode = 'good',
    private readonly leakName = 'the Weeping Stone',
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request)
    if (this.mode === 'throw') throw new LlmError('timeout', 'mock timeout')
    const text =
      request.schemaName === 'builder_draft'
        ? this.draft(request.meta ?? {})
        : request.schemaName === 'palette_draft'
        ? this.palette(request.meta ?? {})
        : request.schemaName === 'party_reply'
        ? this.party(request.meta as unknown as { party: { id: string; name: string; knows: string[] }[] })
        : request.role === 'voice'
        ? this.voice(request.meta as unknown as MockMeta)
        : request.role === 'chronicler'
          ? request.schemaName === 'outline'
            ? this.outline(String(request.meta?.['name'] ?? 'the place'))
            : request.schemaName === 'far_place'
            ? this.farPlace(String(request.meta?.['name'] ?? 'the place'), (request.meta?.['named'] as { key: string; name: string; pronoun: string }[] | undefined) ?? [])
            : request.schemaName === 'legends'
            ? this.legends((request.meta?.['legends'] as string[] | undefined) ?? [])
            : this.chronicler(request.meta as unknown as ChronicleMeta, request.prompt)
          : this.other(request)
    return { text, provider: 'mock', model: 'mock-1', usage: { inputTokens: Math.round((request.system.length + request.prompt.length) / 4), outputTokens: Math.round(text.length / 4), cachedTokens: 0 }, latencyMs: 1 }
  }

  /** A palette proposal (M10): the palette now, every colour a shade warmer, so the test sees a change. */
  palette(meta: Record<string, unknown>): string {
    const warm = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      const c = (v: number, d: number) => Math.max(0, Math.min(255, v + d)).toString(16).padStart(2, '0')
      return `#${c(n >> 16, 8)}${c((n >> 8) & 255, 3)}${c(n & 255, -6)}`
    }
    const shift = (value: unknown): unknown => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? warm(value) : Array.isArray(value) ? value.map(shift) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'names' ? v : shift(v)])) : value)
    return JSON.stringify({ say: 'A palette a shade warmer than the one you have, the same muted tones.', palette: shift(meta['palette']) })
  }

  /**
   * A proposal in the world builder (M8): asked for a hamlet with the place in
   * view, a new hamlet with three people and a small story, joined to that
   * place; anything else gets a question back, as the working instruction asks.
   */
  private draft(meta: Record<string, unknown>): string {
    if (this.mode === 'invalid') return 'Here is a lovely hamlet for you.'
    const ask = String(meta['ask'] ?? '')
    const focus = meta['focusRaw'] as Record<string, unknown> | undefined
    if (!/hamlet|gehucht/i.test(ask) || !focus) {
      return JSON.stringify({ say: 'I can write that, but a choice is yours first.', questions: [`Where should it go? Open the place it should join, and ask again.`], changes: [] })
    }
    const exits = { ...((focus['exits'] as Record<string, unknown> | undefined) ?? {}) }
    const opposite: Record<string, string> = { north: 'south', south: 'north', east: 'west', west: 'east', northeast: 'southwest', southwest: 'northeast', northwest: 'southeast', southeast: 'northwest' }
    const way = Object.keys(opposite).find((d) => !exits[d] && !exits[opposite[d]!]) ?? 'northwest'
    exits[way] = { to: 'loc_nettlecombe_green', minutes: 20 }
    const person = (id: string, name: string, short: string, pronoun: string, age: number, home: string, fact: string) =>
      `id: ${id}\nname: ${name}\nshort: ${short}\npronoun: ${pronoun}\nage: ${age}\nprofession: hamlet_folk\nhome: ${home}\nappearance: ${fact}\npersonality: { warmth: 1, courage: 0, honesty: 2, temper: 0, curiosity: 1, diligence: 1 }\npublic_facts:\n  - ${name} lives in Nettlecombe.\nknows_areas: [nettlecombe]\n`
    const changes = [
      { kind: 'area', id: 'nettlecombe', yaml: 'id: nettlecombe\nname: Nettlecombe\nkind: hamlet\nsummary: Three cottages round a well that has gone dry.\n' },
      { kind: 'profession', id: 'hamlet_folk', yaml: 'id: hamlet_folk\nname: cottager\nschedule:\n  - { from: "07:00", to: "08:00", activity: eat }\n  - { from: "08:00", to: "18:00", activity: work }\n  - { from: "18:00", to: "19:00", activity: eat }\n  - { from: "19:00", to: "22:00", activity: home }\n  - { from: "22:00", to: "07:00", activity: sleep }\n' },
      { kind: 'location', id: 'loc_nettlecombe_green', yaml: `id: loc_nettlecombe_green\nname: Nettlecombe, the Green\narea: nettlecombe\ntags: [public, social]\ndescription:\n  day: |\n    Three cottages lean together round a well with a broken windlass. The grass smells of nettles and dust. A cottage door stands open to the north, and the way back runs ${opposite[way]}.\nexits:\n  ${opposite[way]}: { to: ${String(focus['id'])}, minutes: 20 }\n  north: { to: loc_nettlecombe_cottage }\n` },
      { kind: 'location', id: 'loc_nettlecombe_cottage', yaml: 'id: loc_nettlecombe_cottage\nname: The Cottage by the Well\narea: nettlecombe\ntags: [private]\ndescription:\n  day: |\n    A low room with a cold hearth and three stools. It smells of damp stone. The door out to the green is south.\nexits:\n  south: { to: loc_nettlecombe_green }\n' },
      { kind: 'location', id: String(focus['id']), yaml: stringifyExits(focus, exits) },
      { kind: 'npc', id: 'npc_hob', yaml: person('npc_hob', 'Hob Tanner', 'Hob the cottager', 'he', 48, 'loc_nettlecombe_cottage', 'A stooped man with a bucket that never has water in it.') },
      { kind: 'npc', id: 'npc_nell', yaml: person('npc_nell', 'Nell Tanner', 'Nell the cottager', 'she', 45, 'loc_nettlecombe_cottage', 'A brisk woman with dust on her skirts.') },
      { kind: 'npc', id: 'npc_wat', yaml: person('npc_wat', 'Wat Tanner', 'Wat, the cottagers\' boy', 'he', 12, 'loc_nettlecombe_cottage', 'A boy with scraped knees and a stick.') },
      {
        kind: 'quest',
        id: 'the_dry_well',
        yaml: 'id: the_dry_well\nname: The Dry Well\nkind: request\nsummary: The well of Nettlecombe has gone dry.\ngivers: [npc_hob]\nstarts: { talk: [npc_hob] }\nask: "The well\'s gone dry. Three families, no water. Can you help?"\nstages:\n  - id: dry\n    text: The well of Nettlecombe has gone dry, and Hob asks for help.\nactions:\n  - id: clear_well\n    say: [\'clear (?:the )?well\']\n    at: [loc_nettlecombe_green]\n    text: You haul up stones and dead leaves until the water comes back.\n    effects: [{ set: well_cleared }]\n  - id: ask_nell\n    say: [\'ask nell about (?:the )?spring\']\n    with: npc_nell\n    text: Nell shows you the old spring behind the cottage.\n    effects: [{ set: spring_found }]\n  - id: carry_water\n    say: [\'carry water for (?:the )?tanners\']\n    at: [loc_nettlecombe_green]\n    minutes: 120\n    text: You carry water all morning until the butts are full.\n    effects: [{ set: water_carried }]\noutcomes:\n  - { id: cleared, name: The well cleared, text: "The well of Nettlecombe runs again.", when: [{ flag: well_cleared }] }\n  - { id: spring, name: The old spring, text: "The Tanners draw water from the old spring now.", when: [{ flag: spring_found }] }\n  - { id: carried, name: Water carried, text: "The butts are full, and that will do until the rain.", when: [{ flag: water_carried }] }\n',
      },
    ]
    return JSON.stringify({ say: 'A small hamlet of three cottagers and a dry well, joined to the place in view. The well can be cleared, the old spring found, or water carried.', questions: [], changes })
  }

  /** The group talk: one line each, from what each companion knows. */
  private party(meta: { party: { id: string; name: string; knows: string[] }[] }): string {
    if (this.mode === 'invalid') return 'They all talk at once.'
    return JSON.stringify({ lines: meta.party.map((p) => ({ speaker: p.id, text: p.knows[0]?.split(/(?<=[.!?])\s/)[0] ?? "Can't say I know much about that." })) })
  }

  private voice(meta: MockMeta): string {
    if (this.mode === 'invalid') return 'Mirte says hello, but not in JSON.'
    const name = meta.npcName.split(' ')[0]
    let speech: string
    const known = meta.known[0]
    if (meta.secret) speech = meta.secret
    else if (meta.check && /failure/.test(meta.check)) speech = "I don't think so."
    else if (meta.act === 'AskStory' && known?.story && !known.toldBy) speech = known.story
    else if (known) speech = known.facts.slice(0, 2).join(' ')
    else if (meta.unknown.length) speech = `Can't say I know.${meta.referral ? ` Ask ${meta.referral.call}.` : ''}`
    else if (meta.act === 'Greet') speech = 'Evening to you.'
    else speech = 'Mm. That so?'

    if (this.mode === 'leak') speech = `My cousin swears ${this.leakName} wept for it. ${speech}`
    if (this.mode === 'long') speech = Array.from({ length: 12 }, () => speech).join(' ')
    if (this.mode === 'anachronism') speech = `Okay, ${speech}`
    if (this.mode === 'invent') speech = `${speech} Father Oswin would know more.`
    // A promise the game did not offer (M10.3): the guard must keep it out of the text.
    if (this.mode === 'promise') speech = `Come on, I'll take you there myself. ${speech}`
    if (this.mode === 'far') speech = `Salt comes dear from the Amber Coast these days. ${speech}`
    if (this.mode === 'twofar') speech = `Salt comes from the Amber Coast and tin from Kessmoor. ${speech}`
    const someone = this.someone ? { name: this.someone.name, pronoun: this.someone.pronoun ?? 'he', bond: this.someone.bond ?? meta.sketch?.bonds[0] ?? 'cousin', place: this.someone.place ?? meta.sketch?.places[0] ?? 'nowhere', what: this.someone.what ?? 'a carter' } : undefined
    if (someone) speech = `My ${someone.bond} ${someone.name} is ${someone.what} in ${someone.place}. ${speech}`
    const words = speech.split(/\s+/)
    if (this.mode === 'good' && words.length > meta.wordLimit) speech = words.slice(0, meta.wordLimit).join(' ').replace(/[,;:]?$/, '.')

    const topics = this.mode === 'topics' ? ['not_a_topic', ...(known ? [known.topic] : [])] : [...(known ? [known.topic] : []), ...(meta.referral && !known ? [meta.referral.npc] : [])]
    return JSON.stringify({
      act: meta.act,
      reply: `${name} looks up. "${speech}"`,
      names: this.mode === 'far' ? [{ text: 'Amber Coast', new_kind: 'land' }] : this.mode === 'twofar' ? [{ text: 'Amber Coast', new_kind: 'land' }, { text: 'Kessmoor', new_kind: 'city' }] : [],
      mentioned_topics: topics,
      effects: this.mode === 'good' && known ? [{ type: 'affinity', delta: 1, reason: 'a friendly question' }] : [],
      memory_note: known ? `The stranger asked me about ${known.topic}.` : 'The stranger talked to me.',
      ends_conversation: false,
      keep_talking: 'no',
      ...(meta.questActions?.length ? { quest_action: this.mode === 'good' ? (recognised(meta) ?? 'none') : 'none' } : {}),
      ...(meta.offers?.length ? (this.mode === 'promise' ? { action: 'none', propose: 'none' } : offerChoice(meta)) : {}),
      ...(meta.after && this.mode === 'good' ? { after: meta.after } : {}),
      // A claim the test has the mock read, if one may be read this turn.
      ...(this.claim && meta.claimable?.includes(this.claim.subject) ? { claim: this.claim } : {}),
      ...(someone ? { person: someone } : meta.sketch ? { person: { name: '', pronoun: 'they', bond: 'none', place: 'none', what: '' } } : {}),
    })
  }

  /** A chronicler that writes plainly from the overview; 'invent' makes up a priest, 'lookup' asks first, 'quest' makes a request. */
  private chronicler(meta: ChronicleMeta, prompt: string): string {
    const empty = { lookup: [] as string[], lore: [] as unknown[], lines: [] as unknown[], quests: [] as unknown[], thoughts: [] as unknown[], news: [] as unknown[] }
    if (this.mode === 'invalid') return 'The chronicle, in prose.'
    const people = meta.cards.filter((c) => c.kind === 'person')
    if (this.mode === 'lookup' && meta.lookupsLeft > 0 && !prompt.includes('LOOKED UP') && people[0]) return JSON.stringify({ ...empty, lookup: [people[0].key] })
    const name = (key: string) => meta.cards.find((c) => c.key === key)?.name ?? key
    const reply = { ...empty }
    for (const line of meta.lines) {
      if (line.belang >= 3) {
        reply.lore.push({
          line: line.key,
          name: `The Tale of ${line.title.replace(/^the /i, '')}`,
          summary: line.text,
          details: line.text,
          story: `${line.text}${this.mode === 'invent' ? ' Father Oswin saw it too.' : ' Nobody who saw it has slept well since.'}`,
          far: 'Something bad happened out in the fen, they say.',
          teller: line.witnesses[0] ?? '',
          links: [],
          // What it says, on the event it rests on (M9.2).
          claims: [{ event: line.event, subject: line.who[0] ?? line.place, key: 'present', value: 'yes' }],
        })
      }
      reply.lines.push({ line: line.key, summary: [line.text], roles: line.who[0] ? [{ role: 'subject', who: line.who[0] }] : [], hooks: ['What comes of it now?'], next: 'People will talk.', close: false })
      const others = people.filter((p) => !line.who.includes(p.key))
      if (this.mode === 'quest' && others.length >= 2) {
        reply.quests.push({ request: '', line: line.key, template: 'visit', giver: others[0]!.key, item: '', target: others[1]!.key, name: `Word to ${others[1]!.name}`, ask: `Would you look in on ${others[1]!.name} for me?`, stakes: 'Someone should.' })
      }
      const debtor = people.find((p) => /PRIVATE: .* is (her|his|their) creditor/.test(p.text))
      if (debtor && line.who[0]) reply.thoughts.push({ who: debtor.key, text: `You still owe ${name(line.who[0])} money, and now there is nobody to pay it to.` })
    }
    const area = meta.cards.find((c) => c.kind === 'area')
    if (area && meta.lines[0]) reply.news.push({ area: area.key, text: meta.lines[0].text })
    if (this.chronicle) {
      const planned = meta.lines.find((l) => new RegExp(`${l.key} ".*" ?.*PLAN`).test(prompt))?.key
      return JSON.stringify({ ...reply, ...this.chronicle(meta, planned) })
    }
    // 'plan': a small shift between two realms, and consequences for a storyline marked PLAN (M7.2).
    if (this.mode === 'plan') {
      const realms = meta.cards.filter((c) => c.kind === 'realm')
      const planned = meta.lines.find((l) => new RegExp(`${l.key} ".*" ?.*PLAN`).test(prompt))
      const place = meta.cards.find((c) => c.kind === 'place')
      return JSON.stringify({
        ...reply,
        tensions: realms.length >= 2 ? [{ between: [realms[0]!.key, realms[1]!.key], delta: 9, why: 'what happened in the fen' }] : [],
        plans: planned && place && area ? [{ line: planned.key, name: 'After the burning', phases: [{ after: 0, effects: [{ place: place.key, state: 'damaged' }, { news: 'Nobody goes near the place now.', area: area.key }] }, { after: 48, effects: [{ place: place.key, state: 'normal' }, { market: 'i99', factor: 3 }] }] }] : [],
      })
    }
    return JSON.stringify(reply)
  }

  /** Old lore retold as legend (M9.1); 'invent' lets a living name slip into the first. */
  private legends(ids: string[]): string {
    return JSON.stringify({
      legends: ids.map((id, i) => ({
        id,
        name: 'the stranger and the drowned bell',
        summary: `${this.mode === 'invent' && i === 0 ? 'Mirte' : 'A stranger'} came to the fen long ago, and the water was never the same after.`,
        details: 'Some say the stranger made a bargain with the water. Others say the stranger only listened.',
        story: 'My grandmother saw the stranger once, by the quay. Thin, she said, and quiet. The next spring the dykes held. Nobody thanked them. That is how it is here.',
        far: 'A tale from the fen about a stranger and the water.',
      })),
    })
  }

  /** A far place made playable (M9.1): words for its three places and two people; 'invalid' writes one sentence too few. */
  private farPlace(name: string, named: { key: string; name: string; pronoun: string }[] = []): string {
    const short = this.mode === 'invalid'
    return JSON.stringify({
      places: [
        { key: 'gate', name: 'the Lantern Gate', description: short ? `You are at the gate.` : `You pass under the Lantern Gate of ${name}, where the road from the fen ends in cobbles. The stones ring under the cart wheels, and the gatekeeper's dog barks at every stranger. A lamp burns over the arch even by day. The market lies within, and the road home runs back the way you came.` },
        { key: 'market', name: 'the Salt Market', description: `You stand in the Salt Market, where the Cog League's merchants weigh everything twice. It smells of brine and lamp oil. Nobody looks up when you pass. The Carters' Rest is at the corner, and the gate is back out.` },
        { key: 'inn', name: "the Carters' Rest", description: `You step into the Carters' Rest, low and smoky, full of men from the Oostweg. The beer is sour and the fire is good. Someone is singing badly about a drowned bell. The market is back out.` },
      ],
      people: [
        { key: 'merchant', name: 'Wendel Hoorn', pronoun: 'he', looks: 'A thin man in a good coat, with a scale on a chain at his belt.', speech: 'Short, and always about the price.', fact: 'Wendel Hoorn buys rye from the Nethermarch and sells it dearer to the League.' },
        { key: 'innkeeper', name: 'Aleid Kramer', pronoun: 'she', looks: 'A broad woman with flour on her sleeves and keys at her hip.', speech: 'Loud and kind.', fact: 'Aleid Kramer knows every carter on the Oostweg by name.' },
        // People named in talks who live here (M10.9): the same first name, a family name of the place.
        ...named.map((n) => ({ key: n.key, name: `${n.name} Brinkman`, pronoun: n.pronoun === 'she' ? 'she' : 'he', looks: 'Someone with the look of a long road about them.', speech: 'Slow, and glad of news from home.', fact: `${n.name} Brinkman keeps a stall by the Salt Market.` })),
      ],
    })
  }

  /** A far place, worked out plainly; 'invent' reuses a name that is already taken. */
  private outline(name: string): string {
    return JSON.stringify({
      summary: `${name} is a busy place of brick and water, two days from the fen. The Count's banner hangs over its gate.`,
      areas: [{ name: 'the Harbour Quarter', text: 'Quays, warehouses and the fish market.' }],
      places: [
        { name: this.mode === 'invent' ? 'Veenhoek' : 'the Lantern Gate', kind: 'gate', text: 'The east gate, where the barge from the Holleveen comes in.' },
        { name: 'the Salt Hall', kind: 'guild hall', text: 'Where the salt merchants meet and quarrel.' },
      ],
      routes: [{ to: 'the Holleveen', text: 'By barge along the Graafse Vaart, two days.' }],
      people: [{ role: 'the harbour master', text: 'Takes a coin from every barge, and another if you argue.' }],
      dangers: ['Cutpurses in the fish market.'],
      lore: [{ name: 'the drowned bell', text: 'A bell under the harbour that rings before a storm.' }],
    })
  }

  private other(request: LlmRequest): string {
    const properties = (request.schema['properties'] ?? {}) as Record<string, unknown>
    // The second look at big lore (M9.2): what the story says that the facts do not.
    if (request.schemaName === 'lore_check') {
      const meta = request.meta as { story: string; facts: string[] }
      return JSON.stringify({ invented: this.judge ? this.judge(meta.story, meta.facts) : this.mode === 'invent' && /Father Oswin/.test(meta.story) ? ['Father Oswin saw it'] : [] })
    }
    // One line in a chat the player overhears (M9.1).
    if (request.schemaName === 'chat_line') return this.mode === 'invalid' ? 'Hmm.' : JSON.stringify({ line: `Is that so? Well, I never heard the like of it.` })
    if (!('goals' in properties)) return '{}'
    const meta = request.meta as { places?: string[]; people?: string[]; npc?: string; lookups?: boolean } | undefined
    // Questions first, when a test wants them (M9.3).
    if (meta?.lookups && this.ask) {
      const questions = this.ask(String(meta.npc ?? ''), request.meta?.['keys'] as Record<string, string>)
      if (questions.length) return JSON.stringify({ goals: [], lookup: questions })
    }
    if (this.heard && /LOOKED UP:/.test(request.prompt)) this.heard(request.prompt.slice(request.prompt.indexOf('LOOKED UP:')))
    if (this.mode === 'invalid') return 'I think she should bake.'
    // 'invent' breaks every rule the validator knows: a goal not in the list, a place nobody knows, a gate.
    if (this.mode === 'invent')
      return JSON.stringify({
        goals: [
          { type: 'Steal', target: 'npc_lubbert', priority: 0.9, why: 'He is rich.' },
          { type: 'Visit', target: 'loc_the_moon', priority: 2, why: 'Why not.' },
        ],
        mood: 'wild',
        note: 'Made up.',
      })
    const place = meta?.places?.find((p) => !p.includes('house') && !p.includes('home')) ?? meta?.places?.[0]
    const goals = place ? [{ type: 'Visit', target: place, priority: 0.8, why: 'To see how things stand.' }] : []
    const m = (request.meta ?? {}) as { npc?: string; intentions?: string[]; keys?: Record<string, string> }
    const intention = 'intention' in properties ? { intention: { fill: [], ...(this.intend?.(m.npc ?? '', m.intentions ?? [], m.keys ?? {}) ?? { choice: 'none' }) } } : {}
    return JSON.stringify({ goals: [...goals, { type: 'Work', target: 'none', priority: 0.5, why: 'There is work to do.' }], mood: 'calm', note: 'A plain day.', ...intention })
  }
}

/** A place as YAML with new exits, for the mock's proposals. */
function stringifyExits(place: Record<string, unknown>, exits: Record<string, unknown>): string {
  return stringify({ ...place, exits })
}
