import { GameClock, MONTHS } from './clock'
import { callName } from './content'
import { requestName } from './requests'
import type { World } from './world'

// The true chronicle of a game (design: lore and world change, "Wat de speler
// ziet"): everything that really happened, what was not true, and who knew.
// The player sees it only when he chooses to, at the end.

export function chronicleText(world: World, start: number): string {
  const facts = [...(world.state.news?.facts ?? [])].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  const heard = world.state.news?.heard ?? {}
  const lines = [`THE CHRONICLE`, `${new GameClock(start).format()} to ${new GameClock(world.now).format()}`, '']
  for (const fact of facts) {
    const clock = new GameClock(fact.t).parts
    const when = `${clock.weekday} ${clock.day} ${MONTHS[clock.month - 1]}, ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`
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
