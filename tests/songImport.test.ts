import { describe, expect, it } from 'vitest'
import { detectAndParseSongFile, parseHeader, parsePlainSections, songFromChordPro, songFromOpenLyrics, songFromPlainText, songToOpenLyrics, type SongImportError } from '@shared/songImport'
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
