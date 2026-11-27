/**
 * Write a file so that a power cut or crash leaves either the old version or the new one — never half of each.
 * The data goes to "<file>.tmp", is flushed to the disk, and then replaces the file in one rename.
 * (No Electron imports: tests/jsonStore.test.ts and tests/atomicWrite.test.ts use this in plain Node.)
 */
import { createWriteStream, existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { copyFile, open, rename, unlink, writeFile } from 'node:fs/promises'
import type { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { resolve } from 'node:path'

/** Windows antivirus / backup / sync tools briefly lock new files: these errors are worth a short retry */
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_TRIES = 3
const RENAME_RETRY_MS = 50

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** rename, with a few quick tries while antivirus or a sync tool holds the file (callers retry later on their own) */
export function renameSyncWithRetry(from: string, to: string): void {
  for (let i = 1; ; i++) {
    try {
      renameSync(from, to)
      return
    } catch (e) {
      if (i >= RENAME_TRIES || !LOCKED.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      sleepSync(RENAME_RETRY_MS)
    }
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await rename(from, to)
      return
    } catch (e) {
      if (i >= RENAME_TRIES || !LOCKED.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      await new Promise((r) => setTimeout(r, RENAME_RETRY_MS))
    }
  }
}

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  const tmp = file + '.tmp'
  try {
    // flush: true → fsync before the rename, so the new content is really on disk first
    writeFileSync(tmp, data, typeof data === 'string' ? { encoding: 'utf8', flush: true } : { flush: true })
    renameSyncWithRetry(tmp, file)
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** the .tmp files being written right now (the sweep of .tmp files left by a crash must leave these alone) */
const writing = new Set<string>()
export const isBeingWritten = (tmp: string): boolean => writing.has(resolve(tmp).toLowerCase())

/** `<file>.tmp` → done(tmp) → renamed over `file`; the .tmp is removed when anything fails */
async function viaTemp(file: string, done: (tmp: string) => Promise<void>): Promise<void> {
  const tmp = file + '.tmp'
  const key = resolve(tmp).toLowerCase()
  writing.add(key)
  try {
    await done(tmp)
    await renameWithRetry(tmp, file)
  } catch (e) {
    await unlink(tmp).catch(() => {})
    throw e
  } finally {
    writing.delete(key)
  }
}

/** Same, without blocking the main process (large files such as backup zips). */
export function writeFileAtomicAsync(file: string, data: string | Uint8Array): Promise<void> {
  return viaTemp(file, (tmp) => writeFile(tmp, data, { flush: true }))
}

/** Copy a file the same way (a backing track can be 60 MB): copied to .tmp, flushed to the disk, then renamed. */
export function copyFileAtomic(from: string, to: string): Promise<void> {
  return viaTemp(to, async (tmp) => {
    await copyFile(from, tmp)
    const fh = await open(tmp, 'r+')
    try {
      // Windows' copy keeps the source's date: date the copy now, so it is never taken for a .tmp left by a crash
      // long ago (see staleTrackTemps)
      const now = new Date()
      await fh.utimes(now, now)
      await fh.sync()
    } finally {
      await fh.close()
    }
  })
}

/**
 * Write a stream the same way — what it carries is never all in memory at once (a backup .zip with every backing
 * track can be GBs). `through`: streams the data passes on its way (checks, unpacking).
 */
export function writeStreamAtomic(file: string, source: Readable | NodeJS.ReadableStream, ...through: Transform[]): Promise<void> {
  return viaTemp(file, (tmp) => pipeline([source, ...through, createWriteStream(tmp, { flush: true })]))
}
