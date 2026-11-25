/**
 * Runs before every other main-process module (it is the first import in index.ts — keep it that way).
 * ES imports are hoisted, so anything that must happen before other modules touch app paths, or before the app
 * is ready, goes here.
 */
import { app, crashReporter } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Test runs (smoke, e2e, packaged-check) point ICCWORSHIP_DATA at a throw-away folder. Give them their own
// Chromium profile, logs, crash dumps and single-instance lock too, so a test never collides with — or reads
// the logs of — the copy of ICCWorship the church actually uses.
const testData = process.env.ICCWORSHIP_DATA
if (testData) {
  app.setPath('userData', join(testData, '.userdata'))
  app.setPath('crashDumps', join(testData, '.userdata', 'Crashpad'))
}

// Native crashes (GPU driver, video decoder) are written as minidumps to %APPDATA%\ICCWorship\Crashpad.
// Nothing is ever uploaded; the user can choose to include them in Help → Export diagnostics.
crashReporter.start({ uploadToServer: false })

// Settings → About → "Turn off graphics acceleration": a workaround for GPU drivers that crash or freeze the
// projector. Must be decided before the app is ready, so read the setting straight from disk.
try {
  const root = testData || join(app.getPath('documents'), 'ICCWorship')
  const text = readFileSync(join(root, 'data', 'settings.json'), 'utf8')
  const settings = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  if (settings?.disableHwAccel === true) app.disableHardwareAcceleration()
} catch {
  /* no settings yet: keep the default */
}
