import type { Content } from '../../engine'
import type { LlmClient } from '../../engine/dialogue/llm'
import { costUsd } from '../../node/ai/pricing'
import type { UsageSummary, UsageTotals } from '../../node/ai/usage'
import type { AiBridge, AiLogEntry, AiStatus, ModelInfo, ProviderId } from './client'

// Browser preview only (npm run web, then open /?mock=1). Made-up data behind
// the same bridge the desktop app uses, so the settings screen can be checked
// without a key. Nothing here is stored and no key is kept, only its mask.

const DEMO_MODEL = 'gpt-4.1-mini-2025-04-14'

const MODELS: Record<ProviderId, ModelInfo[]> = {
  openai: ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14', 'gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14', 'gpt-4o-mini', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5.4', 'gpt-5.4-mini'].map((id) => ({ id })),
  anthropic: ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5-5'].map((id) => ({ id })),
}

const empty = (): UsageTotals => ({ calls: 0, failed: 0, rejected: 0, inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0, unpriced: 0 })

const state = {
  keys: {} as Partial<Record<ProviderId, string>>,
  roles: {} as Partial<Record<'voice' | 'brain' | 'chronicler', { provider: ProviderId; model: string }>>,
  budget: 0.1,
  monthBudget: 5 as number | undefined,
  credit: { openai: { amountUsd: 10, enteredAt: '2026-09-02T09:00:00.000Z', spent: 0 } } as Partial<Record<ProviderId, { amountUsd: number; enteredAt: string; spent: number }>>,
  session: empty(),
  // A month of earlier play, so the overview has something to show.
  month: { calls: 2340, failed: 31, rejected: 11, inputTokens: 5_650_000, cachedTokens: 3_700_000, outputTokens: 314_000, costUsd: 1.36, unpriced: 0 },
  log: [] as AiLogEntry[],
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The mock model with a short delay, so the "thinking" line shows, and with its usage counted. */
export function slowMock(llm: LlmClient): LlmClient {
  return {
    complete: async (request) => {
      await wait(700)
      const response = await llm.complete(request)
      const usage = { ...response.usage, cachedTokens: Math.round(response.usage.inputTokens * 0.6) }
      const cost = costUsd('gpt-4.1-mini', usage) ?? 0
      for (const totals of [state.session, state.month]) {
        totals.calls++
        totals.inputTokens += usage.inputTokens
        totals.cachedTokens += usage.cachedTokens
        totals.outputTokens += usage.outputTokens
        totals.costUsd += cost
      }
      if (state.credit.openai) state.credit.openai.spent += cost
      state.log.unshift({ time: new Date().toISOString(), role: request.role, provider: 'mock', model: DEMO_MODEL, ok: true, latencyMs: 700, ...usage, costUsd: cost, prompt: request.prompt, response: response.text })
      return { ...response, model: DEMO_MODEL, usage }
    },
  }
}

export function demoStatus(): AiStatus {
  const spent = state.session.costUsd
  return {
    connected: true,
    sessionUsd: spent,
    hourPercent: Math.round((spent / state.budget) * 100),
    monthLeftPercent: state.monthBudget ? Math.max(0, Math.round((1 - state.month.costUsd / state.monthBudget) * 100)) : undefined,
    busy: false,
    coolingDown: false,
    budgetSpent: spent >= state.budget,
  }
}

function usage(): UsageSummary {
  return {
    session: { ...state.session },
    today: { ...state.session, calls: state.session.calls + 71, costUsd: state.session.costUsd + 0.033 },
    month: { ...state.month },
    byModel: [
      { provider: 'openai', model: DEMO_MODEL, ...state.month, calls: state.month.calls - 730, costUsd: state.month.costUsd - 0.1 },
      { provider: 'openai', model: 'gpt-4.1-nano-2025-04-14', calls: 730, failed: 0, rejected: 0, inputTokens: 1_460_000, cachedTokens: 1_020_000, outputTokens: 73_000, costUsd: 0.1, unpriced: 0 },
    ],
    monthBudgetUsd: state.monthBudget,
    monthLeftPercent: demoStatus().monthLeftPercent,
    credit: (Object.entries(state.credit) as [ProviderId, { amountUsd: number; enteredAt: string; spent: number }][]).map(([provider, c]) => {
      const left = Math.max(0, c.amountUsd - 1.36 - c.spent)
      return { provider, amountUsd: c.amountUsd, enteredAt: c.enteredAt, estimatedLeftUsd: left, leftPercent: Math.round((left / c.amountUsd) * 100), stale: false }
    }),
    fallbackPercent: Math.round(((state.month.failed + state.month.rejected) / state.month.calls) * 1000) / 10,
  }
}

export function demoBridge(_content: Content): AiBridge {
  return {
    overview: async () => ({
      settings: {
        providers: {
          openai: { configured: Boolean(state.keys.openai), masked: state.keys.openai },
          anthropic: { configured: Boolean(state.keys.anthropic), masked: state.keys.anthropic },
        },
        roles: { ...state.roles },
        budgetUsdPerHour: state.budget,
        encryption: true,
        models: Object.fromEntries((['openai', 'anthropic'] as const).filter((p) => state.keys[p]).map((p) => [p, MODELS[p].map((m) => m.id)])),
        missing: [],
      },
      usage: usage(),
      status: { busy: false, coolingDown: false, hourSpentUsd: state.session.costUsd, hourBudgetUsd: state.budget, monthBudgetSpent: false },
    }),
    connect: async (provider, key) => {
      await wait(500)
      if (!/^sk-/.test(key.trim())) throw new Error('The key did not work: the API key was refused')
      state.keys[provider] = `${provider === 'anthropic' ? 'sk-ant-' : 'sk-'}...${key.trim().slice(-4)}`
      return { models: MODELS[provider].length }
    },
    disconnect: async (provider) => {
      delete state.keys[provider]
    },
    models: async (provider) => MODELS[provider],
    refresh: async () => [],
    advise: async (provider) => {
      await wait(1500)
      return provider === 'openai'
        ? {
            provider,
            advisorModel: 'gpt-5.4',
            voice: { recommended: { model: 'gpt-4.1-mini-2025-04-14', reason: 'Good English and strict JSON at a low price.' }, cheaper: { model: 'gpt-4.1-nano-2025-04-14', reason: 'Cheapest, but flatter characters.' } },
            brain: { recommended: { model: 'gpt-4.1-nano-2025-04-14', reason: 'Goal choice is simple; the smallest model is enough.' }, cheaper: { model: 'gpt-5-nano', reason: 'Even cheaper, but it reasons first and is slower.' } },
            chronicler: { recommended: { model: 'gpt-5.4', reason: 'Writes well and keeps to the facts; it runs rarely.' }, cheaper: { model: 'gpt-4.1-mini-2025-04-14', reason: 'Plainer stories at a fraction of the price.' } },
            unknownPrices: [],
          }
        : {
            provider,
            advisorModel: 'claude-sonnet-5',
            voice: { recommended: { model: 'claude-haiku-4-5-20251001', reason: 'Stays in character best at this price.' }, cheaper: { model: 'claude-haiku-4-5-20251001', reason: 'There is no cheaper model for this key.' } },
            brain: { recommended: { model: 'claude-haiku-4-5-20251001', reason: 'Fast and reliable JSON.' }, cheaper: { model: 'claude-haiku-4-5-20251001', reason: 'There is no cheaper model for this key.' } },
            chronicler: { recommended: { model: 'claude-sonnet-5', reason: 'The best writer here, and a night run stays around two cents.' }, cheaper: { model: 'claude-haiku-4-5-20251001', reason: 'Half the price, plainer stories.' } },
            unknownPrices: [],
          }
    },
    trial: async (provider, model, role) => {
      await wait(1200)
      const perHour = model.includes('nano') ? 0.011 : model.includes('haiku') ? 0.21 : model.includes('mini') ? 0.058 : 0.4
      const runs = role === 'voice' ? 6 : role === 'brain' ? 3 : 2
      return { provider, model, role, runs, valid: runs, averageLatencyMs: model.includes('nano') ? 800 : 1900, inputTokens: 14800, outputTokens: 930, costUsd: perHour / 10, costPerHourUsd: perHour, errors: [] }
    },
    choose: async (role, provider, model) => {
      await wait(600)
      state.roles[role] = { provider, model }
      return model
    },
    setBudget: async (usd) => {
      state.budget = Math.max(0.01, Math.min(5, usd))
    },
    setMonthBudget: async (usd) => {
      state.monthBudget = usd && usd > 0 ? usd : undefined
    },
    setCredit: async (provider, usd) => {
      if (usd && usd > 0) state.credit[provider] = { amountUsd: usd, enteredAt: new Date().toISOString(), spent: -1.36 }
      else delete state.credit[provider]
    },
    csv: async () => 'date,provider,model,calls,failed,rejected,input_tokens,cached_tokens,output_tokens,cost_usd\n2026-09-26,openai,gpt-4.1-mini-2025-04-14,41,0,0,102000,62200,6100,0.032000\n',
    log: async () => state.log.slice(0, 50),
    // The desktop app opens the provider's billing page here.
    billing: async () => undefined,
  }
}
