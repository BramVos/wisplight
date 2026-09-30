
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
// and rules, or comes dressed in markup, emoji, a link or HTML (M10.19). The trial counts it as a
// break of character; the game asks for the reply again.
const OUT_OF_CHARACTER = /\b(as an ai|an ai model|language model|openai|anthropic|chatgpt|system prompt|my instructions|role-?play(?:ing)?|non-player|npc|video ?game)\b|\*\*|^#{1,6}\s|```|\p{Extended_Pictographic}|https?:\/\/|\bwww\.|\]\(|<\/?[a-z][a-z0-9]*[\s>]/imu

export function outOfCharacter(text: string): boolean {
  return OUT_OF_CHARACTER.test(text)
}

// A promise of something done (M10.3): taking, showing, fetching, waiting, meeting, giving, carrying word.
// "I'll tell you" is talk, not a deed; "I'll tell my father" is. Since M10.29 (Bram's playtest) also a time the
// speaker keeps ("I'll be done at", "see you at"), pointing the way ("I'll point you right", "come on", "this way"),
// and a deed told as done now ("hands you", "gives you", "here, take it", and M10.29 V a thing handed across in words: "slides his
// notebook across", "holds out a ration bar", never a hand held out): words are never deeds.
const PROMISE =
  /\b(?:i'?ll|i will|i can|let me|i'?m going to|i shall)\s+(?:\w+\s+)?(?:take|show|lead|bring|fetch|walk|wait|meet|give|carry|point|see you (?:to|there|at|in)|be (?:done|there|free|back|finished) (?:at|by|in|around)|come (?:with|by|back|for you|and find)|go with|tell (?:him|her|them|my|your))|\bfollow me\b|\bcome with me\b|\bcome on\b|\bthis way\b|\bsee you (?:at|in|there|by|tonight|tomorrow)\b|\b(?:hands?|gives?|passes?|slides?|holds? out|pushes|presses)\s+(?:you|the stranger)\b|\bhere,? take (?:it|this|these)\b|\b(?:hands?|gives?|passes?|slides?|pushes|presses|tosses|offers)\s+(?:(?:his|her|their|my|a|an|the|this|that|its|one|some)\s+)?(?:[\w'-]+\s+){0,2}?[\w'-]+\s+(?:across|over|to you|towards? you|into your hands?)\b|\bholds? out (?:a|an|the|his|her|their|one)\s+(?!hands?\b)[\w'-]+/iu
// "I'll tell Harmen": a name, capitalised. Apart, because with the i flag \p{Lu} takes any letter, and "I'll tell you"
// was a promise (found in M10.29).
const TELL_NAME = /\b(?:I'?ll|I will|I can|[Ll]et me|I'?m going to|I shall)\s+(?:\w+\s+)?tell \p{Lu}/u

// A task or a meeting set for the stranger (M10.33 V: Ilyan's "Meet me at the Peregrine Hangar in ten minutes, bring
// what you need for the ridge", which nothing in the game asked). A meeting is only ever an offer of the game; a task
// only what the speaker's story or request gives.
const MEETING = /\b(?:meet me|find me (?:at|in|by)|come (?:and )?(?:find|see) me|see you (?:at|in|there|tonight|tomorrow))\b/i
const TASK = /\b(?:bring (?:me|it|them|back|what|the)|i need you to|i want you to|you(?:'ll| will)? (?:need|have|must) to|go (?:and|to) (?:the|find|fetch|get|see|ask)|fetch (?:me|the)|report (?:back )?to me)\b/i

/** What a reply sets the stranger (M10.33 V): a meeting, a task, or nothing. */
export function setsTask(text: string): 'meeting' | 'task' | undefined {
  const said = (text.match(/"[^"]*"?/g) ?? [text]).join(' ')
  return MEETING.test(said) ? 'meeting' : TASK.test(said) ? 'task' : undefined
}

/** Whether a reply promises to do something for the player. */
export function promises(text: string): boolean {
  return PROMISE.test(text) || TELL_NAME.test(text)
}

/**
 * Whether a reply says nothing aloud (M10.29, Bram's playtest: "Sana smiles warmly." and the question unanswered): no
 * words between quotes, and only an action of the speaker's own ("Sana smiles", "She nods"). Words without their
 * quotes are still speech.
 */
export function saysNothing(text: string, speaker: string[], pronoun?: string): boolean {
  // An opening quote before a word is speech, also when a long reply was cut before its closing quote.
  if (/["“]\s*\p{L}/u.test(text)) return false
  // Only the speaker doing something: their name or their own pronoun, then a verb ("She nods."). Someone else's pronoun
  // or a contraction is words ("He'll be in the hangar by now", M10.29 Q: six of Mara's answers were thrown away).
  const own = [...speaker, ...(pronoun ? [pronoun.charAt(0).toUpperCase() + pronoun.slice(1)] : [])].filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const acting = new RegExp(`^\\s*(?:${own.join('|')})\\s+(\\p{Ll}+)`, 'u').exec(text)
  // What they say, told: "Mara says he is on the ship" is speech too.
  return Boolean(acting) && !/^(?:says|said|tells|told|answers|answered|replies|replied|explains|explained|mutters|muttered|adds|added|asks|asked|whispers|whispered|admits|admitted|calls|called)$/.test(acting![1]!)
}

/**
 * Whether a reply is voiced as someone else (M10.28): the area block holds a
 * card for everyone of these parts, and the action before the first words
 * has another of them doing it ("Harmen scowls."). Who it was, or undefined.
 * A name asked back ("Harmen? No.") is not an action.
 */
export function speaksAsOther(text: string, speaker: string[], others: string[]): string | undefined {
  // Without quotes the reply is all words (Haiku often answers so): "Brannoc the boatman and his boy live by the slip"
  // is Maren speaking, never Brannoc acting (the measure on Skerrow, 29 September 2026).
  const open = text.search(/["“]/)
  if (open < 0) return undefined
  const lead = text.slice(0, open).trim()
  if (!lead || speaker.some((n) => n && lead.startsWith(n))) return undefined
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...others].sort((a, b) => b.length - a.length).find((n) => n && new RegExp(`^${escape(n)}\\s+\\p{Ll}`, 'u').test(lead))
}

/**
 * Whether a reply recites a story it was given (M10.28, the read score: four
 * people told the Haakman almost word for word): most of the reply, more
 * than `share`, in runs of eight words or more as the story has them, and
 * not also as a fact of it (a fact may be said as given). A striking line
 * kept inside a telling of one's own is no recital (measured on Haiku, 29
 * September 2026: "grey as a heron, with teeth like water-weed" in seventeen
 * tellings of their own).
 */
export function recites(reply: string, story: string, facts = '', share = 0.6, run = 8): boolean {
  const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean)
  const runs = (w: string[]) => new Set(Array.from({ length: Math.max(0, w.length - run + 1) }, (_, i) => w.slice(i, i + run).join(' ')))
  const given = runs(words(facts))
  const told = new Set([...runs(words(story))].filter((g) => !given.has(g)))
  const said = words(reply)
  if (!told.size || said.length < run) return false
  const copied = new Array<boolean>(said.length).fill(false)
  for (let i = 0; i + run <= said.length; i++) if (told.has(said.slice(i, i + run).join(' '))) for (let j = i; j < i + run; j++) copied[j] = true
  return copied.filter(Boolean).length / said.length > share
}

/**
 * Whether the speaker speaks of themselves as of someone else (M10.29 T,
 * Bram's log: "Niko didn't mention it. He's been worried", from Niko): their
 * own name as the one doing something in what they say (the words in quotes,
 * or the whole reply when it has none). "I'm Niko" and "my name is Niko" are
 * fine, and so is the action before the words ("Niko shrugs.").
 */
export function talksOfSelf(text: string, names: string[]): boolean {
  const quoted = [...text.matchAll(/["“]([^"”]*)["”]?/g)].map((m) => m[1]!)
  const speech = /["“]/.test(text) ? quoted.join(' ') : text
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const verbs = "didn't|doesn't|isn't|wasn't|hasn't|won't|is|was|has|had|been|said|says|will|would|can|could|should|must|thinks|thought|knows|knew|wants|wanted|went|goes|did|does|never|always"
  // "Niko is my name" names them; "Niko is worried" is them spoken of.
  return names.filter(Boolean).some((n) => new RegExp(`\\b${escape(n)}(?:'s)?\\s+(?:${verbs})\\b(?!\\s+(?:my|the) name)`).test(speech))
}

// A deed a memory claims was done (M10.29, Bram's playtest: "I showed the stranger the bunk", never shown): the kinds
// of agreement that would bear it out.
const DEEDS: { words: RegExp; kinds: string[] }[] = [
  { words: /\b(?:showed|led|walked|guided|took (?:the stranger|them|him|her) (?:to|round|down|up))\b/i, kinds: ['lead', 'accompany'] },
  { words: /\b(?:gave|handed|lent|loaned|brought|passed)\b/i, kinds: ['give', 'lend', 'errand'] },
]

/** The kinds of agreement a memory note's deed needs, or none when it claims no deed. */
export function deedKinds(note: string): string[] {
  return DEEDS.filter((d) => d.words.test(note)).flatMap((d) => d.kinds)
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Whether a piece of a reply closes every quotation it opens: straight quotes in pairs, curly ones balanced. */
function quotesClosed(text: string): boolean {
  return (text.match(/"/g) ?? []).length % 2 === 0 && (text.match(/\u201c/g) ?? []).length === (text.match(/\u201d/g) ?? []).length
}

/** A piece of a reply with the quotation it leaves open closed after its last sentence. */
function closeQuotes(text: string): string {
  const t = text.trimEnd()
  if ((t.match(/"/g) ?? []).length % 2 === 1) return `${t}"`
  if ((t.match(/\u201c/g) ?? []).length > (t.match(/\u201d/g) ?? []).length) return `${t}\u201d`
  return t
}

/**
 * Cuts a reply that runs too long at the last full sentence within the limit,
 * with every quotation closed and something said kept (M10.33 G: Tessa's answer
 * was cut after `"Right.` with its quotation open, and a cut before her first
 * words would leave only her hands); a reply with no such place stays whole.
 */
export function fitLength(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (wordCount(clean) <= Math.round(limit * 1.2)) return clean
  const speaks = /["\u201c]/.test(clean)
  const said = (part: string) => /"[^"]+"|\u201c[^\u201d]+\u201d/.test(part)
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]\u201d]?\s*/g) ?? [clean]
  let result = ''
  let cut = ''
  for (const sentence of sentences) {
    if (wordCount(result + sentence) > limit) break
    result += sentence
    const closed = quotesClosed(result) ? result.trimEnd() : closeQuotes(result)
    if (!speaks || said(closed)) cut = closed
  }
  return cut.trim() || clean
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

// Oaths of our world (M10.8): nobody in these worlds swears by Christ, God or
// the Lord, nor sends anyone to hell. The whole exclamation goes, and an oath
// of the speaker's own faith stands in its place.
const OUR_OATHS = /\b(?:(?:oh|by|for|good|dear|great|sweet|my|thank)\s+)?(?:jesus(?:\s+christ)?|christ(?:\s+almighty)?|god(?:\s+almighty)?|lord(?:\s+above)?)(?:'s\s+sake|\s+knows|\s+help\s+(?:us|me)|\s+willing|\s+damn(?:\s+it)?)?\b|\bgod-?damn(?:ed|it)?\b|\b(?:what|where|who|how|why)\s+the\s+hell\b|\bbloody\s+hell\b|\bgo\s+to\s+hell\b/gi

export function hasOurOaths(text: string): boolean {
  OUR_OATHS.lastIndex = 0
  return OUR_OATHS.test(text)
}

/** Puts the speaker's own oaths in place of ours; with none known, the words simply go. */
export function swearRight(text: string, oaths: string[]): string {
  let n = 0
  const fixed = text.replace(OUR_OATHS, (match: string, offset: number) => {
    const oath = oaths.length ? oaths[n++ % oaths.length]! : ''
    // "What the hell happened?" keeps its question: "What, by the Lantern, happened?"; "go to hell" is plain rudeness.
    const wh = /^(what|where|who|how|why)\s+the\s+hell$/i.exec(match)
    const put = wh ? (oath ? `${wh[1]}, ${oath.charAt(0).toLowerCase()}${oath.slice(1)},` : wh[1]!) : /^go\s+to\s+hell$/i.test(match) ? 'get away with you' : oath
    const start = offset === 0 || /[.!?"]\s*$/.test(text.slice(0, offset))
    return start ? put.charAt(0).toUpperCase() + put.slice(1) : put
  })
  return fixed.replace(/,\s*([.!?])/g, '$1').replace(/\s+([,.!?])/g, '$1').replace(/"\s*,\s*/g, '"').replace(/\s{2,}/g, ' ').trim()
}
