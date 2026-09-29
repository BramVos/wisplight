import { knob } from '../knobs'
import type { Output } from '../commands'
import { callName } from '../content'
import { withPlayer } from '../social/companions'
import type { World } from '../world'
import { swearRight, unknownNames, vocabularyOf, wordCount } from './guard'
import { fixNotHere, oathsFor, strangeWords } from './voice'
import type { Knowledge } from './knowledge'
import { cachedSystem, type LlmClient } from './llm'
import { describePersonality, worldFrame } from './prompt'
import { worldText } from '../safety'
import type { TopicRegistry } from './topics'

// The group conversation (FO, chapter 13, "Groepsgesprek en kampvuur"):
// TALK PARTY or ASK PARTY ABOUT <topic> asks every companion at once. One
// model call with the short cards of all of them; each says one sentence of
// at most 25 words, coloured by their values and what they know. Without a
// model, or when the reply does not hold, the lines come from what they know.


export async function partyTalk(world: World, topics: TopicRegistry, knowledge: Knowledge, llm: LlmClient | undefined, words: string, vocabulary: Set<string>): Promise<Output[]> {
  const party = withPlayer(world)
  if (!party.length) return [{ kind: 'error', text: 'There is nobody with you to ask.' }]
  const topic = words ? topics.find(words) : undefined
  const question = words ? `What do you make of ${topic ? topics.name(topic) : words}?` : 'What do you all think we should do?'
  const cards = party.map((c) => {
    const npc = world.npc(c.npc)
    const packet = topic ? knowledge.packet(c.npc, [topic], false) : undefined
    const known = packet?.known[0]
    return {
      id: c.npc,
      name: callName(npc),
      card: `${callName(npc)} (${npc.short}): ${describePersonality(npc)}. Values: ${Object.entries(npc.values).map(([v, n]) => `${v} ${n}`).join(', ') || 'none in particular'}. Loyalty to the stranger ${c.loyalty}/100.`,
      knows: known ? known.facts.slice(0, 2) : [],
    }
  })
  // The world's own guard (M10.10): the speaker's oaths, what people here say instead, and nothing that is not here.
  const fit = (id: string, line: string): string | undefined => {
    const fixed = fixNotHere(world, swearRight(line, oathsFor(world, id))).text
    return strangeWords(world, fixed).length ? undefined : fixed
  }
  const lines = llm ? await ask(llm, cards, question, vocabulary, words, worldText(worldFrame(world.content, world.land)), fit, knob(world, 'talk.party_words')) : undefined
  return [
    { kind: 'text', text: `You: "${question}"` },
    ...cards.map((card, i) => ({ kind: 'speech' as const, text: `${card.name}: "${lines?.[i] ?? fallback(world, card, topic ? topics.name(topic) : undefined)}"`, ...(lines?.[i] ? { source: 'model' as const } : {}) })),
  ]
}

/**
 * The reply of a group, the same for every group (M10.28: a schema that
 * changes from call to call breaks what the cache holds). The ids go in the
 * prompt; a line from someone who is not in the group is not read.
 */
export const PARTY_REPLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['speaker', 'text'], properties: { speaker: { type: 'string', description: 'The id of a companion from COMPANIONS.' }, text: { type: 'string' } } } } },
}

async function ask(llm: LlmClient, cards: { id: string; name: string; card: string; knows: string[] }[], question: string, vocabulary: Set<string>, playerWords: string, frame: string, fit: (id: string, line: string) => string | undefined, partyWords: number): Promise<(string | undefined)[] | undefined> {
  const system = [
    'You speak for several companions of the player in a late-medieval world, in English, each in their own voice.',
    frame,
    'RULES: Each companion says exactly one sentence of at most 25 words. Never make up names, places or facts: a companion only says what their card and KNOWS allow, or that they do not know. No modern words. JSON only.',
  ].join('\n')
  const prompt = [
    'COMPANIONS:',
    ...cards.map((c) => `- ${c.id}: ${c.card} KNOWS: ${c.knows.length ? c.knows.join(' ') : 'nothing about this'}`),
    `THE STRANGER ASKS THE GROUP: "${question}"`,
  ].join('\n')
  try {
    const reply = await llm.complete({
      role: 'voice',
      // The same for every question to the group in this land (M10.26), but not marked (M10.27): a second question
      // within five minutes is rare, and a mark would only pay a write.
      ...cachedSystem(system, '', '', 'none'),
      prompt,
      schemaName: 'party_reply',
      schema: PARTY_REPLY_SCHEMA,
      maxTokens: 120 + 60 * cards.length,
      meta: { party: cards.map((c) => ({ id: c.id, name: c.name, knows: c.knows })) },
    })
    const parsed = JSON.parse(reply.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { lines?: { speaker?: string; text?: string }[] }
    const own = vocabularyOf(playerWords)
    return cards.map((card) => {
      const said = parsed.lines?.find((l) => l.speaker === card.id)?.text?.trim()
      const line = said ? fit(card.id, said) : undefined
      if (!line || wordCount(line) > partyWords + 5 || unknownNames(line, vocabulary, own).length) return undefined
      return line.replace(/^"|"$/g, '')
    })
  } catch {
    return undefined
  }
}

function fallback(world: World, card: { id: string; knows: string[] }, topicName?: string): string {
  const npc = world.npc(card.id)
  if (topicName && card.knows.length) return card.knows[0]!.split(/(?<=[.!?])\s/)[0]!
  if (topicName) return npc.personality.honesty >= 1 ? `I don't know much about ${topicName}. Better ask someone who does.` : `${topicName}? Couldn't tell you.`
  if (npc.personality.courage >= 2) return "Keep going. We've come this far."
  if (npc.personality.courage <= 0) return "I'd rather we were home before dark."
  return 'Your call. I go where you go.'
}
