import { useEffect, useState } from 'react'
import { BUDGET_CONFIRM_USD, PLAY_MODES, type FramesView as Frames, type PlayMode } from '../../engine'
import type { AiBridge } from './client'
import { t, tn } from './i18n'
import { useWindow } from './windows'

// The frames once (M10.24; Bram, 28 September 2026): at the start of a game
// what it is played under stands on one screen, and after that it is out of
// the way. The world and its lands, the great lines, the three dials (knobs
// of this game, set with FRAMES so a replay sets them too), and beside them
// the app's own: the budget, when to ask before a costly call, the play mode.
// Settings opens the same screen later.

export function FramesView({ frames, ai, onDial, onClose }: { frames: Frames; ai?: AiBridge; onDial: (dial: string, choice: string) => Promise<Frames | undefined>; onClose: () => void }) {
  const [view, setView] = useState(frames)
  const [budget, setBudget] = useState('')
  const [askAbove, setAskAbove] = useState('')
  const [mode, setMode] = useState<PlayMode>(frames.mode)
  const [connected, setConnected] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState<string>()
  // What a new region costs by how full it is built (M10.25), with the models chosen.
  const [prices, setPrices] = useState<Partial<Record<string, number>>>({})
  // What an hour costs by how fast the day goes (M10.28), with the models chosen.
  const [hours, setHours] = useState<Partial<Record<string, number>>>({})

  useEffect(() => {
    if (!ai) return
    let live = true
    void ai
      .overview()
      .then((o) => {
        if (!live) return
        setBudget(String(o.settings.budgetUsdPerHour))
        setAskAbove(o.settings.askAboveUsd === null ? '' : String(o.settings.askAboveUsd))
        setMode(o.settings.playMode)
        setConnected(Object.values(o.settings.providers).some((p) => p.configured))
        setPrices(o.guide?.region ?? {})
        setHours(o.guide?.measuredByClock ?? {})
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [ai])
  // A window of the stack (M10.33 A): Escape closes it when it is on top.
  useWindow(onClose)

  const dial = async (id: string, choice: string) => {
    const next = await onDial(id, choice)
    if (next) setView(next)
  }
  const saveBudget = async (usd: number) => {
    if (!ai) return
    setConfirm(false)
    const kept = await ai.setBudget(usd)
    setBudget(String(kept.usd))
    setNote(t('frames.saved'))
  }
  const saveAsk = async (usd: number | null) => {
    if (!ai) return
    const kept = await ai.setAskAbove(usd)
    setAskAbove(kept.usd === null ? '' : String(kept.usd))
    setNote(t('frames.saved'))
  }
  const pickMode = async (next: PlayMode) => {
    setMode(next)
    if (ai) setMode(await ai.setPlayMode(next))
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('frames.label')}>
      <div className="panel settings creation frames">
        <header className="panel-head">
          <h2>{t('frames.title')}</h2>
          <span className="muted small">{t('frames.hint')}</span>
        </header>
        <div className="settings-body">
          <p>
            <strong>{view.world.name}</strong>: {t('frames.world', { land: view.world.land, region: view.world.region })}
          </p>

          {view.lands.length > 0 && (
            <section>
              <h3>{t('frames.lands')}</h3>
              <ul className="check-list small">
                {view.lands.map((l) => (
                  <li key={l.id}>
                    <strong>{l.name}</strong>: {t(`frames.reach.${l.reach}`)}
                    {l.why ? ` (${l.why})` : ''}
                    {l.tongue ? `; ${t('frames.tongue', { tongue: l.tongue })}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3>{t('frames.lines')}</h3>
            {view.lines.length ? (
              <ul className="check-list small">
                {view.lines.map((l) => (
                  <li key={l.id}>
                    <strong>{l.name}</strong> ({l.kind}): {t(`frames.stage.${l.stage}`)}; {t('frames.driven', { what: l.driven })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{t('frames.linesNone')}</p>
            )}
          </section>

          <section>
            <h3>{t('frames.dials')}</h3>
            {view.dials.map((d) => (
              <div key={d.id} className="frames-dial">
                <div>{d.name}</div>
                {d.slider ? (
                  // How fast the day goes (M10.28): whole seconds a game minute, from the world's own pace.
                  <div className="row small">
                    <input type="range" min={d.slider.min} max={d.slider.max} step={1} value={d.slider.value} aria-label={d.name} onChange={(e) => void dial(d.id, e.target.value)} />
                    <span>{tn('frames.clockValue', d.slider.value)}</span>
                    {d.slider.value !== d.slider.world && (
                      <button type="button" className="link" onClick={() => void dial(d.id, 'world')}>
                        [{t('frames.clockWorld', { count: d.slider.world })}]
                      </button>
                    )}
                    {connected && hours[d.slider.value] !== undefined && <span className="muted"> {t('frames.clockPrice', { usd: hours[d.slider.value]! < 0.01 ? '<0.01' : hours[d.slider.value]!.toFixed(2) })}</span>}
                  </div>
                ) : (
                  <div className="row small" role="radiogroup" aria-label={d.name}>
                    {d.choices.map((c) => (
                      <label key={c.id}>
                        <input type="radio" name={`dial-${d.id}`} aria-label={c.name} checked={d.chosen === c.id} onChange={() => void dial(d.id, c.id)} /> {c.name}
                        {d.id === 'region' && <span className="muted"> {regionPrice(c.id, prices, connected)}</span>}
                      </label>
                    ))}
                  </div>
                )}
                <div className="muted small">{d.about}</div>
              </div>
            ))}
          </section>

          <section>
            <h3>{t('frames.mode')}</h3>
            <div role="radiogroup" aria-label={t('frames.mode')}>
              {PLAY_MODES.map((m) => (
                <label key={m} className="frames-dial">
                  <span>
                    <input type="radio" name="play-mode" aria-label={t(`frames.modes.${m}`)} checked={mode === m} onChange={() => void pickMode(m)} /> <strong>{t(`frames.modes.${m}`)}</strong>
                  </span>
                  <span className="muted small">{t(`frames.modeSays.${m}`)}</span>
                </label>
              ))}
            </div>
          </section>

          {ai && (
            <section>
              <h3>{t('frames.cost')}</h3>
              {!connected && <p className="muted small">{t('frames.noModel')}</p>}
              <div className="row small">
                <span className="label">{t('frames.budget')}</span>
                <span>$</span>
                <input className="amount" inputMode="decimal" value={budget} onChange={(e) => (setBudget(e.target.value), setConfirm(false))} aria-label={t('frames.budgetAria')} />
                <button type="button" className="link" disabled={!(Number(budget) > 0)} onClick={() => (Number(budget) > BUDGET_CONFIRM_USD ? setConfirm(true) : void saveBudget(Number(budget)))}>
                  [{t('frames.save')}]
                </button>
              </div>
              {confirm && (
                <div className="row warn small" role="alertdialog">
                  <span>{t('frames.budgetConfirm', { usd: Number(budget) })}</span>
                  <button type="button" className="link" onClick={() => void saveBudget(Number(budget))}>
                    [{t('frames.save')}]
                  </button>
                </div>
              )}
              <div className="row small">
                <span className="label">{t('frames.askAbove')}</span>
                <span>$</span>
                <input className="amount" inputMode="decimal" value={askAbove} placeholder={t('frames.askNever')} onChange={(e) => setAskAbove(e.target.value)} aria-label={t('frames.askAboveAria')} />
                <button type="button" className="link" disabled={!(Number(askAbove) > 0)} onClick={() => void saveAsk(Number(askAbove))}>
                  [{t('frames.save')}]
                </button>
                <button type="button" className="link" onClick={() => void saveAsk(null)}>
                  [{t('frames.askNever')}]
                </button>
              </div>
              {note && <p className="ok small">{note}</p>}
            </section>
          )}
        </div>
        <footer className="row">
          <button type="button" className="link" onClick={onClose} autoFocus>
            [{t('frames.play')}]
          </button>
        </footer>
      </div>
    </div>
  )
}

/** The price of a new region beside its setting (M10.25): measured with the models chosen, or why there is none. */
export function regionPrice(setting: string, prices: Partial<Record<string, number>>, connected: boolean): string {
  if (!connected) return setting === 'outline' ? t('frames.regionPrice.free') : t('frames.regionPrice.noModel')
  const usd = prices[setting]
  return usd === undefined ? t('frames.regionPrice.unknown') : t('frames.regionPrice.about', { usd: usd < 0.01 ? '<0.01' : usd.toFixed(2) })
}
