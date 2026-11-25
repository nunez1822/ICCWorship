import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tiny JSON-file store. Each collection lives in one file (<dir>/<name>.json).
 * Writes are debounced and atomic (write temp file, then rename) so a power cut
 * during a service can never leave a half-written file. The previous version is
 * kept as <name>.json.bak.
 *
 * Damage handling: a file that can't be parsed is first copied aside as
 * <name>.json.corrupt-<time> (so nothing is ever lost), the backup is used if it parses,
 * and the problem is recorded in `problems` for the UI to show. A damaged file is never
 * copied over a good .bak. A file that can't be opened at all (EBUSY/EPERM while antivirus or
 * backup software holds it) is retried briefly before falling back to the .bak; if it still
 * could not be read or copied aside, it is copied aside before the first save overwrites it —
 * and that save waits (retried like any failed save) until the copy succeeds. Write errors (read-only file, disk full, a file briefly locked
 * by antivirus…) are caught and reported through `onWriteError` instead of crashing the
 * main process, and the save is retried (every few seconds, and again by `flush()` at quit)
 * until it succeeds — the operator is told their changes are kept, so they must reach disk.
 */
export type StoreProblem = { name: string; kind: 'recovered' | 'unreadable'; savedAs?: string }

/** how long to wait before trying a failed save again */
export const RETRY_MS = 3000

/** read errors worth retrying: the file is there but briefly held by another program */
const TRANSIENT = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE'])
const READ_TRIES = 5
const READ_RETRY_MS = 100

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function corruptName(file: string): string {
  return `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
}

/** read a file, retrying a few times while another program holds it */
function readWithRetry(file: string): string {
  for (let i = 1; ; i++) {
    try {
      return readFileSync(file, 'utf8')
    } catch (e) {
      if (i >= READ_TRIES || !TRANSIENT.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      sleepSync(READ_RETRY_MS)
    }
  }
}

export class JsonStore {
  private cache = new Map<string, unknown>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** collections whose main file on disk is known to be valid (safe to copy to .bak) */
  private healthy = new Set<string>()
  /** collections whose main file could be neither read nor copied aside: it must be copied
   *  aside before a save may overwrite it (it may hold newer data than what was loaded) */
  private unpreserved = new Set<string>()
  readonly problems: StoreProblem[] = []
  onWriteError?: (name: string, error: Error) => void

  constructor(private dir: string) {}

  private file(name: string): string {
    return join(this.dir, `${name}.json`)
  }

  read<T>(name: string, fallback: T): T {
    if (this.cache.has(name)) return this.cache.get(name) as T
    let value = fallback
    const f = this.file(name)
    let damaged = false
    let savedAs: string | undefined
    let loaded = false
    // healthy only once the main file on disk has been read back fine
    this.healthy.delete(name)
    this.unpreserved.delete(name)
    for (const candidate of [f, f + '.bak']) {
      if (!existsSync(candidate)) continue
      try {
        value = JSON.parse(readWithRetry(candidate)) as T
        loaded = true
        if (candidate === f) this.healthy.add(name)
        break
      } catch {
        damaged = true
        // keep a copy of anything we can't read before it could ever be overwritten
        const copy = corruptName(candidate)
        try {
          copyFileSync(candidate, copy)
          savedAs ??= copy
        } catch {
          // still locked (or unreadable): never overwrite the main file until it is kept
          if (candidate === f) this.unpreserved.add(name)
        }
      }
    }
    if (damaged) this.problems.push({ name, kind: loaded ? 'recovered' : 'unreadable', savedAs })
    this.cache.set(name, value)
    return value
  }

  write<T>(name: string, value: T, immediate = false): void {
    this.cache.set(name, value)
    const prev = this.timers.get(name)
    if (prev) clearTimeout(prev)
    if (immediate) {
      this.flushOne(name)
      return
    }
    this.timers.set(
      name,
      setTimeout(() => this.flushOne(name), 250)
    )
  }

  private flushOne(name: string): void {
    this.timers.delete(name)
    // forgotten by reset() (a restore replaced the files): nothing of ours left to write
    if (!this.cache.has(name)) return
    const value = this.cache.get(name)
    const f = this.file(name)
    const tmp = f + '.tmp'
    try {
      // the main file was never read or kept: copy it aside first (throws → retried later)
      if (this.unpreserved.has(name)) {
        if (existsSync(f)) copyFileSync(f, corruptName(f))
        this.unpreserved.delete(name)
      }
      writeFileSync(tmp, JSON.stringify(value, null, 1), 'utf8')
      // only a known-good file may become the backup (never copy a damaged one over it)
      if (existsSync(f) && this.healthy.has(name)) {
        try {
          copyFileSync(f, f + '.bak')
        } catch {
          /* ignore */
        }
      }
      renameSync(tmp, f)
      this.healthy.add(name)
    } catch (e) {
      try {
        if (existsSync(tmp)) unlinkSync(tmp)
      } catch {
        /* ignore */
      }
      // keep it pending: a retry (or flush() at quit) writes it once the file is free again,
      // even if the operator makes no further edit
      this.timers.set(
        name,
        setTimeout(() => this.flushOne(name), RETRY_MS)
      )
      const err = e as Error
      if (this.onWriteError) this.onWriteError(name, err)
      else console.error('could not save', name, err)
    }
  }

  /** Write everything pending now — including saves that failed earlier and wait for a retry. */
  flush(): void {
    for (const name of [...this.timers.keys()]) {
      const t = this.timers.get(name)
      if (t) clearTimeout(t)
      this.flushOne(name)
    }
  }

  /** forget cached values (after a restore) */
  reset(): void {
    this.flush()
    // a save that still fails is dropped: the restore replaces that data on disk
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
    this.cache.clear()
    // the files on disk were replaced: nothing is known to be good until read again
    this.healthy.clear()
    this.unpreserved.clear()
  }

  /* ---- collection helpers (arrays of {id}) ---- */
  list<T extends { id: string }>(name: string): T[] {
    return this.read<T[]>(name, [])
  }

  get<T extends { id: string }>(name: string, id: string): T | undefined {
    return this.list<T>(name).find((x) => x.id === id)
  }

  upsert<T extends { id: string }>(name: string, item: T): T {
    const items = [...this.list<T>(name)]
    const i = items.findIndex((x) => x.id === item.id)
    if (i >= 0) items[i] = item
    else items.push(item)
    this.write(name, items)
    return item
  }

  upsertMany<T extends { id: string }>(name: string, list: T[]): void {
    const items = [...this.list<T>(name)]
    for (const item of list) {
      const i = items.findIndex((x) => x.id === item.id)
      if (i >= 0) items[i] = item
      else items.push(item)
    }
    this.write(name, items)
  }

  remove(name: string, id: string): void {
    this.write(
      name,
      this.list<{ id: string }>(name).filter((x) => x.id !== id)
    )
  }
}
