/**
 * "Remove the voice" — classic center-channel removal, no AI (unit tested in tests/vocalRemoval.test.ts).
 *
 * In most mixes the lead voice is panned dead center: it is the same in the left and right channel. This takes out
 * what is the same in both channels, but only inside a frequency band (so bass and kick drum, also centered, stay)
 * and gently (a soft mask, smoothed over time and frequency, so it doesn't warble). It is the idea behind Audacity's
 * "Vocal Reduction" and Adobe Audition's "Center Channel Extractor":
 *
 * - STFT: 4096-point frames (~85 ms at 48 kHz), hop 1024, periodic Hann on analysis and synthesis (weighted
 *   overlap-add; the squared windows sum to 1.5 at this hop). Processed IN PLACE, frame by frame: a 10-minute song
 *   needs no second copy.
 * - Per bin, how centered is it? sim = 2·Re(Φ_LR) / (Φ_LL + Φ_RR), from recursively averaged auto/cross spectra
 *   (λ = 0.7 per hop, ±1 bin). 1 = identical in both channels; it already includes level differences
 *   (R = g·L gives 2g/(1+g²)); anti-phase content (stereo wideners) gives ≤ 0 and is kept.
 * - Mask m = clamp(1 − (1 − sim)/width)^p · strength, smoothed over time, inside [lowHz, highHz] with ⅓-octave fades.
 *   `strength` is how much of a perfectly centered sound goes: 0.95 leaves −26 dB of it (sounds more natural than 0).
 * - The center estimate C = m · min(|L|,|R|) · M/|M| (M = (L+R)/2) is taken out of both channels: off-center sounds
 *   keep their stereo, and the mono sum (many church PAs are mono) is not emptied.
 *
 * Honest limits: backing vocals, reverb and wide voices stay; so do other centered instruments in the band (snare,
 * mono keys or guitar). A mono file can't be done (everything is "center").
 */
import { FFT } from './fft'
import type { VoicePreset } from './types'

export const VOICE_RATE = 48000
export const N = 4096
export const HOP = 1024

export interface VoiceOptions {
  /** how far from "identical" a bin may be and still count as center (1 − sim) */
  width: number
  /** mask curve: 2 = only the clearly centered, 0.5 = more aggressive */
  p: 0.5 | 1 | 2
  /** how much of a perfectly centered sound is removed (0..1) */
  strength: number
  lowHz: number
  highHz: number
}

export const VOICE_PRESETS: Record<VoicePreset, VoiceOptions> = {
  less: { width: 0.12, p: 2, strength: 0.85, lowHz: 150, highHz: 8000 },
  normal: { width: 0.2, p: 1, strength: 0.95, lowHz: 150, highHz: 8000 },
  more: { width: 0.3, p: 0.5, strength: 1, lowHz: 120, highHz: 10000 }
}

const LAMBDA = 0.7
const MASK_KEEP = 0.6
const WINDOW_SUM = 1.5

/** band weight per bin: 0 outside, raised-cosine fades over the first and last ⅓ octave inside */
function bandWeights(o: VoiceOptions, rate: number): Float64Array {
  const half = N / 2
  const w = new Float64Array(half + 1)
  const third = Math.pow(2, 1 / 3)
  for (let k = 0; k <= half; k++) {
    const f = (k * rate) / N
    if (f < o.lowHz || f > o.highHz) continue
    let g = 1
    const lowTop = o.lowHz * third
    const highBottom = o.highHz / third
    if (f < lowTop) g = Math.min(g, 0.5 - 0.5 * Math.cos((Math.PI * Math.log(f / o.lowHz)) / Math.log(third)))
    if (f > highBottom) g = Math.min(g, 0.5 - 0.5 * Math.cos((Math.PI * Math.log(o.highHz / f)) / Math.log(third)))
    w[k] = g
  }
  return w
}

const curve = (x: number, p: VoiceOptions['p']) => (p === 2 ? x * x : p === 1 ? x : Math.sqrt(x))

