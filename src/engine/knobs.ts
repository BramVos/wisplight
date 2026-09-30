import type { WorldDef } from './content'

// The knobs of a world (M10.20; Bram, 28 September 2026: "één laag voor
// knoppen"): every rule of play that may differ per world, in one place, with
// what it does in plain words, its default, its bounds and its unit. A world
// sets any of them in world.yaml under `knobs:`; the code reads them with
// knob(world, id) and never a constant of its own. The editor's tab Knobs,
// the contract and docs/KNOBS.md are made from this list. The defaults are the
// values the game had before, so a world that sets nothing plays as before.

type Scalar = { about: string; unit: string; default: number; min: number; max: number; from: string }
type Table = { about: string; unit: string; default: Record<string, number>; min: number; max: number; from: string; keys: 'fixed' | 'open' }
export type KnobDef = Scalar | Table

const n = (about: string, unit: string, def: number, min: number, max: number, from: string): Scalar => ({ about, unit, default: def, min, max, from })
const t = <T extends Record<string, number>>(about: string, unit: string, def: T, min: number, max: number, from: string, keys: 'fixed' | 'open' = 'fixed'): Table & { default: T } => ({ about, unit, default: def, min, max, from, keys })

export const KNOBS = {
  // ---- the clock (M10.28: the world's own pace, which the player turns per game on the frames screen)
  'clock.seconds_per_minute': n('How many real seconds a game minute lasts while the clock runs: 1 is a day in 24 minutes, 4 a day in an hour and a half, 8 a day in three hours. Sleeping, waiting and travelling jump.', 'seconds', 4, 1, 8, 'frames.ts'),
  // ---- a talk
  'talk.max_effect': n('How much one talk may change how someone feels about the stranger, up or down, in all.', 'points', 5, 0, 30, 'dialogue/conversation.ts'),
  'talk.max_turns': n('A talk ends after this many turns, however much it is about.', 'turns', 20, 3, 100, 'dialogue/conversation.ts'),
  'talk.max_claims': n('How many things the stranger says are so can count as claims in one talk.', 'claims', 3, 0, 20, 'dialogue/conversation.ts'),
  'talk.max_offers': n('How many offers (to lead, to lend, to teach) a speaker weighs in one reply.', 'offers', 5, 1, 20, 'dialogue/offers.ts'),
  'talk.far_places': n('How many far places the voice may name in a game, before it only uses names it was given.', 'places', 50, 0, 500, 'dialogue/conversation.ts'),
  'talk.persuaded': n('What a persuasion that worked adds to the word it carries.', 'weight', 40, 0, 100, 'dialogue/conversation.ts'),
  'talk.support_dc': n('How much easier a persuasion is for each person who stands by it.', 'DC', 4, 0, 10, 'dialogue/conversation.ts'),
  'talk.facts_per_day': n('How many things said in talks become facts that go round, in a day.', 'facts', 3, 0, 20, 'dialogue/aftertalk.ts'),
  'talk.words': t('How many words a reply may have, by how much the moment asks for.', 'words', { short: 15, normal: 50, explain: 90, story: 180 }, 5, 400, 'dialogue/acts.ts'),
  'talk.kept_lines': n('How many lines of earlier talks the game keeps per person, for the talk window, the journal and the condition talked (never for a talk\'s model call; the step Stories reads the latest game\'s); an older talk leaves whole.', 'lines', 200, 0, 1000, 'engine.ts'),
  'talk.party_words': n('How many words each companion says when the stranger asks the group.', 'words', 25, 5, 80, 'dialogue/party.ts'),
  // ---- what people believe and know
  'belief.openness': t('How open a place is to a stranger, by the kind of place: 0 closed, 1 open.', 'share', { city: 0.9, town: 0.8, inn: 0.7, village: 0.5, route: 0.5, hamlet: 0.3, wilderness: 0.2 }, 0, 1, 'belief.ts', 'open'),
  'belief.in_person': n('What someone who comes to tell you to your face adds to their word.', 'weight', 25, 0, 100, 'belief.ts'),
  'belief.saw_it': n('What an eyewitness adds to their word.', 'weight', 20, 0, 100, 'belief.ts'),
  'belief.backed': n('What someone adds who stands by a claim.', 'weight', 15, 0, 100, 'belief.ts'),
  'belief.seen_days': n('How far back the state of a place can still be seen to be what was said.', 'days', 30, 1, 365, 'belief.ts'),
  'fame.known_by_all': n('From this fame on, everyone knows at least the name.', 'fame', 3, 0, 5, 'dialogue/knowledge.ts'),
  // ---- people
  'people.child_range_minutes': n('How far from home a child may go, in minutes of walking.', 'minutes', 45, 0, 600, 'dialogue/offers.ts, social/invite.ts'),
  'people.memory_below': n('Below this familiarity, someone is only a memory.', 'familiarity', 10, 0, 100, 'forgetting.ts'),
  'people.long_absence_days': n('Apart this long, meeting again is a meeting after a long absence.', 'days', 60, 1, 1000, 'forgetting.ts'),
  'people.wait_hours': n('How long someone waits for a thing before giving up.', 'hours', 3, 0.5, 48, 'npc/execute.ts'),
  'people.goals_per_day': n('How many times a day a person may take up something new of their own.', 'goals', 6, 0, 50, 'npc/goals.ts'),
  'people.goals_at_once': n('How many goals of their own a person pursues at once.', 'goals', 3, 1, 10, 'npc/goals.ts'),
  'people.goal_rest_hours': n('How long a person rests before choosing a goal of their own again.', 'hours', 5, 0, 48, 'npc/goals.ts'),
  'people.model_km': n('How near the player a person asks the model for their choices; further off they choose by the rules, unless they are in the player\'s area, an open storyline or a plan names them.', 'km', 1.5, 0, 8, 'npc/goals.ts'),
  'people.ask_again_days': n('How soon a person asks themselves again what they want, when nothing new happened.', 'days', 3, 0.25, 30, 'npc/brain.ts'),
  'people.far_km': n('Beyond this, a newcomer is from far off.', 'km', 30, 1, 1000, 'signals.ts'),
  'people.seen_in_a_crowd': n('How many of those around someone they notice in a quarter of an hour.', 'people', 24, 1, 200, 'simulation.ts'),
  'needs.decay': t('How fast each need grows, per hour.', 'points an hour', { hunger: 3, rest: 3, social: 1, safety: 0, work: 2, faith: 0.25 }, 0, 20, 'simulation.ts'),
  'signals.per_day': n('How many signals the people take up in a day, in all; the rest get the standard aftermath.', 'signals', 20, 0, 500, 'npc/goals.ts'),
  // ---- agreements and offers
  'agreements.message_days': n('How long a message carried to someone has to arrive.', 'days', 2, 0.25, 30, 'agreements.ts'),
  'agreements.lead_waits_minutes': n('How long someone who leads the stranger waits at a place for them.', 'minutes', 60, 5, 600, 'agreements.ts'),
  'agreements.lead_stays_minutes': n('How long a leader stays with the person they brought the stranger to.', 'minutes', 45, 0, 600, 'agreements.ts'),
  'agreements.lead_gives_up_turns': n('How many turns a leader waits for a stranger who does not follow.', 'turns', 4, 1, 30, 'agreements.ts'),
  'agreements.anger_days': n('How long an attack that does not come to it stays on someone\'s mind.', 'days', 3, 0.25, 60, 'agreements.ts'),
  'agreements.meet_early_minutes': n('A meeting counts from this long before its time.', 'minutes', 30, 0, 240, 'agreements.ts'),
  'agreements.meet_late_minutes': n('A meeting counts until this long after its time.', 'minutes', 60, 0, 600, 'agreements.ts'),
  'amends.fresh_days': n('How long a let-down is fresh enough to talk about and make good.', 'days', 30, 1, 365, 'amends.ts'),
  'offers.lend_days': n('How long a thing is lent for.', 'days', 3, 1, 60, 'dialogue/offers.ts'),
  'offers.request_days': n('How long the stranger has to bring what someone asked for, once promised.', 'days', 3, 1, 60, 'dialogue/offers.ts'),
  'offers.danger_days': n('How long a danger stays pressing, unless word comes that it is over.', 'days', 7, 1, 90, 'dialogue/offers.ts'),
  'offers.lesson_price': n('What a lesson costs, per rank the stranger already has.', 'smallest coin', 16, 0, 100000, 'dialogue/offers.ts'),
  'gestures.at_most': n('How often the same small gesture is given to the stranger.', 'times', 2, 1, 20, 'gestures.ts'),
  // ---- crafts, economy
  'crafts.mastered_after': n('Past this many successes a recipe is routine and teaches no more.', 'successes', 5, 1, 50, 'crafts.ts'),
  'crafts.lesson_practice': n('The practice a day\'s lesson from a master gives.', 'practice', 4, 0, 20, 'crafts.ts'),
  'crafts.fail_cooldown': t('After so many failed tries in a row at the same work, it rests so many minutes before the next (M10.29); 0 tries is off.', 'tries / minutes', { after: 0, minutes: 0 }, 0, 1440, 'commands.ts'),
  'crafts.lessons': n('The lessons a pupil needs, on as many days, before they can do it on their own.', 'lessons', 3, 1, 20, 'outcomes.ts'),
  'economy.max_load': n('What the stranger can carry in one go, in units of the goods.', 'units', 20, 1, 500, 'economy/haul.ts'),
  'economy.ledger_hour': n('The hour a settlement counts its goods, before the counters fill.', 'hour', 5, 0, 23, 'economy/ledger.ts'),
  'growth.new_faction_days': n('Days that must pass between two factions formed in play in a world: at most one a season.', 'days', 91, 7, 3650, 'growth/founded.ts'),
  'lands.exchange_cut': n('What the changer keeps when the stranger\'s money is changed at a border into another land\'s coins.', 'share', 0.02, 0, 0.5, 'borders.ts'),
  'tides.decay': n('What a great line loses of its pressure each day that nothing pushes it: the world calms.', 'share', 0.02, 0, 0.5, 'tides.ts'),
  'tides.cooldown_days': n('Days after a great event before the same line may break again (a line may set its own).', 'days', 91, 7, 3650, 'tides.ts'),
  'economy.days_of_use': n('How many days of use of a good a settlement aims to hold, when it names no keep.', 'days', 3, 1, 60, 'economy/ledger.ts'),
  // ---- the world's stories
  'stories.per_day': t('Small stories expected per day, by the tempo of the game.', 'stories', { calm: 0.4, normal: 0.8, dramatic: 1.6 }, 0, 10, 'stories.ts'),
  'stories.rising_weight': n('Fewer small stories a day for every storyline rising or in crisis.', 'share', 0.2, 0, 1, 'stories.ts'),
  'storylines.open_days': n('A storyline that takes nothing new for this long goes dormant.', 'days', 14, 1, 365, 'storylines.ts'),
  'tides.mediation_dc': n('How hard it is to bring the two sides of a great line to one table: the DC of the Persuade and Insight checks.', 'DC', 14, 5, 30, 'tidemediation.ts'),
  'story.signals_per_night': n('How many signals the chronicler takes in one night run, the most important first; the rest wait a night.', 'signals', 12, 1, 50, 'planning.ts'),
  'story.urgent_belang': n('From what belang news calls the chronicler by day instead of in the night run; at most once a game day.', 'belang', 4, 3, 6, 'storylines.ts'),
  'story.hooks_per_week': n('How many hooks at least reach the stranger near where they are in a week: a request, a visitor, a tiding, a letter; the night round or the rule brings one when none came for so long (0: never).', 'hooks', 2, 0, 14, 'pulse.ts'),
  'story.quiet_ladder': t('The chance of a spark on a quiet night (one unexpected thing that follows from the open storylines), by how many quiet nights came in a row; a step further when the stranger\'s quest stands still.', 'share', { first: 0.125, second: 0.25, third: 0.5, fourth: 1 }, 0, 1, 'spark.ts'),
  'story.stuck_days': n('After this many days without the stranger\'s quest moving on, a quiet night counts a step further on the ladder of the spark.', 'days', 3, 1, 60, 'spark.ts'),
  'story.hook_days': n('How long something new a night brought lies waiting for the player in the think play mode, when they did not take it up.', 'days', 7, 1, 60, 'modes.ts'),
  'story.climaxes': n('How many storylines may be in crisis at once.', 'storylines', 2, 1, 10, 'chronicler.ts'),
  'story.quests_active': n('How many quests may run at once in a region, beside the main line: one that would begin above it waits till one ends.', 'quests', 2, 1, 10, 'quests/engine.ts'),
  'sketches.per_day': n('How many people named in passing may come to be in a day.', 'people', 2, 0, 20, 'sketches.ts'),
  'sketches.per_speaker': n('How many people one speaker may name in passing.', 'people', 3, 0, 20, 'sketches.ts'),
  'sketches.per_area_season': n('How many people named in passing an area may have in a season.', 'people', 6, 0, 100, 'sketches.ts'),
  'props.per_week': n('How many new objects the chronicler may place in a week of play.', 'objects', 3, 0, 50, 'props.ts'),
  'moments.tidings_belang': n('A tiding is a fact at least this big.', 'belang', 4, 1, 5, 'moments.ts'),
  'returning.max_lines': n('How many lines say what changed since the stranger was last at a place.', 'lines', 3, 0, 10, 'returning.ts'),
  'legacy.keep_belang': n('Years later, facts at least this big are kept as legend.', 'belang', 4, 1, 5, 'legacy.ts'),
  'aftermath.marks_per_place': n('How many lasting marks show at one place; the oldest go first.', 'marks', 3, 0, 20, 'aftermath.ts'),
  'map.fresh_days': n('How long what the stranger saw stays fresh on the map.', 'days', 3, 1, 60, 'map/travel.ts'),
  'chatter.greet_every_hours': n('A pair greets each other at most once in this many hours.', 'hours', 3, 0.25, 48, 'chatter.ts'),
  // ---- the rules of play
  'rules.xp': t('Experience for finding things out.', 'experience', { place: 10, area: 30, secret: 40, request: 60, lore: 10 }, 0, 1000, 'rules/player.ts'),
  'rules.quest_xp': t('Experience for a quest that is solved, by its kind.', 'experience', { main: 400, personal: 250, conflict: 300, threat: 200, mystery: 200, bargain: 150, discovery: 150, social: 150, trial: 200, request: 100 }, 0, 5000, 'quests/engine.ts', 'open'),
  'rules.free_boosts': n('Attribute boosts a new character chooses freely.', 'boosts', 3, 0, 10, 'rules/character.ts'),
  'rules.start_cap': n('The highest an attribute may be at the start.', 'attribute', 4, 1, 10, 'rules/character.ts'),
  'rules.attribute_cap': n('The highest an attribute may ever be.', 'attribute', 6, 1, 20, 'rules/character.ts'),
  'rules.max_companions': n('How many companions may travel with the stranger.', 'companions', 3, 0, 10, 'social/companions.ts'),
  'rules.fled_at': n('How far a fleeing fighter must get to be gone.', 'steps', 4, 1, 20, 'combat/combat.ts'),
  'rules.shield_hardness': n('What a raised shield takes off one blow a round.', 'damage', 3, 0, 20, 'combat/combat.ts'),
  'rules.brawl_rounds': n('How many rounds a brawl lasts at most.', 'rounds', 12, 1, 100, 'social/brawl.ts'),
  'rules.ailment_dc': t('How hard an ailment is to treat, by ailment.', 'DC', { fen_fever: 15, sickened: 13, bleeding: 12, wounds: 12, sickness: 15 }, 1, 40, 'skills.ts', 'open'),
  'rules.lock_dc': t('How hard a lock is to pick, by the work that went into it.', 'DC', { crude: 10, common: 14, good: 17, fine: 20, masterwork: 24 }, 1, 40, 'social/access.ts'),
} as const satisfies Record<string, KnobDef>

