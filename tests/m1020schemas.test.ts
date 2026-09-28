import { resolve } from 'node:path'
import { stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { draftResult, ENTITY_KINDS, LISTS, type EntityKind } from '../src/engine'
import { FileSchema } from '../src/engine/content'
import { readContentFiles } from '../src/node/content'

// M10.20: schema and load check never drift apart again (Bram, 28 September
// 2026: why do so many errors come out of building a world when it was
// tested? Because every test used the mock model, and the test world was
// written by hand). Random entities that the zod schemas allow are put into a
// world one at a time: each loads, or the check says precisely why, naming
// the entity; it never throws.

type Schema = z.ZodType
type Def = { type: string; innerType?: Schema; element?: Schema; shape?: Record<string, Schema>; entries?: Record<string, string>; options?: Schema[]; getter?: () => Schema; valueType?: Schema; keyType?: Schema; values?: unknown[]; in?: Schema; items?: Schema[]; checks?: { _zod: { def: { check: string; value?: unknown; inclusive?: boolean; format?: string; pattern?: RegExp; minimum?: number; maximum?: number } } }[] }
const def = (s: Schema): Def => (s as unknown as { _zod: { def: Def } })._zod.def

/** A small seeded random source, so a failure can be played again. */
function random(seed: number) {
  let x = seed >>> 0 || 1
  return () => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) / 4294967296
  }
}

const WORDS = ['quay', 'lantern', 'grey', 'Salt Road', 'the old ferry', 'Tuesday', 'seven', '07-12']
const SKIP = Symbol('skip')

/** A value the schema allows, or SKIP for a field left out. Ids and names from the entity's own. */
function sample(s: Schema, rnd: () => number, n: number, depth: number, field = ''): unknown {
  if (depth > 9) throw new Error('too deep')
  const d = def(s)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!
  switch (d.type) {
    case 'optional':
      return rnd() < 0.5 ? SKIP : sample(d.innerType!, rnd, n, depth, field)
    case 'default':
    case 'prefault':
      return rnd() < 0.5 ? SKIP : sample(d.innerType!, rnd, n, depth, field)
    case 'nullable':
      return sample(d.innerType!, rnd, n, depth, field)
    case 'lazy':
      return sample(d.getter!(), rnd, n, depth + 1, field)
    case 'pipe':
      return sample(d.in!, rnd, n, depth, field)
    case 'string': {
      const checks = (d.checks ?? []).map((c) => c._zod.def)
      const pattern = checks.find((c) => c.check === 'string_format' && c.format === 'regex')?.pattern
      const candidates = [`fuzz_${n}`, `loc_fuzz_${n}`, `npc_fuzz_${n}`, '07-12', '07:00-12:30', '12:00', 'a', 'x_1', '1d', '1d6', '2d4', '#336699', '09:00', ...WORDS]
      const fitting = pattern ? candidates.filter((c) => pattern.test(c)) : field === 'id' ? [`fuzz_${n}`] : WORDS
      if (!fitting.length) throw new Error(`no text for ${String(pattern)}`)
      return pick(fitting)
    }
    case 'number':
    case 'int': {
      const checks = (d.checks ?? []).map((c) => c._zod.def)
      const low = Number(checks.find((c) => c.check === 'greater_than')?.value ?? 0)
      const high = Number(checks.find((c) => c.check === 'less_than')?.value ?? Math.max(low + 10, 10))
      const whole = d.type === 'int' || checks.some((c) => c.check === 'number_format' && /int/.test(c.format ?? ''))
      const value = low + rnd() * (high - low)
      return whole ? Math.min(high, Math.max(low, Math.round(value))) : Math.round(value * 100) / 100
    }
    case 'boolean':
      return rnd() < 0.5
    case 'enum':
      return pick(Object.values(d.entries ?? {}))
    case 'literal':
      return d.values?.[0]
    case 'array': {
      const min = Number((d.checks ?? []).map((c) => c._zod.def).find((c) => c.check === 'min_length')?.minimum ?? 0)
      const count = Math.max(min, depth > 4 ? 0 : Math.floor(rnd() * 3))
      return Array.from({ length: count }, () => sample(d.element!, rnd, n, depth + 1)).filter((v) => v !== SKIP)
    }
    case 'tuple':
      return (d.items ?? []).map((i) => sample(i, rnd, n, depth + 1))
    case 'record': {
      const key = d.keyType ? def(d.keyType) : undefined
      const name = key?.type === 'enum' ? pick(Object.values(key.entries ?? {})) : 'fuzz'
      const value = sample(d.valueType!, rnd, n, depth + 1)
      return value === SKIP ? {} : { [name]: value }
    }
    case 'union':
      return sample(pick(depth > 5 ? (d.options ?? []).slice(0, 1) : (d.options ?? [])), rnd, n, depth + 1, field)
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [name, f] of Object.entries(d.shape ?? {})) {
        const value = sample(f, rnd, n, depth + 1, name)
        if (value !== SKIP) out[name] = value
      }
      return out
    }
    default:
      return 'x'
  }
}

