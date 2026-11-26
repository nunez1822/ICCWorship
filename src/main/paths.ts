import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

let portableRoot: string | undefined
/** the portable exe keeps its data beside it (set once by bootstrap.ts, see portable.ts) */
export function setPortableRoot(root: string): void {
  portableRoot = root
}

/** Root of everything the church creates: Documents\ICCWorship (ICCWORSHIP_DATA, or beside the portable exe) */
export function dataRoot(): string {
  const root = process.env.ICCWORSHIP_DATA || portableRoot || join(app.getPath('documents'), 'ICCWorship')
  mkdirSync(root, { recursive: true })
  return root
}

export const dataDir = (): string => ensure(join(dataRoot(), 'data'))
export const cacheDir = (...p: string[]): string => ensure(join(dataRoot(), 'cache', ...p))
export const bibleDataDir = (): string => ensure(join(dataRoot(), 'data', 'bibles'))
export const backupDir = (): string => ensure(join(dataRoot(), 'backups'))
/** where each backing track is copied once, beside the backups (see mirrorTracks in backup.ts); not created here */
export const trackMirrorDir = (): string => join(dataRoot(), 'backups', 'tracks')

function ensure(p: string): string {
  mkdirSync(p, { recursive: true })
  return p
}

/** Bundled read-only resources (bibles, samples, icon) */
export function resourcesDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'resources') : join(app.getAppPath(), 'resources')
}
