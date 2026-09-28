import { Fragment, useCallback, useEffect, useState } from 'react'
import type { UsageTotals } from '../../node/ai/usage'
import type { Advice, AiBridge, AiLogEntry, AiOverview, ModelInfo, ProviderId, TranscriptBridge, TrialResult } from './client'
import { loadDisplay, saveDisplay, TEXT_SIZES, type Display } from './display'
import { t, tn } from './i18n'

// Settings > AI, Usage and the AI log (FO, chapter 16). Keys are typed here,
// sent to the main process once, and only ever shown masked afterwards.
// Settings > Display (M9.4): text size and contrast.

export type SettingsTab = 'ai' | 'usage' | 'log' | 'display' | 'transcript'

const PROVIDERS: { id: ProviderId; name: string; hint: string }[] = [
  { id: 'openai', name: 'OpenAI', hint: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', hint: 'sk-ant-...' },
]

const ROLES = [
  { id: 'voice', name: 'settings.ai.roles.voice', none: 'settings.ai.none.voice' },
  { id: 'brain', name: 'settings.ai.roles.brain', none: 'settings.ai.none.brain' },
  { id: 'chronicler', name: 'settings.ai.roles.chronicler', none: 'settings.ai.none.chronicler' },
] as const

type Role = (typeof ROLES)[number]['id']

export const usd = (value: number | undefined, digits = value === undefined || value === 0 || value >= 0.1 ? 2 : value >= 0.01 ? 3 : 4) => (value === undefined ? t('settings.priceUnknown') : `$${value.toFixed(digits)}`)
const tokens = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value))
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%')
const message = (error: unknown) => (error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))

// Work that waits on the main process. A call signature rather than an arrow,
// so the texts check of M9.4 does not take "=> Promise<" for words on screen.
type Work = { (): Promise<void> }

export function Settings({ bridge, transcript, tab, onTab, onClose }: { bridge?: AiBridge; transcript?: TranscriptBridge; tab: SettingsTab; onTab: (tab: SettingsTab) => void; onClose: () => void }) {
  const [overview, setOverview] = useState<AiOverview>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!bridge) return
    try {
      setOverview(await bridge.overview())
    } catch (reason) {
      setError(message(reason))
    }
  }, [bridge])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('settings.title')}>
      <div className="panel settings">
        <header className="panel-head">
          <h2>{t('settings.title')}</h2>
          <nav className="tabs">
            {(['ai', 'usage', 'log', 'display', 'transcript'] as const).map((id) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => onTab(id)}>
                {id === 'ai' ? t('settings.tabs.ai') : id === 'usage' ? t('settings.tabs.usage') : id === 'log' ? t('settings.tabs.log') : id === 'display' ? t('settings.tabs.display') : t('settings.tabs.transcript')}
              </button>
            ))}
          </nav>
          <button type="button" className="link" onClick={onClose}>
            [{t('settings.close')}]
          </button>
        </header>
        {tab === 'display' ? (
          <DisplayTab />
        ) : tab === 'transcript' ? (
          transcript ? <TranscriptTab bridge={transcript} /> : <p className="muted">{t('settings.desktopOnly')}</p>
        ) : !bridge ? (
          <p className="muted">{t('settings.desktopOnly')}</p>
        ) : !overview ? (
          <p className="muted">{error ?? t('settings.loading')}</p>
        ) : tab === 'ai' ? (
          <AiTab bridge={bridge} overview={overview} refresh={refresh} />
        ) : tab === 'usage' ? (
          <UsageTab bridge={bridge} overview={overview} refresh={refresh} />
        ) : (
          <LogTab bridge={bridge} />
        )}
      </div>
    </div>
  )
}

