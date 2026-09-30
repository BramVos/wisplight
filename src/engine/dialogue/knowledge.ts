import { knob } from '../knobs'
import { callName } from '../content'
import { itemName } from '../items'
import { factById, newsAbout, strangersOwn, versionOf } from '../news'
import type { Heard } from '../state'
import type { World } from '../world'
import type { TopicRegistry } from './topics'
import { goneTo, usualPlace } from '../npc/brain'
import { knowsTheDayOf } from '../people'
import { weekdayName } from '../clock'
import { sketchById, sketchFacts } from '../sketches'

// What an NPC knows about a topic, and therefore what the model may say
// (FO, chapter 5): certain knowledge of the own village and the places the NPC
// goes to, and for everything else a fixed roll against a chance that depends
// on fame, distance, profession and audience.

export type Level = 0 | 1 | 2 | 3


export interface KnownTopic {
  topic: string
  name: string
  level: Level
  facts: string[]
  story?: string
  /** Set when the story is someone else's first-person telling: their name, e.g. "Wouter the eel-fisher". */
  toldBy?: string
  /** News the NPC heard about this topic, with where it came from. */
  news?: string[]
  /** A person: where the NPC thinks they are now, for "where is ...?" without a model (M10.6). */
  where?: string
}

export interface Packet {
  known: KnownTopic[]
  unknown: { topic: string; name: string }[]
  referral?: { npc: string; name: string; call: string; topic: string }
}

/** A sentence with a capital first letter. */
const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** How long a walk is, in words: a few steps, about twenty minutes' walk, about an hour's walk. */
export function walkWords(minutes: number): string {
  return minutes < 5 ? 'a few steps' : minutes < 60 ? `about ${roundTo(minutes, 5)} minutes' walk` : `about ${hours(minutes)} walk`
}

