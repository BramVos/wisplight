// Game time in whole minutes. A year has twelve months of 30 days plus
// five Dyke Days (month 13). Years count After the Wolf (AW).

export const MONTHS = [
  'Louwmaand',
  'Sprokkelmaand',
  'Lentemaand',
  'Grasmaand',
  'Bloeimaand',
  'Zomermaand',
  'Hooimaand',
  'Oogstmaand',
  'Herfstmaand',
  'Wijnmaand',
  'Slachtmaand',
  'Wintermaand',
  'Dijkdagen',
] as const

export const WEEKDAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Rustdag'] as const

/** The names of a world's calendar (M8); the ids above stay what schedules use. */
export interface Calendar {
  era: string
  months: readonly string[]
  weekdays: readonly string[]
}
export const DEFAULT_CALENDAR: Calendar = { era: 'AW', months: MONTHS, weekdays: WEEKDAYS }

/** A weekday as the world calls it. */
export function dayName(weekday: (typeof WEEKDAYS)[number], calendar: Calendar = DEFAULT_CALENDAR): string {
  return calendar.weekdays[WEEKDAYS.indexOf(weekday)] ?? weekday
}

export type DayPart = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'

const MINUTES_PER_DAY = 24 * 60
const DAYS_PER_YEAR = 365

function dayIndex(year: number, month: number, day: number): number {
  return year * DAYS_PER_YEAR + (month - 1) * 30 + (day - 1)
}

// Anchor the week so that the day the game starts, 14 Herfstmaand 211 AW, is a Dinsdag.
const WEEKDAY_OFFSET = (1 - (dayIndex(211, 9, 14) % 7) + 7) % 7

export function dayPartOf(hour: number): DayPart {
  if (hour >= 22 || hour < 5) return 'night'
  if (hour < 7) return 'dawn'
  if (hour < 12) return 'morning'
  if (hour < 14) return 'midday'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export const MINUTES_PER_HOUR = 60
export { MINUTES_PER_DAY }

export function weekdayOf(minutes: number): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[(Math.floor(minutes / MINUTES_PER_DAY) + WEEKDAY_OFFSET) % 7]!
}

export function minuteOfDay(minutes: number): number {
  return minutes - Math.floor(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY
}

export function startOfDay(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY
}

/** "07-18" or "04:30-12:00" to minutes after midnight. */
export function parseHours(hours: string): [number, number] {
  const [from = '0', to = '24'] = hours.split('-')
  const toMinutes = (value: string) => {
    const [h = '0', m = '0'] = value.split(':')
    return Number(h) * 60 + Number(m)
  }
  return [toMinutes(from), toMinutes(to)]
}

export function isOpenAt(minutes: number, hours: string | undefined, days?: readonly string[]): boolean {
  if (!hours) return true
  if (days && !days.includes(weekdayOf(minutes))) return false
  const [from, to] = parseHours(hours)
  const now = minuteOfDay(minutes)
  return from <= to ? now >= from && now < to : now >= from || now < to
}

/** The first minute at or after `minutes` when the hours allow it, within a week. */
export function nextOpening(minutes: number, hours: string | undefined, days?: readonly string[]): number | undefined {
  if (isOpenAt(minutes, hours, days)) return minutes
  if (!hours) return minutes
  const [from] = parseHours(hours)
  for (let d = 0; d <= 7; d++) {
    const candidate = startOfDay(minutes) + d * MINUTES_PER_DAY + from
    if (candidate >= minutes && isOpenAt(candidate, hours, days)) return candidate
  }
  return undefined
}

export class GameClock {
  constructor(public minutes: number) {}

  static from(year: number, month: number, day: number, hour: number, minute = 0): GameClock {
    return new GameClock(dayIndex(year, month, day) * MINUTES_PER_DAY + hour * 60 + minute)
  }

  advance(minutes: number): void {
    this.minutes += Math.max(0, Math.round(minutes))
  }

  get parts() {
    const days = Math.floor(this.minutes / MINUTES_PER_DAY)
    const minuteOfDay = this.minutes - days * MINUTES_PER_DAY
    const year = Math.floor(days / DAYS_PER_YEAR)
    const dayOfYear = days - year * DAYS_PER_YEAR
    const month = Math.min(13, Math.floor(dayOfYear / 30) + 1)
    const day = dayOfYear - (month - 1) * 30 + 1
    const hour = Math.floor(minuteOfDay / 60)
    return {
      year,
      month,
      day,
      hour,
      minute: minuteOfDay % 60,
      weekday: WEEKDAYS[(days + WEEKDAY_OFFSET) % 7]!,
      dayPart: dayPartOf(hour),
    }
  }

  get isNight(): boolean {
    return this.parts.dayPart === 'night'
  }

  format(calendar: Calendar = DEFAULT_CALENDAR): string {
    const p = this.parts
    const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    return `${dayName(p.weekday, calendar)} ${p.day} ${calendar.months[p.month - 1]} ${p.year} ${calendar.era}, ${time} (${p.dayPart})`
  }

  /** "Dinsdag 14 Herfstmaand, 18:30", without the year. */
  short(calendar: Calendar = DEFAULT_CALENDAR): string {
    const p = this.parts
    return `${dayName(p.weekday, calendar)} ${p.day} ${calendar.months[p.month - 1]}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
}
