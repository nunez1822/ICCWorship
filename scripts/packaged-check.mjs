#!/usr/bin/env node
/**
 * Launches the PACKAGED app (dist/win-unpacked/ICCWorship.exe) with throw-away data and checks that the operator,
 * projector and stage windows render. Unit tests, smoke and e2e all run the unpackaged app from node_modules, so
 * this is the only check that exercises what users install: asar packaging, Electron fuses, asar integrity.
 *
 *   npm run build:dir && node scripts/packaged-check.mjs [path\to\ICCWorship.exe]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const root = resolve(import.meta.dirname, '..')
const exe = resolve(process.argv[2] || join(root, 'dist', 'win-unpacked', 'ICCWorship.exe'))
const port = process.env.PACKAGED_CDP_PORT || '9223'
if (!existsSync(exe)) {
  console.error(`Not found: ${exe}\nRun "npm run build:dir" first.`)
  process.exit(1)
}

const data = mkdtempSync(join(tmpdir(), 'iccworship-packaged-'))
const env = { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_WINDOWED: '1' }
delete env.ELECTRON_RENDERER_URL
const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'inherit' })
let exited = null
child.on('exit', (code) => (exited = code))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failed = true
}

let browser
try {
  for (let i = 0; i < 60 && !browser; i++) {
    if (exited !== null) throw new Error(`the app exited during startup (code ${exited})`)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null)
    if (!browser) await sleep(500)
  }
  if (!browser) throw new Error('could not connect to the app over CDP')
  const ctx = browser.contexts()[0]
  const page = async (part) => {
    for (let i = 0; i < 60; i++) {
      const p = ctx.pages().find((pg) => pg.url().includes(part))
      if (p) return p
      await sleep(250)
    }
    return null
  }
  const op = await page('index.html')
  check(!!op, 'operator window opened')
  if (op) {
    await op.waitForSelector('.modal', { timeout: 15000 }).catch(() => {})
    check((await op.locator('.modal').count()) > 0, 'operator UI rendered (welcome dialog)')
    check(await op.evaluate(() => typeof window.api === 'object'), 'preload bridge available')
    // pdf.js loads its JPEG 2000 / JBIG2 decoders from inside app.asar at run time
    const wasm = await op.evaluate(async () => {
      try {
        return (await (await fetch(new URL('pdfjs-wasm/openjpeg.wasm', location.href))).arrayBuffer()).byteLength
      } catch (e) {
        return String(e)
      }
    })
    check(typeof wasm === 'number' && wasm > 1000, `pdf.js wasm decoders load (${wasm})`)
  }
  const out = await page('output.html')
  check(!!out && (await out.locator('#root *').count()) > 0, 'projector window rendered')
  if (op) await op.evaluate(() => window.api.stage.open())
  const stage = await page('stage.html')
  check(!!stage && (await stage.locator('#root *').count()) > 0, 'stage window rendered')
} catch (e) {
  check(false, String(e?.message || e))
} finally {
  await browser?.close().catch(() => {})
  // kill the whole process tree: Electron helpers would otherwise keep files in dist/ locked
  if (exited === null) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
  await sleep(500)
  rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
console.log(failed ? 'PACKAGED CHECK FAILED' : 'packaged app OK')
process.exit(failed ? 1 : 0)
