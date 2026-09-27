import { useEffect, useState } from 'react'
import type { EngineClient, LogScope } from './client'

// Saving a copy of the game log (FO, chapter 3, "Het spellogboek"). The log
// itself stays where it is; this writes a copy wherever the player wants it.
// Up to 10 MB that is one text file, above it a zip with parts of 10 MB.

const PART_BYTES = 10 * 1024 * 1024

const CHOICES: { id: string; label: string; scope: LogScope }[] = [
  { id: 'all', label: 'The whole game', scope: { kind: 'all' } },
  { id: 'loaded', label: 'Since this save was loaded', scope: { kind: 'loaded' } },
  { id: 'week', label: 'The last seven days', scope: { kind: 'days', days: 7 } },
]

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function LogExport({ client, onClose }: { client: EngineClient; onClose: () => void }) {
  const [choice, setChoice] = useState('all')
  const [bytes, setBytes] = useState<number>()
  const [result, setResult] = useState<string>()
  const [busy, setBusy] = useState(false)
  const scope = CHOICES.find((c) => c.id === choice)!.scope

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
      setResult(file ? `Saved a copy as ${file}.` : 'Not saved.')
    } catch (reason) {
      setResult(`Could not save the copy: ${String(reason)}`)
    } finally {
      setBusy(false)
    }
  }

  const parts = bytes === undefined ? 0 : Math.ceil(bytes / PART_BYTES)
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Export the log">
      <div className="panel settings">
        <header className="panel-head">
          <h2>Export the log</h2>
          <button type="button" className="link" onClick={onClose}>
            [Close]
          </button>
        </header>
        <div className="settings-body">
          <p>The game keeps everything you typed and saw. This saves a copy wherever you like; the log itself stays as it is.</p>
          <fieldset className="log-scope">
            <legend>What to export</legend>
            {CHOICES.map((c) => (
              <label key={c.id}>
                <input id={`log-export-${c.id}`} type="radio" name="log-export" checked={choice === c.id} onChange={() => setChoice(c.id)} /> {c.label}
              </label>
            ))}
          </fieldset>
          <p className="muted">
            {bytes === undefined
              ? 'Measuring the log…'
              : parts <= 1
                ? `About ${size(bytes)}, saved as one text file.`
                : `About ${size(bytes)}, saved as a zip with ${parts} text files of up to 10 MB each.`}
          </p>
          <div className="row">
            <button type="button" className="link" disabled={busy} onClick={() => void save()}>
              {busy ? '[Saving…]' : '[Save a copy]'}
            </button>
          </div>
          {result && <p role="status">{result}</p>}
        </div>
      </div>
    </div>
  )
}
