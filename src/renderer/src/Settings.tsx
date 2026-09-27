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

function AiTab({ bridge, overview, refresh }: { bridge: AiBridge; overview: AiOverview; refresh: () => Promise<void> }) {
  const { settings } = overview
  const [keys, setKeys] = useState<Record<ProviderId, string>>({ openai: '', anthropic: '' })
  const [busy, setBusy] = useState<string>()
  const [note, setNote] = useState<string>()
  const [problem, setProblem] = useState<string>()
  const [advice, setAdvice] = useState<Advice>()
  const [trials, setTrials] = useState<Record<string, TrialResult | string>>({})
  const [picked, setPicked] = useState<Partial<Record<Role, string>>>({})
  const [models, setModels] = useState<ModelInfo[]>([])
  const [budget, setBudget] = useState(String(settings.budgetUsdPerHour))

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
    run(`Checking the ${provider} key`, async () => {
      const { models: count } = await bridge.connect(provider, keys[provider])
      setKeys((previous) => ({ ...previous, [provider]: '' }))
      setNote(`Key saved, encrypted. It can use ${count} chat models.`)
      await refresh()
    })

  const advise = (provider: ProviderId) =>
    run(`Asking ${provider} for advice`, async () => {
      const result = await bridge.advise(provider)
      setAdvice(result)
      setModels(await bridge.models(provider))
      setPicked({ voice: result.voice.recommended.model, brain: result.brain.recommended.model, chronicler: result.chronicler.recommended.model })
      setTrials({})
      const tried = new Set<string>()
      for (const { id: role } of ROLES) {
        for (const choice of [result[role].recommended, result[role].cheaper]) {
          const key = `${role}:${choice.model}`
          if (tried.has(key)) continue
          tried.add(key)
          setBusy(`Trying ${choice.model} as ${role}`)
          try {
            const trial = await bridge.trial(provider, choice.model, role)
            setTrials((previous) => ({ ...previous, [key]: trial }))
          } catch (reason) {
            setTrials((previous) => ({ ...previous, [key]: message(reason) }))
          }
        }
      }
    })

  const save = () =>
    run('Saving your choice', async () => {
      if (!advice) return
      const stored: string[] = []
      for (const { id: role } of ROLES) {
        const model = picked[role]
        if (model) stored.push(`${role}: ${await bridge.choose(role, advice.provider, model)}`)
      }
      setNote(`Saved with the exact ids ${stored.join(', ')}.`)
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
                <span className="muted">encrypted</span>
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

      <div className="row">
        <span className="label">In use</span>
        <span className="mono">
          voice {settings.roles.voice?.model ?? 'none (NPCs use set lines)'}
          {'  '}brain {settings.roles.brain?.model ?? 'none'}
          {'  '}chronicler {settings.roles.chronicler?.model ?? 'none (stories from templates)'}
        </span>
      </div>

      {busy && <p className="muted">{busy}...</p>}
      {note && <p className="ok">{note}</p>}
      {problem && <p className="warn">{problem}</p>}

      {advice && (
        <section className="advice">
          <p className="muted">
            Advice from {advice.advisorModel}, tried on situations from the test set.
            {advice.unknownPrices.length ? ` Price unknown for ${advice.unknownPrices.join(', ')}.` : ''}
          </p>
          {ROLES.map(({ id: role, name }) => (
            <fieldset key={role}>
              <legend>{name}</legend>
              {[advice[role].recommended, advice[role].cheaper]
                .filter((choice, index, all) => all.findIndex((c) => c.model === choice.model) === index)
                .map((choice) => {
                  const trial = trials[`${role}:${choice.model}`]
                  return (
                    <label key={choice.model} className="choice">
                      <input type="radio" name={role} checked={picked[role] === choice.model} onChange={() => setPicked((previous) => ({ ...previous, [role]: choice.model }))} />
                      <span className="mono">{choice.model}</span>
                      <span className="trial">
                        {trial === undefined
                          ? 'not tried yet'
                          : typeof trial === 'string'
                            ? trial
                            : `${trial.valid}/${trial.runs} valid  ${(trial.averageLatencyMs / 1000).toFixed(1)} s  ${trial.costPerHourUsd === undefined ? 'price unknown' : `~${usd(trial.costPerHourUsd)} / hour`}`}
                      </span>
                      <span className="reason">"{choice.reason}"</span>
                    </label>
                  )
                })}
              <label className="choice other">
                <span className="muted">or pick yourself:</span>
                <select value={picked[role] ?? ''} onChange={(event) => setPicked((previous) => ({ ...previous, [role]: event.target.value }))}>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          ))}
          <button type="button" className="link" disabled={Boolean(busy)} onClick={() => void save()}>
            [Save choice]
          </button>
        </section>
      )}

      <div className="row">
        <span className="label">Budget per hour</span>
        <span>$</span>
        <input className="amount" inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} aria-label="Budget per hour of play in dollars" />
        <button type="button" className="link" disabled={Boolean(busy) || !(Number(budget) > 0)} onClick={() => void run('Saving', async () => (await bridge.setBudget(Number(budget)), await refresh(), setNote('Budget saved.')))}>
          [Save]
        </button>
        <span className="muted">At 80% NPC goals stop using the AI, at 100% dialogue falls back to set lines.</span>
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
      <table className="usage">
        <tbody>
          <Totals label="This session" totals={usage.session} />
          <Totals label="Today" totals={usage.today} />
          <Totals label="This month" totals={usage.month} />
        </tbody>
      </table>

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

function LogTab({ bridge }: { bridge: AiBridge }) {
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
