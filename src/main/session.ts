/**
 * This PC's session files in userData (never in the data folder: they describe this computer, not the church's
 * data, so backups and restores don't carry them):
 *   session.json      — did the last run quit normally, and what was on screen (see @shared/session)
 *   window-state.json — the operator window's size and place (see @shared/windowState)
 *   <name>.json       — a notice already shown once on this PC (firstTimeHere)
 */
import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
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

function writeJson(name: string, value: unknown): boolean {
  try {
    writeFileAtomic(file(name), JSON.stringify(value))
    return true
  } catch (e) {
    log.warn(`could not save ${name}:`, (e as NodeJS.ErrnoException).code || 'error')
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

let keepOffer = false
/**
 * The volunteer chose Quit after the operator window crashed mid-service: like a crash, the place is offered back at
 * the next start (endSession at before-quit then leaves the file as it is).
 */
export function quitKeepingOffer(): void {
  recorder.flush()
  keepOffer = true
}

/** A normal quit: nothing to resume next time. */
export function endSession(): void {
  recorder.end()
  if (keepOffer) return
  writeJson('session.json', { clean: true } satisfies SessionFile)
}

/* ---------------- once-only notices ---------------- */
/** true the first time it is asked with this profile (a marker file in userData); false after that */
export function firstTimeHere(name: string): boolean {
  if (existsSync(file(`${name}.json`))) return false
  writeJson(`${name}.json`, { at: Date.now() }) // (if it can't be written, the notice simply shows again next time)
  return true
}

/* ---------------- operator window size and place ---------------- */
export const readWindowState = (): unknown => readJson('window-state.json')
export function saveWindowState(bounds: Rect, maximized: boolean): void {
  writeJson('window-state.json', { bounds, maximized })
}