/**
 * Take the centered sound out of a stereo signal, in place. Returns how much of the energy it removed (0..1),
 * before any gain: near 0 = it found nothing centered, near 1 = nearly everything was centered (mono-like).
 */
export function removeCenter(left: Float32Array, right: Float32Array, o: VoiceOptions, onProgress?: (fraction: number) => void, rate = VOICE_RATE): number {
  const len = Math.min(left.length, right.length)
  const half = N / 2
  const fft = new FFT(N)
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N) // periodic Hann
  const band = bandWeights(o, rate)
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  // smoothed statistics and mask per bin
  const pll = new Float64Array(half + 1)
  const prr = new Float64Array(half + 1)
  const plrRe = new Float64Array(half + 1)
  const mask = new Float64Array(half + 1)
  // this frame's spectra
  const lr = new Float64Array(half + 1)
  const li = new Float64Array(half + 1)
  const rr = new Float64Array(half + 1)
  const ri = new Float64Array(half + 1)
  // overlap-add accumulators, a ring of N samples (positions in the padded signal, mod N)
  const accL = new Float64Array(N)
  const accR = new Float64Array(N)
  let eIn = 0
  let eRemoved = 0

  // the signal is padded with N zeros on both sides: padded index j = original index j − N
  const frames = Math.floor((len + N - 1) / HOP) + 1
  const at = (x: Float32Array, j: number) => {
    const i = j - N
    return i >= 0 && i < len ? x[i] : 0
  }
  for (let f = 0; f < frames; f++) {
    const t = f * HOP
    // L + iR, windowed. Reads padded [t, t+N) = original [t−N, t): none of it has been written over yet.
    for (let n = 0; n < N; n++) {
      re[n] = at(left, t + n) * win[n]
      im[n] = at(right, t + n) * win[n]
    }
    fft.transform(re, im)
    // split the two real spectra: L_k = (Z_k + conj Z_{N−k}) / 2, R_k = (Z_k − conj Z_{N−k}) / 2i
    for (let k = 0; k <= half; k++) {
      const nk = (N - k) % N
      lr[k] = (re[k] + re[nk]) / 2
      li[k] = (im[k] - im[nk]) / 2
      rr[k] = (im[k] + im[nk]) / 2
      ri[k] = -(re[k] - re[nk]) / 2
    }
    for (let k = 0; k <= half; k++) {
      pll[k] = LAMBDA * pll[k] + (1 - LAMBDA) * (lr[k] * lr[k] + li[k] * li[k])
      prr[k] = LAMBDA * prr[k] + (1 - LAMBDA) * (rr[k] * rr[k] + ri[k] * ri[k])
      plrRe[k] = LAMBDA * plrRe[k] + (1 - LAMBDA) * (lr[k] * rr[k] + li[k] * ri[k]) // Re(L · conj R)
    }
    for (let k = 0; k <= half; k++) {
      const lE = lr[k] * lr[k] + li[k] * li[k]
      const rE = rr[k] * rr[k] + ri[k] * ri[k]
      eIn += lE + rE
      let raw = 0
      if (band[k] > 0) {
        const a = k > 0 ? k - 1 : k
        const b = k < half ? k + 1 : k
        const sll = pll[a] + pll[k] + pll[b]
        const srr = prr[a] + prr[k] + prr[b]
        const slr = plrRe[a] + plrRe[k] + plrRe[b]
        const total = sll + srr
        if (total > 1e-12) {
          const sim = Math.max(0, (2 * slr) / (total + 1e-20))
          const x = 1 - (1 - sim) / o.width
          if (x > 0) raw = curve(Math.min(1, x), o.p) * o.strength * band[k]
        }
      }
      const m = (mask[k] = MASK_KEEP * mask[k] + (1 - MASK_KEEP) * raw)
      if (m <= 0) continue
      // C = m · min(|L|,|R|) · M/|M|
      const mr = (lr[k] + rr[k]) / 2
      const mi = (li[k] + ri[k]) / 2
      const mAbs = Math.hypot(mr, mi)
      const lAbs = Math.sqrt(lE)
      const rAbs = Math.sqrt(rE)
      if (mAbs < 1e-6 * (lAbs + rAbs) || mAbs === 0) continue
      const c = (m * Math.min(lAbs, rAbs)) / mAbs
      const cr = c * mr
      const ci = c * mi
      lr[k] -= cr
      li[k] -= ci
      rr[k] -= cr
      ri[k] -= ci
      eRemoved += 2 * (cr * cr + ci * ci)
    }
    // back to Z′ = L′ + iR′ (conjugate-symmetric halves), inverse FFT: real part = L′, imaginary part = R′
    for (let k = 0; k <= half; k++) {
      re[k] = lr[k] - ri[k]
      im[k] = li[k] + rr[k]
      if (k > 0 && k < half) {
        re[N - k] = lr[k] + ri[k]
        im[N - k] = -li[k] + rr[k]
      }
    }
    fft.transform(re, im, true)
    for (let n = 0; n < N; n++) {
      const p = (t + n) % N
      accL[p] += re[n] * win[n]
      accR[p] += im[n] * win[n]
    }
    // padded [t, t+HOP) now has every frame it needs: write it back over the input (original [t−N, t+HOP−N))
    for (let j = t; j < t + HOP; j++) {
      const p = j % N
      const i = j - N
      if (i >= 0 && i < len) {
        left[i] = accL[p] / WINDOW_SUM
        right[i] = accR[p] / WINDOW_SUM
      }
      accL[p] = 0
      accR[p] = 0
    }
    if (onProgress && f % 256 === 0) onProgress(f / frames)
  }
  onProgress?.(1)
  return eIn > 0 ? Math.min(1, eRemoved / eIn) : 0
}

