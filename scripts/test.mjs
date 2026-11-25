// Runs vitest from the folder's real, canonical path.
//
// Why: on Windows some shells (Git Bash, some terminals) start node with the drive letter
// in lower case ("c:\..."). Vitest then spawns its workers from "c:\...\node_modules\vitest"
// but loads test files as "C:\..." — Node's module cache is case-sensitive, so each test
// file gets a second copy of vitest and fails with
// "Cannot read properties of undefined (reading 'config')".
// Starting vitest from the canonical path makes both spellings agree. No-op elsewhere.
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const cwd = realpathSync.native(process.cwd())
const vitest = join(cwd, 'node_modules', 'vitest', 'vitest.mjs')
createRequire(import.meta.url).resolve('vitest') // fail early with a clear error if not installed

const r = spawnSync(process.execPath, [vitest, ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(r.status ?? 1)
