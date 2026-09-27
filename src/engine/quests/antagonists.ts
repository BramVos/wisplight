import { GameClock } from '../clock'
import type { Output } from '../commands'
import { recordFact } from '../news'
import { addClock, tickClock, type Clock } from '../rules/player'
import type { World } from '../world'
import { flags, type QuestHost } from './engine'

// The opponents do not wait for the player (Wereldboek, chapter 14): Cornelis
// measures a sector every working day, Gerrit pulls up stakes at night, the
// schout arrests peat-cutters, Cornelis hires the Goat-Riders, and the widow
// makes the fen impassable for anyone who comes with measuring chains. The
// Haakman takes revenge while the mill pumps his water. Each evening and each
// night is worked through once, in order, so a long wait or a quick save
// comes to the same world.

const DAY = 24 * 60
const EVENING = 18 * 60
const NIGHT = 2 * 60

export const SURVEY = 'survey'
export const REVENGE = 'haakman_revenge'
const MILL = 'loc_molenend_mill/de_zwaan'

/** The survey runs from the first day, whoever the player is. */
export function ensureSurvey(world: World): void {
  if (!world.content.npcs.has('npc_cornelis')) return
  addClock(world, { id: SURVEY, name: 'Survey of the Holleveen', size: 8, full: 'Cornelis sends his report to Graafhaven. In spring the digging begins.' })
}

export function antagonists(world: World, host: QuestHost): Output[] {
  const out: Output[] = []
  if (!world.content.npcs.has('npc_cornelis')) return out
  ensureSurvey(world)
  const f = flags(world)
  // Each evening at six and each night at two, once.
  for (const [key, offset, run] of [
    ['ant:evening', EVENING, evening],
    ['ant:night', NIGHT, night],
  ] as const) {
    const last = f[key] === undefined ? Math.floor((world.now - offset) / DAY) : Number(f[key])
    const now = Math.floor((world.now - offset) / DAY)
    for (let day = last + 1; day <= now; day++) {
      f[key] = day
      run(world, host, day * DAY + offset, out)
    }
    if (f[key] === undefined) f[key] = now
  }
  return out
}

function usable(world: World, id: string): boolean {
  const s = world.state.npcs[id]
  return Boolean(s && !s.dead && !s.absent && !s.following)
}

/** At the end of a working day: did the survey move on? */
function evening(world: World, host: QuestHost, t: number, out: Output[]): void {
  const f = flags(world)
  const clock = world.state.clocks?.[SURVEY] as Clock | undefined
  if (!clock || clock.done !== undefined) return
  const workday = new GameClock(t).parts.weekday !== 'Rustdag'
  const cornelis = world.state.npcs['npc_cornelis']
  const works =
    workday &&
    usable(world, 'npc_cornelis') &&
    (cornelis?.inventory['surveyors_chain'] ?? 0) > 0 &&
    !f['survey_halted'] &&
    !f['stakes_pulled_today'] &&
    (world.state.places?.['loc_route_peat_pits']?.state ?? 'normal') === 'normal'
  delete f['stakes_pulled_today']
  if (!works) {
    // The widow counts the days the chains lie still (her price for Fenna).
    if (workday || f['survey_halted']) f['survey_quiet_days'] = Number(f['survey_quiet_days'] ?? 0) + 1
    return
  }
  f['survey_quiet_days'] = 0
  const full = tickClock(world, SURVEY)
  if (clock.filled === 4) {
    recordFact(world, {
      kind: 'survey',
      about: ['npc_cornelis', 'drainage'].filter((x) => world.content.npcs.has(x) || world.content.topics.has(x)),
      place: 'loc_route_peat_pits',
      belang: 3,
      title: 'half the fen measured',
      text: { precise: 'Master Cornelis has measured half of the Holleveen for the drainage.', village: "The surveyor's measured half the fen already. Half!", far: 'The Count is having the Holleveen measured.' },
    })
  }
  if (clock.filled >= 6) f['widow_mist'] = true
  if (!full) return
  // Drainage goes on if nobody stops it: the report goes to Graafhaven.
  f['polder_coming'] = true
  f['fen_dying'] = true
  if (cornelis && !cornelis.dead) cornelis.absent = true
  recordFact(world, {
    kind: 'survey',
    about: ['drainage'].filter((x) => world.content.topics.has(x)),
    place: 'loc_route_peat_pits',
    belang: 4,
    title: 'the survey of the Holleveen finished',
    text: { precise: 'Master Cornelis finished the survey of the Holleveen and took his report to Graafhaven.', village: "The survey's done. They'll start digging in spring, God help us.", far: "The Count's survey of the Holleveen is finished." },
  })
  out.push({ kind: 'system', text: `${clock.name}: full. ${clock.full}` })
  void host
}