/** The schema of one entity of a kind, from the file schema. */
function entitySchema(kind: EntityKind): Schema | undefined {
  const list = LISTS[kind]
  if (list.includes('.')) return undefined
  let s = (FileSchema as unknown as { shape: Record<string, Schema> }).shape[list]
  for (let i = 0; s && i < 6 && def(s).type !== 'array'; i++) s = def(s).innerType ?? (def(s).type === 'lazy' ? def(s).getter!() : undefined)
  return s ? def(s).element : undefined
}

describe('M10.20: what the schema allows, loads, or the check says why', () => {
  it('puts random valid entities of every kind into Deepwell and Skerrow', async () => {
    const worlds = [await readContentFiles(resolve(import.meta.dirname, 'worlds'), 'other'), await readContentFiles(resolve(import.meta.dirname, '../content'), 'isle')]
    const tried: Record<string, { loaded: number; refused: number; unsampled: number }> = {}
    const vague: string[] = []
    for (const kind of ENTITY_KINDS) {
      const schema = entitySchema(kind)
      if (!schema) continue
      const count = (tried[kind] = { loaded: 0, refused: 0, unsampled: 0 })
      for (let n = 1; n <= 10; n++) {
        const rnd = random(n * 7919 + kind.length)
        let raw: unknown
        try {
          raw = sample(schema, rnd, n, 0)
        } catch {
          count.unsampled += 1
          continue
        }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) {
          count.unsampled += 1
          continue
        }
        const id = (raw as { id?: unknown }).id
        if (typeof id !== 'string') {
          count.unsampled += 1
          continue
        }
        // Mostly the small test world; every fifth in Skerrow, which has rules, a region and a voice kit.
        const files = worlds[n % 5 === 0 ? 1 : 0]!
        let result: ReturnType<typeof draftResult>
        try {
          result = draftResult(files, { changes: [{ kind, id, yaml: stringify(raw) }], files: [] })
        } catch (error) {
          throw new Error(`${kind} ${id} throws: ${String(error)}\n${stringify(raw)}`)
        }
        if (result.ok) {
          count.loaded += 1
          continue
        }
        count.refused += 1
        // Precise: every problem names the entity, or the file and place it went to.
        for (const problem of result.problems) {
          if (/TypeError|ReferenceError|Cannot read|undefined is not|is not a function/.test(problem)) throw new Error(`${kind} ${id}: the check broke: ${problem}\n${stringify(raw)}`)
          if (!problem.includes(id) && !/\.ya?ml/.test(problem)) vague.push(`${kind} ${id}: ${problem}`)
        }
      }
    }
    expect(vague).toEqual([])
    // Every kind with its own list was tried, and most samples could be made.
    const kinds = Object.keys(tried)
    expect(kinds.length).toBeGreaterThan(25)
    for (const [kind, c] of Object.entries(tried)) expect(c.loaded + c.refused, kind).toBeGreaterThan(0)
  }, 120000)
})
