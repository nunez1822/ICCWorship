import { describe, expect, it } from 'vite-plus/test'
import { PinGuard } from '../src/main/pinGuard'

const MIN = 60_000

function setup(opts = {}) {
  let t = 1_000_000
  const g = new PinGuard(opts, () => t)
  return { g, advance: (ms: number) => (t += ms) }
}

describe('PinGuard', () => {
  it('locks a device after 5 wrong PINs, doubling each time', () => {
    const { g } = setup()
    for (let i = 0; i < 4; i++) g.fail('a')
    expect(g.lockedFor('a')).toBe(0)
    g.fail('a')
    expect(g.lockedFor('a')).toBe(30_000)
    g.fail('a')
    expect(g.lockedFor('a')).toBe(60_000)
    expect(g.lockedFor('b')).toBe(0) // other phones unaffected
  })

  it('a correct PIN clears the record', () => {
    const { g } = setup()
    for (let i = 0; i < 5; i++) g.fail('a')
    g.succeed('a')
    expect(g.lockedFor('a')).toBe(0)
    expect(g.size).toBe(0)
  })

  it('forgets an old record: one typo weeks later does not lock the phone', () => {
    const { g, advance } = setup()
    for (let i = 0; i < 5; i++) g.fail('a')
    advance(14 * 24 * 60 * MIN)
    g.fail('a')
    expect(g.lockedFor('a')).toBe(0)
  })

  it('keeps counting while guesses keep coming', () => {
    const { g, advance } = setup()
    for (let i = 0; i < 5; i++) g.fail('a')
    advance(31_000) // lock expired, but the device is still active
    g.fail('a')
    expect(g.lockedFor('a')).toBe(60_000)
  })

  it('never keeps more than maxEntries devices, dropping unlocked ones first', () => {
    const { g } = setup({ maxEntries: 3 })
    for (let i = 0; i < 5; i++) g.fail('attacker')
    for (const ip of ['p1', 'p2', 'p3', 'p4']) g.fail(ip)
    expect(g.size).toBe(3)
    expect(g.lockedFor('attacker')).toBeGreaterThan(0) // a locked device is not evicted by others
  })
})
