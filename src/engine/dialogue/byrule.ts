import { callName } from '../content'
import type { World } from '../world'
import type { Act } from './acts'
import { askedFor, type Offer } from './offers'

// No model for what the rules can do (M10.28; Bram, 29 September 2026: a
// line of talk is half a cent, and many lines need no voice). A greeting, a
// plain yes or no after something that was no question, buying or selling
// what is on offer, the same question asked again in the same words, and
// what the card answers on its own (who they are, what they do) are answered
// by the engine with the designer's templates; only a new question goes to
// the model. The line is said as the rules say it everywhere else, marked as
// the game's own, and the AI log keeps it as "by rule" at no cost.

export type ByRuleWhy = 'greeting' | 'yes or no' | 'trade' | 'asked again' | 'card'

export interface ByRule {
  why: ByRuleWhy
  /** The line itself, where the templates of the turn do not say it: "as I said". */
  line?: string
}

const YES_NO = /^(yes|no|yeah|yep|nope|aye|nay|sure|of course|ja|nee|jawel)[.!]?$/i

/** The words of a line as a question would be matched again: lower case, without the punctuation. */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

/** The first quoted words of a reply: what the person said, without what they did. */
function spoken(reply: string): string | undefined {
  return /"([^"]+)"/.exec(reply)?.[1]
}

/**
 * Whether the rules answer this line without the voice, and why. Never when
 * the turn carries a decision the voice must word (a check, a secret, a claim,
 * a reaction, a quest to offer): those keep their call.
 */
export function byRule(world: World, npcId: string, turn: { act: Act; text: string; topics: string[]; history: { speaker: 'player' | 'npc'; text: string }[]; offers: Offer[]; busy: boolean }): ByRule | undefined {
  if (turn.busy) return undefined
  const text = turn.text.trim()
  const words = plain(text).split(' ').filter(Boolean).length
  // The same question in the same words, answered already in this talk: the same answer, said again.
  if (words >= 3) {
    const history = turn.history
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i]!.speaker !== 'player' || plain(history[i]!.text) !== plain(text)) continue
      const said = history[i + 1]?.speaker === 'npc' ? spoken(history[i + 1]!.text) : undefined
      if (said) return { why: 'asked again', line: world.say(`{name} gives you a look. "As I said: ${said}"`, npcId) }
      break
    }
  }
  if (turn.act === 'Greet' && turn.topics.length === 0 && words <= 6) return { why: 'greeting' }
  // A yes or a no to something that was no question: a nod. After a question the answer carries the talk on.
  if (YES_NO.test(text)) {
    const last = [...turn.history].reverse().find((h) => h.speaker === 'npc')
    const asked = last && /\?["”]?\s*$/.test(spoken(last.text) ?? last.text)
    if (!asked) return { why: 'yes or no', line: /^(no|nope|nay|nee)/i.test(text) ? world.say(`{name} shrugs. "As you like."`, npcId) : `${callName(world.npc(npcId))} nods.` }
  }
  // Buying or selling what is on offer: the offer's own line says the price and the deal.
  if (turn.act === 'Trade' && askedFor(turn.offers, text)?.kind === 'sell') return { why: 'trade' }
  // Who they are and what they do, when nothing else is asked: the card answers it.
  if ((turn.act === 'AskAboutSelf' || turn.act === 'AskWork') && turn.topics.length === 0 && words <= 8) return { why: 'card' }
  return undefined
}
