/**
 * "Resume where you were" after ICCWorship closed unexpectedly (a crash, a power cut, Windows restarting for an
 * update mid-service) — like PowerPoint's and ProPresenter's recovery after a crash.
 *
 * Main keeps a small session file (userData/session.json, this PC only): `clean` is false while the app runs and
 * set true by a normal quit; `live` is the plan item that was on screen. At the next start, an unclean exit with
 * something recently on screen becomes an offer the operator can accept with one click.
 */
import type { LiveState } from './types'

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
