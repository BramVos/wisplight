import { describe, expect, it } from 'vitest'
import { parseReply, replyJsonSchema } from '../src/engine/dialogue/schema'
import { systemParts } from '../src/engine/dialogue/prompt'
import { Engine } from '../src/engine'
import { content } from './helpers'

// M10.27 (5): a line of a talk costs less. The rules and the schema of
// npc_reply were 5,016 characters on every line; the act the model sent back
// (27 values) is the engine's own, and several rules said the same twice. The
// rules are all still there, in fewer words.

describe('M10.27: a talk line, shorter', () => {
  it('asks no act of the model, and still reads an older reply that has one', () => {
    const schema = replyJsonSchema(['loc_molenend_mill'])
    expect(schema['required']).not.toContain('act')
    expect(Object.keys(schema['properties'] as object)).not.toContain('act')
    const reply = { reply: '"Morning."', names: [], mentioned_topics: [], effects: [], memory_note: 'A stranger came by.', ends_conversation: false, keep_talking: 'no' }
    expect(parseReply(JSON.stringify(reply))?.reply).toBe('"Morning."')
    expect(parseReply(JSON.stringify({ ...reply, act: 'Greet' }))?.act).toBe('Greet')
  })

  it('keeps every rule, in at least a fifth fewer characters with the schema', () => {
    const engine = new Engine(content, { seed: 1 })
    const { shared } = systemParts(engine.world, 'npc_mirte')
    const rules = shared.slice(shared.indexOf('Rules:'), shared.indexOf('[[WORLD TEXT]]'))
    for (const rule of ['never mention an AI', 'WORD LIMIT', 'double quotes', 'KNOWLEDGE, SCENE and the character card', 'REFERRAL', 'No news of your own making', 'Numbers, ages, prices, dates and distances', '"a few" or "some"', 'Never invent places, people, items, prices or quests', 'PEOPLE YOU KNOW', 'new_kind', 'SOMEONE NEW', 'Never agree to come along', 'DECISION', 'PLAYER SAYS', 'Dutch', 'ATTITUDE', 'No, not today', 'YOUR PEOPLE', 'LISTENER', 'PRIVATE', 'CHECK', 'effects', 'mentioned_topics', 'JSON']) expect(rules, rule).toContain(rule)
    const schema = JSON.stringify(replyJsonSchema(['loc_molenend_mill', 'npc_harmen', 'npc_mirte'], [], [{ key: 'lead:loc_molenend_mill', decision: 'no' }], true))
    expect(rules.length + schema.length).toBeLessThanOrEqual(Math.floor(5016 * 0.8))
  })
})
