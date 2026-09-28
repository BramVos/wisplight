import { craftLines } from '../crafts'
import type { Content } from '../content'
import { selfGear, selfState } from '../looking'
import type { Output } from '../commands'
import { check as rollCheck, PLAYER_BONUS, type CheckResult } from '../dialogue/checks'
import { relation } from '../dialogue/relations'
import type { World } from '../world'
import { blessed, ONCE, useBlessing } from './blessings'
import {
  ATTRIBUTE_CAP,
  autoLevelChoice,
  boostsFor,
  canLevelUp,
  classDc,
  classOf,
  createCharacter,
  defence,
  equip,
  extraSkills,
  initiative,
  levelNeeds,
  levelUp,
  maxHp,
  openGeneral,
  openTalents,
  practise,
  RANK_NAMES,
  rulesOf,
  saveBonus,
  skillBonus,
  suggestChoice,
  talentById,
  train,
  trainCost,
  weaponStats,
  xpForLevel,
  type Character,
  type CreationChoice,
  type LevelChoice,
} from './character'
import { ATTRIBUTES, SAVES, type Attribute } from './schema'
import { approve, syncLevels } from '../social/companions'

// The character in the world (FO, chapter 11): making one, checks with real
// skills, experience, rest, patrons, clocks, and coming back from the dead.

/**
 * The ready-made traveller for a game started without making a character:
 * a Rascal from the polders who used to smuggle, with the same talking skills
 * the game had before characters existed (Persuasion, Deception and
 * Intimidation +4, Insight +3).
 */
export const READY_MADE: CreationChoice = {
  name: 'Traveller',
  ancestry: 'dykelander',
  background: 'smuggler',
  class: 'rascal',
  boosts: ['resolve', 'resolve', 'grace', 'might'],
  skills: ['intimidation', 'insight', 'perception'],
  talent: 'quick_hands',
}

/** The ready-made traveller of this world: its rules say who (M9.1), or the first class made sensibly. */
export function readyMade(content: Content): CreationChoice {
  const rules = rulesOf(content)
  return rules.ready_made ?? suggestChoice(content, rules.classes[0]!.id)
}

export function character(world: World): Character | undefined {
  const player = world.state.player
  if (!player.character && world.content.rules) {
    const made = createCharacter(world.content, readyMade(world.content))
    if ('character' in made) {
      player.character = made.character
      giveGear(world, made.character, false)
    }
  }
  return player.character
}

/** The gear of the class goes into the pack; what can be held or worn is taken up. */
function giveGear(world: World, c: Character, fresh: boolean): void {
  const inventory = world.state.player.inventory
  for (const [item, n] of Object.entries(classOf(world.content, c.class).gear)) {
    if (fresh || !inventory[item]) inventory[item] = (inventory[item] ?? 0) + n
  }
}

export function notice(world: World, text: string): void {
  world.notices.push(text)
}

// ---------------------------------------------------------------- checks

export function playerSkill(world: World, skill: string): number {
  const c = character(world)
  return c ? skillBonus(world.content, c, skill) : (PLAYER_BONUS[skill] ?? 0)
}

/** A check of the player's: d20 + skill against the DC; a success that mattered leaves a practice mark. */
export function playerCheck(world: World, skill: string, dc: number): CheckResult {
  const result = rollCheck(world.rng, skill, dc, playerSkill(world, skill))
  const c = character(world)
  if (c && (result.degree === 'success' || result.degree === 'critical success')) practise(c, skill)
  return result
}

// ---------------------------------------------------------------- experience

/** Experience (FO, chapter 11): quests, discoveries, overcome challenges and knowledge, not only fights. */
export function gainXp(world: World, amount: number, why: string): void {
  const c = character(world)
  if (!c || amount <= 0) return
  const could = canLevelUp(world.content, c)
  c.xp += amount
  notice(world, `+${amount} experience: ${why}.`)
  if (!could && canLevelUp(world.content, c)) notice(world, `You can rise to level ${c.level + 1}. Type LEVEL UP.`)
}

export const XP = { place: 10, area: 30, secret: 40, request: 60, lore: 10 }

// ---------------------------------------------------------------- making a character

const ALIASES: Record<string, string> = { heathborn: 'heathborn', heideborene: 'heathborn', dijklander: 'dykelander', veenvolk: 'fenfolk', wisselkind: 'changeling' }

/**
 * CREATE <class> <ancestry> <background> [name=...] [boosts=a,b,c] [skills=x,y] [talent=t].
 * What is left out is filled in from the suggestion for the class. Only once,
 * before the first experience.
 */
