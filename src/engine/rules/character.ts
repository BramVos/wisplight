import { knob } from '../knobs'
import type { Content, Item } from '../content'
import { ATTRIBUTES, WHEN, type Ability, type Ancestry, type Attribute, type Bonus, type ClassDef, type Effect, type Rules, type Save, type Talent } from './schema'

// The player character (FO, chapter 11): ancestry, background and class,
// four attributes, skills with ranks, talents from three trees, levels 1 to
// 10, a patron. Everything the fight and the checks need is derived here from
// the rules in the content, so balance is a matter of data.

export type Attributes = Record<Attribute, number>
export type When = (typeof WHEN)[number]

export interface Character {
  name: string
  /** How people speak of you, and who may fall for you (FO, chapter 8, "Romance"). */
  pronoun?: 'she' | 'he' | 'they'
  ancestry: string
  background: string
  class: string
  level: number
  /** Experience in total; level n is reached at (n - 1) x xp_per_level. */
  xp: number
  attributes: Attributes
  /** Rank per skill: 0 untrained, 1 trained, 2 expert, 3 master. */
  ranks: Record<string, number>
  /** Skill points not yet spent (two each level). */
  skillPoints: number
  /** Practice marks per skill: three make the next raise cost half (after DCSS). */
  practice: Record<string, number>
  /** Class talents, the core ability first. */
  talents: string[]
  /** General talents, the background's first. */
  general: string[]
  hp: number
  /** Lasting conditions outside a fight: Sickened, Fen Fever, Cursed, Catform. */
  conditions: Record<string, number>
  /** What the character holds and wears. */
  gear: { weapon?: string; armour?: string; shield?: string }
  patron?: { id: string; favour: number; since: number; prayed?: number }
  /** When a blessing that comes back after a while was last used (rules/blessings.ts). */
  blessingsUsed?: Record<string, number>
  /** Times the character died and came back on the Way of the Grey Rider. */
  deaths: number
  /** The Rider's Mark: -10% hit points until a rite for the dead. */
  mark?: boolean
  /** Abilities used today, by id, with the day they were used. */
  usedToday?: Record<string, number>
  /** Made by the player (CREATE), not the ready-made traveller. */
  made?: boolean
  /** How they look, from the making (M10.4). */
  appearance?: string
  /** Minutes of rest not yet counted towards an hour's healing. */
  restMinutes?: number
}

export interface CreationChoice {
  name: string
  pronoun?: 'she' | 'he' | 'they'
  /** How they look, in the player's own words (M10.4), for LOOK ME and the sheet. */
  appearance?: string
  ancestry: string
  background: string
  class: string
  /** Free +1s: three, plus what the ancestry lets you choose. At most +4 at the start. */
  boosts: Attribute[]
  /** Extra trained skills: one, plus one for every background skill the class already trains. */
  skills: string[]
  /** The first class talent, from the first row of a tree. */
  talent: string
}

/** A talent at row r of a tree opens at this level. */
export const ROW_LEVEL = [1, 3, 5, 7]
/** Weapons do one die more from these levels (weapon training). */
export const WEAPON_DICE_AT = [4, 8]

/**
 * Whether a world plays with characters (M10.20): only when its rules have a
 * class to make one from. The rules of a world without characters may still
 * hold patrons, death and conditions (The Quiet Reach: two faiths and a
 * medical return), without character creation or fights.
 */
export function hasCharacters(content: Pick<Content, 'rules'>): boolean {
  return Boolean(content.rules?.classes.length)
}

export function rulesOf(content: Content): Rules {
  if (!content.rules) throw new Error('This content has no rules')
  return content.rules
}

