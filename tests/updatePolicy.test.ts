import { describe, expect, it } from 'vite-plus/test'
import {
  automaticCheckDue,
  CLEARED_STILL_LIVE_MS,
  installNow,
  installOnQuit,
  isLive,
  mayDownload,
  onScreen,
  UPDATE_CHECK_EVERY_MS,
  type UpdatePhase
} from '@shared/updatePolicy'

const NOW = 1_800_000_000_000
const idle: UpdatePhase = { phase: 'idle' }
const ready: UpdatePhase = { phase: 'ready', version: '1.2.0' }

describe('isLive', () => {
  it('a slide on screen or a video/track playing is live', () => {
    expect(isLive({ slideIndex: 0 })).toBe(true)
    expect(isLive({ slideIndex: -1, video: { playing: true } as never })).toBe(true)
    expect(isLive({ slideIndex: -1 })).toBe(false)
  })
  it('the logo, a running message, or a screen cleared mid-item (Esc) also count', () => {
    const layers = { black: false, clearText: false, clearBackground: false, logo: true }
    expect(isLive({ slideIndex: -1, layers })).toBe(true)
    expect(isLive({ slideIndex: -1, message: { text: 'x', seq: 1 } }, NOW)).toBe(true)
    expect(isLive({ slideIndex: -1, message: { text: 'x', seq: 1, until: NOW + 1000 } }, NOW)).toBe(true)
    expect(isLive({ slideIndex: -1, message: { text: 'x', seq: 1, until: NOW - 1000 } }, NOW)).toBe(false) // ran out
    expect(isLive({ slideIndex: -1, clearedFrom: 3 }, NOW, NOW - 60_000)).toBe(true)
  })
  it('a cleared screen stops counting a while after something was last on screen (a service ended with Esc)', () => {
    expect(isLive({ slideIndex: -1, clearedFrom: 3 }, NOW, NOW - CLEARED_STILL_LIVE_MS + 1000)).toBe(true) // a long sermon
    expect(isLive({ slideIndex: -1, clearedFrom: 3 }, NOW, NOW - CLEARED_STILL_LIVE_MS)).toBe(false)
    expect(isLive({ slideIndex: -1, clearedFrom: 3 }, NOW)).toBe(false) // nothing was on screen this run
  })
})

describe('onScreen', () => {
  it('is what the congregation sees: a cleared screen (Esc) is not on screen', () => {
    expect(onScreen({ slideIndex: 2 })).toBe(true)
    expect(onScreen({ slideIndex: -1, clearedFrom: 3 })).toBe(false)
  })
})

describe('installOnQuit', () => {
  it('installs at quit only when still wanted, ready, and nothing is on screen', () => {
    expect(installOnQuit({ allowed: true, onScreen: false, phase: ready })).toBe(true)
    expect(installOnQuit({ allowed: true, onScreen: true, phase: ready })).toBe(false) // closed mid-song
    expect(installOnQuit({ allowed: false, onScreen: false, phase: ready })).toBe(false) // turned off after downloading
    expect(installOnQuit({ allowed: true, onScreen: false, phase: idle })).toBe(false)
  })
})

describe('automaticCheckDue', () => {
  it('only when turned on, nothing is live, and a day has passed', () => {
    expect(automaticCheckDue({ enabled: true, now: NOW, live: false })).toBe(true)
    expect(automaticCheckDue({ enabled: false, now: NOW, live: false })).toBe(false)
    expect(automaticCheckDue({ enabled: true, now: NOW, live: true })).toBe(false)
    expect(automaticCheckDue({ enabled: true, lastCheck: NOW - 1000, now: NOW, live: false })).toBe(false)
    expect(automaticCheckDue({ enabled: true, lastCheck: NOW - UPDATE_CHECK_EVERY_MS, now: NOW, live: false })).toBe(true)
  })
  it('a clock set back does not stop checks for good', () => {
    expect(automaticCheckDue({ enabled: true, lastCheck: NOW + 10 * UPDATE_CHECK_EVERY_MS, now: NOW, live: false })).toBe(true)
  })
})

describe('mayDownload', () => {
  const base = { selfUpdate: true, autoUpdate: true, live: false, phase: idle }
  it('the installed app downloads when allowed and nothing is live', () => {
    expect(mayDownload(base)).toBe(true)
    expect(mayDownload({ ...base, phase: { phase: 'failed', version: '1.2.0' } })).toBe(true) // try again
  })
  it('never while live, for the portable exe, when turned off, or twice', () => {
    expect(mayDownload({ ...base, live: true })).toBe(false)
    expect(mayDownload({ ...base, selfUpdate: false })).toBe(false)
    expect(mayDownload({ ...base, autoUpdate: false })).toBe(false)
    expect(mayDownload({ ...base, phase: { phase: 'downloading', version: '1.2.0', percent: 10 } })).toBe(false)
    expect(mayDownload({ ...base, phase: ready })).toBe(false)
  })
})

describe('installNow', () => {
  it('installs a downloaded update only when nothing is on screen and updates are still on', () => {
    expect(installNow({ allowed: true, onScreen: false, phase: ready })).toBe('install')
    expect(installNow({ allowed: true, onScreen: true, phase: ready })).toBe('live')
    expect(installNow({ allowed: true, onScreen: false, phase: idle })).toBe('not-ready')
    expect(installNow({ allowed: false, onScreen: false, phase: ready })).toBe('off') // turned off after downloading
  })
})
