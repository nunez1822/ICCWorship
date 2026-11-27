import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  importBibleText,
  infoFull,
  infoPartial,
  parsePastedPassage,
  passageFromFull,
  passageFromPartial,
  searchFull,
  verseKey,
  versificationFrom,
  type FullBible,
  type PartialBible,
  type Versification
} from '@shared/bibleCore'
import type { BibleVersionInfo, Lang, PassageResult, Verse } from '@shared/types'
import { bibleDataDir, dataRoot, resourcesDir } from './paths'
import { isSafeId, versionIdFrom } from '@shared/security'
import { within } from './pathGuard'
import { log } from './log'
import { writeFileAtomic } from './atomicWrite'
import { assertWritable, db } from './db'

const BUILTIN = ['kjv', 'rv1909']
const full = new Map<string, FullBible>()
const fullSource = new Map<string, BibleVersionInfo['source']>()
const partial = new Map<string, PartialBible>()
let loaded = false

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) as T
}

function loadAll(): void {
  if (loaded) return
  loaded = true
  // one damaged file (cut short by antivirus, a disk error) must not hide the others for the whole session
  for (const id of BUILTIN) {
    const p = join(resourcesDir(), 'bibles', `${id}.json`)
    if (!existsSync(p)) continue
    try {
      full.set(id, loadJson<FullBible>(p))
      fullSource.set(id, 'builtin')
    } catch (e) {
      log.warn('unreadable built-in bible skipped:', id, e instanceof Error ? e.name : 'error')
    }
  }
  // listed only if it exists: creating it here fails on a write-protected stick (portable, read-only)
  const dir = join(dataRoot(), 'data', 'bibles')
  let files: string[] = []
  try {
    files = existsSync(dir) ? readdirSync(dir) : []
  } catch (e) {
    log.warn('bibles folder could not be listed:', (e as NodeJS.ErrnoException).code || 'error')
  }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const data = loadJson<FullBible | PartialBible>(join(dir, f))
      if ('books' in data) {
        full.set(data.id, data)
        fullSource.set(data.id, 'imported')
      } else if ('verses' in data) partial.set(data.id, data)
    } catch (e) {
      // the error's own message can quote the file's text: log only its kind
      log.warn('unreadable bible file skipped:', f, e instanceof Error ? e.name : 'error')
    }
  }
}

function vers(): Versification {
  loadAll()
  const kjv = full.get('kjv') || [...full.values()][0]
  return kjv ? versificationFrom(kjv.books) : () => 0
}

export function versions(): BibleVersionInfo[] {
  loadAll()
  return [...[...full.values()].map((b) => infoFull(b, fullSource.get(b.id) || 'imported')), ...[...partial.values()].map(infoPartial)]
}

export function passage(id: string, ref: string): PassageResult {
  loadAll()
  const f = full.get(id)
  if (f) return passageFromFull(f, ref)
  const p = partial.get(id)
  if (p) return passageFromPartial(p, ref, vers())
  return { ok: false, reference: ref, verses: [], missing: [], error: 'version' }
}

export function search(id: string, q: string): Verse[] {
  loadAll()
  const f = full.get(id)
  if (f) return searchFull(f, q)
  const p = partial.get(id)
  if (!p) return []
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const words = norm(q).split(/\s+/).filter(Boolean)
  return Object.entries(p.verses)
    .filter(([, t]) => words.every((w) => norm(t).includes(w)))
    .slice(0, 60)
    .map(([k, text]) => {
      const [book, chapter, verse] = k.split(':').map(Number)
      return { book, chapter, verse, text }
    })
}

/** data/bibles/<id>.json — refuses ids that would point anywhere else */
function bibleFile(id: string): string {
  const dir = bibleDataDir()
  const p = join(dir, `${id}.json`)
  if (!within(dir, p)) throw new Error('bad-id')
  return p
}

