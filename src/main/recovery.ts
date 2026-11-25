/**
 * Keeping the projector (and stage window) on screen when their page crashes or freezes during a service.
 * Pure logic here (unit tested); index.ts wires it to Electron events.
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

  /** the operator pressed "Restart projector", or a new window was created */
  reset(): void {
    this.times = []
    this.safe = false
  }
}

/**
 * The projector page sends a heartbeat every second. If they stop for `stallMs` after the page has started
 * beating, the page is frozen (an endless loop, a stuck decoder) — Chromium's own "unresponsive" event never
 * fires for a window that gets no input, so we can't rely on it.
 */
export class Heartbeat {
  private last = 0
  private timer: ReturnType<typeof setInterval> | null = null
  constructor(
    private onStall: () => void,
    private stallMs = 8000,
    private now: () => number = Date.now
  ) {}

  beat(): void {
    this.last = this.now()
    if (!this.timer) this.timer = setInterval(() => this.check(), 1000)
  }

  check(): void {
    if (this.last && this.now() - this.last > this.stallMs) {
      this.stop()
      this.onStall()
    }
  }

  /** stop watching (window closed or reloading); the next beat starts watching again */
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.last = 0
  }
}
