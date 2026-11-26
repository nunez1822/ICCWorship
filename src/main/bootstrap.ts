/**
 * Runs before every other main-process module (it is the first import in index.ts — keep it that way).
 * ES imports are hoisted, so anything that must happen before other modules touch app paths goes here.
 */
import { app } from 'electron'
import { join } from 'node:path'

// Test runs (smoke, e2e, packaged-check) set ICCWORSHIP_TEST_PROFILE as well as pointing ICCWORSHIP_DATA at a
// throw-away folder. Give them their own Chromium profile, logs and single-instance lock too, so a test never
// collides with — or reads the logs of — the copy of ICCWorship the church actually uses. ICCWORSHIP_DATA on its
// own is a user setting (data on another drive or a synced folder) and must not move the profile, the logs or the
// lock: that would lose localStorage and allow a second running copy.
const testData = process.env.ICCWORSHIP_DATA
if (testData && process.env.ICCWORSHIP_TEST_PROFILE === '1') app.setPath('userData', join(testData, '.userdata'))