/** total energy (sum of squares) of both channels */
export function energy(left: Float32Array, right: Float32Array): number {
  let e = 0
  for (let i = 0; i < left.length; i++) e += left[i] * left[i]
  for (let i = 0; i < right.length; i++) e += right[i] * right[i]
  return e
}

/**
 * Taking the voice out makes the song quieter than the other media. One gain for the whole song (no limiter, so
 * nothing pumps): back towards the original loudness, at most +6 dB, and never above −1 dBFS (room for the Opus
 * decoder's overshoot). Returns the gain applied.
 */
export function applyOutputGain(left: Float32Array, right: Float32Array, energyBefore: number): number {
  const eOut = energy(left, right)
  let peak = 0
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]))
  for (let i = 0; i < right.length; i++) peak = Math.max(peak, Math.abs(right[i]))
  if (eOut <= 0 || peak <= 0) return 1
  const g = Math.min(Math.sqrt(energyBefore / eOut), 2, 0.891 / peak)
  if (g === 1) return 1
  for (let i = 0; i < left.length; i++) left[i] *= g
  for (let i = 0; i < right.length; i++) right[i] *= g
  return g
}

export type StereoCheck = 'ok' | 'narrow' | 'not-stereo'

/**
 * Is there real stereo to work with? "not-stereo": left and right (nearly) the same, or one channel silent —
 * removing the center would remove (nearly) everything. "narrow": little difference between the channels — the
 * result may be weak.
 */
export function analyseStereo(left: Float32Array, right: Float32Array): StereoCheck {
  const n = Math.min(left.length, right.length)
  if (!n) return 'not-stereo'
  let el = 0
  let er = 0
  let es = 0
  let em = 0
  for (let i = 0; i < n; i++) {
    const l = left[i]
    const r = right[i]
    el += l * l
    er += r * r
    const s = (l - r) / 2
    const m = (l + r) / 2
    es += s * s
    em += m * m
  }
  const dbfs = (e: number) => 10 * Math.log10(e / n + 1e-30)
  if (dbfs(el) < -60 || dbfs(er) < -60) return 'not-stereo'
  const sideToMid = 10 * Math.log10((es + 1e-30) / (em + 1e-30))
  if (sideToMid < -40) return 'not-stereo'
  if (sideToMid < -20) return 'narrow'
  return 'ok'
}
