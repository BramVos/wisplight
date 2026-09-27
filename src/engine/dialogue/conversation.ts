import { asksAge, toldAge } from '../acquaintance'
import type { Output } from '../commands'
import { parseMoney, STUIVER } from '../items'
import { MONTHS, WEEKDAYS } from '../clock'
import { areaTopicId, callName } from '../content'
import { factById, heardBy, newsAbout, playerTells } from '../news'
import type { FarName, TalkState } from '../state'
import type { World } from '../world'
import { classify, tierFor, TIER_TOKENS, TIER_WORDS, type Act, type Tier } from './acts'
import { dcFor, describeCheck, succeeded, type CheckResult } from './checks'
import { gainXp, playerCheck, XP } from '../rules/player'
import { approve, companionOf, offer, recruit } from '../social/companions'
import { silenceWitness, witnessed } from '../social/crime'
import { partyTalk } from './party'
import { closingLine, fallbackReply } from './fallback'
import { fitLength, hasAnachronism, leakedNames, looksLikeInjection, outOfCharacter, promises, unknownNames, vocabularyOf } from './guard'
import { accept, askedFor, askOffer, dayLines, kinOf, offerLine, offerLines, offersFor, proposal, proposalText, type Offer } from './offers'
import { claimValid, claimWords, parseClaim, playerSays } from '../claims'
import { afterChoice, doAfter, talkFact } from './aftertalk'
import { provocation, react, walkAway, type Reaction } from './reactions'
import { flirt } from '../social/romance'
import { tieTo } from '../people'
import type { Claim } from '../state'
import type { Knowledge, Packet } from './knowledge'
import type { LlmClient } from './llm'
import { peopleIds, systemPrompt, turnPrompt, worldFrame } from './prompt'
import { attitude, applyEffect, moodOf, relation, type Attitude } from './relations'
import { askLine, askNow, requestName, visited } from '../requests'
import { parseReply, replyJsonSchema, type Reply } from './schema'
import type { TopicRegistry } from './topics'

/** A reply comes within this many milliseconds, both tries together, or the NPC says a set line (FO, chapter 18). */
export const REPLY_WITHIN_MS = 6000

// One conversation turn, end to end (FO, chapters 9 and 10):
//   words -> injection filter -> topics and act (rules) -> check (dice)
//   -> knowledge packet -> model (or template) -> validation -> effects.

export const QUICK_OPTIONS = [
  'Who are you?',
  "What's new around here?",
  'What do you do here?',
  'What do you know about ...',
  'Where can I find ...',
  'Can you help me with ...',
  'Trade',
  'Will you come with me?',
]

const MAX_FAR = 50
/** Claims a conversation can make facts of (M10.3). */
const MAX_CLAIMS = 3
const MAX_TALK_EFFECT = 5

interface TurnOptions {
  act?: Act
  topics?: string[]
  check?: CheckResult & { about: string }
  secret?: string
  admission?: string
  echo?: boolean
  /** What the player claims (M10.3), and whether it is a lie told on purpose, with the check's weight. */
  claim?: Claim
  lie?: boolean
  claimBonus?: number
  /** A lie found out on the spot (M10.3): a reaction follows. */
  caughtLie?: boolean
}

export class Dialogue {
  constructor(
    private readonly world: World,
    private readonly topics: TopicRegistry,
    private readonly knowledge: Knowledge,
    private readonly llm: () => LlmClient | undefined,
  ) {}

  private words?: Set<string>

  /** The quest actions possible now with someone (quests/engine.ts), set by the engine (M7.2). */
  questOptions?: (npcId: string) => { key: string; intent: string }[]
  /** A quest action the voice recognised in the player's words, for the engine to carry out. */
  private chosen?: string
  /** Why the model gave no usable reply in the last turn, if it was asked. */
  private lastFailure?: string

  /** Takes the quest action the voice recognised in the last turn, if any. */
  takeChosen(): string | undefined {
    const key = this.chosen
    this.chosen = undefined
    return key
  }

  /** Every word the world's content uses, for spotting names the model made up. */
  private vocabulary(): Set<string> {
    // The chronicler's instruction is not the world: its examples are no names of it.
    this.words ??= vocabularyOf({ ...this.world.content, chronicler: undefined }, worldFrame(this.world.content), MONTHS, WEEKDAYS, (this.world.state.lore?.far ?? []).map((f) => f.name), (this.world.state.chronicle?.lore ?? []).map((l) => l.name))
    return this.words
  }

    get talk(): TalkState | undefined {
    return this.world.state.talk
  }

  // ------------------------------------------------------------ entry points

  /** Starts a talk. Opened: the NPC came up and spoke first (M10.3), so there is no greeting. */
  start(npcId: string, silent = false, opened = false): Output[] {
    const world = this.world
    const npc = world.npc(npcId)
    if (world.npcState(npcId).activity === 'asleep') return [this.asleep(npcId)]
    const rel = relation(world.state, npcId)
    const band = attitude(world, npcId).band
    let turns = 6
    if (band === 'Warm' || band === 'Devoted') turns += 2
    if (band === 'Wary' || band === 'Unfriendly' || band === 'Hostile') turns -= 3
    if (/at work|baking|cutting|grinding|seeing to|spinning/.test(world.npcState(npcId).activity)) turns -= 2
    world.state.talk = { npc: npcId, turnsLeft: Math.max(2, turns), history: [], effects: 0, revealed: [] }
    rel.familiarity = Math.min(100, rel.familiarity + 1)
    this.learn(npcId)
    if (silent) return []
    // A friend of the stranger greets them as one (M10.3).
    const friend = tieTo(world, npcId, 'player')?.role === 'friend'
    const greeting = opened ? undefined : friend ? world.say('{name} lights up. "There you are, friend."', npcId) : fallbackReply(world, npcId, 'Greet', { known: [], unknown: [] }, band)
    // Going to see someone may be what another asked of the player.
    const visits = visited(world, npcId).map((r) => ({ kind: 'narration' as const, text: `You have looked in on ${callName(npc)}, as ${callName(world.npc(r.npc))} asked.` }))
    // Someone who needs help asks the player, once, when they next talk (FO, chapter 14).
    const request = askNow(world, npcId)
    // What they ask of the stranger is an offer the other way round (M10.3): YES is the stranger's word.
    const ask = request ? askOffer(world, npcId, request) : undefined
    if (ask) this.talk!.proposal = ask
    return [
      { kind: 'system', text: `You are talking with ${npc.short}. Type what you want to say, pick a number, or BYE to stop.` },
      ...(greeting ? [{ kind: 'speech' as const, text: greeting }] : []),
      ...visits,
      ...(request ? [{ kind: 'speech' as const, text: `"${askLine(world, request)}"` }, { kind: 'system' as const, text: `New in your journal: ${requestName(world, request)}.` }] : []),
      ...(ask ? [{ kind: 'system' as const, text: proposalText(world, npcId, ask) }] : []),
      this.options(),
    ]
  }

