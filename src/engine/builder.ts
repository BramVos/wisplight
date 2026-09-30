import { unsolvable } from './quests/solvable'
import { callName, isNameTitle, type Content } from './content'
import { regionMap } from './map/region'
import { questWarnings } from './quests/check'
import { landIdOf } from './reach'
import { routineNow } from './npc/brain'
import { createInitialState } from './state'
import { World } from './world'

// The checks the editor shows beside the errors (FO, chapter 15, "Schema's en
// validatie"), and the region as the generator draws it. Edits themselves are
// in edit.ts; the editor's view in editor.ts.

/** Things that load but deserve a look (FO, chapter 15, "Schema's en validatie"). */
const SETTLED_KINDS = new Set(['village', 'town', 'city', 'hamlet', 'inn'])

/**
 * The first scene (M10.33 M, the Commons that emptied as the stranger came
 * in): who is at the start place and at the meeting places of the first
 * settlement (the start's own, or the first one its exits lead to) at the
 * start minute, by their day, and how long until the last of them leaves.
 */
export function startScene(content: Content): { place: string; people: string[]; leaves: number }[] {
  const world = new World(content, createInitialState(content, 1))
  const start = content.world.start.location
  // The first settlement: by the exits from the start, the nearest place in a village, town, hamlet or inn.
  const seen = new Set([start])
  const queue = [start]
  let area: string | undefined
  while (queue.length && !area) {
    const id = queue.shift()!
    const here = content.locations.get(id)
    if (here && SETTLED_KINDS.has(content.areas.get(here.area)?.kind ?? '')) area = here.area
    for (const exit of Object.values(here?.exits ?? {})) if (exit && !seen.has(exit.to)) (seen.add(exit.to), queue.push(exit.to))
  }
  const places = [start, ...[...content.locations.values()].filter((l) => l.id !== start && l.area === area && l.tags.includes('social')).map((l) => l.id)]
  const routines = [...content.npcs.keys()].filter((id) => !content.npcs.get(id)!.absent).map((id) => ({ id, r: routineNow(world, id) }))
  return places.map((place) => {
    const there = routines.filter((x) => x.r?.place === place)
    return { place, people: there.map((x) => x.id), leaves: there.length ? Math.max(...there.map((x) => x.r!.until)) - world.now : 0 }
  })
}

const COMPASS: Record<string, [number, number]> = { north: [0, -1], northeast: [1, -1], east: [1, 0], southeast: [1, 1], south: [0, 1], southwest: [-1, 1], west: [-1, 0], northwest: [-1, -1] }
const OUTSIDE_TAGS = ['outdoor', 'route', 'edge', 'wilderness']

/**
 * Ways that do not fit one plan (M10.33 L; the cause: the Quiet Reach's Arrival
 * Lock went northeast to the Workshop while the Commons, east of the lock,
 * went east to it, and no check caught that). The places joined by compass
 * ways are laid out by the first way found to each, as the plan does, across
 * areas; any other way whose direction is more than one wind off the layout
 * is named, with where the place lies by the others.
 */
