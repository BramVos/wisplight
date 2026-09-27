// Questions a model may ask before it decides (M9.3): how they are written
// and read. The answers, with their bounds, are the engine's (engine/lookups.ts).

export type LookupQuery = { fn: 'knows'; who: string; topic: string } | { fn: 'why'; line: string } | { fn: 'bond'; a: string; b: string } | { fn: 'near'; place: string }

/** "knows p2 t1", "why s1", "bond p1 p2", "near l3", with keys turned into ids. Undefined when it is no question. */
export function parseLookup(text: string, id: (key: string) => string | undefined): LookupQuery | undefined {
  const m = /^\s*(knows|why|bond|near)\s+(\S+)(?:\s+(\S+))?\s*$/i.exec(text)
  if (!m) return undefined
  const fn = m[1]!.toLowerCase()
  const x = id(m[2]!)
  const y = m[3] ? id(m[3]) : undefined
  if (!x) return undefined
  if (fn === 'knows' && y) return { fn, who: x, topic: y }
  if (fn === 'why') return { fn, line: x }
  if (fn === 'bond' && y) return { fn, a: x, b: y }
  if (fn === 'near') return { fn, place: x }
  return undefined
}

/** A question as an id of its own, so an answer can be a card with a key. */
export function lookupId(q: LookupQuery): string {
  return q.fn === 'knows' ? `knows:${q.who}:${q.topic}` : q.fn === 'why' ? `why:${q.line}` : q.fn === 'bond' ? `bond:${q.a}:${q.b}` : `near:${q.place}`
}

export function lookupFromId(id: string): LookupQuery | undefined {
  const [fn, x, y] = id.split(':')
  if (fn === 'knows' && x && y) return { fn, who: x, topic: y }
  if (fn === 'why' && x) return { fn, line: x }
  if (fn === 'bond' && x && y) return { fn, a: x, b: y }
  if (fn === 'near' && x) return { fn, place: x }
  return undefined
}