  /** Why a newly named far-away place cannot stand, or undefined when it can. */
  private checkFar(npcId: string, fresh: Reply['names'], reply: string): string | undefined {
    if (fresh.length === 0) return undefined
    if (fresh.length > 1) return 'you named more than one new place. Name at most one.'
    const name = fresh[0]!.text.trim()
    if (!/^\p{Lu}[\p{L}'’-]*(\s[\p{L}'’-]+){0,3}$/u.test(name)) return `"${name}" is not a proper place name.`
    const far = this.world.state.lore?.far ?? []
    const today = far.filter((f) => f.by === npcId && this.world.now - f.t < 24 * 60).length
    if (today >= 2 || far.length >= MAX_FAR) return `you may not name new places now. Use only names you were given.`
    return undefined
  }

  private registerFar(npcId: string, name: string, kind: FarName['kind'], replyText: string): void {
    const lore = (this.world.state.lore ??= { far: [] })
    const base = `far_${name.toLowerCase().replace(/[^\p{L}]+/gu, '_').replace(/^_|_$/g, '')}`
    let id = base
    for (let n = 2; this.topics.entries.has(id); n++) id = `${base}_${n}`
    const line = replyText.split(/(?<=[.!?])\s+/).find((s) => s.includes(name)) ?? replyText
    lore.far.push({ id, name, kind, line: line.replace(/["“”]/g, '').trim().slice(0, 200), by: npcId, t: this.world.now, known_by: [npcId] })
    this.topics.addDuringPlay({ id, kind: 'place', name, aliases: [name] })
    this.knowledge.forget(npcId)
    for (const word of vocabularyOf(name)) this.vocabulary().add(word)
    this.learn(id)
  }

  private asleep(npcId: string): Output {
    return { kind: 'narration', text: this.world.say(`{name} is asleep. WAKE ${callName(this.world.npc(npcId)).toUpperCase()} if you must.`, npcId) }
  }

  end(farewell = true): Output[] {
    const talk = this.talk
    if (!talk) return [{ kind: 'error', text: "You aren't talking to anyone." }]
    this.wrapUp(talk)
    this.world.state.talk = undefined
    if (!farewell) return []
    const band = attitude(this.world, talk.npc).band
    return [{ kind: 'speech', text: fallbackReply(this.world, talk.npc, 'Farewell', { known: [], unknown: [] }, band) }]
  }

  options(): Output {
    return { kind: 'system', text: QUICK_OPTIONS.map((q, i) => `${i + 1} ${q}`).join('   ') }
  }

  async quick(n: number): Promise<Output[]> {
    const talk = this.talk
    if (!talk) return [{ kind: 'error', text: "You aren't talking to anyone." }]
    switch (n) {
      case 1:
        return this.turn(talk.npc, 'Who are you?', { act: 'AskAboutSelf', topics: [talk.npc], echo: true })
      case 2: {
        return this.turn(talk.npc, "What's new around here?", { act: 'AskRumors', topics: this.rumours(talk.npc), echo: true })
      }
      case 3: {
        const work = this.world.npc(talk.npc).work
        return this.turn(talk.npc, 'What do you do here?', { act: 'AskWork', topics: work ? [work] : [], echo: true })
      }
      case 4:
        return [{ kind: 'system', text: `Type ASK ABOUT <topic>. You know about: ${this.journalNames(8)}.` }]
      case 5:
        return [{ kind: 'system', text: 'Type WHERE IS <place or person>.' }]
      case 6:
        return this.turn(talk.npc, 'Can you help me?', { act: 'Request', echo: true })
      case 7:
        return [{ kind: 'system', text: 'Type LIST to see what is for sale here, then BUY or SELL.' }]
      case 8:
        return this.turn(talk.npc, 'Will you come with me?', { act: 'Recruit', echo: true })
      default:
        return [this.options()]
    }
  }

  async ask(npcId: string, question: string): Promise<Output[]> {
    const about = bare(question)
    // "Ask Pip about his father", "about your father": the NPC's own people (M10.3).
    const topic = this.topics.find(about) ?? kinOf(this.world, npcId, about.replace(/^(his|her|their)\b/i, 'your'))[0]
    const story = /\b(story|legend|tale|verhaal|legende)\b/i.test(about)
    const act: Act = story ? 'AskStory' : 'AskAbout'
    return this.turn(npcId, `What do you know about ${about}?`, { act, topics: topic ? [topic] : [], echo: true, ...this.confide(npcId, topic) })
  }

  async where(npcId: string, place: string): Promise<Output[]> {
    const about = bare(place)
    const topic = this.topics.find(about) ?? kinOf(this.world, npcId, about.replace(/^(his|her|their)\b/i, 'your'))[0]
    return this.turn(npcId, `Where can I find ${about}?`, { act: 'AskDirections', topics: topic ? [topic] : [], echo: true, ...this.confide(npcId, topic) })
  }

  /**
   * Someone the NPC holds dear (Warm or better) who asks about the right thing
   * hears the secret without a check (FO, chapter 8: sharing a secret).
   */
  private confide(npcId: string, topic: string | undefined): { secret?: string; admission?: string } {
    if (!topic) return {}
    const band = attitude(this.world, npcId).band
    if (band !== 'Warm' && band !== 'Devoted') return {}
    if (!this.talk || this.talk.npc !== npcId) this.start(npcId, true)
    const secret = this.world.npc(npcId).secrets.find((s) => s.about.includes(topic) && !this.talk!.revealed.includes(s.id))
    if (!secret) return {}
    this.talk!.revealed.push(secret.id)
    ;(this.world.state.flags ??= {})[`secret:${npcId}:${secret.id}`] = true
    gainXp(this.world, XP.secret, `${callName(this.world.npc(npcId))} told you a secret`)
    if (secret.teaches) this.teach(npcId, secret.teaches)
    return { secret: secret.text, admission: secret.admission }
  }

  /** A secret that shows the way: the player now knows it, from this NPC, at the full level. */
  private teach(npcId: string, topic: string): void {
    this.learn(topic)
    this.noteSources(npcId, [{ topic, level: 3 }])
  }

  async tell(npcId: string, subject: string): Promise<Output[]> {
    const about = bare(subject)
    const topic = this.topics.find(about)
    // Something the player heard about it is passed on (M9.4): "tell sijbrand about the dyke" warns him of the leak.
    const news = this.newsOnTopic(about, topic)
    if (news) {
      const world = this.world
      const name = callName(world.npc(npcId))
      if (!this.talk || this.talk.npc !== npcId) this.start(npcId, true)
      const knew = Boolean(world.state.news?.heard[npcId]?.[news.id])
      const h = playerTells(world, npcId, news.id)
      const reaction = knew
        ? `${name} nods. "I'd heard."`
        : h?.stance === 'rejects'
          ? `${name} doesn't believe a word of it, and says so.`
          : h?.stance === 'doubts'
            ? `${name} looks at you a long moment. "We'll see."`
            : `${name} listens, and takes it seriously.`
      return [
        { kind: 'text', text: `You: "${news.text.village}"` },
        { kind: 'narration', text: reaction },
      ]
    }
    // Not news the player heard but something they say is so (M10.3): a claim, in the world's own words.
    const claim = parseClaim(this.world, [...new Set([...(topic ? [topic] : []), ...this.topics.recognise(about)])], about.replace(/^that\s+/i, ''))
    if (claim && claimValid(this.world, claim)) return this.turn(npcId, capitalise(about.replace(/^that\s+/i, '')), { act: 'Tell', topics: this.topics.recognise(about), echo: true, claim })
    return this.turn(npcId, `Let me tell you about ${about}.`, { act: 'Tell', topics: topic ? [topic] : [], echo: true })
  }

  /** The newest, weightiest thing the player heard that the words point to: its topic, its place or its title. */
  private newsOnTopic(words: string, topic: string | undefined) {
    const heard = this.world.state.news?.heard['player'] ?? {}
    const lower = words.toLowerCase().replace(/^the /, '')
    const matches = Object.keys(heard)
      .map((id) => factById(this.world, id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f) && f!.belang >= 2)
      .filter((f) => (topic && (f.about.includes(topic) || f.place === topic || f.claim?.subject === topic)) || (lower.length >= 3 && f.title.toLowerCase().includes(lower)))
    return matches.sort((a, b) => b.belang - a.belang || b.t - a.t)[0]
  }

  async say(npcId: string, text: string): Promise<Output[]> {
    return this.turn(npcId, text, {})
  }

  insight(npcId: string): Output[] {
    const npc = this.world.npc(npcId)
    if (!this.talk || this.talk.npc !== npcId) this.start(npcId, true)
    if (this.talk!.revealed.includes('tried:insight')) return [{ kind: 'error', text: `You have already tried to read ${callName(npc)} this conversation.` }]
    this.talk!.revealed.push('tried:insight')
    const secret = npc.secrets.find((s) => !this.talk?.revealed.includes(`hint:${s.id}`))
    const result = playerCheck(this.world, 'insight', secret?.dc ?? 15)
    const lines: Output[] = [{ kind: 'check', text: describeCheck(result) }]
    if (secret && succeeded(result)) {
      this.talk?.revealed.push(`hint:${secret.id}`)
      lines.push({ kind: 'narration', text: secret.hint })
    } else {
      lines.push({ kind: 'narration', text: `You can't read anything behind ${callName(npc)}'s face.` })
    }
    return lines
  }

  async influence(kind: 'persuade' | 'deceive' | 'intimidate' | 'bribe', npcId: string, text: string): Promise<Output[]> {
    const world = this.world
    const npc = world.npc(npcId)
    const band = attitude(world, npcId).band
    const lines: Output[] = []
    let result: CheckResult
    let about: string

    if (kind === 'bribe') {
      const amount = parseMoney(text, world.coins)
      if (!amount) return [{ kind: 'error', text: `Bribe with how much? For example: BRIBE ${callName(npc).toUpperCase()} 2 ${(world.coins[1] ?? world.coins[0]!).plural?.toUpperCase() ?? `${(world.coins[1] ?? world.coins[0]!).name.toUpperCase()}S`}.` }]
      if (amount > world.state.player.money) return [{ kind: 'error', text: `You only have ${world.money(world.state.player.money)}.` }]
      result = playerCheck(world, 'persuasion', dcFor(18 - Math.floor(amount / STUIVER), band, npc.personality.honesty * 2))
      about = `bribe them with ${world.money(amount)}`
      if (succeeded(result)) {
        world.state.player.money -= amount
        world.npcState(npcId).money += amount
      }
    } else {
      const skill = { persuade: 'persuasion', deceive: 'deception', intimidate: 'intimidation' }[kind]
      const extra = kind === 'intimidate' ? npc.personality.courage * 2 : kind === 'deceive' ? npc.personality.curiosity : 0
      result = playerCheck(world, skill, dcFor(15, band, extra))
      about = `${kind} them${text ? ` ${text.replace(/^to\s+/i, 'to ')}` : ''}`
    }
    lines.push({ kind: 'check', text: describeCheck(result) })

    const win = succeeded(result)
    if (kind === 'intimidate') {
      applyEffect(world, npcId, 'fear', win ? 10 : 2)
      applyEffect(world, npcId, 'affinity', -5)
    } else if (kind === 'deceive' && !win) {
      applyEffect(world, npcId, 'trust', result.degree === 'critical failure' ? -15 : -8)
    } else if (kind === 'persuade' && result.degree === 'critical failure') {
      applyEffect(world, npcId, 'trust', -3)
    }

    // A witness who is paid, scared or talked round keeps quiet about what they saw (FO, chapter 8).
    if (win && kind !== 'deceive' && witnessed(world, npcId)) {
      const quiet = silenceWitness(world, npcId, kind === 'bribe' ? 'bribe' : kind === 'intimidate' ? 'intimidate' : 'persuade')
      if (quiet) world.notices.push(quiet)
    }

    // A persuaded NPC may admit a secret the player has noticed, or asked about.
    let secret: string | undefined
    let admission: string | undefined
    if (win && kind !== 'deceive') {
      const mentioned = new Set(this.topics.recognise(text))
      const found = npc.secrets.find((s) => this.talk?.revealed.includes(`hint:${s.id}`) || [...mentioned].some((t) => s.text.toLowerCase().includes(this.topics.name(t).toLowerCase().split(' ')[0]!)))
      if (found) {
        secret = found.text
        admission = found.admission
        this.talk?.revealed.push(found.id)
        // Quests react to what the player has found out (quests/engine.ts).
        ;(world.state.flags ??= {})[`secret:${npcId}:${found.id}`] = true
        if (found.teaches) this.teach(npcId, found.teaches)
      }
    }
    const words = kind === 'bribe' ? `Here, for your trouble.` : text || `(tries to ${kind} ${callName(npc)})`
    // DECEIVE is lying for real (M10.3): a claim that is not so, with the stranger as its source; the check weighs it.
    const lie = kind === 'deceive' ? parseClaim(world, this.topics.recognise(text), text.replace(/^(that|them that|him that|her that)\s+/i, '')) : undefined
    const claimed = lie && claimValid(world, lie) ? { claim: lie, lie: true, claimBonus: win ? 40 : result.degree === 'critical failure' ? -60 : -30 } : {}
    // A lie seen through on the spot is found out there and then (M10.3): a reaction follows.
    if (kind === 'deceive' && result.degree === 'critical failure') Object.assign(claimed, { caughtLie: true })
    lines.push(...(await this.turn(npcId, words, { act: kind === 'bribe' ? 'Bribe' : (capitalise(kind) as Act), check: { ...result, about }, secret, admission, ...claimed })))
    return lines
  }

  /** TALK PARTY, ASK PARTY ABOUT <topic>: every companion at once, in one call (FO, chapter 13). */
  async party(words: string): Promise<Output[]> {
    return partyTalk(this.world, this.topics, this.knowledge, this.llm(), words, this.vocabulary())
  }

  journal(): Output {
    const journal = this.world.state.player.journal ?? {}
    const groups: Record<string, string[]> = { People: [], Places: [], Lore: [], Things: [] }
    for (const id of Object.keys(journal).sort()) {
      const kind = this.topics.kind(id)
      const name = this.topics.name(id)
      if (kind === 'person') groups['People']!.push(name)
      else if (kind === 'place' || kind === 'area') groups['Places']!.push(name)
      else if (kind === 'lore' || kind === 'fact') groups['Lore']!.push(name)
      else if (kind === 'item') groups['Things']!.push(name)
    }
    const lines = Object.entries(groups)
      .filter(([, names]) => names.length > 0)
      .map(([group, names]) => `${group}: ${names.join(', ')}.`)
    return { kind: 'system', text: lines.length ? lines.join('\n') : 'Your journal is still empty.' }
  }

  /** Adds topics to the player's journal. */
  /** Fresh news first, then the standing talk of the village. */
  private rumours(npcId: string): string[] {
    this.syncNews()
    // The chronicler's news of the day for the NPC's own area comes first.
    const area = this.world.location(this.world.npc(npcId).home).area
    const today = this.knowledge.level(npcId, `news_${area}`) >= 2 ? [`news_${area}`] : []
    // Not the stranger's own coming, told to the stranger (found in the M9.4 playtest: at the inn, everyone's
    // news was the stranger who came in that evening, and the leak in the dyke went untold). A theft the
    // stranger did is still news to complain of, to the thief's face.
    const fresh = newsAbout(this.world, npcId, [], 8)
      .filter(({ fact }) => fact.kind !== 'stranger')
      .slice(0, 2)
      .map(({ fact }) => fact.id)
    const standing = [...this.world.content.topics.values()].filter((t) => t.standing_talk).map((t) => t.id).sort().filter((t) => this.knowledge.level(npcId, t) >= 2)
    return [...today, ...fresh, ...standing].slice(0, 2)
  }

  /** Facts, the lore of this game and the news of the day are topics too: they can be asked about and go in the journal. */
  syncNews(): void {
    for (const fact of this.world.state.news?.facts ?? []) {
      if (!this.topics.entries.has(fact.id)) this.topics.addDuringPlay({ id: fact.id, kind: 'fact', name: fact.title, aliases: [] })
    }
    for (const lore of this.world.state.chronicle?.lore ?? []) {
      if (this.topics.entries.has(lore.id)) continue
      this.topics.addDuringPlay({ id: lore.id, kind: 'lore', name: lore.name, aliases: [lore.name.toLowerCase().replace(/^the /, '')] })
      for (const word of vocabularyOf(lore.name)) this.vocabulary().add(word)
    }
    for (const area of Object.keys(this.world.state.chronicle?.news ?? {})) {
      const id = `news_${area}`
      if (!this.topics.entries.has(id)) this.topics.addDuringPlay({ id, kind: 'fact', name: `news in ${this.world.content.areas.get(area)?.name ?? area}`, aliases: [] })
    }
  }

  /** The player hears the news the NPC passed on, one step less sure. */
  private hearFrom(npcId: string, factIds: string[]): void {
    const npcHeard = this.world.state.news?.heard[npcId] ?? {}
    for (const id of factIds) {
      const heard = npcHeard[id]
      if (!heard) continue
      const mine = heardBy(this.world, 'player')
      if (mine[id]) continue
      mine[id] = { level: heard.level, reliability: Math.round(heard.reliability * 0.9 * 100) / 100, from: npcId, t: this.world.now, grown: heard.grown }
      // Where it happened, the player has heard of now (found in the M9.4 playtest: told of the leak at
      // Oude Zijl, the stranger could not walk there).
      const place = factById(this.world, id)?.place
      const where = place ? this.world.content.locations.get(place) : undefined
      if (where) this.learn(areaTopicId(this.world.content, where.area))
    }
  }

  /** Remembers who told the player about what, for the journal. */
  private noteSources(npcId: string, topics: { topic: string; level: number }[]): void {
    const sources = (this.world.state.player.sources ??= {})
    for (const { topic, level } of topics) {
      const list = (sources[topic] ??= [])
      const existing = list.find((s) => s.from === npcId)
      if (existing) existing.level = Math.max(existing.level, level)
      else list.push({ from: npcId, t: this.world.now, level })
    }
  }

  learn(...ids: string[]): void {
    const journal = (this.world.state.player.journal ??= {})
    for (const id of ids) {
      if (!this.topics.entries.has(id) || journal[id] !== undefined) continue
      journal[id] = this.world.now
      // Knowledge is experience too (FO, chapter 11): a piece of lore learned.
      if (this.topics.kind(id) === 'lore' && !id.startsWith('fact_')) {
        gainXp(this.world, XP.lore, `you learned of ${this.topics.name(id)}`)
        approve(this.world, 'learn_old_story')
      }
    }
  }

  // ------------------------------------------------------------ one turn

  private async turn(npcId: string, text: string, options: TurnOptions): Promise<Output[]> {
    const world = this.world
    const npc = world.npc(npcId)
    if (world.npcState(npcId).location !== world.state.player.location) {
      world.state.talk = undefined
      return [{ kind: 'error', text: `${npc.short} isn't here any more.` }]
    }
    if (world.npcState(npcId).activity === 'asleep') {
      world.state.talk = undefined
      return [this.asleep(npcId)]
    }
    if (!this.talk || this.talk.npc !== npcId) this.start(npcId, true)
    const talk = this.talk!
    const echo: Output[] = options.echo ? [{ kind: 'text', text: `You: "${text}"` }] : []
    const band = attitude(world, npcId)

    // 1. Injection and meta talk never reach the model.
    if (looksLikeInjection(text)) {
      talk.turnsLeft--
      return [...echo, { kind: 'speech', text: fallbackReply(world, npcId, 'OffTopic', { known: [], unknown: [] }, band.band) }, ...this.maybeClose()]
    }

    // 2. Topics and act by rules.
    this.syncNews()
    let topics = options.topics ?? [...new Set([...this.topics.recognise(text), ...kinOf(world, npcId, text)])]
    const act = options.act ?? classify(text, topics.length)
    if (act === 'AskRumors' && topics.length === 0) topics = this.rumours(npcId)
    const packet = this.knowledge.packet(npcId, topics, act === 'AskStory' || act === 'AskAbout')
    let tier: Tier = tierFor(act)
    if ((act === 'AskStory' || /\b(story|legend|tale|verhaal)\b/i.test(text)) && packet.known.some((k) => k.story)) tier = 'story'
    if (tier !== 'story') for (const k of packet.known) delete k.story

    // 3. The model, or the designer's templates.
    const memories = (world.npcState(npcId).memory ?? []).slice(-5).map((m) => m.note)
    // What the player says is a claim, heard from the stranger and judged by the game (M10.3).
    const claim = options.claim ?? (options.check || /\?\s*$/.test(text) ? undefined : parseClaim(world, topics, text))
    // A few claims a talk, no more (M10.3, the limits): after that, words are only words.
    const said = claim && claimValid(world, claim) && (talk.claims = (talk.claims ?? 0) + 1) <= MAX_CLAIMS ? playerSays(world, npcId, claim, { ...(options.lie ? { lie: true } : {}), ...(options.claimBonus ? { bonus: options.claimBonus } : {}) }) : undefined
    const believed = said ? `The stranger says ${claimWords(world, claim!)}. You ${said.stance === 'believes' ? 'believe it' : said.stance === 'doubts' ? 'are not sure it is true' : 'do not believe it'}; answer that way.` : undefined
    // Flirting in free talk goes by the same formula as FLIRT (M10.3); the voice words what it decided.
    const flirted = act === 'Flirt' && !options.check ? flirtIn(world, npcId) : undefined
    // An insult, a threat or a lie found out: the engine decides the reaction; the voice words it (M10.3).
    const provoked = provocation(act, { ...(options.caughtLie ? { caughtLie: true } : {}), ...(options.check ? { failedThreat: !succeeded(options.check) } : {}) })
    const reaction = provoked ? react(world, npcId, provoked) : undefined
    const decision = [act === 'Recruit' ? recruitDecision(world, npcId, band.band) : undefined, believed, reaction?.decision, flirted?.decision].filter(Boolean).join(' ') || undefined
    const offered = options.echo || options.check ? [] : (this.questOptions?.(npcId) ?? [])
    // What this person can do for the player now (M10.3): the game decides, the voice chooses and words it.
    const offers = options.check || options.secret || act === 'Recruit' ? [] : offersFor(world, npcId, topics, text)
    // Asked about someone who matters: news with witnesses, before anyone answers (M10.3).
    const made = talkFact(world, npcId, topics, act)
    if (made) (talk.facts ??= []).push(made.id)
    const reply = await this.callModel(npcId, text, { act, tier, packet, band, memories, check: options.check, secret: options.secret, decision, spokenTopics: this.topics.recognise(text), offered, offers })
    // The player's words meant a quest action: the engine carries it out, and its text is the answer.
    if (reply?.quest_action && offered.some((o) => o.key === reply.quest_action)) {
      this.chosen = reply.quest_action
      talk.history.push({ speaker: 'player', text })
      return echo
    }
    // The offer the player asked for: the voice's choice, or by the rules without a model.
    const asked = reply ? offers.find((o) => o.key === reply.action) : askedFor(offers, text)
    const replyText = reply
      ? reply.reply
      : reaction
        ? reactionLine(world, npcId, reaction.reaction)
        : flirted
          ? flirted.line
          : asked
          ? offerLine(world, npcId, asked)
          : said
            ? claimLine(world, npcId, said.stance)
            : options.secret
        ? world.say(`{name} glances at the door and lowers {their} voice. "${options.admission ?? 'All right. But it stays between us.'}"`, npcId)
        : options.check && !succeeded(options.check)
          ? world.say(`{name} shakes {their} head. "I don't think so."`, npcId)
          : fallbackReply(world, npcId, act, packet, band.band)

    // 4. Effects, bounded by the system.
    if (reply) {
      for (const effect of reply.effects.slice(0, 1)) {
        const delta = Math.max(-3, Math.min(3, effect.delta))
        const room = MAX_TALK_EFFECT - Math.abs(talk.effects)
        const applied = Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, room))
        if (applied !== 0) {
          applyEffect(world, npcId, effect.type, applied)
          talk.effects += applied
        }
      }
    }
    const rel = relation(world.state, npcId)
    rel.familiarity = Math.min(100, rel.familiarity + 2)
    // Asked their age and they answered: the journal knows it from now on.
    if (reply && asksAge(world, npcId, text)) toldAge(world, npcId)

    // 5. New far-away places become part of this game's lore.
    for (const name of reply?.names ?? []) {
      if (name.new_kind !== 'none' && !this.topics.find(name.text) && replyText.includes(name.text.trim())) this.registerFar(npcId, name.text.trim(), name.new_kind, replyText)
    }

    // 6. Journal and memory.
    const allowed = new Set([...packet.known.map((k) => k.topic), ...(packet.referral ? [packet.referral.npc] : [])])
    const mentioned = (reply?.mentioned_topics ?? []).filter((t) => allowed.has(t))
    this.noteSources(npcId, packet.known.map((k) => ({ topic: k.topic, level: k.level })))
    const told = packet.known.flatMap((k) => [k.topic, ...(k.news ? newsAbout(world, npcId, [k.topic]).map(({ fact }) => fact.id) : [])]).filter((id) => id.startsWith('fact_'))
    this.hearFrom(npcId, told)
    this.learn(...told, ...packet.known.map((k) => k.topic), ...mentioned, ...(packet.referral && replyText.includes(packet.referral.call) ? [packet.referral.npc] : []))
    const memory = (world.npcState(npcId).memory ??= [])
    memory.push({ t: world.now, note: reply?.memory_note || `The stranger talked to me${topics[0] ? ` about ${this.topics.name(topics[0])}` : ''}.`, topics, valence: 0 })
    if (memory.length > 30) memory.splice(0, memory.length - 30)

    // One thing the NPC does after the talk, from the voice (M10.3).
    if (reply && reply.after.kind !== 'none' && !talk.after && doAfter(world, npcId, reply.after, talk.facts ?? [])) talk.after = true

    // Names the NPC brought up of its own accord and knows: the journal has them, heard from this NPC (M10.3).
    // People, places and tales only: "I saw him" is no saw.
    const named = this.topics.recognise(replyText).filter((t) => t !== npcId && !told.includes(t) && ['person', 'place', 'area', 'lore'].includes(this.topics.kind(t) ?? '') && this.knowledge.level(npcId, t) >= 1)
    if (named.length) {
      this.noteSources(npcId, named.map((t) => ({ topic: t, level: this.knowledge.level(npcId, t) })))
      this.learn(...named)
    }

    talk.history.push({ speaker: 'player', text }, { speaker: 'npc', text: replyText })
    if (talk.history.length > 12) talk.history.splice(0, talk.history.length - 12)
    talk.turnsLeft--
    // An offer that goes through becomes an agreement and starts; one the NPC proposes waits for the player's yes.
    const offerOut: Output[] = []
    let offerEnds = false
    if (asked?.decision === 'yes' && !reaction) {
      const done = accept(world, npcId, asked)
      offerOut.push(...done.outputs)
      offerEnds = done.ends
    } else if (!asked && !reaction) {
      const proposed = reply ? offers.find((o) => o.key === reply.propose && o.decision === 'yes') : proposal(offers, act)
      if (proposed) {
        talk.proposal = proposed
        offerOut.push({ kind: 'system', text: proposalText(world, npcId, proposed) })
      }
    }
    // When the model was asked and gave nothing usable, say so, so a stock line is not mistaken for an answer.
    const failure: Output[] = !reply && this.lastFailure ? [{ kind: 'system', text: `(No answer from the AI: ${this.lastFailure}. A stock line stands in.)` }] : []
    // A reaction that ends it (M10.3): walking off, shouting for help, going for the stranger, or the shop shut.
    if (reaction && reaction.reaction !== 'let_pass') {
      this.wrapUp(talk)
      world.state.talk = undefined
      const gone = reaction.reaction === 'walk_away' ? [{ kind: 'narration' as const, text: walkAway(world, npcId) }] : []
      return [...echo, { kind: 'speech', text: replyText }, ...failure, ...gone]
    }
    // Off to do it: the talk ends there, without a closing line.
    if (offerEnds) {
      this.wrapUp(talk)
      world.state.talk = undefined
      return [...echo, { kind: 'speech', text: replyText }, ...failure, ...offerOut]
    }
    const ends = reply?.ends_conversation === true
    return [...echo, { kind: 'speech', text: replyText }, ...failure, ...offerOut, ...(ends ? this.closeNow() : this.maybeClose())]
  }

  /** YES or NO to what the NPC proposed (M10.3): only a yes makes it happen. */
  answer(yes: boolean): Output[] {
    const talk = this.talk
    const offer = talk?.proposal
    if (!talk || !offer) return []
    talk.proposal = undefined
    const world = this.world
    if (!yes) return [{ kind: 'speech', text: world.say('{name} shrugs. "Suit yourself."', talk.npc) }]
    const done = accept(world, talk.npc, offer)
    if (done.ends) {
      this.wrapUp(talk)
      world.state.talk = undefined
    }
    return [{ kind: 'speech', text: offerLine(world, talk.npc, offer) }, ...done.outputs]
  }

  /** The proposal waiting for the player's answer, in words, for the conversation bar. */
  proposalNow(): string | undefined {
    const talk = this.talk
    return talk?.proposal ? proposalText(this.world, talk.npc, talk.proposal) : undefined
  }

  private maybeClose(): Output[] {
    const talk = this.talk
    if (!talk || talk.turnsLeft > 0) return []
    return this.closeNow()
  }

  /** When a talk ends: without a model, the rules choose the one thing the NPC does after it (M10.3). */
  private wrapUp(talk: TalkState): void {
    if (talk.after || this.llm()) return
    const choice = afterChoice(this.world, talk.npc, talk.facts ?? [])
    if (choice && doAfter(this.world, talk.npc, choice, talk.facts ?? [])) talk.after = true
  }

  private closeNow(): Output[] {
    const talk = this.talk
    if (!talk) return []
    this.wrapUp(talk)
    this.world.state.talk = undefined
    return [{ kind: 'narration', text: closingLine(this.world, talk.npc) }]
  }

  private async callModel(
    npcId: string,
    text: string,
    ctx: {
      act: Act
      tier: Tier
      packet: Packet
      band: ReturnType<typeof attitude>
      memories: string[]
      check?: CheckResult & { about: string }
      secret?: string
      decision?: string
      spokenTopics: string[]
      offered?: { key: string; intent: string }[]
      offers?: Offer[]
    },
  ): Promise<Reply | undefined> {
    this.lastFailure = undefined
    const llm = this.llm()
    if (!llm) return undefined
    const world = this.world
    const talk = this.talk
    const present = world.npcsAt(world.state.player.location)
    const location = world.location(world.state.player.location)
    const allowedTopics = [...new Set([...ctx.packet.known.map((k) => k.topic), ...(ctx.packet.referral ? [ctx.packet.referral.npc] : []), ...present])]
    // Names the NPC may say: what it knows, who is here, where it is, and whatever the player just said.
    // And the names in what it was given to tell (found by the M9.3 trial): a story of the Haakman names the Blackmere.
    const given = ctx.packet.known.flatMap((k) => [...k.facts, k.story ?? '', ...(k.news ?? []), k.toldBy ?? ''])
    const allowedNames = new Set([...this.knowledge.knownTopics(npcId), ...peopleIds(world, npcId), ...present, location.id, `area_${location.area}`, ...ctx.spokenTopics, ...allowedTopics, ...this.topics.recognise(given.join(' '))])

    let prompt = turnPrompt(world, {
      npcId,
      act: ctx.act,
      tier: ctx.tier,
      attitude: ctx.band,
      mood: moodOf(world, npcId),
      packet: ctx.packet,
      check: ctx.check,
      secret: ctx.secret,
      decision: ctx.decision,
      memories: ctx.memories,
      history: talk?.history ?? [],
      playerText: text,
    })
    const offered = ctx.offered ?? []
    const offers = ctx.offers ?? []
    // Time facts from the schedules (M10.3): their own day, and the day of the people the talk is about.
    const days = dayLines(world, npcId, [...ctx.packet.known.map((k) => k.topic), ...offers.flatMap((o) => (o.person ? [o.person] : []))])
    if (days.length) prompt += `\n${days.join('\n')}`
    if (offers.length) prompt += `\n${offerLines(world, npcId, offers).join('\n')}`
    if (talk && !talk.after) prompt += '\nAFTER THE TALK: if this talk makes you want to do one thing of your own later (tell someone of your own people, or go somewhere), put it in after; at most once in a talk. Otherwise after.kind is none.'
    if (offered.length) {
      prompt += `\nQUEST ACTIONS: if the player's words clearly mean one of these, put its key in quest_action and the game carries it out; otherwise quest_action is "none".\n${offered.map((o) => `  ${o.key}: the player wants to ${o.intent}`).join('\n')}`
    }

    // A reply comes within six seconds or not at all, over both tries (FO, chapter 18): then the set line.
    const started = Date.now()
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: string
      try {
        raw = (
          await llm.complete({
            role: 'voice',
            system: systemPrompt(world, npcId),
            prompt,
            schemaName: 'npc_reply',
            schema: replyJsonSchema(allowedTopics, offered.map((o) => o.key), offers, !talk?.after),
            maxTokens: TIER_TOKENS[ctx.tier],
            timeoutMs: REPLY_WITHIN_MS - (Date.now() - started),
            meta: {
              npcName: callName(world.npc(npcId)),
              act: ctx.act,
              wordLimit: TIER_WORDS[ctx.tier],
              known: ctx.packet.known,
              unknown: ctx.packet.unknown,
              referral: ctx.packet.referral,
              check: ctx.check?.degree,
              secret: ctx.secret,
              questActions: offered,
              playerText: text,
              offers,
              ...(talk && !talk.after ? { after: afterChoice(world, npcId, talk.facts ?? []) } : {}),
            },
          })
        ).text
      } catch (error) {
        this.lastFailure = error instanceof Error ? error.message : String(error)
        return undefined
      }
      const reply = parseReply(raw)
      if (!reply) {
        llm.report?.({ reason: 'schema' })
        continue
      }
      const fitted = fitLength(reply.reply, ctx.tier)
      if (hasAnachronism(fitted)) {
        llm.report?.({ reason: 'anachronism' })
        prompt += '\nNOTE: your last reply used words that do not exist in this world. Answer again without them.'
        continue
      }
      if (outOfCharacter(fitted)) {
        llm.report?.({ reason: 'character' })
        prompt += '\nNOTE: your last reply stepped out of the world. Answer again as yourself, in plain speech.'
        continue
      }
      // A promise the game did not offer never stands in the text (M10.3): the deed hangs on a chosen yes.
      const doing = offers.find((o) => o.key === reply.action && o.decision === 'yes') ?? offers.find((o) => o.key === reply.propose && o.decision === 'yes')
      if (promises(fitted) && !doing && !ctx.decision && reply.quest_action === 'none') {
        llm.report?.({ reason: 'promise' })
        prompt += '\nNOTE: your last reply promised to do something the game did not offer. Answer again without promising it: choose an OFFER with decision yes, or say what you can and cannot do.'
        continue
      }
      const said = `${fitted} ${reply.memory_note}`
      // A name cut off with a reply that ran too long does not count.
      const fresh = reply.names.filter((n) => n.new_kind !== 'none' && !this.topics.find(n.text) && fitted.includes(n.text.trim()))
      const farProblem = this.checkFar(npcId, fresh, fitted)
      if (farProblem) {
        llm.report?.({ reason: 'invented' })
        prompt += `\nNOTE: ${farProblem} Answer again.`
        continue
      }
      const leaks = leakedNames(said, this.topics.properNames(), allowedNames)
      if (leaks.length > 0) {
        llm.report?.({ reason: 'leak' })
        prompt += `\nNOTE: you mentioned ${leaks.join(', ')}, which you know nothing about. Answer again without them.`
        continue
      }
      const invented = unknownNames(said, this.vocabulary(), vocabularyOf(text, ...fresh.map((n) => n.text), ...(talk?.history ?? []).filter((h) => h.speaker === 'player').map((h) => h.text)))
      if (invented.length > 0) {
        llm.report?.({ reason: 'invented' })
        prompt += `\nNOTE: you used ${invented.join(', ')}, which ${invented.length === 1 ? 'does' : 'do'} not exist in this world. Never make up names. Use only names from PEOPLE YOU KNOW, KNOWLEDGE and SCENE, or say you don't know.`
        continue
      }
      return { ...reply, reply: fitted }
    }
    this.lastFailure = 'both replies failed the checks'
    return undefined
  }

  private journalNames(limit: number): string {
    const ids = Object.keys(this.world.state.player.journal ?? {})
    return ids.length ? ids.slice(-limit).map((id) => this.topics.name(id)).join(', ') : 'nothing yet'
  }
}

