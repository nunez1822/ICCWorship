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
  staleBackupTemps,
  staleTrackTemps,
  trackMirrorPlan,
  backupRoom,
  MAX_BACKUP_BYTES,
  settingsForBackup
} from '../src/shared/backupCore'
import { checkSchema, MIGRATIONS, runMigrations, SCHEMA_VERSION, type Migration } from '@shared/migrations'
import { isLibraryFileName } from '@shared/mediaLibrary'

describe('backup manifest', () => {
  it('accepts backups from 1.0 and from now', () => {
    expect(checkManifest({ app: 'ICCWorship', version: 1, createdAt: 'x' })).toEqual({
      ok: true,
      format: 1,
      schemaVersion: undefined,
      hasTracks: false,
      hasMedia: false
    })
    expect(checkManifest(makeManifest('1.1.0'))).toEqual({ ok: true, format: 1, schemaVersion: SCHEMA_VERSION, hasTracks: false, hasMedia: false })
    expect(makeManifest('1.1.0').schemaVersion).toBe(SCHEMA_VERSION)
  })
  it('says whether the backup holds the backing tracks (only then does a restore replace tracks/)', () => {
    expect(makeManifest('1.2.0', true).hasTracks).toBe(true)
    expect(checkManifest(makeManifest('1.2.0', true))).toMatchObject({ ok: true, hasTracks: true })
    // 1.1 backups, and an older version's backup of newer data, have no such field: tracks/ is left alone
    expect(checkManifest({ app: 'ICCWorship', format: 1, schemaVersion: 1 })).toMatchObject({ ok: true, hasTracks: false })
    expect(checkManifest({ app: 'ICCWorship', format: 1, hasTracks: 'yes' })).toMatchObject({ ok: true, hasTracks: false })
    expect(checkManifest(makeManifest('1.2.0', true, new Date(), true))).toMatchObject({ ok: true, hasTracks: true, hasMedia: true })
    expect(checkManifest({ app: 'ICCWorship', format: 1, hasMedia: 1 })).toMatchObject({ ok: true, hasMedia: false })
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
  it('keeps only the newest 2 that hold every backing track (they can be GBs)', () => {
    const files = [
      { name: 'before-restore-tracks-a.zip', mtime: 1 },
      { name: 'before-restore-tracks-b.zip', mtime: 2 },
      { name: 'before-restore-x.zip', mtime: 3 },
      { name: 'before-restore-tracks-c.zip', mtime: 4 },
      { name: 'before-migrate-1.zip', mtime: 5 }
    ]
    expect(safetyBackupsToDelete(files)).toEqual(['before-restore-tracks-a.zip'])
    // they don't take the places of the data-only ones: 5 of those stay as well
    const many = Array.from({ length: 6 }, (_, i) => ({ name: `before-restore-${i}.zip`, mtime: i + 10 }))
    expect(safetyBackupsToDelete([...files, ...many]).sort()).toEqual(['before-restore-0.zip', 'before-restore-tracks-a.zip', 'before-restore-x.zip'])
  })
})

describe('room for a backup', () => {
  const MB = 1024 * 1024
  it('needs the files plus the reserve free on that disk', () => {
    expect(backupRoom(100 * MB, 500 * MB, 300 * MB)).toBe('ok')
    expect(backupRoom(100 * MB, 399 * MB, 300 * MB)).toBe('no-space')
    expect(backupRoom(100 * MB, 101 * MB, 0)).toBe('ok')
  })
  it('refuses what no .zip can hold (no Zip64), whatever the free space', () => {
    expect(backupRoom(MAX_BACKUP_BYTES + 1, Infinity, 0)).toBe('too-large')
    expect(MAX_BACKUP_BYTES).toBeLessThan(2 ** 32)
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

describe('backing tracks kept beside the backups', () => {
  it('copies new tracks once, and retires the ones the church deleted', () => {
    expect(trackMirrorPlan(['a-1.ogg', 'b-2.ogg', 'junk.txt'], ['a-1.ogg', 'c-3.ogg'], [], '2026-11-26', new Set(['a-1.ogg', 'b-2.ogg']))).toEqual({
      copy: ['b-2.ogg'],
      retire: ['c-3.ogg'],
      dropDirs: []
    })
  })
  it('never retires the copy of a track a song still uses, even when tracks/ lost the file', () => {
    // antivirus, a sync problem or a tidy-up removed d-4.ogg from tracks/: the copy here is the only one left
    const plan = trackMirrorPlan(['a-1.ogg'], ['a-1.ogg', 'c-3.ogg', 'd-4.ogg'], [], '2026-11-26', new Set(['a-1.ogg', 'd-4.ogg']))
    expect(plan.retire).toEqual(['c-3.ogg'])
  })
  it('retires nothing when the songs list may be incomplete (damaged, recovered, just seeded)', () => {
    expect(trackMirrorPlan([], ['a-1.ogg', 'c-3.ogg'], [], '2026-11-26', null).retire).toEqual([])
    // still copies new tracks and drops old gone- folders
    const plan = trackMirrorPlan(['b-2.ogg'], [], ['gone-2026-11-01'], '2026-11-26', null)
    expect(plan.copy).toEqual(['b-2.ogg'])
    expect(plan.dropDirs).toEqual(['gone-2026-11-01'])
  })
  it('finds the half-written track copies a power cut left behind (a day old), never one being written', () => {
    const now = Date.UTC(2026, 10, 26)
    const day = 24 * 60 * 60_000
    const files = [
      { name: 'a-1.ogg.tmp', mtime: now - 2 * day },
      { name: 'b-2.ogg.tmp', mtime: now - 60_000 },
      { name: 'c-3.ogg', mtime: now - 9 * day },
      { name: 'notes.txt.tmp', mtime: now - 9 * day },
      { name: 'D-4.OGG.TMP', mtime: now - 9 * day }
    ]
    expect(staleTrackTemps(files, now)).toEqual(['a-1.ogg.tmp'])
    // media/: a cut-off library copy (<id>.<ext>.tmp), with the library's own name rule
    const media = [
      { name: 'f00d.mp4.tmp', mtime: now - 2 * day },
      { name: 'f00e.mp4.tmp', mtime: now - 60_000 },
      { name: 'notes.txt.tmp', mtime: now - 9 * day }
    ]
    expect(staleTrackTemps(media, now, undefined, isLibraryFileName)).toEqual(['f00d.mp4.tmp'])
  })
  it('keeps a deleted track 15 days (automatic backups go back 14), then lets it go', () => {
    const dirs = ['gone-2026-11-10', 'gone-2026-11-11', 'gone-2026-11-26', 'other', 'gone-junk']
    expect(trackMirrorPlan([], [], dirs, '2026-11-26', new Set()).dropDirs).toEqual(['gone-2026-11-10'])
    expect(trackMirrorPlan([], [], ['gone-2026-02-10'], '2026-03-01', new Set()).dropDirs).toEqual(['gone-2026-02-10'])
  })
})

describe('schema versions and migrations', () => {
  it('upgrades schema 1 data (1.1) to schema 2 without changing songs or plans', () => {
    const songs = [{ id: 's', title: 'x' }]
    const files: Record<string, unknown> = { meta: { seeded: 1, schemaVersion: 1 }, songs }
    const done = runMigrations({ read: (n) => files[n], write: (n, v) => (files[n] = v) }, 1, MIGRATIONS, 2)
    expect(done).toEqual(['2: songs may have a backing track (tracks/ folder)'])
    expect(files.songs).toBe(songs)
    expect(files.meta).toEqual({ seeded: 1, schemaVersion: 2 })
    expect(SCHEMA_VERSION).toBe(2)
  })
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

describe('settingsForBackup (settings.json inside a backup)', () => {
  it('leaves out the remote PIN and keeps everything else', () => {
    const out = JSON.parse(settingsForBackup(JSON.stringify({ churchName: 'Iglesia', remotePin: '123456', uiLang: 'es' })))
    expect(out).toEqual({ churchName: 'Iglesia', uiLang: 'es' })
  })
  it('keeps a file it can not parse as it is (the church data comes first), and one with no PIN untouched', () => {
    expect(settingsForBackup('{ not json')).toBe('{ not json')
    expect(settingsForBackup('{"a":1}')).toBe('{"a":1}')
  })
  it('reads a file saved with a byte-order mark', () => {
    expect(JSON.parse(settingsForBackup(String.fromCharCode(0xfeff) + '{"remotePin":"1","a":2}'))).toEqual({ a: 2 })
  })
})
