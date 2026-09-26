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
  'Insult',
  'OffTopic',
] as const
export type Act = (typeof ACTS)[number]

export type Tier = 'short' | 'normal' | 'explain' | 'story'

export const TIER_WORDS: Record<Tier, number> = { short: 15, normal: 50, explain: 90, story: 180 }
export const TIER_TOKENS: Record<Tier, number> = { short: 120, normal: 250, explain: 350, story: 600 }

const RULES: { act: Act; pattern: RegExp }[] = [
  { act: 'Farewell', pattern: /^(bye|goodbye|farewell|good night|see you|dag|doei|tot ziens|tot later|welterusten)\b/i },
  { act: 'Insult', pattern: /\b(idiot|fool|stupid|ugly|shut up|hag|liar|coward|sukkel|idioot|stom|lelijk|kop dicht|lafaard)\b/i },
  { act: 'Apologize', pattern: /\b(sorry|apologi[sz]e|forgive me|my apologies|excuse me|pardon|het spijt me|excuses)\b/i },
  { act: 'Flirt', pattern: /\b(beautiful|pretty eyes|handsome|kiss|lovely smile|mooie ogen|knap|zoen|kus)\b/i },
  { act: 'Compliment', pattern: /\b(thank you|thanks|well done|good bread|kind of you|bedankt|dank je|dank u|lekker|goed gedaan)\b/i },
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

/** Classifies what the player says. Topics decide AskAbout when no rule fits. */
export function classify(text: string, topicCount: number): Act {
  const trimmed = text.trim()
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
