import type { SectionType, Song, SongSection } from './types'
import { uid } from './slides'
import { stripTags } from './textDecode'
import { guessLang } from './langGuess'

/* --------------------------- section headers --------------------------- */

const HEADER_RE =
  /^\s*[[(]?\s*(verse|verso|estrofa|v|chorus|coro|estribillo|c|ch|pre[- ]?chorus|pre[- ]?coro|pre|bridge|puente|b|tag|intro|outro|ending|final|interlude|interludio|refrain)\s*(\d*)\s*[\])]?\s*:?\s*$/i

const TYPE_MAP: Record<string, SectionType> = {
  verse: 'verse',
  verso: 'verse',
  estrofa: 'verse',
  v: 'verse',
  chorus: 'chorus',
  coro: 'chorus',
  estribillo: 'chorus',
  refrain: 'chorus',
  c: 'chorus',
  ch: 'chorus',
  prechorus: 'pre',
  'pre-chorus': 'pre',
  'pre chorus': 'pre',
  precoro: 'pre',
  'pre-coro': 'pre',
  'pre coro': 'pre',
  pre: 'pre',
  bridge: 'bridge',
  puente: 'bridge',
  b: 'bridge',
  tag: 'tag',
  intro: 'intro',
  outro: 'ending',
  ending: 'ending',
  final: 'ending',
  interlude: 'other',
  interludio: 'other'
}

const LABEL: Record<SectionType, string> = {
  verse: 'Verse',
  chorus: 'Chorus',
  pre: 'Pre-Chorus',
  bridge: 'Bridge',
  tag: 'Tag',
  intro: 'Intro',
  ending: 'Ending',
  other: 'Other'
}

export function sectionLabel(type: SectionType, n?: number | string): string {
  return n ? `${LABEL[type]} ${n}` : LABEL[type]
}

export function parseHeader(line: string): { type: SectionType; num: string } | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  const key = m[1].toLowerCase()
  const type = TYPE_MAP[key] || TYPE_MAP[key.replace(/[- ]/g, '')] || 'other'
  // single-letter headers need a number or a colon/bracket to avoid matching lyrics like "C"
  if (key.length <= 2 && !m[2] && !/[:\])]/.test(line)) return null
  return { type, num: m[2] || '' }
}

interface RawSection {
  type: SectionType
  label: string
  lines: string[]
}

/**
 * Plain-text lyrics → sections.
 * Recognizes headers ("Verse 1", "Coro", "[Bridge]", "V2:") in English or Spanish.
 * Without headers, each blank-line paragraph becomes a section, and a paragraph that
 * repeats is treated as the chorus.
 */
export function parsePlainSections(text: string): RawSection[] {
  const lines = text.replace(/\r/g, '').split('\n')
  const out: RawSection[] = []
  let cur: RawSection | null = null
  let sawHeader = false
  const counters: Partial<Record<SectionType, number>> = {}
  const push = () => {
    if (cur && cur.lines.some((l) => l.trim())) {
      // trim leading / trailing blank lines but keep internal blank lines (slide breaks)
      while (cur.lines.length && !cur.lines[0].trim()) cur.lines.shift()
      while (cur.lines.length && !cur.lines[cur.lines.length - 1].trim()) cur.lines.pop()
      out.push(cur)
    }
    cur = null
  }
  for (const raw of lines) {
    const h = parseHeader(raw)
    if (h) {
      sawHeader = true
      push()
      counters[h.type] = (counters[h.type] || 0) + 1
      cur = { type: h.type, label: sectionLabel(h.type, h.num || (h.type === 'verse' ? counters[h.type] : undefined)), lines: [] }
      continue
    }
    if (!sawHeader) {
      // paragraph mode
      if (!raw.trim()) {
        push()
        continue
      }
      if (!cur) cur = { type: 'verse', label: '', lines: [] }
      cur.lines.push(raw.trim())
    } else {
      if (!cur) cur = { type: 'verse', label: sectionLabel('verse', 1), lines: [] }
      cur.lines.push(raw.trim())
    }
  }
  push()

  if (!sawHeader) {
    // detect repeated paragraph = chorus
    const key = (s: RawSection) => s.lines.join('\n').toLowerCase()
    const counts = new Map<string, number>()
    out.forEach((s) => counts.set(key(s), (counts.get(key(s)) || 0) + 1))
    let v = 0
    for (const s of out) {
      if ((counts.get(key(s)) || 0) > 1) {
        s.type = 'chorus'
        s.label = sectionLabel('chorus')
      } else {
        v++
        s.label = sectionLabel('verse', v)
      }
    }
  }
  return out
}

