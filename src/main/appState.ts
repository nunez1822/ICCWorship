/**
 * The app's windows and lifecycle flags, shared by the main-process modules, plus typed sending to the windows.
 */
import type { BrowserWindow } from 'electron'
import type { AppEvent, MainEvents } from '@shared/ipcEvents'

export const wins: { operator: BrowserWindow | null; output: BrowserWindow | null; stage: BrowserWindow | null } = {
  operator: null,
  output: null,
  stage: null
}

export const lifecycle = {
  /** before-quit has run: windows closing now are not crashes */
  quitting: false,
  /** the operator window has been created: from then on an uncaught error is reported, not fatal */
  started: false
}

/** a window that exists and hasn't been destroyed */
export const open = (w: BrowserWindow | null): w is BrowserWindow => !!w && !w.isDestroyed()

/** send a message to a window (typed by MainEvents); a closed window is skipped */
export function send<K extends keyof MainEvents>(
  w: BrowserWindow | null,
  channel: K,
  ...payload: MainEvents[K] extends undefined ? [] : [MainEvents[K]]
): void {
  if (open(w)) w.webContents.send(channel, ...payload)
}

/** tell the operator (shown as a toast) */
export function notify(evt: AppEvent): void {
  send(wins.operator, 'app:event', evt)
}

/** told to the operator page when it (re)loads — e.g. that it was restarted after a crash */
export const pendingNotices: string[] = []
