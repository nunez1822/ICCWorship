/**
 * Write a file so that a power cut or crash leaves either the old version or the new one — never half of each.
 * The data goes to "<file>.tmp", is flushed to the disk, and then replaces the file in one rename.
 * (No Electron imports: tests/jsonStore.test.ts uses this in plain Node.)
 */
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { rename, unlink, writeFile } from 'node:fs/promises'

/** Windows antivirus / backup / sync tools briefly lock new files: these errors are worth a short retry */
const LOCKED = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_TRIES = 3
const RENAME_RETRY_MS = 50

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  const tmp = file + '.tmp'
  try {
    // flush: true → fsync before the rename, so the new content is really on disk first
    writeFileSync(tmp, data, typeof data === 'string' ? { encoding: 'utf8', flush: true } : { flush: true })
    for (let i = 1; ; i++) {
      try {
        renameSync(tmp, file)
        return
      } catch (e) {
        // a few quick tries only: callers (the JSON store) retry later on their own, without blocking
        if (i >= RENAME_TRIES || !LOCKED.has((e as NodeJS.ErrnoException).code ?? '')) throw e
        sleepSync(RENAME_RETRY_MS)
      }
    }
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw e
  }
}

/** Same, without blocking the main process (large files such as backup zips). */
export async function writeFileAtomicAsync(file: string, data: string | Uint8Array): Promise<void> {
  const tmp = file + '.tmp'
  try {
    await writeFile(tmp, data, { flush: true })
    for (let i = 1; ; i++) {
      try {
        await rename(tmp, file)
        return
      } catch (e) {
        if (i >= RENAME_TRIES || !LOCKED.has((e as NodeJS.ErrnoException).code ?? '')) throw e
        await new Promise((r) => setTimeout(r, RENAME_RETRY_MS))
      }
    }
  } catch (e) {
    await unlink(tmp).catch(() => {})
    throw e
  }
}
