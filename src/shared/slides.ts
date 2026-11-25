import type { BiText, Lang, LiveState, PassageResult, Slide, Song, SongSection } from './types'

export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)

/* ------------------------------ text helpers ------------------------------ */

/** Remove ChordPro inline chords: "[G]Amazing [D]grace" → "Amazing grace" */
export function stripChords(s: string): string {
  return s
    .split('\n')
    .map((l) =>
      l
        .replace(/\[[^\]\n]*\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trimEnd()
    )
    .join('\n')
}

export function hasChords(s: string): boolean {
  return /\[[A-G][#b]?[^\]\n]*\]/.test(s)
}

/** Split text into paragraphs (blank-line separated), each a list of non-empty lines */
export function paragraphs(s: string): string[][] {
  return (s || '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
    )
    .filter((p) => p.length > 0)
}

/** Split lines into n nearly-equal chunks */
export function splitEven<T>(items: T[], n: number): T[][] {
  if (n <= 1) return [items]
  const out: T[][] = []
  const size = items.length / n
  for (let i = 0; i < n; i++) {
    out.push(items.slice(Math.round(i * size), Math.round((i + 1) * size)))
  }
  return out
}

/* ------------------------------ songs ------------------------------ */

export function orderedSections(song: Song): SongSection[] {
  if (!song.arrangement?.length) return song.sections
  const byId = new Map(song.sections.map((s) => [s.id, s]))
  const out = song.arrangement.map((id) => byId.get(id)).filter((s): s is SongSection => !!s)
  return out.length ? out : song.sections
}

/**
 * Build slides for a song. English and Spanish lyrics are paired slide-by-slide:
 *  - if both languages have the same number of paragraphs, paragraph i ↔ paragraph i
 *  - otherwise each language is split into the same number of chunks by line count
 * Then each chunk is broken further so no slide exceeds `linesPerSlide` lines.
 */
export function songToSlides(song: Song, opts: { ccliLicense?: string } = {}): Slide[] {
  const lps = Math.max(1, song.linesPerSlide || 4)
  const slides: Slide[] = []
  for (const section of orderedSections(song)) {
    const enClean = stripChords(section.en || '')
    const esClean = stripChords(section.es || '')
    const enP = paragraphs(enClean)
    const esP = paragraphs(esClean)
    const enChordP = paragraphs(section.en || '')
    const esChordP = paragraphs(section.es || '')

    let pairs: { en: string[]; es: string[]; enC: string[]; esC: string[] }[] = []
    if (enP.length && esP.length && enP.length === esP.length) {
      pairs = enP.map((p, i) => ({ en: p, es: esP[i], enC: enChordP[i] || p, esC: esChordP[i] || esP[i] }))
    } else {
      const enLines = enP.flat()
      const esLines = esP.flat()
      const enCL = enChordP.flat()
      const esCL = esChordP.flat()
      const n = Math.max(1, Math.ceil(enLines.length / lps), Math.ceil(esLines.length / lps))
      const a = splitEven(enLines, n)
      const b = splitEven(esLines, n)
      const ac = splitEven(enCL, n)
      const bc = splitEven(esCL, n)
      pairs = a.map((x, i) => ({ en: x, es: b[i] || [], enC: ac[i] || x, esC: bc[i] || [] }))
    }

    // further break any pair that is longer than lps
    for (const p of pairs) {
      const n = Math.max(1, Math.ceil(p.en.length / lps), Math.ceil(p.es.length / lps))
      const a = splitEven(p.en, n)
      const b = splitEven(p.es, n)
      const ac = splitEven(p.enC, n)
      const bc = splitEven(p.esC, n)
      for (let i = 0; i < n; i++) {
        const en = (a[i] || []).join('\n')
        const es = (b[i] || []).join('\n')
        if (!en && !es) continue
        slides.push({
          id: uid(),
          kind: 'text',
          group: section.label,
          text: { en: en || undefined, es: es || undefined },
          chords: hasChords(section.en + section.es) ? { en: (ac[i] || []).join('\n') || undefined, es: (bc[i] || []).join('\n') || undefined } : undefined
        })
      }
    }
  }
  if (slides.length) {
    slides[0].footer = songFooter(song, opts.ccliLicense)
    slides[0].footerCombined = true
  }
  return slides
}

/**
 * The slide the next "advance" puts on screen: after Esc (nothing showing) that is the
 * slide that was cleared, otherwise the one after the current slide. -1 = none.
 */
export function upcomingSlideIndex(l: Pick<LiveState, 'slides' | 'slideIndex' | 'clearedFrom'>): number {
  if (l.slideIndex < 0 && l.clearedFrom !== undefined && l.clearedFrom >= 0 && l.clearedFrom < l.slides.length) return l.clearedFrom
  return l.slideIndex + 1 < l.slides.length ? l.slideIndex + 1 : -1
}

/** Display name for a song: English title, else Spanish title (one-language songs). */
export function songName(song: Pick<Song, 'title' | 'titleEs'>): string {
  return song.title?.trim() || song.titleEs?.trim() || ''
}

export function songFooter(song: Song, ccliLicense?: string): BiText {
  const parts: string[] = []
  // Either title may be empty (one-language songs) — never print a dangling " / ".
  const titleEn = song.title?.trim() || ''
  const titleEs = song.titleEs?.trim() || ''
  if (song.author) parts.push(song.author)
  if (song.copyright) parts.push(`© ${song.copyright.replace(/^©\s*/, '')}`)
  const ccli: string[] = []
  if (song.ccli) ccli.push(`CCLI # ${song.ccli}`)
  if (song.ccli && ccliLicense) ccli.push(`CCLI License / Licencia # ${ccliLicense}`)
  const tail = [...parts, ...ccli].join(' · ')
  const pair = (a: string, b: string) => (a && b && a !== b ? `${a} / ${b}` : a || b)
  // One line per language with that language's title first; the slide is marked
  // footerCombined so only the line for the current bilingual order is shown.
  const es = [pair(titleEs, titleEn), tail].filter(Boolean).join(' — ')
  const en = [pair(titleEn, titleEs), tail].filter(Boolean).join(' — ')
  return { en, es }
}

/* ------------------------------ scripture ------------------------------ */

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
export const superscript = (n: number | string): string =>
  String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('')

/** split a long verse at sentence / clause boundaries so each piece <= max chars */
export function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > max) {
    const window = rest.slice(0, max)
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf('? '), window.lastIndexOf('! '))
    if (cut < max * 0.4) cut = Math.max(window.lastIndexOf(', '), cut)
    if (cut < max * 0.4) cut = window.lastIndexOf(' ')
    if (cut <= 0) cut = max - 1
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) out.push(rest)
  return out
}

