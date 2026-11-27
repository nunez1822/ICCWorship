/**
 * The media library's own copies (see @shared/mediaLibrary): copying a file in when it is added, and removing the
 * copy when its item is deleted and nothing else shows it.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { isLibraryFileName, libraryFileName, libraryFileToDelete, MEDIA_DIR, themesWithoutBackground } from '@shared/mediaLibrary'
import type { MediaItem, Presentation, ServicePlan, Theme } from '@shared/types'
import { copyFileAtomic } from './atomicWrite'
import { notify } from './appState'
import { afterBackups } from './backup'
import { assertWritable, db, getSettings } from './db'
import { live } from './live'
import { log } from './log'
import { dataRoot } from './paths'
import { within } from './pathGuard'

/** leave room for saving the church's data (like automatic backups do) */
const MIN_FREE_BYTES = 300 * 1024 * 1024

/** duplicate: the library already had a byte-identical copy (another name, same content): `path` is that copy and
 *  nothing new was written */
export type CopyResult = { ok: true; path: string; duplicate?: true } | { ok: false; error: 'bad-file' | 'no-space' | 'failed' }

/** sha-256 of a file, streamed (a video can be gigabytes) */
function hashFile(f: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    createReadStream(f)
      .on('error', reject)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve(h.digest('hex')))
  })
}

/** a library copy with the same content as `src` (same size first: only those are read), or undefined */
async function sameContentIn(dir: string, src: string, size: number): Promise<string | undefined> {
  let names: string[]
  try {
    names = readdirSync(dir).filter(isLibraryFileName)
  } catch {
    return undefined // no media/ yet
  }
  const candidates = names.filter((n) => statSync(join(dir, n), { throwIfNoEntry: false })?.size === size)
  if (!candidates.length) return undefined
  const want = await hashFile(src)
  for (const n of candidates) {
    try {
      if ((await hashFile(join(dir, n))) === want) return n
    } catch {
      /* being written or gone: not a match */
    }
  }
  return undefined
}

/**
 * Copy a picture / video / sound file into media/ → its data-relative path ("media/<id>.<ext>"). Only media file
 * types (what media:// would serve anyway), only regular files. The page names the file (a dialog pick or a file
 * dropped from Explorer), so nothing else is ever read.
 */
export async function copyIntoLibrary(src: unknown): Promise<CopyResult> {
  if (typeof src !== 'string' || !isAbsolute(src)) return { ok: false, error: 'bad-file' }
  const name = libraryFileName(randomUUID(), src)
  if (!name) return { ok: false, error: 'bad-file' }
  assertWritable()
  try {
    const st = statSync(src)
    if (!st.isFile()) return { ok: false, error: 'bad-file' }
    const size = st.size
    const dir = join(dataRoot(), MEDIA_DIR)
    // the same picture or video added again under another name: reuse the copy already there
    const same = await sameContentIn(dir, src, size)
    if (same) return { ok: true, path: `${MEDIA_DIR}/${same}`, duplicate: true }
    const fs = await statfs(dataRoot())
    if (fs.bavail * fs.bsize - size < MIN_FREE_BYTES) return { ok: false, error: 'no-space' }
    mkdirSync(dir, { recursive: true })
    await copyFileAtomic(src, join(dir, name))
    return { ok: true, path: `${MEDIA_DIR}/${name}` }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    log.warn('could not copy a media file into the library:', code || 'error')
    return { ok: false, error: code === 'ENOENT' || code === 'EISDIR' ? 'bad-file' : code === 'ENOSPC' ? 'no-space' : 'failed' }
  }
}

/**
 * db:remove('media', id): delete the item, and its library copy if nothing else shows it any more (see
 * deleteCopyIfUnused).
 */
export function removeMediaItem(id: string): void {
  const store = db()
  const item = store.get<MediaItem>('media', id)
  store.remove('media', id)
  if (!item) return
  // a theme whose background was this file shows the built-in gradient from now on: save that, so previews stop
  // asking for the missing file (the renderer's media:// url for the item's path, as the theme stored it)
  const themes = themesWithoutBackground(store.list<Theme>('themes'), 'media://local/' + encodeURIComponent(item.path))
  if (themes) {
    store.write('themes', themes)
    notify({ type: 'themesChanged' })
  }
  deleteCopyIfUnused(item)
}

/**
 * A library copy lost its owner (a removed item, a replaced or cleared logo): delete it unless something else still
 * shows it — another item, the logo, a plan slide, or what is on the projector right now. The file is deleted once no
 * backup or restore is running (a backup streaming GBs of media would fail on a file that vanished under it).
 */
/** the parts of the live state that show a file now (a slide, the background, a playing video, the logo layer) */
function onScreenNow(): unknown {
  const l = live.state
  return { slides: l.slides, background: l.background, video: l.video, progress: l.videoProgress?.src, logoPath: l.logoPath }
}

export function deleteCopyIfUnused(owner: Pick<MediaItem, 'id' | 'path'>): void {
  const store = db()
  if (store.readOnly) return
  const toDelete = () =>
    libraryFileToDelete(owner, {
      media: store.list<MediaItem>('media'),
      logoPath: getSettings().logoPath,
      // what is on screen right now, not the live theme: themes don't keep a copy (the default theme is always in the
      // live state, so a picture behind it would otherwise never be freed)
      elsewhere: [store.list<ServicePlan>('plans'), store.list<Presentation>('presentations'), onScreenNow()]
    })
  if (!toDelete()) return
  afterBackups(() => {
    const file = toDelete() // checked again: the plans or the screen may have changed while a backup ran
    if (!file) return
    const abs = join(dataRoot(), file)
    if (!within(join(dataRoot(), MEDIA_DIR), abs)) return
    try {
      unlinkSync(abs)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log.warn('could not delete a media library file:', (e as NodeJS.ErrnoException).code || 'error')
    }
  })
}
