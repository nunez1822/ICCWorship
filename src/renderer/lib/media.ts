import type { Background, MediaKind } from '@shared/types'

export const toMediaUrl = (path: string): string => 'media://local/' + encodeURIComponent(path)

export function mediaUrlToPath(u?: string): string | null {
  if (!u || !u.startsWith('media://local/')) return null
  try {
    return decodeURIComponent(u.slice('media://local/'.length))
  } catch {
    return null
  }
}

export const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mov', 'mkv']
export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
export const AUDIO_EXT = ['mp3', 'wav', 'm4a', 'ogg', 'opus', 'flac']

export function kindOf(path: string): MediaKind | null {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (AUDIO_EXT.includes(ext)) return 'audio'
  return null
}

export const isVideoUrl = (u?: string): boolean => !!u && VIDEO_EXT.includes(decodeURIComponent(u).split('.').pop()?.toLowerCase() || '')
export const isAudioUrl = (u?: string): boolean => !!u && AUDIO_EXT.includes(decodeURIComponent(u).split('.').pop()?.toLowerCase() || '')

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}

export function backgroundFromMedia(path: string, dim = 0.35): Background | null {
  const k = kindOf(path)
  if (k === 'image') return { type: 'image', value: toMediaUrl(path), dim }
  if (k === 'video') return { type: 'video', value: toMediaUrl(path), dim }
  return null
}

/** Make a small JPEG thumbnail of an image or the first second of a video */
export function makeThumb(path: string, kind: MediaKind): Promise<string | undefined> {
  const url = toMediaUrl(path)
  const W = 320
  const H = 180
  const draw = (el: CanvasImageSource, w: number, h: number) => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    const s = Math.min(W / w, H / h)
    ctx.drawImage(el, (W - w * s) / 2, (H - h * s) / 2, w * s, h * s)
    return c.toDataURL('image/jpeg', 0.72)
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(undefined), 8000)
    if (kind === 'image') {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        clearTimeout(timeout)
        resolve(draw(img, img.naturalWidth, img.naturalHeight))
      }
      img.onerror = () => resolve(undefined)
      img.src = url
    } else if (kind === 'video') {
      const v = document.createElement('video')
      v.crossOrigin = 'anonymous'
      v.muted = true
      v.preload = 'auto'
      v.onloadeddata = () => {
        v.currentTime = Math.min(1, (v.duration || 2) / 3)
      }
      v.onseeked = () => {
        clearTimeout(timeout)
        resolve(draw(v, v.videoWidth, v.videoHeight))
      }
      v.onerror = () => resolve(undefined)
      v.src = url
    } else resolve(undefined)
  })
}

/**
 * Stop an audio/video element we are done with and let go of its file. Its handlers go first: emptying the source
 * makes the element fire 'error' (and maybe 'ended'), and a handler still attached would tell the operator the file
 * "can't be played" when nothing went wrong. Never `el.src = ''` on its own.
 */
export function releaseAudio(el: HTMLMediaElement | null | undefined): void {
  if (!el) return
  el.onerror = el.onended = el.ontimeupdate = el.onloadedmetadata = el.oncanplay = null
  el.pause()
  el.removeAttribute('src')
  el.load()
}
