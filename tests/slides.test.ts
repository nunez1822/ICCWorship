import { describe, expect, it } from 'vite-plus/test'
import { SAMPLE_SONGS } from '@shared/defaults'
import {
  countdownTarget,
  notesToSlides,
  pickLangs,
  scriptureToSlides,
  songToSlides,
  splitLongText,
  stripChords,
  formatClock,
  targetTimeToday,
  slidesTimingKey,
  timedSlideAt,
  upcomingSlideIndex
} from '@shared/slides'
import type { PassageResult, Slide, Song } from '@shared/types'

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

  it('one language only: a blank line starts a new slide (the editor says so)', () => {
    const s = song({
      linesPerSlide: 4,
      sections: [{ id: 'v1', type: 'verse', label: 'V', en: 'Line one\nLine two\n\nLine three\nLine four\n\nLine five\nLine six', es: '' }]
    })
    expect(songToSlides(s).map((x) => x.text)).toEqual([
      { en: 'Line one\nLine two', es: undefined },
      { en: 'Line three\nLine four', es: undefined },
      { en: 'Line five\nLine six', es: undefined }
    ])
    const es = song({ linesPerSlide: 4, sections: [{ id: 'v1', type: 'verse', label: 'V', en: '', es: 'Uno\nDos\n\nTres' }] })
    expect(songToSlides(es).map((x) => x.text)).toEqual([
      { en: undefined, es: 'Uno\nDos' },
      { en: undefined, es: 'Tres' }
    ])
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
    const slides = songToSlides(song({ title: 'Song', ccli: '123', sections: [{ id: 'a', type: 'verse', label: 'V', en: 'x', es: 'y' }] }), {
      ccliLicense: '999'
    })
    expect(slides[0].footer?.en).toContain('CCLI # 123')
    expect(slides[0].footer?.en).toContain('CCLI License / Licencia # 999')
    expect(slides[0].footer?.es).toBe(slides[0].footer?.en) // no Spanish title → same line
    expect(slides[0].footerCombined).toBe(true)
  })

  it('orders footer titles per language and never leaves a dangling slash', () => {
    const both = songToSlides(song({ title: 'Holy', titleEs: 'Santo', sections: [{ id: 'a', type: 'verse', label: 'V', en: 'x', es: 'y' }] }))[0].footer!
    expect(both.es).toBe('Santo / Holy')
    expect(both.en).toBe('Holy / Santo')
    const esOnly = songToSlides(song({ title: '', titleEs: 'Solo Español', sections: [{ id: 'a', type: 'verse', label: 'V', en: '', es: 'y' }] }))[0].footer!
    expect(esOnly.es).toBe('Solo Español')
    expect(esOnly.en).toBe('Solo Español')
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
  it('shows days for a countdown to a service days away', () => {
    expect(formatClock((3 * 86400 + 21 * 3600 + 37 * 60 + 49) * 1000)).toBe('3d 21:37:49')
    expect(formatClock(86400_000)).toBe('1d 00:00:00')
  })
})

describe('countdownTarget', () => {
  // Wednesday 2026-11-25 13:00 local time
  const now = new Date(2026, 10, 25, 13, 0).getTime()
  it("counts down to the plan's own date when it is still ahead", () => {
    expect(countdownTarget('11:00', '2026-11-29', now)).toBe(new Date(2026, 10, 29, 11, 0).getTime())
  })
  it('falls back to the next HH:MM for today, a template (no date) or an old plan', () => {
    expect(countdownTarget('14:00', '2026-11-25', now)).toBe(targetTimeToday('14:00', now))
    expect(countdownTarget('11:00', undefined, now)).toBe(targetTimeToday('11:00', now))
    expect(countdownTarget('11:00', '', now)).toBe(targetTimeToday('11:00', now))
    expect(countdownTarget('11:00', '2026-11-01', now)).toBe(targetTimeToday('11:00', now))
  })
})

describe('formatClock', () => {
  it('never shows -0:00 for a moment in the past', async () => {
    const { formatClock } = await import('@shared/slides')
    expect(formatClock(-400)).toBe('0:00')
    expect(formatClock(-1500)).toBe('-0:01')
    expect(formatClock(65_000)).toBe('1:05')
  })
})

describe('upcomingSlideIndex', () => {
  const slides = [1, 2, 3].map((n) => ({ id: String(n), kind: 'text' })) as unknown as Slide[]
  it('is the next slide while something is showing', () => {
    expect(upcomingSlideIndex({ slides, slideIndex: 0 })).toBe(1)
    expect(upcomingSlideIndex({ slides, slideIndex: 2 })).toBe(-1)
  })
  it('after Esc it is the slide that was cleared (what Space puts back)', () => {
    expect(upcomingSlideIndex({ slides, slideIndex: -1, clearedFrom: 2 })).toBe(2)
  })
  it('with nothing cleared it starts at the first slide', () => {
    expect(upcomingSlideIndex({ slides, slideIndex: -1 })).toBe(0)
    expect(upcomingSlideIndex({ slides, slideIndex: -1, clearedFrom: 9 })).toBe(0)
  })
})

describe('slidesTimingKey (does recorded timing still fit the slides?)', () => {
  const sec = (id: string, label: string, es: string) => ({ id, type: 'verse' as const, label, en: '', es })
  const base = song({ sections: [sec('a', 'V1', 'Uno\nDos\n\nTres\nCuatro'), sec('b', 'C', 'Coro\nCoro')] })
  const key = (s: Song) => slidesTimingKey(songToSlides(s, { ccliLicense: '123' }))
  it('stays the same when only words change (a typo fixed during worship) or the CCLI footer does', () => {
    const typo = song({ sections: [sec('a', 'V1', 'Uno\nDoss\n\nTres\nCuatro'), sec('b', 'C', 'Coro\nCoro')] })
    expect(key(typo)).toBe(key(base))
    expect(slidesTimingKey(songToSlides(base, { ccliLicense: '999' }))).toBe(key(base))
  })
  it('changes when the layout changes: order, lines per slide, a line more', () => {
    expect(key({ ...base, arrangement: ['b', 'a'] })).not.toBe(key(base))
    // (a paragraph longer than the lines per slide: one-language paragraphs are already slides of their own)
    const long = song({ sections: [sec('a', 'V1', 'Uno\nDos\nTres\nCuatro')] })
    expect(key({ ...long, linesPerSlide: 4 })).not.toBe(key(long))
    expect(key(song({ sections: [sec('a', 'V1', 'Uno\nDos\n\nTres\nCuatro'), sec('b', 'C', 'Coro\nCoro\nCoro')] }))).not.toBe(key(base))
  })
  it('is short', () => {
    expect(key(base)).toMatch(/^\d+-[0-9a-f]{1,8}$/)
  })
})

describe('timedSlideAt', () => {
  const t = [5, 9, 14]
  it('is −1 in the intro, then the slide whose start the music reached (a little early)', () => {
    expect(timedSlideAt(t, 0)).toBe(-1)
    expect(timedSlideAt(t, 4.7)).toBe(-1)
    expect(timedSlideAt(t, 4.85)).toBe(0)
    expect(timedSlideAt(t, 10)).toBe(1)
    expect(timedSlideAt(t, 99)).toBe(2)
    expect(timedSlideAt([0, 4], 0)).toBe(0)
    expect(timedSlideAt([], 3)).toBe(-1)
  })
})