export function createCommand(world: World, args: string[]): Output[] {
  const rules = world.content.rules
  if (!rules) return [{ kind: 'error', text: 'This world has no rules for characters.' }]
  const current = character(world)
  if (current?.made) return [{ kind: 'error', text: `You are ${current.name} already. A character is made once, at the start.` }]
  if (current && current.xp > 0) return [{ kind: 'error', text: 'Too late to make a new character: you have already gained experience as the traveller.' }]
  const words = args.map((a) => a.toLowerCase())
  const named: Record<string, string> = {}
  const loose: string[] = []
  for (const w of args) {
    const m = /^(name|boosts|skills|talent|pronoun|look)=(.+)$/i.exec(w)
    if (m) named[m[1]!.toLowerCase()] = m[2]!
    else loose.push(w.toLowerCase())
  }
  if (words.length === 0) return [{ kind: 'system', text: creationHelp(world) }]
  const klass = rules.classes.find((c) => loose.includes(c.id) || loose.includes(c.name.toLowerCase()))
  if (!klass) return [{ kind: 'error', text: `Choose a class: ${rules.classes.map((c) => c.id).join(', ')}.` }]
  const ancestry = rules.ancestries.find((a) => loose.includes(a.id) || loose.some((w) => ALIASES[w] === a.id))
  const background = rules.backgrounds.find((b) => loose.includes(b.id))
  const name = (named['name'] ?? 'Traveller').replace(/_/g, ' ')
  const choice: CreationChoice = {
    name,
    ancestry: ancestry?.id ?? '',
    background: background?.id ?? '',
    class: klass.id,
    boosts: [],
    skills: [],
    talent: '',
  }
  const suggestion = suggestFor(world, choice)
  const final: CreationChoice = {
    ...suggestion,
    name,
    ...(named['boosts'] ? { boosts: named['boosts'].split(',').map((b) => b.trim() as Attribute) } : {}),
    ...(named['skills'] ? { skills: named['skills'].split(',').map((s) => s.trim()) } : {}),
    ...(named['talent'] ? { talent: named['talent'].trim() } : {}),
    ...(named['pronoun'] && ['she', 'he', 'they'].includes(named['pronoun'].toLowerCase()) ? { pronoun: named['pronoun'].toLowerCase() as 'she' | 'he' | 'they' } : {}),
    ...(named['look'] ? { appearance: named['look'].replace(/_/g, ' ') } : {}),
  }
  return makeCharacter(world, final)
}

/** The suggestion knows good boosts, skills and a first talent for the class. */
function suggestFor(world: World, partial: CreationChoice): CreationChoice {
  return suggestChoice(world.content, partial.class, partial.name, partial.ancestry || undefined, partial.background || undefined)
}

export function makeCharacter(world: World, choice: CreationChoice): Output[] {
  const made = createCharacter(world.content, choice)
  if ('problems' in made) return [{ kind: 'error', text: made.problems.join(' ') }]
  const c = made.character
  c.made = true
  if (choice.appearance?.trim()) c.appearance = choice.appearance.trim().slice(0, 300)
  const player = world.state.player
  // The ready-made traveller's gear goes back; the new character's own comes.
  const old = player.character
  if (old) for (const [item, n] of Object.entries(classOf(world.content, old.class).gear)) player.inventory[item] = Math.max(0, (player.inventory[item] ?? 0) - n)
  for (const [item, n] of Object.entries(player.inventory)) if (n <= 0) delete player.inventory[item]
  player.character = c
  giveGear(world, c, true)
  const background = rulesOf(world.content).backgrounds.find((b) => b.id === c.background)!
  for (const npc of background.knows) {
    const r = relation(world.state, npc)
    r.familiarity = Math.max(r.familiarity, 30)
    r.affinity = Math.max(r.affinity, 10)
  }
  const journal = (player.journal ??= {})
  for (const topic of [...background.topics, ...background.knows]) journal[topic] ??= world.now
  const k = classOf(world.content, c.class)
  const a = rulesOf(world.content).ancestries.find((x) => x.id === c.ancestry)!
  const was = background.name.charAt(0).toLowerCase() + background.name.slice(1)
  const an = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')
  // A new background, a new reason to be here (M10.9); the ready-made traveller's contact gives way to this one.
  delete player.contact
  return [{ kind: 'system', text: `You are ${c.name}, ${an(a.name)} ${a.name} ${k.name}, once ${/^a\s|^an\s/i.test(was) ? '' : `${an(was)} `}${was}. ${k.text} Type SHEET to see yourself.` }, ...arrival(world)]
}