// Settings > Display (M9.4, FO chapter 18): text size and contrast, at once and kept on this computer.
function DisplayTab() {
  const [display, setDisplay] = useState<Display>(loadDisplay)
  const change = (next: Display) => {
    setDisplay(next)
    saveDisplay(next)
  }
  return (
    <div className="settings-body">
      <fieldset className="display-choice">
        <legend>{t('settings.display.textSize')}</legend>
        {TEXT_SIZES.map((size) => (
          <label key={size.scale}>
            <input type="radio" name="text-size" checked={display.scale === size.scale} onChange={() => change({ ...display, scale: size.scale })} />
            {t(size.label)}
          </label>
        ))}
      </fieldset>
      <fieldset className="display-choice">
        <legend>{t('settings.display.contrast')}</legend>
        {(['normal', 'high'] as const).map((contrast) => (
          <label key={contrast}>
            <input type="radio" name="contrast" checked={display.contrast === contrast} onChange={() => change({ ...display, contrast })} />
            {contrast === 'normal' ? t('settings.display.contrasts.normal') : t('settings.display.contrasts.high')}
          </label>
        ))}
      </fieldset>
      <fieldset className="display-choice">
        <legend>{t('settings.display.mapStyle')}</legend>
        {(['dark', 'paper', 'bw'] as const).map((look) => (
          <label key={look}>
            <input type="radio" name="map-look" checked={display.map === look} onChange={() => change({ ...display, map: look })} />
            {t(`settings.display.mapStyles.${look}`)}
          </label>
        ))}
      </fieldset>
      <label className="display-check">
        <input type="checkbox" checked={display.rules} onChange={(event) => change({ ...display, rules: event.target.checked })} />
        {t('settings.display.rules')}
      </label>
      <p className="muted small">{t('settings.display.rulesNote')}</p>
      <p className="muted">{t('settings.display.keyboard')}</p>
    </div>
  )
}

// Settings > Transcript (M10.4): everything on screen as Markdown, in a folder of your choice.
function TranscriptTab({ bridge }: { bridge: TranscriptBridge }) {
  const [settings, setSettings] = useState<{ enabled: boolean; folder: string }>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void bridge.get().then(setSettings, (reason: unknown) => setError(message(reason)))
  }, [bridge])
  const change: (enabled: boolean, folder: string) => void = (enabled, folder) => {
    void bridge.set(enabled, folder).then(setSettings, (reason: unknown) => setError(message(reason)))
  }
  if (!settings) return <p className="muted">{error ?? t('settings.loading')}</p>
  return (
    <div className="settings-body">
      <label className="display-choice">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => change(event.target.checked, settings.folder)} />
        {t('settings.transcript.on')}
      </label>
      <p>
        {t('settings.transcript.folder')} <code>{settings.folder}</code>{' '}
        <button type="button" className="link" onClick={() => void bridge.choose().then((folder) => folder && change(settings.enabled, folder))}>
          [{t('settings.transcript.choose')}]
        </button>
      </p>
      <p className="muted">{t('settings.transcript.how')}</p>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

const PROVIDER_NAMES: Record<ProviderId, string> = { openai: 'OpenAI', anthropic: 'Anthropic' }
const choiceKey = (provider: ProviderId, model: string) => `${provider}:${model}`
const splitKey = (key: string): { provider: ProviderId; model: string } => {
  const [provider, ...rest] = key.split(':')
  return { provider: provider as ProviderId, model: rest.join(':') }
}

// What a trial found (M9.3): usable answers, what went wrong, time, and the cost of one usable answer.
function trialText(trial: TrialResult | string | undefined): string | undefined {
  if (trial === undefined) return undefined
  if (typeof trial === 'string') return trial
  const cost = trial.costPerUsableUsd === undefined ? t('settings.priceUnknown') : t('settings.ai.trial.cost', { perAnswer: usd(trial.costPerUsableUsd), perHour: usd(trial.costPerHourUsd ?? 0) })
  const wrong = [
    trial.retries ? t('settings.ai.trial.retried', { count: trial.retries }) : '',
    trial.fallbacks ? tn('settings.ai.trial.setLines', trial.fallbacks) : '',
    trial.leaks ? tn('settings.ai.trial.leaks', trial.leaks) : '',
    trial.factualErrors ? t('settings.ai.trial.false', { count: trial.factualErrors }) : '',
    trial.characterBreaks ? t('settings.ai.trial.outOfCharacter', { count: trial.characterBreaks }) : '',
  ].filter(Boolean)
  const usable = wrong.length ? t('settings.ai.trial.usableWrong', { valid: trial.valid, answers: trial.answers, wrong: wrong.join(', ') }) : t('settings.ai.trial.usable', { valid: trial.valid, answers: trial.answers })
  // How well it stays in character, by the rules (M10.10): beside cost and speed.
  const character = trial.characterScore === undefined ? '' : `  ${t('settings.ai.trial.character', { score: Math.round(trial.characterScore * 100) })}`
  return `${t('settings.ai.trial.summary', { usable, seconds: (trial.averageLatencyMs / 1000).toFixed(1), cost })}${character}${trial.errors.length ? `  ${trial.errors[0]}` : ''}`
}

