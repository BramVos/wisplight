import { describe, expect, it } from 'vitest'
import { enhanceRequest, MockLlm, readEnhance, WORLD_STEPS } from '../src/engine'
import { readContentFiles } from '../src/node/content'
import { resolve } from 'node:path'

// Enhance with AI (after M10.17; Bram, 28 September 2026): per step of
// building a world, the chronicler writes the designer's short answer out as a
// fuller brief, before anything is proposed.

const files = await readContentFiles(resolve(import.meta.dirname, '../content'), 'isle')

describe('enhance with AI', () => {
  it('asks the chronicler to keep the designer\'s choices, suggest for what is open, and write no content', () => {
    const request = enhanceRequest(files, 'calendar', 'Ten days a week, named after the tides.')
    expect(request.role).toBe('chronicler')
    expect(request.schemaName).toBe('world_enhance')
    expect(request.system).toMatch(/Keep every choice the designer made/)
    expect(request.system).toMatch(/marked "\(suggestion\)"/)
    expect(request.system).toMatch(/no YAML/)
    expect(request.system).toContain(WORLD_STEPS.find((s) => s.id === 'calendar')!.ask[0]!)
    expect(request.prompt).toMatch(/THE DESIGNER WROTE: Ten days a week, named after the tides\./)
    expect(request.prompt).toMatch(/WORLD\.YAML NOW:\n# Skerrow/)
  })

  it('gives back a brief with the designer\'s words first, and what only they can decide', async () => {
    const reply = await new MockLlm().complete(enhanceRequest(files, 'money', 'Gold, silver and copper.'))
    const enhanced = readEnhance(reply.text)
    expect(enhanced.problems).toEqual([])
    expect(enhanced.brief.split('\n')[0]).toBe('Gold, silver and copper.')
    expect(enhanced.brief).toMatch(/\(suggestion: /)
    expect(enhanced.open).toHaveLength(1)
  })

  it('says so when the reply is out of form, and never crashes', async () => {
    const reply = await new MockLlm('invalid').complete(enhanceRequest(files, 'frame', 'A sea world.'))
    expect(readEnhance(reply.text)).toEqual({ brief: '', open: [], problems: ['The chronicler did not answer in the agreed form.'] })
    expect(readEnhance('{"brief": "", "open": []}').problems).toEqual(['The chronicler gave no brief back.'])
  })
})
