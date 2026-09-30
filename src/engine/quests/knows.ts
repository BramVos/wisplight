import type { Quest } from '../content'
import type { World } from '../world'
import { allHold, type QuestState } from './engine'

// What people know of a story, per stage (M10.30, Bram's log of 29 September
// 2026: Niko, Tessa and an improvisation each told their own plot of the
// recordings, and nothing held). A stage says per person what they know of it
// and may say; that goes to their voice as all they know, and to an
// improvisation at a place of the story. What the story keeps hidden (its
// truths) no reply and no improvisation names before the stage that gives it
// out. Content only: a world without knows and truths talks as before.

type Stage = NonNullable<Quest['stages']>[number]

/** The stage whose knowledge holds now: the one reached, or before the quest begins its first; none once it is over. */
export function stageNow(world: World, quest: Quest): Stage | undefined {
  const q = (world.state.questlog ?? {})[quest.id] as QuestState | undefined
  if (q?.ended) return undefined
  const stages = quest.stages ?? []
  return q ? stages.find((s) => s.id === q.stage) : stages[0]
}

/**
 * What a giver wants of the stranger now (M10.33 E): of the quests they gave that run, the oldest, its stage, and the
 * stage's asks line in their voice when it has one; none when they give none that runs.
 */
export function wantsNow(world: World, npcId: string): { quest: Quest; state: QuestState; stage: Stage; asks?: string } | undefined {
  const log = (world.state.questlog ?? {}) as Record<string, QuestState>
  const running = [...world.content.quests.values()].filter((q) => q.givers.includes(npcId) && log[q.id] && !log[q.id]!.ended).sort((a, b) => log[a.id]!.started - log[b.id]!.started)
  for (const quest of running) {
    const stage = stageNow(world, quest)
    if (stage) return { quest, state: log[quest.id]!, stage, ...(stage.asks?.trim() ? { asks: stage.asks.trim() } : {}) }
  }
  return undefined
}

/** What the speaker knows of the stories now, for their voice: nothing when no stage names them. */
export function storyLines(world: World, npcId: string): string[] {
  const lines: string[] = []
  for (const quest of world.content.quests.values()) {
    const line = stageNow(world, quest)?.knows?.[npcId]
    if (line) lines.push(`  ${quest.name}: ${line.trim()}`)
  }
  // What they want of the stranger now, as the giver (M10.33 E): the voice says it as they would.
  const wants = wantsNow(world, npcId)
  if (wants?.asks) lines.push(`  ${wants.quest.name}, what you want of the stranger now: ${wants.asks}`)
  return lines.length ? ['THE STORY AS YOU KNOW IT: this is all you know of it. Say no more of it than this; never make up what happened, who did it or why, and what you do not know, say you do not know.', ...lines] : []
}

/** The places of a quest: where it begins, where its actions are done, and the places it reacts to. */
function placesOf(quest: Quest): string[] {
  return [...(quest.starts?.at ?? []), ...(quest.actions ?? []).flatMap((a) => a.at), ...Object.keys(quest.on_place ?? {}).map((k) => k.split(':')[0]!)]
}

/** For an improvisation at a place of a story: all that is known of it now, from every knows line of its stage. */
export function storyHere(world: World, locationId: string): string[] {
  const area = world.content.locations.get(locationId)?.area
  const lines: string[] = []
  for (const quest of world.content.quests.values()) {
    const known = Object.values(stageNow(world, quest)?.knows ?? {})
    if (!known.length || !placesOf(quest).some((p) => p === locationId || p === area)) continue
    lines.push(`  ${quest.name}: ${known.map((k) => k.trim()).join(' ')}`)
  }
  return lines.length ? ['THE STORY HERE, all that is known of it now: name no other fact of it.', ...lines] : []
}

/**
 * What a story keeps hidden at this place, for an improvisation (M10.33 J: CHECK ANTENNA said "the recordings are
 * complete" against the story): the truths not yet given out, to be neither said nor denied. The guard keeps their
 * words out of the narration.
 */
export function truthsHere(world: World, locationId: string): string[] {
  const area = world.content.locations.get(locationId)?.area
  const lines: string[] = []
  for (const quest of world.content.quests.values()) {
    if (!quest.truths?.length || !placesOf(quest).some((p) => p === locationId || p === area)) continue
    const q = (world.state.questlog ?? {})[quest.id] as QuestState | undefined
    if (q?.ended) continue
    for (const truth of quest.truths) if (!((truth.from && q?.path.includes(truth.from)) || (truth.when.length && allHold(world, truth.when, quest.id)))) lines.push(`  ${truth.text.trim()}`)
  }
  return lines.length ? ['KEPT HIDDEN HERE (never say it, never say otherwise; tell only what is seen):', ...lines] : []
}

/**
 * A conclusion about a thing (M10.33 J): whole, complete, tampered with, nothing missing. Only THE THING may say so;
 * an improvisation tells what is seen.
 */
const CONCLUDES = /\b(?:is|are|looks?|seems?|appears?)\s+(?:\w+\s+)?(complete|intact|untouched|unaltered|undamaged|whole|in order|tampered with|altered|damaged|faulty)\b|\b(nothing (?:is )?(?:missing|wrong|amiss))\b|\b(all there)\b|\b(no sign of (?:tampering|damage|interference))\b/i

/** The conclusion a narration draws that the thing's own words do not, or none. */
export function concludes(narration: string, thing: string): string | undefined {
  const m = CONCLUDES.exec(narration)
  const said = m?.slice(1).find(Boolean)
  return said && !thing.toLowerCase().includes(said.toLowerCase()) ? said.toLowerCase() : undefined
}

const patterns = new Map<string, RegExp | null>()

/** A truth's words as a pattern; one that does not compile (the check refuses it) never matches. */
function pattern(words: string): RegExp | null {
  if (!patterns.has(words)) {
    try {
      patterns.set(words, new RegExp(words, 'i'))
    } catch {
      patterns.set(words, null)
    }
  }
  return patterns.get(words)!
}

const names = (text: string, words: string[]) => words.some((w) => pattern(w)?.test(text))

/** The secrets a person has already told the stranger: what they said then they may say again. */
function toldSecrets(world: World, npcId: string): string {
  const flags = world.state.flags ?? {}
  return world.npc(npcId).secrets.filter((s) => flags[`secret:${npcId}:${s.id}`]).map((s) => `${s.text} ${s.admission ?? ''}`).join('\n')
}

/**
 * The quest whose hidden truth the text names while its story keeps it: before
 * the stage `from`, or until it ends. What the game gave the speaker is theirs
 * to say: their knows line at the stage, a secret they admit or admitted, and
 * any other part of the talk (`given`), never the stranger's own words.
 */
export function hiddenNamed(world: World, text: string, speaker?: string, given = ''): string | undefined {
  for (const quest of world.content.quests.values()) {
    if (!quest.truths?.length) continue
    const q = (world.state.questlog ?? {})[quest.id] as QuestState | undefined
    if (q?.ended) continue
    const theirs = speaker ? `${stageNow(world, quest)?.knows?.[speaker] ?? ''}\n${toldSecrets(world, speaker)}\n${given}` : given
    for (const truth of quest.truths) {
      if ((truth.from && q?.path.includes(truth.from)) || (truth.when.length && allHold(world, truth.when, quest.id))) continue
      if (names(text, truth.words) && !names(theirs, truth.words)) return quest.name
    }
  }
  return undefined
}
