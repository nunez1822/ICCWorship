/**
 * When ICCWorship may look for, download and install a new version. Pure, unit tested (tests/updatePolicy.test.ts).
 *
 * The rule that matters most: nothing about updating ever happens while something is on screen. A church laptop
 * runs a live service; a download competes with the livestream for the church's internet, and an install restarts
 * the app. So: check and start a download only when nothing is live (a download running when a service starts is
 * cancelled, and the next check starts it again), and install only when the volunteer closes ICCWorship with nothing
 * on screen (or clicks "Restart now" with nothing on screen) — the way VS Code and Slack install on restart.
 */
import type { LiveState } from './types'

export const UPDATE_CHECK_EVERY_MS = 24 * 60 * 60 * 1000

type LiveBits = Pick<LiveState, 'slideIndex' | 'video' | 'layers' | 'message' | 'clearedFrom'>

/** the congregation sees something: a slide, a playing video or track, the logo, or a message that hasn't run out */
export const onScreen = (l: Partial<LiveBits>, now = Date.now()): boolean =>
  (l.slideIndex ?? -1) >= 0 || !!l.video?.playing || !!l.layers?.logo || (!!l.message && (!l.message.until || l.message.until > now))

/** a screen cleared mid-item stops counting as a running service this long after something was last on screen */
export const CLEARED_STILL_LIVE_MS = 2 * 60 * 60 * 1000

/**
 * a service may be running: something is on screen, or the screen was cleared mid-item (Esc during the sermon keeps
 * the place, and Space puts it back) less than CLEARED_STILL_LIVE_MS after something was last on screen. Esc keeps
 * that place until something else goes live, so without the time limit a service ended with Esc would count as
 * running until the app restarts. Automatic checks and downloads wait for this to be false, and a Windows shutdown
 * while it is true is an interrupted service (offered back at the next start).
 */
export const isLive = (l: Partial<LiveBits>, now = Date.now(), lastOnScreenAt?: number): boolean =>
  onScreen(l, now) || (l.clearedFrom !== undefined && lastOnScreenAt !== undefined && now - lastOnScreenAt < CLEARED_STILL_LIVE_MS)

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

/**
 * "Restart now" on a downloaded update. It is an explicit click, so only what is on screen right now stops it (a
 * screen cleared with Esc doesn't), and updates turned off after the download keep it from installing here too.
 */
export function installNow(o: { allowed: boolean; onScreen: boolean; phase: UpdatePhase }): 'install' | 'live' | 'not-ready' | 'off' {
  if (o.phase.phase !== 'ready') return 'not-ready'
  if (o.onScreen) return 'live'
  return o.allowed ? 'install' : 'off'
}

/**
 * When something was last on screen, for isLive's cleared-screen limit. Elapsed time is measured on the monotonic
 * clock (Windows correcting its time during a cleared sermon must not end the service), and — as Chromium does with
 * power events — the sleep the monotonic clock may have missed is added back at wake-up, measured on the wall clock:
 * a laptop asleep all night after a cleared sermon ended that service. Never subtracted, so a monotonic clock that did
 * run, or a wall clock set back meanwhile, changes nothing.
 */
export class OnScreenClock {
  private lastMono: number | undefined
  private suspendedAt: { wall: number; mono: number } | undefined
  constructor(private clock: { wall: () => number; mono: () => number }) {}

  /** something is (or was until now) on screen */
  seen(): void {
    this.lastMono = this.clock.mono()
  }
  suspended(): void {
    this.suspendedAt = { wall: this.clock.wall(), mono: this.clock.mono() }
  }
  resumed(): void {
    const at = this.suspendedAt
    this.suspendedAt = undefined
    if (!at || this.lastMono === undefined) return
    const missed = this.clock.wall() - at.wall - (this.clock.mono() - at.mono)
    if (missed > 0) this.lastMono -= missed
  }
  /** epoch ms; a timed message (`messageUntil`) counts until it ran out, though nothing updated the live state then */
  lastAt(messageUntil: number | undefined, now = this.clock.wall()): number | undefined {
    const seen = this.lastMono === undefined ? undefined : now - (this.clock.mono() - this.lastMono)
    return messageUntil !== undefined && messageUntil <= now && (seen === undefined || messageUntil > seen) ? messageUntil : seen
  }
}

/**
 * The first line of an electron-updater log message, safe for logs that are attached to public bug reports: no URLs
 * (CLAUDE.md), no file paths (they carry the Windows user name; a quoted path is cut at its closing quote, since user
 * names can have spaces), no per-install id.
 */
export const updaterLogLine = (m: unknown): string =>
  String(m)
    .split(/\r?\n/)[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\)[^"'`]*/g, '<path>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<id>')
    .slice(0, 120)
