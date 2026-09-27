import { callName } from '../content'
import { itemName, withArticle } from '../items'
import { meet, recordFact } from '../news'
import { questsOf } from '../life'
import { dangerOf } from '../social/companions'
import { shiftBond, setMood } from '../social/deeds'
import { investigated, lawAt, type Crime } from '../social/crime'
import type { Step } from '../state'
import type { World } from '../world'
import { remember } from './execute'

// The rest of the goal catalogue (FO, chapter 7, "De doelcatalogus"; M7.2):
// what an NPC does when it gets where it was going. The planner walks there;
// the act is the moment itself, carried out by the motor with fixed effects:
// money and goods change hands, bonds shift, news is told, a crime is seen or
// not. The AI only chooses the goal; the gates in allowAct say whether it may.

export type ActKind = 'sell' | 'deliver' | 'help' | 'spread' | 'court' | 'celebrate' | 'investigate' | 'report' | 'confront' | 'recruit' | 'steal' | 'sabotage' | 'harm' | 'meet' | 'follow'

export type ActStep = Extract<Step, { kind: 'act' }>

const DAY = 24 * 60

/** Everyone else in the place who could see it: people, not the actor, not someone asleep. */
function onlookers(world: World, npcId: string, place: string, except: string[] = []): string[] {
  const player = world.state.player.location === place ? ['player'] : []
  return [
    ...player,
    ...Object.keys(world.state.npcs).filter((id) => {
      const s = world.state.npcs[id]!
      return id !== npcId && !except.includes(id) && s.location === place && !s.dead && !s.absent && !s.note && s.activity !== 'asleep'
    }),
  ]
}

function event(world: World, npcId: string, text: string): void {
  world.emit('act', world.npcState(npcId).location, world.say(text, npcId), npcId)
}

