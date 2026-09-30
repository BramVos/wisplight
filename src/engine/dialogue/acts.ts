// Dialogue acts (FO, chapter 9). Free text is classified by rules first; the
// model may refine the act in its reply, but checks and knowledge are decided
// before the model is called.

export const ACTS = [
  'Greet',
  'Farewell',
  'SmallTalk',
  'AskAboutSelf',
  'AskWork',
  'AskRumors',
  'AskAbout',
  'AskDirections',
  'AskOpinion',
  'AskStory',
  'Tell',
  'Request',
  'Offer',
  'Trade',
  'Promise',
  'Recruit',
  'Persuade',
  'Deceive',
  'Intimidate',
  'Bribe',
  'Compliment',
  'Flirt',
  'Apologize',
  // Making amends for a broken word (M10.14): telling why, or offering to make it good.
  'Explain',
  'MakeGood',
  'Insult',
  'OffTopic',
] as const
export type Act = (typeof ACTS)[number]

export type Tier = 'short' | 'normal' | 'explain' | 'story'

// The whole JSON reply counts, not only the words: act, names, topics, effects, the
// memory note and the quest action take about 150 tokens before the reply itself.
// The word limit per tier is kept by fitLength, so a roomy budget costs nothing extra.
export const TIER_TOKENS: Record<Tier, number> = { short: 320, normal: 450, explain: 560, story: 850 }

const RULES: { act: Act; pattern: RegExp }[] = [
  { act: 'Farewell', pattern: /^(bye|goodbye|farewell|good night|see you|dag|doei|tot ziens|tot later|welterusten)\b/i },
  { act: 'Insult', pattern: /\b(idiot|fool|stupid|ugly|shut up|hag|liar|coward|sukkel|idioot|stom|lelijk|kop dicht|lafaard)\b/i },
  { act: 'Intimidate', pattern: /\b(or else|you'?ll regret|you will regret|i'?ll hurt you|i will hurt you|i'?ll kill you|i will kill you|i'?ll break your|watch your back|or you'?ll be sorry|anders krijg je|je zult het berouwen)\b/i },
  { act: 'MakeGood', pattern: /\b(make (it|this|that) (up to you|right|good)|make amends|i'?ll still (do|bring|fetch|come|get)|i will still (do|bring|fetch|come|get)|i'?ll do it after all|let me make (it )?up|goedmaken|alsnog)\b/i },
  { act: 'Apologize', pattern: /\b(sorry|apologi[sz]e|forgive me|my apologies|excuse me|pardon|het spijt me|excuses)\b/i },
  { act: 'Explain', pattern: /\b(let me explain|i couldn'?t (come|make it|get)|i could not|i was (held up|kept|delayed|ill|sick|stopped)|it wasn'?t my fault|the reason (is|was)|what happened was|ik kon niet|het kwam doordat|laat me uitleggen)\b/i },
  { act: 'Flirt', pattern: /\b(beautiful|pretty eyes|lovely eyes|handsome|kiss|lovely smile|mooie ogen|knap|zoen|kus)\b/i },
  { act: 'Compliment', pattern: /\b(thank you|thanks|well done|good bread|kind of you|bedankt|dank je|dank u|lekker|goed gedaan)\b/i },
  // A wish or a hope is said, not asked (M10.8): "I hope you can make the Count understand, good sir."
  { act: 'SmallTalk', pattern: /^(i hope|i wish|i trust|let'?s hope|may the|god willing|ik hoop|hopelijk|laten we hopen)\b/i },
  { act: 'Recruit', pattern: /\b(come with me|join me|travel with me|help me find|ga je mee|kom je mee|reis met me)\b/i },
  { act: 'Trade', pattern: /\b(buy|sell|how much|price|cost|trade|koop|kopen|verkoop|hoeveel|prijs|kost)\b/i },
  { act: 'AskStory', pattern: /\b(story|legend|tale|tell me about the|verhaal|legende|sage)\b/i },
  { act: 'AskRumors', pattern: /\b(what'?s new|any news|news|rumou?rs?|gossip|heard anything|what'?s going on|nieuws|roddels?|wat is er gebeurd)\b/i },
  { act: 'AskAboutSelf', pattern: /\b(who are you|your name|wie ben je|wie bent u|hoe heet je)\b/i },
  { act: 'AskWork', pattern: /\b(what do you do|your work|your trade|what'?s your job|wat doe je|wat is je werk|je beroep)\b/i },
  { act: 'AskDirections', pattern: /\b(where is|where'?s|where can i|how do i get|which way|how far|waar is|waar ligt|waar kan ik|hoe kom ik|hoe ver)\b/i },
  { act: 'AskOpinion', pattern: /\b(do you think|what do you think|your opinion|do you believe|denk je|vind je|geloof je)\b/i },
  { act: 'Request', pattern: /\b(can you|could you|would you|will you|please|help me|kun je|kunt u|wil je|help me|alsjeblieft)\b/i },
  { act: 'Greet', pattern: /^(hello|hi|hey|good (morning|evening|afternoon|day)|greetings|hallo|hoi|goedemorgen|goedenavond|goedemiddag|dag)\b/i },
]

/**
 * A courtesy before what is asked (M10.33 G): "Sorry, ...", "Excuse me, ...",
 * "Good morning. ...". Bram's "Sorry you are going a bit fast, which notes ...?"
 * was taken for an apology and got fifteen words.
 */
const COURTESY = /^(?:(?:so\s+)?sorry|excuse me|pardon(?: me)?|my apologies|forgive me|thanks?(?: you)?|hello|hi|hey|good\s?(?:morning|evening|afternoon|day)|morning|evening|goedemorgen|goedemiddag|goedenavond|hallo|hoi|het spijt me|sorry hoor|pardon hoor)\b[\s,.!;:-]*/i

/** Whether words ask something: a question mark, or a question word first. */
function asks(text: string): boolean {
  return /\?/.test(text) || /^(what|who|why|how|when|where|which|can|could|would|will|do|does|did|is|are|wat|wie|waarom|hoe|wanneer|waar|welke|kun|kunt|wil|weet|ken)\b/i.test(text.trim())
}

/** Classifies what the player says. Topics decide AskAbout when no rule fits. */
export function classify(text: string, topicCount: number): Act {
  const trimmed = text.trim()
  // A question with a courtesy before it is the question after it (M10.33 G): the courtesy never sets how long the answer is.
  const rest = trimmed.replace(COURTESY, '')
  if (rest && rest !== trimmed && asks(rest)) return classify(rest, topicCount)
  for (const { act, pattern } of RULES) if (pattern.test(trimmed)) return act
  if (topicCount > 0) return /\?\s*$/.test(trimmed) || /^(what|who|why|how|when|do|did|is|are|wat|wie|waarom|hoe|wanneer|ken|weet)\b/i.test(trimmed) ? 'AskAbout' : 'Tell'
  if (/\?\s*$/.test(trimmed)) return 'SmallTalk'
  return 'SmallTalk'
}

export function tierFor(act: Act): Tier {
  switch (act) {
    case 'Greet':
    case 'Farewell':
    case 'Compliment':
    case 'Apologize':
    case 'Explain':
    case 'MakeGood':
    case 'Insult':
    case 'Flirt':
    case 'OffTopic':
      return 'short'
    case 'AskDirections':
    case 'AskWork':
      return 'explain'
    case 'AskStory':
      return 'story'
    default:
      return 'normal'
  }
}
