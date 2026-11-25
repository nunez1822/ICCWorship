import { describe, expect, it } from 'vitest'
import { autoBackupsToDelete, checkManifest, makeManifest, mergeRestoredSettings, parseAutoName, safetyBackupsToDelete } from '../src/main/backupCore'
import { checkSchema, runMigrations, SCHEMA_VERSION, type Migration } from '@shared/migrations'

describe('backup manifest', () => {
  it('accepts backups from 1.0 and from now', () => {
    expect(checkManifest({ app: 'ICCWorship', version: 1, createdAt: 'x' })).toEqual({ ok: true, format: 1 })
    expect(checkManifest(makeManifest('1.1.0'))).toEqual({ ok: true, format: 1 })
    expect(makeManifest('1.1.0').schemaVersion).toBe(SCHEMA_VERSION)
  })
  it('refuses other files and backups made by a newer layout', () => {
    expect(checkManifest(null)).toEqual({ ok: false, error: 'not-a-backup' })
    expect(checkManifest({ app: 'Other' })).toEqual({ ok: false, error: 'not-a-backup' })
    expect(checkManifest({ app: 'ICCWorship', format: 99 })).toEqual({ ok: false, error: 'newer-format' })
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
