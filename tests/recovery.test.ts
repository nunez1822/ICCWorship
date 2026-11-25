import { describe, expect, it, vi } from 'vitest'
import { Heartbeat, ReloadBudget } from '../src/main/recovery'
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
  it('reports a stall only after beats stop', () => {
    let t = 0
    const onStall = vi.fn()
    const h = new Heartbeat(onStall, 8000, () => t)
    h.check()
    expect(onStall).not.toHaveBeenCalled() // never started beating: not watched
    h.beat()
    t = 5000
    h.check()
    expect(onStall).not.toHaveBeenCalled()
    h.beat()
    t = 14_000
    h.check()
    expect(onStall).toHaveBeenCalledTimes(1)
    h.check()
    expect(onStall).toHaveBeenCalledTimes(1) // stopped after reporting
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