export function creationHelp(world: World): string {
  const rules = rulesOf(world.content)
  return [
    `CREATE <class> <ancestry> <background> name=<name>, for example: CREATE ${rules.classes[0]!.id} ${suggestChoice(world.content, rules.classes[0]!.id).ancestry} ${rules.backgrounds[0]!.id} name=${readyMade(world.content).name === 'Traveller' ? 'Joost' : readyMade(world.content).name}`,
    `Classes: ${rules.classes.map((c) => `${c.id} (${c.text})`).join('; ')}`,
    `Ancestries: ${rules.ancestries.map((a) => `${a.id} (${a.special})`).join('; ')}`,
    // With why you came (M10.9): the first sentence of each background's reason.
    rules.backgrounds.some((b) => b.reason)
      ? `Backgrounds, and why you came:\n${rules.backgrounds.map((b) => `  ${b.id}${b.reason ? `: ${/^[^.!?]*[.!?]/.exec(b.reason)?.[0] ?? b.reason}` : ''}`).join('\n')}`
      : `Backgrounds: ${rules.backgrounds.map((b) => b.id).join(', ')}`,
    'Optional: boosts=might,grace,... skills=a,b talent=<first talent>. What you leave out is chosen for you.',
  ].join('\n')
}

// ---------------------------------------------------------------- the sheet

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

export function sheetLines(world: World): string[] {
  return [...sheetBody(world), ...selfLines(world)]
}

/** How the stranger looks and is (M10.4): on the sheet as for LOOK ME. */
function selfLines(world: World): string[] {
  const c = world.state.player.character
  if (!c) return []
  const gear = selfGear(world)
  return ['', `${c.appearance ? `Looks: ${c.appearance}` : 'Looks: as a stranger does.'}`, ...(gear ? [gear] : []), selfState(world)]
}

function sheetBody(world: World): string[] {
  const c = character(world)
  if (!c) return ['This world has no rules for characters.']
  const content = world.content
  const rules = rulesOf(content)
  const k = classOf(content, c.class)
  const a = rules.ancestries.find((x) => x.id === c.ancestry)!
  const b = rules.backgrounds.find((x) => x.id === c.background)!
  const w = weaponStats(content, c)
  const lines = [
    `${c.name}, ${a.name} ${k.name}, level ${c.level} (${c.xp} of ${c.level >= 10 ? '-' : xpForLevel(content, c.level + 1)} experience)${c.made ? '' : ' - the ready-made traveller; CREATE makes your own'}`,
    `Background: ${b.name}. ${a.special}`,
    `Hit points ${c.hp}/${maxHp(content, c)}${c.mark ? " (the Rider's Mark: -10% until a rite for the dead)" : ''}. Defence ${defence(content, c)}${c.gear.shield ? ` (${defence(content, c, { shield: true })} with shield raised)` : ''}. Initiative ${signed(initiative(content, c))}. Class DC ${classDc(content, c)}.`,
    `Attributes: ${ATTRIBUTES.map((x) => `${cap(x)} ${signed(c.attributes[x])}`).join(', ')}.`,
    `Saves: ${SAVES.map((s) => `${cap(s)} ${signed(saveBonus(content, c, s))}`).join(', ')}.`,
    `Weapon: ${w.name}, attack ${signed(w.attack)}, damage ${w.dice.count}d${w.dice.sides}${w.damage ? signed(w.damage) : ''}${w.crit !== 'none' ? `, critical: ${w.crit}` : ''}. Armour: ${c.gear.armour ? content.items.get(c.gear.armour)!.name : 'none'}${c.gear.shield ? `, ${content.items.get(c.gear.shield)!.name}` : ''}.`,
    `Skills: ${rules.skills
      .map((s) => `${s.name} ${signed(skillBonus(content, c, s.id))}${c.ranks[s.id] ? ` (${RANK_NAMES[c.ranks[s.id]!]})` : ''}${(c.practice[s.id] ?? 0) > 0 ? ` ${'|'.repeat(c.practice[s.id]!)}` : ''}`)
      .join(', ')}.`,
    `Skill points: ${c.skillPoints}${c.skillPoints ? ' (TRAIN <skill>)' : ''}.`,
    `Talents: ${c.talents.map((t) => talentById(content, t)!.name).join(', ')}. General: ${c.general.map((t) => talentById(content, t)!.name).join(', ')}.`,
    ...craftLines(world).map((line) => `Craft: ${line}`),
  ]
  const conditions = Object.entries(c.conditions).filter(([, v]) => v > 0)
  if (conditions.length) lines.push(`Conditions: ${conditions.map(([x, v]) => `${x}${v > 1 ? ` ${v}` : ''}`).join(', ')}.`)
  if (c.patron) {
    const p = rules.patrons.find((x) => x.id === c.patron!.id)!
    const blessings = p.blessings.filter((x) => c.patron!.favour >= x.at).map((x) => x.name)
    lines.push(`Patron: ${p.name}, favour ${c.patron.favour}/100${blessings.length ? `; blessings: ${blessings.join(', ')}` : ''}.`)
  }
  if (c.deaths) lines.push(`You have walked the Way of the Grey Rider ${c.deaths === 1 ? 'once' : `${c.deaths} times`}.`)
  if (canLevelUp(content, c)) lines.push(`You can rise to level ${c.level + 1}: LEVEL UP.`)
  return lines
}

