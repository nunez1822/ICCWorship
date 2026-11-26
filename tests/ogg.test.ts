import { describe, expect, it } from 'vite-plus/test'
import { DEFAULT_PRE_SKIP, lacing, oggCrc, OggOpusWriter, opusHead, preSkipFromDescription } from '@shared/ogg'

/* A small Ogg reader for the tests (the app never reads Ogg itself: Chromium does). */
interface Page {
  headerType: number
  granule: bigint
  serial: number
  seq: number
  segs: number[]
  body: Uint8Array
  crcOk: boolean
}
function readPages(file: Uint8Array): Page[] {
  const pages: Page[] = []
  let o = 0
  while (o < file.length) {
    expect(String.fromCharCode(...file.subarray(o, o + 4))).toBe('OggS')
    const v = new DataView(file.buffer, file.byteOffset + o)
    const n = file[o + 26]
    const segs = [...file.subarray(o + 27, o + 27 + n)]
    const bodyLen = segs.reduce((a, b) => a + b, 0)
    const len = 27 + n + bodyLen
    const raw = file.slice(o, o + len)
    const stored = new DataView(raw.buffer).getUint32(22, true)
    raw.fill(0, 22, 26)
    pages.push({
      headerType: file[o + 5],
      granule: v.getBigInt64(6, true),
      serial: v.getUint32(14, true),
      seq: v.getUint32(18, true),
      segs,
      body: file.slice(o + 27 + n, o + len),
      crcOk: oggCrc(raw) === stored
    })
    o += len
  }
  return pages
}
/** packets of a page, from its lacing values (no packet continues across pages in our files) */
function packetsOf(p: Page): Uint8Array[] {
  const out: Uint8Array[] = []
  let start = 0
  let len = 0
  for (const s of p.segs) {
    len += s
    if (s < 255) {
      out.push(p.body.slice(start, start + len))
      start += len
      len = 0
    }
  }
  expect(len).toBe(0) // the page ends with a complete packet
  return out
}
const pkt = (len: number, fill: number) => new Uint8Array(len).fill(fill)

describe('Ogg CRC', () => {
  it('matches the Ogg check value (CRC-32/POSIX without its final xor)', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f)
    expect(oggCrc(new Uint8Array())).toBe(0)
  })
})

describe('lacing', () => {
  it('splits packets into 255-byte segments, ending a multiple of 255 with a 0', () => {
    expect(lacing(0)).toEqual([0])
    expect(lacing(100)).toEqual([100])
    expect(lacing(255)).toEqual([255, 0])
    expect(lacing(510)).toEqual([255, 255, 0])
    expect(lacing(600)).toEqual([255, 255, 90])
  })
})

describe('Opus headers', () => {
  it('writes the 19-byte OpusHead (v1, channels, pre-skip, 48 kHz, gain 0, family 0)', () => {
    const h = opusHead(2, 312)
    expect(h.length).toBe(19)
    expect(String.fromCharCode(...h.subarray(0, 8))).toBe('OpusHead')
    expect([h[8], h[9], h[10] | (h[11] << 8), new DataView(h.buffer).getUint32(12, true), h[16], h[17], h[18]]).toEqual([1, 2, 312, 48000, 0, 0, 0])
  })
  it('reads the pre-skip from the encoder’s description, or uses libopus’ default', () => {
    expect(preSkipFromDescription(opusHead(2, 380))).toBe(380)
    expect(preSkipFromDescription(opusHead(2, 380).buffer as ArrayBuffer)).toBe(380)
    expect(preSkipFromDescription(undefined)).toBe(DEFAULT_PRE_SKIP)
    expect(preSkipFromDescription(new Uint8Array(30))).toBe(DEFAULT_PRE_SKIP)
    expect(DEFAULT_PRE_SKIP).toBe(312)
  })
})

