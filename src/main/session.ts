/**
 * This PC's session files in userData (never in the data folder: they describe this computer, not the church's
 * data, so backups and restores don't carry them):
 *   session.json      — did the last run quit normally, and what was on screen (see @shared/session)
 *   window-state.json — the operator window's size and place (see @shared/windowState)
 *   <name>.json       — a notice already shown once (noticeSeen / markNoticeSeen)
 */
import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import type { LiveState } from '@shared/types'
import { LiveRecorder, resumeOfferFrom, type LiveSnapshot, type SessionFile } from '@shared/session'
import type { Rect } from '@shared/windowState'
import { writeFileAtomic } from './atomicWrite'
import { log } from './log'

const file = (name: string) => join(app.getPath('userData'), name)

function readJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(file(name), 'utf8'))
  } catch {
    return undefined // first run, or damaged: start fresh
  }
}

/** files whose last write failed: logged once until a write works again (session.json is tried every second while
 *  the live place moves, and a full disk would otherwise fill the log for the whole service) */
const failing = new Set<string>()
function writeJson(name: string, value: unknown): boolean {
  try {
    writeFileAtomic(file(name), JSON.stringify(value))
    if (failing.delete(name)) log.info(`${name} saved again`)
    return true
  } catch (e) {
    if (!failing.has(name)) log.warn(`could not save ${name}:`, (e as NodeJS.ErrnoException).code || 'error')
    failing.add(name)
    return false
  }
}

/* ---------------- resume after an unclean exit ---------------- */
let offer: LiveSnapshot | null = null
const recorder = new LiveRecorder({
  write: (live) => writeJson('session.json', { clean: false, live } satisfies SessionFile),
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>)
})

/**
 * At startup: read how the last run ended, then mark this run as running (unclean until a normal quit). The offer
 * stays in the file until something else goes live, so a second crash before the operator answers keeps it.
 */
export function startSession(): void {
  offer = resumeOfferFrom(readJson('session.json'), Date.now())
  if (offer) log.info('the last run did not quit normally while something was live: offering to resume')
  writeJson('session.json', { clean: false, live: offer ?? undefined } satisfies SessionFile)
  recorder.seed(offer ?? undefined)
}

/** The offer, once (the operator page asks after it loads; a reload must not offer it again). */
export function takeResumeOffer(): LiveSnapshot | null {
  const o = offer
  offer = null
  return o
}

/** The live state changed: remember the place (written at most once a second, only when it moved). */
export const rememberLive = (l: LiveState): void => recorder.remember(l)

/** Windows is shutting down mid-service: an interrupted service, offered back at the next start. */
export const flushSession = (): void => recorder.flush()

/**
 * The file still holds the last run's unanswered offer (this run crashed or is shutting down before the operator
 * answered it, or before the page even asked): quitting now must keep it, like a second crash does.
 */
export const holdsLastRunOffer = (): boolean => recorder.holdsLastRunOffer

/** …and the operator hasn't even seen it yet (an offer seen and left alone all day isn't kept past a shutdown) */
export const lastRunOfferUnseen = (): boolean => offer !== null && recorder.holdsLastRunOffer

let keepOffer = false
/**
 * The volunteer chose Quit after the operator window crashed mid-service: like a crash, the place is offered back at
 * the next start (endSession at before-quit then leaves the file as it is).
 */
export function quitKeepingOffer(): void {
  recorder.flush()
  keepOffer = true
}
/** this quit is the volunteer's Quit after a crash mid-service (an update must not install now) */
export const quittingAfterCrash = (): boolean => keepOffer

/** A normal quit: nothing to resume next time. */
export function endSession(): void {
  recorder.end()
  if (keepOffer) return
  writeJson('session.json', { clean: true } satisfies SessionFile)
}

/* ---------------- once-only notices ---------------- */
/** a marker name for this computer and Windows user: the portable copy's profile travels on the stick, and a notice
 *  about this PC must be shown again on the next PC (a hash: no computer or user name in the file name) */
export function onThisPc(name: string): string {
  let user = ''
  try {
    user = userInfo().username
  } catch {
    // (no user name: the computer name alone)
  }
  return `${name}-${createHash('sha256').update(`${hostname()}|${user}`).digest('hex').slice(0, 12)}`
}
/** "this PC also has data in Documents" (portable copy): once per computer, not once per stick */
export const DOCUMENTS_ALSO_NOTICE = (): string => onThisPc('documents-data-noticed')
/** the notice was already shown with this profile (a marker file in userData) */
export const noticeSeen = (name: string): boolean => existsSync(file(`${name}.json`))
/** written when the page receives the notice (if it can't be written, the notice simply shows again next time) */
export function markNoticeSeen(name: string): void {
  writeJson(`${name}.json`, { at: Date.now() })
}

/* ---------------- operator window size and place ---------------- */
export const readWindowState = (): unknown => readJson('window-state.json')
export function saveWindowState(bounds: Rect, maximized: boolean): void {
  writeJson('window-state.json', { bounds, maximized })
}
