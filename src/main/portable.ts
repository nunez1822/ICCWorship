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
  /** the portable exe's data is on a write-protected stick or folder: opened from there, read-only (nothing saved;
   *  the profile and logs go to this computer's %APPDATA%) */
  | { mode: 'portable-readonly'; root: string }
  /** no "ICCWorship Data" folder yet, but this computer has data in Documents\ICCWorship (where portable 1.0 kept it,
   *  or the installed copy's): keep using it, and say how to move it beside the exe */
  | { mode: 'portable-documents'; tried: string }
  /** the portable exe on a drive or folder it can't write to and with no data there (a CD, Program Files): Documents */
  | { mode: 'portable-fallback'; tried: string }

/**
 * Where the portable exe's data lives. An existing "ICCWorship Data" folder beside the exe always wins (writable:
 * portable; not writable but holding data: that data, read-only — never another computer's library on Sunday). With
 * no such folder, data already in Documents\ICCWorship is kept (a church upgrading from portable 1.0 must not find an
 * empty app); creating the folder (or copying the data into it) makes the exe portable from then on.
 */
export function dataLocation(opts: {
  env: Record<string, string | undefined>
  isPackaged: boolean
  /** does this folder exist? */
  exists: (dir: string) => boolean
  /** can a folder be created and written there? */
  canWrite: (dir: string) => boolean
  /** does Documents\ICCWorship hold the church's data already? */
  documentsHasData: () => boolean
}): DataLocation {
  const exeDir = opts.env.PORTABLE_EXECUTABLE_DIR
  // ICCWORSHIP_DATA (data on another drive, or a test run) always wins; a developer run is never portable
  if (!opts.isPackaged || !exeDir || opts.env.ICCWORSHIP_DATA) return { mode: 'standard' }
  const root = join(exeDir, PORTABLE_FOLDER)
  if (opts.exists(root)) {
    if (opts.canWrite(root)) return { mode: 'portable', root }
    return opts.exists(join(root, 'data')) ? { mode: 'portable-readonly', root } : { mode: 'portable-fallback', tried: root }
  }
  if (opts.documentsHasData()) return { mode: 'portable-documents', tried: root }
  return opts.canWrite(root) ? { mode: 'portable', root } : { mode: 'portable-fallback', tried: root }
}
