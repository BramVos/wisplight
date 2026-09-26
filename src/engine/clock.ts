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

  format(): string {
    const p = this.parts
    const time = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
    return `${p.weekday} ${p.day} ${MONTHS[p.month - 1]} ${p.year} AW, ${time} (${p.dayPart})`
  }
}
