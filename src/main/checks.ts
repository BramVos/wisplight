import { randomBytes } from 'node:crypto'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { App } from 'electron'
import { Engine, GameClock, type Content } from '../engine'
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

// WISPLIGHT_LOG_CHECK=1: plays save, load, continue and log through the real
// window and main process, in a throwaway user data folder.
export function prepareLogCheck(app: App): string {
  // Chromium writes a few profile files as the app closes, after our own clean-up; remove old ones first.
  for (const name of readdirSync(tmpdir())) if (name.startsWith('wisplight-logcheck-')) rmSync(join(tmpdir(), name), { recursive: true, force: true })
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-logcheck-'))
  app.setPath('userData', dir)
  return dir
}

/** WISPLIGHT_BUILDER_CHECK=1: a throwaway copy of the content, changed through the real editor bridge while a game runs. */
export function prepareBuilderCheck(app: App): string {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-buildercheck-'))
  cpSync(join(app.getAppPath(), 'content'), join(dir, 'content'), { recursive: true })
  app.setPath('userData', join(dir, 'user'))
  return dir
}

export const BUILDER_CHECK_SCRIPT = `(async () => {
  const out = []
  // The world picker waits for a choice (M8): start in the Nethermarch.
  await window.wisplight.start('base')
  const editor = window.wisplight.editor
  const quay = await editor.entity('base', 'location', 'loc_veenhoek_quay')
  const day = 'Grey water slaps against the planks. A new stone stands on the quay now. It smells of tar. The green is north.\\n'
  const saved = await editor.save('base', [{ kind: 'location', id: 'loc_veenhoek_quay', data: { ...quay.raw, description: { ...quay.raw.description, day } } }])
  out.push('save: ' + (saved.ok ? 'ok, ' + saved.changes.map((c) => c.path + ' (' + c.lines.filter((l) => l.kind !== ' ' && l.kind !== '@').length + ' lines)').join(', ') : 'refused: ' + saved.problems.join('; ')))
  await new Promise((r) => setTimeout(r, 500))
  const look = await window.wisplight.command('look')
  out.push('look: ' + (look.outputs.map((o) => o.text).join(' ').includes('A new stone stands on the quay now.') ? 'shows the change' : 'DOES NOT show the change'))
  const broken = await editor.save('base', [{ kind: 'location', id: 'loc_veenhoek_quay', data: { ...quay.raw, exits: { north: { to: 'loc_nowhere' } } } }])
  out.push('broken change: ' + (broken.ok ? 'SAVED' : 'refused'))
  const view = await editor.view('base')
  out.push('check: ' + view.problems.length + ' problems, ' + view.warnings.length + ' warnings')
  const isle = await editor.view('isle')
  out.push('isle: ' + isle.lists.npc.length + ' people, ' + isle.quests.map((q) => q.name + ' ' + q.solutions + ' solutions').join(', '))
  return out.join('\\n')
})()`

export const LOG_CHECK_SCRIPT = `(async () => {
  const out = []
  await window.wisplight.start('base')
  const run = async (command) => {
    const reply = await window.wisplight.command(command)
    out.push('> ' + command, ...reply.outputs.map((o) => '  ' + o.text.split('\\n').join('\\n  ')))
  }
  for (const command of ['north', 'save', 'east', 'talk mirte', 'bye', 'load', 'log 12', 'west', 'continue', 'log 5', 'Save me!']) await run(command)
  // The journal and the end view go over the same bridge.
  const page = await window.wisplight.page('loc_veenhoek_quay')
  out.push('page: ' + (page ? page.name + ', ' + page.lines.length + ' lines' : 'NONE'))
  const end = await window.wisplight.end()
  out.push('end: log ' + (end.log ? end.log.split('\\n').length + ' lines' : 'NONE') + '; ' + end.chronicle.split('\\n').slice(0, 4).join(' | '))
  return out.join('\\n')
})()`

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
  const named = [advice.voice.recommended, advice.voice.cheaper, advice.brain.recommended, advice.brain.cheaper, advice.chronicler.recommended, advice.chronicler.cheaper]
  console.log(`[ai-check] ${provider}: advice by ${advice.advisorModel}`)
  for (const [label, choice] of [
    ['voice', advice.voice.recommended],
    ['voice, cheaper', advice.voice.cheaper],
    ['brain', advice.brain.recommended],
    ['brain, cheaper', advice.brain.cheaper],
    ['chronicler', advice.chronicler.recommended],
    ['chron., cheaper', advice.chronicler.cheaper],
  ] as const) {
    console.log(`[ai-check]   ${label.padEnd(15)} ${choice.model}  ${ids.includes(choice.model) ? 'exists' : 'NOT IN LIST'}  "${choice.reason}"`)
  }
  if (!named.every((c) => ids.includes(c.model))) ok = false
  for (const [role, model] of [['voice', advice.voice.recommended.model], ['brain', advice.brain.recommended.model], ['chronicler', advice.chronicler.recommended.model]] as const) {
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
  ok = (await chronicleCheck(ai, content, provider, advice.chronicler.recommended.model)) && ok
  return ok
}

/** One real chronicler run on the drowning of Harmen, with the advised model; the choice you had is put back. */
async function chronicleCheck(ai: AiService, content: Content, provider: ProviderId, model: string): Promise<boolean> {
  const before = ai.settings.role('chronicler')
  ai.settings.setRole('chronicler', { provider, model })
  try {
    const engine = new Engine(content, { seed: 3, llm: ai.gateway, builder: true })
    engine.tick(GameClock.from(211, 9, 15, 11).minutes - engine.world.now)
    engine.state.npcs['npc_mirte']!.location = engine.state.npcs['npc_harmen']!.location
    await engine.handle('@kill harmen drowned in the Blackmere')
    const [run] = await engine.runChronicler()
    const lore = engine.state.chronicle?.lore[0]
    console.log(`[ai-check]   chronicler ${model}: ${lore?.by ?? 'nothing'}${run?.problems.length ? `; dropped: ${run.problems.join(' | ')}` : ''}`)
    if (lore) for (const line of [lore.name, lore.summary, lore.details, lore.story, `far: ${lore.far}`, `teller: ${lore.teller ?? '-'}`]) console.log(`[ai-check]     ${line}`)
    for (const [area, news] of Object.entries(engine.state.chronicle?.news ?? {})) console.log(`[ai-check]     news ${area}: ${news.text}`)
    for (const r of engine.state.requests.filter((r) => r.source === 'chronicler')) console.log(`[ai-check]     request by ${r.npc}: ${r.name}: "${r.ask}"`)
    for (const [id, npc] of Object.entries(engine.state.npcs)) for (const t of npc.thoughts ?? []) console.log(`[ai-check]     on ${id}'s mind: ${t.text}`)
    return lore?.by === 'chronicler'
  } finally {
    if (before) ai.settings.setRole('chronicler', before)
    else ai.settings.clearRole('chronicler')
  }
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