/** The moment itself. Returns false when it cannot be done here and now. */
export function performAct(world: World, npcId: string, step: ActStep): boolean {
  const me = world.npcState(npcId)
  const here = me.location
  const other = step.target ? world.state.npcs[step.target] : undefined
  const withOther = (fn: () => void) => {
    if (!other || other.dead || other.location !== here) return false
    fn()
    return true
  }
  switch (step.act) {
    case 'sell': {
      const item = step.item!
      const qty = me.inventory[item] ?? 0
      const shop = world.location(here).services.find((s) => s.buys.includes(item))
      if (!qty || !shop) return false
      const price = world.content.items.get(item)?.value ?? 1
      me.inventory[item] = 0
      delete me.inventory[item]
      me.money += price * qty
      const stock = world.stock(here, shop.id)
      stock[item] = (stock[item] ?? 0) + qty
      event(world, npcId, `{name} sells ${itemName(world.content, item, qty)} over the counter.`)
      return true
    }
    case 'deliver':
      return withOther(() => {
        const item = step.item!
        if (!me.inventory[item]) return
        me.inventory[item]! -= 1
        if (!me.inventory[item]) delete me.inventory[item]
        other!.inventory[item] = (other!.inventory[item] ?? 0) + 1
        const request = world.state.requests.find((r) => r.npc === step.target && r.item === item && r.status === 'open')
        if (request) request.status = 'done'
        shiftBond(world, step.target!, npcId, 8, 5)
        event(world, npcId, `{name} hands ${callName(world.npc(step.target!))} ${withArticle(itemName(world.content, item, 1))}.`)
      })
    case 'help':
      return withOther(() => {
        shiftBond(world, step.target!, npcId, 5, 4)
        remember(world, step.target!, `${callName(world.npc(npcId))} came to give me a hand.`)
      })
    case 'meet':
      return withOther(() => {
        shiftBond(world, npcId, step.target!, 2)
        shiftBond(world, step.target!, npcId, 2)
        meet(world, npcId, step.target!)
      })
    case 'court':
      return withOther(() => {
        shiftBond(world, npcId, step.target!, 4, 2)
        shiftBond(world, step.target!, npcId, world.npc(step.target!).personality.warmth >= 0 ? 4 : 1, 1)
        event(world, npcId, `{name} walks a while with ${callName(world.npc(step.target!))}, closer than friends do.`)
      })
    case 'spread': {
      for (const id of onlookers(world, npcId, here)) if (id !== 'player') meet(world, npcId, id)
      return true
    }
    case 'celebrate': {
      if (me.money >= 2) me.money -= 2
      setMood(world, npcId, 6, 12, 'a good evening')
      event(world, npcId, '{name} raises a tankard to anyone who will drink with {them}.')
      return true
    }
    case 'investigate': {
      // Looking round a place: the facts that happened here come to light for them.
      const heard = ((world.state.news ??= { seq: 0, facts: [], heard: {} }).heard[npcId] ??= {})
      for (const fact of world.state.news.facts) {
        if (fact.place === here && !heard[fact.id] && world.now - fact.t < 7 * DAY) heard[fact.id] = { level: 2, reliability: 0.9, from: 'witness', t: world.now }
      }
      remember(world, npcId, `I went to look round ${world.location(here).name} for myself.`)
      // The schout looking into a theft nobody saw (social/crime.ts).
      investigated(world, npcId, here)
      return true
    }
    case 'report': {
      // A witness tells the law what they saw (FO, chapter 8).
      const crime = unreported(world, npcId)[0]
      if (!crime) return false
      crime.reported.push(npcId)
      const thief = crime.offender
      if (thief && world.state.npcs[thief] && !world.state.npcs[thief]!.dead) {
        // Someone of the village caught out: a day in the schout's cell.
        const s = world.state.npcs[thief]!
        s.stayAt = { where: 'loc_schout_house', until: world.now + DAY }
        s.plan = []
        s.planGoal = undefined
        s.activity = 'locked up by the schout'
      }
      event(world, npcId, `{name} tells what {they} saw, in a low voice, and points.`)
      return true
    }
    case 'confront': {
      if (step.target === 'player') return false
      return withOther(() => {
        shiftBond(world, npcId, step.target!, -6)
        shiftBond(world, step.target!, npcId, -8)
        event(world, npcId, `{name} has hard words with ${callName(world.npc(step.target!))}, and does not lower {their} voice.`)
        recordFact(world, { kind: 'quarrel', about: [npcId, step.target!], place: here, belang: 1, title: `${callName(world.npc(npcId))} and ${callName(world.npc(step.target!))} quarrelling`, text: { precise: `${callName(world.npc(npcId))} and ${callName(world.npc(step.target!))} quarrelled at ${world.location(here).name}.`, village: `${callName(world.npc(npcId))} and ${callName(world.npc(step.target!))} were at it again. Shouting!`, far: 'Neighbours quarrelled.' }, witnesses: onlookers(world, npcId, here, [step.target!]).filter((w) => w !== 'player') })
      })
    }
    case 'recruit':
      return withOther(() => {
        const s = other!
        s.goals = s.goals.filter((g) => g.id !== `help_${npcId}`)
        s.goals.push({ id: `help_${npcId}`, type: 'Help', target: npcId, priority: 0.8, source: 'ai', created: world.now, until: world.now + DAY })
        remember(world, step.target!, `${callName(world.npc(npcId))} asked me to lend a hand.`)
      })
    case 'steal': {
      const item = step.item!
      const shop = world.location(here).services.find((s) => (world.stock(here, s.id)[item] ?? 0) > 0)
      if (!shop) return false
      const seen = onlookers(world, npcId, here).filter((id) => id === 'player' || world.rng.next('crime') < 0.7)
      world.stock(here, shop.id)[item]! -= 1
      me.inventory[item] = (me.inventory[item] ?? 0) + 1
      if (seen.length) caught(world, npcId, 'theft', here, seen, `stealing ${withArticle(itemName(world.content, item, 1))}`, shop.provider)
      else {
        // Nobody saw: the loss is noticed later, and the rumour may name the wrong person.
        const crimes = (world.state.crimes ??= [])
        crimes.push({ id: `crime_${crimes.length + 1}`, kind: 'theft', t: world.now, place: here, victim: shop.provider, item, offender: npcId, value: world.basePrice(item), grave: false, witnesses: [], reported: [], law: lawAt(world, here), fine: 0, unseen: true, discoverAt: world.now + 90 })
      }
      return true
    }
    case 'sabotage': {
      const [location, object] = (step.target ?? '').split('/')
      if (location !== here || !object) return false
      const seen = onlookers(world, npcId, here).filter((id) => id === 'player' || world.rng.next('crime') < 0.7)
      if (seen.length) {
        caught(world, npcId, 'theft', here, seen, `damaging the ${object.replace(/_/g, ' ')}`)
        return true
      }
      world.objectState(location, object)['broken'] = true
      recordFact(world, { kind: 'sabotage', about: [], place: here, belang: 2, title: `the ${object.replace(/_/g, ' ')} damaged`, text: { precise: `Someone damaged the ${object.replace(/_/g, ' ')} at ${world.location(here).name}.`, village: `Somebody's broken the ${object.replace(/_/g, ' ')}! In the night, they say.`, far: 'There was mischief in a village.' } })
      return true
    }
    case 'harm':
      return withOther(() => {
        const mine = world.npc(npcId).personality.courage + world.rng.int('crime', 1, 20)
        const theirs = world.npc(step.target!).personality.courage + world.rng.int('crime', 1, 20)
        const loser = mine >= theirs ? step.target! : npcId
        world.state.npcs[loser]!.wounds = (world.state.npcs[loser]!.wounds ?? 0) + 1
        shiftBond(world, step.target!, npcId, -25)
        const seen = onlookers(world, npcId, here, [step.target!])
        caught(world, npcId, 'assault', here, seen.length ? seen : [step.target!], `striking ${callName(world.npc(step.target!))}`, step.target)
      })
    case 'follow':
      return true
  }
}

