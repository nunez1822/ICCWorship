/**
 * Runs before every other main-process module (it is the first import in index.ts — keep it that way).
 * ES imports are hoisted, so anything that must happen before other modules touch app paths, or before the app
 * is ready, goes here.
 */
import { app, crashReporter } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataLocation, portableExeDir, type DataLocation } from './portable'
import { dataRoot, setPortableRoot } from './paths'

// Test runs (smoke, e2e, packaged-check) set ICCWORSHIP_TEST_PROFILE as well as pointing ICCWORSHIP_DATA at a
// throw-away folder. Give them their own Chromium profile, logs, crash dumps and single-instance lock too, so a test
// never collides with — or reads the logs of — the copy of ICCWorship the church actually uses. ICCWORSHIP_DATA on
// its own is a user setting (data on another drive or a synced folder) and must not move the profile, the logs or
// the lock: that would lose localStorage and allow a second running copy.
const testData = process.env.ICCWORSHIP_DATA
export const isTestProfile = !!testData && process.env.ICCWORSHIP_TEST_PROFILE === '1'
if (testData && isTestProfile) {
  app.setPath('userData', join(testData, '.userdata'))
  app.setPath('crashDumps', join(testData, '.userdata', 'Crashpad'))
}

// Portable exe (see portable.ts): the data AND the profile, logs and crash dumps go in "ICCWorship Data" beside the
// exe, so nothing is left on the computer. Its own profile also gives it its own single-instance lock (so
// machineLock.ts keeps a second copy from running).
function canWrite(dir: string): boolean {
  const created = !existsSync(dir)
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, '')
    try {
      unlinkSync(probe)
    } catch {
      /* it was written, so the folder is writable (antivirus may hold the probe a moment) */
    }
    return true
  } catch {
    try {
      if (created) rmdirSync(dir) // don't leave an empty folder that would count as "the data is here" next time
    } catch {
      /* not created after all, or not empty */
    }
    return false
  }
}
/** this is ICCWorship's portable exe (whatever its data mode): it never updates itself */
export const isPortableExe = app.isPackaged && !!portableExeDir(process.env, process.execPath)
export const location: DataLocation = dataLocation({
  env: process.env,
  isPackaged: app.isPackaged,
  execPath: process.execPath,
  exists: existsSync,
  canWrite,
  documentsHasData: () => existsSync(join(app.getPath('documents'), 'ICCWorship', 'data', 'meta.json'))
})
if (location.mode === 'portable') {
  setPortableRoot(location.root)
  app.setPath('userData', join(location.root, '.app'))
  app.setPath('crashDumps', join(location.root, '.app', 'Crashpad'))
}
// a write-protected stick: its data, read-only (prepareData); the profile and logs can't go there, so they go to this
// computer's %APPDATA% — in a profile of their own, never the installed app's (its "Put it back" offer and window
// place belong to that copy: this one must not offer them, nor mark them clean when it quits)
if (location.mode === 'portable-readonly') {
  setPortableRoot(location.root, { locked: true })
  app.setPath('userData', join(app.getPath('appData'), 'ICCWorship Portable'))
  app.setPath('crashDumps', join(app.getPath('appData'), 'ICCWorship Portable', 'Crashpad'))
}

// Native crashes (GPU driver, video decoder) are written as minidumps to %APPDATA%\ICCWorship\Crashpad.
// Nothing is ever uploaded; the user can choose to include them in Help → Export diagnostics.
crashReporter.start({ uploadToServer: false })

// Settings → About → "Turn off graphics acceleration": a workaround for GPU drivers that crash or freeze the
// projector. Must be decided before the app is ready, so read the setting straight from disk.
try {
  const text = readFileSync(join(dataRoot(), 'data', 'settings.json'), 'utf8')
  const settings = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  if (settings?.disableHwAccel === true) app.disableHardwareAcceleration()
} catch {
  /* no settings yet: keep the default */
}
