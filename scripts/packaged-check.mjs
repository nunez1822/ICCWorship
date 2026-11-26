#!/usr/bin/env node
/**
 * Launches the PACKAGED app (dist/win-unpacked/ICCWorship.exe) with throw-away data and checks that the operator,
 * projector and stage windows render. Unit tests, smoke and e2e all run the unpackaged app from node_modules, so
 * this is the only check that exercises what users install: asar packaging, and the Electron fuses set in
 * electron-builder.yml (checked below), including asar integrity validation (the app would not start otherwise).
 *
 *   npm run build:dir && node scripts/packaged-check.mjs [path\to\ICCWorship.exe]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import fuses from '@electron/fuses' // CommonJS: no named exports
import { chromium } from 'playwright-core'

const root = resolve(import.meta.dirname, '..')
const exe = resolve(process.argv[2] || join(root, 'dist', 'win-unpacked', 'ICCWorship.exe'))
const port = process.env.PACKAGED_CDP_PORT || '9223'
if (!existsSync(exe)) {
  console.error(`Not found: ${exe}\nRun "npm run build:dir" first.`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failed = true
}

// Fuses: must match electronFuses in electron-builder.yml. Read before launching, so an error here leaves no app
// running. The wire holds one byte per fuse: '1' (49) on, '0' (48) off (FuseState is not exported by the package).
const { FuseV1Options, getCurrentFuseWire } = fuses
const wire = await getCurrentFuseWire(exe)
const expectFuse = (opt, on) => check(wire[opt] === (on ? 49 : 48), `fuse ${FuseV1Options[opt]} ${on ? 'on' : 'off'}`)
expectFuse(FuseV1Options.RunAsNode, false)
expectFuse(FuseV1Options.EnableNodeOptionsEnvironmentVariable, false)
expectFuse(FuseV1Options.EnableNodeCliInspectArguments, false)
expectFuse(FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true)
expectFuse(FuseV1Options.OnlyLoadAppFromAsar, true)
expectFuse(FuseV1Options.EnableCookieEncryption, true)
expectFuse(FuseV1Options.GrantFileProtocolExtraPrivileges, true) // pages load from file://; see electron-builder.yml

const data = mkdtempSync(join(tmpdir(), 'iccworship-packaged-'))
const env = { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_TEST_PROFILE: '1', ICCWORSHIP_WINDOWED: '1' }
delete env.ELECTRON_RENDERER_URL
const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'inherit' })
let exited = null
child.on('exit', (code) => (exited = code))

/** True once React has rendered something into #root (windows load asynchronously). */
const rendered = (p) =>
  p
    ? p.waitForSelector('#root *', { state: 'attached', timeout: 15000 }).then(
        () => true,
        () => false
      )
    : false

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
  check(await rendered(out), 'projector window rendered')
  if (op) await op.evaluate(() => window.api.stage.open())
  const stage = await page('stage.html')
  check(await rendered(stage), 'stage window rendered')
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
