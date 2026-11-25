#!/usr/bin/env node
/**
 * Builds the two public-domain Bibles that ship with ICCWorship:
 *   - King James Version (English)        eng-kjv.osis.xml
 *   - Reina-Valera 1909 (Spanish)          spa-rv1909.usfx.xml
 * Source: https://github.com/seven1m/open-bibles (public domain texts)
 *
 * Output: resources/bibles/{kjv,rv1909}.json  →  { id, name, abbrev, lang, copyright, books: string[][][] }
 * books[bookIndex][chapterIndex][verseIndex] = verse text (0-based indexes, canonical 66-book order)
 *
 * Usage: npm run bibles   (downloads into scripts/.cache if missing)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cacheDir = join(here, '.cache')
const outDir = join(here, '..', 'resources', 'bibles')
const BASE = 'https://raw.githubusercontent.com/seven1m/open-bibles/master/'

const OSIS = [
  'Gen',
  'Exod',
  'Lev',
  'Num',
  'Deut',
  'Josh',
  'Judg',
  'Ruth',
  '1Sam',
  '2Sam',
  '1Kgs',
  '2Kgs',
  '1Chr',
  '2Chr',
  'Ezra',
  'Neh',
  'Esth',
  'Job',
  'Ps',
  'Prov',
  'Eccl',
  'Song',
  'Isa',
  'Jer',
  'Lam',
  'Ezek',
  'Dan',
  'Hos',
  'Joel',
  'Amos',
  'Obad',
  'Jonah',
  'Mic',
  'Nah',
  'Hab',
  'Zeph',
  'Hag',
  'Zech',
  'Mal',
  'Matt',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Rom',
  '1Cor',
  '2Cor',
  'Gal',
  'Eph',
  'Phil',
  'Col',
  '1Thess',
  '2Thess',
  '1Tim',
  '2Tim',
  'Titus',
  'Phlm',
  'Heb',
  'Jas',
  '1Pet',
  '2Pet',
  '1John',
  '2John',
  '3John',
  'Jude',
  'Rev'
]
const USFX = [
  'GEN',
  'EXO',
  'LEV',
  'NUM',
  'DEU',
  'JOS',
  'JDG',
  'RUT',
  '1SA',
  '2SA',
  '1KI',
  '2KI',
  '1CH',
  '2CH',
  'EZR',
  'NEH',
  'EST',
  'JOB',
  'PSA',
  'PRO',
  'ECC',
  'SNG',
  'ISA',
  'JER',
  'LAM',
  'EZK',
  'DAN',
  'HOS',
  'JOL',
  'AMO',
  'OBA',
  'JON',
  'MIC',
  'NAM',
  'HAB',
  'ZEP',
  'HAG',
  'ZEC',
  'MAL',
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV'
]

async function ensure(file) {
  const p = join(cacheDir, file)
  if (existsSync(p)) return p
  mkdirSync(cacheDir, { recursive: true })
  console.log('Downloading', file, '…')
  const res = await fetch(BASE + file)
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${file}`)
  writeFileSync(p, Buffer.from(await res.arrayBuffer()))
  return p
}

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:?!)])/g, '$1')
    .trim()

function emptyBooks() {
  return OSIS.map(() => [])
}

function setVerse(books, b, c, v, text) {
  if (b < 0) return
  const chapters = books[b]
  while (chapters.length < c) chapters.push([])
  const verses = chapters[c - 1]
  while (verses.length < v) verses.push('')
  verses[v - 1] = verses[v - 1] ? verses[v - 1] + ' ' + text : text
}

function parseOsis(xml) {
  const books = emptyBooks()
  const re = /<verse\s+osisID="([^"]+)"\s+sID="([^"]+)"[^>]*\/>([\s\S]*?)<verse\s+eID="\2"\s*\/>/g
  let m
  let count = 0
  while ((m = re.exec(xml))) {
    const [bk, c, v] = m[1].split(' ')[0].split('.')
    const b = OSIS.indexOf(bk)
    setVerse(books, b, parseInt(c, 10), parseInt(v, 10), decode(m[3]))
    count++
  }
  return { books, count }
}

function parseUsfx(xml) {
  const books = emptyBooks()
  const re = /<(book|c|v|ve)\b([^>]*)>|<\/book>/g
  let b = -1
  let c = 0
  let v = 0
  let start = -1
  let count = 0
  const close = (end) => {
    if (b >= 0 && c && v && start >= 0) {
      const t = decode(xml.slice(start, end))
      if (t) {
        setVerse(books, b, c, v, t)
        count++
      }
    }
    start = -1
  }
  let m
  while ((m = re.exec(xml))) {
    const tag = m[1]
    const attrs = m[2] || ''
    const id = (/id="([^"]+)"/.exec(attrs) || [])[1]
    if (!tag) {
      close(m.index)
      b = -1
      continue
    }
    if (tag === 'book') {
      close(m.index)
      b = USFX.indexOf(id)
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
    } else if (tag === 've') {
      close(m.index)
    }
  }
  return { books, count }
}

function stats(books) {
  const missing = books.map((b, i) => (b.length ? null : OSIS[i])).filter(Boolean)
  return { chapters: books.reduce((a, b) => a + b.length, 0), missing }
}

async function main() {
  mkdirSync(outDir, { recursive: true })

  const kjvXml = readFileSync(await ensure('eng-kjv.osis.xml'), 'utf8')
  const kjv = parseOsis(kjvXml)
  console.log('KJV verses:', kjv.count, stats(kjv.books))
  writeFileSync(
    join(outDir, 'kjv.json'),
    JSON.stringify({ id: 'kjv', name: 'King James Version', abbrev: 'KJV', lang: 'en', copyright: 'Public domain', books: kjv.books })
  )

  const rvXml = readFileSync(await ensure('spa-rv1909.usfx.xml'), 'utf8')
  const rv = parseUsfx(rvXml)
  console.log('RV1909 verses:', rv.count, stats(rv.books))
  writeFileSync(
    join(outDir, 'rv1909.json'),
    JSON.stringify({ id: 'rv1909', name: 'Reina-Valera 1909', abbrev: 'RV1909', lang: 'es', copyright: 'Dominio público', books: rv.books })
  )
  console.log('Wrote', outDir)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
