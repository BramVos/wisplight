import { GameClock } from './clock'
import { callName } from './content'
import type { TopicRegistry } from './dialogue/topics'
import { itemName } from './items'
import { factById, versionOf } from './news'
import { isNear, noun, ties } from './people'
import type { World } from './world'

// The journal as a reference book (design: lore and world change, "Wat de
// speler ziet"). Built from data, never from AI, and it gives nothing away:
// only what the player learned, with where it came from and links between
// people, places, events and lore.

export interface JournalLink {
  id: string
  name: string
  label: string
}

export interface JournalPage {
  id: string
  kind: 'person' | 'place' | 'area' | 'event' | 'lore' | 'thing'
  name: string
  lines: string[]
  sources: string[]
  links: JournalLink[]
}

export function journalPage(world: World, topics: TopicRegistry, id: string): JournalPage | undefined {
  const journal = world.state.player.journal ?? {}
  const entry = topics.entries.get(id)
  if (!entry || journal[id] === undefined) return undefined
  const known = (topicId: string) => journal[topicId] !== undefined
  const link = (topicId: string, label: string): JournalLink[] => (known(topicId) && topicId !== id ? [{ id: topicId, name: topics.name(topicId), label }] : [])
  const heard = world.state.news?.heard['player'] ?? {}
  const seen = new Set(world.state.player.seen ?? [])
  const { content } = world

  const page: JournalPage = { id, kind: 'lore', name: entry.name, lines: [], sources: sourcesOf(world, id), links: [] }
  // News the player heard about this topic, side by side: two versions of one story show here together.
  const news = Object.entries(heard)
    .map(([factId, h]) => ({ fact: factById(world, factId)!, heard: h }))
    .filter(({ fact }) => fact && fact.id !== id && fact.about.includes(id))
    .sort((a, b) => a.fact.t - b.fact.t)
  const newsLines = news.map(({ fact, heard: h }) => `${versionOf(fact, h)} (${who(world, h.from)}, ${day(fact.t)})`)
  const newsLinks = news.map(({ fact }) => ({ id: fact.id, name: fact.title, label: 'news' }))

  const npc = entry.kind === 'person' && entry.ref ? content.npcs.get(entry.ref) : undefined
  if (npc) {
    page.kind = 'person'
    const met = (world.state.relations?.[npc.id]?.familiarity ?? 0) > 0
    page.lines.push(`${npc.short}.`)
    if (met || page.sources.length > 0) page.lines.push(...npc.public_facts)
    if (met) page.lines.push(npc.appearance)
    page.links.push(...link(npc.home, 'lives at'))
    if (npc.work && npc.work !== npc.home) page.links.push(...link(npc.work, 'works at'))
    page.links.push(...link(`area_${world.location(npc.home).area}`, 'from'))
    // Who they are to others is village knowledge, once you have met them; private ties stay private.
    const shown = new Set<string>()
    if (met) {
      for (const tie of ties(world, npc.id).filter((t) => !t.private && t.kind !== 'known')) {
        const label = `${noun(tie)}${tie.status === 'alive' ? '' : `, ${tie.status}`}`
        const linked = tie.id ? link(tie.id, label) : []
        if (linked.length) page.links.push(...linked)
        else if (isNear(tie)) page.lines.push(`${callName(npc)}'s ${label}: ${tie.name}.`)
        if (tie.id) shown.add(tie.id)
      }
    }
    for (const other of content.npcs.values()) {
      if (other.id !== npc.id && !shown.has(other.id) && npc.household && other.household === npc.household) page.links.push(...link(other.id, 'family'))
    }
    const death = world.state.npcs[npc.id]?.dead
    if (death && heard[death.fact]) page.lines.push(`Dead since ${day(death.t)}.`)
  } else if (entry.kind === 'place' && entry.ref) {
    page.kind = 'place'
    const location = content.locations.get(entry.ref)!
    page.lines.push(location.summary ?? firstSentence(location.description.day))
    if (seen.has(location.id)) {
      for (const service of location.services) {
        const goods = Object.keys(service.sells).map((i) => itemName(content, i, 2).replace(/^2 /, ''))
        if (goods.length) page.lines.push(`${callName(content.npcs.get(service.provider)!)} sells ${goods.join(' and ')} here.`)
      }
    } else {
      page.lines.push("You haven't been there yourself.")
    }
    page.links.push(...link(`area_${location.area}`, 'in'))
    for (const other of content.npcs.values()) {
      if (other.home === location.id) page.links.push(...link(other.id, 'lives here'))
      else if (other.work === location.id) page.links.push(...link(other.id, 'works here'))
    }
  } else if (entry.kind === 'area') {
    page.kind = 'place'
    const area = content.areas.get(entry.ref ?? '')!
    page.lines.push(area.summary)
    for (const location of [...content.locations.values()].filter((l) => l.area === area.id)) page.links.push(...link(location.id, 'place'))
    for (const other of content.npcs.values()) if (world.location(other.home).area === area.id) page.links.push(...link(other.id, 'lives here'))
  } else if (id.startsWith('fact_')) {
    page.kind = 'event'
    const fact = factById(world, id)!
    const h = heard[id]
    page.lines.push(h ? versionOf(fact, h) : fact.text.far)
    if (h?.grown) page.lines.push('The way you heard it, it may have grown in the telling.')
    if (h && h.reliability < 0.7) page.lines.push("You're not sure it is true.")
    page.links.push(...fact.about.flatMap((topic) => link(topic, 'about')))
    // Other news about the same people or places: where two stories disagree, they meet here.
    for (const [otherId, other] of Object.entries(heard)) {
      const related = factById(world, otherId)
      if (related && related.id !== id && related.about.some((t) => fact.about.includes(t) && !t.startsWith('area_'))) {
        page.links.push({ id: related.id, name: related.title, label: 'also heard' })
        page.lines.push(`Also heard: ${versionOf(related, other)}`)
      }
    }
  } else if (id.startsWith('far_')) {
    page.kind = 'place'
    const far = world.state.lore?.far.find((f) => f.id === id)
    if (far) page.lines.push(`A ${far.kind} far away, beyond the Nethermarch. "${far.line}"`)
  } else if (entry.kind === 'item') {
    page.kind = 'thing'
    for (const location of content.locations.values()) {
      if (!seen.has(location.id)) continue
      for (const service of location.services) {
        if (entry.ref && entry.ref in service.sells) {
          page.lines.push(`${callName(content.npcs.get(service.provider)!)} sells it at ${location.name}.`)
          page.links.push(...link(location.id, 'sold at'))
        }
      }
    }
    if (page.lines.length === 0) page.lines.push("You don't know yet where to buy it.")
  } else {
    page.kind = entry.kind === 'place' ? 'place' : entry.kind === 'person' ? 'person' : 'lore'
    const topic = content.topics.get(id)
    const level = Math.max(0, ...(world.state.player.sources?.[id] ?? []).map((s) => s.level))
    if (topic) {
      page.lines.push(topic.summary)
      if (level >= 2 && topic.details) page.lines.push(topic.details)
      if (topic.origin) page.links.push(...link(`area_${topic.origin}`, 'from'))
      if (topic.teller) page.links.push(...link(topic.teller, 'told by'))
    }
  }
  page.lines.push(...newsLines)
  page.links.push(...newsLinks)
  page.links = page.links.filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i)
  return page
}

function sourcesOf(world: World, id: string): string[] {
  const list = [...(world.state.player.sources?.[id] ?? [])]
  const heard = world.state.news?.heard['player']?.[id]
  if (heard && !list.some((s) => s.from === heard.from)) list.push({ from: heard.from, t: heard.t, level: heard.level })
  return list.sort((a, b) => a.t - b.t).map((s) => `${who(world, s.from)}, ${day(s.t)}`)
}

function who(world: World, from: string): string {
  if (from === 'witness') return 'you saw it yourself'
  if (from === 'player') return 'you'
  const npc = world.content.npcs.get(from)
  return npc ? callName(npc) : from
}

function day(t: number): string {
  const parts = new GameClock(t).parts
  return `${parts.weekday} ${parts.day}`
}

function firstSentence(text: string): string {
  return (text.replace(/\s+/g, ' ').trim().match(/^[^.!?]+[.!?]/)?.[0] ?? text).trim()
}
