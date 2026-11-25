import { BOOKS, findBook, type BookInfo } from './books'
import type { Lang } from './types'

/** One contiguous range. endVerse undefined + startVerse undefined = whole chapter(s). */
export interface RefSegment {
  startChapter: number
  startVerse?: number
  endChapter: number
  endVerse?: number
}

export interface ParsedRef {
  book: BookInfo
  segments: RefSegment[]
}

export type ParseResult = { ok: true; ref: ParsedRef } | { ok: false; error: 'empty' | 'book' | 'numbers' }

const SINGLE_CHAPTER = new Set(['Obad', 'Phlm', '2John', '3John', 'Jude'])

const ORDINAL = String.raw`(?:[1-3]|i{1,3}|1st|2nd|3rd|1ro|2do|3ro|1er|3er|primera?o?|segund[ao]|tercer[ao]?|first|second|third)`
const HEAD = new RegExp(String.raw`^\s*(${ORDINAL}?\s*\.?\s*[^\d:;,\-–—]+?)\s*\.?\s*(\d[\d\s:.,;\-–—]*)?\s*$`, 'i')
/** a "San" / "Saint" before the book name, also after a book number (kept as $1) */
const SAINT = new RegExp(String.raw`^(\s*(?:${ORDINAL}\s*\.?\s*)?)(?:san|santo|s\.|saint|st\.?)\s+`, 'i')

/**
 * Parse references such as:
 *  "John 3:16", "Jn 3:16-18", "Juan 3.16", "1 Cor 13", "1 Corintios 13:4-7, 13",
 *  "Psalm 23", "Salmos 23:1-3", "Rom 8:28-9:2", "Genesis 1-2"
 */
export function parseReference(input: string): ParseResult {
  const raw = (input || '').trim()
  if (!raw) return { ok: false, error: 'empty' }
  const m = HEAD.exec(raw)
  if (!m) return { ok: false, error: 'book' }
  // "San Juan 3:16", "S. Mateo 5", "Saint John 3:16", "St. Luke 2", and after a book number
  // "1 San Juan 4:8", "2 San Pedro 1:3" — how many people say it
  const book = findBook(m[1]) ?? findBook(m[1].replace(SAINT, '$1'))
  if (!book) return { ok: false, error: 'book' }
  let nums = (m[2] || '').replace(/[–—]/g, '-').replace(/\s+/g, '')
  if (!nums) {
    return { ok: true, ref: { book, segments: [{ startChapter: 1, endChapter: 1 }] } }
  }
  // One-chapter books (Obadiah, Philemon, 2–3 John, Jude): "Judas 3" means verse 3,
  // not chapter 3. A bare "1" still means the whole book.
  if (SINGLE_CHAPTER.has(book.osis) && !nums.includes(':') && !/[.]/.test(nums) && nums !== '1') {
    nums = nums
      .split(',')
      .map((x, i) => (i === 0 ? `1:${x}` : x))
      .join(',')
  }
  const segments = parseNumbers(nums)
  if (!segments) return { ok: false, error: 'numbers' }
  return { ok: true, ref: { book, segments } }
}

function int(s: string): number | null {
  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return n > 0 ? n : null
}

function parseNumbers(nums: string): RefSegment[] | null {
  // normalize Spanish "3.16" → "3:16" (only when . sits between digits)
  const s = nums.replace(/(\d)\.(\d)/g, '$1:$2').replace(/;/g, ',')
  const segments: RefSegment[] = []
  let currentChapter = null as number | null
  for (const partRaw of s.split(',')) {
    const part = partRaw.trim()
    if (!part) continue
    const [a, b] = part.split('-')
    if (part.split('-').length > 2) return null
    const parsePoint = (p: string): { ch: number | null; v: number | null } | null => {
      if (p.includes(':')) {
        const [c, v] = p.split(':')
        const ci = int(c)
        const vi = int(v)
        if (ci === null || vi === null) return null
        return { ch: ci, v: vi }
      }
      const n = int(p)
      if (n === null) return null
      return { ch: null, v: n }
    }
    const start = parsePoint(a)
    if (!start) return null
    const end = b !== undefined ? parsePoint(b) : null
    if (b !== undefined && !end) return null

    if (start.ch !== null) {
      // "3:16" or "3:16-18" or "3:16-4:2"
      currentChapter = start.ch
      let endChapter: number = start.ch
      let endVerse = start.v!
      if (end) {
        if (end.ch !== null) {
          endChapter = end.ch
          endVerse = end.v!
        } else endVerse = end.v!
      }
      if (endChapter < start.ch || (endChapter === start.ch && endVerse < start.v!)) return null
      segments.push({ startChapter: start.ch, startVerse: start.v!, endChapter, endVerse })
      currentChapter = endChapter
    } else if (currentChapter !== null) {
      // continuation verses after a chapter was given: "3:16, 18-20"
      let endVerse = start.v!
      let endChapter: number = currentChapter
      if (end) {
        if (end.ch !== null) {
          endChapter = end.ch
          endVerse = end.v!
        } else endVerse = end.v!
      }
      if (endChapter === currentChapter && endVerse < start.v!) return null
      segments.push({ startChapter: currentChapter, startVerse: start.v!, endChapter, endVerse })
      currentChapter = endChapter
    } else {
      // whole chapters: "23" or "1-2"
      const endChapter: number = end ? (end.ch ?? end.v!) : start.v!
      if (endChapter < start.v!) return null
      segments.push({ startChapter: start.v!, endChapter })
    }
  }
  return segments.length ? segments : null
}

/** Human readable reference in the given language: "Juan 3:16-18, 20" */
export function formatReference(ref: ParsedRef, lang: Lang): string {
  const name = ref.book[lang]
  const parts: string[] = []
  let lastChapter: number | null = null
  for (const seg of ref.segments) {
    if (seg.startVerse === undefined) {
      parts.push(seg.startChapter === seg.endChapter ? `${seg.startChapter}` : `${seg.startChapter}-${seg.endChapter}`)
      lastChapter = null
      continue
    }
    const startTxt = lastChapter === seg.startChapter ? `${seg.startVerse}` : `${seg.startChapter}:${seg.startVerse}`
    let txt = startTxt
    if (seg.endChapter !== seg.startChapter) txt += `-${seg.endChapter}:${seg.endVerse}`
    else if (seg.endVerse !== seg.startVerse) txt += `-${seg.endVerse}`
    parts.push(txt)
    lastChapter = seg.endChapter
  }
  return `${name} ${parts.join(', ')}`
}

/** Book list for autocomplete */
export function bookSuggestions(prefix: string, lang: Lang, limit = 8): string[] {
  const p = prefix.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!p) return []
  const out: string[] = []
  for (const b of BOOKS) {
    const name = b[lang]
    const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (n.startsWith(p) || n.replace(/^\d\s/, '').startsWith(p)) out.push(name)
    if (out.length >= limit) break
  }
  return out
}