/** The character sheet as data, for the interface to lay out (the text lines stay for the terminal). */
export interface SheetData {
  name: string
  ancestry: string
  className: string
  level: number
  xp: number
  nextXp?: number
  readyMade: boolean
  background: string
  special: string
  hp: number
  maxHp: number
  mark: boolean
  defence: number
  defenceShield?: number
  initiative: number
  classDc: number
  attributes: { name: string; value: number }[]
  saves: { name: string; value: number }[]
  weapon: { name: string; attack: number; damage: string; crit?: string }
  armour: string[]
  skills: { name: string; bonus: number; rank?: string; practice: number }[]
  skillPoints: number
  talents: string[]
  general: string[]
  conditions: { name: string; level: number }[]
  patron?: { name: string; favour: number; blessings: string[] }
  deaths: number
  canLevel: boolean
  /** Other lines for the sheet page, such as the progress clocks. */
  notes?: string[]
  /** The crafts the stranger works at (M10.5): a line each, rank and what the next asks. */
  crafts: string[]
}

export function sheetData(world: World): SheetData | undefined {
  const c = character(world)
  if (!c) return undefined
  const content = world.content
  const rules = rulesOf(content)
  const k = classOf(content, c.class)
  const a = rules.ancestries.find((x) => x.id === c.ancestry)!
  const b = rules.backgrounds.find((x) => x.id === c.background)!
  const w = weaponStats(content, c)
  const patron = c.patron ? rules.patrons.find((x) => x.id === c.patron!.id) : undefined
  return {
    name: c.name,
    ancestry: a.name,
    className: k.name,
    level: c.level,
    xp: c.xp,
    ...(c.level < 10 ? { nextXp: xpForLevel(content, c.level + 1) } : {}),
    readyMade: !c.made,
    background: b.name,
    special: a.special,
    hp: c.hp,
    maxHp: maxHp(content, c),
    mark: Boolean(c.mark),
    defence: defence(content, c),
    ...(c.gear.shield ? { defenceShield: defence(content, c, { shield: true }) } : {}),
    initiative: initiative(content, c),
    classDc: classDc(content, c),
    attributes: ATTRIBUTES.map((x) => ({ name: cap(x), value: c.attributes[x] })),
    saves: SAVES.map((x) => ({ name: cap(x), value: saveBonus(content, c, x) })),
    weapon: { name: w.name, attack: w.attack, damage: `${w.dice.count}d${w.dice.sides}${w.damage ? signed(w.damage) : ''}`, ...(w.crit !== 'none' ? { crit: String(w.crit) } : {}) },
    armour: [c.gear.armour, c.gear.shield].filter((x): x is string => Boolean(x)).map((x) => content.items.get(x)!.name),
    skills: rules.skills.map((x) => ({ name: x.name, bonus: skillBonus(content, c, x.id), ...(c.ranks[x.id] ? { rank: RANK_NAMES[c.ranks[x.id]!] } : {}), practice: c.practice[x.id] ?? 0 })),
    skillPoints: c.skillPoints,
    talents: c.talents.map((t) => talentById(content, t)!.name),
    general: c.general.map((t) => talentById(content, t)!.name),
    conditions: Object.entries(c.conditions)
      .filter(([, v]) => v > 0)
      .map(([name, level]) => ({ name, level })),
    ...(patron && c.patron ? { patron: { name: patron.name, favour: c.patron.favour, blessings: patron.blessings.filter((x) => c.patron!.favour >= x.at).map((x) => x.name) } } : {}),
    deaths: c.deaths ?? 0,
    canLevel: canLevelUp(content, c),
    crafts: craftLines(world),
  }
}

// ---------------------------------------------------------------- levels and skills

/** LEVEL UP [talent] [general] [expert skill] [master skill], or LEVEL UP AUTO. */
export function levelCommand(world: World, args: string[]): Output[] {
  const c = character(world)
  if (!c) return [{ kind: 'error', text: 'This world has no rules for characters.' }]
  const content = world.content
  if (!canLevelUp(content, c)) return [{ kind: 'error', text: c.level >= 10 ? 'You are at the highest level.' : `You need ${xpForLevel(content, c.level + 1)} experience for level ${c.level + 1}; you have ${c.xp}.` }]
  const words = args.filter((w) => w !== 'up').map((w) => w.toLowerCase())
  const next = c.level + 1
  const needs = levelNeeds(next)
  let choice: LevelChoice
  if (words[0] === 'auto') choice = autoLevelChoice(content, c)
  else {
    const find = (list: { id: string; name: string }[]) => list.find((t) => words.includes(t.id) || words.join(' ').includes(t.name.toLowerCase()))?.id
    const skills = rulesOf(content).skills.filter((s) => words.includes(s.id)).map((s) => s.id)
    choice = {}
    const talent = find(openTalents(content, c, next))
    if (talent) choice.talent = talent
    const general = find(openGeneral(content, c))
    if (general) choice.general = general
    const expert = skills.find((s) => c.ranks[s] === 1)
    if (expert) choice.expert = expert
    const master = skills.find((s) => c.ranks[s] === 2)
    if (master) choice.master = master
  }
  const result = levelUp(content, c, choice)
  if ('problems' in result) {
    const menu = [
      `Level ${next}: choose a class talent (${openTalents(content, c, next).map((t) => `${t.id}: ${t.text}`).join(' | ')})`,
      needs.general ? `and a general talent (${openGeneral(content, c).map((t) => t.id).join(', ')})` : '',
      needs.expert ? `and a trained skill to make expert (${Object.entries(c.ranks).filter(([, r]) => r === 1).map(([s]) => s).join(', ')})` : '',
      needs.master ? `and an expert skill to make master (${Object.entries(c.ranks).filter(([, r]) => r === 2).map(([s]) => s).join(', ')})` : '',
      'For example: LEVEL UP heavy_blow toughness. Or LEVEL UP AUTO.',
    ].filter(Boolean)
    return [{ kind: 'system', text: menu.join('\n') }]
  }
  syncLevels(world)
  return [{ kind: 'system', text: result.lines.join(' ') }]
}

