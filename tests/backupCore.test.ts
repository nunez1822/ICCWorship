import { describe, expect, it } from 'vite-plus/test'
import {
  autoBackupDecision,
  autoBackupsToDelete,
  checkManifest,
  isTransientCopy,
  keptOnRestore,
  makeManifest,
  mergeRestoredSettings,
  mustParseOnRestore,
  parseAutoName,
  restoredMeta,
  safetyBackupsToDelete,
  staleBackupTemps
} from '../src/shared/backupCore'
import { checkSchema, runMigrations, SCHEMA_VERSION, type Migration } from '@shared/migrations'

describe('backup manifest', () => {
  it('accepts backups from 1.0 and from now', () => {
    expect(checkManifest({ app: 'ICCWorship', version: 1, createdAt: 'x' })).toEqual({ ok: true, format: 1, schemaVersion: undefined })
    expect(checkManifest(makeManifest('1.1.0'))).toEqual({ ok: true, format: 1, schemaVersion: SCHEMA_VERSION })
    expect(makeManifest('1.1.0').schemaVersion).toBe(SCHEMA_VERSION)
  })
  it('refuses other files and backups made by a newer layout', () => {
    expect(checkManifest(null)).toEqual({ ok: false, error: 'not-a-backup' })
    expect(checkManifest({ app: 'Other' })).toEqual({ ok: false, error: 'not-a-backup' })
    expect(checkManifest({ app: 'ICCWorship', format: 99 })).toEqual({ ok: false, error: 'newer-format' })
    expect(checkManifest({ app: 'ICCWorship', format: 1, schemaVersion: SCHEMA_VERSION + 1 })).toEqual({ ok: false, error: 'newer-schema' })
  })
})

describe('automatic backup retention', () => {
  it('reads old daily names and new hourly names', () => {
    expect(parseAutoName('auto-2026-11-24.zip')).toEqual({ day: '2026-11-24', time: '0000' })
    expect(parseAutoName('auto-2026-11-24-0930.zip')).toEqual({ day: '2026-11-24', time: '0930' })
    expect(parseAutoName('auto-2026-11-24.zip.tmp')).toBeNull() // a half-written file is not "today's backup"
    expect(parseAutoName('before-restore-x.zip')).toBeNull()
  })
  it('keeps the newest per day for 14 days plus the 6 most recent', () => {
    const names: string[] = []
    for (let d = 1; d <= 20; d++) for (const t of ['0900', '1000', '1100']) names.push(`auto-2026-11-${String(d).padStart(2, '0')}-${t}.zip`)
    const del = new Set(autoBackupsToDelete(names))
    const kept = names.filter((n) => !del.has(n))
    // last 6 hourly: day 20 (3) + day 19 (3); then the newest of days 18 … 7 (14 days in all)
    expect(kept).toContain('auto-2026-11-20-0900.zip')
    expect(kept).toContain('auto-2026-11-19-0900.zip')
    expect(kept).toContain('auto-2026-11-07-1100.zip')
    expect(kept).not.toContain('auto-2026-11-07-0900.zip')
    expect(kept).not.toContain('auto-2026-11-06-1100.zip')
    expect(kept.length).toBe(6 + 12)
  })
  it('never deletes files that are not automatic backups', () => {
    expect(autoBackupsToDelete(['ICCWorship-backup-x.zip', 'before-restore-x.zip', 'notes.txt'])).toEqual([])
  })
})

describe('safety backups', () => {
  it('keeps the newest 5 of each kind, by date', () => {
    const files = [
      ...Array.from({ length: 8 }, (_, i) => ({ name: `before-restore-${i}.zip`, mtime: i })),
      { name: 'before-migrate-1.zip', mtime: 0 },
      { name: 'auto-2026-11-01.zip', mtime: 0 }
    ]
    expect(safetyBackupsToDelete(files).sort()).toEqual(['before-restore-0.zip', 'before-restore-1.zip', 'before-restore-2.zip'])
  })
})

describe('restoring settings from another PC', () => {
  it('keeps this computer’s screen, server, PIN and update settings', () => {
    const merged = mergeRestoredSettings(
      { churchName: 'Old', remotePin: '', serverPort: 9000, outputDisplayId: 5, uiLang: 'en' },
      { churchName: 'New', remotePin: '123456', serverPort: 7272, disableHwAccel: true }
    )
    expect(merged).toEqual({ churchName: 'Old', uiLang: 'en', remotePin: '123456', serverPort: 7272, disableHwAccel: true })
  })
  it('keeps this computer’s sound output (another PC has other speakers)', () => {
    const merged = mergeRestoredSettings(
      { churchName: 'Old', audioOutputId: 'abc', audioOutputLabel: 'Speakers (Old PC)' },
      { churchName: 'New', audioOutputId: 'xyz', audioOutputLabel: 'Line out (Sound desk)' }
    )
    expect(merged).toEqual({ churchName: 'Old', audioOutputId: 'xyz', audioOutputLabel: 'Line out (Sound desk)' })
    expect(mergeRestoredSettings({ audioOutputId: 'abc', audioOutputLabel: 'Old' }, {})).toEqual({})
  })
})