export function directionProblems(content: Content): string[] {
  const at = new Map<string, [number, number]>()
  const out: string[] = []
  // Settlements only: a way across the land is as long as the land, and lies on the map, not on a plan.
  const settled = (id: string) => SETTLED_KINDS.has(content.areas.get(content.locations.get(id)?.area ?? '')?.kind ?? '')
  const wind = (dx: number, dy: number) => Object.entries(COMPASS).find(([, [x, y]]) => x === Math.sign(dx) && y === Math.sign(dy))?.[0]
  for (const first of [...content.locations.keys()].sort()) {
    if (at.has(first) || !settled(first)) continue
    at.set(first, [0, 0])
    const queue = [first]
    while (queue.length) {
      const id = queue.shift()!
      const [x, y] = at.get(id)!
      for (const [dir, exit] of Object.entries(content.locations.get(id)?.exits ?? {})) {
        const step = COMPASS[dir]
        if (!exit || !step || at.has(exit.to) || !content.locations.has(exit.to) || !settled(exit.to)) continue
        at.set(exit.to, [x + step[0], y + step[1]])
        queue.push(exit.to)
      }
    }
  }
  for (const l of [...content.locations.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [dir, exit] of Object.entries(l.exits)) {
      const step = COMPASS[dir]
      const from = at.get(l.id)
      const to = exit && at.get(exit.to)
      if (!step || !from || !to) continue
      const [dx, dy] = [to[0] - from[0], to[1] - from[1]]
      if (!dx && !dy) continue
      // More than one wind off: the angle between the way and where the place lies is over 45 degrees.
      const cos = (dx * step[0] + dy * step[1]) / (Math.hypot(dx, dy) * Math.hypot(step[0], step[1]))
      if (cos < Math.cos(Math.PI / 4) - 1e-9) out.push(`${l.name} ${dir} to ${content.locations.get(exit!.to)!.name}, which lies ${wind(dx, dy) ?? 'elsewhere'} of it by the other ways: the ways do not fit one plan`)
    }
  }
  // One settlement cut in two: two settled areas joined indoors by a short way.
  for (const l of content.locations.values()) {
    for (const exit of Object.values(l.exits)) {
      const other = exit && content.locations.get(exit.to)
      if (!exit || !other || other.area === l.area || l.id > other.id) continue
      const settled = [l.area, other.area].every((a) => SETTLED_KINDS.has(content.areas.get(a)?.kind ?? ''))
      const indoors = ![l, other].some((p) => p.tags.some((t) => OUTSIDE_TAGS.includes(t)))
      if (settled && indoors && exit.minutes < 10) out.push(`${content.areas.get(l.area)!.name} and ${content.areas.get(other.area)!.name}: one settlement in two areas (${l.name} and ${other.name}, ${exit.minutes} minutes indoors); an area is what you walk through indoors`)
    }
  }
  return [...new Set(out)]
}

