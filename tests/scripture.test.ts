import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findBook } from '@shared/books'
import { formatReference, parseReference } from '@shared/scriptureRef'
import { passageFromFull, passageFromPartial, parsePastedPassage, searchFull, versificationFrom, importBibleText, type FullBible, type PartialBible } from '@shared/bibleCore'

const kjv = JSON.parse(readFileSync(join(__dirname, '..', 'resources', 'bibles', 'kjv.json'), 'utf8')) as FullBible
const rv = JSON.parse(readFileSync(join(__dirname, '..', 'resources', 'bibles', 'rv1909.json'), 'utf8')) as FullBible
const vers = versificationFrom(kjv.books)

describe('book lookup (English + Spanish)', () => {
  it.each([
    ['John', 43],
    ['Juan', 43],
    ['jn', 43],
    ['Jn.', 43],
    ['1 Cor', 46],
    ['1Co', 46],
    ['I Corintios', 46],
    ['Primera Corintios', 46],
    ['Salmos', 19],
    ['Ps', 19],
    ['Psalm', 19],
    ['Apocalipsis', 66],
    ['Revelation', 66],
    ['Éxodo', 2],
    ['Exodo', 2],
    ['Santiago', 59],
    ['James', 59],
    ['Hechos', 44],
    ['Cantares', 22],
    ['Song of Solomon', 22],
    ['3 Juan', 64],
    ['Fil', 50],
    ['Phil', 50],
    ['Filemón', 57],
    ['Isaías', 23],
    ['Gén', 1]
  ])('%s → book %i', (name, num) => {
    expect(findBook(name)?.num).toBe(num)
  })

  it('returns undefined for nonsense', () => {
    expect(findBook('Xyzzy')).toBeUndefined()
  })
})

describe('parseReference', () => {
  it('parses a single verse', () => {
    const r = parseReference('John 3:16')
    expect(r.ok && r.ref.segments).toEqual([{ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }])
  })
  it('accepts "San Juan" / "S. Mateo" / "St. Luke"', () => {
    for (const [q, num] of [['San Juan 3:16', 43], ['S. Mateo 5:3', 40], ['St. Luke 2:11', 42], ['Saint John 1:1', 43]] as const) {
      const r = parseReference(q)
      expect(r.ok && r.ref.book.num, q).toBe(num)
    }
  })
  it('accepts "San" / "Saint" after a book number ("1 San Juan 4:8")', () => {
    for (const [q, num] of [['1 San Juan 4:8', 62], ['2 San Pedro 1:3', 61], ['1 S. Juan 1:9', 62], ['1 St. John 4:8', 62], ['Primera San Juan 3:1', 62], ['3 San Juan 4', 64]] as const) {
      const r = parseReference(q)
      expect(r.ok && r.ref.book.num, q).toBe(num)
    }
    // the chapter / verse survive the prefix
    const r = parseReference('1 San Juan 4:8')
    expect(r.ok && r.ref.segments).toEqual([{ startChapter: 4, startVerse: 8, endChapter: 4, endVerse: 8 }])
  })
  it('reads one-chapter books as verses ("Judas 3" = Jude 1:3)', () => {
    const r = parseReference('Judas 3')
    expect(r.ok && r.ref.segments).toEqual([{ startChapter: 1, startVerse: 3, endChapter: 1, endVerse: 3 }])
    const p = parseReference('Filemón 4-6')
    expect(p.ok && p.ref.segments).toEqual([{ startChapter: 1, startVerse: 4, endChapter: 1, endVerse: 6 }])
    const whole = parseReference('Jude 1')
    expect(whole.ok && whole.ref.segments).toEqual([{ startChapter: 1, endChapter: 1 }])
    const explicit = parseReference('Jude 1:3')
    expect(explicit.ok && explicit.ref.segments).toEqual([{ startChapter: 1, startVerse: 3, endChapter: 1, endVerse: 3 }])
  })
  it('parses Spanish dot separator and range', () => {
    const r = parseReference('Juan 3.16-18')
    expect(r.ok && r.ref.book.num).toBe(43)
    expect(r.ok && r.ref.segments[0]).toEqual({ startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18 })
  })
  it('parses whole chapter', () => {
    const r = parseReference('1 Cor 13')
    expect(r.ok && r.ref.segments[0]).toEqual({ startChapter: 13, endChapter: 13 })
  })
  it('parses chapter range', () => {
    const r = parseReference('Genesis 1-2')
    expect(r.ok && r.ref.segments[0]).toEqual({ startChapter: 1, endChapter: 2 })
  })
  it('parses comma lists', () => {
    const r = parseReference('Romanos 8:28, 31-32')
    expect(r.ok && r.ref.segments).toEqual([
      { startChapter: 8, startVerse: 28, endChapter: 8, endVerse: 28 },
      { startChapter: 8, startVerse: 31, endChapter: 8, endVerse: 32 }
    ])
  })
  it('parses cross-chapter range', () => {
    const r = parseReference('Rom 8:38-9:2')
    expect(r.ok && r.ref.segments[0]).toEqual({ startChapter: 8, startVerse: 38, endChapter: 9, endVerse: 2 })
  })
  it('rejects bad input', () => {
    expect(parseReference('').ok).toBe(false)
    expect(parseReference('Blah 3:16').ok).toBe(false)
    expect(parseReference('John 3:18-16').ok).toBe(false)
  })
  it('formats in both languages', () => {
    const r = parseReference('jn 3:16-18')
    if (!r.ok) throw new Error()
    expect(formatReference(r.ref, 'en')).toBe('John 3:16-18')
    expect(formatReference(r.ref, 'es')).toBe('Juan 3:16-18')
  })
})