// Whether someone joins the player is the game's call, not the model's (FO, chapter 13):
// the recruiting formula decides, and a yes is carried out at once.
function recruitDecision(world: World, npcId: string, band: Attitude): string {
  void band
  if (companionOf(world, npcId)) return 'You are already travelling with the stranger. Say so.'
  const o = offer(world, npcId)
  if (o.decision === 'refuse') return `You will not come along. Say no in your own way and give one or two of these reasons: ${o.reasons.join('; ') || 'you have your own life to see to'}.`
  const joined = recruit(world, npcId)
  world.notices.push(...joined.filter((l) => l.kind === 'system').map((l) => l.text))
  const terms = `${o.terms.wage} duiten a day${o.terms.until ? `, for ${Math.round((o.terms.until - world.now) / (24 * 60))} days` : ''}${o.terms.limits.length ? ', and some places you will not go' : ''}`
  return o.decision === 'join' ? `You agree to come along with the stranger. Say yes in your own way. Your wage: ${terms}.` : `You agree to come, on terms: ${terms}. Say yes and name your terms plainly.`
}

/**
 * Flirting in free talk (M10.3): the FLIRT formula decides, with the same
 * limits (never a child); the voice gets what happened as a decision, and
 * without a model the formula's own line stands.
 */
function flirtIn(world: World, npcId: string): { decision: string; line: string } {
  if (world.npc(npcId).child || world.npc(npcId).age < 18) return { decision: 'The stranger said something you do not understand. Change the subject.', line: world.say('{name} frowns, puzzled, and talks of something else.', npcId) }
  const said = flirt(world, npcId).filter((o) => o.kind === 'speech' || o.kind === 'narration').map((o) => o.text)
  const line = said.join(' ') || world.say('{name} smiles, and says nothing.', npcId)
  return { decision: `The stranger is flirting with you. What you do (the game decided): ${line} Say it in your own way.`, line }
}

