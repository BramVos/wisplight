import type { Reply } from './client'
import { t } from './i18n'

// The day and the hour at the top right (M10.8), from the world's own
// calendar, with a sun, dusk or a moon, so you see at once whether it is day
// or night; the weather under it with the wind. The status line at the bottom
// stays as it is.

type Clock = Reply['status']['clock']

function Sky({ light }: { light: Clock['light'] }) {
  if (light === 'night')
    return (
      <svg viewBox="0 0 24 24" className="clock-icon night" aria-hidden="true">
        <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15 7 7 0 0 1-5-15z" />
      </svg>
    )
  if (light === 'dusk')
    return (
      <svg viewBox="0 0 24 24" className="clock-icon dusk" aria-hidden="true">
        <path d="M5 17a7 7 0 0 1 14 0z" />
        <path d="M2 19h20" strokeWidth="1.6" fill="none" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" className="clock-icon day" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d="M12 2.5v3" transform={`rotate(${a} 12 12)`} strokeWidth="1.6" fill="none" />
      ))}
    </svg>
  )
}

function Weather({ kind }: { kind: string }) {
  const cloud = <path d="M7 17h10a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.5 1.5A3.3 3.3 0 0 0 7 17z" />
  const lines = (d: string) => <path d={d} strokeWidth="1.6" fill="none" />
  return (
    <svg viewBox="0 0 24 24" className={`clock-icon weather ${kind}`} aria-hidden="true">
      {kind === 'clear' && <circle cx="12" cy="12" r="5" />}
      {(kind === 'cloudy' || kind === 'rain' || kind === 'storm' || kind === 'snow') && cloud}
      {kind === 'rain' && lines('M9 19l-1 3M13 19l-1 3M17 19l-1 3')}
      {kind === 'storm' && lines('M12 17l-2 4h3l-2 3')}
      {kind === 'snow' && lines('M9 20h.1M13 21h.1M17 20h.1')}
      {kind === 'mist' && lines('M4 9h16M3 13h18M5 17h14')}
      {kind === 'frost' && lines('M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9')}
    </svg>
  )
}

export function ClockPanel({ clock }: { clock: Clock }) {
  return (
    <section className="clock" aria-label={t('app.clock.label', { weekday: clock.weekday, date: clock.date, time: clock.time, weather: clock.weather })}>
      <div className="clock-row">
        <Sky light={clock.light} />
        <span>
          {clock.weekday} {clock.date}
        </span>
        <span className="clock-time">{clock.time}</span>
      </div>
      {clock.weather && (
        <div className="clock-row small muted">
          <Weather kind={clock.weather} />
          <span>{clock.weather}</span>
          <span>{clock.wind}</span>
        </div>
      )}
    </section>
  )
}
