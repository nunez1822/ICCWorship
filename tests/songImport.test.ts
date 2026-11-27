import { describe, expect, it } from 'vite-plus/test'
import {
  detectAndParseSongFile,
  nameCopy,
  parseHeader,
  parsePlainSections,
  songFromChordPro,
  songFromOpenLyrics,
  songFromPlainText,
  songToOpenLyrics,
  type SongImportError
} from '@shared/songImport'
import { decodeText } from '@shared/textDecode'
import { songToSlides } from '@shared/slides'

describe('section headers', () => {
  it.each([
    ['Verse 1', 'verse', '1'],
    ['Verso 2', 'verse', '2'],
    ['[Chorus]', 'chorus', ''],
    ['Coro:', 'chorus', ''],
    ['Estribillo', 'chorus', ''],
    ['Puente', 'bridge', ''],
    ['Pre-Chorus', 'pre', ''],
    ['V2:', 'verse', '2'],
    ['C:', 'chorus', '']
  ])('%s', (line, type, num) => {
    expect(parseHeader(line)).toEqual({ type, num })
  })
  it('does not treat lyrics as headers', () => {
    expect(parseHeader('Coro de ángeles canta')).toBeNull()
    expect(parseHeader('C')).toBeNull()
  })
})

describe('plain text import', () => {
  it('detects headers and builds sections', () => {
    const secs = parsePlainSections('Verse 1\nline a\nline b\n\nChorus\nsing praise\nsing glory\n\nVerse 2\nline c')
    expect(secs.map((s) => s.label)).toEqual(['Verse 1', 'Chorus', 'Verse 2'])
    expect(secs[0].lines).toEqual(['line a', 'line b'])
  })

  it('finds the chorus by repetition when there are no headers', () => {
    const secs = parsePlainSections('v one\nv one b\n\nchorus x\nchorus y\n\nv two\n\nchorus x\nchorus y')
    expect(secs.map((s) => s.type)).toEqual(['verse', 'chorus', 'verse', 'chorus'])
  })

  it('pairs English and Spanish sections and builds an arrangement for repeats', () => {
    const en = 'Verse 1\nHello\n\nChorus\nPraise\n\nVerse 2\nWorld\n\nChorus\nPraise'
    const es = 'Verso 1\nHola\n\nCoro\nAlabanza\n\nVerso 2\nMundo\n\nCoro\nAlabanza'
    const song = songFromPlainText('Test', en, es)
    expect(song.sections.length).toBe(3)
    expect(song.sections[1]).toMatchObject({ type: 'chorus', en: 'Praise', es: 'Alabanza' })
    expect(song.arrangement.length).toBe(4)
    const slides = songToSlides(song)
    expect(slides.map((s) => s.text)).toEqual([
      { en: 'Hello', es: 'Hola' },
      { en: 'Praise', es: 'Alabanza' },
      { en: 'World', es: 'Mundo' },
      { en: 'Praise', es: 'Alabanza' }
    ])
  })
})

describe('ChordPro import', () => {
  it('reads metadata, sections and keeps chords', () => {
    const song = songFromChordPro(`{title: Amazing Grace}
{artist: John Newton}
{ccli: 22025}
{key: G}
{start_of_verse: Verse 1}
[G]Amazing grace how [C]sweet the sound
{end_of_verse}
{soc}
[D]My chains are gone
{eoc}`)
    expect(song.title).toBe('Amazing Grace')
    expect(song.author).toBe('John Newton')
    expect(song.ccli).toBe('22025')
    expect(song.key).toBe('G')
    expect(song.sections.map((s) => s.type)).toEqual(['verse', 'chorus'])
    expect(song.sections[0].en).toContain('[G]Amazing')
    expect(songToSlides(song)[0].text?.en).toBe('Amazing grace how sweet the sound')
  })
})

