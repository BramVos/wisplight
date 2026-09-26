import { callName } from '../content'
import { itemName } from '../items'
import type { World } from '../world'
import type { TopicRegistry } from './topics'

// What an NPC knows about a topic, and therefore what the model may say
// (FO, chapter 5). M2 uses a fixed rule: own area, known areas, fame and
// named keepers of a secret. M3 replaces it with the chance model.

export type Level = 0 | 1 | 2 | 3

export interface KnownTopic {
  topic: string
  name: string
  level: Level
  facts: string[]
  story?: string
  /** Set when the story is someone else's first-person telling: their name, e.g. "Wouter the eel-fisher". */
  toldBy?: string
}

export interface Packet {
  known: KnownTopic[]
  unknown: { topic: string; name: string }[]
  referral?: { npc: string; name: string; call: string; topic: string }
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
    const own = this.ownAreas(npcId)
    const known = this.knownAreas(npcId)
    const { content } = this.world

    switch (entry.kind) {
      case 'person': {
        if (entry.ref === npcId) return 3
        const other = entry.ref ? content.npcs.get(entry.ref) : undefined
        if (other) {
          const area = this.areaOf(other.home)!
          if (own.has(area)) return 3
          if (known.has(area)) return 2
          return other.fame >= 3 ? 1 : 0
        }
        return this.topicLevel(npcId, topicId, known)
      }
      case 'place': {
        const location = entry.ref ? content.locations.get(entry.ref) : undefined
        if (location) return own.has(location.area) ? 3 : known.has(location.area) ? 2 : 0
        return this.topicLevel(npcId, topicId, known)
      }
      case 'area': {
        const area = content.areas.get(entry.ref ?? '')
        if (!area) return 0
        if (own.has(area.id)) return 3
        if (known.has(area.id)) return 2
        return area.fame >= 3 ? 1 : 0
      }
      case 'item':
        return this.sellers(npcId, entry.ref ?? '').length > 0 ? 2 : 1
      default:
        return this.topicLevel(npcId, topicId, known)
    }
  }

  private topicLevel(npcId: string, topicId: string, known: Set<string>): Level {
    const topic = this.world.content.topics.get(topicId)
    if (!topic) return 0
    if (topic.known_by.includes(npcId)) return 3
    const origin = this.areaOf(topic.origin)
    if (origin && known.has(origin)) return 2
    if (topic.fame >= 5) return 2
    return topic.fame >= 3 ? 1 : 0
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
      else packet.known.push({ topic, name, level, ...this.facts(npcId, topic, level, wantsStory) })
    }
    const missing = packet.unknown[0]
    if (missing) packet.referral = this.referral(npcId, missing.topic)
    return packet
  }

  private facts(npcId: string, topicId: string, level: Level, wantsStory: boolean): { facts: string[]; story?: string; toldBy?: string } {
    const entry = this.topics.entries.get(topicId)!
    const { content } = this.world
    const facts: string[] = []
    switch (entry.kind) {
      case 'person': {
        const other = entry.ref ? content.npcs.get(entry.ref) : undefined
        if (other) {
          facts.push(...other.public_facts)
          if (level >= 2) {
            facts.push(`${other.short} lives at ${this.world.location(other.home).name}.`)
            if (other.work && other.work !== other.home) facts.push(`${other.short} works at ${this.world.location(other.work).name}.`)
          }
          break
        }
        facts.push(...this.topicFacts(topicId, level))
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
            if (seller && goods.length) facts.push(`${seller} sells ${goods.join(' and ')} there.`)
          }
          break
        }
        facts.push(...this.topicFacts(topicId, level))
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
        facts.push(...this.topicFacts(topicId, level))
    }
    const topic = content.topics.get(topicId)
    const story = wantsStory && level >= 2 ? topic?.story?.trim() : undefined
    const toldBy = story && topic?.teller && topic.teller !== npcId ? content.npcs.get(topic.teller)?.short : undefined
    return { facts: facts.filter(Boolean), story, toldBy }
  }

  /** Forgets what was worked out about an NPC's knowledge, after it learned something new. */
  forget(npcId: string): void {
    this.allKnown.delete(npcId)
  }

  private far(topicId: string) {
    return this.world.state.lore?.far.find((f) => f.id === topicId)
  }

  private topicFacts(topicId: string, level: Level): string[] {
    const far = this.far(topicId)
    if (far) return [`${far.name} is a ${far.kind} far away, beyond the Nethermarch.`, `What was said of it: "${far.line}"`]
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
        if (seller) result.push(`${seller.short} sells ${itemName(this.world.content, item, 2).replace(/^2 /, '')} at ${location.name}, about ${price} duiten each.`)
      }
    }
    return result
  }

  private directions(npcId: string, to: string, level: Level, label?: string): string {
    const from = this.world.npcState(npcId).location
    const route = this.world.route(from, to)
    const name = label ?? this.world.location(to).name
    if (!route || route.minutes === 0) return `${name} is right here.`
    const time = route.minutes < 5 ? 'a few steps' : route.minutes < 60 ? `about ${roundTo(route.minutes, 5)} minutes' walk` : `about ${hours(route.minutes)} walk`
    // The main heading is the direction you walk longest in, not the first step out of the door.
    const perDirection = new Map<string, number>()
    route.directions.forEach((direction, i) => {
      const exit = this.world.location(route.nodes[i]!).exits[direction]
      perDirection.set(direction, (perDirection.get(direction) ?? 0) + (exit?.minutes ?? 1))
    })
    const heading = [...perDirection.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (level < 3) return `${name} is ${time} from here, ${heading}.`
    const legs = route.nodes.slice(1, 4).map((node, i) => `${route.directions[i]} to ${this.world.location(node).name}`)
    return `${name} is ${time} from here: ${legs.join(', then ')}${route.nodes.length > 4 ? ', and on from there' : ''}.`
  }

  /** Someone the NPC knows who probably knows more about the topic. */
  private referral(npcId: string, topicId: string): Packet['referral'] {
    const candidates = [...this.world.content.npcs.keys()]
      .filter((id) => id !== npcId && this.level(npcId, id) >= 2)
      .map((id) => ({ id, level: this.level(id, topicId), curiosity: this.world.npc(id).personality.curiosity }))
      .filter((c) => c.level >= 2)
      .sort((a, b) => b.level - a.level || b.curiosity - a.curiosity || a.id.localeCompare(b.id))
    const best = candidates[0]
    return best ? { npc: best.id, name: this.world.npc(best.id).short, call: callName(this.world.npc(best.id)), topic: topicId } : undefined
  }
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
