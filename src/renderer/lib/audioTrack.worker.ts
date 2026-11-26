/**
 * The backing-track worker: holds the decoded song (48 kHz stereo) and encodes it to Ogg/Opus, off the operator
 * window's thread so the operator stays responsive. Cancel = the page terminates the worker.
 */
import { encodeOggOpus, opusSupported } from './opusEncode'
import type { WorkerIn, WorkerOut } from './audioTrack'

let L: Float32Array | null = null
let R: Float32Array | null = null

const post = (m: WorkerOut, transfer: Transferable[] = []) => self.postMessage(m, { transfer })

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      L = m.left
      R = m.right
      // the encoder is checked before any long work, so a PC without it says so at once
      if (!(await opusSupported())) return post({ type: 'error', code: 'encoder' })
      return post({ type: 'loaded' })
    }
    if (m.type === 'encode') {
      if (!L || !R) return post({ type: 'error', code: 'format' })
      const ogg = await encodeOggOpus(L, R, (f) => post({ type: 'progress', fraction: f }))
      return post({ type: 'done', ogg }, [ogg.buffer])
    }
  } catch (err) {
    post({ type: 'error', code: err instanceof RangeError ? 'memory' : err instanceof Error && err.message === 'encoder' ? 'encoder' : 'failed' })
  }
}
