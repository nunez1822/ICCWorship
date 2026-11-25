#!/usr/bin/env node
/**
 * Starts ICCWorship for manual / AI-driven end-to-end testing (Playwright MCP).
 *
 *   npm run e2e:launch            → fresh, empty test data every time
 *   npm run e2e:launch -- --keep  → keep the data from the previous run
 *   npm run e2e:launch -- --fullscreen → let the projector go full-screen on a 2nd monitor
 *
 * - Uses its own data folder (.e2e-data/) so your real Documents\ICCWorship is never touched.
 * - Opens Chrome DevTools Protocol on http://localhost:9222 so Playwright MCP can attach:
 *     claude mcp add playwright-iccworship -- npx @playwright/mcp@latest --cdp-endpoint http://localhost:9222
 * - Run `npm run build` first (the launcher uses the built app in out/).
 */
import { spawn } from 'node:child_process'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const data = join(root, '.e2e-data')
const port = process.env.E2E_CDP_PORT || '9222'

if (!existsSync(join(root, 'out', 'main', 'index.js'))) {
  console.error('Build first:  npm run build')
  process.exit(1)
}
if (!args.includes('--keep')) rmSync(data, { recursive: true, force: true })
mkdirSync(data, { recursive: true })

const electron = createRequire(import.meta.url)('electron')
const env = { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_E2E: '1' }
if (!args.includes('--fullscreen')) env.ICCWORSHIP_WINDOWED = '1'
delete env.ELECTRON_RENDERER_URL

console.log(`ICCWorship E2E
  data folder : ${data}${args.includes('--keep') ? ' (kept)' : ' (fresh)'}
  CDP endpoint: http://localhost:${port}
  stage/remote: http://localhost:7272/stage  ·  /remote (PIN in Settings)
Press Ctrl+C to stop.`)

const child = spawn(electron, [root, `--remote-debugging-port=${port}`], { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => child.kill())
