import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import en from '../src/renderer/i18n/en.json'
import es from '../src/renderer/i18n/es.json'

type Tree = { [k: string]: string | Tree }

function flatten(obj: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.set(key, v)
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv)
  }
  return out
}

const EN = flatten(en as Tree)
const ES = flatten(es as Tree)

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|ts)$/.test(f)) out.push(p)
  }
  return out
}

describe('translations', () => {
  it('English and Spanish have exactly the same keys', () => {
    const missingEs = [...EN.keys()].filter((k) => !ES.has(k))
    const missingEn = [...ES.keys()].filter((k) => !EN.has(k))
    expect(missingEs).toEqual([])
    expect(missingEn).toEqual([])
  })

  it('no empty strings', () => {
    expect([...EN].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([])
    expect([...ES].filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([])
  })

  it('interpolation variables match between languages', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(',')
    const bad = [...EN.keys()].filter((k) => vars(EN.get(k)!) !== vars(ES.get(k) || ''))
    expect(bad).toEqual([])
  })

  it('every static key used in the source exists', () => {
    const src = walk(join(__dirname, '..', 'src'))
    const used = new Set<string>()
    for (const f of src) {
      const code = readFileSync(f, 'utf8')
      for (const m of code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) used.add(m[1])
      for (const m of code.matchAll(/'(warn\.[a-zA-Z]+)'/g)) used.add(m[1])
    }
    const missing = [...used].filter((k) => !EN.has(k))
    expect(missing).toEqual([])
  })

  it('dynamic key families are complete', () => {
    const families: Record<string, string[]> = {
      nav: ['live', 'plans', 'songs', 'bible', 'media', 'themes', 'people', 'reports', 'settings'],
      types: ['song', 'scripture', 'announcement', 'media', 'presentation', 'countdown', 'notes', 'header', 'blank', 'prayer'],
      sectionTypes: ['verse', 'chorus', 'pre', 'bridge', 'tag', 'intro', 'ending', 'other'],
      'bible.err': ['empty', 'book', 'numbers', 'notfound', 'missing', 'version'],
      'bible.src': ['builtin', 'imported', 'pasted'],
      'media.method': ['powerpoint', 'libreoffice', 'pdf', 'text', 'images'],
      help: ['next', 'prev', 'nextItem', 'prevItem', 'black', 'clearText', 'logo', 'clearAll', 'video', 'en', 'es', 'both', 'help'],
      stageQuick: ['wrap', 'slow', 'repeat', 'louder'],
      themes: ['bold', 'shadow', 'outline', 'uppercase']
    }
    const missing: string[] = []
    for (const [fam, keys] of Object.entries(families)) for (const k of keys) if (!EN.has(`${fam}.${k}`)) missing.push(`${fam}.${k}`)
    expect(missing).toEqual([])
  })
})
