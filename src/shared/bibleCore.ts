/**
 * Bible logic that does not touch the file system, so it can be unit tested.
 */
import { BOOKS } from './books'
import { formatReference, parseReference, type ParsedRef } from './scriptureRef'
import type { BibleVersionInfo, Lang, PassageResult, Verse } from './types'

/** books[book-1][chapter-1][verse-1] */
export type BookArray = string[][][]

export interface FullBible {
  id: string
  name: string
  abbrev: string
  lang: Lang
  copyright?: string
  books: BookArray
}

/** Pasted / partial versions store individual verses keyed "book:chapter:verse" */
export interface PartialBible {
  id: string
  name: string
  abbrev: string
  lang: Lang
  copyright?: string
  verseLimit?: number
  verses: Record<string, string>
}

export const verseKey = (b: number, c: number, v: number): string => `${b}:${c}:${v}`

/** Versification source: (book, chapter) → number of verses. Usually the KJV. */
export type Versification = (book: number, chapter: number) => number

export function versificationFrom(books: BookArray): Versification {
  return (b, c) => books[b - 1]?.[c - 1]?.length ?? 0
}

export function chapterCount(books: BookArray, b: number): number {
  return books[b - 1]?.length ?? 0
}

/** Expand a parsed reference into the list of verse coordinates it covers */
export function expandRef(ref: ParsedRef, vers: Versification): { book: number; chapter: number; verse: number }[] {
  const out: { book: number; chapter: number; verse: number }[] = []
  const b = ref.book.num
  for (const seg of ref.segments) {
    for (let c = seg.startChapter; c <= seg.endChapter; c++) {
      const count = vers(b, c)
      if (!count) continue
      const from = seg.startVerse !== undefined && c === seg.startChapter ? seg.startVerse : 1
      const to = seg.endVerse !== undefined && c === seg.endChapter ? Math.min(seg.endVerse, count) : count
      for (let v = from; v <= to; v++) out.push({ book: b, chapter: c, verse: v })
    }
  }
  return out
}

export function passageFromFull(bible: FullBible, refText: string): PassageResult {
  const parsed = parseReference(refText)
  if (!parsed.ok) return { ok: false, reference: refText, verses: [], missing: [], error: parsed.error }
  const coords = expandRef(parsed.ref, versificationFrom(bible.books))
  const verses: Verse[] = []
  const missing: PassageResult['missing'] = []
  for (const c of coords) {
    const t = bible.books[c.book - 1]?.[c.chapter - 1]?.[c.verse - 1]
    if (t) verses.push({ ...c, text: t })
    else missing.push(c)
  }
  return {
    ok: verses.length > 0,
    reference: formatReference(parsed.ref, bible.lang),
    verses,
    missing,
    error: verses.length ? undefined : 'notfound',
    copyright: bible.copyright,
    abbrev: bible.abbrev
  }
}

export function passageFromPartial(bible: PartialBible, refText: string, vers: Versification): PassageResult {
  const parsed = parseReference(refText)
  if (!parsed.ok) return { ok: false, reference: refText, verses: [], missing: [], error: parsed.error }
  const coords = expandRef(parsed.ref, vers)
  const verses: Verse[] = []
  const missing: PassageResult['missing'] = []
  for (const c of coords) {
    const t = bible.verses[verseKey(c.book, c.chapter, c.verse)]
    if (t) verses.push({ ...c, text: t })
    else missing.push(c)
  }
  return {
    ok: verses.length > 0,
    reference: formatReference(parsed.ref, bible.lang),
    verses,
    missing,
    error: verses.length ? undefined : 'missing',
    copyright: bible.copyright,
    abbrev: bible.abbrev
  }
}

/** Remove footnote / cross-reference markers that sites add when copying: [a], (A), †, * */
export function cleanPasted(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/\[[a-zA-Z]{1,3}\]/g, '')
    .replace(/\([A-Z]{1,3}\)/g, '')
    .replace(/[†‡*]/g, '')
    .replace(/[ \t]+/g, ' ')
}