/** A reaction in the NPC's words, without a model. */
function reactionLine(world: World, npcId: string, reaction: Reaction): string {
  const lines: Record<Reaction, string> = {
    walk_away: '{name}\'s face closes. "I\'ve heard enough from you."',
    no_service: '{name} folds {their} arms. "I\'ll not serve you today. Not after that."',
    call_help: '{name} backs away and shouts. "Help! Somebody, help!"',
    attack: '{name} goes white, then red. "Say that again. Go on."',
    let_pass: '{name} looks hurt. "That was unkind. I\'ll let it pass."',
  }
  return world.say(lines[reaction], npcId)
}

/** How someone takes what the stranger claims, without a model. */
function claimLine(world: World, npcId: string, stance: 'believes' | 'doubts' | 'rejects'): string {
  if (stance === 'believes') return world.say('{name} looks up sharply. "Is that so? Then that changes things."', npcId)
  if (stance === 'doubts') return world.say('{name} gives you a long look. "I\'ll believe that when I see it."', npcId)
  return world.say('{name} snorts. "I don\'t believe a word of it."', npcId)
}

/** The topic words without closing punctuation, so the echo does not end in "?." or "..". */
function bare(words: string): string {
  return words.trim().replace(/[\s.?!,;:]+$/, '')
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

