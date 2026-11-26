import { describe, expect, it } from 'vite-plus/test'
import { join } from 'node:path'
import { newPin, within } from '../src/main/pathGuard'
import { redact } from '../src/main/log'
import { setMainLang, t } from '../src/main/i18n'

describe('within', () => {
  const root = join('C:', 'Users', 'Ana', 'Documents', 'ICCWorship', 'cache', 'presentations')
  it('accepts paths inside the folder, in any letter case', () => {
    expect(within(root, join(root, 'abc123'))).toBe(true)
    expect(within(root, join(root, 'abc', 'page001.png'))).toBe(true)
    expect(within(root, join(root.toUpperCase(), 'abc'))).toBe(true)
  })
  it('rejects the folder itself and anything outside it', () => {
    expect(within(root, root)).toBe(false) // db:remove('presentations', '') must not wipe the whole cache
    expect(within(root, join(root, ''))).toBe(false)
    expect(within(root, join(root, '.'))).toBe(false)
    expect(within(root, join(root, '..'))).toBe(false)
    expect(within(root, join(root, '..', '..', 'data'))).toBe(false)
    expect(within(root, join(root + 'x', 'a'))).toBe(false) // a sibling whose name starts the same
    expect(within(root, 'D:\\elsewhere')).toBe(false)
  })
})

describe('newPin', () => {
  it('is always 6 digits', () => {
    for (let i = 0; i < 200; i++) expect(newPin()).toMatch(/^\d{6}$/)
  })
  it('varies', () => {
    expect(new Set(Array.from({ length: 50 }, newPin)).size).toBeGreaterThan(40)
  })
})

describe('log redaction', () => {
  const roots = { data: 'C:\\Users\\Ana Pérez\\Documents\\ICCWorship', home: 'C:\\Users\\Ana Pérez' }
  it('hides the data folder and the user name, in either slash style and any case', () => {
    expect(redact('could not save C:\\Users\\Ana Pérez\\Documents\\ICCWorship\\data\\songs.json', roots)).toBe('could not save <data>/data/songs.json')
    expect(redact('file c:/users/ana pérez/Videos/a.mp4', roots)).toBe('file %USERPROFILE%/Videos/a.mp4')
  })
  it('keeps lines on one line and short', () => {
    expect(redact('a\nb\r\nc', roots)).toBe('a b c')
    expect(redact('x'.repeat(1000), roots).length).toBeLessThanOrEqual(301)
  })
})

describe('main-process translations', () => {
  it('uses the chosen language, with English as a fallback', () => {
    setMainLang('es')
    expect(t('menu.help')).toBe('Ayuda')
    setMainLang('en')
    expect(t('menu.help')).toBe('Help')
    expect(t('no.such.key')).toBe('no.such.key')
  })
  it('interpolates variables and picks plural forms', () => {
    setMainLang('en')
    expect(t('remote.locked', { seconds: 30 })).toContain('30')
    expect(t('settings.autoBackups', { count: 1 })).not.toBe(t('settings.autoBackups', { count: 2 }))
  })
})
