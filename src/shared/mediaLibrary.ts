/**
 * The media library keeps its own copy of what the church adds (pictures, videos, sound, the logo) in
 * <data root>/media/, like EasyWorship's and ProPresenter's managed media. Then a backup ("Back up now") holds them,
 * and a restore on a new computer brings them back — the old way (a link to the file wherever it was) broke as soon
 * as the file moved or the church changed PCs. Settings → Backup can turn the copying off (huge video libraries on
 * another drive): those items keep linking to the original file, as before.
 *
 * A copy is stored data-relative ("media/<id>.<ext>", like converted slides) and resolved by main's mediaFile().
 * Pure, unit tested (tests/mediaLibrary.test.ts).
 */
import type { MediaItem } from './types'

export const MEDIA_DIR = 'media'

export const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mov', 'mkv']
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
export const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'ogg', 'opus', 'flac']
const MEDIA_EXT = new Set([...VIDEO_EXT, ...IMAGE_EXT, ...AUDIO_EXT])

const extOf = (p: string): string => {
  const name = p.split(/[\\/]/).pop() || ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** the library file name for a copy of `sourcePath` ("<id>.<ext>"), or null when it isn't a media file */
export function libraryFileName(id: string, sourcePath: string): string | null {
  const ext = extOf(sourcePath)
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !MEDIA_EXT.has(ext)) return null
  return `${id}.${ext}`
}

/** a file that may live in media/ (a restore writes nothing else there) */
export const isLibraryFileName = (name: string): boolean => /^[A-Za-z0-9_-]{1,64}\.[a-z0-9]{2,5}$/.test(name) && MEDIA_EXT.has(extOf(name))

/** a stored path that is a library copy ("media/<file>") rather than a link to a file elsewhere */
export function isLibraryPath(stored: string | undefined): boolean {
  if (!stored) return false
  const m = /^media[\\/]([^\\/]+)$/.exec(stored)
  return !!m && isLibraryFileName(m[1])
}

/**
 * A media item is being deleted: its library copy, if nothing else still shows it — another library item, the logo,
 * or anything in `elsewhere` (the plans: announcement / header / prayer slides keep the picture's media:// URL; the
 * presentations: picture slides linked from the data folder; and the live state: the file may be on the projector
 * right now). Another item, the logo or a presentation may also name the same file by its full path. Library file names are random ids, so the name
 * appearing anywhere in that data means it is still used.
 *
 * Themes don't keep a copy: a theme whose background item was removed shows the built-in gradient
 * (themeBackground), so its file would only be kept for nothing. Linked files (not in media/) are never deleted: they
 * belong to the church's own folders.
 */
export function libraryFileToDelete(
  item: Pick<MediaItem, 'id' | 'path'>,
  rest: { media: Pick<MediaItem, 'id' | 'path'>[]; logoPath?: string; elsewhere?: unknown[] }
): string | null {
  if (!isLibraryPath(item.path)) return null
  const same = (p: string | undefined) => !!p && p.replace(/\\/g, '/').toLowerCase() === item.path.replace(/\\/g, '/').toLowerCase()
  if (rest.media.some((m) => m.id !== item.id && same(m.path))) return null
  if (same(rest.logoPath)) return null
  const file = item.path.split(/[\\/]/).pop()!.toLowerCase()
  // by name too: another item or the logo may link to the same file by its full path (picked from the data folder)
  const others = rest.media.filter((m) => m.id !== item.id).map((m) => m.path)
  if (
    JSON.stringify([others, rest.logoPath ?? '', rest.elsewhere ?? []])
      .toLowerCase()
      .includes(file)
  )
    return null
  return item.path
}