/** The main heading of a route: the direction you walk longest in, not the first step out of the door. */
export function headingOf(world: World, route: { nodes: string[]; directions: string[] }): string | undefined {
  const perDirection = new Map<string, number>()
  route.directions.forEach((direction, i) => {
    const exit = world.location(route.nodes[i]!).exits[direction as keyof ReturnType<World['location']>['exits']]
    perDirection.set(direction, (perDirection.get(direction) ?? 0) + (exit?.minutes ?? 1))
  })
  return [...perDirection.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

export class Knowledge {
  private readonly allKnown = new Map<string, Set<string>>()

  constructor(
    private readonly world: World,
    private readonly topics: TopicRegistry,
  ) {}

  private ownAreas(npcId: string): Set<string> {
    const npc = this.world.npc(npcId)
    const areas = new Set([this.world.location(npc.home).area])
    if (npc.work) areas.add(this.world.location(npc.work).area)
    return areas
  }

  private knownAreas(npcId: string): Set<string> {
    return new Set([...this.ownAreas(npcId), ...this.world.npc(npcId).knows_areas])
  }

  private areaOf(id: string | undefined): string | undefined {
    if (!id) return undefined
    if (this.world.content.areas.has(id)) return id
    return this.world.content.locations.get(id)?.area
  }

  level(npcId: string, topicId: string): Level {
    const entry = this.topics.entries.get(topicId)
    if (!entry) return 0
    if (topicId.startsWith('far_')) return this.far(topicId)?.known_by.includes(npcId) ? 2 : 0
    if (topicId.startsWith('sketch_')) return sketchById(this.world, topicId)?.known_by.includes(npcId) ? 2 : 0
    if (topicId.startsWith('fact_')) return this.world.state.news?.heard[npcId]?.[topicId]?.level ?? 0
    if (topicId.startsWith('chr_')) return this.chronicled(npcId, topicId)
    if (topicId.startsWith('news_')) return this.ownAreas(npcId).has(topicId.slice(5)) && this.news(topicId) ? 2 : 0
    const own = this.ownAreas(npcId)
    const known = this.knownAreas(npcId)
    const { content } = this.world

    switch (entry.kind) {
      case 'person': {
        if (entry.ref === npcId) return 3
        const other = entry.ref ? content.npcs.get(entry.ref) : undefined
        if (other) {
          // Certain knowledge: the own village. Places one goes to regularly: at least the name and face.
          const area = this.areaOf(other.home)!
          if (own.has(area)) return 3
          const chance = this.chanceLevel(npcId, topicId, 'person', other.fame, this.areaPos(area), false, { sells: this.goodsOf(other.id) })
          return Math.max(known.has(area) ? 2 : 0, chance, other.fame >= knob(this.world, 'fame.known_by_all') ? 1 : 0) as Level
        }
        // The famous are a name to everyone (M10.8): "Aelbrecht, curse him", even to a stranger who fishes for more.
        const topic = content.topics.get(topicId)
        return Math.max(this.topicLevel(npcId, topicId), (topic?.fame ?? 0) >= knob(this.world, 'fame.known_by_all') ? 1 : 0) as Level
      }
      case 'place': {
        const location = entry.ref ? content.locations.get(entry.ref) : undefined
        if (location) {
          // Whoever has been there knows it well (FO, chapter 5).
          if (own.has(location.area) || known.has(location.area)) return 3
          const area = content.areas.get(location.area)
          return this.chanceLevel(npcId, topicId, 'place', area?.fame ?? 0, area?.pos, false)
        }
        return this.topicLevel(npcId, topicId)
      }
      case 'area': {
        const area = content.areas.get(entry.ref ?? '')
        if (!area) return 0
        if (own.has(area.id) || known.has(area.id)) return 3
        return this.chanceLevel(npcId, topicId, 'area', area.fame, area.pos, false)
      }
      case 'item':
        return this.sellers(npcId, entry.ref ?? '').length > 0 ? 2 : 1
      default:
        return this.topicLevel(npcId, topicId)
    }
  }

  private topicLevel(npcId: string, topicId: string): Level {
    const topic = this.world.content.topics.get(topicId)
    if (!topic) return 0
    if (topic.known_by.includes(npcId)) return 3
    // What everyone in this world knows (M10.29 P): its peoples, money, law and faiths.
    if (topic.common) return Math.max(2, this.chanceLevel(npcId, topicId, topic.kind === 'person' ? 'person' : topic.kind === 'place' ? 'place' : topic.kind, topic.fame, topic.pos, true, { audience: topic.audience })) as Level
    const origin = this.areaOf(topic.origin)
    const sameArea = origin !== undefined && this.ownAreas(npcId).has(origin)
    const pos = topic.pos ?? (origin ? this.areaPos(origin) : undefined)
    const kind = topic.kind === 'person' ? 'person' : topic.kind === 'place' ? 'place' : topic.kind
    return this.chanceLevel(npcId, topicId, kind, topic.fame, pos, sameArea || topic.everywhere, { audience: topic.audience })
  }

  /** The chance that this NPC knows the topic, before the roll, and the distance band it falls in (FO, chapter 5). */
  chance(npcId: string, topicId: string): { chance: number; band: number } | undefined {
    const topic = this.world.content.topics.get(topicId)
    if (!topic) return undefined
    const origin = this.areaOf(topic.origin)
    const sameArea = origin !== undefined && this.ownAreas(npcId).has(origin)
    const pos = topic.pos ?? (origin ? this.areaPos(origin) : undefined)
    const kind = topic.kind === 'person' ? 'person' : topic.kind === 'place' ? 'place' : topic.kind
    return this.odds(npcId, topicId, kind, topic.fame, pos, sameArea || topic.everywhere, { audience: topic.audience })
  }

  private odds(
    npcId: string,
    topicId: string,
    kind: 'person' | 'place' | 'area' | 'lore' | 'fact',
    fame: number,
    pos: readonly [number, number] | undefined,
    sameSettlement: boolean,
    extra: { sells?: string[]; audience?: Partial<Record<string, number>> } = {},
  ): { chance: number; band: number; cap: number; floor: number } {
    const rules = this.world.content.world.knowledge
    const npc = this.world.npc(npcId)
    const band = sameSettlement ? 0 : this.band(npcId, pos)
    let fameBonus = 0
    let factor = 1
    let cap = rules.max_level[band] ?? 1
    let floor = 0
    for (const m of rules.modifiers) {
      if (m.profession && !m.profession.includes(npc.profession)) continue
      if (m.quirk && !m.quirk.some((q) => npc.quirks.includes(q))) continue
      if (m.min_age !== undefined && npc.age < m.min_age) continue
      if (m.kinds && !m.kinds.includes(kind)) continue
      if (m.topics && !m.topics.includes(topicId)) continue
      if (m.sells && !m.sells.some((item) => extra.sells?.includes(item))) continue
      fameBonus += m.fame
      factor *= m.factor
      cap += m.level
      floor = Math.max(floor, m.min_level)
    }
    const row = rules.chance[Math.max(0, Math.min(5, fame + fameBonus))]!
    let chance = (row[band] ?? 0) * factor
    for (const [who, bonus] of Object.entries(extra.audience ?? {})) {
      if (who === npc.profession || npc.quirks.includes(who) || (who === 'child' && npc.child)) chance += bonus ?? 0
    }
    return { chance: Math.max(0, Math.min(1, chance)), band, cap: Math.max(0, Math.min(3, cap)), floor }
  }

  /**
   * The fixed roll: the same NPC and topic always give the same result in a game.
   * How far under the chance the roll lands sets the level, capped by distance.
   */
  private chanceLevel(...args: Parameters<Knowledge['odds']>): Level {
    const [npcId, topicId] = args
    const { chance, cap, floor } = this.odds(...args)
    const roll = this.roll(npcId, topicId)
    if (roll >= chance) return floor as Level
    const margin = (chance - roll) / chance
    const level = margin >= 2 / 3 ? 3 : margin >= 1 / 3 ? 2 : 1
    return Math.max(floor, Math.min(cap, level)) as Level
  }

  /** A number from 0 to 1 from the game seed, the NPC and the topic (FNV-1a). */
  private roll(npcId: string, topicId: string): number {
    let hash = 0x811c9dc5
    for (const char of `${this.world.state.seed}|${npcId}|${topicId}`) {
      hash ^= char.charCodeAt(0)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash / 2 ** 32
  }

  /** The distance band from the NPC's home to a place: 1 up to 10 km, 2 up to 30, 3 up to 100, 4 farther. */
  private band(npcId: string, pos: readonly [number, number] | undefined): number {
    const home = this.areaPos(this.world.location(this.world.npc(npcId).home).area)
    if (!pos || !home) return 1
    const km = Math.hypot(pos[0] - home[0], pos[1] - home[1])
    const [a, b, c] = this.world.content.world.knowledge.bands_km
    return km <= a ? 1 : km <= b ? 2 : km <= c ? 3 : 4
  }

  private areaPos(area: string | undefined): readonly [number, number] | undefined {
    return area ? this.world.content.areas.get(area)?.pos : undefined
  }

  private goodsOf(npcId: string): string[] {
    return [...this.world.content.locations.values()].flatMap((l) => l.services.filter((s) => s.provider === npcId).flatMap((s) => Object.keys(s.sells)))
  }

  /** Every topic the NPC knows at all: the basis of the leak check. */
  knownTopics(npcId: string): Set<string> {
    const cached = this.allKnown.get(npcId)
    if (cached) return cached
    const result = new Set([...this.topics.entries.keys()].filter((id) => this.level(npcId, id) > 0))
    this.allKnown.set(npcId, result)
    return result
  }

  packet(npcId: string, topicIds: string[], wantsStory = false): Packet {
    const packet: Packet = { known: [], unknown: [] }
    for (const topic of topicIds) {
      const level = this.level(npcId, topic)
      const name = this.topics.name(topic)
      if (level === 0) packet.unknown.push({ topic, name })
      else {
        // What the stranger did is no news to tell the stranger (M10.33 F).
        const news = topic.startsWith('fact_') ? [] : newsAbout(this.world, npcId, [topic], 4).filter(({ fact }) => !strangersOwn(fact)).slice(0, 2).map(({ fact, heard }) => `${versionOf(fact, heard)} ${this.source(heard)}`)
        packet.known.push({ topic, name, level, ...this.facts(npcId, topic, level, wantsStory), ...(news.length ? { news } : {}) })
      }
    }
    const missing = packet.unknown[0]
    if (missing) packet.referral = this.referral(npcId, missing.topic)
    return packet
  }

  private facts(npcId: string, topicId: string, level: Level, wantsStory: boolean): { facts: string[]; story?: string; toldBy?: string; where?: string } {
    const entry = this.topics.entries.get(topicId)!
    const { content } = this.world
    const facts: string[] = []
    let where: string | undefined
    switch (entry.kind) {
      case 'person': {
        const other = entry.ref ? content.npcs.get(entry.ref) : undefined
        if (other) {
          // Someone who died, as far as the speaker has heard (found in the M9.4 playtest: asked about
          // Wenna, the day she drowned, Maren told where to buy her salt fish).
          const heard = this.world.state.news?.heard[npcId] ?? {}
          const death = this.world.state.npcs[other.id]?.dead ? (this.world.state.news?.facts ?? []).findLast((f) => f.kind === 'death' && f.about.includes(other.id) && heard[f.id]) : undefined
          if (death) {
            facts.push(versionOf(death, heard[death.id]!))
            break
          }
          facts.push(...other.public_facts)
          if (level >= 2) {
            facts.push(`${other.short} lives at ${this.world.location(other.home).name}.`)
            if (other.work && other.work !== other.home) facts.push(`${other.short} works at ${this.world.location(other.work).name}.`)
            facts.push(`What ${other.short} looks like: ${firstSentence(other.appearance)}`)
          }
          where = this.whereabouts(npcId, other.id, level)
          if (where) facts.push(where)
          break
        }
        facts.push(...this.topicFacts(npcId, topicId, level))
        break
      }
      case 'place': {
        const location = entry.ref ? content.locations.get(entry.ref) : undefined
        if (location) {
          facts.push(location.summary ?? firstSentence(location.description.day))
          facts.push(this.directions(npcId, location.id, level))
          for (const service of location.services) {
            const seller = content.npcs.get(service.provider)?.short
            const goods = Object.keys(service.sells).map((i) => itemName(content, i, 2).replace(/^2 /, ''))
            // A sentence starts with a capital (M10.29: "the chief engineer sells ..." reached the talk as it was).
            if (seller && goods.length) facts.push(upper(`${seller} sells ${goods.join(' and ')} there.`))
          }
          break
        }
        facts.push(...this.topicFacts(npcId, topicId, level))
        const topic = content.topics.get(topicId)
        if (topic?.pos) facts.push(this.farDirections(npcId, topic.pos, level, entry.name))
        break
      }
      case 'area': {
        const area = content.areas.get(entry.ref ?? '')!
        facts.push(area.summary)
        const target = [...content.locations.values()].find((l) => l.area === area.id)
        if (target && level >= 2) facts.push(this.directions(npcId, target.id, 2, area.name))
        break
      }
      case 'item': {
        for (const seller of this.sellers(npcId, entry.ref ?? '')) facts.push(seller)
        if (facts.length === 0) facts.push(`You don't know anyone round here who sells ${entry.name}.`)
        break
      }
      default:
        facts.push(...this.topicFacts(npcId, topicId, level))
    }
    const topic = content.topics.get(topicId)
    const lore = topicId.startsWith('chr_') ? this.lore(topicId) : undefined
    const story = wantsStory && level >= 2 ? (topic?.story ?? (level >= 3 ? lore?.story : undefined))?.trim() || undefined : undefined
    const teller = topic?.teller ?? lore?.teller
    const toldBy = story && teller && teller !== npcId ? content.npcs.get(teller)?.short : undefined
    return { facts: facts.filter(Boolean), story, toldBy, ...(where ? { where } : {}) }
  }

  /** Forgets what was worked out about an NPC's knowledge, after it learned something new. */
  forget(npcId: string): void {
    this.allKnown.delete(npcId)
  }

  private far(topicId: string) {
    return this.world.state.lore?.far.find((f) => f.id === topicId)
  }

  /** Where the NPC has it from, and how sure it is, in words for the prompt. */
  source(heard: Heard): string {
    const from =
      heard.from === 'witness'
        ? 'You saw it yourself.'
        : heard.from === 'player'
          ? 'The stranger told you.'
          : heard.from === 'news'
            ? 'It is going round; you heard it from people passing through.'
            : heard.from === 'board'
              ? 'You read it on the notice board.'
              : this.world.content.npcs.has(heard.from)
                ? `You heard it from ${callName(this.world.npc(heard.from))}.`
                : 'You heard it somewhere.'
    const sure = heard.reliability >= 0.9 ? '' : heard.reliability >= 0.7 ? ' You are fairly sure.' : ' You are not sure it is true.'
    return `(${from}${sure}${heard.grown ? ' The way you heard it, it was bigger than this.' : ''})`
  }

  /** Lore of this game: known as well as the news it came from was heard; its witness-teller knows it all. */
  private chronicled(npcId: string, topicId: string): Level {
    const lore = this.lore(topicId)
    if (!lore) return 0
    if (lore.teller === npcId) return 3
    // A legend of the old days (M9.1): told where it happened, and far off when it is famous; the old know it best.
    if (lore.by === 'legend') {
      if (!this.world.content.npcs.has(npcId)) return 0
      const near = this.ownAreas(npcId).has(this.world.location(lore.place).area)
      const base = near ? 2 : lore.fame >= 4 ? 1 : 0
      return Math.min(3, base + (base > 0 && this.world.npc(npcId).age >= 50 ? 1 : 0)) as Level
    }
    const heard = this.world.state.news?.heard[npcId] ?? {}
    return Math.max(0, ...lore.facts.map((f) => heard[f]?.level ?? 0)) as Level
  }

  private lore(topicId: string) {
    return this.world.state.chronicle?.lore.find((l) => l.id === topicId)
  }

  /** The chronicler's line of news for an area, while it is fresh: two days. */
  private news(topicId: string): string | undefined {
    const item = this.world.state.chronicle?.news[topicId.slice(5)]
    return item && this.world.now - item.t < 2 * 24 * 60 ? item.text : undefined
  }

  private topicFacts(npcId: string, topicId: string, level: Level): string[] {
    const lore = topicId.startsWith('chr_') ? this.lore(topicId) : undefined
    if (lore) {
      const near = this.ownAreas(npcId).has(this.world.location(lore.place).area)
      if (level >= 3) return [lore.summary, lore.details].filter(Boolean)
      if (level === 2) return [lore.details || lore.summary]
      return [near ? lore.summary : lore.far || lore.summary]
    }
    const news = topicId.startsWith('news_') ? this.news(topicId) : undefined
    if (news) return [`News of the day here: ${news}`]
    const fact = topicId.startsWith('fact_') ? factById(this.world, topicId) : undefined
    if (fact) {
      const heard = this.world.state.news?.heard[npcId]?.[topicId]
      return heard ? [`${versionOf(fact, heard)} ${this.source(heard)}`] : [fact.text.far]
    }
    const sketch = topicId.startsWith('sketch_') ? sketchById(this.world, topicId) : undefined
    if (sketch) return sketchFacts(this.world, sketch, npcId)
    const far = this.far(topicId)
    if (far) return [`${far.name} is a ${far.kind} far away, beyond ${this.world.words.land}.`, `What was said of it: "${far.line}"`]
    const topic = this.world.content.topics.get(topicId)
    if (!topic) return []
    return level >= 2 && topic.details ? [topic.summary, topic.details] : [topic.summary]
  }

  private sellers(npcId: string, item: string): string[] {
    const known = this.knownAreas(npcId)
    const result: string[] = []
    for (const location of this.world.content.locations.values()) {
      if (!known.has(location.area)) continue
      for (const service of location.services) {
        if (!(item in service.sells)) continue
        const seller = this.world.content.npcs.get(service.provider)
        const price = this.world.price(location.id, service, item)
        if (seller) result.push(upper(`${seller.short} sells ${itemName(this.world.content, item, 2).replace(/^2 /, '')} at ${location.name}, about ${this.world.money(price)} each.`))
      }
    }
    return result
  }

  private directions(npcId: string, to: string, level: Level, label?: string): string {
    const from = this.world.npcState(npcId).location
    const route = this.world.route(from, to)
    const name = label ?? this.world.location(to).name
    if (!route || route.minutes === 0) return `${name} is right here.`
    const time = walkWords(route.minutes)
    const heading = headingOf(this.world, route)
    if (level < 3) return `${name} is ${time} from here, ${heading}.`
    const legs = route.nodes.slice(1, 4).map((node, i) => `${route.directions[i]} to ${this.world.location(node).name}`)
    return `${name} is ${time} from here: ${legs.join(', then ')}${route.nodes.length > 4 ? ', and on from there' : ''}.`
  }

  /**
   * For places beyond the NPC's own surroundings: the direction on eight winds and the
   * time on foot, worked out from the map, never the route (FO, chapter 5).
   */
  private farDirections(npcId: string, pos: readonly [number, number], level: Level, name: string): string {
    const home = this.areaPos(this.world.location(this.world.npc(npcId).home).area)
    if (!home) return ''
    const dx = pos[0] - home[0]
    const dy = pos[1] - home[1]
    const winds = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east']
    const wind = winds[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]!
    if (level < 2) return `${name} lies somewhere to the ${wind}.`
    const km = Math.hypot(dx, dy)
    const days = Math.round((km / 40) * 2) / 2
    const time = km < 30 ? `about ${Math.max(1, Math.round(km / 5))} hours on foot` : days <= 1 ? 'about a day on foot' : `about ${days % 1 ? `${Math.floor(days)} and a half` : days} days on foot`
    return `${name} lies ${wind}, ${time}.`
  }

  /**
   * Where someone is likely to be now, as this NPC would know it (after the M7
   * playtest): what they saw themselves beats the day schedule; those close to
   * the person know the schedule to the place, a good acquaintance guesses it,
   * and someone who only knows of them names the village.
   */
  whereabouts(npcId: string, otherId: string, level: number): string | undefined {
    const world = this.world
    const other = world.npc(otherId)
    const them = world.state.npcs[otherId]
    const me = world.state.npcs[npcId]
    if (!them || them.dead || them.absent || !me) return undefined
    if (me.location === them.location && !them.note) return `${other.short} is right here.`
    const seen = me.sightings?.[otherId]
    const ago = seen ? world.now - seen.t : Infinity
    if (seen && ago <= 3 * 60) return `You saw ${other.short} at ${world.location(seen.where).name} ${agoWords(ago)}.`
    const usual = usualPlace(world, otherId)
    const close = knowsTheDayOf(world, npcId, otherId)
    // Gone somewhere else today, and those who know their day know where (M10.6: Mirte at the market in Waagdam).
    const gone = close ? goneTo(world, otherId) : undefined
    if (gone) {
      const area = world.content.areas.get(world.location(gone).area)
      const day = weekdayName(world.now, world.calendar)
      const market = area?.market_days.includes(day) ? `; it's ${day}, market day there` : ''
      return `${other.short} has gone to ${area?.name ?? world.location(gone).name} today${market}.`
    }
    if (usual && close) return `At this hour ${other.short} is usually at ${world.location(usual.place).name}${ACTIVITY[usual.activity] ? `, ${ACTIVITY[usual.activity]}` : ''}.`
    if (usual && level >= 3) return `Around this time ${other.short} is usually at ${world.location(usual.place).name}, you'd guess.`
    if (seen && ago <= 24 * 60) return `You last saw ${other.short} at ${world.location(seen.where).name} ${agoWords(ago)}.`
    if (usual && level >= 2) {
      const area = world.content.areas.get(world.location(usual.place).area)
      if (area) return `You'd most likely find ${other.short} somewhere in ${area.name}.`
    }
    return undefined
  }

  /** Someone within 5 km whom the NPC knows, and who probably knows more about the topic (FO, chapter 5). */
  private referral(npcId: string, topicId: string): Packet['referral'] {
    const here = this.areaPos(this.world.location(this.world.npc(npcId).home).area)
    const near = (id: string) => {
      const there = this.areaPos(this.world.location(this.world.npc(id).home).area)
      return !here || !there || Math.hypot(there[0] - here[0], there[1] - here[1]) <= 5
    }
    const candidates = [...this.world.content.npcs.keys()]
      .filter((id) => id !== npcId && near(id) && this.level(npcId, id) >= 2)
      .map((id) => ({ id, level: this.level(id, topicId), curiosity: this.world.npc(id).personality.curiosity }))
      .filter((c) => c.level >= 2)
      .sort((a, b) => b.level - a.level || b.curiosity - a.curiosity || a.id.localeCompare(b.id))
    const best = candidates[0]
    return best ? { npc: best.id, name: this.world.npc(best.id).short, call: callName(this.world.npc(best.id)), topic: topicId } : undefined
  }
}

const ACTIVITY: Partial<Record<string, string>> = { work: 'working', sleep: 'asleep', eat: 'eating', socialize: 'with company', pray: 'at prayer' }

function agoWords(minutes: number): string {
  if (minutes < 20) return 'just now'
  if (minutes < 90) return 'an hour ago'
  if (minutes < 4 * 60) return 'a couple of hours ago'
  if (minutes < 12 * 60) return 'earlier today'
  return 'yesterday'
}

function firstSentence(text: string): string {
  return (text.replace(/\s+/g, ' ').trim().match(/^[^.!?]+[.!?]/)?.[0] ?? text).trim()
}

function roundTo(value: number, step: number): number {
  return Math.max(step, Math.round(value / step) * step)
}

function hours(minutes: number): string {
  const half = Math.round(minutes / 30) / 2
  if (half <= 1) return "an hour's"
  if (half === 1.5) return "an hour and a half's"
  const whole = Math.floor(half)
  return half % 1 ? `${whole} and a half hours'` : `${whole} hours'`
}