export function trainCommand(world: World, skill: string): Output[] {
  const c = character(world)
  if (!c) return [{ kind: 'error', text: 'This world has no rules for characters.' }]
  const id = rulesOf(world.content).skills.find((s) => s.id === skill.toLowerCase() || s.name.toLowerCase() === skill.toLowerCase())?.id
  if (!id) {
    const costs = rulesOf(world.content).skills.map((s) => `${s.id} ${trainCost(world.content, c, s.id) ?? '-'}`)
    return [{ kind: 'system', text: `TRAIN <skill>. You have ${c.skillPoints} skill points. Costs: ${costs.join(', ')}.` }]
  }
  return [{ kind: 'system', text: train(world.content, c, id) }]
}

export function equipCommand(world: World, words: string): Output[] {
  const c = character(world)
  if (!c) return [{ kind: 'error', text: 'This world has no rules for characters.' }]
  const w = words.toLowerCase().trim()
  const item = [...world.content.items.values()].find((i) => (i.weapon || i.armour) && (i.id === w || i.name === w || i.aliases.includes(w)))
  if (!item || !world.state.player.inventory[item.id]) return [{ kind: 'error', text: `You have no ${words} to take up.` }]
  const text = equip(world.content, c, item.id)
  c.hp = Math.min(c.hp, maxHp(world.content, c))
  return [{ kind: 'text', text }]
}

// ---------------------------------------------------------------- rest

/** Time heals (FO, chapter 11): a little every hour, all of it after a night's sleep. */
export function rest(world: World, minutes: number, slept = false): void {
  const c = world.state.player.character
  if (!c) return
  const max = maxHp(world.content, c)
  if (slept) {
    c.hp = max
    // For LOOK ME (M10.4): how long since the last sleep.
    world.state.player.sleptAt = world.now
    delete c.conditions['sickened']
    // The Feather Bed (Mother Holle): a full night clears every ailment but curses.
    if (blessed(world.content, c, 'The Feather Bed')) {
      for (const name of Object.keys(c.conditions)) if (name !== 'cursed' && name !== 'catform') delete c.conditions[name]
      const until = world.state.player.conditionsUntil ?? {}
      for (const name of Object.keys(until)) if (name !== 'cursed' && name !== 'catform') delete until[name]
    }
    return
  }
  const hours = Math.floor(((c.restMinutes ?? 0) + minutes) / 60)
  c.restMinutes = ((c.restMinutes ?? 0) + minutes) % 60
  if (hours > 0) c.hp = Math.min(max, c.hp + hours * Math.max(2, c.level))
}

// ---------------------------------------------------------------- patrons (WB, chapter 5)

export function patronCommand(world: World, words: string): Output[] {
  const c = character(world)
  if (!c) return [{ kind: 'error', text: 'This world has no rules for characters.' }]
  const patrons = rulesOf(world.content).patrons
  const w = words.toLowerCase().replace(/^(to|yourself to)\s+/, '').replace(/^the\s+/, '').trim()
  const p = patrons.find((x) => x.id === w.replace(/\s+/g, '_') || x.name.toLowerCase().replace(/^the\s+/, '') === w)
  if (!p) return [{ kind: 'system', text: `DEVOTE TO <patron>: ${patrons.map((x) => `${x.name} (${x.text})`).join('; ')}.` }]
  if (c.patron?.id === p.id) return [{ kind: 'error', text: `You already follow ${p.name}.` }]
  const here = world.location(world.state.player.location)
  if (!here.tags.includes('holy')) return [{ kind: 'error', text: 'You swear yourself to a patron at a holy place: a chapel, a church, an old barrow.' }]
  const before = c.patron && patrons.find((x) => x.id === c.patron!.id)
  c.patron = { id: p.id, favour: 5, since: world.now }
  approve(world, p.id === 'lantern' ? 'fight_witchcraft' : 'old_rite')
  return [{ kind: 'text', text: `${before ? `You turn from ${before.name}. ` : ''}You swear yourself to ${p.name}. ${p.text}` }]
}

