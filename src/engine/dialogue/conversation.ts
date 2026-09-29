import { knob } from '../knobs'
import { amendsIn } from '../amends'
import { asksAge, knownName, knowsOfPerson, learnTie, learnWork, publicShort, saysOwnAge, toldAge } from '../acquaintance'
import type { Output } from '../commands'

import { areaTopicId, callName } from '../content'
import { factById, heardBy, newsAbout, playerTells } from '../news'
import type { Fact, FarName, TalkState } from '../state'
import { backers, backing, witnessSays } from '../belief'
import type { World } from '../world'
import { classify, tierFor, TIER_TOKENS, type Act, type Tier } from './acts'
import { dcFor, describeCheck, succeeded, type CheckResult } from './checks'
import { gainXp, playerCheck } from '../rules/player'
import { approve, companionOf, offer, recruit } from '../social/companions'
import { silenceWitness, witnessed } from '../social/crime'
import { partyTalk } from './party'
import { closingLine, fallbackReply } from './fallback'
import { deedKinds, fitLength, leakedNames, looksLikeInjection, outOfCharacter, promises, recites, saysNothing, speaksAsOther, swearRight, talksOfSelf, unknownNames, vocabularyOf } from './guard'
import { byRule } from './byrule'
import { accept, askedFor, askOffer, dayLines, kinOf, offerLine, offerLines, offersFor, proposal, proposalText, spokenMeet, type Offer } from './offers'
import { accepted, declined, inviteOffer } from '../social/invite'
import { claimValid, claimWords, parseClaim, playerSays } from '../claims'
import { afterChoice, doAfter, talkFact } from './aftertalk'
import { provocation, react, walkAway, type Reaction } from './reactions'
import { flirt } from '../social/romance'
import { tieTo } from '../people'
import type { Claim } from '../state'
import type { Knowledge, Packet } from './knowledge'
import { cachedSystem, LlmError, type LlmClient, type LlmRejection } from './llm'
import { areaBlock } from './block'
import { crossesLimits } from '../safety'
import { oathsOf, peopleIds, turnEnd, turnMessage, turnSections, worldFrame, youLines, type TurnSection } from './prompt'
import { attitude, applyEffect, moodOf, relation, type Attitude } from './relations'
import { askLine, askNow, knownRequests, requestName, visited } from '../requests'
import { questsOf } from '../life'
import { hiddenNamed } from '../quests/knows'
import { routineNow } from '../npc/brain'
import { parseReply, TALK_REPLY_SCHEMA, type Reply } from './schema'
import type { TopicRegistry } from './topics'
import { checkSketch, namesSomeone, registerSketch, sketchBonds, sketchOpen, sketchPlaces, sketchRoom, type NamedPerson } from '../sketches'
import { addressIn, addressWords, fixNotHere, flourishes, keepAddress, strangeWords, strayNumbers } from './voice'
import { acrossTongues, languageBarrier } from '../language'

