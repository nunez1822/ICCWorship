/**
 * Portable mode: ICCWorship-Portable-x.y.z.exe keeps everything (the church's data, settings, logs, the browser
 * profile) in an "ICCWorship Data" folder next to the exe, so it can run from a USB stick and leave nothing on the
 * computer it runs on — what PortableApps-style programs do. The installed app keeps using Documents\ICCWorship.
 *
 * electron-builder's portable launcher unpacks the app to a temporary folder and tells it where the exe really is
 * in PORTABLE_EXECUTABLE_DIR. No Electron imports here: the decision is unit tested (tests/portable.test.ts).
 */
import { join } from 'node:path'

export const PORTABLE_FOLDER = 'ICCWorship Data'

export type DataLocation =
  /** the installed app (or a developer run): Documents\ICCWorship, or ICCWORSHIP_DATA */
  | { mode: 'standard' }
  /** the portable exe, data beside it */
  | { mode: 'portable'; root: string }
  /** the portable exe on a drive or folder it can't write to (a locked USB stick, a CD, Program Files): Documents */
  | { mode: 'portable-fallback'; tried: string }

export function dataLocation(opts: {
  env: Record<string, string | undefined>
  isPackaged: boolean
  /** can a folder be created and written there? */
  canWrite: (dir: string) => boolean
}): DataLocation {
  const exeDir = opts.env.PORTABLE_EXECUTABLE_DIR
  // ICCWORSHIP_DATA (data on another drive, or a test run) always wins; a developer run is never portable
  if (!opts.isPackaged || !exeDir || opts.env.ICCWORSHIP_DATA) return { mode: 'standard' }
  const root = join(exeDir, PORTABLE_FOLDER)
  return opts.canWrite(root) ? { mode: 'portable', root } : { mode: 'portable-fallback', tried: root }
}
