/**
 * Folds a log line repeated in a burst (a render loop, a flapping network) into one line plus a count. Pure, so the
 * rules are unit tested (tests/logRepeats.test.ts); src/main/log.ts writes what it returns.
 *
 * The count line carries the level of the line that repeated (two `[info]` lines are never summed up as `[error]` by
 * the next message), and it is written when the run ends: when another line comes, or by `flush()` (log.ts calls it
 * on a timer once the burst has gone quiet, and at exit), so a repeat is never hidden until something else is logged.
 */
export type LogLine = { at: number; level: string; text: string }

export class LogRepeats {
  private last = ''
  private lastLevel = ''
  private lastAt = 0
  private repeats = 0

  constructor(private windowMs = 60_000) {}

  /** the lines to write for this message: none while it repeats the last one */
  next(level: string, msg: string, now: number): LogLine[] {
    if (msg === this.last && level === this.lastLevel && now - this.lastAt < this.windowMs) {
      this.repeats++
      this.lastAt = now
      return []
    }
    const lines: LogLine[] = []
    const summary = this.flush()
    if (summary) lines.push(summary)
    lines.push({ at: now, level, text: msg })
    this.last = msg
    this.lastLevel = level
    this.lastAt = now
    return lines
  }

  /** the count of repeats not written yet, as a line of the repeated message's level (once) */
  flush(): LogLine | undefined {
    if (!this.repeats) return undefined
    const line = { at: this.lastAt, level: this.lastLevel, text: `(last message repeated ${this.repeats} more times)` }
    this.repeats = 0
    return line
  }

  /** a repeat run is waiting to be written */
  get pending(): boolean {
    return this.repeats > 0
  }
}
