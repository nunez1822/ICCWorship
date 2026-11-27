/**
 * "Resume where you were" after ICCWorship closed unexpectedly (a crash, a power cut, Windows restarting for an
 * update mid-service) — like PowerPoint's and ProPresenter's recovery after a crash.
 *
 * Main keeps a small session file (userData/session.json, this PC only): `clean` is false while the app runs and
 * set true by a normal quit; `live` is the plan item that was on screen. At the next start, an unclean exit with
 * something recently on screen becomes an offer the operator can accept with one click.
 */
import type { LiveState } from './types'
import { onScreen } from './updatePolicy'

export interface LiveSnapshot {
  planId: string
  itemId: string
  itemIndex: number
  slideIndex: number
  itemTitle?: string
  planTitle?: string
  /** when it was on screen (epoch ms) */
  at: number
}

export interface SessionFile {
  /** a normal quit happened after this run started */
  clean: boolean
  live?: LiveSnapshot
}

/** An offer older than this is no longer "the service that was interrupted". */
export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000

/** What to remember of the live state: a plan item with a slide on screen (Show-now items aren't in a plan). */
export function snapshotOf(
  l: Pick<LiveState, 'planId' | 'itemId' | 'itemIndex' | 'slideIndex' | 'itemTitle' | 'planTitle' | 'clearedFrom'>,
  now: number
): LiveSnapshot | undefined {
  if (!l.planId || !l.itemId || l.itemId.startsWith('adhoc-') || l.itemIndex < 0) return undefined
  // Esc (clear all) remembers where it was: resuming there is what Space would do
  const slideIndex = l.slideIndex >= 0 ? l.slideIndex : l.clearedFrom
  if (slideIndex === undefined || slideIndex < 0) return undefined
  return { planId: l.planId, itemId: l.itemId, itemIndex: l.itemIndex, slideIndex, itemTitle: l.itemTitle, planTitle: l.planTitle, at: now }
}

const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const idx = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/** The offer for this start, from the previous run's session file (anything malformed is no offer). */
export function resumeOfferFrom(raw: unknown, now: number, maxAge = RESUME_MAX_AGE_MS): LiveSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as { clean?: unknown; live?: Record<string, unknown> }
  if (f.clean !== false || !f.live || typeof f.live !== 'object') return null
  const l = f.live
  if (!str(l.planId) || !str(l.itemId) || !idx(l.itemIndex) || !idx(l.slideIndex) || typeof l.at !== 'number') return null
  if (now - l.at > maxAge || l.at > now + 60_000) return null
  return {
    planId: l.planId,
    itemId: l.itemId,
    itemIndex: l.itemIndex,
    slideIndex: l.slideIndex,
    itemTitle: str(l.itemTitle, 500) ? l.itemTitle : undefined,
    planTitle: str(l.planTitle, 500) ? l.planTitle : undefined,
    at: l.at
  }
}

/** true when the snapshot names a different place than the last one written (the time alone doesn't count) */
export function snapshotChanged(a: LiveSnapshot | undefined, b: LiveSnapshot | undefined): boolean {
  if (!a || !b) return a !== b
  return a.planId !== b.planId || a.itemId !== b.itemId || a.itemIndex !== b.itemIndex || a.slideIndex !== b.slideIndex
}

/**
 * Keeps session.json's "what was live" in step with the live state without writing on every change: a new place is
 * written at most once per `delayMs`, only when it moved, and never after the run ended (a live change while the
 * windows close must not mark a normal quit unclean again). The writer, clock and timer are injected so the rules are
 * unit tested (tests/session.test.ts); main wires them to the file (src/main/session.ts).
 */
export class LiveRecorder {
  /** what session.json says now (undefined: nothing live) */
  private written: LiveSnapshot | undefined
  /** `written` is still the last run's offer (kept in the file for a second crash), not a place from this run */
  private fromLastRun = false
  /** the place waiting to be written (null: nothing waiting; { snap: undefined }: "nothing live" waiting) */
  private pending: { snap: LiveSnapshot | undefined } | null = null
  private timer: unknown
  private ended = false

  constructor(
    private io: {
      /** false when the file couldn't be written: the place stays waiting and is tried again at the next change */
      write: (live: LiveSnapshot | undefined) => boolean | void
      now: () => number
      setTimer: (fn: () => void, ms: number) => unknown
      clearTimer: (t: unknown) => void
    },
    private delayMs = 1000
  ) {}

  /** the file already holds the last run's offer (startSession wrote it back) */
  seed(offer: LiveSnapshot | undefined): void {
    this.written = offer
    this.fromLastRun = !!offer
  }

  /** session.json still holds the last run's offer and nothing has replaced it (it may never have been shown) */
  get holdsLastRunOffer(): boolean {
    return this.fromLastRun && !this.pending && !this.ended
  }

  /** the live state changed */
  remember(l: Parameters<typeof snapshotOf>[0] & Partial<Pick<LiveState, 'video' | 'layers' | 'message'>>): void {
    if (this.ended) return
    const now = this.io.now()
    const snap = snapshotOf(l, now)
    // The last run's offer stays until something else is really shown: a plan item, or a Show-now item (which has no
    // place to offer, but makes the old one wrong). A theme or language change with nothing on screen keeps it.
    if (!snap && this.fromLastRun && !this.pending && !onScreen(l, now)) return
    // compare with what will be on disk: the waiting place if there is one (even "nothing live"), else the written one
    if (snapshotChanged(this.pending ? this.pending.snap : this.written, snap)) this.pending = { snap }
    else if (!this.pending) return
    // (a place still waiting without a timer is one whose write failed: try again now)
    this.timer ??= this.io.setTimer(() => {
      this.timer = undefined
      this.flush()
    }, this.delayMs)
  }

  /** write the waiting place now (Windows is shutting down mid-service, or the timer fired) */
  flush(): void {
    if (this.timer !== undefined) this.io.clearTimer(this.timer)
    this.timer = undefined
    if (!this.pending || this.ended) return
    const p = this.pending
    if (this.io.write(p.snap) === false) return // stays waiting
    this.pending = null
    this.written = p.snap
    this.fromLastRun = false
  }

  /** the run ended normally: nothing more is written */
  end(): void {
    this.ended = true
    if (this.timer !== undefined) this.io.clearTimer(this.timer)
    this.timer = undefined
    this.pending = null
  }
}
