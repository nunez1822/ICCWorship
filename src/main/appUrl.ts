/**
 * app://iccworship/ serves the app's own pages (out/renderer) to its windows.
 *
 * Why not file://: pages loaded from file:// get extra privileges (any file:// URL is "same origin" to them), and
 * keeping the GrantFileProtocolExtraPrivileges fuse on for them would let any page loaded that way read local files.
 * A standard, secure custom scheme gives the pages a real origin of their own (app://iccworship), so CSP 'self',
 * localStorage and the IPC sender check all mean exactly "our pages", and the fuse is off (electron-builder.yml).
 * The same approach VS Code (vscode-file://) and Electron's security guide recommend.
 *
 * This file is the pure part (unit tested in tests/appUrl.test.ts); appProtocol.ts registers the handler.
 */
import { extname, join } from 'node:path'
import { within } from './pathGuard'

export const APP_SCHEME = 'app'
export const APP_HOST = 'iccworship'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

// Only the file types a built page uses. Anything else is "not found" (the licence texts beside pdf.js's
// WebAssembly files are never fetched by a page).
export const APP_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
}

/** the file an app:// URL names inside the built pages folder, or null (another host, outside the folder, unknown type) */
export function appFile(url: string, root: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  // (host includes any port; a user name or password never belongs in our URLs)
  if (u.protocol !== `${APP_SCHEME}:` || u.host !== APP_HOST || u.username || u.password) return null
  let rel: string
  try {
    rel = decodeURIComponent(u.pathname)
  } catch {
    return null
  }
  // a NUL or a drive / stream colon never names one of our files
  if (/[\0:]/.test(rel)) return null
  const file = join(root, rel)
  if (!within(root, file) || !APP_TYPES[extname(file).toLowerCase()]) return null
  return file
}

/** the pages that may use the IPC bridge (the phone remote is served over HTTP, never from here) */
export const APP_PAGES = ['index.html', 'output.html', 'stage.html'] as const

/**
 * Is this frame URL one of our own pages? Exactly app://iccworship/index.html, output.html or stage.html (any query
 * or hash), or the same page from the dev server in development. Anything else served by app:// (another .html, an
 * .svg) is not a page that may talk to main. The IPC and permission trust boundary: unit tested.
 */
export function isAppPageUrl(url: string, devUrl?: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const page = (APP_PAGES as readonly string[]).includes(u.pathname.slice(1)) && !u.username && !u.password
  if (devUrl) {
    try {
      return page && u.origin === new URL(devUrl).origin
    } catch {
      return false
    }
  }
  // not URL.origin: for a custom scheme it is "null"
  return page && u.protocol === `${APP_SCHEME}:` && u.host === APP_HOST
}