/** Turn parsed sections into song sections + arrangement, merging duplicate sections */
function toSongSections(en: RawSection[], es: RawSection[]): { sections: SongSection[]; arrangement: string[] } {
  const sections: SongSection[] = []
  const arrangement: string[] = []
  const byText = new Map<string, string>()
  const n = Math.max(en.length, es.length)
  for (let i = 0; i < n; i++) {
    const a = en[i]
    const b = es[i]
    const enText = a ? a.lines.join('\n') : ''
    const esText = b ? b.lines.join('\n') : ''
    const k = `${enText}||${esText}`.toLowerCase()
    const existing = byText.get(k)
    if (existing) {
      arrangement.push(existing)
      continue
    }
    const base = a || b!
    const id = uid().slice(0, 8)
    sections.push({ id, type: base.type, label: base.label || sectionLabel(base.type), en: enText, es: esText })
    byText.set(k, id)
    arrangement.push(id)
  }
  // only keep an arrangement if there were repeats
  const needsArrangement = arrangement.length !== sections.length
  return { sections, arrangement: needsArrangement ? arrangement : [] }
}

function emptySong(title: string): Song {
  const t = Date.now()
  return { id: uid(), title, tags: [], sections: [], arrangement: [], linesPerSlide: 4, createdAt: t, updatedAt: t }
}

/** Bilingual paste: English lyrics and Spanish lyrics are matched section by section */
export function songFromPlainText(title: string, en: string, es = ''): Song {
  const song = emptySong(title)
  const { sections, arrangement } = toSongSections(parsePlainSections(en), parsePlainSections(es))
  song.sections = sections
  song.arrangement = arrangement
  return song
}

/* ------------------------------- ChordPro ------------------------------- */

export function songFromChordPro(text: string): Song {
  const song = emptySong('Untitled')
  const lines = text.replace(/\r/g, '').split('\n')
  const raw: RawSection[] = []
  let cur = null as RawSection | null
  const counters: Partial<Record<SectionType, number>> = {}
  const start = (type: SectionType, label?: string) => {
    if (cur && cur.lines.some((l) => l.trim())) raw.push(cur)
    counters[type] = (counters[type] || 0) + 1
    cur = { type, label: label || sectionLabel(type, type === 'verse' ? counters[type] : undefined), lines: [] }
  }
  const end = () => {
    if (cur && cur.lines.some((l) => l.trim())) raw.push(cur)
    cur = null
  }
  for (const line of lines) {
    const d = /^\s*\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}\s*$/i.exec(line)
    if (d) {
      const key = d[1].toLowerCase()
      const val = (d[2] || '').trim()
      if (key === 'title' || key === 't') song.title = val
      else if (key === 'subtitle' || key === 'st') song.titleEs = song.titleEs || undefined
      else if (key === 'artist' || key === 'composer' || key === 'author') song.author = val
      else if (key === 'copyright') song.copyright = val
      else if (key === 'ccli') song.ccli = val
      else if (key === 'key') song.key = val
      else if (key === 'start_of_chorus' || key === 'soc') start('chorus', val || undefined)
      else if (key === 'start_of_verse' || key === 'sov') start('verse', val || undefined)
      else if (key === 'start_of_bridge' || key === 'sob') start('bridge', val || undefined)
      else if (key.startsWith('end_of') || key === 'eoc' || key === 'eov' || key === 'eob') end()
      else if (key === 'comment' || key === 'c' || key === 'comment_italic' || key === 'ci') {
        const h = parseHeader(val)
        if (h) start(h.type, sectionLabel(h.type, h.num || undefined))
      }
      continue
    }
    if (line.trim().startsWith('#')) continue
    const h = parseHeader(line)
    if (h) {
      start(h.type, sectionLabel(h.type, h.num || (h.type === 'verse' ? (counters.verse || 0) + 1 : undefined)))
      continue
    }
    if (!line.trim()) {
      if (cur && cur.lines.length) cur.lines.push('')
      continue
    }
    if (!cur) start('verse')
    cur!.lines.push(line.trim())
  }
  end()
  // drop trailing blank lines inside sections
  raw.forEach((r) => {
    while (r.lines.length && !r.lines[r.lines.length - 1].trim()) r.lines.pop()
  })
  const { sections, arrangement } = toSongSections(raw, [])
  // ChordPro has one language: a Spanish song goes in the Español box (guessLang; English when it can't tell)
  const spanish = guessLang(raw.flatMap((r) => r.lines).join('\n')) === 'es'
  song.sections = spanish ? sections.map((s) => ({ ...s, en: '', es: s.en })) : sections
  song.arrangement = arrangement
  return song
}

