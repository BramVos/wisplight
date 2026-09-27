import { useCallback, useEffect, useState } from 'react'
import type { UsageTotals } from '../../node/ai/usage'
import type { Advice, AiBridge, AiLogEntry, AiOverview, ModelInfo, ProviderId, TrialResult } from './client'

// Settings > AI, Usage and the AI log (FO, chapter 16). Keys are typed here,
// sent to the main process once, and only ever shown masked afterwards.

export type SettingsTab = 'ai' | 'usage' | 'log'

const PROVIDERS: { id: ProviderId; name: string; hint: string }[] = [
  { id: 'openai', name: 'OpenAI', hint: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic', hint: 'sk-ant-...' },
]

const ROLES = [
  { id: 'voice', name: 'VOICE (dialogue)' },
  { id: 'brain', name: 'BRAIN (NPC goals)' },
  { id: 'chronicler', name: 'CHRONICLER (lore, requests and news, mostly at night)' },
] as const

type Role = (typeof ROLES)[number]['id']

export const usd = (value: number | undefined, digits = value === undefined || value === 0 || value >= 0.1 ? 2 : value >= 0.01 ? 3 : 4) => (value === undefined ? 'price unknown' : `$${value.toFixed(digits)}`)
const tokens = (value: number) => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value))
const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '0%')
const message = (error: unknown) => (error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error))

