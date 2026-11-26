import { basename, dirname, join, normalize, resolve, sep } from 'node:path'
import { isTrackFileName } from '@shared/tracks'

/** the backing tracks folder inside the data root */
export const TRACKS_DIR = 'tracks'

/** Folders inside the data root that a backup may restore into (same as what a backup holds). */
export const RESTORE_DIRS = ['data', join('cache', 'presentations'), TRACKS_DIR]

/**
 * Where a backup zip entry may be written, or null to skip it. The entry name comes from a
 * file anyone could hand the church ("restore this backup"), so after resolving `..`, `\`
 * and the like the target must still be inside one of RESTORE_DIRS — never next to them in
 * the data root, and never outside it (zip-slip).
 */
export function restoreTarget(root: string, entryName: string): string | null {
  const base = resolve(root)
  const dest = resolve(base, normalize(entryName))
  if (!RESTORE_DIRS.some((d) => dest.startsWith(resolve(base, d) + sep))) return null
  // tracks/ holds only track files, directly in it — nothing else a hand-made backup might carry
  const tracks = resolve(base, TRACKS_DIR)
  if (dest.startsWith(tracks + sep) && (dirname(dest) !== tracks || !isTrackFileName(basename(dest)))) return null
  return dest
}

/** a backup entry (or path relative to the data root) inside tracks/ */
export const isTracksEntry = (rel: string): boolean => /^tracks[\\/]/i.test(rel)
