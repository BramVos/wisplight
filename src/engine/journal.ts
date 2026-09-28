import type { HexMapData } from './map/view'
import type { LandMapData } from './map/known'
import { hintHolds } from './props'
import type { SheetData } from './rules/player'
import { knownName, knowsWork, personView, publicShort, type PersonView } from './acquaintance'
import { GameClock, weekdayName } from './clock'
import { areaTopicId, callName } from './content'
import type { TopicRegistry } from './dialogue/topics'
import { itemName } from './items'
import { factById, versionOf } from './news'
import { isNear, noun, ties } from './people'
import { askLine, requestName } from './requests'
import { outlineLines, outlineOf } from './outlines'
import type { World } from './world'
import { sketchById, sketches, sketchLines } from './sketches'

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
  kind: 'person' | 'place' | 'area' | 'event' | 'lore' | 'thing' | 'quest' | 'map' | 'sheet' | 'land'
  name: string
  lines: string[]
  sources: string[]
  links: JournalLink[]
  /** Where it is, on the map as the player knows it: rows of characters and a colour code per character. */
  map?: { rows: string[]; classes: string[] }
  /** For a person: what the player saw and was told, laid out (acquaintance.ts). */
  person?: PersonView
  /** For the character sheet: the numbers, for the interface to lay out. */
  sheet?: SheetData
  /** The region in colour (M10), and the land beyond it. */
  hexMap?: HexMapData
  land?: LandMapData
}

export function journalPage(world: World, topics: TopicRegistry, id: string): JournalPage | undefined {
  if (id.startsWith('req_')) return requestPage(world, topics, id)
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
  const newsLines = news.map(({ fact, heard: h }) => `${versionOf(fact, h)} (${who(world, h.from)}, ${day(world, fact.t)})`)
  const newsLinks = news.map(({ fact }) => ({ id: fact.id, name: fact.title, label: 'news' }))

  const npc = entry.kind === 'person' && entry.ref ? content.npcs.get(entry.ref) : undefined
  if (npc) {
    page.kind = 'person'
    page.name = knownName(world, npc.id)
    const met = (world.state.relations?.[npc.id]?.familiarity ?? 0) > 0
    page.lines.push(`${publicShort(world, npc.id)}.`)
    // A hidden trade (M10.8): the cover, until the stranger knows better.
    if (npc.hidden && npc.cover && !knowsWork(world, npc.id)) page.lines.push(`As far as you know, ${npc.cover}.`)
    else if (met || page.sources.length > 0) page.lines.push(...npc.public_facts)
    if (met) page.lines.push(npc.appearance)
    page.links.push(...link(npc.home, 'lives at'))
    // The people they named to the stranger (M10.9): under them in the journal.
    for (const s of sketches(world)) if (s.of === npc.id) page.links.push(...link(s.id, s.bond))
    if (npc.work && npc.work !== npc.home) page.links.push(...link(npc.work, 'works at'))
    page.links.push(...link(areaTopicId(content, world.location(npc.home).area), 'from'))
    // Who they are to others (M10.4): only what the stranger heard or saw: asked, told, or a child seen with a parent.
    const shown = new Set<string>()
    const told = (tie: { id?: string; name: string }) => Boolean(tie.id && world.state.player.knownTies?.[npc.id]?.includes(tie.id)) || npc.public_facts.some((f) => f.includes(tie.name))
    const family = ties(world, npc.id).filter((t) => !t.private && t.kind !== 'known')
    if (met) {
      for (const tie of family.filter(told)) {
        const label = `${noun(tie)}${tie.status === 'alive' ? '' : `, ${tie.status}`}`
        const linked = tie.id ? link(tie.id, label) : []
        if (linked.length) page.links.push(...linked)
        else if (isNear(tie)) page.lines.push(`${callName(npc)}'s ${label}: ${tie.name}.`)
        if (tie.id) shown.add(tie.id)
      }
    }
    for (const other of content.npcs.values()) {
      if (other.id !== npc.id && !shown.has(other.id) && npc.household && other.household === npc.household && world.state.player.knownTies?.[npc.id]?.includes(other.id)) page.links.push(...link(other.id, 'family'))
    }
    if (met && family.length && !family.some(told)) page.lines.push('Family: unknown.')
    const death = world.state.npcs[npc.id]?.dead
    if (death && heard[death.fact]) page.lines.push(`Dead since ${day(world, death.t)}.`)
    const view = personView(world, npc.id)
    page.person = view
    if (view.age) page.lines.push(view.age.known ? `${view.age.text} years old.` : `Looks ${view.age.text.replace(/\?$/, '')} years old, you would guess.`)
    if (view.lastSeen) page.lines.push(`Last seen at ${view.lastSeen.where}, ${view.lastSeen.ago}.`)
    if (view.often.length) page.lines.push(`Often at ${view.often.join(', ')}.`)
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
    page.links.push(...link(areaTopicId(content, location.area), 'in'))
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
    // A hint that the world has overtaken (M10.5): what was true then.
    if (hintHolds(world, fact) === false) page.lines.push('So it was then. It may not be so now.')
    if (h?.grown) page.lines.push('The way you heard it, it may have grown in the telling.')
    if (h && h.reliability < 0.7) page.lines.push("You're not sure it is true.")
    page.links.push(...fact.about.flatMap((topic) => link(topic, 'about')))
    const told = world.state.chronicle?.lore.find((l) => l.facts.includes(id))
    if (told) page.links.push(...link(told.id, 'told as'))
    // Other news about the same people or places: where two stories disagree, they meet here.
    for (const [otherId, other] of Object.entries(heard)) {
      const related = factById(world, otherId)
      if (related && related.id !== id && related.about.some((t) => fact.about.includes(t) && !t.startsWith('area_'))) {
        page.links.push({ id: related.id, name: related.title, label: 'also heard' })
        page.lines.push(`Also heard: ${versionOf(related, other)}`)
      }
    }
  } else if (id.startsWith('chr_')) {
    // Lore of this game: as much of it as the player heard, by level.
    page.kind = 'lore'
    const lore = world.state.chronicle?.lore.find((l) => l.id === id)
    if (lore) {
      const level = Math.max(1, ...lore.facts.map((f) => heard[f]?.level ?? 0), ...(world.state.player.sources?.[id] ?? []).map((s) => s.level))
      page.lines.push(lore.summary)
      if (level >= 2 && lore.details && lore.details !== lore.summary) page.lines.push(lore.details)
      if (level >= 3 && lore.story) page.lines.push(lore.story)
      if (lore.teller) page.links.push(...link(lore.teller, 'told by'))
      for (const f of lore.facts) if (heard[f]) page.links.push({ id: f, name: factById(world, f)?.title ?? f, label: 'event' })
      for (const f of lore.facts) page.links.push(...(factById(world, f)?.about ?? []).flatMap((t) => link(t, 'about')))
      for (const l of lore.links) page.links.push(...link(l, 'see also'))
    }
  } else if (id.startsWith('sketch_')) {
    // Someone named in a talk (M10.9): who they are to the speaker, from whom and when; no family name, no map.
    page.kind = 'person'
    const sketch = sketchById(world, id)
    if (sketch) {
      page.lines.push(...sketchLines(world, sketch))
      page.links.push(...link(sketch.of, 'told by'))
      if (sketch.npc) page.links.push(...link(sketch.npc, 'met as'))
      page.links.push(...link(sketch.place, 'lives in'))
    }
  } else if (id.startsWith('far_')) {
    page.kind = 'place'
    const far = world.state.lore?.far.find((f) => f.id === id)
    if (far) page.lines.push(`A ${far.kind} far away, beyond ${world.words.land}. "${far.line}"`)
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
    const worked = outlineOf(world, id)
    if (worked) {
      page.lines.push(...outlineLines(worked))
    } else if (topic) {
      page.lines.push(topic.summary)
      if (level >= 2 && topic.details) page.lines.push(topic.details)
    }
    if (topic) {
      if (topic.origin) page.links.push(...link(areaTopicId(content, topic.origin), 'from'))
      if (topic.teller) page.links.push(...link(topic.teller, 'told by'))
    }
  }
  page.lines.push(...newsLines)
  page.links.push(...newsLinks)
  page.links = page.links.filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i)
  return page
}