/* ------------------------------- OpenLyrics ------------------------------- */

const xmlDecode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/**
 * OpenLyrics XML (exported by OpenLP, FreeShow and others).
 * Verses with the same name in different languages (lang="en" / lang="es")
 * become one bilingual section.
 */
export function songFromOpenLyrics(xml: string): Song {
  const song = emptySong('Untitled')
  const titles = [...xml.matchAll(/<title(?=[\s>])(?:\s+lang="([^"]*)")?[^>]*>([\s\S]*?)<\/title>/g)]
  for (const m of titles) {
    const lang = (m[1] || '').toLowerCase()
    const val = xmlDecode(m[2].trim())
    if (lang.startsWith('es')) song.titleEs = val
    else if (song.title === 'Untitled') song.title = val
  }
  // only a Spanish title: a one-language Spanish song (same as a Spanish-only paste), not
  // the same name twice as "Cuán Grande / Cuán Grande"
  if (song.title === 'Untitled' && song.titleEs) song.title = ''
  const authors = [...xml.matchAll(/<author(?=[\s>])[^>]*>([\s\S]*?)<\/author>/g)].map((m) => xmlDecode(m[1].trim()))
  if (authors.length) song.author = authors.join(', ')
  const cr = /<copyright>([\s\S]*?)<\/copyright>/.exec(xml)
  if (cr) song.copyright = xmlDecode(cr[1].trim())
  const ccli = /<ccliNo>([\s\S]*?)<\/ccliNo>/.exec(xml)
  if (ccli) song.ccli = ccli[1].trim()
  const key = /<key>([\s\S]*?)<\/key>/.exec(xml)
  if (key) song.key = key[1].trim()
  const order = /<verseOrder>([\s\S]*?)<\/verseOrder>/.exec(xml)?.[1].trim().split(/\s+/) || []

  const byName = new Map<string, SongSection>()
  for (const m of xml.matchAll(/<verse\b([^>]*)>([\s\S]*?)<\/verse>/g)) {
    const attrs = m[1]
    const name = (/name="([^"]+)"/.exec(attrs) || [])[1] || `v${byName.size + 1}`
    const lang = ((/lang="([^"]+)"/.exec(attrs) || [])[1] || '').toLowerCase()
    const linesBlocks = [...m[2].matchAll(/<lines\b[^>]*>([\s\S]*?)<\/lines>/g)].map((l) =>
      xmlDecode(
        stripTags(
          l[1]
            .replace(/<chord\s+name="([^"]+)"\s*\/>/g, '[$1]')
            .replace(/<br\s*\/?>/g, '\n')
            .replace(/<comment>[\s\S]*?<\/comment>/g, '')
        )
      )
        .split('\n')
        .map((x) => x.trim())
        .join('\n')
        .trim()
    )
    const text = linesBlocks.join('\n\n')
    let sec = byName.get(name)
    if (!sec) {
      const letter = name.replace(/\d.*$/, '').toLowerCase()
      const num = name.replace(/^\D+/, '').replace(/[a-z]$/i, '')
      const type: SectionType =
        ({ v: 'verse', c: 'chorus', p: 'pre', b: 'bridge', i: 'intro', e: 'ending', o: 'other' } as Record<string, SectionType>)[letter] || 'other'
      sec = { id: name, type, label: sectionLabel(type, num || undefined), en: '', es: '' }
      byName.set(name, sec)
    }
    if (lang.startsWith('es')) sec.es = text
    else if (lang.startsWith('en') || !lang) {
      if (sec.en && !lang) sec.es = sec.es || text
      else sec.en = text
    } else if (!sec.en) sec.en = text
  }
  song.sections = [...byName.values()]
  song.arrangement = order.filter((o) => byName.has(o))
  if (song.arrangement.length === song.sections.length && song.arrangement.every((id, i) => song.sections[i].id === id)) song.arrangement = []
  return song
}

