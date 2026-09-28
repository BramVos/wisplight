import { knob } from './knobs'
import { commissionDone } from './crafts'
import { openAgreements, settle } from './agreements'
import { queueSignal } from './signals'
import { callName } from './content'
import { applyEffect } from './dialogue/relations'
import { itemName, withArticle } from './items'
import type { Request } from './state'
import type { World } from './world'
import { favour, gainXp } from './rules/player'

// Requests for the player (FO, chapter 14, "Verzoeken uit NPC-doelen"). They
// come up out of what happens: someone loses a knife, a fever keeps someone in
// bed, a miller cannot get sailcloth. The motor makes a plain one at once; the
// chronicler may work it out or make one from an open thread. The giver asks
// the player the next time they talk; from then on it is in the journal.
// Written quests with stages arrive with the quest system (M7).

export type RequestInput = Omit<Request, 'id' | 'created' | 'status' | 'qty'> & { qty?: number }

/** Opens a request, unless the giver already has one open. */
export function openRequest(world: World, input: RequestInput, opts: { asked?: boolean } = {}): Request | undefined {
  if (!world.alive(input.npc)) return undefined
  const same = world.state.requests.find((r) => r.npc === input.npc && r.status === 'open' && (r.item === input.item || !r.item) && r.target === input.target)
  if (same) return undefined
  const request: Request = { ...input, qty: input.qty ?? 1, id: `req_${world.state.requests.length + 1}`, created: world.now, status: 'open' }
  request.reward ??= rewardFor(world, request)
  world.state.requests.push(request)
  // A request is a signal (M10.3): what follows is content, such as going to find the stranger to ask.
  // One put to the stranger at once, in a talk (M10.5), needs nobody to go and find them.
  if (!opts.asked) queueSignal(world, { kind: 'request_open', who: [request.npc], place: world.state.npcs[request.npc]?.location ?? world.npc(request.npc).home, cause: [], belang: 1, watcher: 'rules' })
  return request
}

/** What it is worth to the giver: the price of the thing and a little more, as far as their purse allows. */
function rewardFor(world: World, request: Request): number {
  const purse = world.npcState(request.npc).money
  const value = request.item ? (world.content.items.get(request.item)?.value ?? 8) * request.qty : 0
  const wanted = request.kind === 'visit' ? 0 : request.kind === 'recover' ? Math.max(16, Math.round(value / 2)) : Math.round(value * 1.25)
  return Math.max(0, Math.min(wanted, Math.floor(purse / 3)))
}

export function openRequestsOf(world: World, npcId: string): Request[] {
  return world.state.requests.filter((r) => r.npc === npcId && r.status === 'open')
}

/** A plain name for a request the motor made. */
export function requestName(world: World, request: Request): string {
  if (request.name) return request.name
  const giver = callName(world.npc(request.npc))
  const thing = request.item ? itemName(world.content, request.item) : ''
  if (request.kind === 'recover') return `${giver}'s lost ${thing}`
  if (request.kind === 'visit' && request.target) return `A visit to ${callName(world.npc(request.target))}`
  return `${thing.charAt(0).toUpperCase()}${thing.slice(1)} for ${giver}`
}

/** What the giver says when asking, in the motor's plain words unless the chronicler wrote them. */
export function askLine(world: World, request: Request): string {
  if (request.ask) return request.ask
  const thing = request.item ? itemName(world.content, request.item, request.qty).replace(/^1 /, '') : ''
  const pay = request.reward ? ` I'd give you ${world.money(request.reward)} for your trouble.` : ''
  if (request.kind === 'recover') return `I've lost my ${thing}. If you come across it, bring it back to me?${pay}`
  if (request.kind === 'visit' && request.target) return `Would you look in on ${callName(world.npc(request.target))} for me?`
  return `I need ${request.qty > 1 ? thing : withArticle(thing)}. If you can get hold of ${request.qty > 1 ? 'them' : 'one'}, bring ${request.qty > 1 ? 'them' : 'it'} to me.${pay}`
}

/** The giver asks the player, once: the opening of a conversation. */
export function askNow(world: World, npcId: string): Request | undefined {
  const request = openRequestsOf(world, npcId).find((r) => r.asked === undefined)
  if (request) request.asked = world.now
  return request
}

/** For the voice: what the NPC wants from the player. */
export function requestLines(world: World, npcId: string): string[] {
  return openRequestsOf(world, npcId).map((r) => `YOUR REQUEST of the player${r.asked !== undefined ? ' (you have asked already)' : ''}: ${askLine(world, r)}`)
}

/** The player gives something: a request for it is done, and the giver pays. Returns what the giver says. */
export function fulfil(world: World, npcId: string, item: string, amount: number, thanks = true): string | undefined {
  const request = openRequestsOf(world, npcId).find((r) => (r.kind === 'fetch' || r.kind === 'recover' || !r.kind) && r.item === item && amount >= r.qty)
  if (!request) return undefined
  return finish(world, request, thanks)
}

/** The player went to see the target of a visit. */
export function visited(world: World, targetId: string): Request[] {
  const done = world.state.requests.filter((r) => r.status === 'open' && r.kind === 'visit' && r.target === targetId && r.asked !== undefined)
  for (const request of done) finish(world, request)
  return done
}

function finish(world: World, request: Request, thanks = true): string {
  request.status = 'done'
  request.done = world.now
  // The stranger's word to bring it (M10.3) is kept with it.
  const word = openAgreements(world, 'player').find((a) => a.by === 'player' && a.to === request.npc && ((a.kind === 'give' && a.terms.item === request.item) || (a.kind === 'errand' && a.terms.request === request.id)))
  if (word) settle(world, word, 'kept', `the stranger brought ${callName(world.npc(request.npc))} what was promised`, { quiet: true })
  gainXp(world, knob(world, 'rules.xp').request, `you did what ${callName(world.npc(request.npc))} asked`)
  // Made by the stranger's own hand, hard to make: a commission that counts as a masterwork (M10.5).
  if (request.item) commissionDone(world, request.npc, request.item)
  favour(world, 'request_done')
  const giver = world.npcState(request.npc)
  const paid = Math.min(request.reward ?? 0, giver.money)
  giver.money -= paid
  world.state.player.money += paid
  applyEffect(world, request.npc, 'affinity', 4)
  applyEffect(world, request.npc, 'trust', 3)
  // A fever mends sooner with a remedy (herbs in the Nethermarch): the giver's, or someone's in the giver's house.
  if (request.item && world.content.items.get(request.item)?.remedy) {
    const house = world.npc(request.npc).household
    for (const id of Object.keys(world.state.npcs)) {
      if (id !== request.npc && (!house || world.npc(id).household !== house)) continue
      const state = world.npcState(id)
      if (state.sickUntil !== undefined && state.sickUntil > world.now) state.sickUntil = Math.min(state.sickUntil, world.now + 6 * 60)
    }
  }
  const npc = world.npc(request.npc)
  const they = npc.pronoun === 'she' ? 'She presses' : npc.pronoun === 'he' ? 'He presses' : 'They press'
  const pay = paid ? `${they} ${world.money(paid)} into your hand.` : ''
  return thanks ? `${callName(npc)} lets out a breath. "That's a weight off. Thank you."${pay ? ` ${pay}` : ''}` : pay
}

/** Requests the player has been asked, for the journal. */
export function knownRequests(world: World): Request[] {
  return world.state.requests.filter((r) => r.asked !== undefined)
}

/** A giver who died cannot be helped any more. */
export function failRequestsOf(world: World, npcId: string): void {
  for (const request of openRequestsOf(world, npcId)) request.status = 'failed'
}
