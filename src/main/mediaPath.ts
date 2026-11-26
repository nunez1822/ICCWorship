/**
 * media://local/<path> URLs ↔ files on this PC. One place, used by the media:// protocol, the LAN server and the
 * operator's "file missing?" checks, so they always agree.
 *
 * Converted presentation slides live in the data folder. Since 1.1 they are stored RELATIVE to it
 * ("cache/presentations/<id>/slide1.png"), so a backup restored on another PC (another user name, another
 * drive) still finds them. Slides saved by 1.0 hold the old absolute path; if that folder no longer exists, the
 * same file under this PC's data folder is used instead.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { dataRoot } from './paths'
import { within } from './pathGuard'

export function toMediaUrl(path: string): string {
  return 'media://local/' + encodeURIComponent(path)
}

export function mediaUrlToPath(u?: string): string | null {
  if (!u || !u.startsWith('media://local/')) return null
  try {
    return decodeURIComponent(u.slice('media://local/'.length))
  } catch {
    return null
  }
}

/** media:// URL for a file inside the data folder, stored relative to it (portable between PCs) */
export function dataMediaUrl(absPath: string): string {
  return toMediaUrl(relative(dataRoot(), absPath).split(sep).join('/'))
}

const LEGACY_SLIDE = /[\\/]cache[\\/]presentations[\\/]([^\\/]+)[\\/]([^\\/]+)$/i

/** Pure core (unit tested): a stored path → the file to use on this PC, or null if it may not be served. */
export function resolveStoredPath(root: string, p: string, exists: (f: string) => boolean): string | null {
  if (!p) return null
  if (!isAbsolute(p)) {
    const f = resolve(root, p)
    return within(root, f) ? f : null // relative paths may only point inside the data folder
  }
  const m = LEGACY_SLIDE.exec(p)
  if (m) {
    // try this PC's copy first: the old path may be another PC's folder (or an unreachable network drive)
    const here = join(root, 'cache', 'presentations', m[1], m[2])
    if (here.toLowerCase() !== p.toLowerCase() && exists(here)) return here
  }
  return p
}

/** media:// URL → the file on this PC (or null) */
export function mediaFile(u?: string): string | null {
  const p = mediaUrlToPath(u)
  return p ? resolveStoredPath(dataRoot(), p, existsSync) : null
}
