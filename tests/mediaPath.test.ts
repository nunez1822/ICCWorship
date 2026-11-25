import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { resolveStoredPath } from '../src/main/mediaPath'

const root = join('C:', 'Users', 'NewPC', 'Documents', 'ICCWorship')
const here = (id: string, f: string) => join(root, 'cache', 'presentations', id, f)

describe('resolveStoredPath', () => {
  it('resolves slides stored relative to the data folder (1.1+)', () => {
    expect(resolveStoredPath(root, 'cache/presentations/abc/slide1.png', () => true)).toBe(here('abc', 'slide1.png'))
  })
  it('refuses relative paths that leave the data folder', () => {
    expect(resolveStoredPath(root, '../../secret.png', () => true)).toBeNull()
    expect(resolveStoredPath(root, '', () => true)).toBeNull()
  })
  it('finds 1.0 slides restored from another PC under this PC’s data folder', () => {
    const old = 'D:\\Users\\OldPC\\Documents\\ICCWorship\\cache\\presentations\\abc\\slide1.png'
    expect(resolveStoredPath(root, old, (f) => f === here('abc', 'slide1.png'))).toBe(here('abc', 'slide1.png'))
  })
  it('keeps other absolute paths (the church’s own media files) as they are', () => {
    const video = 'E:\\Videos\\intro.mp4'
    expect(resolveStoredPath(root, video, () => false)).toBe(video)
    // an image-folder presentation outside the data folder is never remapped
    expect(resolveStoredPath(root, 'E:\\Slides\\a.png', () => true)).toBe('E:\\Slides\\a.png')
  })
})
