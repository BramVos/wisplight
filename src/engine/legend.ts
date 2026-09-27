import { callName, type Content } from './content'
import type { LlmRequest } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import type { GameState, LoreEntry } from './state'

// Years later, as legend (M9.1; design: lore and world change, "Lore
// meenemen naar een ander spel", the second variant). A new game in the same
// world carries the lore of an old one as old stories: rewritten as tales of
// "the stranger", without the names of anyone who lives in the new game, so
// nothing clashes with the world. The chronicler rewrites them when a model
// is there; the engine checks every name, and without a model (or when a
// name slips through) a template does it: people become what they were.

/** The names that may not be in a legend: everyone who lives in the new game, by full and by first name. */
export function livingNames(content: Content): Map<string, string> {
  const names = new Map<string, string>()
  // A name is a person's own: capitalised, not "the Haakman" (a spirit is legend already).
  const own = (name: string | undefined): name is string => Boolean(name && /^[A-Z][\p{L}'-]+/u.test(name) && !/^(The|A|An)\b/.test(name))
  for (const n of [...content.npcs.values()].filter((n) => !n.quirks.includes('spirit')).sort((a, b) => b.name.length - a.name.length)) {
    const role = n.child ? 'a child' : `the ${content.professions.get(n.profession)?.name ?? n.profession}`
    if (own(n.name)) names.set(n.name, role)
    if (own(n.short) && n.short !== n.name) names.set(n.short, role)
    const first = callName(n)
    if (own(first) && first.length > 2 && !names.has(first)) names.set(first, role)
  }
  return names
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A text without the names: each becomes the role of whom it named; the old character becomes the stranger. */
export function scrub(text: string, names: Map<string, string>, stranger?: string): string {
  let out = text
  if (stranger) out = out.replace(new RegExp(`\\b${escape(stranger)}\\b`, 'g'), 'the stranger')
  for (const [name, role] of names) out = out.replace(new RegExp(`\\b${escape(name)}\\b`, 'g'), role)
  // "the the miller", and a capital at the start of a sentence.
  return out.replace(/\bthe (the|a) /gi, '$1 ').replace(/(^|[.!?]\s+)(the|a) /g, (_, lead: string, word: string) => `${lead}${word.charAt(0).toUpperCase()}${word.slice(1)} `)
}

/** Whether a text still names someone who lives. */
export function namesTheLiving(text: string, names: Map<string, string>): string | undefined {
  for (const name of names.keys()) if (new RegExp(`\\b${escape(name)}\\b`).test(text)) return name
  return undefined
}

/** The legends of an old game, by the template: its lore as old stories, told without names. */
export function legendsOf(content: Content, old: GameState): LoreEntry[] {
  const names = livingNames(content)
  const stranger = old.player.character?.name
  const s = (text: string) => scrub(text, names, stranger)
  return (old.chronicle?.lore ?? [])
    .filter((l) => content.locations.has(l.place))
    .map((l, i) => ({
      id: `chr_legend_${i + 1}`,
      name: s(l.name),
      summary: `Years ago, they say: ${lower(s(l.summary))}`,
      details: s(l.details),
      story: s(l.story),
      far: s(l.far),
      fame: Math.min(5, Math.max(1, l.fame)),
      place: l.place,
      line: '',
      facts: [],
      links: l.links.filter((id) => content.topics.has(id) || content.locations.has(id)),
      t: 0,
      by: 'legend' as const,
    }))
}

const lower = (text: string) => (/^[A-Z][a-z]/.test(text) && !/^(I|The Count|Mother|Vrouw)\b/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text)

/** The request for the chronicler: the old lore, to be told again as legend. */
export function legendRequest(content: Content, legends: LoreEntry[]): LlmRequest {
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  return {
    role: 'chronicler',
    system: [
      worldFrame(content),
      '',
      'Years have passed. You retell the stories of a game long ago as legends people tell now: of "the stranger" who came, of what happened, as a tale that has been told many times.',
      'Never use the name of a person: speak of "the miller", "a girl from the fen", "the stranger". Place names may stay. Keep what happened; let it grow a little in the telling. Each story: name (a few words), summary (one or two sentences), details (two sentences), story (three to five sentences, as a villager tells it), far (one sentence, as it sounds far away). JSON only.',
    ].join('\n'),
    prompt: legends.map((l) => `${l.id}: ${l.name}. ${l.summary} ${l.details} ${l.story}`).join('\n'),
    schemaName: 'legends',
    schema: object({ legends: { type: 'array', items: object({ id: text, name: text, summary: text, details: text, story: text, far: text }) } }),
    maxTokens: 2000,
    meta: { legends: legends.map((l) => l.id) },
  }
}

/** The chronicler's legends where they pass: no living name, all fields there; the template's where not. */
export function applyLegendWords(content: Content, legends: LoreEntry[], reply: string | null): LoreEntry[] {
  if (!reply) return legends
  let written: { id: string; name: string; summary: string; details: string; story: string; far: string }[] = []
  try {
    written = (JSON.parse(reply) as { legends?: typeof written }).legends ?? []
  } catch {
    return legends
  }
  const names = livingNames(content)
  return legends.map((l) => {
    const w = written.find((x) => x.id === l.id)
    if (!w || ![w.name, w.summary, w.details, w.story, w.far].every((t) => typeof t === 'string' && t.trim() && t.length < 1200)) return l
    if (namesTheLiving([w.name, w.summary, w.details, w.story, w.far].join(' '), names)) return l
    return { ...l, name: w.name.trim(), summary: w.summary.trim(), details: w.details.trim(), story: w.story.trim(), far: w.far.trim() }
  })
}
