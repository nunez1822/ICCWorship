import { OggOpusWriter, preSkipFromDescription } from '@shared/ogg'

/**
 * Encode 48 kHz stereo PCM to an Ogg/Opus file with Chromium's built-in Opus encoder (WebCodecs) — no extra
 * library, works offline. Runs in the backing-track worker. Feeds 1-second blocks and waits while the encoder is
 * busy, so a long song never sits in memory twice.
 */
export const OPUS_CONFIG: AudioEncoderConfig = {
  codec: 'opus',
  sampleRate: 48000,
  numberOfChannels: 2,
  bitrate: 160_000,
  opus: { frameDuration: 20_000, complexity: 9 }
}

export async function opusSupported(): Promise<boolean> {
  try {
    return typeof AudioEncoder !== 'undefined' && (await AudioEncoder.isConfigSupported(OPUS_CONFIG)).supported === true
  } catch {
    return false
  }
}

export async function encodeOggOpus(left: Float32Array, right: Float32Array, onProgress?: (fraction: number) => void): Promise<Uint8Array> {
  const rate = 48000
  const n = left.length
  let writer: OggOpusWriter | null = null
  let preSkip = 0
  let failure: unknown = null
  let encodedUs = 0
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      if (!writer) {
        preSkip = preSkipFromDescription(meta?.decoderConfig?.description as ArrayBuffer | undefined)
        writer = new OggOpusWriter(preSkip)
      }
      const b = new Uint8Array(chunk.byteLength)
      chunk.copyTo(b)
      writer.addPacket(b, Math.round((chunk.duration ?? 20_000) * 0.048) || 960)
      encodedUs = chunk.timestamp + (chunk.duration ?? 0)
    },
    error: (e) => {
      failure = e
    }
  })
  encoder.configure(OPUS_CONFIG)
  const waitQueue = () => new Promise<void>((r) => encoder.addEventListener('dequeue', () => r(), { once: true }))
  const feed = (start: number, frames: number, tail: boolean) => {
    const data = new Float32Array(frames * 2)
    if (!tail) {
      data.set(left.subarray(start, start + frames), 0)
      data.set(right.subarray(start, start + frames), frames)
    } // the tail is silence: it lets the decoder's delay (pre-skip) play out the real end of the song
    const ad = new AudioData({
      format: 'f32-planar',
      sampleRate: rate,
      numberOfFrames: frames,
      numberOfChannels: 2,
      timestamp: Math.round((start * 1e6) / rate),
      data
    })
    encoder.encode(ad)
    ad.close()
  }
  const totalUs = (n / rate) * 1e6
  for (let s = 0; s < n; s += rate) {
    if (failure) break
    feed(s, Math.min(rate, n - s), false)
    while (encoder.encodeQueueSize > 4) await waitQueue()
    onProgress?.(Math.min(0.99, encodedUs / totalUs))
  }
  // silence for the encoder's look-ahead (known from its first packet), so no real audio is cut at the end
  if (!failure) feed(n, Math.max(preSkip, 312), true)
  await encoder.flush().catch((e) => (failure ??= e))
  encoder.close()
  if (failure || !writer) throw new Error('encoder')
  onProgress?.(1)
  return (writer as OggOpusWriter).finish(n)
}
