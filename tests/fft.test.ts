import { describe, expect, it } from 'vite-plus/test'
import { FFT } from '../src/shared/fft'

/** the textbook O(n²) transform, to compare against */
function naive(re: number[], im: number[], inverse = false): { re: number[]; im: number[] } {
  const n = re.length
  const sign = inverse ? 1 : -1
  const out = { re: Array.from({ length: n }, () => 0), im: Array.from({ length: n }, () => 0) }
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < n; t++) {
      const a = (sign * 2 * Math.PI * k * t) / n
      out.re[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a)
      out.im[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a)
    }
    if (inverse) {
      out.re[k] /= n
      out.im[k] /= n
    }
  }
  return out
}

const close = (a: ArrayLike<number>, b: ArrayLike<number>, eps = 1e-9) => {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(eps)
}

describe('FFT', () => {
  it('only takes a power of two', () => {
    expect(() => new FFT(0)).toThrow()
    expect(() => new FFT(1)).toThrow()
    expect(() => new FFT(12)).toThrow()
    expect(new FFT(2).n).toBe(2)
  })

  it('puts a sine wave in its two bins, with the right sign', () => {
    const n = 64
    const k = 5
    const re = Float64Array.from({ length: n }, (_, t) => Math.sin((2 * Math.PI * k * t) / n))
    const im = new Float64Array(n)
    new FFT(n).transform(re, im)
    // sin = (e^{iωt} − e^{−iωt}) / 2i → bin k: −i·n/2, bin n−k: +i·n/2, nothing elsewhere
    for (let b = 0; b < n; b++) {
      expect(Math.abs(re[b])).toBeLessThan(1e-9)
      const want = b === k ? -n / 2 : b === n - k ? n / 2 : 0
      expect(Math.abs(im[b] - want)).toBeLessThan(1e-9)
    }
  })

  it('matches the textbook transform (bit reversal, twiddles) both ways', () => {
    for (const n of [2, 4, 8, 32, 256]) {
      let seed = n
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1
      const re = Array.from({ length: n }, rnd)
      const im = Array.from({ length: n }, rnd)
      const fft = new FFT(n)
      const fr = Float64Array.from(re)
      const fi = Float64Array.from(im)
      fft.transform(fr, fi)
      const want = naive(re, im)
      close(fr, want.re, 1e-8)
      close(fi, want.im, 1e-8)
      const ir = Float64Array.from(re)
      const ii = Float64Array.from(im)
      fft.transform(ir, ii, true)
      const wantInv = naive(re, im, true)
      close(ir, wantInv.re, 1e-8)
      close(ii, wantInv.im, 1e-8)
    }
  })

  it('round-trips: the inverse (scaled by 1/n) gives back the input', () => {
    const n = 1024
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) + 0.25 * Math.cos(i * 1.9))
    const im = Float64Array.from({ length: n }, (_, i) => Math.cos(i * 0.11))
    const r = Float64Array.from(re)
    const m = Float64Array.from(im)
    const fft = new FFT(n)
    fft.transform(r, m)
    fft.transform(r, m, true)
    close(r, re)
    close(m, im)
  })

  it('a single impulse has a flat spectrum', () => {
    const n = 16
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    re[0] = 1
    new FFT(n).transform(re, im)
    close(re, new Float64Array(n).fill(1))
    close(im, new Float64Array(n))
  })
})
