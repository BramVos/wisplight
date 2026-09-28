import { useEffect, useRef, useState } from 'react'
import type { Output } from '../../engine'
import type { EngineClient } from './client'
import { t } from './i18n'

// A moment (M10.11): a card over the log for what deserves more than a line.
// A place worth it the first time you reach it or see it rise from afar, a
// tiding that changes things. The picture of the place when pictures are on,
// or a fixed drawing; Enter, Escape or a click closes it, and the clock
// stands still while it is open, as with a menu.

type Card = NonNullable<Output['card']>

/** The fixed drawing when there is no picture: a horizon, a rise, a light for a place; a sealed letter for a tiding. */
function Drawing({ kind }: { kind: Card['kind'] }) {
  if (kind === 'tidings')
    return (
      <svg viewBox="0 0 120 80" className="moment-drawing" aria-hidden="true">
        <rect x="22" y="18" width="76" height="46" rx="3" />
        <path d="M22 20 L60 46 L98 20" fill="none" />
        <circle cx="60" cy="50" r="7" className="seal" />
      </svg>
    )
  return (
    <svg viewBox="0 0 120 80" className="moment-drawing" aria-hidden="true">
      <path d="M0 62 H120" fill="none" />
      <path d="M8 62 Q34 40 58 50 T112 62" fill="none" />
      <path d="M70 50 V26 M64 30 H76" fill="none" />
      {kind === 'sighting' && <path d="M0 70 H120 M12 76 H108" fill="none" className="mist" />}
    </svg>
  )
}

export function MomentCard({ card, client, onClose, onPage }: { card: Card; client: EngineClient; onClose: () => void; onPage?: (id: string) => void }) {
  const [picture, setPicture] = useState<string>()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let live = true
    setPicture(undefined)
    if (card.picture && client.picture) void client.picture(card.picture).then((url) => live && setPicture(url))
    closeRef.current?.focus()
    return () => {
      live = false
    }
  }, [card, client])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="overlay moment-overlay" onClick={onClose} role="presentation">
      <section className={`moment ${card.kind}`} role="dialog" aria-modal="true" aria-label={card.title} onClick={onClose}>
        {picture ? <img src={picture} alt="" className="moment-picture" /> : <Drawing kind={card.kind} />}
        <p className="moment-kind">{t(`app.moment.${card.kind}`)}</p>
        <h2>{card.title}</h2>
        <p className="moment-text">{card.text}</p>
        {card.from && <p className="moment-from muted">{card.from}</p>}
        <div className="moment-actions">
          {card.link && onPage && (
            <button
              type="button"
              className="link"
              onClick={(event) => {
                event.stopPropagation()
                onPage(card.link!)
              }}
            >
              {t('app.moment.journal')}
            </button>
          )}
          <button type="button" className="link" ref={closeRef} onClick={onClose}>
            {t('app.moment.close')}
          </button>
        </div>
      </section>
    </div>
  )
}
