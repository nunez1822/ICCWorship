/**
 * Keeping the projector (and stage window) on screen when their page crashes or freezes during a service.
 * Pure logic here (unit tested in tests/recovery.test.ts); src/main/index.ts wires it to Electron events.
 */

/**
 * How to react to a crash: reload, then — if it keeps crashing (the slide itself may be what breaks it) — reload
 * in "safe" mode (plain black), and finally give up instead of looping forever.
 */
export class ReloadBudget {
  private times: number[] = []
  private safe = false
  constructor(
    private max = 3,
    private windowMs = 60_000
  ) {}

  next(now = Date.now()): 'reload' | 'safe' | 'give-up' {
    this.times = this.times.filter((t) => now - t < this.windowMs)
    if (this.times.length < this.max) {
      this.times.push(now)
      return this.safe ? 'safe' : 'reload'
    }
    if (!this.safe) {
      this.safe = true
      return 'safe'
    }
    return 'give-up'
  }

  get inSafeMode(): boolean {
    return this.safe
  }

  /** the operator pressed "Restart projector", a new window was created, or the window has run fine a while */
  reset(): void {
    this.times = []
    this.safe = false
  }
}

/**
 * The projector page sends a heartbeat every second. If they stop for `stallMs` after the page has started
 * beating, the page is frozen (an endless loop, a stuck decoder) — Chromium's own "unresponsive" event never
 * fires for a window that gets no input, so we can't rely on it.
 *
 * Sleep must not look like a freeze: `pause()` (on suspend) ignores beats until `resume()`, and a check that runs
 * long after the previous one (the whole PC was asleep, so main's own timer stood still too) starts over instead
 * of blaming the page — that also covers a sleep Windows didn't announce.
 */
export class Heartbeat {
  private last = 0
  private lastCheck = 0
  private paused = false
  private pausedAt = 0
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    private onStall: () => void,
    private stallMs = 8000,
    private now: () => number = Date.now,
    /** a pause that 'resume' never ended stops counting after this long (beats still arriving mean we're awake) */
    private maxPauseMs = 60_000
  ) {}

  beat(): void {
    const now = this.now()
    if (this.paused) {
      if (now - this.pausedAt < this.maxPauseMs) return
      this.paused = false
    }
    this.last = now
    if (!this.timer) {
      this.lastCheck = now
      this.timer = setInterval(() => this.check(), 1000)
    }
  }

  check(): void {
    const now = this.now()
    const gap = this.lastCheck ? now - this.lastCheck : 0
    this.lastCheck = now
    if (!this.last || this.paused) return
    if (gap > this.stallMs) {
      // main itself was stopped (sleep, a debugger): the page had no chance to beat either
      this.last = now
      return
    }
    if (now - this.last > this.stallMs) {
      this.stop()
      this.onStall()
    }
  }

  /** stop watching (window closed or reloading); the next beat starts watching again */
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.last = 0
    this.lastCheck = 0
  }

  /** the PC is going to sleep: stop watching, and ignore the beats that still arrive before it does */
  pause(): void {
    this.stop()
    this.paused = true
    this.pausedAt = this.now()
  }

  /** the PC woke up: the next beat starts watching again, from scratch */
  resume(): void {
    this.stop()
    this.paused = false
  }
}