/** A deed a patron cares about: favour up, or down for what it forbids. */
export function favour(world: World, deed: string): void {
  const c = world.state.player.character
  if (!c?.patron) return
  const p = rulesOf(world.content).patrons.find((x) => x.id === c.patron!.id)
  if (!p) return
  const delta = p.values[deed] ?? p.forbids[deed] ?? 0
  if (!delta) return
  const before = c.patron.favour
  c.patron.favour = Math.max(0, Math.min(100, before + delta))
  for (const b of p.blessings) {
    if (before < b.at && c.patron.favour >= b.at) notice(world, `${cap(p.name)} is pleased with you: ${b.name}. ${b.text}`)
    if (before >= b.at && c.patron.favour < b.at) notice(world, `${cap(p.name)} turns from you: ${b.name} is gone.`)
  }
  if (delta < 0) notice(world, `${cap(p.name)} is displeased.`)
}

export function pray(world: World): Output[] {
  const c = character(world)
  if (!c?.patron) return [{ kind: 'text', text: 'You say a prayer to nobody in particular.' }]
  const p = rulesOf(world.content).patrons.find((x) => x.id === c.patron!.id)!
  const day = Math.floor(world.now / (24 * 60))
  const here = world.location(world.state.player.location)
  if (c.patron.prayed === day) return [{ kind: 'text', text: `You pray to ${p.name} again. It is quiet in you.` }]
  c.patron.prayed = day
  if (here.tags.includes('holy')) favour(world, 'pray')
  return [{ kind: 'text', text: `You pray to ${p.name}${here.tags.includes('holy') ? ', here where the old words are said' : ''}.` }]
}

// ---------------------------------------------------------------- the Way of the Grey Rider (FO, chapter 12)

/**
 * Death: a short walk beside the Wild Hunt, then back. A day later you wake
 * where you last slept or at the nearest holy place, with half your money
 * lying where you fell and the Rider's Mark on you.
 */
export function greyRider(world: World, deathPlace: string, pass: (minutes: number) => Output[]): Output[] {
  const c = character(world)!
  const player = world.state.player
  // The Rider's Share (the Grey Rider, favour 75): once, you do not die; the price comes later.
  if (useBlessing(world.content, c, "The Rider's Share", world.now, ONCE.ever)) {
    c.hp = Math.max(1, Math.floor(maxHp(world.content, c) / 4))
    c.mark = true
    player.riderPrice = true
    return [{ kind: 'narration', text: 'A hand in a grey glove on your shoulder, and a voice like wind in stubble: "Not yet. But I will want my share." You open your eyes where you fell. The Rider\'s Mark is on you, and no rite will lift it until you leave him the last sheaf at a crossroads.' }]
  }
  c.deaths += 1
  const lost = Math.floor(player.money / 2)
  player.money -= lost
  if (lost > 0) player.lostPurse = { location: deathPlace, amount: lost, t: world.now }
  c.mark = true
  const patron = c.patron && rulesOf(world.content).patrons.find((p) => p.id === c.patron!.id)
  const sender = patron && patron.id !== 'grey_rider' ? patron.name : 'the Rider'
  const lines: Output[] = [
    {
      kind: 'narration',
      text: `You are walking on a road of grey light, and there are hooves around you, and hounds, and a wind that does not touch the grass. The Wild Hunt rides past, and one rider turns his head: the Grey Rider himself, his face in the shadow of his hat. He looks at you a long time. Then ${sender === 'the Rider' ? 'he' : sender} points back the way you came.`,
    },
  ]
  const holy = [...world.content.locations.values()].filter((l) => l.tags.includes('holy') && !l.tags.includes('haunted'))
  let wake = player.lodging?.location
  if (!wake) {
    let best = Infinity
    for (const l of holy) {
      const r = world.content.locations.has(deathPlace) ? world.route(deathPlace, l.id) : undefined
      const minutes = r ? r.minutes : Infinity
      if (minutes < best) {
        best = minutes
        wake = l.id
      }
    }
    wake ??= holy[0]?.id ?? world.content.world.start.location
  }
  player.location = wake
  pass(24 * 60)
  c.hp = maxHp(world.content, c)
  c.conditions = {}
  lines.push({ kind: 'narration', text: 'You wake a day later, cold to the bone, with the taste of earth in your mouth.' })
  lines.push({ kind: 'system', text: `The Rider's Mark is on you: 10% fewer hit points until you perform a RITE for the dead at a barrow or a chapel.${lost ? ` Half your money (${lost} duiten) lies where you fell.` : ''}` })
  if (c.deaths >= 3) {
    player.riderPrice = true
    lines.push({ kind: 'narration', text: 'Before you open your eyes you hear him, close by: "Three times now. The next time I let you go, there is a price."' })
  }
  return lines
}

