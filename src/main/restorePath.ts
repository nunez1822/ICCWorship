import { join, normalize, resolve, sep } from 'node:path'

/** Folders inside the data root that a backup may restore into (same as what a backup holds). */
export const RESTORE_DIRS = ['data', join('cache', 'presentations')]

/**
 * Where a backup zip entry may be written, or null to skip it. The entry name comes from a
 * file anyone could hand the church ("restore this backup"), so after resolving `..`, `\`
 * and the like the target must still be inside one of RESTORE_DIRS — never next to them in
 * the data root, and never outside it (zip-slip).
 */
export function restoreTarget(root: string, entryName: string): string | null {
  const base = resolve(root)
  const dest = resolve(base, normalize(entryName))
  return RESTORE_DIRS.some((d) => dest.startsWith(resolve(base, d) + sep)) ? dest : null
}
