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

// A reply that steps out of the world (M9.3): it speaks as a model, of prompts
// and rules, or comes dressed in markup or emoji. The trial counts it as a
// break of character; the game asks for the reply again.
const OUT_OF_CHARACTER = /\b(as an ai|an ai model|language model|openai|anthropic|chatgpt|system prompt|my instructions|role-?play(?:ing)?|non-player|npc|video ?game)\b|\*\*|^#{1,6}\s|```|\p{Extended_Pictographic}/imu

export function outOfCharacter(text: string): boolean {
  return OUT_OF_CHARACTER.test(text)
}

// A promise of something done (M10.3): taking, showing, fetching, waiting, meeting, giving, carrying word.
// "I'll tell you" is talk, not a deed; "I'll tell my father" is.
const PROMISE = /\b(?:i'?ll|i will|i can|let me|i'?m going to|i shall)\s+(?:\w+\s+)?(?:take|show|lead|bring|fetch|walk|wait|meet|give|carry|come with|go with|tell (?:him|her|them|my|your|\p{Lu}))|\bfollow me\b|\bcome with me\b/iu

/** Whether a reply promises to do something for the player. */
export function promises(text: string): boolean {
  return PROMISE.test(text)
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

// Words a reply may capitalise in the middle of a sentence without naming anything.
const COMMON_CAPITALS = new Set(['i', "i'm", "i'll", "i've", "i'd", 'god', 'lord', 'heaven', 'hell', 'sir', 'madam', 'master', 'mistress'])

const WORDS = /[\p{L}'’]+/gu

/** Every word in the given texts and data, lower-cased: the vocabulary of the world. */
export function vocabularyOf(...sources: unknown[]): Set<string> {
  const words = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const [word] of value.matchAll(WORDS)) words.add(normalise(word))
    } else if (value instanceof Map) {
      for (const item of value.values()) visit(item)
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item)
    }
  }
  for (const source of sources) visit(source)
  return words
}

function normalise(word: string): string {
  return word
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/'s$/, '')
    .replace(/^'+|'+$/g, '')
}

/**
 * Capitalised words in the middle of a sentence that the world does not know,
 * such as a priest the model made up. Words at the start of a sentence or of
 * speech are skipped; so are words the player used.
 */
export function unknownNames(text: string, vocabulary: Set<string>, playerWords: Set<string> = new Set()): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/\p{Lu}[\p{L}'’]*/gu)) {
    const index = match.index ?? 0
    if (index > 0 && /[\p{L}'’]/u.test(text[index - 1]!)) continue
    const before = text.slice(0, index).trimEnd()
    if (before === '' || /[.!?"“:;(]$/.test(before)) continue
    const word = normalise(match[0])
    if (word.length < 2 || COMMON_CAPITALS.has(word) || vocabulary.has(word) || playerWords.has(word)) continue
    found.push(match[0].replace(/['’]s$/, ''))
  }
  return [...new Set(found)]
}
