import { describe, expect, it } from 'vite-plus/test'
import { automaticCheckDue, installNow, isLive, mayDownload, UPDATE_CHECK_EVERY_MS, type UpdatePhase } from '@shared/updatePolicy'

const NOW = 1_800_000_000_000
const idle: UpdatePhase = { phase: 'idle' }
const ready: UpdatePhase = { phase: 'ready', version: '1.2.0' }

describe('isLive', () => {
  it('a slide on screen or a video/track playing is live', () => {
    expect(isLive({ slideIndex: 0 })).toBe(true)
    expect(isLive({ slideIndex: -1, video: { playing: true } as never })).toBe(true)
    expect(isLive({ slideIndex: -1 })).toBe(false)
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
  it('installs a downloaded update only when nothing is live', () => {
    expect(installNow({ live: false, phase: ready })).toBe('install')
    expect(installNow({ live: true, phase: ready })).toBe('live')
    expect(installNow({ live: false, phase: idle })).toBe('not-ready')
  })
})