function savePartial(b: PartialBible): void {
  assertWritable()
  writeFileAtomic(bibleFile(b.id), JSON.stringify(b, null, 1))
  db().noteExternalWrite() // pasted verses are data too: the hourly backup must pick them up
}

export function createPasted(meta: { id?: string; name: string; abbrev: string; lang: Lang; copyright?: string; verseLimit?: number }): BibleVersionInfo {
  loadAll()
  const id = meta.id || versionIdFrom(meta.abbrev)
  if (!isSafeId(id)) throw new Error('bad-id') // e.g. an abbreviation made only of symbols
  const existing = partial.get(id)
  const b: PartialBible = {
    id,
    name: meta.name,
    abbrev: meta.abbrev,
    lang: meta.lang,
    copyright: meta.copyright,
    verseLimit: meta.verseLimit,
    verses: existing?.verses || {}
  }
  partial.set(id, b)
  savePartial(b)
  return infoPartial(b)
}

export function parsePaste(ref: string, text: string) {
  return parsePastedPassage(ref, text, vers())
}

export function savePastedVerses(id: string, verses: Verse[]): { ok: boolean; info?: BibleVersionInfo; overLimit?: boolean } {
  loadAll()
  const b = partial.get(id)
  if (!b) return { ok: false }
  for (const v of verses) {
    if (v.text?.trim()) b.verses[verseKey(v.book, v.chapter, v.verse)] = v.text.trim()
  }
  savePartial(b)
  const info = infoPartial(b)
  return { ok: true, info, overLimit: !!b.verseLimit && (info.verseCount || 0) > b.verseLimit }
}

export function deletePastedVerse(id: string, book: number, chapter: number, verse: number): void {
  const b = partial.get(id)
  if (!b) return
  delete b.verses[verseKey(book, chapter, verse)]
  savePartial(b)
}

export function listPastedVerses(id: string): Verse[] {
  loadAll()
  const b = partial.get(id)
  if (!b) return []
  return Object.entries(b.verses)
    .map(([k, text]) => {
      const [book, chapter, verse] = k.split(':').map(Number)
      return { book, chapter, verse, text }
    })
    .sort((a, z) => a.book - z.book || a.chapter - z.chapter || a.verse - z.verse)
}

export function importFile(path: string, meta: { name: string; abbrev: string; lang: Lang; copyright?: string }): BibleVersionInfo {
  loadAll()
  const id = versionIdFrom(meta.abbrev)
  if (!isSafeId(id)) throw new Error('bad-id') // e.g. an abbreviation made only of symbols
  if (BUILTIN.includes(id)) throw new Error('id-taken')
  const bible = importBibleText(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''), { id, ...meta })
  const verses = bible.books.reduce((a, b) => a + b.reduce((x, c) => x + c.filter(Boolean).length, 0), 0)
  // text was found, but too little to be a Bible (a passage, a test file): say so, not "no text"
  if (verses < 10) throw new Error(verses ? 'too-few' : 'empty')
  assertWritable()
  writeFileAtomic(bibleFile(id), JSON.stringify(bible))
  db().noteExternalWrite()
  full.set(id, bible)
  fullSource.set(id, 'imported')
  // a full licensed copy replaces a pasted one with the same id
  if (partial.has(id)) partial.delete(id)
  return infoFull(bible, 'imported')
}

export function deleteVersion(id: string): void {
  if (BUILTIN.includes(id)) return
  assertWritable()
  const dir = bibleDataDir()
  const p = join(dir, `${id}.json`)
  if (within(dir, p) && existsSync(p)) {
    unlinkSync(p)
    db().noteExternalWrite()
  }
  full.delete(id)
  partial.delete(id)
}

/** chapters per book & verses per chapter for the reference picker */
export function structure(): number[][] {
  loadAll()
  const kjv = full.get('kjv')
  return kjv ? kjv.books.map((b) => b.map((c) => c.length)) : []
}

export function reload(): void {
  loaded = false
  full.clear()
  partial.clear()
  fullSource.clear()
}