export function warnings(content: Content): string[] {
  // A quest with a stage that has no way on, or no way to end (M10.30 (6)).
  const out: string[] = [...questWarnings(content), ...unsolvable(content)]
  // A world with people and no storyline (M10.30: The Quiet Reach had none, so every voice made the plot up as it talked).
  if (!content.quests.size && content.npcs.size) out.push('This world has no stories: people make the plot up as they talk, and nothing can be solved. The step Stories of the world build writes them.')
  // Ways that do not fit one plan, and one settlement in two areas (M10.33 L).
  out.push(...directionProblems(content))
  // The first scene (M10.33 M): someone at the start place and at its meeting place, for at least half an hour.
  if (content.npcs.size) {
    const at = `${String(content.world.start.hour).padStart(2, '0')}:${String(content.world.start.minute).padStart(2, '0')}`
    // The start itself may be lonely by design (a wreck, a quay at dusk): the scene needs people at one of its places.
    // A settlement without a meeting place (a place tagged social) gives nothing to judge but the start.
    const scenes = startScene(content)
    const names = scenes.map((s) => content.locations.get(s.place)?.name ?? s.place).join(' or ')
    if (scenes.length < 2) {
      // Nothing to judge: the first settlement has no meeting place.
    } else if (!scenes.some((s) => s.people.length)) out.push(`At the start (${at}) nobody is at ${names}: the first scene is empty. Move the start minute, or a day's schedule, so the people of the first scene are there.`)
    else if (!scenes.some((s) => s.people.length && s.leaves >= 30)) out.push(`At the start (${at}) everyone at ${names} leaves within half an hour: the start minute falls at the end of their block.`)
  }
  // Reachability over exits from the start, and from every edge on the region map (reached across country);
  // a line of transport (M10.23: the white boat to another land) takes the stranger from one of its stops to the others.
  const roots = [content.world.start.location, ...[...content.locations.values()].filter((l) => l.tags.includes('edge') && (l.pos ?? content.areas.get(l.area)?.pos)).map((l) => l.id)]
  const reached = new Set<string>(roots)
  const queue = [...roots]
  const reach = (to: string) => {
    if (reached.has(to) || !content.locations.has(to)) return
    reached.add(to)
    queue.push(to)
  }
  while (queue.length) {
    const id = queue.shift()!
    for (const exit of Object.values(content.locations.get(id)?.exits ?? {})) if (exit) reach(exit.to)
    for (const line of content.passages.values()) if (line.stops.includes(id)) line.stops.forEach(reach)
  }
  for (const location of content.locations.values()) {
    const onMap = location.pos ?? content.areas.get(location.area)?.pos
    if (!reached.has(location.id)) out.push(`${location.id}: cannot be reached from the start, by exits, lines or across country${onMap ? '' : ' (and it has no place on the map)'}`)
    const sentences = location.description.day.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length
    if (sentences < 3 || sentences > 5) out.push(`${location.id}: the day description has ${sentences} sentences; three to five read best`)
  }
  // Work whose text names someone who need not be there (M10.29: Tessa taught a lesson from across the station).
  for (const type of content.objectTypes.values()) {
    for (const a of type.affordances) {
      if (a.with || a.access === 'staff' || !a.actors.includes('player')) continue
      const words = [a.label, a.narrate_start ?? '', a.player_text ?? ''].join(' ')
      const named = [...content.npcs.values()].find((n) => new RegExp(`\\b(${[n.name, callName(n)].map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`).test(words))
      if (named) out.push(`${type.id} ${a.id}: the text names ${callName(named)}; set with: ${named.id} so they must be there, or access: staff`)
    }
  }
  // A name that starts with a title and says nobody what to call them (M10.29: Dr Ilyan Sorell was "Dr" everywhere).
  for (const npc of content.npcs.values()) {
    const first = npc.name.split(' ')[0] ?? ''
    if (!npc.call && isNameTitle(first)) out.push(`${npc.id}: the name starts with the title ${first}; set call to what people call ${npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'him' : 'them'} (now ${callName(npc)})`)
  }
  // A pulse watcher (M10.24) whose signal no aftermath plays: when it fires, nothing reaches the stranger.
  for (const w of content.watchers.values()) {
    if (w.probe && 'pulse' in w.probe && ![...content.aftermath.values()].some((a) => a.signal === w.signal)) out.push(`watcher ${w.id}: the pulse sets off ${w.signal}, and no aftermath plays it, so nothing reaches the stranger`)
  }
  // A land (M10.23) nobody can be in, or cross into: no area of it and no far place, or no border.
  for (const land of content.lands.values()) {
    const areas = [...content.areas.values()].filter((a) => a.land === land.id)
    const far = [...content.topics.values()].some((t) => t.kind === 'place' && t.land === land.id && !content.areas.has(t.id))
    if (!areas.length && !far) out.push(`land ${land.id}: no area and no far place is of it, so nobody can ever be there`)
    else if (areas.length && !areas.some((a) => a.border) && !far) out.push(`land ${land.id}: none of its areas is a border (border: true), so nobody can cross into it`)
  }
  for (const npc of content.npcs.values()) if (npc.public_facts.length === 0) out.push(`${npc.id}: no public facts, so nobody can tell anything about them`)
  for (const topic of content.topics.values()) if (!topic.origin && !topic.pos && !topic.everywhere && !topic.common && topic.kind !== 'person') out.push(`topic ${topic.id}: no origin, so nobody knows where it belongs`)
  // A people or a coin of the world that no topic tells of (M10.29 P: Mara is "a Nacrean woman", and the stranger could
  // not know what a Nacrean is): a topic for it, with common: true when everyone here knows it.
  const told = (word: string) => {
    const w = new RegExp(`\\b${word.toLowerCase().replace(/s$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    return [...content.topics.values()].some((t) => [t.name, ...t.aliases, t.summary].some((n) => w.test(n.toLowerCase())))
  }
  for (const a of content.rules?.ancestries ?? []) if (!told(a.name)) out.push(`ancestry ${a.id}: no topic tells what ${a.name} are; add one with common: true, so the stranger knows it from the start`)
  const coins = content.world.money?.units ?? []
  if (coins.length && !coins.some((c) => told(c.name))) out.push(`money: no topic tells of the ${coins.map((c) => c.plural ?? `${c.name}s`).join(', ')}; add one with common: true, so the stranger knows the money from the start`)
  // A far town with districts (M10.21) is reached by a road (it has a place on the map) or a line; without either they never come to be.
  for (const topic of content.topics.values()) {
    if (!topic.districts.length) continue
    const byLine = [...content.passages.values()].some((p) => p.stops.includes(topic.id))
    if (!topic.pos && !byLine) out.push(`topic ${topic.id}: its districts can never be reached: it has no place on the map (pos) and no line stops there`)
    const ids = topic.districts.map((d) => d.id)
    for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) out.push(`topic ${topic.id}: the district ${id} is named twice`)
  }
  // A great line nothing can push (M10.22) never comes.
  for (const tide of content.tides.values()) if (!tide.drivers.some((d) => d.weight > 0)) out.push(`tide ${tide.id}: nothing pushes it (every driver's weight is 0 or less), so it never comes`)
  // Two lands that know nothing of each other while a line of transport runs between them (M10.23).
  for (const r of content.world.reach ?? []) {
    if (r.reach !== 'none') continue
    const [a, b] = r.between
    const joined = [...content.passages.values()].some((p) => {
      const lands = new Set(p.stops.map((stop) => landIdOf(content, content.locations.get(stop)?.area)))
      return lands.has(a) && lands.has(b)
    })
    if (joined) out.push(`world.reach: ${a} and ${b} know nothing of each other (none), yet a line of transport runs between them`)
  }
  // Two at one table who are on the same side (M10.22): there is nothing to settle between them.
  for (const tide of content.tides.values()) {
    const [a, b] = tide.mediation?.between ?? []
    if (!a || !b) continue
    const sides = (id: string) => [...content.factions.values()].filter((f) => f.members.includes(id)).map((f) => f.id)
    const shared = sides(a).filter((f) => sides(b).includes(f))
    if (shared.length) out.push(`tide ${tide.id}: the two at the table are on the same side (both of ${shared.join(', ')}), so a mediation settles nothing`)
  }
  // What lies beyond the map (M10.21): an edge without a line says only that nobody has told the stranger.
  for (const region of content.regions.values()) {
    const said = new Set((region.beyond ?? []).map((b) => b.side))
    const silent = (['north', 'east', 'south', 'west'] as const).filter((side) => !said.has(side))
    if (silent.length) out.push(`region ${region.id}: the ${silent.join(', ')} edge${silent.length > 1 ? 's say' : ' says'} nothing of what lies beyond (beyond:), so a stranger there reads only that nobody has told them`)
  }
  out.push(...chainWarnings(content))
  return out
}

/** How one place's day description measures against the place rules (M10.20). */
export interface PlaceMeasure {
  id: string
  words: number
  sentences: number
  /** Topics in [brackets], day and night. */
  brackets: number
  /** Ways out, and whether the description names every one (by direction or by the place it leads to). */
  exits: number
  namesEvery: boolean
  /** The first three words, to find places that open alike. */
  opening: string
  /** Whether it opens with its own name ("The Commons is ..."), which the title above it already says. */
  opensWithName: boolean
}

/** Measures every place's description against the place rules: words, sentences, [brackets], the ways out it names. */
export function placeMeasures(content: Content): PlaceMeasure[] {
  return [...content.locations.values()].map((location) => {
    const day = location.description.day
    const text = `${day} ${location.description.night ?? ''}`.toLowerCase()
    // A secret way (M10.31) is one the description must not give away: it does not count.
    const exits = Object.entries(location.exits).filter(([, e]) => e && !e.hidden)
    const named = exits.filter(([dir, exit]) => {
      const to = content.locations.get(exit!.to)
      // In, out, up and down are everyday words ("in the air"): those ways count only by the place they lead to.
      const byWord = ['in', 'out', 'up', 'down'].includes(dir) ? [] : [dir]
      const words = [...byWord, ...(to ? [to.name, ...to.aliases] : [])].map((w) => w.toLowerCase().replace(/^the /, '')).filter((w) => w.length > 2)
      return words.some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(day.toLowerCase()))
    })
    return {
      id: location.id,
      words: day.split(/\s+/).filter(Boolean).length,
      sentences: day.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length,
      brackets: (text.match(/\[[^\]]+\]/g) ?? []).length,
      exits: exits.length,
      namesEvery: exits.length >= 3 && named.length === exits.length,
      opening: day.trim().toLowerCase().split(/\s+/).slice(0, 3).join(' '),
      opensWithName: day.trim().toLowerCase().replace(/^the /, '').startsWith(location.name.toLowerCase().replace(/^the /, '')),
    }
  })
}

/**
 * The descriptions of a world against the place rules of CLAUDE.md, for the
 * Check (M10.20; the first real build, The Quiet Reach, averaged 88 words
 * where the Nethermarch has 56, named no topic in [brackets], listed every way
 * out, and opened each place alike): a summary to compare worlds by, and the
 * places worth a look. Advice, not an error: a world loads either way.
 */
export function descriptionCheck(content: Content, only?: ReadonlySet<string>): { summary: string; places: string[] } {
  const most = 70
  const all = placeMeasures(content)
  // A proposal's own places, measured against the whole world for places that open alike.
  const measures = only ? all.filter((m) => only.has(m.id)) : all
  if (!measures.length) return { summary: 'No places yet.', places: [] }
  const openings = new Map<string, string[]>()
  for (const m of all) openings.set(m.opening, [...(openings.get(m.opening) ?? []), m.id])
  const alike = (m: PlaceMeasure) => (openings.get(m.opening) ?? []).filter((id) => id !== m.id)
  const average = Math.round(measures.reduce((sum, m) => sum + m.words, 0) / measures.length)
  const over = measures.filter((m) => m.words > most).length
  const bracketed = measures.filter((m) => m.brackets > 0).length
  const listing = measures.filter((m) => m.namesEvery).length
  const opensAlike = measures.filter((m) => alike(m).length).length
  const named = measures.filter((m) => m.opensWithName).length
  const summary = `${measures.length} places: ${average} words on average (at most ${most} reads best; ${over} over), ${bracketed} with a topic in [brackets], ${listing} naming every way out of three or more, ${opensAlike} opening like another, ${named} opening with their own name.`
  const places = measures.flatMap((m) => {
    const notes = [
      m.words > most ? `${m.words} words` : '',
      m.namesEvery ? `names all ${m.exits} ways out` : '',
      alike(m).length ? `opens like ${alike(m).join(', ')} ("${m.opening} ...")` : '',
      m.opensWithName ? 'opens with its own name' : '',
    ].filter(Boolean)
    return notes.length ? [`${m.id}: ${notes.join('; ')}`] : []
  })
  return { summary, places }
}

/**
 * Things a description brings in ("a bowl of milk", "a hollow") that nothing
 * here answers to (after the M10 playtest): no detail, object, thing lying
 * here, person or way out by that word. LOOK still finds the sentence; a
 * detail gives it its own look, and lines for TAKE and other verbs.
 */
export function sceneryWarnings(content: Content): string[] {
  const out: string[] = []
  for (const location of content.locations.values()) {
    const known = [
      location.name,
      ...location.aliases,
      ...location.details.flatMap((d) => d.words),
      ...location.objects.flatMap((o) => {
        const type = content.objectTypes.get(o.type)
        return [o.name ?? '', type?.name ?? '', ...(type?.aliases ?? []), ...(type?.details.flatMap((d) => d.words) ?? [])]
      }),
      ...Object.keys(location.items).map((i) => content.items.get(i)?.name ?? i),
      ...Object.values(location.exits).flatMap((e) => (e ? [content.locations.get(e.to)?.name ?? '', ...(content.locations.get(e.to)?.aliases ?? [])] : [])),
      // Whoever lives or works here answers to their name, and to "the woman" or "the man" the description calls them.
      ...[...content.npcs.values()].filter((n) => n.home === location.id || n.work === location.id).flatMap((n) => [n.name, n.short, n.pronoun === 'she' ? 'woman girl' : n.pronoun === 'he' ? 'man boy' : 'person']),
    ]
      .join(' ')
      .toLowerCase()
    // What changes with the state of the place (the cat on the doorstep, taken in) is left to the description: LOOK reads it as it is now.
    const steady = (noun: string) => location.variants.every((v) => new RegExp(`\\b${noun}`).test(v.day.toLowerCase()))
    const missing = [...new Set(introduced(location.description.day))].filter((noun) => steady(noun) && !new RegExp(`\\b${noun}`).test(known))
    if (missing.length) out.push(`${location.id}: the description brings in ${missing.map((m) => `"${m}"`).join(', ')}, with no detail to look at or handle (details:)`)
  }
  return out
}

/**
 * The things a text brings in with "a" or "an": the noun of each, as best a
 * rule can tell. A likeness is not a thing here ("like a hen on her nest",
 * "taller than a man"); an adjective before a comma goes on to its noun ("a
 * tidy, narrow house").
 */
export function introduced(text: string): string[] {
  const nouns: string[] = []
  const plain = text.replace(/[[\]]/g, '').toLowerCase()
  const re = /\b(a|an)\s+([a-z' -]+?)(?=[,.;:!?]|$)/g
  for (const match of plain.matchAll(re)) {
    const before = plain.slice(0, match.index).trim().split(/\s+/).at(-1) ?? ''
    if (LIKENESS.has(before)) continue
    let phrase = match[2]!
    // "a tidy, narrow house": the words after the comma, unless they start a thing of their own.
    const rest = plain.slice(match.index + match[0].length)
    const next = /^,\s*([a-z' -]+?)(?=[,.;:!?]|$)/.exec(rest)
    if (next && !phrase.includes(' ') && !/^(a|an|the|and|or|but|its|his|her|their|one|two|some)\b/.test(next[1]!)) phrase = next[1]!
    const words = phrase.split(/\s+/).filter(Boolean)
    const kept: string[] = []
    for (const [i, w] of words.entries()) {
      // "an oak older than anyone's grandfather": the oak, not "older".
      if (words[i + 1] === 'than') break
      const verbish = /(ed|ing|s)$/.test(w) && !/ss$/.test(w) && !THING_WORDS.has(w)
      if (PHRASE_END.has(w) || (i > 0 && verbish && kept.length > 0)) break
      kept.push(w)
      if (kept.length === 3) break
    }
    const noun = kept.at(-1)
    if (noun && noun.length > 2 && !NOT_NOUNS.has(noun)) nouns.push(noun)
  }
  return nouns
}

/** Words before "a" that make it a likeness, not a thing that is here. */
const LIKENESS = new Set(['like', 'as', 'than', 'without', 'such'])
/** Things that end like a verb: a building, a shed, a landing. */
const THING_WORDS = new Set(['building', 'ceiling', 'landing', 'railing', 'clearing', 'wing', 'string', 'spring', 'ring', 'thing', 'swing', 'sling', 'king', 'bed', 'shed', 'reed', 'weed', 'seed', 'sled', 'steed'])
const PHRASE_END = new Set(['of', 'with', 'on', 'in', 'at', 'by', 'from', 'that', 'which', 'and', 'or', 'but', 'to', 'into', 'onto', 'under', 'over', 'above', 'below', 'behind', 'beside', 'between', 'among', 'where', 'as', 'no', 'not', 'is', 'are', 'was', 'were', 'you', 'for', 'than', 'like', 'full', 'half', 'so', 'too', 'very', 'just', 'still', 'here', 'there', 'up', 'down', 'out', 'off', 'near', 'against', 'round', 'around', 'through', 'along', 'across'])
const NOT_NOUNS = new Set(['few', 'little', 'lot', 'bit', 'while', 'moment', 'time', 'way', 'kind', 'sort', 'long', 'great', 'good', 'hundred', 'thousand', 'dozen', 'pair', 'row', 'handful', 'couple', 'piece', 'smell', 'sound', 'feeling', 'glimpse', 'hint', 'whiff', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'misstep', 'hurry', 'pause', 'day', 'night', 'moment', 'hiss', 'dim', 'small', 'tidy', 'handsome', 'rotten', 'hung', 'should', 'underfoot', 'upside', 'whole'])

/**
 * Chains that do not close (M8.4): a good that is used (by the nameless of a
 * settlement, a workshop, an object people use, or its repair) but made nowhere and
 * brought by no route. A fixed supply at a counter does not count: it comes
 * from nowhere. And a settlement without a ledger keeps its fixed supply.
 */
export function chainWarnings(content: Content): string[] {
  const out: string[] = []
  const made = new Set<string>()
  for (const s of content.settlements.values()) for (const w of s.workshops) for (const g of Object.keys(w.makes)) made.add(g)
  for (const t of content.objectTypes.values()) for (const a of t.affordances) for (const g of Object.keys(a.produces)) made.add(g)
  for (const r of content.routes.values()) if (content.outlands.has(r.from)) for (const g of Object.keys(r.carries)) made.add(g)
  const used = new Map<string, string>()
  const note = (g: string, by: string) => used.has(g) || used.set(g, by)
  for (const s of content.settlements.values()) {
    for (const g of Object.keys(s.use)) note(g, `the people of ${s.id}`)
    for (const w of s.workshops) for (const g of Object.keys(w.uses)) note(g, `${w.name} in ${s.id}`)
  }
  for (const t of content.objectTypes.values()) {
    // What only the player does (an offering at a stone) is no chain of the economy.
    for (const a of t.affordances.filter((x) => x.actors.includes('npc'))) for (const g of Object.keys(a.consumes)) note(g, `${t.id} (${a.id})`)
    for (const g of Object.keys(t.repair?.consumes ?? {})) note(g, `mending a ${t.id}`)
  }
  for (const [g, by] of [...used.entries()].sort((a, b) => a[0].localeCompare(b[0]))) if (!made.has(g)) out.push(`${g}: used by ${by}, but made nowhere and brought by no route`)
  const kinds = new Set(['village', 'town', 'city', 'hamlet', 'inn'])
  for (const a of content.areas.values()) if (kinds.has(a.kind) && !content.settlements.has(a.id)) out.push(`${a.id}: a settlement without a ledger, so its counters keep their fixed supply`)
  return out
}

/** The region as the generator makes it from the zone drawing, every second row, with the places of the content on it. */
export function regionPreview(content: Content, id?: string): string | undefined {
  const region = id ? content.regions.get(id) : [...content.regions.values()][0]
  const map = region && regionMap(content, region.id)
  if (!region || !map) return undefined
  const terrain: Record<string, string> = { fen: '"', water: '~', woods: 'T', heath: '^', fields: '.' }
  const rows: string[] = []
  for (let row = map.rows - 1; row >= 0; row -= 2) {
    let line = ''
    for (let col = 0; col < map.cols; col++) {
      const cell = map.cell({ col, row })!
      const place = map.placeOn(cell)
      line += place ? (content.areas.get(place)?.name.replace(/^the /i, '')[0] ?? '*').toUpperCase() : cell.way ? (cell.way.kind === 'canal' ? '=' : cell.way.kind === 'road' ? ':' : ',') : cell.hidden ? 'r' : (terrain[cell.land] ?? '.')
    }
    rows.push(line)
  }
  return rows.join('\n')
}
