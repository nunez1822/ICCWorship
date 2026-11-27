/**
 * media:// serves local media files (pictures, videos, sound, converted slides) to the app's own pages.
 */
import { protocol } from 'electron'
import { createReadStream, statSync, type Stats } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { parseRange } from '@shared/security'
import { mediaFile } from './mediaPath'

// Only these file types are ever served; anything else (settings.json, documents, keys…) is "not found".
export const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
}

export function registerMediaProtocol(): void {
  // Range-aware file streaming so videos can seek smoothly
  protocol.handle('media', async (req) => {
    const notFound = () => new Response('Not found', { status: 404 })
    const p = mediaFile(req.url)
    const type = p ? MIME[extname(p).toLowerCase()] : undefined
    if (!p || !type) return notFound()
    let st: Stats | undefined
    try {
      st = statSync(p, { throwIfNoEntry: false })
    } catch {
      return notFound()
    }
    if (!st?.isFile()) return notFound()
    const size = st.size
    const base = { 'Access-Control-Allow-Origin': '*', 'Content-Type': type, 'Accept-Ranges': 'bytes' }
    const range = parseRange(req.headers.get('range'), size)
    if (range.kind === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } })
    if (range.kind === 'partial') {
      const { start, end } = range
      const stream = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
      })
    }
    const stream = Readable.toWeb(createReadStream(p)) as ReadableStream
    return new Response(stream, { status: 200, headers: { ...base, 'Content-Length': String(size) } })
  })
}