/** A villager seen doing wrong: the witnesses think less of them, it becomes news, and the lawful may report it. */
function caught(world: World, npcId: string, kind: Crime['kind'], place: string, seen: string[], doing: string, victim?: string): void {
  const name = callName(world.npc(npcId))
  const witnesses = seen.filter((id) => id !== 'player')
  for (const w of witnesses) {
    shiftBond(world, w, npcId, -15, -15)
    remember(world, w, `I saw ${name} ${doing}.`)
  }
  const crimes = (world.state.crimes ??= [])
  crimes.push({ id: `crime_${crimes.length + 1}`, kind, t: world.now, place, ...(victim ? { victim } : {}), offender: npcId, value: 0, grave: kind !== 'theft', witnesses, reported: [], law: lawAt(world, place), fine: 0 })
  recordFact(world, { kind: 'crime', about: [npcId, ...(victim ? [victim] : [])], place, belang: kind === 'theft' ? 2 : 3, juice: 0.9, title: `${name} caught ${doing}`, text: { precise: `${name} was seen ${doing} at ${world.location(place).name}.`, village: `You'll never guess. ${name}, ${doing}! In broad daylight.`, far: 'Someone in a village was caught doing wrong.' }, witnesses })
  event(world, npcId, `{name} is seen ${doing}, and knows it.`)
}

/** Crimes an NPC saw and has not told the law about. */
export function unreported(world: World, npcId: string): Crime[] {
  return (world.state.crimes ?? []).filter((c) => c.witnesses.includes(npcId) && !c.reported.includes(npcId) && world.now - c.t < 3 * DAY)
}

/**
 * The gates of the catalogue (FO, chapter 7): who may investigate, report,
 * steal, sabotage or harm. A reason is returned when the goal is refused.
 */
export function allowAct(world: World, npcId: string, act: ActKind | 'flee', target?: string): string | undefined {
  const npc = world.npc(npcId)
  const me = world.npcState(npcId)
  switch (act) {
    case 'investigate':
      return npc.personality.courage >= -1 || (target && dangerOf(world, target, npcId) <= 1) ? undefined : 'too frightened to go and look'
    case 'report':
      if ((npc.values['law'] ?? 0) < 0) return 'does not go to the law'
      return unreported(world, npcId).length ? undefined : 'has seen nothing to report'
    case 'steal':
    case 'sabotage': {
      if (npc.personality.honesty > -1) return 'too honest'
      const need = me.money < 16 || me.needs.hunger < 30
      const greed = npc.quirks.includes('greedy') || (npc.values['wealth'] ?? 0) >= 2
      const conflict = act === 'sabotage' && (npc.quirks.includes('hates_the_count') || (npc.values['tradition'] ?? 0) >= 2)
      return need || greed || conflict ? undefined : 'has no reason to'
    }
    case 'harm': {
      if (!target || !world.content.npcs.has(target)) return 'no one to harm'
      const victim = world.npc(target)
      if (victim.child) return 'never a child'
      if (questsOf(world, target).length) return 'someone with a part in a quest'
      if ((world.state.companions ?? []).some((c) => c.npc === target)) return "the player's companion"
      const bond = world.state.bonds?.[npcId]?.[target]?.affinity ?? 0
      return bond <= -60 || world.state.npcs[target]?.grievance ? undefined : 'not enough hatred'
    }
    case 'court': {
      if (!target || !world.content.npcs.has(target)) return 'no one to court'
      if (npc.child || world.npc(target).child) return 'not with a child'
      const bond = world.state.bonds?.[npcId]?.[target]?.affinity ?? 0
      return bond >= 10 ? undefined : 'hardly knows them'
    }
    default:
      return undefined
  }
}
