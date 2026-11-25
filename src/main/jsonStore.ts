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
 * copied over a good .bak. Write errors (read-only file, disk full…) are caught and
 * reported through `onWriteError` instead of crashing the main process.
 */
export type StoreProblem = { name: string; kind: 'recovered' | 'unreadable'; savedAs?: string }

export class JsonStore {
  private cache = new Map<string, unknown>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  /** collections whose main file on disk is known to be valid (safe to copy to .bak) */
  private healthy = new Set<string>()
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
    for (const candidate of [f, f + '.bak']) {
      if (!existsSync(candidate)) continue
      try {
        value = JSON.parse(readFileSync(candidate, 'utf8')) as T
        loaded = true
        if (candidate === f) this.healthy.add(name)
        break
      } catch {
        damaged = true
        // keep a copy of anything we can't read before it could ever be overwritten
        const copy = `${candidate}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
        try {
          copyFileSync(candidate, copy)
          savedAs ??= copy
        } catch {
          /* ignore */
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
    const value = this.cache.get(name)
    const f = this.file(name)
    const tmp = f + '.tmp'
    try {
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
      const err = e as Error
      if (this.onWriteError) this.onWriteError(name, err)
      else console.error('could not save', name, err)
    }
  }

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
    this.cache.clear()
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
