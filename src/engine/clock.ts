// Game time in whole minutes. A year has twelve months of 30 days plus five
// days over (month 13); the names of months, weekdays and era are the
// world's own (world.yaml calendar), the week as long as it names days.

/**
 * The names of a world's calendar (M8). Since M10.17 its weekdays are what
 * schedules, opening days and market days use, and the week has as many days
 * as it names; the year stays twelve months of thirty days and five over.
 */
export interface Calendar {
  era: string
  months: readonly string[]
  weekdays: readonly string[]
  /** A day (counted from year 0) that is the first day of the week; see calendarOf. Without it, day 0. */
  anchor?: number
  /** The weekday the world's start date falls on, by name; without it, the first (M10.17). */
  start_weekday?: string
}
/** The calendar of a world that names none (M10.17): plain names, never another world's. */
export const DEFAULT_CALENDAR: Calendar = {
  era: '',
  months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', "Year's End"],
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
}

/** Which day of the world's week it is, from 0; the week is as long as the calendar names days. */
export function weekIndex(minutes: number, calendar: Calendar = DEFAULT_CALENDAR): number {
  const n = calendar.weekdays.length || 7
  return (((Math.floor(minutes / MINUTES_PER_DAY) - (calendar.anchor ?? 0)) % n) + n) % n
}

/**
 * A world's calendar with its week anchored (M10.17): the start date is the
 * first day of the week, or the weekday the calendar names for it (the
 * Nethermarch starts on a Dinsdag). Before, every world's week was anchored on
 * the Nethermarch's start.
 */
export function calendarOf(world: { calendar?: Calendar | undefined; start: { year: number; month: number; day: number } }): Calendar {
  const calendar = world.calendar ?? DEFAULT_CALENDAR
  const first = calendar.start_weekday ? Math.max(0, calendar.weekdays.indexOf(calendar.start_weekday)) : 0
  return { ...calendar, anchor: dayIndex(world.start.year, world.start.month, world.start.day) - first }
}

/** The weekday as the world calls it (M10.17): what schedules and opening days are written in. */
export function weekdayName(minutes: number, calendar: Calendar = DEFAULT_CALENDAR): string {
  return calendar.weekdays[weekIndex(minutes, calendar)] ?? ''
}

/** A day of rest: the last day of the world's week (the Nethermarch's Rustdag). */
export function isRestDay(minutes: number, calendar: Calendar = DEFAULT_CALENDAR): boolean {
  return weekIndex(minutes, calendar) === (calendar.weekdays.length || 7) - 1
}

export type DayPart = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'

const MINUTES_PER_DAY = 24 * 60
const DAYS_PER_YEAR = 365

function dayIndex(year: number, month: number, day: number): number {
  return year * DAYS_PER_YEAR + (month - 1) * 30 + (day - 1)
}

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

export function isOpenAt(minutes: number, hours: string | undefined, days?: readonly string[], calendar: Calendar = DEFAULT_CALENDAR): boolean {
  if (!hours) return true
  // The days in the world's own names (M10.17).
  if (days && !days.includes(weekdayName(minutes, calendar))) return false
  const [from, to] = parseHours(hours)
  const now = minuteOfDay(minutes)
  return from <= to ? now >= from && now < to : now >= from || now < to
}

/** The first minute at or after `minutes` when the hours allow it, within a week. */
export function nextOpening(minutes: number, hours: string | undefined, days?: readonly string[], calendar: Calendar = DEFAULT_CALENDAR): number | undefined {
  if (isOpenAt(minutes, hours, days, calendar)) return minutes
  if (!hours) return minutes
  const [from] = parseHours(hours)
  for (let d = 0; d <= (calendar.weekdays.length || 7); d++) {
    const candidate = startOfDay(minutes) + d * MINUTES_PER_DAY + from
    if (candidate >= minutes && isOpenAt(candidate, hours, days, calendar)) return candidate
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
      dayPart: dayPartOf(hour),
    }
  }

  get isNight(): boolean {
    return this.parts.dayPart === 'night'
  }

  format(calendar: Calendar = DEFAULT_CALENDAR): string {
    const p = this.parts
    const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    return `${weekdayName(this.minutes, calendar)} ${p.day} ${calendar.months[p.month - 1]} ${p.year}${calendar.era ? ` ${calendar.era}` : ''}, ${time} (${p.dayPart})`
  }

  /** "Tuesday 14 September, 18:30", without the year. */
  short(calendar: Calendar = DEFAULT_CALENDAR): string {
    const p = this.parts
    return `${weekdayName(this.minutes, calendar)} ${p.day} ${calendar.months[p.month - 1]}, ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
}
