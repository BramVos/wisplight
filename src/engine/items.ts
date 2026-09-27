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

/** A world's coins, largest first (M8); the Nethermarch's by default. */
export interface MoneyUnit {
  short: string
  name: string
  plural?: string
  value: number
}
export const DEFAULT_MONEY: readonly MoneyUnit[] = [
  { short: 'gl', name: 'guilder', value: GUILDER },
  { short: 'st', name: 'stuiver', value: STUIVER },
  { short: 'd', name: 'duit', plural: 'duiten', value: DUIT },
]

export function formatMoney(duiten: number, units: readonly MoneyUnit[] = DEFAULT_MONEY): string {
  let rest = duiten
  const parts: string[] = []
  for (const unit of units) {
    const n = Math.floor(rest / unit.value)
    rest -= n * unit.value
    if (n) parts.push(`${n} ${unit.short}`)
  }
  return parts.length > 0 ? parts.join(' ') : `0 ${units.at(-1)!.short}`
}

/** "2 stuivers", "10 duiten", "1 guilder", "3 st" to the smallest coin; a bare number counts in the second coin. */
export function parseMoney(text: string, units: readonly MoneyUnit[] = DEFAULT_MONEY): number | undefined {
  const names = units.flatMap((u) => [u.short, u.name, u.plural ?? `${u.name}s`, ...(u === DEFAULT_MONEY[0] ? ['gulden'] : [])])
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(\\d+)\\s*(${names.sort((a, b) => b.length - a.length).map(escape).join('|')})?(?![a-z])`, 'i')
  const match = text.match(pattern)
  if (!match) return undefined
  const amount = Number(match[1])
  const word = match[2]?.toLowerCase()
  const unit = word ? units.find((u) => [u.short, u.name, u.plural ?? `${u.name}s`].some((n) => n.toLowerCase() === word)) ?? units[0]! : (units[1] ?? units[0]!)
  return amount * unit.value
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

/**
 * The remedy of a world (M8.2): the item that cures this condition, or else
 * the first that heals. The Nethermarch's is herbs; the code knows no herbs.
 */
export function remedyItem(content: Pick<Content, 'items'>, cures?: string): string | undefined {
  const remedies = [...content.items.values()].filter((i) => i.remedy).sort((a, b) => a.id.localeCompare(b.id))
  return (cures ? remedies.find((i) => i.remedy!.cures.includes(cures)) : undefined)?.id ?? remedies.find((i) => i.remedy!.heal)?.id ?? remedies[0]?.id
}
