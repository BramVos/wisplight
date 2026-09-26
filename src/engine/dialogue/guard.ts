import { TIER_WORDS, type Tier } from './acts'

// Guardrails around the model (FO, chapter 10): what goes in, and what may
// come out.

const INJECTION = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompt|previous|above|system)\b/i,
  /\bsystem\s*prompt\b/i,
  /\b(you are|you're|act as|pretend to be|roleplay as)\b.{0,20}\b(an? )?(ai|a\.i\.|language model|chatbot|assistant|gpt|claude|llm)\b/i,
  /\b(jailbreak|developer mode|dan mode|prompt injection)\b/i,
  /\b(as an ai|as a language model)\b/i,
  /<\/?(system|assistant|user|instructions?)>/i,
  /^\s*(system|assistant)\s*:/i,
  /```/,
  /\{\{|\}\}/,
  /\b(negeer|vergeet)\b.{0,40}\b(instructies?|regels|prompt)\b/i,
  /\bsysteemprompt\b/i,
  /\bje bent (een )?(ai|taalmodel|chatbot)\b/i,
]

const META = /\b(openai|anthropic|chatgpt|claude|gpt-?\d|language model|artificial intelligence|this game|the game|npc|video ?game)\b/i

export function looksLikeInjection(text: string): boolean {
  return INJECTION.some((pattern) => pattern.test(text)) || META.test(text)
}

const ANACHRONISM = /\b(okay|ok|internet|online|website|e-?mail|phone|smartphone|computer|laptop|robot|television|tv|electricity|plastic|photograph|percent|awesome|cool|dude|hashtag|app)\b|\bAI\b|%/i

export function hasAnachronism(text: string): boolean {
  return ANACHRONISM.test(text)
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Cuts a reply that runs too long at the last full sentence within the limit. */
export function fitLength(text: string, tier: Tier): string {
  const limit = TIER_WORDS[tier]
  const clean = text.replace(/\s+/g, ' ').trim()
  if (wordCount(clean) <= Math.round(limit * 1.2)) return clean
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]?\s*/g) ?? [clean]
  let result = ''
  for (const sentence of sentences) {
    if (wordCount(result + sentence) > limit) break
    result += sentence
  }
  if (!result) result = `${clean.split(/\s+/).slice(0, limit).join(' ').replace(/[,;:]$/, '')}.`
  return result.trim()
}

/** Names in a reply that the speaker has no business knowing. */
export function leakedNames(text: string, names: { id: string; name: string }[], allowed: Set<string>): string[] {
  const leaks: string[] = []
  for (const { id, name } of names) {
    if (allowed.has(id)) continue
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'u').test(text)) leaks.push(name)
  }
  return [...new Set(leaks)]
}
