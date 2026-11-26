/**
 * When ICCWorship may look for, download and install a new version. Pure, unit tested (tests/updatePolicy.test.ts).
 *
 * The rule that matters most: nothing about updating ever happens while something is on screen. A church laptop
 * runs a live service; a download competes with the livestream for the church's internet, and an install restarts
 * the app. So: check and start a download only when nothing is live (a download running when a service starts is
 * cancelled, and the next check starts it again), and install only when the volunteer closes ICCWorship with nothing
 * on screen (or clicks "Restart now" while nothing is live) — the way VS Code and Slack install on restart.
 */
import type { LiveState } from './types'

export const UPDATE_CHECK_EVERY_MS = 24 * 60 * 60 * 1000

type LiveBits = Pick<LiveState, 'slideIndex' | 'video' | 'layers' | 'message' | 'clearedFrom'>

/** the congregation sees something: a slide, a playing video or track, the logo, or a message that hasn't run out */
export const onScreen = (l: Partial<LiveBits>, now = Date.now()): boolean =>
  (l.slideIndex ?? -1) >= 0 || !!l.video?.playing || !!l.layers?.logo || (!!l.message && (!l.message.until || l.message.until > now))

/**
 * a service may be running: something is on screen, or the screen was cleared mid-item (Esc during the sermon keeps
 * the place, and Space puts it back). Checks, downloads and "Restart now" wait for this to be false.
 */
export const isLive = (l: Partial<LiveBits>, now = Date.now()): boolean => onScreen(l, now) || l.clearedFrom !== undefined

/**
 * Install the downloaded update when ICCWorship closes? Only when the volunteer still wants updates and nothing is
 * on screen. (A screen cleared with Esc counts as closed here: a service usually ends with Esc and then closing the
 * app, and that is exactly when the update should go in.)
 */
export const installOnQuit = (o: { allowed: boolean; onScreen: boolean; phase: UpdatePhase }): boolean => o.allowed && !o.onScreen && o.phase.phase === 'ready'

/** may the automatic (not "Check now") check run? */
export function automaticCheckDue(o: { enabled: boolean; lastCheck?: number; now: number; live: boolean }): boolean {
  if (!o.enabled || o.live) return false
  return !o.lastCheck || o.now - o.lastCheck >= UPDATE_CHECK_EVERY_MS || o.lastCheck > o.now // a clock set back
}

/** where a self-update is (installed app only; the portable exe and dev runs only check) */
export type UpdatePhase =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string }
  | { phase: 'failed'; version: string }

/** may a found update be downloaded now? */
export const mayDownload = (o: { selfUpdate: boolean; autoUpdate: boolean; live: boolean; phase: UpdatePhase }): boolean =>
  o.selfUpdate && o.autoUpdate && !o.live && (o.phase.phase === 'idle' || o.phase.phase === 'failed')

/** "Restart now" on a downloaded update */
export function installNow(o: { live: boolean; phase: UpdatePhase }): 'install' | 'live' | 'not-ready' {
  if (o.phase.phase !== 'ready') return 'not-ready'
  return o.live ? 'live' : 'install'
}
