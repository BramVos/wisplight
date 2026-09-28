import { useState } from 'react'
import type { SaveEntry, WorldChoice } from './client'
import { choosable, describeSave } from './SavesView'
import { t } from './i18n'

// A new game begins with the world (M8): the content folder can hold more
// than one, and each has its own story. The first paragraph of a world's
// opening text is its description here. Since M10.20 a world with a save
// offers [Continue] at the top, with what the last save is, then [New game]
// (asked once more, as the saves stay) and [Load a save...].

const blurb = (intro?: string) => intro?.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim()

export function WorldPicker({
  worlds,
  saves = [],
  onPick,
  onContinue,
  onLoad,
  onImport,
  note,
  onClose,
}: {
  worlds: WorldChoice[]
  saves?: SaveEntry[]
  onPick: (folder: string) => void
  onContinue?: (folder: string) => void
  /** The load screen for a world. */
  onLoad?: (folder: string) => void
  onImport?: () => void
  note?: string
  /** Back to the game in play, when the picker was opened from the menu. */
  onClose?: () => void
}) {
  const [asking, setAsking] = useState<string>()
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('worlds.picker.label')}>
      <div className="panel settings creation worlds">
        <header className="panel-head">
          <h2>{t('worlds.picker.title')}</h2>
          <span className="muted small">{t('worlds.picker.hint')}</span>
          {onClose && (
            <button type="button" className="link" onClick={onClose}>
              [{t('worlds.picker.back')}]
            </button>
          )}
        </header>
        <div className="choices">
          {worlds.map((w) => {
            const own = saves.filter((s) => s.world === w.id)
            const last = own[0]
            const loadable = choosable(own).length
            return (
              <div key={w.folder} className={`choice ${w.current ? 'active' : ''}`}>
                <strong>{w.name}</strong>
                {blurb(w.intro) && <span className="muted small">{blurb(w.intro)}</span>}
                {last && onContinue && (
                  <button type="button" className="link" onClick={() => onContinue(w.folder)} autoFocus={w.current}>
                    [{t('worlds.picker.continue')}] <span className="muted small">{describeSave(last)}</span>
                  </button>
                )}
                {asking === w.folder ? (
                  <span className="small">
                    {t('worlds.picker.confirm')}{' '}
                    <button type="button" className="link" data-world={w.folder} onClick={() => onPick(w.folder)} autoFocus>
                      [{t('worlds.picker.confirmYes')}]
                    </button>{' '}
                    <button type="button" className="link" onClick={() => setAsking(undefined)}>
                      [{t('worlds.picker.cancel')}]
                    </button>
                  </span>
                ) : (
                  <button type="button" className="link" data-world={w.folder} onClick={() => (last ? setAsking(w.folder) : onPick(w.folder))} autoFocus={w.current && !last}>
                    [{last ? t('worlds.picker.newGame') : t('worlds.picker.begin')}]
                  </button>
                )}
                {loadable > 0 && onLoad && (
                  <button type="button" className="link" onClick={() => onLoad(w.folder)}>
                    [{t('worlds.picker.load')}]
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {onImport && (
          <p>
            <button type="button" className="link" onClick={onImport}>
              [{t('worlds.picker.import')}]
            </button>
          </p>
        )}
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
  )
}
