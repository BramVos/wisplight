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
  const kinds = new Set(['village', 'town', 'hamlet', 'inn'])
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