/** OpenLyrics export (bilingual) so songs can be shared with other ICCWorship / OpenLP users */
/** a name for a song with no title: its first lyric line, else "Untitled" */
function untitledName(song: Song): string {
  for (const sec of song.sections)
    for (const l of ['en', 'es'] as const) {
      const line = sec[l].split('\n').find((x) => x.trim())
      if (line) return line.trim()
    }
  return 'Untitled'
}

export function songToOpenLyrics(song: Song): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const name = (s: SongSection, i: number) => {
    const p = { verse: 'v', chorus: 'c', pre: 'p', bridge: 'b', tag: 'o', intro: 'i', ending: 'e', other: 'o' }[s.type]
    const n = s.label.match(/\d+/)?.[0] || String(i + 1)
    return `${p}${n}`
  }
  const names = new Map(song.sections.map((s, i) => [s.id, name(s, i)]))
  const verses = song.sections
    .flatMap((s) =>
      (['en', 'es'] as const)
        .filter((l) => s[l].trim())
        .map((l) => `    <verse name="${names.get(s.id)}" lang="${l}">\n      <lines>${s[l].split('\n').map(esc).join('<br/>')}</lines>\n    </verse>`)
    )
    .join('\n')
  const order = (song.arrangement.length ? song.arrangement : song.sections.map((s) => s.id))
    .map((id) => names.get(id))
    .filter(Boolean)
    .join(' ')
  // a one-language Spanish song has no English title: write only the titles it has (an empty
  // <title> makes other OpenLyrics apps show it as untitled)
  const titlesXml =
    [song.title?.trim() ? `<title lang="en">${esc(song.title)}</title>` : '', song.titleEs?.trim() ? `<title lang="es">${esc(song.titleEs)}</title>` : '']
      .filter(Boolean)
      .join('\n      ') ||
    // no title at all: OpenLyrics requires one — name it by its first lyric line, as hymnals do
    `<title>${esc(untitledName(song))}</title>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9" createdIn="ICCWorship">
  <properties>
    <titles>
      ${titlesXml}
    </titles>${song.author ? `\n    <authors><author>${esc(song.author)}</author></authors>` : ''}${song.copyright ? `\n    <copyright>${esc(song.copyright)}</copyright>` : ''}${song.ccli ? `\n    <ccliNo>${esc(song.ccli)}</ccliNo>` : ''}
    <verseOrder>${order}</verseOrder>
  </properties>
  <lyrics>
${verses}
  </lyrics>
</song>
`
}

