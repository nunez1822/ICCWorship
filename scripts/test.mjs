// Runs `vp test` (Vitest, bundled in Vite+) from the folder's real, canonical path. Arguments are passed through.
//
// Why: on Windows some shells (Git Bash, some terminals) start node with the drive letter
// in lower case ("c:\..."). Vitest then spawns its workers from "c:\...\node_modules\..."
// but loads test files as "C:\..." — Node's module cache is case-sensitive, so each test
// file gets a second copy of Vitest and fails with
// "Cannot read properties of undefined (reading 'config')". Still true with `vp test` (Vite+ 1.8).
// Starting it from the canonical path makes both spellings agree. No-op elsewhere.
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

const cwd = realpathSync.native(process.cwd())
const vp = join(cwd, 'node_modules', 'vite-plus', 'bin', 'vp')
if (!existsSync(vp)) {
  console.error('vite-plus is not installed: run "pnpm install" first.')
  process.exit(1)
}

const r = spawnSync(process.execPath, [vp, 'test', ...process.argv.slice(2)], { cwd, stdio: 'inherit' })
process.exit(r.status ?? 1)
