import { useState } from 'react'
import type { Reply, SaveEntry, SavesBridge, WorldChoice } from './client'
import { t } from './i18n'

// The load screen (M10.20; Bram, 28 September 2026): the saves of a world or
// of all worlds, the ones saved by hand and the last one saved on the way,
// each with who, where and the day; load one, give it a name, or keep it as a
// file. A save file comes back in with [Import a save...].

/** Who, where and the day of a save, and when it was saved. */
export function describeSave(save: SaveEntry): string {
  const about = save.about ? `${save.about.character ? `${save.about.character}, ` : ''}${save.about.place}, ${save.about.day}` : ''
  const when = new Date(save.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return [about, t('worlds.load.saved', { when })].filter(Boolean).join(' · ')
}

/** The saves to choose from: by hand and named, and of those saved on the way only the last per world. */
export function choosable(saves: SaveEntry[]): SaveEntry[] {
  const lastAuto = new Set<number>()
  const seen = new Set<string>()
  for (const s of saves) {
    if (s.slot === 'manual' || s.name || seen.has(s.world)) continue
    seen.add(s.world)
    lastAuto.add(s.id)
  }
  return saves.filter((s) => s.slot === 'manual' || s.name || lastAuto.has(s.id))
}

export function SavesView({
  bridge,
  saves,
  worlds,
  world,
  onLoaded,
  onChanged,
  onClose,
}: {
  bridge: SavesBridge
  saves: SaveEntry[]
  worlds: WorldChoice[]
  /** Only this world's saves (its folder); all when not given. */
  world?: string
  onLoaded: (reply: Reply) => void
  onChanged: () => void
  onClose: () => void
}) {
  const [naming, setNaming] = useState<number>()
  const [name, setName] = useState('')
  const [note, setNote] = useState<string>()
  const [busy, setBusy] = useState(false)
  const id = worlds.find((w) => w.folder === world)?.id
  const shown = choosable(saves.filter((s) => !id || s.world === id))
  const worldName = (worldId: string) => worlds.find((w) => w.id === worldId)?.name ?? worldId
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      setNote(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('worlds.load.label')}>
      <div className="panel settings saves">
        <header className="panel-head">
          <h2>
            {t('worlds.load.title')}
            {world && <span className="muted small"> {t('worlds.load.in', { world: worlds.find((w) => w.folder === world)?.name ?? world })}</span>}
          </h2>
          <button type="button" className="link" onClick={onClose}>
            [{t('worlds.load.close')}]
          </button>
        </header>
        {shown.length === 0 && <p className="muted">{t('worlds.load.none')}</p>}
        <ul className="save-list">
          {shown.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name ? `"${s.name}"` : s.slot === 'manual' ? t('worlds.load.manual') : t('worlds.load.auto')}</strong>
                {!world && <span className="muted small"> {worldName(s.world)}</span>}
              </div>
              <div className="muted small">{describeSave(s)}</div>
              <div className="save-actions">
                <button type="button" className="link" disabled={busy} onClick={() => void run(async () => onLoaded(await bridge.load(s.id)))}>
                  [{t('worlds.load.load')}]
                </button>{' '}
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const path = await bridge.exportSave(s.id)
                      if (path) setNote(t('worlds.load.exported', { path }))
                    })
                  }
                >
                  [{t('worlds.load.export')}]
                </button>{' '}
                <button
                  type="button"
                  className="link"
                  disabled={busy}
                  onClick={() => {
                    setNaming(naming === s.id ? undefined : s.id)
                    setName(s.name ?? '')
                  }}
                >
                  [{t('worlds.load.name')}]
                </button>
              </div>
              {naming === s.id && (
                <form
                  className="save-name"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void run(async () => {
                      await bridge.name(s.id, name)
                      setNaming(undefined)
                      onChanged()
                    })
                  }}
                >
                  <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t('worlds.load.namePlaceholder')} aria-label={t('worlds.load.namePlaceholder')} autoFocus />{' '}
                  <button type="submit" className="link" disabled={busy}>
                    [{t('worlds.load.setName')}]
                  </button>
                  <div className="muted small">{t('worlds.load.named')}</div>
                </form>
              )}
            </li>
          ))}
        </ul>
        <p>
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const done = await bridge.importSave()
                if (!done) return
                if (done.problem) setNote(done.problem)
                else {
                  const imported = (await bridge.list()).find((s) => s.id === done.id)
                  setNote(t('worlds.picker.imported', { name: imported?.name ?? '' }))
                  onChanged()
                }
              })
            }
          >
            [{t('worlds.picker.import')}]
          </button>
        </p>
        {note && <p className="muted small">{note}</p>}
      </div>
    </div>
  )
}