/** Why a song file could not be imported — mapped to a translated message by the UI. */
export class SongImportError extends Error {
  constructor(public code: 'empty' | 'notSong' | 'damaged' | 'noLyrics') {
    super(code)
  }
}

/** NUL bytes, or more than 2% control characters (other than tab / line breaks), in the first 8 KB */
export function looksBinary(content: string): boolean {
  const head = content.slice(0, 8192)
  if (head.includes('\u0000')) return true
  let ctl = 0
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i)
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0x7f && c < 0xa0) || c === 0xfffd) ctl++
  }
  return head.length > 0 && ctl / head.length > 0.02
}

export function detectAndParseSongFile(name: string, content: string): Song {
  const lower = name.toLowerCase()
  if (!content.trim()) throw new SongImportError('empty')
  // A picture, video, PDF… picked by mistake decodes to text full of control characters;
  // without this check the plain-text fallback would turn it into a "song" of garbage.
  if (looksBinary(content)) throw new SongImportError('notSong')
  let song: Song
  if (lower.endsWith('.xml') || /<song[\s>]/.test(content.slice(0, 500))) {
    if (!/<song[\s>]/.test(content)) throw new SongImportError('notSong') // some other XML file
    if (!/<\/song>\s*$/.test(content.trim())) throw new SongImportError('damaged') // cut off / broken
    song = songFromOpenLyrics(content)
  } else if (/\.(cho|chopro|chordpro|crd|pro)$/.test(lower) || /\{\s*(title|t)\s*:/.test(content)) song = songFromChordPro(content)
  else song = songFromPlainText(name.replace(/\.[^.]+$/, ''), content)
  // never create an empty "Untitled" song from a file that had no lyrics in it
  if (!song.sections.some((s) => s.en.trim() || s.es.trim())) throw new SongImportError('noLyrics')
  return song
}

// ------------------------------------------------------------------------------------------
// Duplicates on import (Skip / Replace / Keep both, like EasyWorship and ProPresenter)
// ------------------------------------------------------------------------------------------

const normKey = (x?: string) =>
  (x || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const firstLine = (s: Song) => {
  for (const sec of s.sections)
    for (const t of [sec.en, sec.es]) {
      const l = (t || '').split('\n').find((x) => x.trim())
      if (l) return normKey(l)
    }
  return ''
}

/**
 * The library song an imported song duplicates: same CCLI number, or the same title (either
 * language) and the same first lyric line. Different songs that share a title don't match.
 */
export function findDuplicateSong(song: Song, library: Song[]): Song | undefined {
  const ccli = (song.ccli || '').trim()
  if (ccli) {
    const byCcli = library.find((x) => (x.ccli || '').trim() === ccli)
    if (byCcli) return byCcli
  }
  const titles = [song.title, song.titleEs].map(normKey).filter(Boolean)
  const line = firstLine(song)
  return library.find((x) => {
    const xt = [x.title, x.titleEs].map(normKey).filter(Boolean)
    return xt.some((t) => titles.includes(t)) && firstLine(x) === line
  })
}

/**
 * Name a "Keep both" copy so it clashes neither with the library nor with copies made
 * earlier in the same import (one-language Spanish songs are named by their Spanish
 * title). The new name is added to `taken`.
 */
export function nameCopy(song: Song, taken: { titles: string[]; titlesEs: string[] }): Song {
  const copy = { ...song }
  if (copy.title) copy.title = copyTitle(copy.title, taken.titles)
  else if (copy.titleEs) copy.titleEs = copyTitle(copy.titleEs, taken.titlesEs)
  taken.titles.push(copy.title)
  taken.titlesEs.push(copy.titleEs || '')
  return copy
}

/** "Title (2)", "Title (3)"… — first free name for a kept copy */
export function copyTitle(title: string, taken: string[]): string {
  const set = new Set(taken.map((x) => x.toLowerCase()))
  for (let n = 2; ; n++) {
    const name = `${title} (${n})`
    if (!set.has(name.toLowerCase())) return name
  }
}