/** A request someone asked of the player: what, why, and how it stands. */
function requestPage(world: World, topics: TopicRegistry, id: string): JournalPage | undefined {
  const request = world.state.requests.find((r) => r.id === id)
  if (!request || request.asked === undefined) return undefined
  const journal = world.state.player.journal ?? {}
  const link = (topicId: string, label: string): JournalLink[] => (journal[topicId] !== undefined && topics.entries.has(topicId) ? [{ id: topicId, name: topics.name(topicId), label }] : [])
  const giver = callName(world.npc(request.npc))
  const status =
    request.status === 'done' ? `Done, ${day(world, request.done ?? world.now)}.` : request.status === 'failed' ? 'It can no longer be done.' : request.reward ? `Open. ${giver} offered a reward.` : 'Open.'
  const page: JournalPage = { id, kind: 'quest', name: requestName(world, request), lines: [`${giver} asked you, ${day(world, request.asked)}: "${askLine(world, request)}"`], sources: [], links: [] }
  if (request.stakes) page.lines.push(request.stakes)
  page.lines.push(status)
  page.links.push(...link(request.npc, 'asked by'))
  if (request.target) page.links.push(...link(request.target, 'go and see'))
  if (request.item) page.links.push(...link(`item_${request.item}`, 'wanted'))
  const lore = world.state.chronicle?.lore.find((l) => l.line === request.line)
  if (lore) page.links.push(...link(lore.id, 'the story'))
  return page
}

function sourcesOf(world: World, id: string): string[] {
  const list = [...(world.state.player.sources?.[id] ?? [])]
  const heard = world.state.news?.heard['player']?.[id]
  if (heard && !list.some((s) => s.from === heard.from)) list.push({ from: heard.from, t: heard.t, level: heard.level })
  return list.sort((a, b) => a.t - b.t).map((s) => `${who(world, s.from)}, ${day(world, s.t)}`)
}

function who(world: World, from: string): string {
  if (from === 'witness') return 'you saw it yourself'
  if (from === 'player') return 'you'
  if (from === 'news') return 'going round'
  if (from === 'board') return 'on the notice board'
  if (from === 'told') return 'you were told to ask for them when you came'
  const npc = world.content.npcs.get(from)
  return npc ? callName(npc) : from
}

function day(world: World, t: number): string {
  const parts = new GameClock(t).parts
  return `${weekdayName(t, world.calendar)} ${parts.day}`
}

function firstSentence(text: string): string {
  return (text.replace(/\s+/g, ' ').trim().match(/^[^.!?]+[.!?]/)?.[0] ?? text).trim()
}