interface PassageInput {
  lang: Lang
  passage: PassageResult
}

/**
 * Build scripture slides. Primary and optional secondary passages (different languages)
 * are paired verse-by-verse so the English and Spanish always show the same verses.
 * `maxChars` is per language per slide; bilingual slides use a smaller budget.
 */
export function scriptureToSlides(primary: PassageInput, secondary?: PassageInput, opts: { maxChars?: number; showVerseNumbers?: boolean } = {}): Slide[] {
  const bilingual = !!secondary && secondary.passage.verses.length > 0
  const max = opts.maxChars ?? (bilingual ? 220 : 380)
  const showNums = opts.showVerseNumbers ?? true
  const key = (v: { book: number; chapter: number; verse: number }) => `${v.book}:${v.chapter}:${v.verse}`

  // union of verse keys in primary order, then any secondary-only verses
  const order: { book: number; chapter: number; verse: number }[] = []
  const seen = new Set<string>()
  for (const v of primary.passage.verses) {
    if (!seen.has(key(v))) {
      seen.add(key(v))
      order.push(v)
    }
  }
  if (secondary) {
    for (const v of secondary.passage.verses) {
      if (!seen.has(key(v))) {
        seen.add(key(v))
        order.push(v)
      }
    }
    order.sort((a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse)
  }
  const pMap = new Map(primary.passage.verses.map((v) => [key(v), v.text]))
  const sMap = new Map((secondary?.passage.verses || []).map((v) => [key(v), v.text]))

  const footer: BiText = {}
  const label = (p: PassageInput) => `${p.passage.reference}${p.passage.abbrev ? ` (${p.passage.abbrev})` : ''}`
  footer[primary.lang] = label(primary)
  if (secondary && bilingual) footer[secondary.lang] = label(secondary)

  const slides: Slide[] = []
  let cur: { p: string[]; s: string[]; len: number; first?: string; last?: string } = { p: [], s: [], len: 0 }
  const flush = () => {
    if (!cur.p.length && !cur.s.length) return
    const text: BiText = {}
    if (cur.p.length) text[primary.lang] = cur.p.join(' ')
    if (secondary && cur.s.length) text[secondary.lang] = cur.s.join(' ')
    const group = cur.first === cur.last ? cur.first : `${cur.first}-${cur.last}`
    slides.push({ id: uid(), kind: 'text', group, text, footer })
    cur = { p: [], s: [], len: 0 }
  }

  for (const v of order) {
    const k = key(v)
    const num = showNums ? superscript(v.verse) + ' ' : ''
    const pt = pMap.get(k) || ''
    const st = sMap.get(k) || ''
    const longest = Math.max(pt.length, st.length)
    const vLabel = `${v.chapter}:${v.verse}`
    if (longest > max) {
      flush()
      const pp = splitLongText(pt, max)
      const sp = splitLongText(st, max)
      const n = Math.max(pp.length, sp.length)
      // re-balance so both languages have the same number of pieces
      const pp2 = pp.length === n ? pp : splitEvenText(pt, n)
      const sp2 = sp.length === n ? sp : splitEvenText(st, n)
      for (let i = 0; i < n; i++) {
        cur = {
          p: pp2[i] ? [(i === 0 ? num : '') + pp2[i]] : [],
          s: sp2[i] ? [(i === 0 ? num : '') + sp2[i]] : [],
          len: 0,
          first: vLabel,
          last: vLabel
        }
        flush()
      }
      continue
    }
    if (cur.len + longest > max && (cur.p.length || cur.s.length)) flush()
    if (pt) cur.p.push(num + pt)
    if (st) cur.s.push(num + st)
    cur.len += longest
    if (!cur.first) cur.first = vLabel
    cur.last = vLabel
  }
  flush()
  return slides
}

/** split text into n pieces at word boundaries, roughly equal length */
export function splitEvenText(text: string, n: number): string[] {
  if (!text) return []
  const words = text.split(/\s+/)
  return splitEven(words, n)
    .map((w) => w.join(' '))
    .filter(Boolean)
}

/* ------------------------------ sermon notes ------------------------------ */

/**
 * Fill-in-the-blank notes: "God [[loves]] you" shows "God ______ you", and each
 * press of Next reveals the next blank. Returns one slide per reveal step.
 */
export function notesToSlides(items: { text: BiText; title?: BiText }[]): Slide[] {
  const slides: Slide[] = []
  for (const it of items) {
    const blanks = Math.max(countBlanks(it.text.en), countBlanks(it.text.es))
    for (let step = 0; step <= blanks; step++) {
      slides.push({
        id: uid(),
        kind: 'text',
        title: it.title,
        group: blanks ? `${step}/${blanks}` : undefined,
        text: { en: revealBlanks(it.text.en, step), es: revealBlanks(it.text.es, step) }
      })
    }
  }
  return slides
}

function countBlanks(s?: string): number {
  return s ? (s.match(/\[\[[^\]]+\]\]/g) || []).length : 0
}