export type KnobId = keyof typeof KNOBS
type Def<K extends KnobId> = (typeof KNOBS)[K]
export type KnobValue<K extends KnobId> = Def<K> extends { default: infer D } ? (D extends number ? number : { [P in keyof D]: number } & Record<string, number>) : never

/**
 * The value of a knob in this world (M10.20): its own from world.yaml
 * `knobs:`, or the default. A table takes the world's entries over the
 * default's, so a world may change one row.
 */
export function knob<K extends KnobId>(world: { content: { world: Pick<WorldDef, 'knobs'> }; state?: { knobs?: Record<string, number> } }, id: K): KnobValue<K> {
  const def = KNOBS[id] as KnobDef
  // A part of a world without its frame (the character screen's) plays by the defaults.
  const own = world.content.world?.knobs?.[id]
  // A game may set a knob of its own over the world's (M10.24: the dials of the frames screen).
  const game = world.state?.knobs?.[id]
  if (typeof def.default === 'number') return (typeof game === 'number' ? game : typeof own === 'number' ? own : def.default) as unknown as KnobValue<K>
  return { ...def.default, ...(own && typeof own === 'object' ? own : {}) } as unknown as KnobValue<K>
}

/** What is wrong with a world's knobs (M10.20): an unknown knob, a value of the wrong shape, or out of bounds. */
export function knobProblems(knobs: Record<string, number | Record<string, number>> | undefined): string[] {
  const problems: string[] = []
  for (const [id, value] of Object.entries(knobs ?? {})) {
    const def = (KNOBS as Record<string, KnobDef>)[id]
    if (!def) {
      problems.push(`world.knobs: ${id} is no knob; the knobs are listed in docs/KNOBS.md`)
      continue
    }
    const bound = (v: number, what: string) => {
      if (v < def.min || v > def.max) problems.push(`world.knobs: ${what} is ${v}, but must be from ${def.min} to ${def.max} (${def.unit})`)
    }
    if (typeof def.default === 'number') {
      if (typeof value !== 'number') problems.push(`world.knobs: ${id} is one number (${def.unit})`)
      else bound(value, id)
    } else if (typeof value !== 'object') problems.push(`world.knobs: ${id} is a table of ${Object.keys(def.default).join(', ')}`)
    else
      for (const [key, v] of Object.entries(value)) {
        if ((def as Table).keys === 'fixed' && !(key in def.default)) problems.push(`world.knobs: ${id}.${key} is not one of ${Object.keys(def.default).join(', ')}`)
        else bound(v, `${id}.${key}`)
      }
  }
  return problems
}

/** The knobs in short, for the chronicler when the designer asks for a rule of play to be otherwise ("talks last longer here"). */
export function knobsSummary(): string {
  return [
    'KNOBS (world.yaml `knobs:`, by id; only when the designer asks for a rule of play to be otherwise):',
    ...Object.entries(KNOBS as Record<string, KnobDef>).map(([id, k]) => `- ${id} (${k.unit}; ${typeof k.default === 'number' ? k.default : Object.entries(k.default).map(([r, v]) => `${r} ${v}`).join(', ')}; ${k.min} to ${k.max}): ${k.about}`),
  ].join('\n')
}
