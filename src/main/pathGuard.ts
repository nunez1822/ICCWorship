import { randomInt } from 'node:crypto'
import { relative, resolve, isAbsolute } from 'node:path'

/**
 * Is `p` strictly inside `root` (never `root` itself)? Use before deleting or writing a path built from an id
 * that came from the renderer: `join(root, '..\..\x')` or `join(root, '')` must not escape or hit the root.
 * Case-insensitive, because Windows paths are.
 */
export function within(root: string, p: string): boolean {
  const rel = relative(resolve(root).toLowerCase(), resolve(p).toLowerCase())
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

/** A new 6-digit remote PIN from the OS random number generator. */
export function newPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}