/** A reply comes within this many milliseconds, both tries together, or the NPC says a set line (FO, chapter 18). */
/** How long a spoken reply may take over both tries (M10.8: ten seconds, unless the player sets it at the model). */
export const REPLY_WITHIN_MS = 10_000

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
  private lastFailure?: { kind: string; message: string }
  /** The link to the model is down (M10.29 V, a provider outage in Bram's log): when to try again, and whether the stranger was told. */
  private link?: { retryAt: number; told: boolean }
  /** The link came back since the last reply: said once. */
  private linkBack = false
  /** What the voice was told this turn (M10.28), for the thread once the turn is done: the first telling, before any NOTE. */
  private asked?: { text: string; sent: Record<string, string> }
  /** The topics of the last turn (M10.8): asked about, said, or known and told; a waiting quest starts on them. */
  private touched: string[] = []

  /** Takes the quest action the voice recognised in the last turn, if any. */
  takeChosen(): string | undefined {
    const key = this.chosen
    this.chosen = undefined
    return key
  }

  /** Every word the world's content uses, for spotting names the model made up. */
  private vocabulary(): Set<string> {
    // The chronicler's instruction is not the world: its examples are no names of it.
    this.words ??= vocabularyOf({ ...this.world.content, chronicler: undefined }, worldFrame(this.world.content, this.world.land), this.world.calendar.months, this.world.calendar.weekdays, (this.world.state.lore?.far ?? []).map((f) => f.name), (this.world.state.lore?.people ?? []).map((p) => p.name), (this.world.state.chronicle?.lore ?? []).map((l) => l.name))
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
    world.state.talk = { npc: npcId, turnsLeft: Math.max(2, turns), history: [], effects: 0, revealed: [], began: world.now, ...(opened ? { opened: true } : {}) }
    rel.familiarity = Math.min(100, rel.familiarity + 1)
    this.learn(npcId)
    if (silent) return []
    // A friend of the stranger greets them as one (M10.3).
    const friend = tieTo(world, npcId, 'player')?.role === 'friend'
    // In a tongue the stranger does not know (M10.23), the greeting is all that gets through.
    const tongue = languageBarrier(world, npcId)
    const greeting = opened ? undefined : tongue ? `${callName(npc)} greets you in ${tongue.name}. You have none of it, beyond the greeting.` : friend ? world.say('{name} lights up. "There you are, friend."', npcId) : fallbackReply(world, npcId, 'Greet', { known: [], unknown: [] }, band)
    // Going to see someone may be what another asked of the player.
    const visits = visited(world, npcId).map((r) => ({ kind: 'narration' as const, text: `You have looked in on ${callName(npc)}, as ${callName(world.npc(r.npc))} asked.` }))
    // Someone who needs help asks the player, once, when they next talk (FO, chapter 14).
    const request = askNow(world, npcId)
    // What they ask of the stranger is an offer the other way round (M10.3): YES is the stranger's word.
    // Or they came to ask the stranger along (M10.3, left over: invite): their own offer to lead the way.
    const ask = (request ? askOffer(world, npcId, request) : undefined) ?? (opened ? inviteOffer(world, npcId) : undefined)
    if (ask) this.talk!.proposal = ask
    return [
      { kind: 'system', text: `You are talking with ${publicShort(world, npcId)}. Type what you want to say, pick a number, or BYE to stop.` },
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
    if (today >= 2 || far.length >= knob(this.world, 'talk.far_places')) return `you may not name new places now. Use only names you were given.`
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

  /** Someone new the speaker named (M10.9): in this game's lore, the journal, the speaker's people and words. */
  private registerSketch(npcId: string, person: NamedPerson, replyText: string): void {
    const sketch = registerSketch(this.world, npcId, person, replyText, (id) => this.topics.entries.has(id))
    this.topics.addDuringPlay({ id: sketch.id, kind: 'person', name: sketch.name, aliases: [sketch.name] })
    this.knowledge.forget(npcId)
    for (const word of vocabularyOf(sketch.name)) this.vocabulary().add(word)
    this.noteSources(npcId, [{ topic: sketch.id, level: 1 }])
    this.learn(sketch.id)
    if (this.talk) this.talk.sketched = true
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
    // ASK HARMEN FOR THE SAW (M10.3): asking for a thing goes through the offers: give, lend, or for a favour.
    const wanted = /^for\s+(.+)$/i.exec(bare(question))
    if (wanted) {
      const thing = wanted[1]!.replace(/^(the|a|an|some|your)\s+/i, '')
      const topic = this.topics.find(thing)
      return this.turn(npcId, `Could I have the ${thing}?`, { act: 'Request', topics: topic ? [topic] : [], echo: true })
    }
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
    // A secret found out: what they are is no cover any more (M10.8).
    learnWork(this.world, npcId)
    gainXp(this.world, knob(this.world, 'rules.xp').secret, `${callName(this.world.npc(npcId))} told you a secret`)
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
    if (news) return this.passOnNews(npcId, news)
    // Not news the player heard but something they say is so (M10.3): a claim, in the world's own words.
    const claim = parseClaim(this.world, [...new Set([...(topic ? [topic] : []), ...this.topics.recognise(about)])], about.replace(/^that\s+/i, ''))
    if (claim && claimValid(this.world, claim)) return this.turn(npcId, capitalise(about.replace(/^that\s+/i, '')), { act: 'Tell', topics: this.topics.recognise(about), echo: true, claim })
    return this.turn(npcId, `Let me tell you about ${about}.`, { act: 'Tell', topics: topic ? [topic] : [], echo: true })
  }

  /**
   * The player passes on what they heard (M9.4), with whoever stands by it
   * (M10.6): someone beside them who believes it says so, an eyewitness
   * loudest. A persuasion that worked, and the word of those who promised to
   * say the same, weigh in too (weight, from influence()). Someone who did
   * not believe it before thinks again.
   */
  private passOnNews(npcId: string, news: Fact, check?: { weight: number; lines: Output[] }): Output[] {
    const world = this.world
    const name = callName(world.npc(npcId))
    if (!this.talk || this.talk.npc !== npcId) this.start(npcId, true)
    const before = world.state.news?.heard[npcId]?.[news.id]
    const knew = Boolean(before && !before.stance)
    const standing = knew ? [] : backers(world, npcId, news, Boolean(check)).filter((b) => b.here || check)
    // An eyewitness beside the stranger says it themselves: the listener hears it from them, with the stranger's word beside it.
    const witness = standing.find((b) => b.here && b.saw)
    const others = standing.filter((b) => b !== witness)
    const weight = backing(world, others) + (check?.weight ?? 0)
    const h = witness
      ? witnessSays(world, npcId, news, witness.id, weight + knob(this.world, 'belief.backed'))
      : playerTells(world, npcId, news.id, weight, check ? 'player:persuade' : ['player', ...standing.map((b) => b.id)].join('+'))
    const lines: Output[] = [{ kind: 'text', text: `You: "${news.text.village}"` }, ...(check?.lines ?? [])]
    for (const b of standing) {
      const who = callName(world.npc(b.id))
      if (b.here) lines.push({ kind: 'narration', text: b.saw ? `${who} nods. "I saw it with my own eyes."` : `${who} nods. "It's so. I heard it too."` })
      else lines.push({ kind: 'narration', text: `You tell ${name} that ${who} ${b.saw ? 'saw it with their own eyes' : 'heard it too'}, and gave their word to say so.` })
    }
    const stance = h ? (h.stance ?? 'believes') : undefined
    const reaction = knew
      ? `${name} nods. "I'd heard."`
      : before && stance === before.stance
        ? `${name} shakes ${world.say('{their}', npcId)} head. "You told me. I don't believe it any more now than I did then."`
        : stance === 'rejects'
          ? `${name} doesn't believe a word of it, and says so.`
          : stance === 'doubts'
            ? `${name} looks at you a long moment. "We'll see."`
            : before
              ? `${name} is quiet a while. "Then you were right, and I was wrong."`
              : `${name} listens, and takes it seriously.`
    lines.push({ kind: 'narration', text: reaction })
    return lines
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
      const amount = world.parseMoney(text)
      if (!amount) return [{ kind: 'error', text: `Bribe with how much? For example: BRIBE ${callName(npc).toUpperCase()} 2 ${(world.coins[1] ?? world.coins[0]!).plural?.toUpperCase() ?? `${(world.coins[1] ?? world.coins[0]!).name.toUpperCase()}S`}.` }]
      if (amount > world.state.player.money) return [{ kind: 'error', text: `You only have ${world.money(world.state.player.money)}.` }]
      // Each small coin of the world makes it easier (M10.17: the world's second coin, not the Nethermarch's stuiver).
      const small = world.coinWorth(world.coins[1] ?? world.coins[0]!)
      result = playerCheck(world, 'persuasion', dcFor(18 - Math.floor(amount / small), band, npc.personality.honesty * 2))
      about = `bribe them with ${world.money(amount)}`
      if (succeeded(result)) {
        world.state.player.money -= amount
        world.npcState(npcId).money += amount
      }
    } else if (kind === 'persuade' && this.persuadable(text)) {
      return this.persuadeOf(npcId, this.persuadable(text)!)
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
        learnWork(world, npcId)
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

  /** What the player heard that PERSUADE is about: "persuade sijbrand that the dyke is leaking", "about the dyke". */
  private persuadable(text: string): Fact | undefined {
    const words = bare(text).replace(/^(them|him|her)\s+/i, '').replace(/^(that|about|of)\s+/i, '')
    if (!words) return undefined
    for (const topic of [this.topics.find(words), ...this.topics.recognise(words)]) {
      const news = this.newsOnTopic(words, topic)
      if (news?.claim) return news
    }
    return undefined
  }

  /**
   * Persuading someone that what the player heard is so (M10.6, the dyke): a
   * Persuasion check, easier for each who stands by it (beside the player, or
   * with their word given to say so, as Teunis may promise to tell Sijbrand).
   * Won, it weighs heavily; lost, only the word is left. Someone who did not
   * believe it before thinks again, once.
   */
  private persuadeOf(npcId: string, news: Fact): Output[] {
    const world = this.world
    const heard = world.state.news?.heard[npcId]?.[news.id]
    if (heard && !heard.stance) return this.passOnNews(npcId, news)
    const standing = backers(world, npcId, news, true)
    const result = playerCheck(world, 'persuasion', dcFor(15, attitude(world, npcId).band, -knob(this.world, 'talk.support_dc') * standing.length))
    if (result.degree === 'critical failure') applyEffect(world, npcId, 'trust', -3)
    const lines: Output[] = [{ kind: 'check', text: describeCheck({ ...result }) }]
    return this.passOnNews(npcId, news, { weight: succeeded(result) ? knob(this.world, 'talk.persuaded') : 0, lines })
  }

  /** The topics of the last turn, once (M10.8). */
  takeTouched(): string[] {
    const list = this.touched
    this.touched = []
    return list
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
      // Only who the player met, saw or was told of, by the name they know (M10.8).
      if (kind === 'person' && this.world.content.npcs.has(id)) {
        if (knowsOfPerson(this.world, id)) groups['People']!.push(knownName(this.world, id))
      } else if (kind === 'person') groups['People']!.push(name)
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
      // Told of someone by another (M10.8): what they do comes with it, a hidden trade too.
      if (topic !== npcId && this.world.content.npcs.has(topic)) learnWork(this.world, topic)
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
        gainXp(this.world, knob(this.world, 'rules.xp').lore, `you learned of ${this.topics.name(id)}`)
        approve(this.world, 'learn_old_story')
      }
    }
  }

  // ------------------------------------------------------------ one turn

  private async turn(npcId: string, text: string, options: TurnOptions): Promise<Output[]> {
    const world = this.world
    this.asked = undefined
    const npc = world.npc(npcId)
    if (world.npcState(npcId).location !== world.state.player.location) {
      world.state.talk = undefined
      return [{ kind: 'error', text: `${publicShort(world, npcId)} isn't here any more.` }]
    }
    if (world.npcState(npcId).activity === 'asleep') {
      world.state.talk = undefined
      return [this.asleep(npcId)]
    }
    if (!this.talk || this.talk.npc !== npcId) this.start(npcId, true)
    const talk = this.talk!
    const echo: Output[] = options.echo ? [{ kind: 'text', text: `You: "${text}"` }] : []
    const band = attitude(world, npcId)

    // 0. A tongue the stranger does not know (M10.23): what they make out, by the rules, and a step towards learning it.
    const barrier = languageBarrier(world, npcId)
    if (barrier) {
      talk.turnsLeft--
      return [...echo, ...acrossTongues(world, npcId, barrier, text).map((line) => ({ kind: 'narration' as const, text: line })), ...this.maybeClose()]
    }

    // 1. Injection and meta talk never reach the model.
    if (looksLikeInjection(text)) {
      talk.turnsLeft--
      // Held back, with the reason in the AI log and the dev menu (M10.19).
      this.guarded('injection')
      this.llm()?.report?.({ reason: 'injection', role: 'voice', held: text.slice(0, 500) })
      return [...echo, { kind: 'speech', text: fallbackReply(world, npcId, 'OffTopic', { known: [], unknown: [] }, band.band) }, ...this.maybeClose()]
    }

    // 2. Topics and act by rules.
    this.syncNews()
    let topics = options.topics ?? [...new Set([...this.topics.recognise(text), ...kinOf(world, npcId, text)])]
    // "Is it far?" after a place was named (M10.28): the place the speaker named last, with its walking time.
    if (!options.topics && /\b(?:far|how long|how do i get|which way|get there|where is it|walk)\b/i.test(text) && !topics.some((t) => this.topics.kind(t) === 'place')) {
      const last = [...talk.history].reverse().find((h) => h.speaker === 'npc')?.text
      const named = last ? this.topics.recognise(last).filter((t) => this.topics.kind(t) === 'place' && world.content.locations.has(t)) : []
      if (named.length) topics = [...topics, named[0]!]
    }
    const act = options.act ?? classify(text, topics.length)
    if (act === 'AskRumors' && topics.length === 0) topics = this.rumours(npcId)
    const packet = this.knowledge.packet(npcId, topics, act === 'AskStory' || act === 'AskAbout')
    let tier: Tier = tierFor(act)
    if ((act === 'AskStory' || /\b(story|legend|tale|verhaal)\b/i.test(text)) && packet.known.some((k) => k.story)) tier = 'story'
    if (tier !== 'story') for (const k of packet.known) delete k.story

    // 3. The model, or the designer's templates.
    // What they remember from before this talk (M10.28: this talk itself is in the thread).
    const memories = (world.npcState(npcId).memory ?? []).filter((m) => m.t < (talk.began ?? Infinity)).slice(-5).map((m) => m.note)
    // What the player says is a claim, heard from the stranger and judged by the game (M10.3).
    const claim = options.claim ?? (options.check || /\?\s*$/.test(text) ? undefined : parseClaim(world, topics, text))
    // A few claims a talk, no more (M10.3, the limits): after that, words are only words.
    const said = claim && claimValid(world, claim) && (talk.claims = (talk.claims ?? 0) + 1) <= knob(this.world, 'talk.max_claims') ? playerSays(world, npcId, claim, { ...(options.lie ? { lie: true } : {}), ...(options.claimBonus ? { bonus: options.claimBonus } : {}) }) : undefined
    const believed = said ? `The stranger says ${claimWords(world, claim!)}. You ${said.stance === 'believes' ? 'believe it' : said.stance === 'doubts' ? 'are not sure it is true' : 'do not believe it'}; answer that way.` : talk.heard
    // What the voice read in the stranger's last words (M10.3, left over) sounds in this turn, once.
    talk.heard = undefined
    // The rules read no claim and it is no question: the voice may read one, in the same call (no second call, M9.3).
    const claimable = !claim && !options.check && !/\?\s*$/.test(text) && (talk.claims ?? 0) < knob(this.world, 'talk.max_claims') ? [...new Set([...topics, ...this.topics.recognise(text)])].filter((t) => t !== npcId && (world.content.npcs.has(t) || world.content.locations.has(t))) : []
    // Flirting in free talk goes by the same formula as FLIRT (M10.3); the voice words what it decided.
    const flirted = act === 'Flirt' && !options.check ? flirtIn(world, npcId) : undefined
    // Sorry, the reasons, or a second go, to whom the stranger let down (M10.14): the engine decides, the voice words it.
    const amended = (act === 'Apologize' || act === 'Explain' || act === 'MakeGood') && !options.check ? amendsIn(world, npcId, act) : undefined
    // An insult, a threat or a lie found out: the engine decides the reaction; the voice words it (M10.3).
    const provoked = provocation(act, { ...(options.caughtLie ? { caughtLie: true } : {}), ...(options.check ? { failedThreat: !succeeded(options.check) } : {}) })
    const reaction = provoked ? react(world, npcId, provoked) : undefined
    // "Come with me to the dyke" (M10.6): somewhere or to someone is a lead on offer, not joining the stranger's travels.
    const leads = act === 'Recruit' && !options.check ? offersFor(world, npcId, topics, text).filter((o) => o.kind === 'lead') : []
    const recruiting = act === 'Recruit' && leads.length === 0
    const decision = [recruiting ? recruitDecision(world, npcId, band.band) : undefined, believed, reaction?.decision, flirted?.decision, amended?.decision].filter(Boolean).join(' ') || undefined
    const offered = options.echo || options.check ? [] : (this.questOptions?.(npcId) ?? [])
    // What this person can do for the player now (M10.3): the game decides, the voice chooses and words it.
    const offers = options.check || options.secret || recruiting ? [] : leads.length ? leads : offersFor(world, npcId, topics, text)
    // Asked about someone who matters: news with witnesses, before anyone answers (M10.3).
    const made = talkFact(world, npcId, topics, act)
    if (made) (talk.facts ??= []).push(made.id)
    // No model for what the rules can do (M10.28): a greeting, a yes or no, a trade, the same question again, the card.
    const busy = Boolean(options.check || options.secret || said || decision || reaction || flirted || amended || offered.length || claimable.length)
    const rule = this.llm() ? byRule(world, npcId, { act, text, topics, history: talk.history, offers, busy }) : undefined
    if (rule) this.llm()?.byRule?.({ role: 'voice', why: rule.why, said: text })
    const reply = rule ? undefined : await this.callModel(npcId, text, { act, tier, packet, band, memories, check: options.check, secret: options.secret, decision, spokenTopics: this.topics.recognise(text), offered, offers, claimable })
    // A claim the voice read: the engine judges it and books it as heard from the stranger; the stance sounds next turn.
    const read = reply?.claim && reply.claim.subject !== 'none' && claimable.includes(reply.claim.subject) ? { subject: reply.claim.subject, key: reply.claim.key, value: reply.claim.value } : undefined
    if (read && claimValid(world, read) && (talk.claims = (talk.claims ?? 0) + 1) <= knob(this.world, 'talk.max_claims')) {
      const taken = playerSays(world, npcId, read)
      if (taken) talk.heard = `Earlier the stranger said ${claimWords(world, read)}. You ${taken.stance === 'believes' ? 'believe it' : taken.stance === 'doubts' ? 'are not sure it is true' : 'do not believe it'}; let that show.`
    }
    // The player's words meant a quest action: the engine carries it out, and its text is the answer.
    if (reply?.quest_action && offered.some((o) => o.key === reply.quest_action)) {
      this.chosen = reply.quest_action
      talk.history.push({ speaker: 'player', text })
      this.heard(talk, text, reply.reply)
      return echo
    }
    // The offer the player asked for: the voice's choice, or by the rules without a model.
    const asked = reply ? offers.find((o) => o.key === reply.action) : askedFor(offers, text)
    const replyText = rule?.line
      ? rule.line
      : reply
      ? reply.reply
      : reaction
        ? reactionLine(world, npcId, reaction.reaction)
        : flirted
          ? flirted.line
          : amended
          ? amended.line
          : asked
          ? offerLine(world, npcId, asked)
          : said
            ? claimLine(world, npcId, said.stance)
            : options.secret
        ? world.say(`{name} glances at the door and lowers {their} voice. "${options.admission ?? 'All right. But it stays between us.'}"`, npcId)
        : options.check && !succeeded(options.check)
          ? world.say(`{name} shakes {their} head. "I don't think so."`, npcId)
          : fallbackReply(world, npcId, act, packet, band.band, text)

    // The names in the answer the stranger can follow (M10.8): what they were told this turn or know already, never
    // the speaker's own name nor what the model made up beyond the packet. A person or place the speaker names and
    // knows is followable the first time too (M10.29: it goes in the journal below, and was bracketed only the next time).
    const journal = world.state.player.journal ?? {}
    const firstNamed = this.topics.recognise(replyText).filter((t) => t !== npcId && ['person', 'place', 'area', 'lore'].includes(this.topics.kind(t) ?? '') && this.knowledge.level(npcId, t) >= 1)
    const followable = new Set([...packet.known.map((k) => k.topic), ...this.topics.recognise(replyText).filter((t) => journal[t] !== undefined), ...firstNamed].filter((t) => t !== npcId))
    const shown = this.topics.link(replyText, followable)

    // What this turn was about (M10.8): a quest waiting in this talk starts when its subject comes up.
    this.touched = [...new Set([...topics, ...packet.known.map((k) => k.topic), ...this.topics.recognise(text), ...this.topics.recognise(replyText)])]

    // 4. Effects, bounded by the system.
    if (reply) {
      for (const effect of reply.effects.slice(0, 1)) {
        const delta = Math.max(-3, Math.min(3, effect.delta))
        const room = knob(this.world, 'talk.max_effect') - Math.abs(talk.effects)
        const applied = Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, room))
        if (applied !== 0) {
          applyEffect(world, npcId, effect.type, applied)
          talk.effects += applied
        }
      }
    }
    const rel = relation(world.state, npcId)
    rel.familiarity = Math.min(100, rel.familiarity + 2)
    // Asked their age and they answered, or they said it themselves about themselves (M10.29): known from now on.
    if (reply && (asksAge(world, npcId, text) || saysOwnAge(world, npcId, replyText, act === 'AskAboutSelf' || /\b(age|old|years|born)\b/i.test(text)))) toldAge(world, npcId)
    // Asked who they are or what they do: the stranger knows their trade now, unless they keep it hidden (M10.8).
    if ((act === 'AskWork' || act === 'AskAboutSelf') && !npc.hidden) learnWork(world, npcId)

    // 5. New far-away places become part of this game's lore.
    for (const name of reply?.names ?? []) {
      if (name.new_kind !== 'none' && !this.topics.find(name.text) && replyText.includes(name.text.trim())) this.registerFar(npcId, name.text.trim(), name.new_kind, replyText)
    }
    // A saying or an oath once in a talk is enough (M10.10).
    if (reply && flourishes(world, replyText) > 0) talk.flourished = true
    // Someone new the speaker named (M10.9), checked with the reply.
    if (reply && namesSomeone(reply.person) && !talk.sketched && !this.topics.find(reply.person.name)) this.registerSketch(npcId, reply.person, replyText)

    // 6. Journal and memory.
    const allowed = new Set([...packet.known.map((k) => k.topic), ...(packet.referral ? [packet.referral.npc] : [])])
    const mentioned = (reply?.mentioned_topics ?? []).filter((t) => allowed.has(t))
    this.noteSources(npcId, packet.known.map((k) => ({ topic: k.topic, level: k.level })))
    const told = packet.known.flatMap((k) => [k.topic, ...(k.news ? newsAbout(world, npcId, [k.topic]).map(({ fact }) => fact.id) : [])]).filter((id) => id.startsWith('fact_'))
    this.hearFrom(npcId, told)
    this.learn(...told, ...packet.known.map((k) => k.topic), ...mentioned, ...(packet.referral && replyText.includes(packet.referral.call) ? [packet.referral.npc] : []))
    const memory = (world.npcState(npcId).memory ??= [])
    // A memory holds only what happened (M10.29, Bram's playtest: "I showed the stranger the bunk", never shown): a deed
    // it claims needs its agreement in the register, or the note is the plain one.
    const claimed = reply?.memory_note ? deedKinds(reply.memory_note) : []
    const borne = !claimed.length || (world.state.agreements?.list ?? []).some((a) => claimed.includes(a.kind) && ((a.by === npcId && a.to === 'player') || (a.by === 'player' && a.to === npcId)))
    memory.push({ t: world.now, note: (borne && reply?.memory_note) || `The stranger talked to me${topics[0] ? ` about ${this.topics.name(topics[0])}` : ''}.`, topics, valence: 0 })
    if (memory.length > 30) memory.splice(0, memory.length - 30)

    // One thing the NPC does after the talk, from the voice (M10.3).
    // Someone or somewhere they know (M10.28: the schema no longer lists them, so the engine checks).
    const afterTo = reply && reply.after.kind !== 'none' && (allowed.has(reply.after.target) || this.knowledge.knownTopics(npcId).has(reply.after.target) || world.npcsAt(world.state.player.location).includes(reply.after.target))
    if (reply && afterTo && !talk.after && doAfter(world, npcId, reply.after, talk.facts ?? [])) talk.after = true

    // Family asked about or named: the stranger knows now who belongs to whom (M10.4).
    for (const person of [...topics, ...this.topics.recognise(replyText)]) if (person !== npcId && world.content.npcs.has(person) && tieTo(world, npcId, person)) learnTie(world, npcId, person)

    // Names the NPC brought up of its own accord and knows: the journal has them, heard from this NPC (M10.3).
    // People, places and tales only: "I saw him" is no saw.
    const named = firstNamed.filter((t) => !told.includes(t))
    if (named.length) {
      this.noteSources(npcId, named.map((t) => ({ topic: t, level: this.knowledge.level(npcId, t) })))
      this.learn(...named)
    }

    talk.history.push({ speaker: 'player', text }, { speaker: 'npc', text: replyText })
    if (talk.history.length > 12) talk.history.splice(0, talk.history.length - 12)
    this.heard(talk, text, replyText)
    // How the speaker calls the stranger: what their first answer in this band used stays (M10.28).
    if (reply && (!talk.address || talk.address.band !== band.band)) {
      const word = addressIn(replyText, addressWords(world, npcId))
      talk.address = word ? { word, band: band.band } : undefined
    }
    talk.turnsLeft--
    talk.turns = (talk.turns ?? 0) + 1
    // A talk goes on while it is about something (M10.8): past the turns it starts with, one more each time, up to a
    // limit. Who has to go says so a turn ahead; who has nothing more to say closes as before.
    const alive = (reply?.keep_talking ?? 'no') !== 'no' || this.stillAbout(npcId, packet)
    if (talk.turnsLeft <= 0 && alive && talk.turns < knob(this.world, 'talk.max_turns') && !talk.leaving) talk.turnsLeft = 1
    const going: Output[] = []
    if (talk.turnsLeft === 1 && !alive && !talk.leaving) {
      const line = this.mustGo(npcId)
      if (line) {
        talk.leaving = true
        going.push({ kind: 'speech', text: line })
      }
    }
    // An offer that goes through becomes an agreement and starts; one the NPC proposes waits for the player's yes.
    const offerOut: Output[] = []
    let offerEnds = false
    if (asked?.decision === 'yes' && !reaction) {
      const done = accept(world, npcId, asked)
      offerOut.push(...done.outputs)
      offerEnds = done.ends
    } else if (!asked && !reaction) {
      // What they propose: an offer they chose, or a meeting they named in their own words (M10.29).
      const proposed = reply ? (offers.find((o) => o.key === reply.propose && o.decision === 'yes') ?? (promises(replyText) ? spokenMeet(world, npcId, replyText, this.topics.recognise(replyText)) : undefined)) : proposal(offers, act)
      if (proposed) {
        talk.proposal = proposed
        offerOut.push({ kind: 'system', text: proposalText(world, npcId, proposed) })
      }
    }
    // When the model was asked and gave nothing usable, say so, so a stock line is not mistaken for an answer.
    // An outage is said once, as a line of the game (M10.29 V): the next lines of the rules say nothing more, and its end is said too.
    const outage = this.lastFailure && (this.lastFailure.kind === 'network' || this.lastFailure.kind === 'busy' || this.lastFailure.kind === 'down')
    const notice = !reply && this.lastFailure ? (outage ? (this.link && !this.link.told ? LINK_DOWN : undefined) : stockNotice(this.lastFailure, callName(npc))) : undefined
    if (outage && this.link) this.link.told = true
    const failure: Output[] = notice ? [{ kind: 'system', text: notice }] : reply && this.linkBack ? [{ kind: 'system', text: LINK_BACK }] : []
    if (reply) this.linkBack = false
    if (!reply && this.lastFailure) {
      // Why a stock line stood in, for the dev menu (M10.8); the AI log has the call itself.
      world.stockLines.push({ t: world.now, npc: npcId, reason: `${this.lastFailure.kind}: ${this.lastFailure.message}` })
      if (world.stockLines.length > 20) world.stockLines.splice(0, world.stockLines.length - 20)
    }
    // A reaction that ends it (M10.3): walking off, shouting for help, going for the stranger, or the shop shut.
    if (reaction && reaction.reaction !== 'let_pass') {
      this.wrapUp(talk)
      world.state.talk = undefined
      const gone = reaction.reaction === 'walk_away' ? [{ kind: 'narration' as const, text: walkAway(world, npcId) }] : []
      return [...echo, { kind: 'speech', text: shown, ...(reply ? { source: 'model' as const } : rule ? { source: 'rules' as const } : {}) }, ...failure, ...gone]
    }
    // Off to do it: the talk ends there, without a closing line.
    if (offerEnds) {
      this.wrapUp(talk)
      world.state.talk = undefined
      return [...echo, { kind: 'speech', text: shown, ...(reply ? { source: 'model' as const } : rule ? { source: 'rules' as const } : {}) }, ...failure, ...offerOut]
    }
    const ends = reply?.ends_conversation === true
    const amends = amended?.outputs ?? []
    return [...echo, ...amends.filter((o) => o.kind === 'check'), { kind: 'speech', text: shown, ...(reply ? { source: 'model' as const } : rule ? { source: 'rules' as const } : {}) }, ...amends.filter((o) => o.kind !== 'check'), ...going, ...failure, ...offerOut, ...(ends ? this.closeNow() : this.maybeClose())]
  }

  /** YES or NO to what the NPC proposed (M10.3): only a yes makes it happen. */
  answer(yes: boolean): Output[] {
    const talk = this.talk
    const offer = talk?.proposal
    if (!talk || !offer) return []
    talk.proposal = undefined
    const world = this.world
    if (!yes) {
      // Asked along and said no: they go alone, or wait, as the plan said.
      if (offer.invite) declined(world, talk.npc)
      return [{ kind: 'speech', text: world.say('{name} shrugs. "Suit yourself."', talk.npc) }]
    }
    if (offer.invite) accepted(world, talk.npc)
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

  /**
   * Whether the talk is still about something, by the rules (M10.8): a quest on with this person, a request of theirs
   * open, an offer waiting for the stranger's yes, or something they know well asked about this turn.
   */
  private stillAbout(npcId: string, packet: Packet): boolean {
    const world = this.world
    const quests = world.state.questlog ?? {}
    // A quest of theirs on, or something of a quest to do with them in this talk.
    if (questsOf(world, npcId).some((q) => q.givers.includes(npcId) && quests[q.id] && !quests[q.id]!.ended)) return true
    if ((this.questOptions?.(npcId) ?? []).length > 0) return true
    if (knownRequests(world).some((r) => r.npc === npcId && r.status === 'open')) return true
    if (this.talk?.proposal) return true
    return packet.known.some((k) => k.level >= 2 && k.topic !== npcId)
  }

  /** Who has to be somewhere says so a turn before they go (M10.8): back to work, or off to where the day takes them. */
  private mustGo(npcId: string): string | undefined {
    const world = this.world
    const day = routineNow(world, npcId)
    if (!day) return undefined
    const name = callName(world.npc(npcId))
    if (day.activity === 'work') return `${name} glances away. "I must get back to my work, but go on."`
    if (day.until - world.now <= 30 && day.place !== world.npcState(npcId).location) return `${name} looks at the light. "I must be off soon, but go on."`
    return undefined
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
      /** Who a claim the voice reads may be about (M10.3, left over); empty: no claim this turn. */
      claimable?: string[]
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

    // Someone new (M10.9): only in a talk about the speaker's family, trade or past, once a talk, within bounds.
    const sketch =
      talk && !talk.sketched && sketchOpen(world, npcId, ctx.act, ctx.packet, text) && sketchRoom(world, npcId)
        ? { bonds: Object.keys(sketchBonds(world)), places: sketchPlaces(world, npcId).map((p) => p.name) }
        : undefined

    const turn = {
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
      history: [],
      playerText: text,
    }
    const offered = ctx.offered ?? []
    const offers = ctx.offers ?? []
    // What this turn asks besides the words (M10.28: parts like the rest, so a later turn tells only what changed).
    const extra: TurnSection[] = []
    // Time facts from the schedules (M10.3): their own day, and the day of the people the talk is about.
    const days = dayLines(world, npcId, [...ctx.packet.known.map((k) => k.topic), ...offers.flatMap((o) => (o.person ? [o.person] : []))])
    if (days.length) extra.push({ key: 'days', text: days.join('\n') })
    if (offers.length) {
      // The offers of this turn, and once a talk how to answer them.
      const lines = offerLines(world, npcId, offers)
      extra.push({ key: 'offers', text: lines.slice(0, -1).join('\n'), each: true }, { key: 'offers-how', text: lines.at(-1)! })
    }
    if (talk && !talk.after) extra.push({ key: 'after', text: 'AFTER THE TALK: one thing of your own you want to do later (tell one of your people, or go somewhere), in after; at most once a talk. Otherwise after.kind none.' })
    if (ctx.claimable?.length) {
      const places = ctx.claimable.filter((id) => world.content.locations.has(id))
      extra.push({ key: 'claim', each: true, text: `CLAIM: if the stranger's words just said something is so about ${ctx.claimable.map((id) => `${id} (${this.topics.name(id)})`).join(', ')}, put it in claim: subject the id; key at (value: the place id where they are${places.length ? `, one of ${places.join(', ')}` : ''}), alive (yes or no), state (of a place: normal, flooded, damaged, occupied, leaking) or working (of a place: yes or no). Otherwise subject none. Only what the stranger said, never what you think.` })
    }
    if (sketch) {
      const domains = world.frame.sketch?.domains ?? 'your family, your trade or your past'
      extra.push({ key: 'sketch', each: true, text: `SOMEONE NEW: this talk touches ${domains}. If it fits, you may name one person of your own who is in none of your lists: your ${sketch.bonds.join(', ')}, living in one of ${sketch.places.join(', ')}. A first name only, in one sentence, and put them in person. Otherwise person.name is empty and bond none.` })
    }
    if (offered.length) {
      extra.push({ key: 'quest', each: true, text: `QUEST ACTIONS: if the player's words clearly mean one of these, put its key in quest_action and the game carries it out; otherwise quest_action is "none".\n${offered.map((o) => `  ${o.key}: the player wants to ${o.intent}`).join('\n')}` })
    }
    // The area block (M10.28): the rules, the frame and everything the people here all know, the same for every line
    // spoken here and read from the cache; then who speaks, and what is new since they were last told.
    const block = areaBlock(world, location.area)
    const message = turnMessage([{ key: 'you', text: youLines(world, npcId, block.cast) }, ...turnSections(world, turn, 'talk'), ...extra, ...turnEnd(world, turn)], talk?.sent)
    let prompt = message.text
    this.asked = { text: message.text, sent: message.sent }
    const cast = block.cast.filter((id) => id !== npcId && world.content.npcs.has(id)).flatMap((id) => [callName(world.npc(id)), world.npc(id).name])

    // A reply comes within its time or not at all, over both tries (FO, chapter 18; ten seconds unless set otherwise, M10.8): then the set line.
    const within = llm.replyWithinMs?.() ?? REPLY_WITHIN_MS
    const started = Date.now()
    // The link is down (M10.29 V): the rules answer, without asking, until it is time to try again quietly.
    if (this.link && Date.now() < this.link.retryAt) {
      this.lastFailure = { kind: 'down', message: 'the link to the model is down' }
      return undefined
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: string
      try {
        raw = (
          await llm.complete({
            role: 'voice',
            ...cachedSystem(block.shared, block.block),
            turns: [...(talk?.thread ?? [])],
            prompt,
            cacheTail: true,
            // Kept an hour (M10.28): a ping cannot keep it, since the schema goes ahead of it and an empty call may carry none.
            cacheHour: true,
            schemaName: 'npc_reply',
            // The same schema for every line (M10.28): it is cached ahead of the area block.
            schema: TALK_REPLY_SCHEMA,
            maxTokens: TIER_TOKENS[ctx.tier],
            timeoutMs: within - (Date.now() - started),
            meta: {
              npcName: callName(world.npc(npcId)),
              act: ctx.act,
              wordLimit: knob(this.world, 'talk.words')[ctx.tier],
              known: ctx.packet.known,
              unknown: ctx.packet.unknown,
              referral: ctx.packet.referral,
              check: ctx.check?.degree,
              secret: ctx.secret,
              questActions: offered,
              playerText: text,
              offers,
              ...(talk && !talk.after ? { after: afterChoice(world, npcId, talk.facts ?? []) } : {}),
              ...(ctx.claimable?.length ? { claimable: ctx.claimable } : {}),
              ...(sketch ? { sketch } : {}),
            },
          })
        ).text
      } catch (error) {
        this.lastFailure = { kind: error instanceof LlmError ? error.kind : 'network', message: error instanceof Error ? error.message : String(error) }
        if (this.lastFailure.kind === 'network' || this.lastFailure.kind === 'busy') this.link = { retryAt: Date.now() + LINK_RETRY_MS, told: this.link?.told ?? false }
        return undefined
      }
      // An answer: the link is up again, if it was down.
      if (this.link) {
        this.link = undefined
        this.linkBack = true
      }
      const reply = parseReply(raw)
      if (!reply) {
        this.refused('schema', llm)
        continue
      }
      // Our world's oaths give way to the speaker's own (M10.8): "Christ, yes" is "Saint Brand's light, yes".
      const trimmed = fitLength(reply.reply, knob(world, 'talk.words')[ctx.tier])
      const sworn = swearRight(trimmed, oathsOf(world, npcId))
      // What does not exist here gives way to what people say instead (M10.10): potatoes are turnips, Sunday is Rustdag.
      const { text: plain, fixed } = fixNotHere(world, sworn)
      // The form of address this talk keeps (M10.28), while the attitude stays in its band.
      const kept = talk?.address && talk.address.band === ctx.band.band ? keepAddress(plain, talk.address.word, addressWords(world, npcId)) : { text: plain }
      const fitted = kept.text
      const strange = strangeWords(world, fitted)
      if (strange.length) {
        this.refused('anachronism', llm)
        prompt += `\nNOTE: your last reply used ${strange.map((w) => `"${w}"`).join(', ')}, which ${strange.length === 1 ? 'does' : 'do'} not exist in this world. Answer again without ${strange.length === 1 ? 'it' : 'them'}.`
        continue
      }
      // A reply is words (M10.29, Bram's playtest: "Sana smiles warmly." and the bunk question never answered).
      if (saysNothing(fitted, [callName(world.npc(npcId)), world.npc(npcId).name, world.npc(npcId).short], world.npc(npcId).pronoun)) {
        this.refused('schema', llm)
        prompt += '\nNOTE: your last reply said nothing aloud. Answer again with what you say, in double quotes.'
        continue
      }
      // The block holds everyone of these parts (M10.28): the reply is theirs who was asked, never another card's.
      const other = speaksAsOther(fitted, [callName(world.npc(npcId)), world.npc(npcId).name, world.npc(npcId).short], cast)
      if (other) {
        this.refused('character', llm, `voiced as ${other}`)
        prompt += `\nNOTE: your last reply spoke as ${other}. You are ${callName(world.npc(npcId))}: answer again as ${callName(world.npc(npcId))}.`
        continue
      }
      // The speaker as "I" (M10.29 T): never their own name as someone else doing something.
      if (talksOfSelf(fitted, [callName(world.npc(npcId)), world.npc(npcId).name])) {
        this.refused('character', llm, 'spoke of self as another')
        prompt += `\nNOTE: your last reply spoke of ${callName(world.npc(npcId))} as of someone else. You are ${callName(world.npc(npcId))}: say I. Answer again.`
        continue
      }
      // A story told in the speaker's own words, never recited (M10.28, the read score: four people told the Haakman alike).
      // Someone else's story (toldBy): their own they may tell as they always do.
      if (ctx.packet.known.some((k) => k.story && k.toldBy && recites(fitted, k.story, k.facts.join(' ')))) {
        this.refused('character', llm, 'recited the story')
        prompt += '\nNOTE: your last reply recited the STORY. Tell it again shorter, in your own words, with one thing of your own.'
        continue
      }
      if (outOfCharacter(fitted)) {
        this.refused('character', llm)
        prompt += '\nNOTE: your last reply stepped out of the world. Answer again as yourself, in plain speech.'
        continue
      }
      // The hard limits (M10.19): asked again like a reply out of character, then the set line.
      const limit = crossesLimits(fitted, this.vocabulary())
      if (limit) {
        this.refused('limits', llm, limit)
        prompt += '\nNOTE: your last reply crossed the hard limits of this game. Answer again, plainly, without it.'
        continue
      }
      // A promise the game did not offer never stands in the text (M10.3): the deed hangs on a chosen yes.
      const doing = offers.find((o) => o.key === reply.action && o.decision === 'yes') ?? offers.find((o) => o.key === reply.propose && o.decision === 'yes')
      // A time the speaker keeps in their own words is a meeting they propose (M10.29), when they are willing.
      const spoken = promises(fitted) && !doing ? spokenMeet(world, npcId, fitted, this.topics.recognise(fitted)) : undefined
      if (promises(fitted) && !doing && !spoken && !ctx.decision && reply.quest_action === 'none') {
        this.refused('promise', llm)
        prompt += '\nNOTE: your last reply promised to do something the game did not offer. Answer again without promising it: choose an OFFER with decision yes, or say what you can and cannot do.'
        continue
      }
      const said = `${fitted} ${reply.memory_note}`
      // A name cut off with a reply that ran too long does not count.
      const fresh = reply.names.filter((n) => n.new_kind !== 'none' && !this.topics.find(n.text) && fitted.includes(n.text.trim()))
      const farProblem = this.checkFar(npcId, fresh, fitted)
      if (farProblem) {
        this.refused('invented', llm)
        prompt += `\nNOTE: ${farProblem} Answer again.`
        continue
      }
      // Someone new (M10.9): a bond and a place from the lists, a first name that is nobody yet, within bounds.
      const person = namesSomeone(reply.person) ? reply.person : undefined
      const personProblem = person && checkSketch(world, npcId, person, fitted, Boolean(sketch), Boolean(talk?.sketched), (name) => Boolean(this.topics.find(name)))
      if (personProblem) {
        this.refused('invented', llm)
        prompt += `\nNOTE: ${personProblem} Answer again.`
        continue
      }
      // A hidden truth of a story before its stage gives it out (M10.30), unless the game gave it to the speaker in this talk.
      const hidden = hiddenNamed(world, fitted, npcId, `${Object.values(message.sent).join('\n')}\n${prompt.replace(/PLAYER SAYS: <<[^>]*>>/g, '')}`)
      if (hidden) {
        this.refused('leak', llm, `named what ${hidden} keeps hidden`)
        prompt += `\nNOTE: your last reply told something of ${hidden} that nobody here knows yet. Answer again with only what you know.`
        continue
      }
      const leaks = leakedNames(said, this.topics.properNames(), allowedNames)
      if (leaks.length > 0) {
        this.refused('leak', llm)
        prompt += `\nNOTE: you mentioned ${leaks.join(', ')}, which you know nothing about. Answer again without them.`
        continue
      }
      const invented = unknownNames(said, this.vocabulary(), vocabularyOf(text, ...fresh.map((n) => n.text), ...(person ? [person.name] : []), ...(talk?.history ?? []).filter((h) => h.speaker === 'player').map((h) => h.text)))
      if (invented.length > 0) {
        this.refused('invented', llm)
        prompt += `\nNOTE: you used ${invented.join(', ')}, which ${invented.length === 1 ? 'does' : 'do'} not exist in this world. Never make up names. Use only names from PEOPLE YOU KNOW, KNOWLEDGE and SCENE, or say you don't know.`
        continue
      }
      // Kept (M10.10): what the guard put right in place, and a number nobody gave (noted, not changed), in the AI log.
      if (sworn !== trimmed) this.guarded('oath', llm, 'our oath put right')
      for (const f of fixed) this.guarded('not_here', llm, f)
      if (kept.was) this.guarded('address', llm, `${kept.was} > ${talk!.address!.word}`)
      for (const n of strayNumbers(fitted, `${block.shared}\n${block.block}\n${(talk?.thread ?? []).map((t) => t.text).join('\n')}\n${prompt}\n${text}`)) this.guarded('number', llm, `${n} was not given`)
      return { ...reply, reply: fitted }
    }
    this.lastFailure = { kind: 'checks', message: 'both replies failed the checks' }
    return undefined
  }

  /**
   * The turn goes on the thread (M10.28): what the voice was told and what was
   * said back, so the next call reads the talk so far from the cache. A turn
   * the voice never saw (the rules answered) goes on as the stranger's words.
   * Only ever added to: an edit would break what the cache holds.
   */
  heard(talk: TalkState, playerText: string, replyText: string): void {
    const asked = this.asked
    this.asked = undefined
    if (!this.llm()) return
    ;(talk.thread ??= []).push({ role: 'user', text: asked?.text ?? `PLAYER SAYS: <<${playerText.replace(/[<>]/g, '')}>>` }, { role: 'assistant', text: replyText })
    if (asked) talk.sent = asked.sent
  }

  /** A reply thrown away and asked again (M10.19): counted for the dev menu, and the reason in the AI log. */
  private refused(reason: LlmRejection['reason'], llm: LlmClient, detail?: string): void {
    this.world.guard[reason] = (this.world.guard[reason] ?? 0) + 1
    llm.report?.({ reason, ...(detail ? { detail } : {}) })
  }

  /** Counts what the guard did (M10.10), for the dev menu; what it put right or noted also goes to the AI log. */
  private guarded(what: 'anachronism' | 'oath' | 'not_here' | 'number' | 'injection' | 'address', llm?: LlmClient, fixed?: string): void {
    this.world.guard[what] = (this.world.guard[what] ?? 0) + 1
    if (llm && fixed) llm.report?.({ reason: what, fixed })
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
  const terms = `${world.money(o.terms.wage)} a day${o.terms.until ? `, for ${Math.round((o.terms.until - world.now) / (24 * 60))} days` : ''}${o.terms.limits.length ? ', and some places you will not go' : ''}`
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
/**
 * What the player is told when a stock line stands in for the model (M10.8): what happened, and that the line is the
 * game's own, from what the speaker knows, so it is not taken for an answer.
 */
/** After a failed call for want of a connection, how long the rules answer before the model is asked again (M10.29 V). */
const LINK_RETRY_MS = 30_000
/** What the stranger reads when the model cannot be reached, and when it can again (M10.29 V): the game's words, no technical reason. */
export const LINK_DOWN = 'The link to the model is down. Until it is back, people answer from what the game knows of them.'
export const LINK_BACK = 'The link to the model is back.'

export function stockNotice(failure: { kind: string; message: string }, name: string): string {
  const own = `this is the game's own line from what ${name} knows`
  if (failure.kind === 'timeout') return `(The AI took too long; ${own}.)`
  if (failure.kind === 'checks') return `(The AI's answers did not pass the checks; ${own}.)`
  if (failure.kind === 'config') return `(No AI: ${failure.message}; ${own}.)`
  if (failure.kind === 'budget') return `(The AI budget is used up: ${failure.message}; ${own}.)`
  return `(No answer from the AI: ${failure.message}; ${own}.)`
}



function bare(words: string): string {
  return words.trim().replace(/[\s.?!,;:]+$/, '')
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