describe('built-in bibles', () => {
  it('has all 66 books in both versions', () => {
    expect(kjv.books.length).toBe(66)
    expect(rv.books.length).toBe(66)
    expect(kjv.books[18].length).toBe(150)
    expect(rv.books[18].length).toBe(150)
  })
  it('looks up John 3:16 in KJV and RV1909', () => {
    const en = passageFromFull(kjv, 'John 3:16')
    const es = passageFromFull(rv, 'Juan 3:16')
    expect(en.verses[0].text).toMatch(/^For God so loved the world/)
    expect(es.verses[0].text).toMatch(/^Porque de tal manera amó Dios al mundo/)
    expect(es.reference).toBe('Juan 3:16')
    expect(es.abbrev).toBe('RV1909')
  })
  it('expands whole chapters', () => {
    expect(passageFromFull(kjv, 'Psalm 23').verses.length).toBe(6)
  })
  it('searches accent-insensitively', () => {
    const hits = searchFull(rv, 'jehova es mi pastor')
    expect(hits.some((h) => h.book === 19 && h.chapter === 23)).toBe(true)
  })
})

describe('pasted (LBLA-style) verses', () => {
  // placeholder wording only — never commit real copyrighted Bible text
  const pasted = `Juan 3:16-18
La Biblia de las Américas
16 Texto de prueba del versículo dieciséis, como si viniera de la página web.[a] 17 Texto de prueba del versículo diecisiete (A) con una referencia cruzada.
18 Texto de prueba del versículo dieciocho, que termina aquí.`

  it('splits pasted text into verses by number', () => {
    const r = parsePastedPassage('Juan 3:16-18', pasted, vers)
    expect(r.ok).toBe(true)
    expect(r.verses.map((v) => v.verse)).toEqual([16, 17, 18])
    expect(r.verses[0].text).toMatch(/^Texto de prueba del versículo dieciséis/)
    expect(r.verses[0].text).not.toContain('[a]')
    expect(r.verses[1].text).not.toContain('(A)')
    expect(r.verses[2].text).toMatch(/termina aquí\.$/)
  })

  it('accepts a single verse without a number', () => {
    const r = parsePastedPassage('Juan 3:16', 'Texto de prueba sin número…', vers)
    expect(r.ok).toBe(true)
    expect(r.verses[0].verse).toBe(16)
  })

  it('reports missing verse numbers', () => {
    const r = parsePastedPassage('Juan 3:16-18', '16 Texto de prueba uno. 17 Texto de prueba dos', vers)
    expect(r.ok).toBe(false)
    expect(r.notFound).toEqual([18])
  })

  it('serves stored verses and lists missing ones', () => {
    const lbla: PartialBible = { id: 'lbla', name: 'La Biblia de las Américas', abbrev: 'LBLA', lang: 'es', verseLimit: 500, verses: { '43:3:16': 'Texto de prueba…' } }
    const p = passageFromPartial(lbla, 'Juan 3:16-17', vers)
    expect(p.verses.length).toBe(1)
    expect(p.missing).toEqual([{ book: 43, chapter: 3, verse: 17 }])
  })
})

describe('bible importer', () => {
  it('imports OSIS milestone XML', () => {
    const xml = `<osis><osisText><verse osisID="John.3.16" sID="a"/>For God so loved<verse eID="a"/></osisText></osis>`
    const b = importBibleText(xml, { id: 'x', name: 'X', abbrev: 'X', lang: 'en' })
    expect(b.books[42][2][15]).toBe('For God so loved')
  })
  it('imports USFX XML', () => {
    const xml = `<usfx><book id="JHN"><c id="3"/><v id="16"/>Porque de tal manera<ve/></book></usfx>`
    const b = importBibleText(xml, { id: 'x', name: 'X', abbrev: 'X', lang: 'es' })
    expect(b.books[42][2][15]).toBe('Porque de tal manera')
  })
})