/** At night: stakes come out of the peat, the schout acts, the Haakman counts. */
function night(world: World, host: QuestHost, t: number, out: Output[]): void {
  const f = flags(world)
  const clock = world.state.clocks?.[SURVEY] as Clock | undefined
  const surveying = Boolean(clock && clock.done === undefined && !f['survey_halted'])

  // Gerrit pulls stakes once the survey is under way; less often once the Goat-Riders guard them.
  if (surveying && clock!.filled >= 2 && usable(world, 'npc_gerrit') && !f['gerrit_arrested']) {
    const chance = f['goat_riders_hired'] && !f['riders_quiet'] ? 0.15 : 0.3
    if (world.rng.next('antagonists') < chance) {
      f['stakes_pulled_today'] = true
      f['gerrit_pulled'] = Number(f['gerrit_pulled'] ?? 0) + 1
      recordFact(world, {
        kind: 'sabotage',
        about: ['drainage'].filter((x) => world.content.topics.has(x)),
        place: 'loc_route_peat_pits',
        belang: 2,
        title: "the surveyor's stakes pulled up",
        text: { precise: "Somebody pulled up the surveyor's stakes at the peat pits in the night.", village: "Somebody pulled all the surveyor's stakes out last night. Can't think who.", far: 'There is trouble over the drainage in the Holleveen.' },
      })
    }
  }

  // Cornelis answers by hiring the Goat-Riders to guard his stakes.
  if (Number(f['gerrit_pulled'] ?? 0) >= 1 && !f['goat_riders_hired'] && !f['riders_quiet'] && usable(world, 'npc_cornelis')) {
    f['goat_riders_hired'] = true
    recordFact(world, {
      kind: 'hired',
      about: ['npc_cornelis', 'goat_riders'].filter((x) => world.content.npcs.has(x) || world.content.topics.has(x)),
      place: 'loc_goose_common',
      belang: 3,
      title: 'the surveyor hired the Goat-Riders',
      text: { precise: 'Master Cornelis has hired the Goat-Riders to guard his stakes at night.', village: "The surveyor's paying the Goat-Riders to guard his stakes now. Imagine.", far: 'Robbers guard the Count\'s surveyor in the Holleveen.' },
    })
  }

  // The schout arrests a peat-cutter after the second night of pulled stakes.
  if (Number(f['gerrit_pulled'] ?? 0) >= 2 && !f['peat_cutter_arrested'] && Boolean(world.words.law.npc && usable(world, world.words.law.npc))) {
    const who = usable(world, 'npc_gerrit') ? 'npc_gerrit' : usable(world, 'npc_jan_visser') ? 'npc_jan_visser' : undefined
    if (who) {
      const s = world.state.npcs[who]!
      s.stayAt = { where: (world.words.law.office ?? world.npc(who).home), until: t + 2 * DAY }
      s.plan = []
      s.planGoal = undefined
      s.busyUntil = world.now
      s.activity = 'locked up by the schout'
      f['peat_cutter_arrested'] = who
      if (who === 'npc_gerrit') f['gerrit_arrested'] = true
      const name = world.npc(who).name
      recordFact(world, {
        kind: 'arrest',
        about: [who, ...(world.words.law.npc ? [world.words.law.npc] : [])],
        place: (world.words.law.office ?? world.npc(who).home),
        belang: 3,
        title: `${name} arrested`,
        text: { precise: `Schout Everhard arrested ${name} for pulling up the surveyor's stakes.`, village: `The schout's locked up ${name}! Over the stakes.`, far: 'A peat-cutter was arrested in the Holleveen.' },
      })
    }
  }
  if (f['gerrit_arrested'] && (world.state.npcs['npc_gerrit']?.stayAt?.until ?? 0) <= world.now) delete f['gerrit_arrested']

  // The Haakman counts every second night the mill pumps his water.
  const pumping = world.state.objects[MILL]?.['broken'] === false
  if (pumping && !f['haakman_at_peace'] && !f['haakman_revenge_done'] && Math.floor(t / DAY) % 2 === 0) {
    addClock(world, { id: REVENGE, name: "The Haakman's revenge", size: 4, full: 'The water rises against the dyke at Oude Zijl.' })
    if (tickClock(world, REVENGE)) {
      f['haakman_revenge_done'] = true
      host.plan?.('dyke_breach')
      out.push({ kind: 'system', text: "The Haakman's revenge: full. The water rises against the dyke at Oude Zijl." })
    }
  }
}

/** The widow's mist: nobody gets through the Kattenbroek carrying measuring chains. */
export function widowTurnsBack(world: World, to: string): string | undefined {
  if (!flags(world)['widow_mist'] || flags(world)['fen_without_keeper']) return undefined
  if (world.content.locations.get(to)?.area !== 'kattenbroek') return undefined
  const carries = Object.keys(world.state.player.inventory).some((id) => world.content.items.get(id)?.tags.includes('survey'))
  return carries ? 'Mist comes up out of the reeds, thick as wool. You walk on and on, and come out where you started, with the chains heavy on your back.' : undefined
}
