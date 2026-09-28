import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockLlm } from '../src/engine/dialogue/mock'
import { MODEL_KINDS } from '../src/engine/modelkinds'
import { kindSituation, schemaProblems, SITUATION_KINDS, type TrialWorlds } from '../src/engine/trials'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { coverage, coverageMarkdown } from '../scripts/coveragescan'

// M10.20: every kind of model call is tried, and that is written down
// (docs/COVERAGE.md). Each kind has a fixed situation; the mock answers it
// here and the game's own readers take the answer. A real model answers the
// same situation in the app (npm run trial), and what it said is kept under
// tests/fixtures/model/<kind>/ and read again here with today's code.

const root = resolve(import.meta.dirname, '..')
const worlds: TrialWorlds = { base: await loadContentFromDir(resolve(root, 'content'), 'base'), isle: await readContentFiles(resolve(root, 'content'), 'isle') }

describe('M10.20: every kind of model call has a row, a situation and a test', () => {
  it('knows every kind the code makes, and nothing it no longer makes', () => {
    const { unlisted, stale } = coverage(root)
    expect(unlisted).toEqual([])
    expect(stale).toEqual([])
    // Two kinds are tried in the app's own code (the advice and the test call); the rest in a situation.
    expect([...SITUATION_KINDS, 'model_advice', 'test_call'].sort()).toEqual(MODEL_KINDS.map((k) => k.kind).sort())
  })

  for (const kind of SITUATION_KINDS) {
    it(`${kind}: the mock answers its situation, and the game takes the answer`, async () => {
      const situation = (await kindSituation(kind, worlds))!
      expect(situation.request.schemaName).toBe(kind)
      expect(situation.request.role).toBe(MODEL_KINDS.find((k) => k.kind === kind)!.role)
      const reply = await new MockLlm('good').complete(situation.request)
      expect(situation.check(reply.text)).toEqual([])
      // An answer out of form is named, never taken.
      expect(situation.check('sorry, I cannot').length).toBeGreaterThan(0)
    }, 60_000)
  }

  it('reads the recorded replies of real models again with today\'s code', async () => {
    const dir = resolve(root, 'tests/fixtures/model')
    const kinds = existsSync(dir) ? readdirSync(dir) : []
    for (const kind of kinds) {
      for (const file of readdirSync(join(dir, kind)).filter((f) => f.endsWith('.json'))) {
        const recorded = JSON.parse(readFileSync(join(dir, kind, file), 'utf8')) as { kind: string; reply: string; problems: string[] }
        expect(recorded.kind).toBe(kind)
        const situation = await kindSituation(kind, worlds)
        if (!situation) continue
        expect(situation.check(recorded.reply), `${kind}/${file}`).toEqual(recorded.problems)
      }
    }
  }, 120_000)

  it('checks the shape of a reply the way the game\'s schemas say', () => {
    const schema = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { type: 'array', items: { type: 'string', enum: ['x', 'y'] } }, b: { anyOf: [{ type: 'number' }, { type: 'null' }] } } }
    expect(schemaProblems(schema, { a: ['x'] })).toEqual([])
    expect(schemaProblems(schema, { a: ['z'], b: 'no', c: 1 })).toEqual(['reply.c is not in the schema', 'reply.a[0] is not one of x, y', 'reply.b matches none of its shapes'])
    expect(schemaProblems(schema, [])).toEqual(['reply is array, not object'])
  })

  it('docs/COVERAGE.md is what npm run coverage writes', () => {
    expect(readFileSync(resolve(root, 'docs/COVERAGE.md'), 'utf8')).toBe(coverageMarkdown(coverage(root).rows))
  })
})