describe('schema versions and migrations', () => {
  it('knows old, current and newer data', () => {
    expect(checkSchema(undefined)).toEqual({ kind: 'migrate', from: 0 })
    expect(checkSchema(SCHEMA_VERSION)).toEqual({ kind: 'current' })
    expect(checkSchema(SCHEMA_VERSION + 1)).toEqual({ kind: 'newer', version: SCHEMA_VERSION + 1 })
    expect(checkSchema('junk')).toEqual({ kind: 'migrate', from: 0 })
  })
  it('runs only the needed migrations, in order, and stamps the version last', () => {
    const files: Record<string, unknown> = { meta: { seeded: 1 }, songs: [{ id: 'a' }] }
    const ctx = { read: (n: string) => files[n], write: (n: string, v: unknown) => (files[n] = v) }
    const order: number[] = []
    const ms: Migration[] = [
      { to: 3, describe: 'c', run: () => order.push(3) },
      { to: 1, describe: 'a', run: () => order.push(1) },
      { to: 2, describe: 'b', run: (c) => (order.push(2), c.write('songs', [{ id: 'a', x: 1 }])) }
    ]
    expect(runMigrations(ctx, 1, ms, 3)).toEqual(['2: b', '3: c'])
    expect(order).toEqual([2, 3])
    expect(files.meta).toEqual({ seeded: 1, schemaVersion: 3 })
    expect(files.songs).toEqual([{ id: 'a', x: 1 }])
  })
})

describe('restore file rules', () => {
  it('never restores .tmp / .bak copies', () => {
    expect(isTransientCopy('data/songs.json.bak')).toBe(true)
    expect(isTransientCopy('data/songs.json.tmp')).toBe(true)
    expect(isTransientCopy('data/songs.json')).toBe(false)
  })

  it('checks every data .json, Bibles in sub-folders included', () => {
    expect(mustParseOnRestore('data/songs.json')).toBe(true)
    expect(mustParseOnRestore('data\\bibles\\placeholder.json')).toBe(true)
    expect(mustParseOnRestore('data/bibles/placeholder.json')).toBe(true)
    expect(mustParseOnRestore('data/songs.json.corrupt-2026-01-01')).toBe(false)
    expect(mustParseOnRestore('cache/presentations/abc/page001.png')).toBe(false)
    expect(mustParseOnRestore('cache\\presentations\\abc\\x.json')).toBe(false)
  })

  it('removes leftover .bak copies but keeps kept-aside .corrupt copies and saves in progress', () => {
    // a .bak left behind would be read when its .json is missing: the pre-restore data would come back
    expect(keptOnRestore('data/usage.json.bak')).toBe(false)
    expect(keptOnRestore('data/usage.json')).toBe(false)
    expect(keptOnRestore('data/songs.json.corrupt-2026-01-01T10-00-00-000Z')).toBe(true)
    expect(keptOnRestore('data/songs.json.tmp')).toBe(true)
  })
})

describe('restored meta', () => {
  it('a backup without meta.json is marked seeded (never a first run: custom themes stay)', () => {
    expect(restoredMeta(undefined, 1, 123)).toEqual({ seeded: 123, schemaVersion: 1 })
    expect(restoredMeta(null, 1, 123)).toEqual({ seeded: 123, schemaVersion: 1 })
    expect(restoredMeta([], 1, 123)).toEqual({ seeded: 123, schemaVersion: 1 })
  })

  it('keeps what the backup recorded and stamps the current schema', () => {
    expect(restoredMeta({ schemaVersion: 1 }, 1, 123)).toEqual({ seeded: 123, schemaVersion: 1 })
    expect(restoredMeta({ seeded: 5, schemaVersion: 0, other: 'x' }, 1, 123)).toEqual({ seeded: 5, schemaVersion: 1, other: 'x' })
  })

  it('leaves a complete meta.json alone', () => {
    expect(restoredMeta({ seeded: 5, schemaVersion: 1 }, 1, 123)).toBeNull()
  })
})

describe('automatic backup decision', () => {
  it('backs up at start-up unless today already has one (then that is the baseline)', () => {
    expect(autoBackupDecision(false, 0, -1)).toBe('backup')
    expect(autoBackupDecision(true, 5, -1)).toBe('baseline')
  })

  it('later runs only when something was saved — a new day alone is not enough', () => {
    expect(autoBackupDecision(true, 5, 5)).toBe('skip')
    expect(autoBackupDecision(false, 5, 5)).toBe('skip') // left open past midnight, nothing changed
    expect(autoBackupDecision(false, 6, 5)).toBe('backup')
    expect(autoBackupDecision(true, 6, 5)).toBe('backup')
  })
})

describe('leftover backup temp files', () => {
  it('removes only old .zip.tmp files (a backup being written now is left alone)', () => {
    const now = 10 * 60 * 60_000
    const files = [
      { name: 'auto-2026-11-24-0930.zip.tmp', mtime: now - 2 * 60 * 60_000 },
      { name: 'auto-2026-11-25-1030.zip.tmp', mtime: now - 60_000 },
      { name: 'auto-2026-11-24-0930.zip', mtime: 0 },
      { name: 'notes.tmp', mtime: 0 }
    ]
    expect(staleBackupTemps(files, now)).toEqual(['auto-2026-11-24-0930.zip.tmp'])
  })
})
