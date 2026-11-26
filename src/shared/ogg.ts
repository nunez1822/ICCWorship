/**
 * A minimal Ogg Opus writer (RFC 3533 pages, RFC 7845 Opus mapping) for backing tracks encoded with WebCodecs'
 * AudioEncoder. Pure: unit tested in tests/ogg.test.ts.
 *
 * What makes Chromium's <audio> play the file, seek in it and show its duration:
 * - page 0 holds only OpusHead (BOS), page 1 only OpusTags, both with granule position 0;
 * - every audio page's granule position is the number of 48 kHz samples decoded so far (pre-skip included);
 * - a packet is never split across pages, and a page never has more than 255 lacing values;
 * - the last page has EOS and the granule position preSkip + the real length, which trims the encoder's padding
 *   (it always holds the last few packets, so the trim stays inside it);
 * - every page has the Ogg CRC (polynomial 0x04C11DB7, not reflected, initial value 0, no final xor).
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < bytes.length; i++) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ bytes[i]) & 0xff]) >>> 0
  return crc >>> 0
}

/** libopus' look-ahead at 48 kHz: the pre-skip when the encoder doesn't say */
export const DEFAULT_PRE_SKIP = 312

/** The pre-skip from WebCodecs' decoderConfig.description (an OpusHead), or the default. */
export function preSkipFromDescription(desc?: ArrayBuffer | ArrayBufferView | null): number {
  if (!desc) return DEFAULT_PRE_SKIP
  const b = ArrayBuffer.isView(desc) ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength) : new Uint8Array(desc)
  const magic = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64] // "OpusHead"
  if (b.length < 19 || magic.some((c, i) => b[i] !== c)) return DEFAULT_PRE_SKIP
  return b[10] | (b[11] << 8)
}

/** the 19-byte identification header: version 1, `channels`, pre-skip, 48000 Hz, gain 0, mapping family 0 */
export function opusHead(channels: number, preSkip: number): Uint8Array {
  const b = new Uint8Array(19)
  const v = new DataView(b.buffer)
  b.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64]) // "OpusHead"
  b[8] = 1
  b[9] = channels
  v.setUint16(10, preSkip, true)
  v.setUint32(12, 48000, true)
  v.setInt16(16, 0, true)
  b[18] = 0
  return b
}

export function opusTags(vendor = 'ICCWorship'): Uint8Array {
  const vend = new TextEncoder().encode(vendor)
  const b = new Uint8Array(8 + 4 + vend.length + 4)
  const v = new DataView(b.buffer)
  b.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73]) // "OpusTags"
  v.setUint32(8, vend.length, true)
  b.set(vend, 12)
  v.setUint32(12 + vend.length, 0, true) // no user comments
  return b
}

/** lacing values of one packet: as many 255s as fit, then the rest (a multiple of 255 ends with a 0) */
export function lacing(len: number): number[] {
  const out: number[] = Array.from({ length: Math.floor(len / 255) }, () => 255)
  out.push(len % 255)
  return out
}

const BOS = 0x02
const EOS = 0x04
/** at most this many packets per page (~1 s of 20 ms Opus frames): keeps seeking granular */
const MAX_PACKETS_PER_PAGE = 50
/** the last page keeps at least this many packets, so trimming the padding never reaches into an earlier page */
const KEEP_FOR_LAST_PAGE = 3

function page(headerType: number, granule: bigint, serial: number, seq: number, packets: Uint8Array[]): Uint8Array {
  const segs = packets.flatMap((p) => lacing(p.length))
  if (segs.length > 255) throw new Error('page too large')
  const bodyLen = packets.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(27 + segs.length + bodyLen)
  const v = new DataView(out.buffer)
  out.set([0x4f, 0x67, 0x67, 0x53]) // "OggS"
  out[4] = 0 // version
  out[5] = headerType
  v.setBigInt64(6, granule, true)
  v.setUint32(14, serial, true)
  v.setUint32(18, seq, true)
  // CRC (bytes 22..25) stays 0 while it is computed
  out[26] = segs.length
  out.set(segs, 27)
  let o = 27 + segs.length
  for (const p of packets) {
    out.set(p, o)
    o += p.length
  }
  v.setUint32(22, oggCrc(out), true)
  return out
}