export function rite(world: World): Output[] {
  const c = character(world)
  if (!c) return [{ kind: 'error', text: 'This world has no rules for characters.' }]
  const here = world.location(world.state.player.location)
  if (!here.tags.includes('holy')) return [{ kind: 'error', text: 'A rite for the dead is performed at a barrow or a chapel.' }]
  // A curse lifts at a holy place too (M7.2).
  if (c.conditions['cursed']) {
    delete c.conditions['cursed']
    delete world.state.player.conditionsUntil?.['cursed']
    if (!c.mark) return [{ kind: 'text', text: 'You say the old words at the holy place, and the wet-wool weight lifts off your shoulders. The curse is gone.' }]
  }
  if (!c.mark) return [{ kind: 'text', text: 'You say the old words for the dead. Nobody answers.' }]
  if (world.state.player.riderPrice) return [{ kind: 'text', text: 'The words do not take. The Rider wants his price first: the last sheaf, left for him at a crossroads.' }]
  delete c.mark
  favour(world, 'honour_dead')
  c.hp = Math.min(maxHp(world.content, c), c.hp + 5)
  return [{ kind: 'text', text: 'You pour out a little water, say the names of the dead you know, and ask the Rider for your share of the light. The cold goes out of your bones. The Mark is gone.' }]
}

/**
 * The Rider's price (Wereldboek, "The last sheaf for the Grey Rider"): a sack
 * of rye left at a crossroads. Then the Mark can be lifted again, and the
 * Rider is paid.
 */
export function leaveSheaf(world: World): Output[] {
  const player = world.state.player
  const here = world.location(player.location)
  if (!/crossroads/i.test(here.name) && !here.tags.includes('crossroads')) return [{ kind: 'error', text: 'The last sheaf is left where roads cross.' }]
  if ((player.inventory['rye_grain'] ?? 0) < 1) return [{ kind: 'error', text: 'You have no rye to leave: a sack of it will do for a sheaf.' }]
  player.inventory['rye_grain']! -= 1
  if (!player.inventory['rye_grain']) delete player.inventory['rye_grain']
  if (!player.riderPrice) return [{ kind: 'narration', text: 'You leave the rye at the foot of the post. The wind takes a few grains. Nobody else takes anything.' }]
  delete player.riderPrice
  const c = character(world)
  if (c) delete c.mark
  favour(world, 'honour_dead')
  return [{ kind: 'narration', text: 'You set the rye at the foot of the post, where three tracks cross. The wind goes still, then gusts once, hard, from the north, and the sack is lighter than it was. The Rider is paid. The cold goes out of your bones.' }]
}

/** Coming back to where you fell: the purse may still lie there, unless someone passed first. */
export function findPurse(world: World): Output[] {
  const lost = world.state.player.lostPurse
  if (!lost || lost.location !== world.state.player.location) return []
  delete world.state.player.lostPurse
  const days = (world.now - lost.t) / (24 * 60)
  if (days < 1.5 || world.rng.next('purse') < Math.pow(0.5, days)) {
    world.state.player.money += lost.amount
    return [{ kind: 'narration', text: `Your purse lies in the mud where you fell, ${lost.amount} duiten still in it.` }]
  }
  return [{ kind: 'narration', text: 'Your purse is gone from where you fell. Someone found it first.' }]
}

// ---------------------------------------------------------------- progress clocks (FO, chapter 11)

export interface Clock {
  id: string
  name: string
  size: 4 | 6 | 8
  filled: number
  /** What happens when it is full, for the journal. */
  full: string
  t: number
  done?: number
}

export function addClock(world: World, clock: Omit<Clock, 'filled' | 't'>): Clock {
  const clocks = (world.state.clocks ??= {})
  clocks[clock.id] ??= { ...clock, filled: 0, t: world.now }
  return clocks[clock.id] as Clock
}

/** Fills a clock by some segments; returns true when it has just become full. */
export function tickClock(world: World, id: string, segments = 1): boolean {
  const clock = world.state.clocks?.[id] as Clock | undefined
  if (!clock || clock.done !== undefined) return false
  clock.filled = Math.min(clock.size, clock.filled + segments)
  if (clock.filled >= clock.size) {
    clock.done = world.now
    return true
  }
  return false
}

export function clockLine(clock: Clock): string {
  return `${clock.name} [${'#'.repeat(clock.filled)}${'.'.repeat(clock.size - clock.filled)}] ${clock.filled}/${clock.size}`
}

export { ATTRIBUTE_CAP, boostsFor, extraSkills }


