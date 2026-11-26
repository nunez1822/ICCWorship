import { describe, expect, it } from 'vitest'
import { filterSongs, songSecondTitle } from '@renderer/lib/songSearch'
import type { Song } from '@shared/types'

const song = (id: string, title: string, titleEs?: string, lyrics = ''): Song =>
  ({
    id,
    title,
    titleEs,
    tags: [],
    sections: [{ id: 's', label: 'V1', en: lyrics, es: '' }],
    arrangement: [],
    linesPerSlide: 2,
    createdAt: 0,
    updatedAt: 0
  }) as unknown as Song

describe('song search with one-language songs', () => {
  const songs = [song('ag', 'Amazing Grace'), song('cg', '', 'Cuán Grande Es Él'), song('x', 'Zion', undefined, 'oh cuan bello')]
  it('sorts a Spanish-only song by its Spanish title', () => {
    expect(filterSongs(songs, '').map((s) => s.id)).toEqual(['ag', 'cg', 'x'])
  })
  it('a prefix of the Spanish title ranks first', () => {
    expect(filterSongs(songs, 'cuan')[0].id).toBe('cg')
  })
  it('a prefix of the second title also counts as a title prefix', () => {
    const both = [song('lyr', 'Alpha', undefined, 'grande'), song('bi', 'How Great', 'Grande Es')]
    expect(filterSongs(both, 'grande')[0].id).toBe('bi')
  })
  it('shows the Spanish title second only when there is a main title', () => {
    expect(songSecondTitle({ title: '', titleEs: 'Cuán Grande' })).toBe('')
    expect(songSecondTitle({ title: 'How Great', titleEs: 'Cuán Grande' })).toBe('Cuán Grande')
  })
})