// Settings > AI (FO, chapter 16). The player picks a model per role from the
// lists the keys gave, at any time; advice and trials are there when wanted.
function AiTab({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: Work }) {
  const { settings } = overview
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ openai: '', anthropic: '' })
  const [busy, setBusy] = useState<string>()
  const [note, setNote] = useState<string>()
  const [problem, setProblem] = useState<string>()
  const [advice, setAdvice] = useState<Partial<Record<ProviderId, Advice>>>({})
  const [trials, setTrials] = useState<Record<string, TrialResult | string>>({})
  const [trying, setTrying] = useState<Partial<Record<Role, boolean>>>({})
  const [picked, setPicked] = useState<Partial<Record<Role, string>>>({})
  // The trial's verdict on the advised models of a role (M9.3): which it chose, and why the others not.
  const [verdicts, setVerdicts] = useState<Partial<Record<Role, { chosen?: string; why: Record<string, { passed: boolean; why: string }> }>>>({})
  const [budget, setBudget] = useState(String(settings.budgetUsdPerHour))
  const [within, setWithin] = useState(String(settings.replyWithinSeconds ?? 10))

  const connected = PROVIDERS.filter(({ id }) => settings.providers[id].configured)
  const options = connected.flatMap(({ id }) => (settings.models[id] ?? []).map((model) => ({ key: choiceKey(id, model), label: `${PROVIDER_NAMES[id]} · ${model}` })))
  const inUse = (role: Role) => {
    const choice = settings.roles[role]
    return choice ? choiceKey(choice.provider, choice.model) : undefined
  }
  const selected = (role: Role) => picked[role] ?? inUse(role) ?? ''

  const run = async (label: string, work: Work) => {
    setBusy(label)
    setProblem(undefined)
    setNote(undefined)
    try {
      await work()
    } catch (reason) {
      setProblem(message(reason))
    } finally {
      setBusy(undefined)
    }
  }

  const connect = (provider: ProviderId) =>
    run(t('settings.ai.busyLabels.checkKey', { name: PROVIDER_NAMES[provider] }), async () => {
      const { models: count } = await bridge.connect(provider, keys[provider])
      setKeys((previous) => ({ ...previous, [provider]: '' }))
      setNote(tn('settings.ai.keySaved', count))
      await refresh()
    })

  const advise = (provider: ProviderId) =>
    run(t('settings.ai.busyLabels.advise', { name: PROVIDER_NAMES[provider] }), async () => {
      const result = await bridge.advise(provider)
      setAdvice((previous) => ({ ...previous, [provider]: result }))
      setNote(t('settings.ai.adviceFrom', { model: result.advisorModel }))
      await refresh()
    })

  const reload = () =>
    run(t('settings.ai.busyLabels.reload'), async () => {
      const missing = await bridge.refresh()
      await refresh()
      setNote(missing.length ? t('settings.ai.noLongerOffered', { roles: missing.join(', ') }) : t('settings.ai.upToDate'))
    })

  // Trials run on their own: saving never waits for them.
  const tryRole = async (role: Role) => {
    const key = selected(role)
    if (!key) return
    const { provider, model } = splitKey(key)
    setTrying((previous) => ({ ...previous, [role]: true }))
    try {
      const result = await bridge.trial(provider, model, role)
      setTrials((previous) => ({ ...previous, [`${role}:${key}`]: result }))
    } catch (reason) {
      setTrials((previous) => ({ ...previous, [`${role}:${key}`]: message(reason) }))
    } finally {
      setTrying((previous) => ({ ...previous, [role]: false }))
    }
  }

  // Tries every advised model for the role and picks the one the trial chooses; saving stays with the player.
  const compareRole = async (role: Role, choices: { provider: ProviderId; model: string }[]) => {
    setTrying((previous) => ({ ...previous, [role]: true }))
    try {
      const { results, verdicts: found, choice } = await bridge.compare(role, choices)
      setTrials((previous) => ({ ...previous, ...Object.fromEntries(results.map((r) => [`${role}:${choiceKey(r.provider, r.model)}`, r])) }))
      const chosen = choice ? choiceKey(choice.provider, choice.model) : undefined
      setVerdicts((previous) => ({ ...previous, [role]: { ...(chosen ? { chosen } : {}), why: Object.fromEntries(found.map((v) => [choiceKey(v.provider, v.model), { passed: v.passed, why: v.why }])) } }))
      if (chosen) setPicked((previous) => ({ ...previous, [role]: chosen }))
    } catch (reason) {
      setProblem(message(reason))
    } finally {
      setTrying((previous) => ({ ...previous, [role]: false }))
    }
  }

  const save = (role: Role) =>
    run(t('settings.ai.busyLabels.saveRole', { role }), async () => {
      const key = selected(role)
      if (!key) return
      const { provider, model } = splitKey(key)
      const stored = await bridge.choose(role, provider, model)
      setPicked((previous) => ({ ...previous, [role]: undefined }))
      setNote(t('settings.ai.saved', { role, model: stored }))
      await refresh()
    })

  return (
    <div className="settings-body">
      {!settings.encryption && <p className="warn">{t('settings.ai.noEncryption')}</p>}
      {PROVIDERS.map(({ id, name, hint }) => {
        const state = settings.providers[id]
        return (
          <div key={id} className="row">
            <span className="label">{t('settings.ai.keyLabel', { name })}</span>
            {state.configured ? (
              <>
                <span className="mono">{state.masked}</span>
                <span className="muted">{tn('settings.ai.encryptedModels', settings.models[id]?.length ?? 0)}</span>
                <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void advise(id)}>
                  [{t('settings.ai.askAdvice')}]
                </button>
                <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void run(t('settings.ai.busyLabels.removing'), async () => (await bridge.disconnect(id), await refresh()))}>
                  [{t('settings.ai.remove')}]
                </button>
              </>
            ) : (
              <>
                <input type="password" autoComplete="off" spellCheck={false} placeholder={hint} value={keys[id]} onChange={(event) => setKeys((previous) => ({ ...previous, [id]: event.target.value }))} aria-label={t('settings.ai.apiKey', { name })} />
                <button type="button" className="link" disabled={!keys[id].trim() || Boolean(busy)} onClick={() => void connect(id)}>
                  [{t('settings.ai.connect')}]
                </button>
              </>
            )}
          </div>
        )
      })}

      {busy && <p className="muted">{t('settings.busy', { task: busy })}</p>}
      {note && <p className="ok">{note}</p>}
      {problem && <p className="warn">{problem}</p>}

      <section className="advice">
        {options.length === 0 ? (
          <p className="muted">{t('settings.ai.connectFirst')}</p>
        ) : (
          ROLES.map(({ id: role, name, none }) => {
            const current = inUse(role)
            const key = selected(role)
            const suggestions = Object.values(advice).flatMap((a) =>
              a ? [a[role].recommended, a[role].cheaper].map((c, i) => ({ provider: a.provider, ...c, cheaper: i === 1 })) : [],
            )
            const unique = suggestions.filter((c, i) => suggestions.findIndex((d) => d.provider === c.provider && d.model === c.model) === i)
            const dropped = current && !options.some((o) => o.key === current) ? current : undefined
            return (
              <fieldset key={role}>
                <legend>{t(name)}</legend>
                <div className="choice other">
                  <span className="muted">{t('settings.ai.inUse')}</span>
                  <span className="mono">
                    {settings.roles[role]?.model ?? t(none)}
                    {settings.missing.includes(role) ? `  ${t('settings.ai.missingPickAnother')}` : ''}
                  </span>
                </div>
                <div className="choice pick">
                  <select value={key} onChange={(event) => setPicked((previous) => ({ ...previous, [role]: event.target.value }))} aria-label={t('settings.ai.modelFor', { role })}>
                    {!key && <option value="">{t('settings.ai.chooseModel')}</option>}
                    {dropped && <option value={dropped}>{t('settings.ai.noLongerOfferedOption', { model: dropped.replace(':', ' · ') })}</option>}
                    {options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="link" disabled={!key || trying[role]} onClick={() => void tryRole(role)}>
                    [{trying[role] ? t('settings.ai.trying') : t('settings.ai.try')}]
                  </button>
                  <button type="button" className="link" disabled={!key || key === current || Boolean(busy)} onClick={() => void save(role)}>
                    [{t('settings.ai.save')}]
                  </button>
                </div>
                {trialText(trials[`${role}:${key}`]) && <p className="trial">{trialText(trials[`${role}:${key}`])}</p>}
                {unique.map((c) => {
                  const k = choiceKey(c.provider, c.model)
                  const verdict = verdicts[role]
                  const judged = verdict?.why[k]
                  return (
                    <Fragment key={k}>
                      <div className="choice">
                        <button type="button" className="link" onClick={() => setPicked((previous) => ({ ...previous, [role]: k }))}>
                          [{t('settings.ai.use')}]
                        </button>
                        <span className="mono">
                          {c.model}
                          {c.cheaper ? ` ${t('settings.ai.cheaper')}` : ''}
                          {verdict?.chosen === k ? `  ${t('settings.ai.chosenByTrial')}` : ''}
                        </span>
                        <span className="reason">"{c.reason}"</span>
                      </div>
                      {judged && (
                        <p className={judged.passed ? 'trial' : 'trial warn'}>
                          {trialText(trials[`${role}:${k}`])}
                          {judged.passed ? '' : `; ${t('settings.ai.didNotPass', { why: judged.why })}`}
                        </p>
                      )}
                    </Fragment>
                  )
                })}
                {unique.length > 1 && (
                  <div className="choice other">
                    <button type="button" className="link" disabled={trying[role]} onClick={() => void compareRole(role, unique.map((c) => ({ provider: c.provider, model: c.model })))}>
                      [{trying[role] ? t('settings.ai.trying') : t('settings.ai.tryAdvice')}]
                    </button>
                    <span className="muted">{t('settings.ai.tryAdviceNote')}</span>
                  </div>
                )}
              </fieldset>
            )
          })
        )}
        {options.length > 0 && (
          <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void reload()}>
            [{t('settings.ai.checkLists')}]
          </button>
        )}
      </section>

      <Pictures bridge={bridge} overview={overview} refresh={refresh} />

      <div className="row">
        <span className="label">{t('settings.ai.budget.label')}</span>
        <span>$</span>
        <input className="amount" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} aria-label={t('settings.ai.budget.aria')} />
        <button type="button" className="link" disabled={Boolean(busy) || !(Number(budget) > 0)} onClick={() => void run(t('settings.ai.busyLabels.saving'), async () => (await bridge.setBudget(Number(budget)), await refresh(), setNote(t('settings.ai.budget.saved'))))}>
          [{t('settings.ai.save')}]
        </button>
        <span className="muted">{t('settings.ai.budget.note')}</span>
      </div>
      <div className="row">
        <span className="label">{t('settings.ai.replyWithin.label')}</span>
        <input className="amount" inputMode="numeric" value={within} onChange={(event) => setWithin(event.target.value)} aria-label={t('settings.ai.replyWithin.aria')} />
        <span>{t('settings.ai.replyWithin.unit')}</span>
        <button type="button" className="link" disabled={Boolean(busy) || !(Number(within) > 0)} onClick={() => void run(t('settings.ai.busyLabels.saving'), async () => (await bridge.setReplyWithin(Number(within)), await refresh(), setNote(t('settings.ai.replyWithin.saved'))))}>
          [{t('settings.ai.save')}]
        </button>
        <span className="muted">{t('settings.ai.replyWithin.note')}</span>
      </div>
    </div>
  )
}

