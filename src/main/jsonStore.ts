import { existsSync, readFileSync, renameSync, writeFileSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tiny JSON-file store. Each collection lives in one file (<dir>/<name>.json).
 * Writes are debounced and atomic (write temp file, then rename) so a power cut
 * during a service can never leave a half-written file. The previous version is
 * kept as <name>.json.bak.
 */
export class JsonStore {
  private cache = new Map<string, unknown>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private dir: string) {}

  private file(name: string): string {
    return join(this.dir, `${name}.json`)
  }

  read<T>(name: string, fallback: T): T {
    if (this.cache.has(name)) return this.cache.get(name) as T
    let value = fallback
    const f = this.file(name)
    for (const candidate of [f, f + '.bak']) {
      if (!existsSync(candidate)) continue
      try {
        value = JSON.parse(readFileSync(candidate, 'utf8')) as T
        break
      } catch {
        /* try backup */
      }
    }
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
    writeFileSync(tmp, JSON.stringify(value, null, 1), 'utf8')
    if (existsSync(f)) {
      try {
        copyFileSync(f, f + '.bak')
      } catch {
        /* ignore */
      }
    }
    renameSync(tmp, f)
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
