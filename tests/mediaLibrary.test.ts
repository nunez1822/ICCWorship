import { describe, expect, it } from 'vite-plus/test'
import { isLibraryFileName, isLibraryPath, libraryFileName, libraryFileToDelete } from '@shared/mediaLibrary'

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
  const none = { media: [], themes: [], logoPath: '' }
  it('deletes the copy of a deleted item nothing else shows', () => {
    expect(libraryFileToDelete(item, none)).toBe('media/m1.mp4')
  })
  it('never deletes a linked file (the church’s own folders)', () => {
    expect(libraryFileToDelete({ id: 'm1', path: 'C:\\Videos\\m1.mp4' }, none)).toBeNull()
  })
  it('keeps a copy still used by another item, a theme background or the logo', () => {
    expect(libraryFileToDelete(item, { ...none, media: [{ id: 'm2', path: 'media/m1.mp4' }] })).toBeNull()
    expect(libraryFileToDelete(item, { ...none, themes: [{ background: { type: 'video', value: 'media://local/media%2Fm1.mp4' } }] })).toBeNull()
    expect(libraryFileToDelete(item, { ...none, logoPath: 'media/m1.mp4' })).toBeNull()
    // the item itself (still in the list) doesn't count
    expect(libraryFileToDelete(item, { ...none, media: [item] })).toBe('media/m1.mp4')
    // a color background or a broken URL doesn't hold it
    expect(
      libraryFileToDelete(item, {
        ...none,
        themes: [{ background: { type: 'color', value: '#000' } }, { background: { type: 'image', value: 'media://local/%E0%A4' } }]
      })
    ).toBe('media/m1.mp4')
  })
})
