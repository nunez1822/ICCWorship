/**
 * Loading the app's own pages into windows, and recognising them (only our pages may call into main).
 */
import type { BrowserWindow } from 'electron'
import { APP_ORIGIN, isAppPageUrl } from './appUrl'
import { devUrl } from './env'
import { log } from './log'

export type Page = 'index' | 'output' | 'stage' | 'remote'

export function isAbortedLoad(e: unknown): boolean {
  return e instanceof Error && (e as Error & { code?: unknown }).code === 'ERR_ABORTED'
}

let loads = 0
export function loadPage(win: BrowserWindow, page: Page, hash = ''): void {
  // A query that changes on every load makes this a real page load. Without it, loading the URL the window
  // already shows (stage.html#local, or output.html → output.html#safe) only changes the #fragment: the page
  // would not restart, although the operator is told it did.
  const load = String(++loads)
  const loading = win.loadURL(`${devUrl || APP_ORIGIN}/${page}.html?load=${load}${hash}`)
  // A newer load (crash recovery, "Restart projector" pressed twice) aborts the pending one: that is expected.
  // A real failure is logged; the crash and heartbeat guards deal with a window that stays broken.
  loading.catch((e) => {
    if (!isAbortedLoad(e)) log.warn(`${page} page did not load:`, e)
  })
}

/** Only our own three pages (operator, projector, stage) may call into main. */
export function isTrustedSender(frame: Electron.WebFrameMain | null | undefined): boolean {
  return !!frame && isAppPageUrl(frame.url, devUrl)
}
