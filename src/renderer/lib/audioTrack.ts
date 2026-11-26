/**
 * Making a backing track in the operator window: read the picked file, decode it (Chromium's decoders: mp3, m4a/aac,
 * wav, flac, ogg…), then let the worker encode it to Ogg/Opus. Every failure is a TrackError with a code the page
 * turns into a message — never a silent stop.
 */
import type { VoicePreset } from '@shared/types'
import type { StereoCheck } from '@shared/vocalRemoval'
import { MAX_SOURCE_BYTES } from '@shared/tracks'
import AudioTrackWorker from './audioTrack.worker?worker&inline'

export type TrackErrorCode = 'format' | 'memory' | 'too-long' | 'too-large' | 'encoder' | 'failed' | 'canceled' | 'empty'

export class TrackError extends Error {
  constructor(readonly code: TrackErrorCode) {
    super(code)
  }
}

export type WorkerIn =
  | { type: 'load'; left: Float32Array; right: Float32Array }
  | { type: 'preview'; preset: VoicePreset }
  | { type: 'encode'; voice?: VoicePreset }
export type WorkerOut =
  | { type: 'loaded'; stereo: StereoCheck }
  | { type: 'progress'; fraction: number; phase?: 'voice' | 'encode' }
  | { type: 'preview'; original: [Float32Array, Float32Array]; processed: [Float32Array, Float32Array] }
  | { type: 'done'; ogg: Uint8Array; removedRatio?: number }
  | { type: 'error'; code: TrackErrorCode }

/** longest song accepted (memory: ~20 min of 48 kHz stereo is ~460 MB while decoding) */
export const MAX_MINUTES = 20

/** the bytes of a picked file (main checks it was picked in a dialog) or of a media-library item (media:// URL) */
export async function readSource(src: { path: string } | { url: string }): Promise<Uint8Array> {
  try {
    if ('path' in src) return await window.api.tracks.readPicked(src.path)
    return await fetchLimited(src.url)
  } catch (e) {
    if (e instanceof TrackError) throw e
    throw new TrackError(String((e as Error)?.message || '').includes('too-large') ? 'too-large' : 'format')
  }
}

/** A media-library file, with the same size limit as a picked one (main checks those): a 1.5 GB recording of a whole
 *  service must say "too large", not fill the operator window's memory. */
async function fetchLimited(url: string): Promise<Uint8Array> {
  const ac = new AbortController()
  const r = await fetch(url, { signal: ac.signal })
  if (!r.ok) throw new TrackError('format')
  const tooLarge = () => {
    ac.abort()
    return new TrackError('too-large')
  }
  if (Number(r.headers.get('content-length')) > MAX_SOURCE_BYTES) throw tooLarge()
  if (!r.body) {
    const b = new Uint8Array(await r.arrayBuffer())
    if (b.length > MAX_SOURCE_BYTES) throw tooLarge()
    return b
  }
  const reader = r.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_SOURCE_BYTES) throw tooLarge()
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

export interface Decoded {
  left: Float32Array
  right: Float32Array
  /** channels in the file: 1 = mono (fine to play, but "Remove the voice" needs stereo) */
  channels: number
  seconds: number
}

/** Decode to 48 kHz (what Opus uses). A file with more than two channels keeps front left / right. */
export async function decodeAudio(bytes: Uint8Array): Promise<Decoded> {
  // OfflineAudioContext: no sound device needed, and it resamples to exactly 48 kHz
  const ctx = new OfflineAudioContext(2, 1, 48000)
  let buf: AudioBuffer
  try {
    // decodeAudioData takes (and detaches) the buffer: give it its own copy
    buf = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  } catch (e) {
    throw new TrackError(e instanceof RangeError ? 'memory' : 'format')
  }
  if (!buf.length) throw new TrackError('empty')
  if (buf.duration > MAX_MINUTES * 60) throw new TrackError('too-long')
  try {
    const left = buf.getChannelData(0).slice()
    const right = buf.numberOfChannels > 1 ? buf.getChannelData(1).slice() : left.slice()
    return { left, right, channels: buf.numberOfChannels, seconds: buf.duration }
  } catch (e) {
    throw new TrackError(e instanceof RangeError ? 'memory' : 'failed')
  }
}

/** One track being made. `cancel()` stops the worker at once. */
export class TrackJob {
  private worker = new AudioTrackWorker()
  private waiting: ((m: WorkerOut) => void) | null = null
  private onProgress?: (f: number, phase?: 'voice' | 'encode') => void
  private canceled = false

  constructor() {
    this.worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'progress') this.onProgress?.(e.data.fraction, e.data.phase)
      else this.waiting?.(e.data)
    }
    this.worker.onerror = () => this.waiting?.({ type: 'error', code: 'failed' })
  }

  private ask(m: WorkerIn, transfer: Transferable[] = []): Promise<WorkerOut> {
    if (this.canceled) return Promise.reject(new TrackError('canceled'))
    return new Promise((resolve) => {
      this.waiting = (out) => {
        this.waiting = null
        resolve(out)
      }
      this.worker.postMessage(m, transfer)
    })
  }

  /** hand the decoded audio to the worker (the arrays move there: don't use them afterwards); says how stereo it is */
  async load(d: Decoded): Promise<StereoCheck> {
    const r = await this.ask({ type: 'load', left: d.left, right: d.right }, [d.left.buffer, d.right.buffer])
    if (r.type === 'error') throw new TrackError(r.code)
    return r.type === 'loaded' ? r.stereo : 'ok'
  }

  /** 20 s of the song, as it is and without the voice (same loudness), for the A/B preview */
  async preview(preset: VoicePreset): Promise<{ original: [Float32Array, Float32Array]; processed: [Float32Array, Float32Array] }> {
    const r = await this.ask({ type: 'preview', preset })
    if (r.type === 'error') throw new TrackError(r.code)
    if (r.type !== 'preview') throw new TrackError('failed')
    return r
  }

  /** the finished Ogg file — with the voice removed when `voice` is given (this changes the loaded audio: call it last) */
  async encode(onProgress: (fraction: number, phase?: 'voice' | 'encode') => void, voice?: VoicePreset): Promise<{ ogg: Uint8Array; removedRatio?: number }> {
    this.onProgress = onProgress
    const r = await this.ask({ type: 'encode', voice })
    if (r.type === 'error') throw new TrackError(r.code)
    if (r.type !== 'done') throw new TrackError('failed')
    return { ogg: r.ogg, removedRatio: r.removedRatio }
  }

  cancel(): void {
    this.canceled = true
    this.worker.terminate()
    this.waiting?.({ type: 'error', code: 'canceled' })
  }

  dispose(): void {
    this.worker.terminate()
  }
}