export function revealBlanks(s: string | undefined, revealed: number): string | undefined {
  if (s === undefined) return undefined
  let i = 0
  return s.replace(/\[\[([^\]]+)\]\]/g, (_m, word: string) => {
    i++
    return i <= revealed ? word : '_'.repeat(Math.max(5, word.length + 2))
  })
}

/* ------------------------------ misc ------------------------------ */

/** epoch ms for "HH:MM" today (or tomorrow if already passed by > 1h) */
export function targetTimeToday(hhmm: string, now = Date.now()): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10))
  const d = new Date(now)
  d.setHours(h || 0, m || 0, 0, 0)
  if (d.getTime() < now - 3600_000) d.setDate(d.getDate() + 1)
  return d.getTime()
}

/**
 * epoch ms a "count down to HH:MM" item aims at. A plan dated in the future counts down to
 * that day (a countdown previewed on Wednesday for Sunday's 11:00 must not say "21 h");
 * otherwise — today's service, a template, an old plan reused — the next HH:MM as before.
 */
export function countdownTarget(hhmm: string, planDate?: string, now = Date.now()): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(planDate || '')
  if (d) {
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10))
    const t = new Date(+d[1], +d[2] - 1, +d[3], h || 0, m || 0, 0, 0).getTime()
    if (t > now) return t
  }
  return targetTimeToday(hhmm, now)
}

export function formatClock(ms: number): string {
  let s = Math.floor(Math.abs(ms) / 1000)
  // a few ms "in the past" (clock skew between windows) must not show as -0:00
  const neg = ms < 0 && s > 0
  const days = Math.floor(s / 86400)
  s -= days * 86400
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  // a countdown to a service days away: "3d 21:37:49" instead of "93:37:49"
  if (days) return `${neg ? '-' : ''}${days}d ${pad(h)}:${pad(m)}:${pad(s)}`
  return (neg ? '-' : '') + (h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`)
}

/** Choose what text lines to show given display language and order */
export function pickLangs(text: BiText | undefined, display: 'en' | 'es' | 'both', order: 'es-first' | 'en-first'): { primary?: string; secondary?: string } {
  if (!text) return {}
  if (display === 'en') return { primary: text.en ?? text.es }
  if (display === 'es') return { primary: text.es ?? text.en }
  const first = order === 'es-first' ? text.es : text.en
  const second = order === 'es-first' ? text.en : text.es
  if (first && second && first.trim() !== second.trim()) return { primary: first, secondary: second }
  return { primary: first ?? second }
}