function Bar({ part, whole }: { part: number; whole: number }) {
  const filled = whole ? Math.min(20, Math.round((part / whole) * 20)) : 0
  return (
    <span className="mono bar-chart" aria-hidden="true">
      [{'#'.repeat(filled)}
      {'-'.repeat(20 - filled)}]
    </span>
  )
}

function Totals({ label, totals }: { label: string; totals: UsageTotals }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{tn('settings.usage.calls', totals.calls, { calls: totals.calls.toLocaleString('en-GB') })}</td>
      <td>{t('settings.usage.input', { tokens: tokens(totals.inputTokens), percent: percent(totals.cachedTokens, totals.inputTokens) })}</td>
      <td>{t('settings.usage.output', { tokens: tokens(totals.outputTokens) })}</td>
      <td className="num">{usd(totals.costUsd)}</td>
    </tr>
  )
}

// Pictures of places and people (after the M7 playtest): optional, OpenAI only.
function Pictures({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: Work }) {
  const { settings } = overview
  const [models, setModels] = useState<ModelInfo[]>([])
  const [picked, setPicked] = useState<string>()
  const [trial, setTrial] = useState<string>()
  const [state, setState] = useState<string>()
  const openai = settings.providers.openai.configured

  useEffect(() => {
    if (!openai) return
    void bridge.imageModels('openai').then(setModels).catch(() => setModels([]))
  }, [bridge, openai])

  const model = picked ?? settings.pictures?.model ?? models.find((m) => m.id === 'gpt-image-1-mini')?.id ?? models[0]?.id ?? ''
  const act = async (label: string, work: Work) => {
    setState(t('settings.busy', { task: label }))
    try {
      await work()
      setState(undefined)
    } catch (reason) {
      setState(message(reason))
    }
  }

  return (
    <fieldset className="pictures">
      <legend>{t('settings.pictures.title')}</legend>
      <p className="muted small">{t('settings.pictures.about')}</p>
      <div className="choice other">
        <span className="muted">{t('settings.ai.inUse')}</span>
        <span className="mono">{settings.pictures ? `${settings.pictures.model} (${settings.pictures.quality})` : t('settings.pictures.none')}</span>
      </div>
      {!openai ? (
        <p className="muted">{t('settings.pictures.connectFirst')}</p>
      ) : (
        <div className="choice pick">
          <select value={model} onChange={(event) => setPicked(event.target.value)} aria-label={t('settings.pictures.model')}>
            {models.length === 0 && <option value="">{t('settings.pictures.noModels')}</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <button type="button" className="link" disabled={!model || Boolean(state)} onClick={() => void act(t('settings.pictures.drawing'), async () => setTrial(await bridge.tryPicture('openai', model)))}>
            [{t('settings.ai.try')}]
          </button>
          <button type="button" className="link" disabled={!model || Boolean(state) || settings.pictures?.model === model} onClick={() => void act(t('settings.ai.busyLabels.saving'), async () => (await bridge.setPictures('openai', model, 'low'), await refresh()))}>
            [{t('settings.ai.save')}]
          </button>
          {settings.pictures && (
            <button type="button" className="link" disabled={Boolean(state)} onClick={() => void act(t('settings.pictures.turningOff'), async () => (await bridge.setPictures(null), await refresh()))}>
              [{t('settings.pictures.off')}]
            </button>
          )}
        </div>
      )}
      {state && <p className="muted">{state}</p>}
      {trial && <img className="trial-picture" src={trial} alt={t('settings.pictures.trialAlt')} />}
    </fieldset>
  )
}

function UsageTab({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: Work }) {
  const { usage, status, settings } = overview
  const [month, setMonth] = useState(usage.monthBudgetUsd ? String(usage.monthBudgetUsd) : '')
  const [credit, setCredit] = useState<Record<ProviderId, string>>({ openai: '', anthropic: '' })
  const [problem, setProblem] = useState<string>()

  const act = async (work: Work) => {
    setProblem(undefined)
    try {
      await work()
      await refresh()
    } catch (reason) {
      setProblem(message(reason))
    }
  }

  const download = async () => {
    const blob = new Blob([await bridge.csv()], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'wisplight-ai-usage.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const connected = PROVIDERS.filter((p) => settings.providers[p.id].configured || usage.credit.some((c) => c.provider === p.id))

  return (
    <div className="settings-body">
      {status.unpriced.map((u) => (
        <p key={u.role} className="warn small">
          {tn('settings.usage.unpriced', u.cap, { model: u.model, role: u.role, callsThisHour: u.callsThisHour })}
        </p>
      ))}
      <table className="usage">
        <tbody>
          <Totals label={t('settings.usage.session')} totals={usage.session} />
          <Totals label={t('settings.usage.today')} totals={usage.today} />
          <Totals label={t('settings.usage.month')} totals={usage.month} />
        </tbody>
      </table>
      {usage.byRole.length > 0 && (
        <table className="usage small">
          <thead>
            <tr>
              <th scope="col">{t('settings.usage.byRole.role')}</th>
              <th scope="col">{t('settings.usage.byRole.calls')}</th>
              <th scope="col">{t('settings.usage.byRole.fromCache')}</th>
              <th scope="col">{t('settings.usage.byRole.writtenTo')}</th>
            </tr>
          </thead>
          <tbody>
            {usage.byRole.map((r) => (
              <tr key={r.role}>
                <td>{r.role}</td>
                <td>{r.calls}</td>
                <td>{tn('settings.usage.byRole.cachedOf', r.inputTokens, { percent: r.cachedPercent, tokens: r.inputTokens.toLocaleString('en-GB') })}</td>
                <td>{r.cacheWriteTokens ? r.cacheWriteTokens.toLocaleString('en-GB') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row">
        <span className="label">{t('settings.usage.hourBudget')}</span>
        <Bar part={status.hourSpentUsd} whole={status.hourBudgetUsd} />
        <span>{t('settings.usage.spentOf', { spent: usd(status.hourSpentUsd), budget: usd(status.hourBudgetUsd) })}</span>
      </div>
      <div className="row">
        <span className="label">{t('settings.usage.monthBudget')}</span>
        {usage.monthBudgetUsd ? (
          <>
            <Bar part={usage.month.costUsd} whole={usage.monthBudgetUsd} />
            <span>{t('settings.usage.spentOf', { spent: usd(usage.month.costUsd), budget: usd(usage.monthBudgetUsd) })}</span>
            <span className={usage.monthLeftPercent! <= 20 ? 'warn' : 'ok'}>{t('settings.usage.left', { percent: usage.monthLeftPercent! })}</span>
          </>
        ) : (
          <span className="muted">{t('settings.usage.off')}</span>
        )}
        <span>$</span>
        <input className="amount" inputMode="decimal" value={month} placeholder={t('settings.usage.monthNone')} onChange={(event) => setMonth(event.target.value)} aria-label={t('settings.usage.monthAria')} />
        <button type="button" className="link" onClick={() => void act(() => bridge.setMonthBudget(month.trim() ? Number(month) : null))}>
          [{t('settings.usage.save')}]
        </button>
      </div>

      {connected.map(({ id, name }) => {
        const known = usage.credit.find((c) => c.provider === id)
        return (
          <div key={id} className="row">
            <span className="label">{t('settings.usage.credit.label', { name })}</span>
            {known ? (
              <span className={known.leftPercent <= 20 ? 'warn' : ''}>
                {t('settings.usage.credit.estimated', {
                  left: usd(known.estimatedLeftUsd),
                  amount: usd(known.amountUsd),
                  percent: known.leftPercent,
                  date: new Date(known.enteredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                })}
                {known.stale ? t('settings.usage.credit.stale') : ''}
              </span>
            ) : (
              <span className="muted">{t('settings.usage.credit.notEntered')}</span>
            )}
            <span>$</span>
            <input className="amount" inputMode="decimal" value={credit[id]} placeholder={t('settings.usage.credit.balance')} onChange={(event) => setCredit((previous) => ({ ...previous, [id]: event.target.value }))} aria-label={t('settings.usage.credit.aria', { name })} />
            <button type="button" className="link" disabled={!credit[id].trim()} onClick={() => void act(async () => (await bridge.setCredit(id, Number(credit[id])), setCredit((previous) => ({ ...previous, [id]: '' }))))}>
              [{t('settings.usage.credit.update')}]
            </button>
            <button type="button" className="link" onClick={() => void bridge.billing(id)}>
              [{t('settings.usage.credit.billing')}]
            </button>
          </div>
        )
      })}
      <p className="muted small">{t('settings.usage.credit.note')}</p>

      <table className="usage">
        <thead>
          <tr>
            <th scope="col">{t('settings.usage.byModel.title')}</th>
            <th scope="col">{t('settings.usage.byModel.calls')}</th>
            <th scope="col">{t('settings.usage.byModel.in')}</th>
            <th scope="col">{t('settings.usage.byModel.cached')}</th>
            <th scope="col">{t('settings.usage.byModel.out')}</th>
            <th scope="col" className="num">
              {t('settings.usage.byModel.cost')}
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.byModel.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                {t('settings.usage.byModel.none')}
              </td>
            </tr>
          )}
          {usage.byModel.map((row) => (
            <tr key={`${row.provider}/${row.model}`}>
              <th scope="row" className="mono">
                {row.model}
              </th>
              <td>{row.calls.toLocaleString('en-GB')}</td>
              <td>{tokens(row.inputTokens)}</td>
              <td>{percent(row.cachedTokens, row.inputTokens)}</td>
              <td>{tokens(row.outputTokens)}</td>
              <td className="num">{row.unpriced && !row.costUsd ? t('settings.priceUnknown') : usd(row.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <span className="muted">
          {t('settings.usage.fellBack', {
            percent: usage.fallbackPercent,
            failed: tn('settings.usage.failedCalls', usage.month.failed),
            rejected: tn('settings.usage.rejectedReplies', usage.month.rejected),
          })}
        </span>
        <button type="button" className="link" onClick={() => void download()}>
          [{t('settings.usage.exportCsv')}]
        </button>
      </div>
      <p className="muted small">{t('settings.usage.listPrices')}</p>
      {problem && <p className="warn">{problem}</p>}
    </div>
  )
}

/** The calls of this session: role, model, result, time, tokens, cache, cost; a click shows prompt and reply. The dev menu shows it too (M10.1). */
export function LogTab({ bridge }: { bridge: AiBridge }) {
  const [entries, setEntries] = useState<AiLogEntry[]>()
  const [open, setOpen] = useState<number>()
  useEffect(() => {
    void bridge.log().then(setEntries)
  }, [bridge])
  if (!entries) return <p className="muted">{t('settings.loading')}</p>
  if (!entries.length) return <p className="muted">{t('settings.log.none')}</p>
  // How often the guard stepped in, per model and why (M10.10): replies thrown away and things put right.
  const guard = new Map<string, Record<string, number>>()
  for (const e of entries) {
    for (const r of [...(e.rejected ?? []), ...(e.fixed ?? []).map((f) => f.split(':')[0]!)]) {
      const counts = guard.get(e.model) ?? {}
      counts[r] = (counts[r] ?? 0) + 1
      guard.set(e.model, counts)
    }
  }
  return (
    <div className="settings-body">
      {guard.size > 0 && (
        <p className="muted small">
          {t('settings.log.guard', {
            counts: [...guard]
              .map(([model, counts]) => `${model}: ${Object.entries(counts).map(([r, n]) => `${n} ${r.replace('_', ' ')}`).join(', ')}`)
              .join('; '),
          })}
        </p>
      )}
      <table className="usage log-table">
        <thead>
          <tr>
            <th scope="col">{t('settings.log.columns.time')}</th>
            <th scope="col">{t('settings.log.columns.role')}</th>
            <th scope="col">{t('settings.log.columns.model')}</th>
            <th scope="col">{t('settings.log.columns.result')}</th>
            <th scope="col">{t('settings.log.columns.ms')}</th>
            <th scope="col">{t('settings.log.columns.tokens')}</th>
            <th scope="col">{t('settings.log.columns.cache')}</th>
            <th scope="col" className="num">
              {t('settings.log.columns.cost')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.slice(0, 50).map((entry, index) => (
            <tr key={`${entry.time}-${index}`} onClick={() => setOpen(open === index ? undefined : index)} className="clickable">
              <td>{new Date(entry.time).toLocaleTimeString('en-GB')}</td>
              <td>{entry.role}</td>
              <td className="mono">{entry.model}</td>
              <td className={entry.ok && !entry.rejected?.length ? 'ok' : 'warn'}>
                {entry.ok ? (entry.rejected?.length ? t('settings.log.rejected', { reasons: entry.rejected.join(', ') }) : t('settings.log.ok')) : entry.error}
                {entry.fixed?.length ? ` ${t('settings.log.fixed', { what: entry.fixed.join('; ') })}` : ''}
              </td>
              <td>{entry.latencyMs}</td>
              <td>
                {entry.inputTokens}/{entry.outputTokens}
              </td>
              <td>{entry.inputTokens ? `${Math.round((100 * entry.cachedTokens) / entry.inputTokens)}%` : ''}</td>
              <td className="num">{entry.ok ? usd(entry.costUsd, 4) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open !== undefined && entries[open] && (
        <div className="log-detail">
          <h3>{t('settings.log.prompt')}</h3>
          <pre>{entries[open]!.prompt}</pre>
          <h3>{t('settings.log.reply')}</h3>
          <pre>{entries[open]!.response || t('settings.log.noReply')}</pre>
        </div>
      )}
    </div>
  )
}