describe('OggOpusWriter', () => {
  /** 10.5 s of 20 ms packets of varying size, as an encoder would make them */
  function encodeFake(packets: number, sizes: (i: number) => number, realLength: number, preSkip = 312) {
    const w = new OggOpusWriter(preSkip, { serial: 0x1234abcd })
    const sent: Uint8Array[] = []
    for (let i = 0; i < packets; i++) {
      const p = pkt(sizes(i), i & 0xff)
      sent.push(p)
      w.addPacket(p, 960)
    }
    return { file: w.finish(realLength), sent }
  }

  it('writes a stream Chromium can play, seek and time', () => {
    const real = 48000 * 10 + 123 // 10 s + a bit
    const n = Math.ceil((real + 312) / 960) + 1 // what the encoder outputs (padding + its flush frame)
    const { file, sent } = encodeFake(n, (i) => 200 + ((i * 37) % 300), real)
    const pages = readPages(file)

    expect(pages.every((p) => p.crcOk)).toBe(true)
    expect(pages.map((p) => p.seq)).toEqual(pages.map((_, i) => i)) // no gaps
    expect(new Set(pages.map((p) => p.serial))).toEqual(new Set([0x1234abcd]))
    // BOS only on page 0, EOS only on the last page
    expect(pages.map((p) => p.headerType)).toEqual([2, ...Array(pages.length - 2).fill(0), 4])
    // headers alone on their pages, granule 0
    expect(String.fromCharCode(...pages[0].body.subarray(0, 8))).toBe('OpusHead')
    expect(String.fromCharCode(...pages[1].body.subarray(0, 8))).toBe('OpusTags')
    expect([pages[0].granule, pages[1].granule]).toEqual([0n, 0n])
    // segment tables add up, packets come back unchanged and in order
    for (const p of pages) expect(p.segs.reduce((a, b) => a + b, 0)).toBe(p.body.length)
    const back = pages.slice(2).flatMap(packetsOf)
    expect(back).toEqual(sent)
    // granules never go down, and the end trims the padding: preSkip + the real length
    const g = pages.slice(2).map((p) => Number(p.granule))
    for (let i = 1; i < g.length; i++) expect(g[i]).toBeGreaterThanOrEqual(g[i - 1])
    expect(g[g.length - 1]).toBe(312 + real)
    // the trim stays inside the last page (it holds the last packets)
    expect(packetsOf(pages[pages.length - 1]).length).toBeGreaterThanOrEqual(3)
    expect(g[g.length - 2]).toBeLessThan(312 + real)
    // about one second per page (seeking stays granular)
    expect(pages.length - 2).toBeGreaterThanOrEqual(Math.floor(n / 50))
  })

  it('never puts more than 255 lacing values on a page (maximum-size Opus packets)', () => {
    const { file, sent } = encodeFake(300, () => 1275, 300 * 960 - 1000)
    const pages = readPages(file)
    for (const p of pages) expect(p.segs.length).toBeLessThanOrEqual(255)
    expect(pages.slice(2).flatMap(packetsOf)).toEqual(sent)
  })

  it('handles packets of exactly 255 and 510 bytes (they need a trailing 0 lacing value)', () => {
    const { file, sent } = encodeFake(10, (i) => (i % 2 ? 510 : 255), 9 * 960)
    const pages = readPages(file)
    expect(pages.slice(2).flatMap(packetsOf)).toEqual(sent)
    expect(pages[2].segs.slice(0, 4)).toEqual([255, 0, 255, 255])
  })

  it('never ends before the previous page or past what was encoded', () => {
    const short = encodeFake(4, () => 100, 48000) // asked for more than was encoded
    const pages = readPages(short.file)
    expect(Number(pages[pages.length - 1].granule)).toBe(4 * 960)
    const zero = readPages(encodeFake(4, () => 100, 0).file)
    expect(Number(zero[zero.length - 1].granule)).toBe(312)
  })

  it('refuses an empty stream', () => {
    expect(() => new OggOpusWriter(312).finish(0)).toThrow('no audio')
  })
})
