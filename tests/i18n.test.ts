import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The words of the interface live outside the code (M9.4, FO chapter 18): in
// src/renderer/src/locales/<language>/<part>.json. This checks that every key
// the interface asks for has English words, and that the parts of the game's
// interface hold no English of their own. The editor and the dev menu are
// tools for building and are left out; the texts of the game itself come from
// the content and the engine.

const RENDERER = resolve(import.meta.dirname, '../src/renderer/src')
const PARTS = ['App.tsx', 'Settings.tsx', 'ConversationView.tsx', 'JournalView.tsx', 'CharacterCreation.tsx', 'EndView.tsx', 'FightPanel.tsx', 'SheetView.tsx', 'WorldPicker.tsx', 'LogExport.tsx', 'display.ts']

type Words = { [key: string]: string | Words }

function english(): Record<string, Words> {
  const dir = join(RENDERER, 'locales', 'en')
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8')) as Words]))
}

function has(words: Record<string, Words>, key: string): boolean {
  const [part, ...path] = key.split('.')
  let node: string | Words | undefined = words[part ?? '']
  for (const step of path) node = typeof node === 'object' ? node[step] : undefined
  return typeof node === 'string'
}

describe('M9.4: the words of the interface are outside the code', () => {
  it('has English words for every key the interface asks for', () => {
    const words = english()
    const missing: string[] = []
    for (const file of readdirSync(RENDERER).filter((f) => /\.tsx?$/.test(f))) {
      const code = readFileSync(join(RENDERER, file), 'utf8')
      for (const [, fn, key] of code.matchAll(/\b(tn?)\(\s*'([a-z][\w.]*)'/g)) {
        const keys = fn === 'tn' ? [`${key}.one`, `${key}.other`] : [key!]
        for (const k of keys) if (!has(words, k)) missing.push(`${file}: ${k}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('leaves no English in the parts of the interface', () => {
    const found: string[] = []
    for (const file of PARTS) {
      const code = readFileSync(join(RENDERER, file), 'utf8')
      // Comments may be English: they are for whoever reads the code.
      const lines = code.split('\n').map((line) => line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\{\/\*.*?\*\/\}/g, ''))
      lines.forEach((line, i) => {
        const at = `${file}:${i + 1}`
        // Text between tags.
        for (const [, text] of line.matchAll(/>([^<>{}]*)</g)) if (/[A-Za-z]{2,}/.test(text!)) found.push(`${at} text "${text!.trim()}"`)
        // Text an element shows or reads out.
        for (const [, attr, text] of line.matchAll(/\b(title|aria-label|placeholder|alt)="([^"]*)"/g)) if (/[A-Za-z]{2,}/.test(text!)) found.push(`${at} ${attr} "${text}"`)
        // A sentence in quotes: a capital, a word, a space and another word.
        for (const [text] of line.matchAll(/(['"`])[A-Z][a-z]+ [a-z]+[^'"`]*\1/g)) found.push(`${at} ${text}`)
      })
    }
    expect(found).toEqual([])
  })
})
