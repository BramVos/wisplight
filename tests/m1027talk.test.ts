import { describe, expect, it } from 'vitest'
import { parseReply, TALK_REPLY_SCHEMA } from '../src/engine/dialogue/schema'
import { CLAIM_KEYS } from '../src/engine/claims'
import { systemParts } from '../src/engine/dialogue/prompt'
import { Engine } from '../src/engine'
import { content } from './helpers'

// M10.27 (5): a line of a talk costs less. The rules and the schema of
// npc_reply were 5,016 characters on every line; the act the model sent back
// (27 values) is the engine's own, and several rules said the same twice. The
// rules are all still there, in fewer words.

describe('M10.27: a talk line, shorter', () => {
  it('asks no act of the model, and still reads an older reply that has one', () => {
    const schema = TALK_REPLY_SCHEMA
    expect(schema['required']).not.toContain('act')
    expect(Object.keys(schema['properties'] as object)).not.toContain('act')
    const reply = { reply: '"Morning."', names: [], mentioned_topics: [], effects: [], memory_note: 'A stranger came by.', ends_conversation: false, keep_talking: 'no' }
    expect(parseReply(JSON.stringify(reply))?.reply).toBe('"Morning."')
    expect(parseReply(JSON.stringify({ ...reply, act: 'Greet' }))?.act).toBe('Greet')
  })

  // A rule the schema says as well is kept there (M10.35 B: mentioned_topics, to make room for guessing).
  it('keeps every rule, in at least a fifth fewer characters with the schema', () => {
    const engine = new Engine(content, { seed: 1 })
    const { shared } = systemParts(engine.world, 'npc_mirte')
    const rules = shared.slice(shared.indexOf('Rules:'), shared.indexOf('[[WORLD TEXT]]'))
    const schema = JSON.stringify(TALK_REPLY_SCHEMA)
    for (const rule of ['never mention an AI', 'WORD LIMIT', 'double quotes', 'KNOWLEDGE, SCENE and your own card', 'YOU ARE', 'what is new', 'REFERRAL', 'of your own making: only what KNOWLEDGE gives', 'Numbers, ages, prices, dates and distances', '"a few" or "some"', 'Never invent places, people, items, prices or quests', 'PEOPLE YOU KNOW', 'new_kind', 'SOMEONE NEW', 'Never agree to come along', 'DECISION', 'PLAYER SAYS', 'Dutch', 'ATTITUDE', 'No, not today', 'YOUR PEOPLE', 'LISTENER', 'PRIVATE', 'CHECK', 'effects', 'mentioned_topics', 'JSON', "people's motives", 'who lets one in']) expect(`${rules}\n${schema}`, rule).toContain(rule)
    // A fifth fewer in M10.27. Since M10.28 the rules and the schema are read from the cache on every line but the first,
    // and the schema holds every field on every line (one schema, so the cache holds): still under the 5,016 of before.
    expect(rules.length + schema.length).toBeLessThanOrEqual(5016)
    const claim = (TALK_REPLY_SCHEMA['properties'] as Record<string, { properties: Record<string, { enum?: string[] }> }>)['claim']!
    expect(new Set(claim.properties['key']!.enum)).toEqual(new Set(['none', ...CLAIM_KEYS]))
  })
})
