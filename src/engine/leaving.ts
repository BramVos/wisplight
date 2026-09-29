import { openAgreements, promiseLine } from './agreements'
import type { Output } from './commands'
import { callName } from './content'
import { active } from './quests/engine'
import { knownRequests, requestName } from './requests'
import { withPlayer } from './social/companions'
import type { World } from './world'

// The hint at departure (M10.21; Bram's idea, 28 September 2026). Whoever
// leaves the region with threads open gets one hint, in the world and never as
// a dialog: a companion says it, or it is the stranger's own thought. It is
// made from the open quests, the requests people made, the word given and the
// debts, with the name and where it stands, and what happens when they go
// (a quest that goes on without them, a promise missed). The rules choose the
// two heaviest threads; no question, no block, once a departure. The journal
// shows the same threads under the land map, before the journey.

export interface Thread {
  kind: 'quest' | 'request' | 'word' | 'debt'
  /** How heavy it weighs: the story's weight, a deadline near, a promise to the stranger. */
  weight: number
  /** The thread and where it stands. */
  text: string
  /** What happens if the stranger goes now, when the rules know. */
  then?: string
}

const DAY = 24 * 60

const days = (n: number) => (n <= 1 ? 'a day' : `${n} days`)

/** Every open thread the stranger would leave behind, heaviest first. `away` is how long the journey takes, in minutes. */
export function openThreads(world: World, away = 0): Thread[] {
  const threads: Thread[] = []
  for (const [quest, q] of active(world)) {
    if (q.started === undefined) continue
    const stage = quest.stages?.find((s) => s.id === q.stage)
    const lapse = quest.lapses?.when_far !== false ? quest.lapses : undefined
    const left = lapse ? Math.ceil((q.started + lapse.after_days * DAY - world.now) / DAY) : undefined
    threads.push({
      kind: 'quest',
      weight: (quest.kind === 'main' ? 4 : 3) + (left !== undefined && left * DAY <= away + 7 * DAY ? 2 : 0),
      text: `${quest.name}: ${stage?.text ?? 'not done yet'}`,
      ...(left !== undefined ? { then: left <= 0 ? 'It goes on without you now.' : `In ${days(left)} it goes on without you.` } : {}),
    })
  }
  for (const r of knownRequests(world).filter((x) => x.status === 'open')) {
    threads.push({ kind: 'request', weight: 2, text: `${requestName(world, r)}: ${callName(world.npc(r.npc))} waits for you.` })
  }
  for (const a of openAgreements(world, 'player').filter((x) => !x.part)) {
    const soon = a.due !== undefined && a.due - world.now <= away
    threads.push({
      kind: 'word',
      weight: 3 + (soon ? 2 : 0) + (a.by === 'player' ? 1 : 0),
      text: promiseLine(world, a),
      ...(soon && a.by === 'player' ? { then: 'Away, you will miss it, and it will be remembered.' } : {}),
    })
  }
  for (const d of (world.state.ledger ?? []).filter((x) => x.from === 'player' && x.due !== undefined && x.note !== 'paid')) {
    const soon = d.due! - world.now <= away
    const to = world.content.npcs.has(d.to) ? callName(world.npc(d.to)) : d.to
    threads.push({ kind: 'debt', weight: 2 + (soon ? 2 : 0), text: `You owe ${to} ${d.amount}.`, ...(soon ? { then: 'It falls due while you are away.' } : {}) })
  }
  return threads.sort((a, b) => b.weight - a.weight)
}

/**
 * The one hint at leaving the region: the two heaviest threads, said by a
 * companion who travels along, or the stranger's own thought. Undefined when
 * nothing is left open.
 */
export function departureHint(world: World, away: number): Output | undefined {
  const top = openThreads(world, away).slice(0, 2)
  if (!top.length) return undefined
  const said = top.map((t) => (t.then ? `${t.text} ${t.then}` : t.text)).join(' ')
  const along = withPlayer(world)[0]
  if (along && world.content.npcs.has(along.npc)) return { kind: 'speech', text: `${callName(world.npc(along.npc))}, as you set off: "Before we go. ${said}"` }
  return { kind: 'narration', text: `As you set off, you think of what you leave behind. ${said}` }
}
