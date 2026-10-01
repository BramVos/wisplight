import { newsAbout, strangersOwn } from '../news'
import { allHold, type QuestState } from '../quests/engine'
import { stageNow, wantsNow } from '../quests/knows'
import { openRequestsOf } from '../requests'
import type { World } from '../world'
import type { Packet } from './knowledge'
import { talkSeed } from './voice'

// Where a question back may go (M10.35 D; the cause: THIS TIME asked the voice one turn in three for a question back or
// a hook "in your own way", and a false trail came in there). The game gives the hooks, all of them things the prompt
// holds: the speaker's own request, what they want of the stranger now, how the stranger gets on with a story they are
// in (the "Now" line), a story they know, an offer the game said yes to, news they heard, or a topic of this turn they
// know well. The voice picks one and says it in its own words; with none, it asks back about what the stranger said.

/** The hooks of the speaker's own: their request, the stories they are in or know, and the offers the game said yes to. */
function ownHooks(world: World, npcId: string, proposals: string[]): string[] {
  const hooks: string[] = []
  if (openRequestsOf(world, npcId).length) hooks.push('your request (YOUR REQUEST)')
  const wants = wantsNow(world, npcId)
  if (wants?.asks) hooks.push(`what you want of the stranger now in ${wants.quest.name} (THE STORY AS YOU KNOW IT)`)
  const log = (world.state.questlog ?? {}) as Record<string, QuestState>
  for (const quest of world.content.quests.values()) {
    if (!log[quest.id] || log[quest.id]!.ended || wants?.quest.id === quest.id) continue
    const stage = stageNow(world, quest)
    // The stranger's next step only to whoever gave it or is in it; to someone who only knows the story, the story.
    const inIt = quest.givers.includes(npcId) || (quest.actions ?? []).some((a) => a.with === npcId && allHold(world, a.when, quest.id))
    if (stage?.goal && inIt) hooks.push(`how the stranger is getting on with ${quest.name}; their next step: ${stage.goal.trim().replace(/\.$/, '')}`)
    else if (stage?.knows?.[npcId]) hooks.push(`${quest.name} (THE STORY AS YOU KNOW IT)`)
  }
  for (const what of proposals) hooks.push(`an offer of yours the game said yes to: ${what}`)
  return hooks
}

/** The hooks from what the speaker knows: news they heard, and a topic of this turn they know well. */
function knownHooks(world: World, npcId: string, packet: Packet): string[] {
  const topics = new Set(packet.known.map((k) => k.topic))
  const news = newsAbout(world, npcId, [], 8).filter(({ fact }) => !strangersOwn(fact) && !topics.has(fact.id))
  // A tale of their own (M10.35 A), about someone or somewhere of this place: the first words, to bring it up by.
  const here = world.state.player.location
  const tale = world.content.npcs.get(npcId)?.tales.find((t) => t.about.includes(here) || t.about.some((id) => world.state.npcs[id]?.location === here))
  return [...news.slice(0, 1).map(({ fact }) => `news you heard: ${fact.title}`), ...(tale ? [`a tale of your own: ${tale.text.split(/(?<=[.!?])\s/)[0]}`] : []), ...packet.known.filter((k) => k.level >= 2 && k.topic !== npcId).map((k) => `${k.name} (KNOWLEDGE)`)]
}

/** The hooks a question back may take now: one of the speaker's own and one of what they know, turn by turn another. */
export function hooksFor(world: World, ctx: { npcId: string; packet: Packet; proposals?: string[] }): string[] {
  const talk = world.state.talk?.npc === ctx.npcId ? world.state.talk : undefined
  const turn = talkSeed(ctx.npcId, talk?.began ?? 0) + Math.floor((talk?.turns ?? 0) / 3)
  return [ownHooks(world, ctx.npcId, ctx.proposals ?? []), knownHooks(world, ctx.npcId, ctx.packet)].flatMap((list) => (list.length ? [list[turn % list.length]!] : []))
}

/** THIS TIME (M10.28, M10.35 D): a question back, to a hook the game gives, or about what the stranger said. */
export function hookLine(world: World, ctx: { npcId: string; packet: Packet; proposals?: string[] }): string {
  const hooks = hooksFor(world, ctx)
  return hooks.length
    ? `THIS TIME: end with a question back to the stranger, or a hook to one of these, in your own words: ${hooks.join('; ')}. No other hook.`
    : 'THIS TIME: end with a question back about what the stranger just said; bring up nothing new.'
}
