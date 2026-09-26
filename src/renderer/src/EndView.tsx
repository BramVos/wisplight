import { useEffect, useState } from 'react'
import type { EngineClient } from './client'

// The end of a game (design: lore and world change, "Wat de speler ziet"): the
// player's own log and the true chronicle, each to read and to download. The
// chronicle tells what the player never found out, so it asks first.

export function EndView({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const [texts, setTexts] = useState<{ log?: string; chronicle: string }>()
  const [tab, setTab] = useState<'log' | 'chronicle'>('chronicle')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const download = (text: string, name: string) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }))
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const shown = tab === 'log' ? texts?.log : texts?.chronicle
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Look back">
      <div className="panel settings">
        <header className="panel-head">
          <h2>Look back</h2>
          {texts && (
            <nav className="tabs">
              <button type="button" className={tab === 'chronicle' ? 'active' : ''} onClick={() => setTab('chronicle')}>
                The chronicle
              </button>
              <button type="button" className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>
                Your log
              </button>
            </nav>
          )}
          <button type="button" className="link" onClick={onClose}>
            [Close]
          </button>
        </header>
        {!texts ? (
          <div className="settings-body">
            <p>The chronicle tells everything that really happened, also what you never found out, and which stories were not true. You can play on afterwards, but you will know.</p>
            <div className="row">
              <button type="button" className="link" onClick={() => void client.end().then(setTexts)}>
                [Show me]
              </button>
              <button type="button" className="link" onClick={onClose}>
                [Not yet]
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-body">
            {shown ? <pre className="end-text">{shown}</pre> : <p className="muted">Your log is kept by the desktop app.</p>}
            {shown && (
              <button type="button" className="link" onClick={() => download(shown, tab === 'log' ? 'wisplight-log.txt' : 'wisplight-chronicle.txt')}>
                [Download]
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
