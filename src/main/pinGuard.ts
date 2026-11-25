/**
 * PIN guessing protection for the phone remote: a 4-digit PIN would otherwise fall in
 * ~10 s on the church Wi-Fi. After 5 wrong PINs from one device, that device waits 30 s,
 * doubling each time (max 10 min). Other phones are unaffected; a correct PIN clears it.
 *
 * A device's record is forgotten once it has been quiet (and unlocked) for a while, so a
 * single typo weeks later doesn't trigger a long lockout, and the list of devices can't
 * grow without limit while the app stays open.
 */
export interface PinGuardOptions {
  freeTries: number
  baseLockMs: number
  maxLockMs: number
  /** forget a device after this long without a wrong PIN (once any lock has expired) */
  forgetAfterMs: number
  maxEntries: number
}

const DEFAULTS: PinGuardOptions = { freeTries: 5, baseLockMs: 30_000, maxLockMs: 10 * 60_000, forgetAfterMs: 30 * 60_000, maxEntries: 500 }

type Record = { count: number; lockedUntil: number; lastAt: number }

export class PinGuard {
  private failures = new Map<string, Record>()
  private opts: PinGuardOptions

  constructor(
    opts: Partial<PinGuardOptions> = {},
    private now: () => number = Date.now
  ) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  /** milliseconds this device must still wait (0 = may try) */
  lockedFor(ip: string): number {
    const f = this.failures.get(ip)
    return f ? Math.max(0, f.lockedUntil - this.now()) : 0
  }

  fail(ip: string): void {
    const t = this.now()
    let f = this.failures.get(ip)
    if (f && this.stale(f, t)) f = undefined // quiet for long enough: start over
    f ??= { count: 0, lockedUntil: 0, lastAt: t }
    f.count++
    f.lastAt = t
    const { freeTries, baseLockMs, maxLockMs } = this.opts
    if (f.count >= freeTries) f.lockedUntil = t + Math.min(baseLockMs * 2 ** (f.count - freeTries), maxLockMs)
    // re-insert so the map stays ordered oldest → newest activity
    this.failures.delete(ip)
    this.failures.set(ip, f)
    this.prune(t)
  }

  succeed(ip: string): void {
    this.failures.delete(ip)
  }

  get size(): number {
    return this.failures.size
  }

  private stale(f: Record, t: number): boolean {
    return f.lockedUntil <= t && t - f.lastAt > this.opts.forgetAfterMs
  }

  private prune(t: number): void {
    for (const [ip, f] of this.failures) if (this.stale(f, t)) this.failures.delete(ip)
    if (this.failures.size <= this.opts.maxEntries) return
    // still too many: drop the oldest unlocked devices first, then the oldest of all
    for (const [ip, f] of this.failures) {
      if (this.failures.size <= this.opts.maxEntries) return
      if (f.lockedUntil <= t) this.failures.delete(ip)
    }
    for (const ip of this.failures.keys()) {
      if (this.failures.size <= this.opts.maxEntries) return
      this.failures.delete(ip)
    }
  }
}
