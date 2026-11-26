/**
 * Loading the app's own pages into windows, and recognising them (only our pages may call into main).
 */
import type { BrowserWindow } from 'electron'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { devUrl, rendererDir } from './env'
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
  const loading = devUrl
    ? win.loadURL(`${devUrl}/${page}.html?load=${load}${hash}`)
    : win.loadFile(join(rendererDir, `${page}.html`), { query: { load }, hash: hash.replace(/^#/, '') })
  // A newer load (crash recovery, "Restart projector" pressed twice) aborts the pending one: that is expected.
  // A real failure is logged; the crash and heartbeat guards deal with a window that stays broken.
  loading.catch((e) => {
    if (!isAbortedLoad(e)) log.warn(`${page} page did not load:`, e)
  })
}

/** Only our own three pages (operator, projector, stage) may call into main. */
const TRUSTED_PAGES = new Set(['index.html', 'output.html', 'stage.html'])
export function isTrustedSender(frame: Electron.WebFrameMain | null | undefined): boolean {
  if (!frame) return false
  let u: URL
  try {
    u = new URL(frame.url)
  } catch {
    return false
  }
  if (!TRUSTED_PAGES.has(u.pathname.split('/').pop() || '')) return false
  if (devUrl) return u.origin === new URL(devUrl).origin
  if (u.protocol !== 'file:') return false
  return dirname(fileURLToPath(u)).toLowerCase() === resolve(rendererDir).toLowerCase()
}