/**
 * Collects Opus packets as the encoder produces them and writes Ogg pages. Call `finish(realLength)` once the
 * encoder is flushed; it returns the whole file.
 */
export class OggOpusWriter {
  private pages: Uint8Array[] = []
  private pending: { data: Uint8Array; samples: number }[] = []
  private seq = 0
  private granule = 0
  private readonly serial: number

  constructor(
    private readonly preSkip: number,
    opts: { channels?: number; serial?: number; vendor?: string } = {}
  ) {
    this.serial = (opts.serial ?? Math.floor(Math.random() * 0xffffffff)) >>> 0
    this.pages.push(page(BOS, 0n, this.serial, this.seq++, [opusHead(opts.channels ?? 2, preSkip)]))
    this.pages.push(page(0, 0n, this.serial, this.seq++, [opusTags(opts.vendor)]))
  }

  /** one encoded Opus packet and how many 48 kHz samples it decodes to */
  addPacket(data: Uint8Array, samples: number): void {
    if (data.length > 65025) throw new Error('packet too large') // never in Opus (max 1275 bytes per frame)
    this.pending.push({ data, samples })
    while (this.pending.length > MAX_PACKETS_PER_PAGE + KEEP_FOR_LAST_PAGE) this.flushPage(this.takeForPage(this.pending.length - KEEP_FOR_LAST_PAGE))
  }

  /** the leading packets that fit one page (≤ 50 packets, ≤ 255 lacing values), leaving at least `leave` */
  private takeForPage(maxCount: number): { data: Uint8Array; samples: number }[] {
    let segs = 0
    let n = 0
    while (n < Math.min(maxCount, MAX_PACKETS_PER_PAGE, this.pending.length)) {
      const s = lacing(this.pending[n].data.length).length
      if (segs + s > 255) break
      segs += s
      n++
    }
    return this.pending.splice(0, Math.max(1, n))
  }

  private flushPage(packets: { data: Uint8Array; samples: number }[], last = false, finalGranule?: number): void {
    for (const p of packets) this.granule += p.samples
    const g = last && finalGranule !== undefined ? finalGranule : this.granule
    this.pages.push(
      page(
        last ? EOS : 0,
        BigInt(g),
        this.serial,
        this.seq++,
        packets.map((p) => p.data)
      )
    )
  }

  /**
   * Write the remaining packets; the last page ends the stream at `preSkip + realLength` samples (never past what
   * was encoded, never before the previous page). Returns the complete .ogg file.
   */
  finish(realLength: number): Uint8Array {
    if (!this.pending.length) throw new Error('no audio')
    for (;;) {
      const fitsOnePage = this.pending.length <= MAX_PACKETS_PER_PAGE && this.pending.reduce((n, p) => n + lacing(p.data.length).length, 0) <= 255
      if (!fitsOnePage) {
        // an earlier page, leaving enough packets for the last one
        this.flushPage(this.takeForPage(this.pending.length - KEEP_FOR_LAST_PAGE))
        continue
      }
      const packets = this.pending.splice(0)
      const before = this.granule
      const encoded = before + packets.reduce((n, p) => n + p.samples, 0)
      const target = Math.max(before, Math.min(encoded, this.preSkip + Math.max(0, Math.round(realLength))))
      this.flushPage(packets, true, target)
      break
    }
    const total = this.pages.reduce((n, p) => n + p.length, 0)
    const out = new Uint8Array(total)
    let o = 0
    for (const p of this.pages) {
      out.set(p, o)
      o += p.length
    }
    return out
  }
}
