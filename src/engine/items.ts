import type { Content } from './content'
import type { Counts } from './state'

// Inventories are plain counts; money is in duiten (1 stuiver = 8 duiten,
// 1 guilder = 20 stuivers).

export const DUIT = 1
export const STUIVER = 8
export const GUILDER = 160

export function add(counts: Counts, item: string, qty: number): void {
  const next = (counts[item] ?? 0) + qty
  if (next > 0) counts[item] = next
  else delete counts[item]
}

export function has(counts: Counts, item: string, qty = 1): boolean {
  return (counts[item] ?? 0) >= qty
}

export function hasAll(counts: Counts, needed: Counts, times = 1): boolean {
  return Object.entries(needed).every(([item, qty]) => has(counts, item, qty * times))
}

export function formatMoney(duiten: number): string {
  const guilders = Math.floor(duiten / GUILDER)
  const stuivers = Math.floor((duiten % GUILDER) / STUIVER)
  const rest = duiten % STUIVER
  const parts = [guilders && `${guilders} gl`, stuivers && `${stuivers} st`, rest && `${rest} d`].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : '0 d'
}

export function itemName(content: Content, item: string, qty = 1): string {
  const def = content.items.get(item)
  if (!def) return item
  if (qty === 1) return def.name
  return `${qty} ${def.plural ?? `${def.name}s`}`
}

export function listItems(content: Content, counts: Counts): string {
  const names = Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([item, qty]) => (qty === 1 ? withArticle(itemName(content, item)) : itemName(content, item, qty)))
  if (names.length === 0) return 'nothing'
  if (names.length === 1) return names[0]!
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export function withArticle(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`
}

/** Finds an item id from what a player typed: id, name, plural or alias. */
export function matchItem(content: Content, text: string, among?: Iterable<string>): string | undefined {
  const wanted = text.trim().toLowerCase().replace(/^(a|an|the|some)\s+/, '')
  if (!wanted) return undefined
  const ids = among ? [...among] : [...content.items.keys()]
  for (const id of ids) {
    const def = content.items.get(id)
    if (!def) continue
    const names = [id.replace(/_/g, ' '), def.name, def.plural ?? `${def.name}s`, ...def.aliases].map((n) => n.toLowerCase())
    if (names.includes(wanted)) return id
  }
  for (const id of ids) {
    const def = content.items.get(id)
    if (def && (def.name.toLowerCase().includes(wanted) || def.aliases.some((a) => a.toLowerCase().includes(wanted)))) return id
  }
  return undefined
}