export function Settings({ bridge, tab, onTab, onClose }: { bridge?: AiBridge; tab: SettingsTab; onTab: (tab: SettingsTab) => void; onClose: () => void }) {
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
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="panel settings">
        <header className="panel-head">
          <h2>Settings</h2>
          <nav className="tabs">
            {(['ai', 'usage', 'log'] as const).map((id) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => onTab(id)}>
                {id === 'ai' ? 'AI' : id === 'usage' ? 'Usage' : 'AI log'}
              </button>
            ))}
          </nav>
          <button type="button" className="link" onClick={onClose}>
            [Close]
          </button>
        </header>
        {!bridge ? (
          <p className="muted">AI settings work in the desktop app. In the browser preview, open the page with ?mock=1 to try them with made-up data.</p>
        ) : !overview ? (
          <p className="muted">{error ?? 'Loading...'}</p>
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

const PROVIDER_NAMES: Record<ProviderId, string> = { openai: 'OpenAI', anthropic: 'Anthropic' }
const choiceKey = (provider: ProviderId, model: string) => `${provider}:${model}`
const splitKey = (key: string): { provider: ProviderId; model: string } => {
  const [provider, ...rest] = key.split(':')
  return { provider: provider as ProviderId, model: rest.join(':') }
}

function trialText(trial: TrialResult | string | undefined): string | undefined {
  if (trial === undefined) return undefined
  if (typeof trial === 'string') return trial
  const cost = trial.costPerHourUsd === undefined ? 'price unknown' : `~${usd(trial.costPerHourUsd)} / hour`
  return `${trial.valid}/${trial.runs} valid  ${(trial.averageLatencyMs / 1000).toFixed(1)} s  ${cost}${trial.errors.length ? `  (${trial.errors[0]})` : ''}`
}

// Settings > AI (FO, chapter 16). The player picks a model per role from the
// lists the keys gave, at any time; advice and trials are there when wanted.
function AiTab({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: () => Promise<void> }) {
  const { settings } = overview
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ openai: '', anthropic: '' })
  const [busy, setBusy] = useState<string>()
  const [note, setNote] = useState<string>()
  const [problem, setProblem] = useState<string>()
  const [advice, setAdvice] = useState<Partial<Record<ProviderId, Advice>>>({})
  const [trials, setTrials] = useState<Record<string, TrialResult | string>>({})
  const [trying, setTrying] = useState<Partial<Record<Role, boolean>>>({})
  const [picked, setPicked] = useState<Partial<Record<Role, string>>>({})
  const [budget, setBudget] = useState(String(settings.budgetUsdPerHour))

  const connected = PROVIDERS.filter(({ id }) => settings.providers[id].configured)
  const options = connected.flatMap(({ id }) => (settings.models[id] ?? []).map((model) => ({ key: choiceKey(id, model), label: `${PROVIDER_NAMES[id]} · ${model}` })))
  const inUse = (role: Role) => {
    const choice = settings.roles[role]
    return choice ? choiceKey(choice.provider, choice.model) : undefined
  }
  const selected = (role: Role) => picked[role] ?? inUse(role) ?? ''

  const run = async (label: string, work: () => Promise<void>) => {
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
    run(`Checking the ${PROVIDER_NAMES[provider]} key`, async () => {
      const { models: count } = await bridge.connect(provider, keys[provider])
      setKeys((previous) => ({ ...previous, [provider]: '' }))
      setNote(`Key saved, encrypted. It can use ${count} chat models. Pick a model per role below, or ask for advice.`)
      await refresh()
    })

  const advise = (provider: ProviderId) =>
    run(`Asking ${PROVIDER_NAMES[provider]} for advice`, async () => {
      const result = await bridge.advise(provider)
      setAdvice((previous) => ({ ...previous, [provider]: result }))
      setNote(`Advice from ${result.advisorModel}: use it with [Use], try it with [Try], then [Save].`)
      await refresh()
    })

  const reload = () =>
    run('Asking the providers for their models', async () => {
      const missing = await bridge.refresh()
      await refresh()
      setNote(missing.length ? `No longer offered: the model for ${missing.join(', ')}. Pick another.` : 'Model lists are up to date; your chosen models are all still offered.')
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

  const save = (role: Role) =>
    run(`Saving the ${role} model`, async () => {
      const key = selected(role)
      if (!key) return
      const { provider, model } = splitKey(key)
      const stored = await bridge.choose(role, provider, model)
      setPicked((previous) => ({ ...previous, [role]: undefined }))
      setNote(`Saved: ${role} uses ${stored}.`)
      await refresh()
    })

  return (
    <div className="settings-body">
      {!settings.encryption && <p className="warn">Secure storage is not available on this computer, so keys cannot be saved.</p>}
      {PROVIDERS.map(({ id, name, hint }) => {
        const state = settings.providers[id]
        return (
          <div key={id} className="row">
            <span className="label">{name} key</span>
            {state.configured ? (
              <>
                <span className="mono">{state.masked}</span>
                <span className="muted">encrypted, {settings.models[id]?.length ?? 0} models</span>
                <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void advise(id)}>
                  [Ask for advice]
                </button>
                <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void run('Removing', async () => (await bridge.disconnect(id), await refresh()))}>
                  [Remove]
                </button>
              </>
            ) : (
              <>
                <input type="password" autoComplete="off" spellCheck={false} placeholder={hint} value={keys[id]} onChange={(event) => setKeys((previous) => ({ ...previous, [id]: event.target.value }))} aria-label={`${name} API key`} />
                <button type="button" className="link" disabled={!keys[id].trim() || Boolean(busy)} onClick={() => void connect(id)}>
                  [Connect]
                </button>
              </>
            )}
          </div>
        )
      })}

      {busy && <p className="muted">{busy}...</p>}
      {note && <p className="ok">{note}</p>}
      {problem && <p className="warn">{problem}</p>}

      <section className="advice">
        {options.length === 0 ? (
          <p className="muted">Connect a key to choose models. Without a model, NPCs speak set lines and the chronicle comes from templates.</p>
        ) : (
          ROLES.map(({ id: role, name }) => {
            const current = inUse(role)
            const key = selected(role)
            const suggestions = Object.values(advice).flatMap((a) =>
              a ? [a[role].recommended, a[role].cheaper].map((c, i) => ({ provider: a.provider, ...c, cheaper: i === 1 })) : [],
            )
            const unique = suggestions.filter((c, i) => suggestions.findIndex((d) => d.provider === c.provider && d.model === c.model) === i)
            return (
              <fieldset key={role}>
                <legend>{name}</legend>
                <div className="choice other">
                  <span className="muted">in use:</span>
                  <span className="mono">
                    {settings.roles[role]?.model ?? (role === 'voice' ? 'none (NPCs use set lines)' : role === 'chronicler' ? 'none (stories from templates)' : 'none (schedule and needs only)')}
                    {settings.missing.includes(role) ? '  no longer offered: pick another' : ''}
                  </span>
                </div>
                <div className="choice pick">
                  <select value={key} onChange={(event) => setPicked((previous) => ({ ...previous, [role]: event.target.value }))} aria-label={`Model for ${role}`}>
                    {!key && <option value="">choose a model</option>}
                    {current && !options.some((o) => o.key === current) && <option value={current}>{current.replace(':', ' · ')} (no longer offered)</option>}
                    {options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="link" disabled={!key || trying[role]} onClick={() => void tryRole(role)}>
                    {trying[role] ? '[Trying...]' : '[Try]'}
                  </button>
                  <button type="button" className="link" disabled={!key || key === current || Boolean(busy)} onClick={() => void save(role)}>
                    [Save]
                  </button>
                </div>
                {trialText(trials[`${role}:${key}`]) && <p className="trial">{trialText(trials[`${role}:${key}`])}</p>}
                {unique.map((c) => (
                  <div key={`${c.provider}:${c.model}`} className="choice">
                    <button type="button" className="link" onClick={() => setPicked((previous) => ({ ...previous, [role]: choiceKey(c.provider, c.model) }))}>
                      [Use]
                    </button>
                    <span className="mono">
                      {c.model}
                      {c.cheaper ? ' (cheaper)' : ''}
                    </span>
                    <span className="reason">"{c.reason}"</span>
                  </div>
                ))}
              </fieldset>
            )
          })
        )}
        {options.length > 0 && (
          <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void reload()}>
            [Check model lists again]
          </button>
        )}
      </section>

      <Pictures bridge={bridge} overview={overview} refresh={refresh} />

      <div className="row">
        <span className="label">Budget per hour</span>
        <span>$</span>
        <input className="amount" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} aria-label="Budget per hour of play in dollars" />
        <button type="button" className="link" disabled={Boolean(busy) || !(Number(budget) > 0)} onClick={() => void run('Saving', async () => (await bridge.setBudget(Number(budget)), await refresh(), setNote('Budget saved.')))}>
          [Save]
        </button>
        <span className="muted">At 80% the chronicler and the goals of NPCs without a quest role wait; at 100% dialogue falls back to set lines.</span>
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
      <td>
        {totals.calls.toLocaleString('en-GB')} {totals.calls === 1 ? 'call' : 'calls'}
      </td>
      <td>
        {tokens(totals.inputTokens)} in ({percent(totals.cachedTokens, totals.inputTokens)} cached)
      </td>
      <td>{tokens(totals.outputTokens)} out</td>
      <td className="num">{usd(totals.costUsd)}</td>
    </tr>
  )
}

