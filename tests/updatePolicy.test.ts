import { describe, expect, it } from 'vite-plus/test'
import {
  automaticCheckDue,
  CLEARED_STILL_LIVE_MS,
  installNow,
  installOnQuit,
  isLive,
  mayDownload,
  onScreen,
  OnScreenClock,
  UPDATE_CHECK_EVERY_MS,
  updaterLogLine,
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

describe('OnScreenClock (when something was last on screen)', () => {
  const H = 60 * 60 * 1000
  function setup() {
    const t = { wall: NOW, mono: 5_000 }
    const clock = new OnScreenClock({ wall: () => t.wall, mono: () => t.mono })
    const pass = (ms: number) => ((t.wall += ms), (t.mono += ms))
    return { t, clock, pass }
  }
  it('is undefined until something was on screen', () => {
    expect(setup().clock.lastAt(undefined)).toBeUndefined()
  })
  it('measures elapsed time on the monotonic clock: Windows setting its time forward does not end the service', () => {
    const { t, clock, pass } = setup()
    clock.seen()
    pass(10 * 60 * 1000)
    t.wall += 3 * H // the clock corrected meanwhile
    expect(t.wall - clock.lastAt(undefined)!).toBe(10 * 60 * 1000)
  })
  it('adds back sleep the monotonic clock missed, and never subtracts', () => {
    const { t, clock } = setup()
    clock.seen()
    clock.suspended()
    t.wall += 8 * H // asleep all night; the monotonic clock didn't run
    clock.resumed()
    expect(t.wall - clock.lastAt(undefined)!).toBe(8 * H)
    // a monotonic clock that did run while asleep: nothing more is added
    const b = setup()
    b.clock.seen()
    b.clock.suspended()
    b.pass(8 * H)
    b.clock.resumed()
    expect(b.t.wall - b.clock.lastAt(undefined)!).toBe(8 * H)
    // the wall clock set back while asleep: never pushes "last on screen" into the future
    const c = setup()
    c.clock.seen()
    c.clock.suspended()
    c.t.wall -= H
    c.clock.resumed()
    expect(c.clock.lastAt(undefined)!).toBeLessThanOrEqual(c.t.wall)
    // a wake-up with no sleep before it, or nothing on screen yet: no change
    const d = setup()
    d.clock.resumed()
    d.clock.suspended()
    d.t.wall += H
    d.clock.resumed()
    expect(d.clock.lastAt(undefined)).toBeUndefined()
  })
  it('counts a timed message until it ran out (nothing updates the live state then)', () => {
    const { t, clock, pass } = setup()
    clock.seen()
    pass(H)
    expect(clock.lastAt(t.wall - 10 * 60 * 1000)).toBe(t.wall - 10 * 60 * 1000) // ran out 10 min ago
    expect(clock.lastAt(t.wall + 60_000)).toBe(t.wall - H) // still showing: onScreen covers it
    expect(clock.lastAt(t.wall - 2 * H)).toBe(t.wall - H) // ran out before the last thing shown
  })
})

describe('updaterLogLine (log lines attached to public bug reports)', () => {
  it('keeps the message but not URLs, file paths (the Windows user name) or the per-install id', () => {
    expect(updaterLogLine("Couldn't read out staging user ID: Error: EPERM: open 'C:\\Users\\Jane Doe\\AppData\\Roaming\\ICCWorship\\.updaterId'")).toBe(
      "Couldn't read out staging user ID: Error: EPERM: open '<path>'"
    )
    expect(updaterLogLine('Staging user id file exists, but content was invalid: 3f2a9c1e-1111-2222-3333-444455556666')).toBe(
      'Staging user id file exists, but content was invalid: <id>'
    )
    expect(updaterLogLine('Cannot parse blockmap "\\\\server\\share\\x.blockmap", error: bad')).toBe('Cannot parse blockmap "<path>", error: bad')
    expect(updaterLogLine('see https://github.com/x/y/releases\nsecond line')).toBe('see <url>')
    expect(updaterLogLine('Update for version 1.2.0 is not available')).toBe('Update for version 1.2.0 is not available')
  })
})
