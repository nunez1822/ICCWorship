/**
 * This PC's session files in userData (never in the data folder: they describe this computer, not the church's
 * data, so backups and restores don't carry them):
 *   session.json      — did the last run quit normally, and what was on screen (see @shared/session)
 *   window-state.json — the operator window's size and place (see @shared/windowState)
 */
import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LiveState } from '@shared/types'
import { resumeOfferFrom, snapshotChanged, snapshotOf, type LiveSnapshot, type SessionFile } from '@shared/session'
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

function writeJson(name: string, value: unknown): void {
  try {
    writeFileAtomic(file(name), JSON.stringify(value))
  } catch (e) {
    log.warn(`could not save ${name}:`, (e as NodeJS.ErrnoException).code || 'error')
  }
}

/* ---------------- resume after an unclean exit ---------------- */
let offer: LiveSnapshot | null = null
let written: LiveSnapshot | undefined
let pending: LiveSnapshot | undefined
let timer: ReturnType<typeof setTimeout> | undefined

/** At startup: read how the last run ended, then mark this run as running (unclean until a normal quit). */
export function startSession(): void {
  offer = resumeOfferFrom(readJson('session.json'), Date.now())
  if (offer) log.info('the last run did not quit normally while something was live: offering to resume')
  writeJson('session.json', { clean: false } satisfies SessionFile)
}

/** The offer, once (the operator page asks after it loads; a reload must not offer it again). */
export function takeResumeOffer(): LiveSnapshot | null {
  const o = offer
  offer = null
  return o
}

/** The live state changed: remember the place (written at most once a second, only when it moved). */
export function rememberLive(l: LiveState): void {
  const snap = snapshotOf(l, Date.now())
  if (!snapshotChanged(pending ?? written, snap)) return
  pending = snap
  timer ??= setTimeout(() => {
    timer = undefined
    written = pending
    writeJson('session.json', { clean: false, live: written } satisfies SessionFile)
  }, 1000)
}

/** A normal quit: nothing to resume next time. */
export function endSession(): void {
  clearTimeout(timer)
  timer = undefined
  writeJson('session.json', { clean: true } satisfies SessionFile)
}

/* ---------------- operator window size and place ---------------- */
export const readWindowState = (): unknown => readJson('window-state.json')
export function saveWindowState(bounds: Rect, maximized: boolean): void {
  writeJson('window-state.json', { bounds, maximized })
}
