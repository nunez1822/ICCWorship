import { describe, expect, it } from 'vite-plus/test'
import { FFT } from '@shared/fft'
import { analyseStereo, applyOutputGain, energy, removeCenter, VOICE_PRESETS, type VoiceOptions } from '@shared/vocalRemoval'

/* Synthetic signals only (no music): sine tones placed left / center / right, measured with Goertzel. */
const RATE = 48000
const LEN = Math.round(RATE * 1.5)

const tone = (hz: number, amp = 0.3, len = LEN) => Float32Array.from({ length: len }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE))
const mix = (...xs: Float32Array[]) => Float32Array.from({ length: xs[0].length }, (_, i) => xs.reduce((s, x) => s + x[i], 0))
const scale = (x: Float32Array, g: number) => x.map((v) => v * g)
const zeros = (len = LEN) => new Float32Array(len)

/** level of one frequency (Goertzel), over a steady middle segment (no edges, smoothing settled) */
function level(x: Float32Array, hz: number): number {
  const a = Math.floor(x.length * 0.3)
  const b = Math.floor(x.length * 0.8)
  const w = (2 * Math.PI * hz) / RATE
  const c = 2 * Math.cos(w)
  let s1 = 0
  let s2 = 0
  for (let i = a; i < b; i++) {
    const s = x[i] + c * s1 - s2
    s2 = s1
    s1 = s
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / (b - a)
}
const db = (after: number, before: number) => 20 * Math.log10((after + 1e-12) / (before + 1e-12))

/** run the voice remover on copies; returns the outputs */
function run(l: Float32Array, r: Float32Array, o: VoiceOptions) {
  const L = l.slice()
  const R = r.slice()
  const removed = removeCenter(L, R, o)
  return { L, R, removed }
}

describe('FFT', () => {
  it('matches a plain DFT', () => {
    const n = 64
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1))
    const im = Float64Array.from({ length: n }, (_, i) => 0.5 * Math.sin(i * 1.3))
    const want = Array.from({ length: n }, (_, k) => {
      let a = 0
      let b = 0
      for (let t = 0; t < n; t++) {
        const ang = (-2 * Math.PI * k * t) / n
        a += re[t] * Math.cos(ang) - im[t] * Math.sin(ang)
        b += re[t] * Math.sin(ang) + im[t] * Math.cos(ang)
      }
      return [a, b]
    })
    const r2 = re.slice()
    const i2 = im.slice()
    new FFT(n).transform(r2, i2)
    for (let k = 0; k < n; k++) {
      expect(r2[k]).toBeCloseTo(want[k][0], 9)
      expect(i2[k]).toBeCloseTo(want[k][1], 9)
    }
    new FFT(n).transform(r2, i2, true)
    for (let t = 0; t < n; t++) {
      expect(r2[t]).toBeCloseTo(re[t], 12)
      expect(i2[t]).toBeCloseTo(im[t], 12)
    }
  })
  it('refuses sizes that are not a power of two', () => {
    expect(() => new FFT(1000)).toThrow()
  })
})

describe('removeCenter: the frame-by-frame processing itself', () => {
  it('gives back the input exactly when it removes nothing — edges, odd lengths and all', () => {
    for (const len of [LEN, 12345, 3000, 1]) {
      const l = Float32Array.from({ length: len }, (_, i) => Math.sin(i * 0.013) * 0.4 + ((i * 7919) % 13) / 100 - 0.06)
      const r = Float32Array.from({ length: len }, (_, i) => Math.cos(i * 0.021) * 0.3)
      const { L, R } = run(l, r, { ...VOICE_PRESETS.normal, strength: 0 })
      expect(L.length).toBe(len)
      let worst = 0
      for (let i = 0; i < len; i++) worst = Math.max(worst, Math.abs(L[i] - l[i]), Math.abs(R[i] - r[i]))
      expect(worst).toBeLessThan(1e-4)
    }
  })
  it('handles silence and silence around a tone without NaN', () => {
    const sil = zeros(RATE * 2)
    const l = new Float32Array(RATE * 5)
    l.set(tone(1000, 0.3, RATE), RATE * 2)
    const r = l.slice()
    const { L, R, removed } = run(l, r, VOICE_PRESETS.normal)
    expect(L.every(Number.isFinite) && R.every(Number.isFinite)).toBe(true)
    expect(removed).toBeGreaterThan(0)
    const s = run(sil, sil.slice(), VOICE_PRESETS.more)
    expect(s.L.every((v) => v === 0)).toBe(true)
    expect(s.removed).toBe(0)
  })
  it('reports progress up to 1', () => {
    const seen: number[] = []
    removeCenter(tone(500), tone(500), VOICE_PRESETS.normal, (f) => seen.push(f))
    expect(seen.at(-1)).toBe(1)
    expect(seen.every((f, i) => i === 0 || f >= seen[i - 1])).toBe(true)
  })
})

