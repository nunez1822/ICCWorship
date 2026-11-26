import { app } from 'electron'
import { join } from 'node:path'
import { resourcesDir } from './paths'

// Development and test switches. A packaged app ignores them, so nobody can point an installed ICCWorship at
// other pages (ELECTRON_RENDERER_URL) or turn on the test hooks (ICCWORSHIP_E2E) with an environment variable.
export const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'] || undefined
export const E2E = !app.isPackaged && !!process.env.ICCWORSHIP_E2E

/** the built pages (out/renderer); main is bundled into out/main/index.js */
export const rendererDir = join(__dirname, '../renderer')
export const preloadPath = join(__dirname, '../preload/index.js')
export const iconPath = join(resourcesDir(), 'icon.png')
export const REPO_URL = 'https://github.com/nunez1822/ICCWorship'
