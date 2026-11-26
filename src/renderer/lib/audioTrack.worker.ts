/**
 * The backing-track worker: holds the decoded song (48 kHz stereo), removes the voice if asked, and encodes it to
 * Ogg/Opus — off the operator window's thread, so the operator stays responsive. Cancel = the page terminates it.
 */
import { analyseStereo, applyOutputGain, energy, N, removeCenter, VOICE_PRESETS } from '@shared/vocalRemoval'
import { encodeOggOpus, opusSupported } from './opusEncode'
import type { WorkerIn, WorkerOut } from './audioTrack'

let L: Float32Array | null = null
let R: Float32Array | null = null

const post = (m: WorkerOut, transfer: Transferable[] = []) => self.postMessage(m, { transfer })

/** the preview excerpt: 20 s from about a third into the song (past the intro), plus processing context */
const PREVIEW_SECONDS = 20

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      L = m.left
      R = m.right
      // the encoder is checked before any long work, so a PC without it says so at once
      if (!(await opusSupported())) return post({ type: 'error', code: 'encoder' })
      return post({ type: 'loaded', stereo: analyseStereo(L, R) })
    }
    if (!L || !R) return post({ type: 'error', code: 'format' })
    if (m.type === 'preview') {
      const len = L.length
      const n = Math.min(len, PREVIEW_SECONDS * 48000)
      const start = Math.max(0, Math.min(Math.floor(len * 0.35), len - n))
      const a = Math.max(0, start - N)
      const b = Math.min(len, start + n + N)
      const pl = L.slice(a, b)
      const pr = R.slice(a, b)
      removeCenter(pl, pr, VOICE_PRESETS[m.preset])
      const cut = (x: Float32Array) => x.slice(start - a, start - a + n)
      const ol = L.slice(start, start + n)
      const or = R.slice(start, start + n)
      const xl = cut(pl)
      const xr = cut(pr)
      applyOutputGain(xl, xr, energy(ol, or)) // the same loudness as the original, or "without voice" always sounds worse
      return post({ type: 'preview', original: [ol, or], processed: [xl, xr] }, [ol.buffer, or.buffer, xl.buffer, xr.buffer])
    }
    if (m.type === 'encode') {
      let removedRatio: number | undefined
      const voice = m.voice
      if (voice) {
        // in place: the song isn't copied (a 10-minute song is ~230 MB as numbers)
        const before = energy(L, R)
        removedRatio = removeCenter(L, R, VOICE_PRESETS[voice], (f) => post({ type: 'progress', fraction: f * 0.75, phase: 'voice' }))
        applyOutputGain(L, R, before)
      }
      const from = voice ? 0.75 : 0
      const ogg = await encodeOggOpus(L, R, (f) => post({ type: 'progress', fraction: from + f * (1 - from), phase: 'encode' }))
      return post({ type: 'done', ogg, removedRatio }, [ogg.buffer])
    }
  } catch (err) {
    post({ type: 'error', code: err instanceof RangeError ? 'memory' : err instanceof Error && err.message === 'encoder' ? 'encoder' : 'failed' })
  }
}
