import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/engine'
import { assignKeys, DEFAULT_LIMITS, readReply, type ChronicleInput } from '../src/chronicler'
import { buildInput } from '../src/engine/chronicler'
import { chroniclerTrial } from '../src/engine/dialogue/testset'
import { kindSituation, SITUATION_KINDS } from '../src/engine/trials'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// M10.28, a rule found by measuring: Anthropic caches the schema of the answer
// ahead of the system part, so a schema that changes from call to call makes
// every call write its fixed part again (eleven of nineteen talk lines read
// nothing, 29 September 2026). Every kind of call has one schema that does not
// depend on the world, the situation or the speaker; ids and choices go in the
// prompt, and the game checks them. Each kind is built in two situations:
// another world where it can be, and a second situation of its own (other
// people, another night, other words).

describe('M10.28: one schema per kind', () => {
  it('builds every kind in two situations and gets the same schema', async () => {
    const base = await loadContentFromDir('content')
    const baseFiles = await readContentFiles('content', 'base')
    const isleFiles = await readContentFiles('content', 'isle')
    const worlds = { base, isle: isleFiles }
    const swapped = { base: loadContent(isleFiles), isle: baseFiles }
    const built = async (build: () => Promise<{ request: { schema: unknown; system: string; prompt: string } } | undefined>) => {
      try {
        return (await build())?.request
      } catch {
        return undefined
      }
    }
    const unvaried: string[] = []
    for (const kind of SITUATION_KINDS) {
      const first = (await kindSituation(kind, worlds))!.request
      const others = [await built(() => kindSituation(kind, worlds, 1)), await built(() => kindSituation(kind, swapped))].filter((r): r is NonNullable<typeof r> => Boolean(r))
      const differing = others.filter((r) => r.system !== first.system || r.prompt !== first.prompt)
      if (!differing.length) unvaried.push(kind)
      for (const other of differing) expect(JSON.stringify(other.schema), kind).toBe(JSON.stringify(first.schema))
    }
    // Every kind was really built in a second situation.
    expect(unvaried).toEqual([])
  }, 300_000)

  it('the night round takes from the fixed schema only what was asked tonight', async () => {
    const base = await loadContentFromDir('content')
    const engine = (await chroniclerTrial(base)).find((e) => e.state.chronicle?.pending[0])!
    const input: ChronicleInput = buildInput(engine.world, engine.state.chronicle!.pending[0]!)
    const quiet: ChronicleInput = { ...input, lines: input.lines.map((l) => ({ ...l, phase: 'setup' as const })) }
    delete quiet.mayPlan
    delete quiet.signals
    delete quiet.verbs
    const keys = assignKeys(quiet)
    const line = keys.key(quiet.lines[0]!.id, 'line')!
    const reply = JSON.stringify({
      lookup: ['p1'],
      lore: [],
      lines: [{ line, summary: ['Still open.'], roles: [], hooks: [], next: '', close: false, phase: 'crisis' }],
      quests: [],
      thoughts: [],
      news: [],
      named: [],
      heard: [],
      tensions: [],
      plans: [{ line, signal: '', name: 'a beat', phases: [], steps: [{ after: 1, verb: 'thought', who: ['p1'], target: '', detail: 'Something to say.' }] }],
    })
    // No lookups left: the rest is read, the lookup set aside.
    const read = readReply(reply, keys, quiet, DEFAULT_LIMITS, 0)
    expect(read.lookups).toEqual([])
    expect(read.output.lines).toHaveLength(1)
    // No verbs: no phase; nothing to plan: no plan.
    expect(read.output.lines[0]!.phase).toBeUndefined()
    expect(read.output.plans).toBeUndefined()
    // With lookups left, the lookup is what comes back.
    expect(readReply(reply, keys, quiet, DEFAULT_LIMITS).lookups.length).toBe(1)
  }, 120_000)
})
