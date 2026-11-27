#!/usr/bin/env node
/**
 * Launches the PACKAGED app (dist/win-unpacked/ICCWorship.exe) with throw-away data and checks that the operator,
 * projector and stage windows render. Unit tests, smoke and e2e all run the unpackaged app from node_modules, so
 * this is the only check that exercises what users install: asar packaging, and the Electron fuses set in
 * electron-builder.yml (checked below), including asar integrity validation (the app would not start otherwise).
 *
 *   pnpm build:dir && node scripts/packaged-check.mjs [path\to\ICCWorship.exe]
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, relative, resolve } from 'node:path'
import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses'
import { chromium } from 'playwright-core'

const root = resolve(import.meta.dirname, '..')
const exe = resolve(process.argv[2] || join(root, 'dist', 'win-unpacked', 'ICCWorship.exe'))
const port = process.env.PACKAGED_CDP_PORT || '9223'
if (!existsSync(exe)) {
  console.error(`Not found: ${exe}\nRun "pnpm build:dir" first.`)
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = false
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failed = true
}

// Fuses: must match electronFuses in electron-builder.yml. Read before launching, so an error here leaves no app
// running. (electron-builder flips them with its own copy of @electron/fuses; this one only reads them back.)
const wire = await getCurrentFuseWire(exe)
const expectFuse = (opt, on) => check(wire[opt] === (on ? FuseState.ENABLE : FuseState.DISABLE), `fuse ${FuseV1Options[opt]} ${on ? 'on' : 'off'}`)
expectFuse(FuseV1Options.RunAsNode, false)
expectFuse(FuseV1Options.EnableNodeOptionsEnvironmentVariable, false)
expectFuse(FuseV1Options.EnableNodeCliInspectArguments, false)
expectFuse(FuseV1Options.EnableEmbeddedAsarIntegrityValidation, true)
expectFuse(FuseV1Options.OnlyLoadAppFromAsar, true)
expectFuse(FuseV1Options.EnableCookieEncryption, true)
expectFuse(FuseV1Options.GrantFileProtocolExtraPrivileges, false) // pages load from app://iccworship (src/main/appUrl.ts)

// Every built page file must have a type app://iccworship serves (APP_TYPES in src/main/appUrl.ts): a new kind of
// asset (a .webp imported by a page, say) would otherwise be "not found" in every window, and nothing else would
// notice before Sunday. The licence texts beside pdf.js's wasm and Vite's own .vite folder are never fetched.
{
  const src = readFileSync(join(root, 'src', 'main', 'appUrl.ts'), 'utf8')
  const block = /APP_TYPES[^{]*\{([^}]*)\}/.exec(src)?.[1] ?? ''
  const types = new Set([...block.matchAll(/'(\.[a-z0-9]+)'\s*:/g)].map((m) => m[1]))
  const pages = join(root, 'out', 'renderer')
  const unserved = readdirSync(pages, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => relative(pages, join(f.parentPath, f.name)))
    .filter((f) => !f.startsWith('.vite') && !/(^|[\\/])LICENSE[^\\/]*$/.test(f) && !types.has(extname(f).toLowerCase()))
  check(types.size > 0 && unserved.length === 0, `every built page file has an app:// type${unserved.length ? ` (not: ${unserved.join(', ')})` : ''}`)
}

const data = mkdtempSync(join(tmpdir(), 'iccworship-packaged-'))
const env = { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_TEST_PROFILE: '1', ICCWORSHIP_WINDOWED: '1' }
delete env.ELECTRON_RENDERER_URL
const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'inherit' })

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
    if (child.exitCode !== null) throw new Error(`the app exited during startup (code ${child.exitCode})`)
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
  if (child.exitCode === null) spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
  await sleep(500)
  rmSync(data, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
// Portable mode (src/main/portable.ts): started the way ICCWorship-Portable.exe's launcher starts it, the app keeps
// its data, profile and logs in "ICCWorship Data" beside the exe, and touches nothing else.
{
  const exeDir = mkdtempSync(join(tmpdir(), 'iccworship-portable-'))
  // (the launcher also names the app it unpacked: only ICCWorship's own portable launcher counts)
  const penv = { ...process.env, PORTABLE_EXECUTABLE_DIR: exeDir, PORTABLE_EXECUTABLE_APP_FILENAME: 'iccworship', ICCWORSHIP_WINDOWED: '1' }
  delete penv.ICCWORSHIP_DATA
  delete penv.ICCWORSHIP_TEST_PROFILE
  delete penv.ELECTRON_RENDERER_URL
  const root = join(exeDir, 'ICCWorship Data')
  // an existing "ICCWorship Data" folder always means portable; without it, a PC that already has data in Documents
  // (a developer's) would keep using that, as a church upgrading from portable 1.0 does
  mkdirSync(root)
  // (a copy of ICCWorship already open on this PC makes this one say so and not start: close it first)
  const p = spawn(exe, [], { env: penv, stdio: 'ignore' })
  const want = [join(root, 'data', 'settings.json'), join(root, '.app', 'logs', 'main.log')]
  for (let i = 0; i < 60 && !want.every((f) => existsSync(f)); i++) await sleep(500)
  check(
    want.every((f) => existsSync(f)),
    'portable: data, settings and logs are kept beside the exe'
  )
  if (p.exitCode === null) spawnSync('taskkill', ['/T', '/F', '/PID', String(p.pid)], { stdio: 'ignore' })
  await sleep(500)
  rmSync(exeDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log(failed ? 'PACKAGED CHECK FAILED' : 'packaged app OK')
process.exit(failed ? 1 : 0)