// Pictures of places and people (after the M7 playtest): optional, OpenAI only.
function Pictures({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: () => Promise<void> }) {
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
  const act = async (label: string, work: () => Promise<void>) => {
    setState(`${label}...`)
    try {
      await work()
      setState(undefined)
    } catch (reason) {
      setState(message(reason))
    }
  }

  return (
    <fieldset className="pictures">
      <legend>PICTURES (places and people, optional)</legend>
      <p className="muted small">
        Claude makes no pictures; the image models of OpenAI do. Each area (all its places share one picture) and each named person is drawn once, in the style of the world, and kept; generic people get a plain figure. At low quality a picture costs about half a cent to one cent (September 2026), and counts in the budget.
      </p>
      <div className="choice other">
        <span className="muted">in use:</span>
        <span className="mono">{settings.pictures ? `${settings.pictures.model} (${settings.pictures.quality})` : 'none (no pictures)'}</span>
      </div>
      {!openai ? (
        <p className="muted">Connect an OpenAI key above to choose an image model.</p>
      ) : (
        <div className="choice pick">
          <select value={model} onChange={(event) => setPicked(event.target.value)} aria-label="Image model">
            {models.length === 0 && <option value="">no image models for this key</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
          <button type="button" className="link" disabled={!model || Boolean(state)} onClick={() => void act('Drawing a trial picture', async () => setTrial(await bridge.tryPicture('openai', model)))}>
            [Try]
          </button>
          <button type="button" className="link" disabled={!model || Boolean(state) || settings.pictures?.model === model} onClick={() => void act('Saving', async () => (await bridge.setPictures('openai', model, 'low'), await refresh()))}>
            [Save]
          </button>
          {settings.pictures && (
            <button type="button" className="link" disabled={Boolean(state)} onClick={() => void act('Turning pictures off', async () => (await bridge.setPictures(null), await refresh()))}>
              [Off]
            </button>
          )}
        </div>
      )}
      {state && <p className="muted">{state}</p>}
      {trial && <img className="trial-picture" src={trial} alt="A trial picture of the start of the world" />}
    </fieldset>
  )
}

function UsageTab({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: () => Promise<void> }) {
  const { usage, status, settings } = overview
  const [month, setMonth] = useState(usage.monthBudgetUsd ? String(usage.monthBudgetUsd) : '')
  const [credit, setCredit] = useState<Record<ProviderId, string>>({ openai: '', anthropic: '' })
  const [problem, setProblem] = useState<string>()

  const act = async (work: () => Promise<void>) => {
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
          The price of {u.model} ({u.role}) is not known: its tokens are counted, and it is called at most {u.cap} times an hour ({u.callsThisHour} this hour).
        </p>
      ))}
      <table className="usage">
        <tbody>
          <Totals label="This session" totals={usage.session} />
          <Totals label="Today" totals={usage.today} />
          <Totals label="This month" totals={usage.month} />
        </tbody>
      </table>
      {usage.byRole.length > 0 && (
        <table className="usage small">
          <thead>
            <tr>
              <th scope="col">role</th>
              <th scope="col">calls</th>
              <th scope="col">from the cache</th>
              <th scope="col">written to it</th>
            </tr>
          </thead>
          <tbody>
            {usage.byRole.map((r) => (
              <tr key={r.role}>
                <td>{r.role}</td>
                <td>{r.calls}</td>
                <td>{r.cachedPercent}% of {r.inputTokens.toLocaleString('en-GB')} tokens</td>
                <td>{r.cacheWriteTokens ? r.cacheWriteTokens.toLocaleString('en-GB') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row">
        <span className="label">Hourly budget</span>
        <Bar part={status.hourSpentUsd} whole={status.hourBudgetUsd} />
        <span>
          {usd(status.hourSpentUsd)} of {usd(status.hourBudgetUsd)}
        </span>
      </div>
      <div className="row">
        <span className="label">Month budget</span>
        {usage.monthBudgetUsd ? (
          <>
            <Bar part={usage.month.costUsd} whole={usage.monthBudgetUsd} />
            <span>
              {usd(usage.month.costUsd)} of {usd(usage.monthBudgetUsd)}
            </span>
            <span className={usage.monthLeftPercent! <= 20 ? 'warn' : 'ok'}>{usage.monthLeftPercent}% left</span>
          </>
        ) : (
          <span className="muted">off</span>
        )}
        <span>$</span>
        <input className="amount" inputMode="decimal" value={month} placeholder="none" onChange={(event) => setMonth(event.target.value)} aria-label="Month budget in dollars" />
        <button type="button" className="link" onClick={() => void act(() => bridge.setMonthBudget(month.trim() ? Number(month) : null))}>
          [Save]
        </button>
      </div>

      {connected.map(({ id, name }) => {
        const known = usage.credit.find((c) => c.provider === id)
        return (
          <div key={id} className="row">
            <span className="label">{name} credit</span>
            {known ? (
              <span className={known.leftPercent <= 20 ? 'warn' : ''}>
                estimated {usd(known.estimatedLeftUsd)} of {usd(known.amountUsd)} ({known.leftPercent}%), entered {new Date(known.enteredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {known.stale ? '. Over 30 days old, please copy it again.' : ''}
              </span>
            ) : (
              <span className="muted">not entered</span>
            )}
            <span>$</span>
            <input className="amount" inputMode="decimal" value={credit[id]} placeholder="balance" onChange={(event) => setCredit((previous) => ({ ...previous, [id]: event.target.value }))} aria-label={`${name} credit balance in dollars`} />
            <button type="button" className="link" disabled={!credit[id].trim()} onClick={() => void act(async () => (await bridge.setCredit(id, Number(credit[id])), setCredit((previous) => ({ ...previous, [id]: '' }))))}>
              [Update credit]
            </button>
            <button type="button" className="link" onClick={() => void bridge.billing(id)}>
              [Open billing page]
            </button>
          </div>
        )
      })}
      <p className="muted small">Neither provider tells the game how much credit is left, so the game counts down from the balance you copy from their console. Other programs on the same account are not counted, hence "estimated".</p>

      <table className="usage">
        <thead>
          <tr>
            <th scope="col">By model, this month</th>
            <th scope="col">calls</th>
            <th scope="col">in</th>
            <th scope="col">cached</th>
            <th scope="col">out</th>
            <th scope="col" className="num">
              cost
            </th>
          </tr>
        </thead>
        <tbody>
          {usage.byModel.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No calls yet this month.
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
              <td className="num">{row.unpriced && !row.costUsd ? 'price unknown' : usd(row.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <span className="muted">
          Fell back to set lines: {usage.fallbackPercent}% ({usage.month.failed} failed calls, {usage.month.rejected} rejected replies)
        </span>
        <button type="button" className="link" onClick={() => void download()}>
          [Export CSV]
        </button>
      </div>
      <p className="muted small">Amounts are worked out from list prices. The invoice from the provider is what counts.</p>
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
  if (!entries) return <p className="muted">Loading...</p>
  if (!entries.length) return <p className="muted">No model calls yet in this session.</p>
  return (
    <div className="settings-body">
      <table className="usage log-table">
        <thead>
          <tr>
            <th scope="col">time</th>
            <th scope="col">role</th>
            <th scope="col">model</th>
            <th scope="col">result</th>
            <th scope="col">ms</th>
            <th scope="col">tokens</th>
            <th scope="col">cache</th>
            <th scope="col" className="num">
              cost
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.time}-${index}`} onClick={() => setOpen(open === index ? undefined : index)} className="clickable">
              <td>{new Date(entry.time).toLocaleTimeString('en-GB')}</td>
              <td>{entry.role}</td>
              <td className="mono">{entry.model}</td>
              <td className={entry.ok ? 'ok' : 'warn'}>{entry.ok ? 'ok' : entry.error}</td>
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
          <h3>Prompt</h3>
          <pre>{entries[open]!.prompt}</pre>
          <h3>Reply</h3>
          <pre>{entries[open]!.response || '(none)'}</pre>
        </div>
      )}
    </div>
  )
}
