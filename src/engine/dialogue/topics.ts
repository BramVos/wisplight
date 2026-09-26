import type { Content } from '../content'

// Everything a player can ask about is a topic: people, places, areas, lore,
// facts and goods. Each topic has aliases in English and Dutch; free text is
// matched against them without any AI (FO, chapter 9).

export type TopicKind = 'person' | 'place' | 'area' | 'lore' | 'fact' | 'item'

export interface TopicEntry {
  id: string
  kind: TopicKind
  name: string
  aliases: string[]
  /** For people and places: the content id behind the topic. */
  ref?: string
}

const STOP = new Set(['the', 'a', 'an', 'of', 'de', 'het', 'een'])

export class TopicRegistry {
  readonly entries = new Map<string, TopicEntry>()
  private readonly patterns: { id: string; alias: string; regex: RegExp }[] = []

  constructor(content: Content) {
    for (const npc of content.npcs.values()) {
      const first = npc.name.split(' ')[0]!
      this.add({ id: npc.id, kind: 'person', name: npc.name, ref: npc.id, aliases: [npc.name, first, npc.short, ...npc.aliases] })
    }
    for (const location of content.locations.values()) {
      this.add({ id: location.id, kind: 'place', name: location.name, ref: location.id, aliases: [location.name, ...location.aliases] })
    }
    for (const area of content.areas.values()) {
      this.add({ id: `area_${area.id}`, kind: 'area', name: area.name, ref: area.id, aliases: [area.name, ...area.aliases] })
    }
    for (const topic of content.topics.values()) {
      const kind: TopicKind = topic.kind === 'place' ? 'place' : topic.kind === 'person' ? 'person' : topic.kind
      this.add({ id: topic.id, kind, name: topic.name, aliases: [topic.name, ...topic.aliases] })
    }
    for (const item of content.items.values()) {
      this.add({ id: `item_${item.id}`, kind: 'item', name: item.plural ?? item.name, ref: item.id, aliases: [item.name, ...(item.plural ? [item.plural] : []), ...item.aliases] })
    }
    // Longest aliases first, so "the Drowned Goose" wins over "goose".
    this.patterns.sort((a, b) => b.alias.length - a.alias.length || a.id.localeCompare(b.id))
  }

  private add(entry: TopicEntry): void {
    this.entries.set(entry.id, entry)
    for (const raw of new Set(entry.aliases.map((a) => a.toLowerCase().trim()).filter(Boolean))) {
      const words = raw.split(/\s+/)
      if (words.length === 1 && (STOP.has(raw) || raw.length < 3)) continue
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      this.patterns.push({ id: entry.id, alias: raw, regex: new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'iu') })
    }
  }

  /** Topic ids mentioned in a piece of text, in order of the longest match first. */
  recognise(text: string): string[] {
    let remaining = ` ${text.toLowerCase()} `
    const found: string[] = []
    for (const { id, regex } of this.patterns) {
      const match = remaining.match(regex)
      if (!match || match.index === undefined) continue
      if (!found.includes(id)) found.push(id)
      // Blank out the match so "Drowned Goose" does not also count as "goose".
      remaining = remaining.slice(0, match.index) + ' '.repeat(match[0].length) + remaining.slice(match.index + match[0].length)
    }
    return found
  }

  /** Finds one topic from what a player typed after "ask about". */
  find(text: string): string | undefined {
    const direct = this.recognise(text)[0]
    if (direct) return direct
    const wanted = text.trim().toLowerCase()
    for (const entry of this.entries.values()) {
      if (entry.aliases.some((a) => a.toLowerCase().startsWith(wanted) && wanted.length >= 3)) return entry.id
    }
    return undefined
  }

  name(id: string): string {
    return this.entries.get(id)?.name ?? id
  }

  kind(id: string): TopicKind | undefined {
    return this.entries.get(id)?.kind
  }

  /** Proper names that could leak knowledge if an NPC says them. */
  properNames(): { id: string; name: string }[] {
    const result: { id: string; name: string }[] = []
    for (const entry of this.entries.values()) {
      if (entry.kind === 'item') continue
      for (const alias of entry.aliases) {
        const trimmed = alias.replace(/^(the|de|het)\s+/i, '')
        if (/^[A-Z]/.test(trimmed) && trimmed.length >= 4) result.push({ id: entry.id, name: trimmed })
      }
    }
    return result
  }
}
