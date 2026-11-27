import type { LiveState } from '@shared/types'

/**
 * Where the projector's sound goes (Settings → Screens → Sound output). The chosen device is found again by its
 * id or, when Chromium gave it a new id (ids are per page and profile), by its name. A device that isn't connected
 * plays through the Windows default and the operator is told once — never silence.
 */
type Output = LiveState['audioOutput']

let cache: { key: string; id: Promise<string> } | null = null
let reported = ''

const keyOf = (o: Output) => `${o?.id || ''}|${o?.label || ''}`

// a device plugged in (or out) later: look it up again next time, and tell the operator again if it is lost again
navigator.mediaDevices?.addEventListener?.('devicechange', () => {
  cache = null
  reported = ''
})

function report(key: string): void {
  if (reported === key) return
  reported = key
  window.api.output.sinkFailed()
}

/** the device id to play through ('' = the Windows default) */
function sinkFor(o: Output): Promise<string> {
  const key = keyOf(o)
  if (!o?.id && !o?.label) return Promise.resolve('')
  if (cache?.key === key) return cache.id
  const find = async () => {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput')
    return (outs.find((x) => !!o.id && x.deviceId === o.id) || outs.find((x) => !!o.label && x.label === o.label))?.deviceId
  }
  const id = (async () => {
    // right after the projector page starts (a relaunch), the device list can still be incomplete: look once more
    // before telling the operator the device is gone
    const found = (await find()) ?? (await new Promise((r) => setTimeout(r, 1000)).then(find))
    if (found) return found
    if (cache?.key === key) cache = null // not found: the next video looks again (no devicechange may ever come)
    report(key)
    return ''
  })().catch(() => {
    if (cache?.key === key) cache = null
    report(key)
    return ''
  })
  cache = { key, id }
  return id
}

/** Point an audio/video element at the chosen output. Await it before play(), so not a split second plays on the
 *  wrong speakers (often the projector's own, through HDMI). Never throws. */
export async function applySink(el: HTMLMediaElement, o: Output): Promise<void> {
  const id = await sinkFor(o)
  if (el.sinkId === id) return
  try {
    await el.setSinkId(id)
  } catch {
    report(keyOf(o))
    try {
      await el.setSinkId('')
    } catch {
      /* the default device is all there is */
    }
  }
}

/** a short, soft 880 Hz beep as a WAV blob URL (for Test sound) */
function toneUrl(): string {
  const rate = 22050
  const n = Math.round(rate * 0.7)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 600, (n - i) / 600) // no clicks at start/end
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 880 * i) / rate) * env * 0.3 * 32767), true)
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

/** Settings → Test sound: play the beep through the chosen output and tell main whether it played */
export async function playTestSound(o: Output): Promise<void> {
  const url = toneUrl()
  const a = new Audio(url)
  a.onended = () => URL.revokeObjectURL(url)
  try {
    await applySink(a, o)
    await a.play()
    window.api.output.testSoundResult({ ok: true })
  } catch {
    // it never played, so 'ended' never comes
    URL.revokeObjectURL(url)
    window.api.output.testSoundResult({ ok: false })
  }
}