export interface PasteParseResult {
  ok: boolean
  verses: Verse[]
  /** numbers we expected but could not find in the text */
  notFound: number[]
  reference: string
  error?: string
}

/**
 * Split text pasted from a Bible website into verses.
 * The reference tells us which verse numbers to expect, e.g. "Juan 3:16-18" → 16, 17, 18.
 * We look for each expected number, in order, as a standalone token.
 * Text before the first number (a heading such as "Juan 3:16-18 LBLA") is discarded
 * when the first number is found; otherwise all text belongs to the first verse.
 */
export function parsePastedPassage(refText: string, pasted: string, vers: Versification): PasteParseResult {
  const parsed = parseReference(refText)
  if (!parsed.ok) return { ok: false, verses: [], notFound: [], reference: refText, error: parsed.error }
  const coords = expandRef(parsed.ref, vers)
  if (!coords.length) return { ok: false, verses: [], notFound: [], reference: refText, error: 'notfound' }

  let text = cleanPasted(pasted)
  // drop version-name lines, then a leading reference heading such as "Juan 3:16-18"
  text = text
    .split('\n')
    .filter((l) => {
      const ll = l.trim()
      if (!ll) return false
      if (
        ll.length < 60 &&
        /^(la biblia de las am[eé]ricas|lbla|nueva biblia de las am[eé]ricas|nbla|reina[- ]valera|nueva versi[oó]n internacional|nvi|new international version|king james)/i.test(
          ll
        )
      )
        return false
      return true
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  text = text
    .replace(/^[^\d]{0,40}?\d+\s*[:.]\s*\d+(?:\s*[-–]\s*\d+(?:\s*[:.]\s*\d+)?)?\s*(\((?:LBLA|NBLA|NVI|RVR1960|RVR60|NIV|KJV)\))?\s*/i, '')
    .replace(/^(LBLA|NBLA|NVI|RVR1960)\s+/i, '')
    .trim()

  // markers: when a passage spans chapters, a new chapter often starts with the chapter number
  const positions: { idx: number; len: number }[] = []
  let cursor = 0
  const notFound: number[] = []
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i]
    const isChapterStart = c.verse === 1 && i > 0
    const candidates = isChapterStart ? [String(c.verse), String(c.chapter)] : [String(c.verse)]
    let found: { idx: number; len: number } | null = null
    for (const num of candidates) {
      const re = new RegExp(`(^|[\\s"“'(¿¡])(${num})(?=\\s*[^\\d\\s:.,\\-–])`, 'g')
      re.lastIndex = cursor
      const m = re.exec(text)
      if (m) {
        const idx = m.index + m[1].length
        if (!found || idx < found.idx) found = { idx, len: m[2].length }
      }
    }
    if (found) {
      positions.push(found)
      cursor = found.idx + found.len
    } else {
      notFound.push(c.verse)
      positions.push({ idx: -1, len: 0 })
    }
  }

  const verses: Verse[] = []
  // single verse with no number in the text: take it all
  if (coords.length === 1 && positions[0].idx < 0) {
    verses.push({ ...coords[0], text })
    return { ok: !!text, verses, notFound: [], reference: formatReference(parsed.ref, 'es') }
  }
  for (let i = 0; i < coords.length; i++) {
    const p = positions[i]
    if (p.idx < 0) continue
    let end = text.length
    for (let j = i + 1; j < positions.length; j++) {
      if (positions[j].idx >= 0) {
        end = positions[j].idx
        break
      }
    }
    const t = text.slice(p.idx + p.len, end).trim()
    if (t) verses.push({ ...coords[i], text: t })
  }
  return {
    ok: verses.length > 0 && notFound.length === 0,
    verses,
    notFound,
    reference: formatReference(parsed.ref, 'es')
  }
}

/** Accent/case-insensitive text search over a full bible */
export function searchFull(bible: FullBible, query: string, limit = 60): Verse[] {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const q = norm(query.trim())
  if (q.length < 3) return []
  const words = q.split(/\s+/).filter(Boolean)
  const out: Verse[] = []
  bible.books.forEach((chapters, bi) =>
    chapters.forEach((verses, ci) =>
      verses.forEach((t, vi) => {
        if (out.length >= limit) return
        const n = norm(t)
        if (words.every((w) => n.includes(w))) out.push({ book: bi + 1, chapter: ci + 1, verse: vi + 1, text: t })
      })
    )
  )
  return out
}

