import { describe, expect, it } from 'vite-plus/test'
import {
  isLibraryFileName,
  isLibraryPath,
  libraryFileName,
  libraryFileToDelete,
  THEME_FALLBACK_BACKGROUND,
  themesWithoutBackground
} from '@shared/mediaLibrary'
import type { Theme } from '@shared/types'

describe('libraryFileName', () => {
  it('names a copy after its id, keeping the media extension', () => {
    expect(libraryFileName('a1b2', 'C:\\Videos\\Bienvenida.MP4')).toBe('a1b2.mp4')
    expect(libraryFileName('x', '/home/u/logo.png')).toBe('x.png')
  })
  it('refuses non-media files and unsafe ids', () => {
    expect(libraryFileName('a1', 'C:\\docs\\notes.txt')).toBeNull()
    expect(libraryFileName('a1', 'C:\\noext')).toBeNull()
    expect(libraryFileName('../x', 'C:\\a.mp4')).toBeNull()
  })
})

describe('isLibraryFileName / isLibraryPath', () => {
  it('only <id>.<media ext> directly in media/', () => {
    expect(isLibraryFileName('a1b2.mp4')).toBe(true)
    expect(isLibraryFileName('a1b2.exe')).toBe(false)
    expect(isLibraryFileName('..mp4')).toBe(false)
    expect(isLibraryPath('media/a1b2.jpg')).toBe(true)
    expect(isLibraryPath('media\\a1b2.jpg')).toBe(true)
    expect(isLibraryPath('media/sub/a1b2.jpg')).toBe(false)
    expect(isLibraryPath('C:\\Videos\\a.mp4')).toBe(false)
    expect(isLibraryPath(undefined)).toBe(false)
  })
})

describe('libraryFileToDelete', () => {
  const item = { id: 'm1', path: 'media/m1.mp4' }
  const none = { media: [], logoPath: '' }
  it('deletes the copy of a deleted item nothing else shows', () => {
    expect(libraryFileToDelete(item, none)).toBe('media/m1.mp4')
  })
  it('never deletes a linked file (the church’s own folders)', () => {
    expect(libraryFileToDelete({ id: 'm1', path: 'C:\\Videos\\m1.mp4' }, none)).toBeNull()
  })
  it('keeps a copy still used by another item, the logo, a plan slide or the screen', () => {
    expect(libraryFileToDelete(item, { ...none, media: [{ id: 'm2', path: 'media/m1.mp4' }] })).toBeNull()
    expect(libraryFileToDelete(item, { ...none, logoPath: 'media/m1.mp4' })).toBeNull()
    // an announcement slide keeps the picture's media:// URL
    const plans = [{ items: [{ slides: [{ text: { es: 'x' }, media: 'media://local/media%2Fm1.mp4' }] }] }]
    expect(libraryFileToDelete(item, { ...none, elsewhere: [plans] })).toBeNull()
    // playing on the projector right now
    expect(libraryFileToDelete(item, { ...none, elsewhere: [[], { video: { src: 'media://local/media%2FM1.MP4' } }] })).toBeNull()
    // the item itself (still in the list) doesn't count
    expect(libraryFileToDelete(item, { ...none, media: [item] })).toBe('media/m1.mp4')
    // another file in the plans doesn't hold it
    expect(libraryFileToDelete(item, { ...none, elsewhere: [[{ media: 'media://local/media%2Fm2.mp4' }]] })).toBe('media/m1.mp4')
  })
  it('keeps a copy another item, the logo or a presentation links to by its full path in the data folder', () => {
    const abs = 'C:\\Users\\x\\Documents\\ICCWorship\\media\\m1.mp4'
    expect(libraryFileToDelete(item, { ...none, media: [{ id: 'm2', path: abs }] })).toBeNull()
    expect(libraryFileToDelete(item, { ...none, logoPath: abs })).toBeNull()
    expect(libraryFileToDelete(item, { ...none, elsewhere: [[], [{ slides: [{ image: abs }] }]] })).toBeNull()
  })
})

describe('themesWithoutBackground (a removed picture or video behind a theme)', () => {
  const url = 'media://local/' + encodeURIComponent('media/abc.jpg')
  const theme = (id: string, background: Theme['background']) => ({ id, name: id, background }) as unknown as Theme
  it('gives the built-in gradient to the themes that used that file, keeping their dim', () => {
    const out = themesWithoutBackground([theme('a', { type: 'image', value: url, dim: 0.5 }), theme('b', { type: 'color', value: '#000' })], url)!
    expect(out[0].background).toEqual({ ...THEME_FALLBACK_BACKGROUND, dim: 0.5 })
    expect(out[1].background).toEqual({ type: 'color', value: '#000' })
  })
  it('null when no theme used it (nothing to save)', () => {
    expect(themesWithoutBackground([theme('a', { type: 'video', value: 'media://local/other.mp4' })], url)).toBeNull()
  })
})
