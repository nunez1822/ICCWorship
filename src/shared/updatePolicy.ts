/**
 * When ICCWorship may look for, download and install a new version. Pure, unit tested (tests/updatePolicy.test.ts).
 *
 * The rule that matters most: nothing about updating ever happens while something is on screen. A church laptop
 * runs a live service; a download competes with the livestream for the church's internet, and an install restarts
 * the app. So: check and download only when nothing is live, and install only when the volunteer closes
 * ICCWorship (or clicks "Restart now" while nothing is live) — the way VS Code and Slack install on restart.
 */
import type { LiveState } from './types'

export const UPDATE_CHECK_EVERY_MS = 24 * 60 * 60 * 1000

/** something is on screen (or playing): a service may be running */
export const isLive = (l: Pick<LiveState, 'slideIndex' | 'video'>): boolean => l.slideIndex >= 0 || !!l.video?.playing

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