export function classOf(content: Content, id: string): ClassDef {
  const found = rulesOf(content).classes.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown class ${id}`)
  return found
}

/** Every talent the rules know, class or general, by id. */
export function talentById(content: Content, id: string): Talent | undefined {
  const rules = rulesOf(content)
  for (const c of rules.classes) {
    if (c.core.id === id) return c.core
    for (const tree of c.trees) for (const t of tree.talents) if (t.id === id) return t
  }
  return rules.general_talents.find((t) => t.id === id)
}

/** Where a class talent sits: its tree and row. */
export function talentPlace(content: Content, klass: string, id: string): { tree: string; row: number } | undefined {
  for (const tree of classOf(content, klass).trees) {
    const row = tree.talents.findIndex((t) => t.id === id)
    if (row >= 0) return { tree: tree.id, row }
  }
  return undefined
}

// ---------------------------------------------------------------- making a character

/** The extra skills a choice must name: one, plus one per overlap between background and class. */
export function extraSkills(content: Content, klass: string, background: string): number {
  const c = classOf(content, klass)
  const b = rulesOf(content).backgrounds.find((x) => x.id === background)
  return 1 + (b ? b.skills.filter((s) => c.trained.includes(s)).length : 0)
}

export function boostsFor(content: Content, ancestry: string): number {
  const a = rulesOf(content).ancestries.find((x) => x.id === ancestry)
  return knob({ content }, 'rules.free_boosts') + (a?.attributes.choice ?? 0)
}

export function checkChoice(content: Content, choice: CreationChoice): string[] {
  const rules = rulesOf(content)
  const problems: string[] = []
  const ancestry = rules.ancestries.find((a) => a.id === choice.ancestry)
  const background = rules.backgrounds.find((b) => b.id === choice.background)
  const klass = rules.classes.find((c) => c.id === choice.class)
  if (!choice.name.trim() || choice.name.length > 30 || !/^[\p{L}][\p{L} '.-]*$/u.test(choice.name.trim())) problems.push('A name of letters, up to 30 of them.')
  if (!ancestry) problems.push(`Unknown ancestry "${choice.ancestry}".`)
  if (!background) problems.push(`Unknown background "${choice.background}".`)
  if (!klass) problems.push(`Unknown class "${choice.class}".`)
  if (!ancestry || !background || !klass) return problems
  const boosts = boostsFor(content, ancestry.id)
  if (choice.boosts.length !== boosts) problems.push(`Choose ${boosts} attribute boosts.`)
  if (choice.boosts.some((b) => !ATTRIBUTES.includes(b))) problems.push('A boost goes to might, grace, wits or resolve.')
  const attributes = startAttributes(content, choice)
  for (const a of ATTRIBUTES) if (attributes[a] > knob({ content }, 'rules.start_cap')) problems.push(`${cap(a)} can be at most +${knob({ content }, 'rules.start_cap')} at the start.`)
  for (const a of ATTRIBUTES) if (choice.boosts.filter((b) => b === a).length > 2) problems.push(`At most two boosts on ${a}.`)
  const extra = extraSkills(content, klass.id, background.id)
  const trained = new Set([...klass.trained, ...background.skills])
  if (choice.skills.length !== extra) problems.push(`Choose ${extra} extra skill${extra === 1 ? '' : 's'} to train.`)
  for (const s of choice.skills) {
    if (!rules.skills.some((x) => x.id === s)) problems.push(`Unknown skill "${s}".`)
    else if (trained.has(s)) problems.push(`${cap(s)} is already trained.`)
    trained.add(s)
  }
  if (new Set(choice.skills).size !== choice.skills.length) problems.push('Choose different skills.')
  const place = talentPlace(content, klass.id, choice.talent)
  if (!place || place.row !== 0) problems.push(`The first talent comes from the first row of a ${klass.name} tree.`)
  return problems
}

function startAttributes(content: Content, choice: CreationChoice): Attributes {
  const rules = rulesOf(content)
  const ancestry = rules.ancestries.find((a) => a.id === choice.ancestry)
  const klass = rules.classes.find((c) => c.id === choice.class)
  const attributes: Attributes = { might: 0, grace: 0, wits: 0, resolve: 0 }
  for (const a of ATTRIBUTES) attributes[a] += ancestry?.attributes[a] ?? 0
  if (klass) attributes[klass.key] += 1
  for (const b of choice.boosts) if (ATTRIBUTES.includes(b)) attributes[b] += 1
  return attributes
}

export function createCharacter(content: Content, choice: CreationChoice): { character: Character } | { problems: string[] } {
  const problems = checkChoice(content, choice)
  if (problems.length) return { problems }
  const rules = rulesOf(content)
  const klass = classOf(content, choice.class)
  const background = rules.backgrounds.find((b) => b.id === choice.background)!
  const ranks: Record<string, number> = {}
  for (const s of rules.skills) ranks[s.id] = 0
  for (const s of [...klass.trained, ...background.skills, ...choice.skills]) ranks[s] = 1
  const character: Character = {
    name: choice.name.trim(),
    pronoun: choice.pronoun ?? 'they',
    ancestry: choice.ancestry,
    background: choice.background,
    class: choice.class,
    level: 1,
    xp: 0,
    attributes: startAttributes(content, choice),
    ranks,
    skillPoints: 0,
    practice: {},
    talents: [klass.core.id, choice.talent],
    general: [background.talent].filter(Boolean),
    hp: 0,
    conditions: {},
    gear: {},
    deaths: 0,
  }
  equipGear(content, character)
  character.hp = maxHp(content, character)
  return { character }
}

/**
 * A sensible choice for any class: boosts on the key attribute and what the
 * class needs next, skills and a first talent from the class's own lists.
 * The creation screen offers it as a starting point; the balance test uses it.
 */
export function suggestChoice(content: Content, klass: string, name = 'Traveller', ancestry?: string, background?: string): CreationChoice {
  const rules = rulesOf(content)
  const c = classOf(content, klass)
  const second: Record<Attribute, Attribute> = { might: 'grace', grace: 'wits', wits: 'resolve', resolve: 'wits' }
  const gives = (a: Ancestry) => (a.attributes[c.key] ?? 0) + (a.attributes.choice ?? 0) / 2
  const anc = ancestry ?? rules.suggest?.[c.key] ?? [...rules.ancestries].sort((a, b) => gives(b) - gives(a))[0]!.id
  const back = background ?? rules.backgrounds.find((b) => b.skills.every((s) => !c.trained.includes(s)))?.id ?? rules.backgrounds[0]!.id
  const n = boostsFor(content, anc)
  const order: Attribute[] = [c.key, second[c.key], c.key, c.key === 'might' ? 'wits' : 'might', 'resolve', 'grace']
  const boosts: Attribute[] = []
  for (const a of order) {
    if (boosts.length >= n) break
    const probe = { name, ancestry: anc, background: back, class: klass, boosts: [...boosts, a], skills: [], talent: '' }
    if (startAttributes(content, probe)[a] <= knob({ content }, 'rules.start_cap') && boosts.filter((b) => b === a).length < 2) boosts.push(a)
  }
  for (const a of ATTRIBUTES) if (boosts.length < n && !boosts.includes(a)) boosts.push(a)
  const b = rules.backgrounds.find((x) => x.id === back)!
  const trained = new Set([...c.trained, ...b.skills])
  const wanted = ['perception', 'athletics', 'insight', 'medicine', 'survival', 'persuasion', 'lore', 'stealth']
  const skills = wanted.filter((s) => !trained.has(s)).slice(0, extraSkills(content, klass, back))
  // A first talent that fights, if a tree offers one: a lone traveller needs it.
  const firsts = c.trees.map((t) => t.talents[0]!)
  const fights = (t: Talent) => t.effects.some((e) => 'ability' in e && e.ability.uses === 'at_will' && e.ability.do.some((d) => 'strike' in d || 'damage' in d))
  const talent = firsts.find(fights) ?? firsts.find((t) => t.effects.some((e) => 'bonus' in e && (e.bonus.to === 'attack' || e.bonus.to === 'damage'))) ?? firsts[0]!
  return { name, ancestry: anc, background: back, class: klass, boosts, skills, talent: talent.id }
}

/** The one logged command that makes a character, so a replay makes the same one. */
export function creationCommand(choice: CreationChoice): string {
  return `create ${choice.class} ${choice.ancestry} ${choice.background} name=${choice.name.trim().replace(/\s+/g, '_')} boosts=${choice.boosts.join(',')} skills=${choice.skills.join(',')} talent=${choice.talent}${choice.pronoun ? ` pronoun=${choice.pronoun}` : ''}`
}

/** What the creation screen needs: the rules, and the names of the gear. */
export interface CreationData {
  rules: Rules
  items: Record<string, Item>
  /** The world's knobs (M10.20): its own start cap and free boosts count on the character screen too. */
  knobs?: Record<string, number | Record<string, number>>
}

/** A content object with just enough in it for the character functions, from creation data. */
export function contentFor(data: CreationData): Content {
  return { rules: data.rules, items: new Map(Object.entries(data.items)), world: { knobs: data.knobs ?? {} } } as unknown as Content
}

// ---------------------------------------------------------------- gear

export function itemOf(content: Content, id: string | undefined): Item | undefined {
  return id ? content.items.get(id) : undefined
}

/** Takes up the class's gear: the first weapon it lists, its armour and its shield. */
export function equipGear(content: Content, character: Character): void {
  for (const id of Object.keys(classOf(content, character.class).gear)) {
    const item = content.items.get(id)
    if (item?.weapon && character.gear.weapon) continue
    equip(content, character, id)
  }
}

/** Holds a weapon, wears armour or takes up a shield. Returns what it did, or why not. */
export function equip(content: Content, character: Character, itemId: string): string {
  const item = content.items.get(itemId)
  if (!item) return 'You have no such thing.'
  if (item.weapon) {
    character.gear.weapon = item.id
    if (item.weapon.two_hands) delete character.gear.shield
    return `You now hold the ${item.name}.`
  }
  if (item.armour?.kind === 'shield') {
    const weapon = itemOf(content, character.gear.weapon)
    if (weapon?.weapon?.two_hands) return `You need both hands for the ${weapon.name}.`
    character.gear.shield = item.id
    return `You take up the ${item.name}.`
  }
  if (item.armour) {
    character.gear.armour = item.id
    return `You put on the ${item.name}.`
  }
  return `The ${item.name} is neither weapon nor armour.`
}

// ---------------------------------------------------------------- derived numbers

export interface Context {
  melee?: boolean
  ranged?: boolean
  shield?: boolean
  quarry?: boolean
  vs_spirit?: boolean
  outdoors?: boolean
  fen?: boolean
  night?: boolean
  first_round?: boolean
  front?: boolean
}

/** Every effect the character has: talents, the background's talent, and the patron's blessings. */
export function effectsOf(content: Content, character: Character): Effect[] {
  const list: Effect[] = []
  for (const id of [...character.talents, ...character.general]) list.push(...(talentById(content, id)?.effects ?? []))
  const patron = character.patron && rulesOf(content).patrons.find((p) => p.id === character.patron!.id)
  if (patron) for (const b of patron.blessings) if (character.patron!.favour >= b.at) list.push(...b.effects)
  return list
}

export function bonusesOf(content: Content, character: Character): Bonus[] {
  return effectsOf(content, character).flatMap((e) => ('bonus' in e ? [e.bonus] : []))
}

/** The sum of the bonuses to one thing, counting only those whose condition holds. */
export function bonus(content: Content, character: Character, to: string, ctx: Context = {}): number {
  let sum = 0
  for (const b of bonusesOf(content, character)) {
    if (b.to !== to) continue
    if (b.when === 'per_level') sum += b.value * character.level
    else if (!b.when || ctx[b.when]) sum += b.value
  }
  return sum
}

export function half(character: Pick<Character, 'level'>): number {
  return Math.floor(character.level / 2)
}

/** The rank bonus of a class for attack, class DC or defence at the character's level: +2 per step reached. */
export function proficiency(content: Content, character: Character, what: 'attack' | 'class_dc' | 'defence'): number {
  return 2 * classOf(content, character.class).proficiency[what].filter((l) => l <= character.level).length
}

export function maxHp(content: Content, character: Character): number {
  const rules = rulesOf(content)
  const ancestry = rules.ancestries.find((a) => a.id === character.ancestry)
  const klass = classOf(content, character.class)
  const base = (ancestry?.hp ?? 8) + (klass.hp + character.attributes.might) * character.level + bonus(content, character, 'hp')
  return Math.max(1, character.mark ? Math.floor(base * 0.9) : base)
}

/** The penalty every check takes from conditions: Frightened, Sickened, and a curse (M7.2). */
export function conditionPenalty(conditions: Record<string, number>): number {
  return (conditions['frightened'] ?? 0) + (conditions['sickened'] ? 1 : 0) + (conditions['cursed'] ? 2 : 0) + (conditions['wet'] ? 1 : 0)
}

/** An attribute as it stands now: Fen Fever takes a point of Might for every day it has lasted. */
function attribute(character: Character, a: Attribute): number {
  return character.attributes[a] - (a === 'might' ? (character.conditions['fen_fever'] ?? 0) : 0)
}

export function skillBonus(content: Content, character: Character, skill: string, ctx: Context = {}): number {
  const def = rulesOf(content).skills.find((s) => s.id === skill)
  if (!def) return 0
  const value = skill === 'intimidation' ? Math.max(attribute(character, 'resolve'), attribute(character, 'might')) : attribute(character, def.attribute)
  const rank = character.ranks[skill] ?? 0
  const catSneak = skill === 'stealth' && character.conditions['catform'] ? 4 : 0
  return value + rank * 2 + half(character) + bonus(content, character, `skill:${skill}`, ctx) + catSneak - conditionPenalty(character.conditions)
}

const SAVE_ATTRIBUTE: Record<Save, Attribute> = { fortitude: 'might', reflex: 'grace', will: 'wits' }
const STRONG_SAVE: Record<Attribute, Save> = { might: 'fortitude', grace: 'reflex', wits: 'will', resolve: 'will' }

export function saveBonus(content: Content, character: Character, save: Save): number {
  const klass = classOf(content, character.class)
  const rank = STRONG_SAVE[klass.key] === save ? 4 : 2
  return attribute(character, SAVE_ATTRIBUTE[save]) + rank + half(character) + bonus(content, character, `save:${save}`) - conditionPenalty(character.conditions)
}

const ARMOUR_ORDER = ['none', 'light', 'medium', 'heavy']

export function proficientIn(content: Content, character: Character, armour: Item | undefined): boolean {
  if (!armour?.armour || armour.armour.kind === 'shield') return true
  return ARMOUR_ORDER.indexOf(armour.armour.kind) <= ARMOUR_ORDER.indexOf(classOf(content, character.class).armour)
}

export function defence(content: Content, character: Character, ctx: Context = {}): number {
  const armour = itemOf(content, character.gear.armour)
  const shield = itemOf(content, character.gear.shield)
  const cap = armour?.armour?.cap ?? 6
  const rank = proficientIn(content, character, armour) ? proficiency(content, character, 'defence') : 0
  return (
    10 +
    Math.min(character.attributes.grace, cap) +
    (armour?.armour?.defence ?? 0) +
    rank +
    half(character) +
    (ctx.shield && shield ? (shield.armour?.defence ?? 0) : 0) +
    bonus(content, character, 'defence', ctx)
  )
}

export interface WeaponStats {
  item?: string
  name: string
  kind: 'melee' | 'ranged' | 'thrown'
  attack: number
  dice: { count: number; sides: number }
  damage: number
  light: boolean
  crit: 'bleeding' | 'prone' | 'push' | 'none'
  range: 'near' | 'far'
  iron: boolean
}

/** The weapon in hand, or bare fists. */
export function weaponStats(content: Content, character: Character, ctx: Context = {}): WeaponStats {
  const item = itemOf(content, character.gear.weapon)
  const w = item?.weapon
  const kind = w?.kind ?? 'melee'
  const light = w?.light ?? true
  const { might, grace } = character.attributes
  const attribute = kind === 'ranged' || (light && grace > might) ? grace : might
  const armour = itemOf(content, character.gear.armour)
  const clumsy = proficientIn(content, character, armour) ? 0 : 2
  const extra = WEAPON_DICE_AT.filter((l) => character.level >= l).length
  const [count, sides] = (w?.damage ?? '1d3').split('d').map(Number) as [number, number]
  const melee = kind !== 'ranged'
  const c: Context = { ...ctx, melee, ranged: !melee }
  return {
    ...(item ? { item: item.id } : {}),
    name: item?.name ?? 'fists',
    kind,
    attack: attribute + proficiency(content, character, 'attack') + half(character) + bonus(content, character, 'attack', c) - clumsy - conditionPenalty(character.conditions),
    dice: { count: count + extra, sides },
    damage: (melee ? might : 0) + bonus(content, character, 'damage', c),
    light,
    crit: w?.crit ?? 'none',
    range: kind === 'melee' ? 'near' : (w?.range ?? 'near'),
    iron: w?.iron ?? false,
  }
}

/** The DC of the character's abilities and charms: 10 + key attribute + rank + half level. */
export function classDc(content: Content, character: Character): number {
  return 10 + character.attributes[classOf(content, character.class).key] + proficiency(content, character, 'class_dc') + half(character)
}

export function initiative(content: Content, character: Character): number {
  return skillBonus(content, character, 'perception') + bonus(content, character, 'initiative')
}

export interface OwnAbility extends Ability {
  id: string
  name: string
  text: string
  /** The level at which it opened, for how its dice grow. */
  from: number
}

/** The abilities the character can use in a fight: the core ability and the talents that give one. */
export function abilitiesOf(content: Content, character: Character): OwnAbility[] {
  const list: OwnAbility[] = []
  for (const id of character.talents) {
    const talent = talentById(content, id)
    if (!talent) continue
    const place = talentPlace(content, character.class, id)
    const from = place ? ROW_LEVEL[place.row]! : 1
    talent.effects.forEach((effect, n) => {
      if ('ability' in effect) list.push({ ...effect.ability, id: n === 0 ? talent.id : `${talent.id}_${n}`, name: talent.name, text: talent.text, from })
    })
  }
  return list
}

/** Dice that grow with the level: one die more for every two levels past the one where the ability opened. */
export function scaledDice(dice: string, level: number, from: number): string {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(dice)
  if (!m) return dice
  const count = Number(m[1]) + Math.max(0, Math.floor((level - from) / 2))
  return `${count}d${m[2]}${m[3] ?? ''}`
}

// ---------------------------------------------------------------- experience and levels

export function xpForLevel(content: Content, level: number): number {
  return (level - 1) * rulesOf(content).xp_per_level
}

export function canLevelUp(content: Content, character: Character): boolean {
  return character.level < 10 && character.xp >= xpForLevel(content, character.level + 1)
}

export interface LevelChoice {
  talent?: string
  general?: string
  expert?: string
  master?: string
}

/** What a level-up asks for at the next level. */
export function levelNeeds(nextLevel: number): { talent: true; general: boolean; expert: boolean; master: boolean; attributes: boolean; weapon: boolean } {
  return {
    talent: true,
    general: nextLevel % 2 === 0,
    expert: nextLevel === 3 || nextLevel === 7,
    master: nextLevel === 9,
    attributes: nextLevel === 5 || nextLevel === 10,
    weapon: WEAPON_DICE_AT.includes(nextLevel),
  }
}

/** The class talents open to the character at a level: the next one in each tree, if its row has opened. */
export function openTalents(content: Content, character: Character, level = character.level): Talent[] {
  const open: Talent[] = []
  for (const tree of classOf(content, character.class).trees) {
    const next = tree.talents.findIndex((t) => !character.talents.includes(t.id))
    if (next >= 0 && ROW_LEVEL[next]! <= level) open.push(tree.talents[next]!)
  }
  return open
}

export function openGeneral(content: Content, character: Character): Talent[] {
  return rulesOf(content).general_talents.filter((t) => !character.general.includes(t.id))
}

/** Rises one level with the choices given. Returns what changed, or the problems. */
export function levelUp(content: Content, character: Character, choice: LevelChoice): { lines: string[] } | { problems: string[] } {
  if (!canLevelUp(content, character)) return { problems: [character.level >= 10 ? 'You are at the highest level.' : 'You have not gained enough experience yet.'] }
  const next = character.level + 1
  const needs = levelNeeds(next)
  const problems: string[] = []
  const talents = openTalents(content, character, next)
  if (!choice.talent || !talents.some((t) => t.id === choice.talent)) problems.push(`Choose a class talent: ${talents.map((t) => t.name).join(', ')}.`)
  const general = openGeneral(content, character)
  if (needs.general && (!choice.general || !general.some((t) => t.id === choice.general))) problems.push(`Choose a general talent: ${general.map((t) => t.name).join(', ')}.`)
  const trained = Object.entries(character.ranks).filter(([, r]) => r === 1).map(([s]) => s)
  const experts = Object.entries(character.ranks).filter(([, r]) => r === 2).map(([s]) => s)
  if (needs.expert && (!choice.expert || !trained.includes(choice.expert))) problems.push(`Choose a trained skill to make expert: ${trained.join(', ')}.`)
  if (needs.master && (!choice.master || !experts.includes(choice.master))) problems.push(`Choose an expert skill to make master: ${experts.join(', ') || 'none yet'}.`)
  if (problems.length) return { problems }

  const before = maxHp(content, character)
  const lines: string[] = []
  character.level = next
  character.talents.push(choice.talent!)
  lines.push(`You learn ${talentById(content, choice.talent!)!.name}.`)
  if (needs.general) {
    character.general.push(choice.general!)
    lines.push(`You learn ${talentById(content, choice.general!)!.name}.`)
  }
  if (needs.expert) {
    character.ranks[choice.expert!] = 2
    lines.push(`Your ${choice.expert} is now expert.`)
  }
  if (needs.master) {
    character.ranks[choice.master!] = 3
    lines.push(`Your ${choice.master} is now master.`)
  }
  if (needs.attributes) {
    for (const a of ATTRIBUTES) character.attributes[a] = Math.min(knob({ content }, 'rules.attribute_cap'), character.attributes[a] + 1)
    lines.push('All four attributes rise by one.')
  }
  if (needs.weapon) lines.push('Your weapons strike harder: one die more.')
  character.skillPoints += 2
  const gained = maxHp(content, character) - before
  character.hp += gained
  lines.unshift(`You are now level ${next}. ${gained} more hit points, and 2 skill points to spend (TRAIN <skill>).`)
  return { lines }
}

/** The choices a template would make: the class's trees in turn, the first general talent free, the best skills. */
export function autoLevelChoice(content: Content, character: Character): LevelChoice {
  const next = character.level + 1
  const needs = levelNeeds(next)
  const talents = openTalents(content, character, next)
  // A lone traveller's template: what fights and keeps you standing first, then the deeper row.
  const row = (id: string) => talentPlace(content, character.class, id)?.row ?? 0
  const after = (t: Talent) => {
    const place = talentPlace(content, character.class, t.id)
    const tree = place && classOf(content, character.class).trees.find((x) => x.id === place.tree)
    const next = tree?.talents[place!.row + 1]
    return next ? talentScore(next) / 2 : 0
  }
  const value = (t: Talent) => talentScore(t) + after(t) + row(t.id)
  const talent = [...talents].sort((a, b) => value(b) - value(a))[0]
  const klass = classOf(content, character.class)
  const order = [...klass.trained, ...Object.keys(character.ranks)]
  const choice: LevelChoice = { ...(talent ? { talent: talent.id } : {}) }
  if (needs.general) {
    const pick = [...openGeneral(content, character)].sort((a, b) => talentScore(b) - talentScore(a))[0]
    if (pick) choice.general = pick.id
  }
  if (needs.expert) choice.expert = order.find((s) => character.ranks[s] === 1)
  if (needs.master) choice.master = order.find((s) => character.ranks[s] === 2)
  return choice
}

/** How much a talent helps a lone traveller in a fight, for the template. */
export function talentScore(talent: Talent): number {
  let score = 0
  for (const e of talent.effects) {
    if ('ability' in e) {
      const a = e.ability
      if (a.do.some((d) => 'strike' in d || 'damage' in d)) score = Math.max(score, a.uses === 'at_will' ? 10 : 6)
      else if (a.do.some((d) => 'heal' in d)) score = Math.max(score, 5)
      else if (a.do.some((d) => 'condition' in d)) score = Math.max(score, 4)
      else score = Math.max(score, 2)
    } else {
      const to = e.bonus.to
      score = Math.max(score, to === 'attack' || to === 'damage' ? 7 : to === 'defence' || to === 'hp' ? 6 : to.startsWith('save') ? 3 : 1)
    }
  }
  return score
}

/** The cost in skill points to raise a skill one rank, after aptitude and practice. */
export function trainCost(content: Content, character: Character, skill: string): number | undefined {
  const rank = character.ranks[skill] ?? 0
  if (rank >= 3) return undefined
  const aptitude = rulesOf(content).ancestries.find((a) => a.id === character.ancestry)?.aptitude[skill] ?? 0
  const base = Math.max(1, [2, 4, 6][rank]! - aptitude)
  return (character.practice[skill] ?? 0) >= 3 ? Math.ceil(base / 2) : base
}

/** Spends skill points on a rank. Expert from level 3, master from level 9. */
export function train(content: Content, character: Character, skill: string): string {
  const def = rulesOf(content).skills.find((s) => s.id === skill)
  if (!def) return `There is no skill "${skill}".`
  const rank = character.ranks[skill] ?? 0
  const cost = trainCost(content, character, skill)
  if (cost === undefined) return `Your ${def.name} is already master.`
  if (rank === 1 && character.level < 3) return 'Expert skills come from level 3.'
  if (rank === 2 && character.level < 9) return 'Master skills come from level 9.'
  if (character.skillPoints < cost) return `Raising ${def.name} costs ${cost} skill point${cost === 1 ? '' : 's'}; you have ${character.skillPoints}.`
  character.skillPoints -= cost
  character.ranks[skill] = rank + 1
  character.practice[skill] = 0
  return `Your ${def.name} is now ${RANK_NAMES[rank + 1]}.`
}

export const RANK_NAMES = ['untrained', 'trained', 'expert', 'master']

/** A check that mattered and succeeded leaves a practice mark (after DCSS). */
export function practise(character: Character, skill: string): void {
  character.practice[skill] = Math.min(3, (character.practice[skill] ?? 0) + 1)
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
