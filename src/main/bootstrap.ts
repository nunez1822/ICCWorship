/**
 * Runs before every other main-process module (it is the first import in index.ts — keep it that way).
 * ES imports are hoisted, so anything that must happen before other modules touch app paths, or before the app
 * is ready, goes here.
 */
import { app, crashReporter } from 'electron'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataLocation, type DataLocation } from './portable'
import { dataRoot, setPortableRoot } from './paths'

// Test runs (smoke, e2e, packaged-check) set ICCWORSHIP_TEST_PROFILE as well as pointing ICCWORSHIP_DATA at a
// throw-away folder. Give them their own Chromium profile, logs, crash dumps and single-instance lock too, so a test
// never collides with — or reads the logs of — the copy of ICCWorship the church actually uses. ICCWORSHIP_DATA on
// its own is a user setting (data on another drive or a synced folder) and must not move the profile, the logs or
// the lock: that would lose localStorage and allow a second running copy.
const testData = process.env.ICCWORSHIP_DATA
if (testData && process.env.ICCWORSHIP_TEST_PROFILE === '1') {
  app.setPath('userData', join(testData, '.userdata'))
  app.setPath('crashDumps', join(testData, '.userdata', 'Crashpad'))
}

// Portable exe (see portable.ts): the data AND the profile, logs and crash dumps go in "ICCWorship Data" beside the
// exe, so nothing is left on the computer. Its own profile also gives it its own single-instance lock.
function canWrite(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.write-test-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}
export const location: DataLocation = dataLocation({ env: process.env, isPackaged: app.isPackaged, canWrite })
if (location.mode === 'portable') {
  setPortableRoot(location.root)
  app.setPath('userData', join(location.root, '.app'))
  app.setPath('crashDumps', join(location.root, '.app', 'Crashpad'))
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
