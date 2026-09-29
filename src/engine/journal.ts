import { planOf, planText } from './plan'
import type { HexMapData } from './map/view'
import type { LandMapData } from './map/known'
import { hintHolds } from './props'
import type { SheetData } from './rules/player'
import { knownName, knowsWork, personView, publicShort, type PersonView } from './acquaintance'
import { GameClock, weekdayName } from './clock'
import { areaTopicId, callName, type Content, type Service } from './content'
import type { TopicRegistry } from './dialogue/topics'
import { itemName } from './items'
import { factById, versionOf } from './news'
import { isNear, noun, ties } from './people'
import { askLine, requestName } from './requests'
import { outlineLines, outlineOf } from './outlines'
import type { World } from './world'
import { historyOf, lastSaid } from './pasttalks'
import { knownFrom } from './rules/player'
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
  /** For a person (M10.29 R): every talk as it went, by day, the newest first; the History tab. */
  history?: { day: string; talks: { you: boolean; text: string }[][] }[]
  /** The frames of the game (M10.24): the world, its lands and great lines, the dials and the play mode. */
  frames?: import('./frames').FramesView
  /** For the character sheet: the numbers, for the interface to lay out. */
  sheet?: SheetData
  /** The plan of a settlement as the stranger knows it, as text (M10.29 I): on its area's page. */
  planText?: string[]
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
    // Who knows the stranger from before, by their background (M10.29 C).
    const from = knownFrom(world, npc.id)
    if (from !== undefined) page.lines.push(`You know ${callName(npc)} from before${from ? `: ${from}` : ''}.`)
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
    // What they told you, and what stands between you (M10.29 R: the About tab).
    const toldYou = Object.entries(heard)
      .filter(([, h]) => h.from === npc.id)
      .map(([id, h]) => ({ fact: factById(world, id), h }))
      .filter((x): x is { fact: NonNullable<typeof x.fact>; h: typeof x.h } => Boolean(x.fact))
      .slice(-3)
    for (const { fact, h } of toldYou) page.lines.push(`${callName(npc)} told you: ${versionOf(fact, h)}`)
    const between = (world.state.agreements?.list ?? []).filter((a) => (a.by === npc.id && a.to === 'player') || (a.by === 'player' && a.to === npc.id)).slice(-4)
    for (const a of between) page.lines.push(`Between you: ${a.by === 'player' ? 'you' : callName(npc)} to ${a.what}${a.status === 'open' ? '' : ` (${a.status})`}.`)
    for (const r of world.state.requests.filter((r) => r.npc === npc.id && r.status === 'open')) page.lines.push(`${callName(npc)} asked you: ${r.name ?? r.kind ?? 'a favour'}.`)
    const last = lastSaid(world, npc.id)
    if (last) page.lines.push(`Last time: ${last}`)
    // Every talk as it went, by day (M10.29 R: the History tab), never for the model.
    const history = historyOf(world, npc.id)
    if (history.length) page.history = history.map((d) => ({ day: d.day, talks: d.talks.map((t) => t.map((l) => ({ you: l.you, text: l.text }))) }))
  } else if (entry.kind === 'place' && entry.ref) {
    page.kind = 'place'
    const location = content.locations.get(entry.ref)!
    page.lines.push(location.summary ?? firstSentence(location.description.day))
    if (seen.has(location.id)) {
      // One line a provider (M10.29: the Commons said "Sana sells hot meals here." three times, for three meals).
      const providers = new Map<string, Service[]>()
      for (const service of location.services) providers.set(service.provider, [...(providers.get(service.provider) ?? []), service])
      for (const [provider, services] of providers) {
        const sells = sellsLine(content, services)
        if (sells) page.lines.push(`${callName(content.npcs.get(provider)!)} sells ${sells}.`)
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
    // The places the stranger stood in, then those only heard of (M10.29).
    const places = [...content.locations.values()].filter((l) => l.area === area.id)
    for (const location of places.filter((l) => seen.has(l.id))) page.links.push(...link(location.id, 'place'))
    for (const location of places.filter((l) => !seen.has(l.id))) page.links.push(...link(location.id, 'heard of'))
    for (const other of content.npcs.values()) if (world.location(other.home).area === area.id) page.links.push(...link(other.id, 'lives here'))
    // The plan of it as the stranger knows it, as text (M10.29 I), for a settlement of more than one place.
    const plan = planOf(world, area.id)
    if (plan) page.planText = planText(plan)
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
      const providers = [...new Set(location.services.filter((s) => entry.ref && entry.ref in s.sells).map((s) => s.provider))]
      for (const provider of providers) page.lines.push(`${callName(content.npcs.get(provider)!)} sells it at ${location.name}.`)
      if (providers.length) page.links.push(...link(location.id, 'sold at'))
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

/** "a, b and c". */
const joined = (words: string[]): string => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

/**
 * What one provider sells at a place, over all their services (M10.29): the
 * goods once, then the hours when they are not the whole day, those most goods
 * share first and the others by name: "field rations, herbal tea, coffee and
 * hot meals here, 07-20; hot meals 07-09, 12-14, 18-20".
 */
export function sellsLine(content: Content, services: Service[]): string | undefined {
  const goodsOf = (s: Service) => Object.keys(s.sells).map((i) => itemName(content, i, 2).replace(/^2 /, ''))
  const all = [...new Set(services.flatMap(goodsOf))]
  if (!all.length) return undefined
  const hoursOf = new Map<string, string[]>()
  for (const s of services) for (const good of goodsOf(s)) hoursOf.set(good, [...new Set([...(hoursOf.get(good) ?? []), s.hours])])
  const groups = new Map<string, string[]>()
  for (const good of all) {
    const key = hoursOf.get(good)!.sort().join(', ')
    groups.set(key, [...(groups.get(key) ?? []), good])
  }
  const wholeDay = (key: string) => /^(00(:00)?-(24|00)(:00)?)$/.test(key)
  const [main, ...rest] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  const parts = [`${joined(all)} here${wholeDay(main![0]) ? '' : `, ${main![0]}`}`, ...rest.map(([key, goods]) => `${joined(goods)} ${wholeDay(key) ? 'all day' : key}`)]
  return parts.join('; ')
}
