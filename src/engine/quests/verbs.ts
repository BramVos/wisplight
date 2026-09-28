import type { Verb } from './planschema'

// One language of verbs (M8.2; design: signalen en nasleep, "Bijsturing na de
// review"): every plan, whoever made it, is steps with one verb each. This
// table says who may use which verb: fixed plans and quests in the content,
// the standard aftermath (rules), the intentions a brain may choose (only for
// themselves and their household), and the chronicler (M8.3). It replaces
// the table "Werkwoorden" of the design as the source; the reference of the
// language (reference.ts) shows it in the editor and in CHRONICLER.md.

export type Maker = 'content' | 'rules' | 'brain' | 'chronicler'

interface Permission {
  rules: boolean
  brain: boolean
  chronicler: boolean
  /** In plain words, for the editor and the chronicler's instruction. */
  text: string
  /** The standard conditions of the verb (M9.2), in plain words: they hold for every maker, checked when the step runs. */
  guard?: string
}

/** The standard conditions of the verbs that have them (M9.2), in plain words; the checks are in aftermath.ts (verbGuard). */
export const GUARDS: Record<string, string> = {
  return: 'only when they know what drove them away is over, believe their house stands, and it is not flooded, destroyed or occupied',
  feast: 'only at a place that is not flooded, destroyed or occupied',
  move_home: 'only to a place that is not flooded, destroyed or occupied',
  settle: 'only at a place that is not flooded, destroyed or occupied',
}

const all = (text: string): Permission => ({ rules: true, brain: true, chronicler: true, text })
const rules = (text: string, chronicler = false): Permission => ({ rules: true, brain: false, chronicler, text })
const only = (text: string): Permission => ({ rules: false, brain: false, chronicler: false, text })

/** Every verb and who may use it; fixed content may use them all. */
export const PERMISSIONS: Record<string, Permission> = {
  // People.
  goal: all('someone goes after a goal of the catalogue: { goal: Visit, who: $a, target: loc_x }'),
  thought: all('something stays on someone\'s mind for some days'),
  move_home: all('someone lives somewhere else from now on'),
  join_household: all('someone moves in with another and becomes one household with them'),
  leave_household: all('someone leaves their household, for a free house'),
  set_work: all('someone works somewhere, at a service, in a trade'),
  quit_work: all('someone stops working; where they served, a place comes open'),
  set_tie: all('a tie changes kind or begins, both ways'),
  end_tie: all('a tie ends'),
  expect_home: all('someone expects another home now and then'),
  feast: all('a feast at a place, with guests'),
  ask_around: all('someone asks a trader, or goes to look, whether a claim is true'),
  carry_word: all('someone walks to another to tell them what they know'),
  seek_player: all('someone goes to find the stranger, and opens a talk with a line'),
  mediate: all('someone tries to make peace between two with a grudge'),
  recall: all('someone is known again from a memory'),
  request: all('someone asks the player for a visit or a thing'),
  spread_rumour: all('someone the gate lets lie puts an untrue claim about'),
  tell: all('news with a claim, from a template'),
  regard: rules('people think better or worse of someone', true),
  hire: rules('someone without work who heard of an open place takes it'),
  chase_away: rules('someone the gates let through chases a stranger off'),
  post: rules('a notice on a board', true),
  return: rules('someone who fled or stayed away goes home', true),
  settle: rules('someone from elsewhere stays for good', true),
  form_group: rules('people band together for or against the newcomers of an area', true),
  leave: rules('some go away together for a while', true),
  close_route: rules('a trade route stops running'),
  open_route: rules('a trade route runs again'),
  order: all('a settlement sends for goods that come in some days, at twice their worth'),
  arrive: rules('newcomers come to live in a free house and take up a trade nobody works', true),
  build: rules('a settlement begins a project: a new place or a workshop, with materials from its store', true),
  place_prop: rules("a new object from a template of the content in its owner's home, with a lock as hard as its make, what it holds and hints in the owner's words; one per storyline, a few a week, and only after the chances that are there already (M10.5)", true),
  crowd: rules('a nameless group comes to a place for some days: refugees, workers; whom the player speaks to gets a name', true),
  rank: rules('a settlement takes a new rank (hamlet, village, town, city), paid from its purse; news of belang 4', true),
  // Places, groups, the market, realms.
  flee: rules('a group flees to a place', true),
  place: rules('a place changes state: flooded, damaged, occupied, normal', true),
  area_news: rules('the news of the day in an area', true),
  close: rules('a route closes', true),
  open: rules('a route opens again', true),
  market: rules('what comes in of a thing, as a share', true),
  tension: only('the tension between two realms (the chronicler only by his own bounded proposal)'),
  plan: rules('a fixed plan of the content starts'),
  // What quests do; fixed content only, a few also for the rules.
  fact: rules('a fact with three versions'),
  quest_goal: rules('an NPC walks somewhere for a quest'),
  set: rules('a flag'),
  unset: rules('a flag cleared'),
  count: only('a counting flag'),
  stamp: only('the time in a flag'),
  give: only('the player gets a thing'),
  take: only('the player loses a thing'),
  pay: only('the player gets or pays money'),
  xp: only('the player gains experience'),
  reputation: only("the player's reputation with a faction"),
  relation: only('an NPC\'s feeling for the player'),
  grievance: rules('someone has a grievance against the player'),
  clock: only('a progress clock'),
  tick: only('a progress clock moves'),
  stage: only('a quest stage'),
  outcome: only('a quest ends'),
  restore: only('someone comes back into the world'),
  move: only('someone is somewhere else at once'),
  favour: only('a patron\'s favour'),
  approve: only('companions approve'),
  text: only('a line of narration'),
  start: only('a quest starts'),
  kill: only('someone dies (never by a plan of the rules, a brain or the chronicler)'),
  learn: only('the player learns a topic'),
  player_condition: only('a condition on the player'),
  encounter: only('an encounter starts'),
  hand: only('the player hands something over'),
  send: rules('someone walks to a place and waits there'),
  vanish: only('someone leaves the world'),
  join: only('the player joins a faction'),
  seize: only('something passes to the player'),
}

/** The name of a verb in the table. */
export function verbName(verb: Verb): string {
  const v = verb as Record<string, unknown>
  if ('goal' in v) return 'who' in v ? 'goal' : 'quest_goal'
  if ('news' in v && 'area' in v) return 'area_news'
  if ('place' in v && 'state' in v) return 'place'
  return Object.keys(v).find((k) => k in PERMISSIONS) ?? Object.keys(v)[0] ?? 'unknown'
}

/** Whether a maker may use this verb. */
export function permitted(verb: Verb, maker: Maker): boolean {
  if (maker === 'content') return true
  const p = PERMISSIONS[verbName(verb)]
  return Boolean(p && p[maker])
}
