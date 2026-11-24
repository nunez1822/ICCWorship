import { describe, expect, it } from 'vitest'
import { parseHeader, parsePlainSections, songFromChordPro, songFromOpenLyrics, songFromPlainText, songToOpenLyrics } from '@shared/songImport'
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
    expect(song.sections[0]).toMatchObject({ en: 'Line one\nLine two', es: 'Línea uno\nLínea dos', type: 'verse', label: 'Verse 1' })
    expect(song.sections[1].en).toBe('[G]Chorus here')
    expect(song.arrangement).toEqual(['v1', 'c1', 'v1'])
  })

  it('round-trips through export', () => {
    const song = songFromOpenLyrics(xml)
    const again = songFromOpenLyrics(songToOpenLyrics(song))
    expect(again.title).toBe('Holy')
    expect(again.titleEs).toBe('Santo')
    expect(again.sections.map((s) => [s.en, s.es])).toEqual(song.sections.map((s) => [s.en, s.es]))
  })
})
