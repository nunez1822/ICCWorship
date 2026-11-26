#!/usr/bin/env node
/**
 * Starts ICCWorship for manual / AI-driven end-to-end testing (Playwright MCP).
 *
 *   npm run e2e:launch            → fresh, empty test data every time
 *   npm run e2e:launch -- --keep  → keep the data from the previous run
 *   npm run e2e:launch -- --fullscreen → let the projector go full-screen on a 2nd monitor
 *   npm run e2e:launch -- --packaged   → run the installed-style build (dist/win-unpacked, from `npm run build:dir`)
 *                                       instead of the dev build. A packaged app ignores ICCWORSHIP_E2E (see
 *                                       src/main/index.ts), so the window.api.e2e dialog hooks don't exist there:
 *                                       only cases without native file dialogs can run against it.
 *
 * - Uses its own data folder (.e2e-data/) so your real Documents\ICCWorship is never touched.
 * - Opens Chrome DevTools Protocol on http://localhost:9222 so Playwright MCP can attach:
 *     claude mcp add playwright-iccworship -- npx @playwright/mcp@latest --cdp-endpoint http://localhost:9222
 * - Run `npm run build` first (the launcher uses the built app in out/).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const data = join(root, '.e2e-data')
const port = process.env.E2E_CDP_PORT || '9222'

const packaged = args.includes('--packaged')
const packagedExe = join(root, 'dist', 'win-unpacked', 'ICCWorship.exe')
if (packaged ? !existsSync(packagedExe) : !existsSync(join(root, 'out', 'main', 'index.js'))) {
  console.error(packaged ? 'Build the packaged app first:  npm run build:dir' : 'Build first:  npm run build')
  process.exit(1)
}
if (!args.includes('--keep')) rmSync(data, { recursive: true, force: true })
mkdirSync(data, { recursive: true })

const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_E2E: '1' }
if (!args.includes('--fullscreen')) env.ICCWORSHIP_WINDOWED = '1'
delete env.ELECTRON_RENDERER_URL

console.log(`ICCWorship E2E
  app         : ${packaged ? packagedExe + ' (packaged)' : 'out/ (dev build)'}
  data folder : ${data}${args.includes('--keep') ? ' (kept)' : ' (fresh)'}
  CDP endpoint: http://localhost:${port}
  stage/remote: http://localhost:7272/stage#pin=<PIN>  ·  /remote#pin=<PIN>  (PIN in Settings)
Press Ctrl+C to stop.`)

const cmd = packaged ? packagedExe : electron
const cmdArgs = packaged ? [`--remote-debugging-port=${port}`] : [root, `--remote-debugging-port=${port}`]
const child = spawn(cmd, cmdArgs, { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => {
  // ICCWorship.exe is the Electron binary itself: kill its helper processes too, or they keep dist\ locked
  if (packaged) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
  else child.kill()
})