describe('removeCenter: what it takes out and what it leaves', () => {
  for (const preset of ['normal', 'more'] as const) {
    it(`${preset}: takes out a centered 1 kHz voice-like tone, keeps a hard-left 1.5 kHz one`, () => {
      const center = tone(1000)
      const left = tone(1500)
      const { L, R } = run(mix(center, left), center, VOICE_PRESETS[preset])
      expect(db(level(L, 1000), level(center, 1000))).toBeLessThan(-20)
      expect(db(level(R, 1000), level(center, 1000))).toBeLessThan(-20)
      expect(Math.abs(db(level(L, 1500), level(left, 1500)))).toBeLessThan(1)
    })
    it(`${preset}: separates close frequencies (1000 Hz center, 1100 Hz left)`, () => {
      const center = tone(1000)
      const left = tone(1100)
      const { L } = run(mix(center, left), center, VOICE_PRESETS[preset])
      expect(db(level(L, 1000), level(center, 1000))).toBeLessThan(-20)
      expect(Math.abs(db(level(L, 1100), level(left, 1100)))).toBeLessThan(1)
    })
  }

  it('"less" leaves about −16.5 dB of a perfectly centered sound (strength is the residual)', () => {
    const c = tone(1000)
    const { L } = run(c, c.slice(), VOICE_PRESETS.less)
    expect(db(level(L, 1000), level(c, 1000))).toBeCloseTo(-16.5, 0)
  })

  it('keeps a sound panned off-center (−9 dB on one side), takes a nearly-centered one (−3 dB) partly', () => {
    const l = tone(1000)
    for (const preset of ['normal', 'more'] as const) {
      const { L } = run(l, scale(l, 0.35), VOICE_PRESETS[preset])
      expect(Math.abs(db(level(L, 1000), level(l, 1000)))).toBeLessThan(1)
    }
    const { L } = run(l, scale(l, 0.708), VOICE_PRESETS.normal)
    expect(db(level(L, 1000), level(l, 1000))).toBeLessThan(-3)
  })

  it('never leaks a hard-left sound into the right channel', () => {
    const l = tone(1000)
    const { R } = run(l, zeros(), VOICE_PRESETS.more)
    expect(db(level(R, 1000), level(l, 1000))).toBeLessThan(-40)
  })

  it('keeps anti-phase sound (stereo wideners) on every preset', () => {
    const l = tone(1000)
    for (const preset of ['less', 'normal', 'more'] as const) {
      const { L } = run(l, scale(l, -1), VOICE_PRESETS[preset])
      expect(Math.abs(db(level(L, 1000), level(l, 1000)))).toBeLessThan(1)
    }
  })

  it('leaves the mono sum of an off-center sound alone (mono church PAs)', () => {
    const l = tone(1000)
    const r = scale(l, 0.35)
    const { L, R } = run(l, r, VOICE_PRESETS.normal)
    expect(Math.abs(db(level(mix(L, R), 1000), level(mix(l, r), 1000)))).toBeLessThan(1)
  })

  it('barely touches unrelated left/right noise (reverb, wide pads)', () => {
    let seed = 1
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 0.3
    const l = Float32Array.from({ length: LEN }, rnd)
    const r = Float32Array.from({ length: LEN }, rnd)
    for (const preset of ['normal', 'more'] as const) {
      const { L, R } = run(l, r, VOICE_PRESETS[preset])
      expect(10 * Math.log10(energy(L, R) / energy(l, r))).toBeGreaterThan(-3)
    }
  })

  it('keeps centered bass and very high sounds (outside the band)', () => {
    for (const hz of [60, 16000]) {
      const c = tone(hz)
      for (const preset of ['less', 'normal', 'more'] as const) {
        const { L } = run(c, c.slice(), VOICE_PRESETS[preset])
        expect(Math.abs(db(level(L, hz), level(c, hz)))).toBeLessThan(1)
      }
    }
  })

  it('says how much it took out', () => {
    const c = tone(1000)
    expect(run(c, c.slice(), VOICE_PRESETS.more).removed).toBeGreaterThan(0.8)
    expect(run(tone(1000), zeros(), VOICE_PRESETS.more).removed).toBeLessThan(0.01)
  })
})

describe('applyOutputGain', () => {
  it('brings the level back up, at most +6 dB, never above −1 dBFS', () => {
    const l = tone(1000, 0.1)
    const r = tone(1000, 0.1)
    const g = applyOutputGain(l, r, energy(l, r) * 100) // "it was 20 dB louder before"
    expect(g).toBe(2) // capped at +6 dB
    expect(Math.max(...l.map(Math.abs))).toBeCloseTo(0.2, 3)
    const loud = tone(500, 0.6)
    const g2 = applyOutputGain(loud, loud.slice(), energy(loud, loud) * 4)
    expect(Math.max(...loud.map(Math.abs))).toBeLessThanOrEqual(0.8911)
    expect(g2).toBeCloseTo(0.891 / 0.6, 2)
  })
  it('is one gain for the whole song (a kept tone changes by exactly g)', () => {
    const l = mix(tone(300, 0.1), tone(2000, 0.05))
    const before = level(l, 2000)
    const g = applyOutputGain(l, l.slice(), energy(l, l) * 2)
    expect(level(l, 2000) / before).toBeCloseTo(g, 4)
  })
})

describe('analyseStereo', () => {
  it('tells real stereo, narrow stereo and mono-like files apart', () => {
    const c = tone(440)
    expect(analyseStereo(mix(c, tone(1500)), c)).toBe('ok')
    expect(analyseStereo(c, c.slice())).toBe('not-stereo') // the same on both sides
    expect(analyseStereo(c, zeros())).toBe('not-stereo') // one side silent
    expect(analyseStereo(mix(c, tone(1500, 0.01)), c)).toBe('narrow')
    expect(analyseStereo(new Float32Array(0), new Float32Array(0))).toBe('not-stereo')
  })
})
