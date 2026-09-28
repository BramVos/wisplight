import type { Content } from './content'
import { regionMap } from './map/region'
import { questWarnings } from './quests/check'

// The checks the editor shows beside the errors (FO, chapter 15, "Schema's en
// validatie"), and the region as the generator draws it. Edits themselves are
// in edit.ts; the editor's view in editor.ts.

/** Things that load but deserve a look (FO, chapter 15, "Schema's en validatie"). */
export function warnings(content: Content): string[] {
  const out: string[] = [...questWarnings(content)]
  // Reachability over exits from the start, and from every edge on the region map (reached across country).
  const roots = [content.world.start.location, ...[...content.locations.values()].filter((l) => l.tags.includes('edge') && (l.pos ?? content.areas.get(l.area)?.pos)).map((l) => l.id)]
  const reached = new Set<string>(roots)
  const queue = [...roots]
  while (queue.length) {
    const id = queue.shift()!
    for (const exit of Object.values(content.locations.get(id)?.exits ?? {})) {
      if (exit && !reached.has(exit.to)) {
        reached.add(exit.to)
        queue.push(exit.to)
      }
    }
  }
  for (const location of content.locations.values()) {
    const onMap = location.pos ?? content.areas.get(location.area)?.pos
    if (!reached.has(location.id)) out.push(`${location.id}: cannot be reached from the start, by exits or across country${onMap ? '' : ' (and it has no place on the map)'}`)
    const sentences = location.description.day.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length
    if (sentences < 3 || sentences > 5) out.push(`${location.id}: the day description has ${sentences} sentences; three to five read best`)
  }
  for (const npc of content.npcs.values()) if (npc.public_facts.length === 0) out.push(`${npc.id}: no public facts, so nobody can tell anything about them`)
  for (const topic of content.topics.values()) if (!topic.origin && !topic.pos && !topic.everywhere && topic.kind !== 'person') out.push(`topic ${topic.id}: no origin, so nobody knows where it belongs`)
  out.push(...chainWarnings(content))
  return out
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
