import { describe, expect, it } from 'vitest'
import { join, resolve } from 'node:path'
import { restoreTarget } from '../src/main/restorePath'

describe('restoreTarget (backup restore paths)', () => {
  const root = resolve('/church-data')

  it('writes backup entries into data/ and cache/presentations/', () => {
    expect(restoreTarget(root, 'data/songs.json')).toBe(join(root, 'data', 'songs.json'))
    expect(restoreTarget(root, 'cache/presentations/abc/1.png')).toBe(join(root, 'cache', 'presentations', 'abc', '1.png'))
  })

  it('skips anything that escapes the data folder (zip-slip)', () => {
    expect(restoreTarget(root, '../../ZIPSLIP-EVIL.txt')).toBeNull()
    expect(restoreTarget(root, 'data/../../ZIPSLIP-EVIL2.txt')).toBeNull()
    expect(restoreTarget(root, 'data\\..\\..\\evil.txt')).toBeNull()
  })

  it('skips entries that resolve next to the restore folders, not inside them', () => {
    expect(restoreTarget(root, 'data/../settings-evil.json')).toBeNull()
    expect(restoreTarget(root, 'cache/other/x.png')).toBeNull()
    expect(restoreTarget(root, 'datax/songs.json')).toBeNull()
    expect(restoreTarget(root, 'data')).toBeNull()
  })
})