describe('OpenLyrics', () => {
  const xml = `<?xml version="1.0"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8">
<properties><titles><title lang="en">Holy</title><title lang="es">Santo</title></titles>
<authors><author>Someone</author></authors><copyright>Public Domain</copyright><ccliNo>123</ccliNo>
<verseOrder>v1 c1 v1</verseOrder></properties>
<lyrics>
<verse name="v1" lang="en"><lines>Line one<br/>Line two</lines></verse>
<verse name="v1" lang="es"><lines>Línea uno<br/>Línea dos</lines></verse>
<verse name="c1" lang="en"><lines><chord name="G"/>Chorus here</lines></verse>
</lyrics></song>`

  it('merges languages into bilingual sections', () => {
    const song = songFromOpenLyrics(xml)
    expect(song.title).toBe('Holy')
    expect(song.titleEs).toBe('Santo')
    expect(song.ccli).toBe('123')
    expect(song.author).toBe('Someone') // not "<author>Someone" (the <authors> wrapper must not match)
    expect(song.sections[0]).toMatchObject({ en: 'Line one\nLine two', es: 'Línea uno\nLínea dos', type: 'verse', label: 'Verse 1' })
    expect(song.sections[1].en).toBe('[G]Chorus here')
    expect(song.arrangement).toEqual(['v1', 'c1', 'v1'])
  })

  it('round-trips through export', () => {
    const song = songFromOpenLyrics(xml)
    const again = songFromOpenLyrics(songToOpenLyrics(song))
    expect(again.title).toBe('Holy')
    expect(again.titleEs).toBe('Santo')
    expect(again.author).toBe('Someone')
    expect(again.sections.map((s) => [s.en, s.es])).toEqual(song.sections.map((s) => [s.en, s.es]))
  })
})

describe('file import validation', () => {
  it('rejects broken, empty and foreign files instead of creating "Untitled" songs', () => {
    const code = (name: string, content: string) => {
      try {
        detectAndParseSongFile(name, content)
        return 'ok'
      } catch (e) {
        return (e as SongImportError).code
      }
    }
    expect(code('empty.xml', '')).toBe('empty')
    expect(code('broken.xml', '<?xml version="1.0"?><song><properties><titles><title>Broken')).toBe('damaged')
    expect(code('page.xml', '<?xml version="1.0"?><html><body>not a song</body></html>')).toBe('notSong')
    expect(code('nolyrics.chordpro', '{title: Only a title}')).toBe('noLyrics')
    expect(code('ok.chordpro', '{title: Fine}\n[G]Some words')).toBe('ok')
  })
})

describe('decodeText', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  it('reads UTF-8 with and without BOM', () => {
    expect(decodeText(enc('Señor'))).toBe('Señor')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('Señor')]))).toBe('Señor')
  })
  it('falls back to Windows-1252 for ANSI files', () => {
    expect(decodeText(new Uint8Array([0x53, 0x65, 0xf1, 0x6f, 0x72, 0x20, 0xa1]))).toBe('Señor ¡')
  })
  it('drops a UTF-8 BOM even when the rest falls back to Windows-1252', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x53, 0x65, 0xf1, 0x6f, 0x72]))).toBe('Señor')
  })
  it('reads UTF-16 LE by BOM', () => {
    const s = '¡Señor!'
    const b = new Uint8Array(2 + s.length * 2)
    b[0] = 0xff
    b[1] = 0xfe
    for (let i = 0; i < s.length; i++) {
      b[2 + i * 2] = s.charCodeAt(i) & 0xff
      b[3 + i * 2] = s.charCodeAt(i) >> 8
    }
    expect(decodeText(b)).toBe('¡Señor!')
  })
})

describe('binary files are not songs', () => {
  it('rejects a JPEG / MP4 decoded as text', () => {
    const jpg = decodeText(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01]))
    expect(() => detectAndParseSongFile('photo.txt', jpg)).toThrow()
    try {
      detectAndParseSongFile('video.txt', '\u0000\u0000\u0000 ftypisom\u0000\u0000\u0002\u0000isomiso2avc1mp41')
    } catch (e) {
      expect((e as SongImportError).code).toBe('notSong')
    }
  })
  it('still accepts normal lyrics with accents and tabs', () => {
    expect(detectAndParseSongFile('canto.txt', 'Señor, ¡te alabo!\n\tCon todo mi corazón').sections.length).toBe(1)
  })
})

