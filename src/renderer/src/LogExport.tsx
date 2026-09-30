import { useEffect, useState } from 'react'
import type { EngineClient, LogScope } from './client'
import { t, tn } from './i18n'
import { useWindow } from './windows'

// Saving a copy of the game log (FO, chapter 3, "Het spellogboek"). The log
// itself stays where it is; this writes a copy wherever the player wants it.
// Up to 10 MB that is one text file, above it a zip with parts of 10 MB.

const PART_BYTES = 10 * 1024 * 1024

const CHOICES: { id: string; label: () => string; scope: LogScope }[] = [
  { id: 'all', label: () => t('logexport.scope.all'), scope: { kind: 'all' } },
  { id: 'loaded', label: () => t('logexport.scope.loaded'), scope: { kind: 'loaded' } },
  { id: 'week', label: () => t('logexport.scope.week'), scope: { kind: 'days', days: 7 } },
]

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return t('logexport.size.kb', { size: Math.max(1, Math.round(bytes / 1024)) })
  return t('logexport.size.mb', { size: (bytes / (1024 * 1024)).toFixed(1) })
}

export function LogExport({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const [choice, setChoice] = useState('all')
  const [bytes, setBytes] = useState<number>()
  const [result, setResult] = useState<string>()
  const [busy, setBusy] = useState(false)
  const scope = CHOICES.find((c) => c.id === choice)!.scope

  // A window of the stack (M10.33 A): Escape closes it when it is on top.
  useWindow(onClose)

  useEffect(() => {
    let live = true
    setBytes(undefined)
    void client.logSize?.(scope).then((n) => live && setBytes(n))
    return () => {
      live = false
    }
    // The scope object is rebuilt from the choice, so the choice is the dependency.
  }, [client, choice])

  const save = async () => {
    setBusy(true)
    try {
      const file = await client.exportLog?.(scope)
      setResult(file ? t('logexport.save.done', { file }) : t('logexport.save.cancelled'))
    } catch (reason) {
      setResult(t('logexport.save.failed', { reason: String(reason) }))
    } finally {
      setBusy(false)
    }
  }

  const parts = bytes === undefined ? 0 : Math.ceil(bytes / PART_BYTES)
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('logexport.title')}>
      <div className="panel settings">
        <header className="panel-head">
          <h2>{t('logexport.title')}</h2>
          <button type="button" className="link" onClick={onClose}>
            [{t('logexport.close')}]
          </button>
        </header>
        <div className="settings-body">
          <p>{t('logexport.intro')}</p>
          <fieldset className="log-scope">
            <legend>{t('logexport.scope.title')}</legend>
            {CHOICES.map((c) => (
              <label key={c.id}>
                <input id={`log-export-${c.id}`} type="radio" name="log-export" checked={choice === c.id} onChange={() => setChoice(c.id)} /> {c.label()}
              </label>
            ))}
          </fieldset>
          <p className="muted">
            {bytes === undefined ? t('logexport.size.measuring') : tn('logexport.size.parts', Math.max(1, parts), { size: size(bytes) })}
          </p>
          <div className="row">
            <button type="button" className="link" disabled={busy} onClick={() => void save()}>
              [{busy ? t('logexport.save.busy') : t('logexport.save.button')}]
            </button>
          </div>
          {result && <p role="status">{result}</p>}
        </div>
      </div>
    </div>
  )
}
