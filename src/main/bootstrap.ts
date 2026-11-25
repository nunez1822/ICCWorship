/**
 * Runs before every other main-process module (it is the first import in index.ts — keep it that way).
 * ES imports are hoisted, so anything that must happen before other modules touch app paths goes here.
 */
import { app } from 'electron'
import { join } from 'node:path'

// Test runs (smoke, e2e, packaged-check) point ICCWORSHIP_DATA at a throw-away folder. Give them their own
// Chromium profile, logs and single-instance lock too, so a test never collides with — or reads the logs of —
// the copy of ICCWorship the church actually uses.
const testData = process.env.ICCWORSHIP_DATA
if (testData) app.setPath('userData', join(testData, '.userdata'))