describe('duplicate songs on import', () => {
  const lib = [
    { ...songFromPlainText('Amazing Grace', 'Amazing grace how sweet the sound'), id: 'a', ccli: '22025' },
    { ...songFromPlainText('Holy Holy Holy', 'Holy holy holy Lord God Almighty'), id: 'b' }
  ]
  it('matches the same CCLI number', async () => {
    const { findDuplicateSong } = await import('@shared/songImport')
    const s = { ...songFromPlainText('Sublime Gracia', 'Sublime gracia del Señor'), ccli: '22025' }
    expect(findDuplicateSong(s, lib)?.id).toBe('a')
  })
  it('matches title + first line, ignoring case, accents and punctuation', async () => {
    const { findDuplicateSong } = await import('@shared/songImport')
    expect(findDuplicateSong(songFromPlainText('holy, holy, holy!', 'Holy, holy, holy! Lord God Almighty'), lib)?.id).toBe('b')
  })
  it('does not match a different song that shares a title', async () => {
    const { findDuplicateSong } = await import('@shared/songImport')
    expect(findDuplicateSong(songFromPlainText('Holy Holy Holy', 'A completely different first line'), lib)).toBeUndefined()
  })
  it('names kept copies "(2)", "(3)"…', async () => {
    const { copyTitle } = await import('@shared/songImport')
    expect(copyTitle('Amazing Grace', ['Amazing Grace'])).toBe('Amazing Grace (2)')
    expect(copyTitle('Amazing Grace', ['Amazing Grace', 'amazing grace (2)'])).toBe('Amazing Grace (3)')
  })
})

describe('Keep both: copy names', () => {
  const es = (titleEs: string) => ({ ...songFromPlainText('x', 'line'), title: '', titleEs })
  it('two Spanish-only duplicates in one import get different names', () => {
    const taken = { titles: ['Amazing Grace'], titlesEs: ['Cuán Grande'] }
    const a = nameCopy(es('Cuán Grande'), taken)
    const b = nameCopy(es('Cuán Grande'), taken)
    expect([a.titleEs, b.titleEs]).toEqual(['Cuán Grande (2)', 'Cuán Grande (3)'])
    expect(a.title).toBe('')
  })
  it('songs with a main title are named by it', () => {
    const taken = { titles: ['Holy'], titlesEs: [] as string[] }
    const a = nameCopy({ ...songFromPlainText('Holy', 'line') }, taken)
    const b = nameCopy({ ...songFromPlainText('Holy', 'line') }, taken)
    expect([a.title, b.title]).toEqual(['Holy (2)', 'Holy (3)'])
  })
})

describe('OpenLyrics: one-language Spanish songs', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9">
  <properties><titles><title lang="es">Cuán Grande Es Él</title></titles></properties>
  <lyrics><verse name="v1" lang="es"><lines>Señor mi Dios</lines></verse></lyrics>
</song>`
  it('a Spanish-only title is not copied into the English title', () => {
    const song = songFromOpenLyrics(xml)
    expect(song.title).toBe('')
    expect(song.titleEs).toBe('Cuán Grande Es Él')
  })
  it('export writes no empty <title>, and the round trip keeps the titles', () => {
    const song = songFromOpenLyrics(xml)
    const out = songToOpenLyrics(song)
    expect(out).not.toMatch(/<title[^>]*><\/title>/)
    expect(out).toContain('<title lang="es">Cuán Grande Es Él</title>')
    const again = songFromOpenLyrics(out)
    expect([again.title, again.titleEs]).toEqual(['', 'Cuán Grande Es Él'])
  })
  it('a song with no title at all is exported under its first lyric line', () => {
    const song = songFromOpenLyrics(xml)
    song.titleEs = undefined
    const out = songToOpenLyrics(song)
    expect(out).toContain('<title>Señor mi Dios</title>')
    expect(songFromOpenLyrics(out).title).toBe('Señor mi Dios')
  })
})

describe('songFromChordPro language', () => {
  it('puts a Spanish song in the Español box, an English one in English', () => {
    const es = songFromChordPro('{title: Cuán grande}\n{soc}\nCuán grande es Él, cuán grande es Él\nMi corazón entona la canción\n{eoc}')
    expect(es.sections[0].es).toContain('Mi corazón')
    expect(es.sections[0].en).toBe('')
    const en = songFromChordPro('{title: Grace}\n{sov}\nAmazing grace how sweet the sound\nThat saved a wretch like me\n{eov}')
    expect(en.sections[0].en).toContain('Amazing grace')
  })
})
