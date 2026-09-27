import type { Content } from './content'
import { callName } from './content'
import type { GameState } from './state'
import { wordsOf } from './world'
import { forgetPlayer } from './layer'

// The same world with a new character (design: lore and world change, "Lore
// meenemen naar een ander spel", decided on 27 September; M7.2). The world
// goes on from the save: the old character has left, big events stay, small
// news is forgotten, and what people felt about the stranger becomes a memory.
// Everything that belonged to the old character goes with them.

const KEEP_BELANG = 4

export function carryOver(content: Content, state: GameState): string[] {
  const notes: string[] = []
  const world = content.world

  // Big events stay; small news is forgotten, by everyone.
  const news = state.news
  if (news) {
    const kept = new Set(news.facts.filter((f) => f.belang >= KEEP_BELANG).map((f) => f.id))
    notes.push(`${kept.size} big events remembered, ${news.facts.length - kept.size} small ones forgotten.`)
    news.facts = news.facts.filter((f) => kept.has(f.id))
    for (const [who, heard] of Object.entries(news.heard)) {
      if (who === 'player') {
        news.heard[who] = {}
        continue
      }
      for (const id of Object.keys(heard)) if (!kept.has(id)) delete heard[id]
    }
  }

  // What people felt about the old stranger becomes a memory.
  for (const [npcId, rel] of Object.entries(state.relations ?? {})) {
    const npc = state.npcs[npcId]
    if (!npc || npc.dead || !content.npcs.has(npcId) || rel.familiarity < 10) continue
    const feeling = rel.affinity >= 40 ? 'I miss them' : rel.affinity >= 10 ? 'decent enough' : rel.affinity <= -30 ? 'good riddance' : rel.affinity <= -10 ? 'I never trusted them' : 'we will see what the next one is like'
    ;(npc.memory ??= []).push({ t: state.minutes, note: `I remember the stranger from ${wordsOf(content).from} who was here before. ${feeling[0]!.toUpperCase()}${feeling.slice(1)}.`, topics: [], valence: rel.affinity >= 10 ? 1 : rel.affinity <= -10 ? -1 : 0 })
    delete npc.grievance
    npc.following = false
  }
  state.relations = {}

  // The old character's own things go with them.
  state.player = { location: world.start.location, money: world.player.money, inventory: { ...world.player.inventory } }
  delete state.talk
  delete state.combat
  state.companions = []
  state.romance = {}
  // Ties to the old stranger and a spouse who waited for them go with them too (M8.1).
  forgetPlayer(state)
  state.reputation = {}
  state.memberships = []
  state.wanted = {}
  state.requests = state.requests.filter((r) => r.status !== 'open')

  // Quests the old stranger left unfinished are open again for the new one; what ended, ended.
  const log = state.questlog ?? {}
  const clocks = new Set<string>()
  for (const [id, q] of Object.entries(log)) {
    if (q.ended) continue
    for (const stage of content.quests.get(id)?.stages ?? []) for (const e of stage.on_enter) if ('clock' in e) clocks.add(e.clock.id)
    delete log[id]
  }
  for (const id of clocks) delete state.clocks?.[id]

  // What the old stranger knew is not the new one's: secrets told, topics learnt.
  for (const key of Object.keys(state.flags ?? {})) if (key.startsWith('secret:') || key.startsWith('knows:') || key.startsWith('personal_')) delete state.flags![key]

  const names = Object.keys(state.npcs).filter((id) => content.npcs.has(id) && state.npcs[id]!.memory?.some((m) => m.note.startsWith('I remember the stranger')))
  if (names.length) notes.push(`${names.map((id) => callName(content.npcs.get(id)!)).slice(0, 6).join(', ')}${names.length > 6 ? ' and others' : ''} remember the stranger before you.`)
  return notes
}
