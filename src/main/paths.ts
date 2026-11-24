import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

/** Root of everything the church creates: Documents\ICCWorship */
export function dataRoot(): string {
  const root = process.env.ICCWORSHIP_DATA || join(app.getPath('documents'), 'ICCWorship')
  mkdirSync(root, { recursive: true })
  return root
}

export const dataDir = (): string => ensure(join(dataRoot(), 'data'))
export const cacheDir = (...p: string[]): string => ensure(join(dataRoot(), 'cache', ...p))
export const bibleDataDir = (): string => ensure(join(dataRoot(), 'data', 'bibles'))
export const backupDir = (): string => ensure(join(dataRoot(), 'backups'))

function ensure(p: string): string {
  mkdirSync(p, { recursive: true })
  return p
}

/** Bundled read-only resources (bibles, samples, icon) */
export function resourcesDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
}
