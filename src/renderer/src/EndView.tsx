import { useEffect, useState } from 'react'
import type { EngineClient } from './client'
import { t } from './i18n'
import { useWindow } from './windows'

// The end of a game (design: lore and world change, "Wat de speler ziet"): the
// player's own log and the true chronicle, each to read and to download. The
// chronicle tells what the player never found out, so it asks first.

export function EndView({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const [texts, setTexts] = useState<{ log?: string; chronicle: string }>()
  const [tab, setTab] = useState<'log' | 'chronicle'>('chronicle')

  // A window of the stack (M10.33 A): Escape closes it when it is on top.
  useWindow(onClose)

  const download = (text: string, name: string) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }))
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const shown = tab === 'log' ? texts?.log : texts?.chronicle
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('end.title')}>
      <div className="panel settings">
        <header className="panel-head">
          <h2>{t('end.title')}</h2>
          {texts && (
            <nav className="tabs">
              <button type="button" className={tab === 'chronicle' ? 'active' : ''} onClick={() => setTab('chronicle')}>
                {t('end.tabs.chronicle')}
              </button>
              <button type="button" className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
                {t('end.tabs.log')}
              </button>
            </nav>
          )}
          <button type="button" className="link" onClick={onClose}>
            [{t('end.close')}]
          </button>
        </header>
        {!texts ? (
          <div className="settings-body">
            <p>{t('end.ask.warning')}</p>
            <div className="row">
              <button type="button" className="link" onClick={() => void client.end().then(setTexts)}>
                [{t('end.ask.show')}]
              </button>
              <button type="button" className="link" onClick={onClose}>
                [{t('end.ask.notYet')}]
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-body">
            {shown ? <pre className="end-text">{shown}</pre> : <p className="muted">{t('end.text.noLog')}</p>}
            {shown && (
              <button
                type="button"
                className="link"
                onClick={() => (tab === 'log' && client.exportLog ? void client.exportLog() : download(shown, tab === 'log' ? 'wisplight-log.txt' : 'wisplight-chronicle.txt'))}
              >
                [{t('end.text.download')}]
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