export function infoFull(b: FullBible, source: BibleVersionInfo['source']): BibleVersionInfo {
  return { id: b.id, name: b.name, abbrev: b.abbrev, lang: b.lang, copyright: b.copyright, source }
}

export function infoPartial(b: PartialBible): BibleVersionInfo {
  return {
    id: b.id,
    name: b.name,
    abbrev: b.abbrev,
    lang: b.lang,
    copyright: b.copyright,
    source: 'pasted',
    verseLimit: b.verseLimit,
    verseCount: Object.keys(b.verses).length
  }
}

export const BOOK_COUNT = BOOKS.length

/* ---------------- Importers for other Bibles the church has rights to ---------------- */

/** Import OSIS / USFX XML or ICCWorship JSON into a FullBible */
export function importBibleText(content: string, meta: { id: string; name: string; abbrev: string; lang: Lang; copyright?: string }): FullBible {
  const trimmed = content.trim()
  const books: BookArray = BOOKS.map(() => [])
  const set = (b: number, c: number, v: number, t: string) => {
    if (b < 0 || !c || !v || !t) return
    const ch = books[b]
    while (ch.length < c) ch.push([])
    const vs = ch[c - 1]
    while (vs.length < v) vs.push('')
    vs[v - 1] = vs[v - 1] ? vs[v - 1] + ' ' + t : t
  }
  const decode = (s: string) =>
    s
      .replace(/<note[\s\S]*?<\/note>/g, '')
      .replace(/<f\b[\s\S]*?<\/f>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()

  if (trimmed.startsWith('{')) {
    const j = JSON.parse(trimmed) as { books: BookArray }
    return { ...meta, books: j.books }
  }
  if (/<osis/i.test(trimmed.slice(0, 2000))) {
    const osisIds = BOOKS.map((b) => b.osis)
    // milestone form
    const re = /<verse\s+[^>]*osisID="([^"]+)"[^>]*sID="([^"]+)"[^>]*\/>([\s\S]*?)<verse\s+eID="\2"\s*\/>/g
    let m: RegExpExecArray | null
    let n = 0
    while ((m = re.exec(trimmed))) {
      const [bk, c, v] = m[1].split(' ')[0].split('.')
      set(osisIds.indexOf(bk), +c, +v, decode(m[3]))
      n++
    }
    if (!n) {
      // container form <verse osisID="Gen.1.1">text</verse>
      const re2 = /<verse\s+[^>]*osisID="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/g
      while ((m = re2.exec(trimmed))) {
        const [bk, c, v] = m[1].split(' ')[0].split('.')
        set(osisIds.indexOf(bk), +c, +v, decode(m[2]))
      }
    }
    return { ...meta, books }
  }
  if (/<usfx/i.test(trimmed.slice(0, 2000))) {
    const ids = BOOKS.map((b) => b.usfx)
    const re = /<(book|c|v|ve)\b([^>]*)>|<\/book>/g
    let b = -1
    let c = 0
    let v = 0
    let start = -1
    const close = (end: number) => {
      if (b >= 0 && c && v && start >= 0) set(b, c, v, decode(trimmed.slice(start, end)))
      start = -1
    }
    let m: RegExpExecArray | null
    while ((m = re.exec(trimmed))) {
      const tag = m[1]
      const id = (/id="([^"]+)"/.exec(m[2] || '') || [])[1]
      if (!tag) {
        close(m.index)
        b = -1
        continue
      }
      if (tag === 'book') {
        close(m.index)
        b = ids.indexOf(id)
        c = 0
        v = 0
      } else if (tag === 'c') {
        close(m.index)
        c = parseInt(id, 10)
        v = 0
      } else if (tag === 'v') {
        close(m.index)
        v = parseInt(id, 10)
        start = m.index + m[0].length
      } else close(m.index)
    }
    return { ...meta, books }
  }
  throw new Error('unsupported')
}
