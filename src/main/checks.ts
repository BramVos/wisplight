import { randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { App } from 'electron'
import type { Content } from '../engine'
import { MockLlm } from '../engine/dialogue/mock'
import { runSituation, SITUATIONS } from '../engine/dialogue/testset'
import type { ProviderId } from '../node/ai/providers'
import type { AiService } from '../node/ai/service'

// Two checks for milestone M2 (docs/ROADMAP.md), run with the real Electron
// key store. Neither prints a key.
//
// WISPLIGHT_KEY_CHECK=1: in a throwaway user data folder, stores a made-up
// test key through the settings, lets a call fail with it, and searches every
// file for the key in plain text.
//
// WISPLIGHT_AI_CHECK=1: with the key the player entered in the settings, lists
// the models, asks for advice, checks that every advised id exists, tries the
// advice, stores the voice model and reads the id back, and plays three
// conversations.

let keyCheckDir: string | undefined

export function prepareKeyCheck(app: App): void {
  keyCheckDir = mkdtempSync(join(tmpdir(), 'wisplight-keycheck-'))
  app.setPath('userData', keyCheckDir)
}

export async function keyCheck(app: App, ai: AiService, content: Content): Promise<boolean> {
  const dir = app.getPath('userData')
  if (!keyCheckDir || dir !== keyCheckDir) {
    console.log('[key-check] refusing to run outside the throwaway folder')
    return false
  }
  const fake: Record<ProviderId, string> = {
    openai: `sk-proj-wisplighttest${randomBytes(12).toString('hex')}`,
    anthropic: `sk-ant-api03-wisplighttest${randomBytes(12).toString('hex')}`,
  }
  let ok = true
  for (const provider of ['openai', 'anthropic'] as const) {
    // Through the same path as the settings screen; the provider refuses the made-up key.
    try {
      await ai.connect(provider, fake[provider])
      console.log(`[key-check] ${provider}: the made-up key was accepted, which should not happen`)
      ok = false
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const leaked = message.includes(fake[provider])
      console.log(`[key-check] ${provider}: connect refused as expected; key in error text: ${leaked ? 'YES' : 'no'}`)
      if (leaked) ok = false
    }
    // Stored anyway, to check what lands on disk, then a call that fails.
    ai.settings.setKey(provider, fake[provider])
    ai.settings.setRole('voice', { provider, model: provider === 'openai' ? 'gpt-4.1-nano' : 'claude-haiku-4-5' })
    const run = await runSituation(content, SITUATIONS[0]!, ai.gateway)
    const shown = run.outputs.map((o) => o.text).join('\n')
    if (shown.includes(fake[provider])) ok = false
    const masked = ai.settings.summary().providers[provider].masked ?? ''
    console.log(`[key-check] ${provider}: shown in settings as ${masked}; conversation fell back to templates: ${run.replies.length === 0 ? 'yes' : 'no'}`)
  }
  const files = walk(dir)
  const hits = files.filter((file) => {
    const text = readFileSync(file).toString('latin1')
    return Object.values(fake).some((key) => text.includes(key) || text.includes(key.slice(-16)))
  })
  console.log(`[key-check] scanned ${files.length} files in the user data folder; plain key found in: ${hits.length ? hits.join(', ') : 'none'}`)
  if (hits.length) ok = false
  for (const provider of ['openai', 'anthropic'] as const) ai.disconnect(provider)
  const after = ai.settings.summary()
  console.log(`[key-check] after removing: openai ${after.providers.openai.configured ? 'still set' : 'gone'}, anthropic ${after.providers.anthropic.configured ? 'still set' : 'gone'}`)
  rmSync(dir, { recursive: true, force: true })
  console.log(`[key-check] ${ok ? 'PASS' : 'FAIL'}`)
  return ok
}

export async function aiCheck(ai: AiService, content: Content): Promise<boolean> {
  const summary = ai.settings.summary()
  // WISPLIGHT_AI_CHECK=openai or =anthropic checks one provider only.
  const only = process.env['WISPLIGHT_AI_CHECK']
  const providers = (['openai', 'anthropic'] as const).filter((p) => summary.providers[p].configured && (only === p || !['openai', 'anthropic'].includes(only ?? '')))
  if (!providers.length) {
    console.log('[ai-check] no API key in the settings yet. Enter one under Settings > AI, then run this again.')
    return false
  }
  let ok = true
  const before = ai.settings.role('voice')
  for (const provider of providers) {
    try {
      if (!(await checkProvider(ai, content, provider))) ok = false
    } catch (error) {
      console.log(`[ai-check] ${provider}: stopped: ${error instanceof Error ? error.message : String(error)}`)
      ok = false
    }
  }
  ok = (await finish(ai, content, before)) && ok
  console.log(`[ai-check] ${ok ? 'PASS' : 'FAIL'}`)
  return ok
}

async function checkProvider(ai: AiService, content: Content, provider: ProviderId): Promise<boolean> {
  let ok = true
  const summary = ai.settings.summary()
  console.log(`[ai-check] ${provider}: key ${summary.providers[provider].masked}`)
  const models = await ai.listModels(provider, true)
  const ids = models.map((m) => m.id)
  console.log(`[ai-check] ${provider}: ${ids.length} chat models: ${ids.slice(0, 40).join(', ')}${ids.length > 40 ? ', ...' : ''}`)
  const advice = await ai.advise(provider)
  const named = [advice.voice.recommended, advice.voice.cheaper, advice.brain.recommended, advice.brain.cheaper]
  console.log(`[ai-check] ${provider}: advice by ${advice.advisorModel}`)
  for (const [label, choice] of [['voice', advice.voice.recommended], ['voice, cheaper', advice.voice.cheaper], ['brain', advice.brain.recommended], ['brain, cheaper', advice.brain.cheaper]] as const) {
    console.log(`[ai-check]   ${label.padEnd(15)} ${choice.model}  ${ids.includes(choice.model) ? 'exists' : 'NOT IN LIST'}  "${choice.reason}"`)
  }
  if (!named.every((c) => ids.includes(c.model))) ok = false
  for (const [role, model] of [['voice', advice.voice.recommended.model], ['brain', advice.brain.recommended.model]] as const) {
    const t = await ai.trial(provider, model, role)
    console.log(`[ai-check]   trial ${role} ${model}: ${t.valid}/${t.runs} valid, ${t.averageLatencyMs} ms, ${t.inputTokens} in / ${t.outputTokens} out, ${t.costPerHourUsd === undefined ? 'price unknown' : `~$${t.costPerHourUsd.toFixed(3)} per hour`}${t.errors.length ? `; problems: ${t.errors.slice(0, 3).join(' | ')}` : ''}`)
  }
  const stored = await ai.choose('voice', provider, advice.voice.recommended.model)
  const exact = stored === advice.voice.recommended.model && ai.settings.role('voice')?.model === stored
  console.log(`[ai-check]   stored voice model: ${stored} (${exact ? 'exact match' : 'MISMATCH'})`)
  if (!exact) ok = false
  for (const situation of SITUATIONS.filter((s) => ['mirte_local', 'aaltje_story', 'wendela_recruit'].includes(s.id))) {
    const run = await runSituation(content, situation, ai.gateway)
    const said = run.outputs.filter((o) => o.kind === 'speech' || o.kind === 'check').slice(1, -1).map((o) => o.text)
    console.log(`[ai-check]   ${situation.id}: ${situation.lines.join(' / ')}`)
    for (const line of said) console.log(`[ai-check]     ${line}`)
  }
  const injection = await runSituation(content, SITUATIONS.find((s) => s.noCall)!, new MockLlm('good'))
  console.log(`[ai-check]   injection attempt made ${injection.requests.length} model calls`)
  return ok
}

async function finish(ai: AiService, content: Content, before: ReturnType<AiService['settings']['role']>): Promise<boolean> {
  if (before) {
    ai.settings.setRole('voice', before)
    console.log(`[ai-check] put back the voice model you had chosen: ${before.model}`)
    const run = await runSituation(content, SITUATIONS.find((s) => s.id === 'wendela_recruit')!, ai.gateway)
    console.log(`[ai-check]   wendela_recruit with ${before.model}: ${run.situation.lines.join(' / ')}`)
    for (const line of run.outputs.filter((o) => o.kind === 'speech').slice(1, -1)) console.log(`[ai-check]     ${line.text}`)
  }
  const usage = ai.usage.summary()
  console.log(`[ai-check] this run: ${usage.session.calls} calls, ${usage.session.inputTokens} tokens in (${usage.session.cachedTokens} cached), ${usage.session.outputTokens} out, $${usage.session.costUsd.toFixed(4)}`)
  return true
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}
