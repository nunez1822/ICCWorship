import { describe, expect, it } from 'vitest'
import { SAMPLE_SONGS } from '@shared/defaults'
import { notesToSlides, pickLangs, scriptureToSlides, songToSlides, splitLongText, stripChords, formatClock } from '@shared/slides'
import type { PassageResult, Song } from '@shared/types'

const song = (over: Partial<Song>): Song => ({
  id: 's',
  title: 'T',
  tags: [],
  sections: [],
  arrangement: [],
  linesPerSlide: 2,
  createdAt: 0,
  updatedAt: 0,
  ...over
})

describe('songToSlides', () => {
  it('pairs English and Spanish lines and respects lines per slide', () => {
    const s = song({
      sections: [{ id: 'v1', type: 'verse', label: 'Verse 1', en: 'a\nb\nc\nd', es: 'A\nB\nC\nD' }]
    })
    const slides = songToSlides(s)
    expect(slides.length).toBe(2)
    expect(slides[0].text).toEqual({ en: 'a\nb', es: 'A\nB' })
    expect(slides[1].text).toEqual({ en: 'c\nd', es: 'C\nD' })
    expect(slides[0].group).toBe('Verse 1')
  })

  it('pairs paragraphs when both languages have the same count', () => {
    const s = song({
      linesPerSlide: 6,
      sections: [{ id: 'c', type: 'chorus', label: 'Chorus', en: 'one\ntwo\n\nthree', es: 'uno\n\ndos\ntres' }]
    })
    const slides = songToSlides(s)
    expect(slides.map((x) => x.text)).toEqual([
      { en: 'one\ntwo', es: 'uno' },
      { en: 'three', es: 'dos\ntres' }
    ])
  })

  it('follows the arrangement order and repeats sections', () => {
    const s = song({
      linesPerSlide: 4,
      sections: [
        { id: 'v', type: 'verse', label: 'V', en: 'verse', es: '' },
        { id: 'c', type: 'chorus', label: 'C', en: 'chorus', es: '' }
      ],
      arrangement: ['v', 'c', 'v', 'c', 'c']
    })
    expect(songToSlides(s).map((x) => x.group)).toEqual(['V', 'C', 'V', 'C', 'C'])
  })

  it('strips chords for the screen but keeps them for the stage', () => {
    const slides = songToSlides(SAMPLE_SONGS.find((x) => x.id === 'song-amazing-grace')!)
    expect(slides[0].text?.en).toBe('Amazing grace! How sweet the sound\nThat saved a wretch like me!')
    expect(slides[0].chords?.en).toContain('[G]Amazing')
  })

  it('adds a footer with CCLI info to the first slide', () => {
    const slides = songToSlides(song({ title: 'Song', ccli: '123', sections: [{ id: 'a', type: 'verse', label: 'V', en: 'x', es: 'y' }] }), { ccliLicense: '999' })
    expect(slides[0].footer?.en).toContain('CCLI # 123')
    expect(slides[0].footer?.en).toContain('CCLI License / Licencia # 999')
    expect(slides[0].footer?.es).toBe(slides[0].footer?.en)
  })

  it('builds all sample songs without empty slides', () => {
    for (const s of SAMPLE_SONGS) {
      const slides = songToSlides(s)
      expect(slides.length).toBeGreaterThan(0)
      for (const sl of slides) expect(sl.text?.en || sl.text?.es).toBeTruthy()
    }
  })
})

describe('stripChords', () => {
  it('removes inline chords', () => {
    expect(stripChords('[G]Amazing [C]grace')).toBe('Amazing grace')
  })
})

describe('scriptureToSlides', () => {
  const p = (lang: 'en' | 'es', texts: string[]): PassageResult => ({
    ok: true,
    reference: lang === 'en' ? 'John 3:16-17' : 'Juan 3:16-17',
    verses: texts.map((t, i) => ({ book: 43, chapter: 3, verse: 16 + i, text: t })),
    missing: [],
    abbrev: lang === 'en' ? 'KJV' : 'RV1909'
  })

  it('pairs verses across languages and adds footers', () => {
    const slides = scriptureToSlides({ lang: 'es', passage: p('es', ['uno', 'dos']) }, { lang: 'en', passage: p('en', ['one', 'two']) })
    expect(slides.length).toBe(1)
    expect(slides[0].text?.es).toBe('¹⁶ uno ¹⁷ dos')
    expect(slides[0].text?.en).toBe('¹⁶ one ¹⁷ two')
    expect(slides[0].footer).toEqual({ es: 'Juan 3:16-17 (RV1909)', en: 'John 3:16-17 (KJV)' })
  })

  it('splits long passages into several slides keeping languages aligned', () => {
    const long = 'word '.repeat(60).trim()
    const slides = scriptureToSlides({ lang: 'en', passage: p('en', [long, long]) }, { lang: 'es', passage: p('es', [long, long]) }, { maxChars: 120 })
    expect(slides.length).toBeGreaterThan(2)
    for (const s of slides) {
      expect(s.text?.en).toBeTruthy()
      expect(s.text?.es).toBeTruthy()
    }
  })
})

describe('splitLongText', () => {
  it('cuts at sentence boundaries', () => {
    const parts = splitLongText('First sentence here. Second sentence is here. Third one.', 30)
    expect(parts[0]).toBe('First sentence here.')
    expect(parts.join(' ')).toBe('First sentence here. Second sentence is here. Third one.')
  })
})

describe('sermon notes blanks', () => {
  it('reveals one blank per step', () => {
    const slides = notesToSlides([{ text: { en: 'God is [[love]] and [[light]]' } }])
    expect(slides.length).toBe(3)
    expect(slides[0].text?.en).toBe('God is ______ and _______')
    expect(slides[1].text?.en).toBe('God is love and _______')
    expect(slides[2].text?.en).toBe('God is love and light')
  })
})

describe('pickLangs', () => {
  it('stacks both languages in the chosen order', () => {
    expect(pickLangs({ en: 'Hi', es: 'Hola' }, 'both', 'es-first')).toEqual({ primary: 'Hola', secondary: 'Hi' })
    expect(pickLangs({ en: 'Hi', es: 'Hola' }, 'en', 'es-first')).toEqual({ primary: 'Hi' })
    expect(pickLangs({ en: 'Hi' }, 'es', 'es-first')).toEqual({ primary: 'Hi' })
  })
})

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(3_725_000)).toBe('1:02:05')
    expect(formatClock(-5_000)).toBe('-0:05')
  })
})