// ---------------------------------------------------------------- dangers outside fights (FO, chapter 12; M7.2)

/** Each morning: Fen Fever takes another point of Might, up to five, until herbs cure it. */
export function conditionsDay(world: World): void {
  const c = world.state.player.character
  if (!c?.conditions['fen_fever']) return
  c.conditions['fen_fever'] = Math.min(5, c.conditions['fen_fever'] + 1)
  notice(world, `Fen Fever: you are weaker again this morning (Might -${c.conditions['fen_fever']}). Herbs would help; Aaltje has them.`)
}

/** A night out in the fen: the damp may bring Fen Fever (Survival against DC 13, 15 in the rain). */
export function nightOut(world: World): Output[] {
  const c = character(world)
  if (!c || c.conditions['fen_fever']) return []
  const ancestry = rulesOf(world.content).ancestries.find((a) => a.id === c.ancestry)
  if (ancestry?.immune?.includes('fen_fever')) return []
  const wet = world.state.weather?.kind === 'rain' || world.state.weather?.kind === 'storm'
  const result = playerCheck(world, 'survival', wet ? 15 : 13)
  if (result.degree === 'success' || result.degree === 'critical success') return []
  c.conditions['fen_fever'] = 1
  return [{ kind: 'narration', text: 'You wake shivering, with a taste of marsh water in your mouth. Fen Fever: every morning it takes a little more of your strength, until herbs cure it.' }]
}

/** Sinking in soft ground: Athletics against DC 14, or you are Mired until you work free. */
export function sink(world: World): string {
  const c = character(world)
  if (!c) return 'The ground gives way under you and you sink to the knee. It takes a while to work free.'
  if ((world.state.companions ?? []).some((m) => !m.away)) return 'The ground gives way under you and you sink to the thigh, but hands grab your collar and haul you out.'
  const result = playerCheck(world, 'athletics', 14)
  if (result.degree === 'success' || result.degree === 'critical success') return 'The ground gives way under you and you sink to the knee. It takes a while to work free.'
  if (useBlessing(world.content, c, 'Unbroken', world.now, ONCE.day)) return 'The fen takes you to the waist, and something old and stubborn in you will not have it. You tear free.'
  c.conditions['mired'] = 1
  return 'The fen takes you to the waist and holds on. You are Mired: STRUGGLE to work free.'
}

/** STRUGGLE: Athletics against DC 13, ten minutes a try. */
export function struggle(world: World, pass: (minutes: number) => Output[]): Output[] {
  const c = character(world)
  if (!c?.conditions['mired']) return [{ kind: 'text', text: 'You are not stuck in anything.' }]
  const result = playerCheck(world, 'athletics', 13)
  const seen = pass(10)
  if (result.degree === 'success' || result.degree === 'critical success') {
    delete c.conditions['mired']
    return [{ kind: 'check', text: `(Athletics ${result.total} vs DC 13: ${result.degree})` }, { kind: 'narration', text: 'With a sound like a cow pulling out of a ditch, the fen lets you go. You are black to the hips.' }, ...seen]
  }
  return [{ kind: 'check', text: `(Athletics ${result.total} vs DC 13: ${result.degree})` }, { kind: 'narration', text: 'You heave and sink a little deeper. The water is cold.' }, ...seen]
}

/**
 * Why the stranger is here (M10.9): the reason of their background, told after
 * the world's own opening; whom they were told to ask for, in the journal as
 * such; and what they heard that brought them, in the journal from the start.
 * Nothing for a background without a reason (an old save plays on as it was).
 */
export function arrival(world: World): Output[] {
  const c = character(world)
  const background = c ? world.content.rules?.backgrounds.find((b) => b.id === c.background) : undefined
  if (!background?.reason) return []
  const journal = (world.state.player.journal ??= {})
  const out: Output[] = [{ kind: 'text', text: background.reason }]
  if (background.heard && (world.content.topics.has(background.heard) || world.content.npcs.has(background.heard) || world.content.locations.has(background.heard))) journal[background.heard] ??= world.now
  const contact = background.contact && world.content.npcs.has(background.contact) ? world.npc(background.contact) : undefined
  if (contact) {
    world.state.player.contact = contact.id
    journal[contact.id] ??= world.now
    const sources = ((world.state.player.sources ??= {})[contact.id] ??= [])
    if (!sources.some((s) => s.from === 'told')) sources.push({ from: 'told', t: world.now, level: 1 })
    // At an inn, in a village; "the" small in the middle of a sentence.
    const area = world.content.areas.get(world.location(contact.home).area)
    const where = area && area.kind !== 'wilderness' && area.kind !== 'route' ? ` ${area.kind === 'inn' ? 'at' : 'in'} ${area.name.replace(/^The /, 'the ')}` : ''
    out.push({ kind: 'system', text: `You were told to ask for ${contact.short}${where}. The name is in your journal.` })
  }
  return out
}
