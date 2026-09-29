import { GameClock } from './clock'
import { callName } from './content'
import { requestName } from './requests'
import { tidesChronicle } from './tidepages'
import { frameOf } from './lands'
import type { World } from './world'

// The true chronicle of a game (design: lore and world change, "Wat de speler
// ziet"): everything that really happened, what was not true, and who knew.
// The player sees it only when he chooses to, at the end.

export function chronicleText(world: World, start: number): string {
  const facts = [...(world.state.news?.facts ?? [])].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  const heard = world.state.news?.heard ?? {}
  const lines = [`THE CHRONICLE`, `${world.date(start)} to ${world.date()}`, '']
  for (const fact of facts) {
    const when = new GameClock(fact.t).short(world.calendar)
    lines.push(`${when}, ${world.location(fact.place).name}: ${capital(fact.title)}${fact.truth === false ? ' (not true)' : ''}`)
    lines.push(`  ${fact.text.precise}`)
    const knowers = Object.keys(heard).filter((who) => heard[who]![fact.id])
    const people = knowers.filter((who) => who !== 'player').map((id) => callName(world.npc(id)))
    const player = knowers.includes('player') ? 'you' : undefined
    const all = [...(player ? [player] : []), ...people]
    lines.push(`  Known to ${all.length === 0 ? 'nobody any more' : all.length > 6 ? `${all.slice(0, 6).join(', ')} and ${all.length - 6} more` : all.join(', ')}.`)
    lines.push('')
  }
  const far = world.state.lore?.far ?? []
  if (far.length) {
    lines.push('FAR PLACES NAMED IN THIS GAME')
    for (const place of far) lines.push(`  ${place.name} (${place.kind}), first named by ${callName(world.npc(place.by))}: "${place.line}"`)
    lines.push('')
  }
  const lore = world.state.chronicle?.lore ?? []
  if (lore.length) {
    lines.push('THE STORIES OF THIS GAME')
    for (const entry of lore) {
      lines.push(`${entry.name}${entry.by === 'template' ? '' : ' (written by the chronicler)'}`)
      for (const text of [entry.story || entry.details || entry.summary, entry.far && `Far away they say: ${entry.far}`]) if (text) lines.push(`  ${text}`)
      lines.push('')
    }
  }
  // What one land heard of another, and how late (M10.23).
  const across = Object.entries(world.state.news?.landHeard ?? {}).sort((a, b) => a[1] - b[1])
  if (across.length) {
    lines.push('NEWS BETWEEN THE LANDS')
    for (const [key, t] of across) {
      const [factId, land] = key.split('>') as [string, string]
      const fact = world.state.news?.facts.find((f) => f.id === factId)
      if (!fact) continue
      lines.push(`  ${capital(fact.title)}: heard in ${frameOf(world.content, land === world.content.world.id ? undefined : land).name} on ${new GameClock(t).short(world.calendar)}, ${Math.max(0, Math.round((t - fact.t) / (24 * 60)))} days after.`)
    }
    lines.push('')
  }
  // Every judgement of the great lines (M10.22), also the months nothing came of it.
  const tides = tidesChronicle(world)
  if (tides.length) lines.push('THE GREAT LINES', ...tides, '')
  const asked = world.state.requests.filter((r) => r.asked !== undefined || r.source === 'chronicler')
  if (asked.length) {
    lines.push('WHAT PEOPLE ASKED OF YOU')
    for (const r of asked) lines.push(`  ${requestName(world, r)}: ${r.asked === undefined ? 'never asked' : r.status === 'done' ? 'done' : r.status === 'failed' ? 'too late' : 'still open'}.`)
    lines.push('')
  }
  if (facts.length === 0 && far.length === 0 && lore.length === 0) lines.push('Nothing worth telling happened yet.')
  return lines.join('\n')
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * What happened in this game (M10.18), in Markdown, to download from the menu
 * or the journal: the events, the far places and the people named in passing,
 * what the stranger improvised, the chronicler's stories and the storylines.
 * Per save, never in the content; it goes as its own chapter after the world
 * book ("What happened in this game").
 */
export function chronicleMarkdown(world: World, start: number): string {
  const lines = [`# What happened in this game`, '', `${world.content.world.name}, ${world.date(start)} to ${world.date()}.`, '']
  const facts = [...(world.state.news?.facts ?? [])].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  if (facts.length) {
    lines.push('## Events', '')
    for (const fact of facts) lines.push(`- **${new GameClock(fact.t).short(world.calendar)}, ${world.location(fact.place).name}.** ${capital(fact.text.precise)}${fact.truth === false ? ' *(not true)*' : ''}`)
    lines.push('')
  }
  const far = world.state.lore?.far ?? []
  if (far.length) lines.push('## Far places named', '', ...far.map((p) => `- **${p.name}** (${p.kind}), first named by ${callName(world.npc(p.by))}: "${p.line}"`), '')
  const people = world.state.lore?.people ?? []
  if (people.length) lines.push('## People named in passing', '', ...people.map((p) => `- **${p.name}**, ${p.bond} of ${world.content.npcs.has(p.of) ? callName(world.npc(p.of)) : p.of}, in ${p.placeName}`), '')
  const improvised = world.state.improvisations ?? []
  if (improvised.length) lines.push('## What the stranger improvised', '', ...improvised.map((i) => `- **${new GameClock(i.t).short(world.calendar)}:** ${i.act}. ${i.narration}${i.effect !== 'nothing' ? ` *(${i.effect})*` : ''}`), '')
  const lore = world.state.chronicle?.lore ?? []
  if (lore.length) {
    lines.push('## The stories of this game', '')
    for (const entry of lore) lines.push(`### ${entry.name}`, '', entry.story || entry.details || entry.summary, ...(entry.far ? ['', `Far away they say: ${entry.far}`] : []), '')
  }
  const storylines = world.state.chronicle?.lines ?? []
  if (storylines.length) lines.push('## Storylines', '', ...storylines.map((l) => `- **${capital(l.title)}**${l.open ? '' : ' (closed)'}${l.summary.length ? `: ${l.summary.join(' ')}` : ''}`), '')
  if (lines.length <= 4) lines.push('Nothing worth telling happened yet.', '')
  return lines.join('\n').trim() + '\n'
}
