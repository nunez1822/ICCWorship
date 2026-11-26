import { describe, expect, it, vi } from 'vitest'
import { Heartbeat, ReloadBudget } from '@shared/recovery'
import { isNewerVersion } from '@shared/version'

describe('ReloadBudget', () => {
  it('reloads, then switches to safe mode, then gives up — never loops forever', () => {
    const b = new ReloadBudget(3, 60_000)
    expect([b.next(0), b.next(1000), b.next(2000)]).toEqual(['reload', 'reload', 'reload'])
    expect(b.next(3000)).toBe('safe')
    expect(b.inSafeMode).toBe(true)
    expect(b.next(4000)).toBe('give-up')
  })
  it('forgives crashes that are far apart', () => {
    const b = new ReloadBudget(3, 60_000)
    for (let i = 0; i < 10; i++) expect(b.next(i * 61_000)).toBe('reload')
  })
  it('keeps reloading in safe mode once it is there, and starts over after reset', () => {
    const b = new ReloadBudget(1, 60_000)
    expect(b.next(0)).toBe('reload')
    expect(b.next(1)).toBe('safe')
    expect(b.next(70_000)).toBe('safe')
    b.reset()
    expect(b.next(70_001)).toBe('reload')
  })
})

describe('Heartbeat', () => {
  /** a clock the test moves; `tick` runs check() every second like the real interval does */
  function setup() {
    const clock = { t: 0 }
    const onStall = vi.fn()
    const h = new Heartbeat(onStall, 8000, () => clock.t)
    const tick = (ms: number) => {
      for (let end = clock.t + ms; clock.t < end;) {
        clock.t += 1000
        h.check()
      }
    }
    return { clock, onStall, h, tick }
  }

  it('reports a stall only after beats stop', () => {
    const { onStall, h, tick } = setup()
    h.check()
    expect(onStall).not.toHaveBeenCalled() // never started beating: not watched
    h.beat()
    tick(5000)
    expect(onStall).not.toHaveBeenCalled()
    h.beat()
    tick(9000)
    expect(onStall).toHaveBeenCalledTimes(1)
    tick(20_000)
    expect(onStall).toHaveBeenCalledTimes(1) // stopped after reporting
    h.stop()
  })

  it('does not blame the page when the whole PC was asleep (no suspend event)', () => {
    const { clock, onStall, h, tick } = setup()
    h.beat()
    tick(1000)
    clock.t += 60 * 60_000 // asleep for an hour: main's own timer stood still
    h.check()
    expect(onStall).not.toHaveBeenCalled()
    tick(3000) // the page beats again shortly after waking
    h.beat()
    tick(3000)
    expect(onStall).not.toHaveBeenCalled()
    tick(9000) // …but a page that really stays silent after waking is still caught
    expect(onStall).toHaveBeenCalledTimes(1)
    h.stop()
  })

  it('ignores the late beats between suspend and sleep, and starts fresh on resume', () => {
    const { clock, onStall, h, tick } = setup()
    h.beat()
    h.pause()
    clock.t += 500
    h.beat() // a beat that arrives after 'suspend', before the OS actually sleeps
    clock.t += 60 * 60_000
    h.check()
    tick(10_000) // woke up, 'resume' not delivered yet, the page hasn't beaten yet
    expect(onStall).not.toHaveBeenCalled()
    h.resume()
    tick(10_000)
    expect(onStall).not.toHaveBeenCalled() // not watched again until the page beats
    h.beat()
    tick(9000)
    expect(onStall).toHaveBeenCalledTimes(1)
    h.stop()
  })

  it('stops ignoring beats if resume never comes', () => {
    const { clock, onStall, h, tick } = setup()
    h.pause()
    clock.t += 61_000
    h.beat() // more than a minute after suspend: we're awake
    tick(9000)
    expect(onStall).toHaveBeenCalledTimes(1)
    h.stop()
  })
})

describe('isNewerVersion', () => {
  it('compares release numbers', () => {
    expect(isNewerVersion('v1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true)
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false)
  })
  it('handles pre-releases and junk safely', () => {
    expect(isNewerVersion('1.1.0', '1.1.0-beta.1')).toBe(true)
    expect(isNewerVersion('1.1.0-beta.1', '1.1.0')).toBe(false)
    expect(isNewerVersion('nightly', '1.0.0')).toBe(false)
    expect(isNewerVersion('', '1.0.0')).toBe(false)
  })
})
