#!/usr/bin/env node
/**
 * End-to-end smoke test: launches the built app (npm run build first) with a
 * throw-away data folder, walks through a mini service and saves screenshots.
 *
 *   node scripts/smoke.mjs [screenshotDir]
 */
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { WebSocket as WsClient } from 'ws'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const shots = resolve(process.argv[2] || join(root, 'smoke-shots'))
mkdirSync(shots, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'iccworship-smoke-'))
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** raw HTTP GET to the LAN server (lets us send headers a browser wouldn't, like a foreign Host) */
const httpGet = (port, path, headers = {}) =>
  new Promise((res) => {
    const r = httpRequest({ host: '127.0.0.1', port, path, headers }, (resp) => {
      resp.resume()
      res({ status: resp.statusCode, headers: resp.headers })
    })
    r.on('error', (e) => res({ status: 0, error: String(e) }))
    r.end()
  })

/** connect to the LAN WebSocket like a stage screen; resolves with the first state, a rejection or an HTTP status */
const wsConnect = (port, pin, opts = {}, onOpen) =>
  new Promise((res) => {
    const ws = new WsClient(`ws://127.0.0.1:${port}/ws?role=stage&pin=${pin}`, opts)
    const done = (v) => {
      clearTimeout(timer)
      ws.terminate()
      res(v)
    }
    const timer = setTimeout(() => done({ error: 'timeout' }), 5000)
    ws.on('open', () => onOpen?.(ws))
    ws.on('message', (d) => {
      const m = JSON.parse(String(d))
      if (m.type === 'hello' && !m.authed) done({ rejected: true })
      if (m.type === 'state') done({ state: m.state })
    })
    ws.on('unexpected-response', (_q, r) => done({ status: r.statusCode }))
    ws.on('close', (code) => done({ closed: code }))
    ws.on('error', (e) => done({ error: String(e) }))
  })

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_TEST_PROFILE: '1', ICCWORSHIP_WINDOWED: '1', ELECTRON_RENDERER_URL: '' }
})

/** true while the test makes requests that are SUPPOSED to fail (Chromium logs those as console errors) */
let expectingFailures = false
function watch(page, name) {
  page.on('console', (m) => m.type() === 'error' && !expectingFailures && errors.push(`[${name}] ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
}

/**
 * Screenshot of the projector window, taken by main. (After the crash test below, Playwright's handle for the
 * projector page stays "crashed" even though the window reloaded fine.)
 */
async function outShot(path) {
  const b64 = await app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('output.html'))
    return w ? (await w.webContents.capturePage()).toPNG().toString('base64') : ''
  })
  if (b64) writeFileSync(path, Buffer.from(b64, 'base64'))
}

async function windowByUrl(part) {
  for (let i = 0; i < 60; i++) {
    const w = app.windows().find((p) => p.url().includes(part))
    if (w) return w
    await sleep(250)
  }
  throw new Error('window not found: ' + part)
}

/** Evaluate in a window that may be reloading: retry until its new page answers (slow CI runners). */
async function evaluateWhenReady(part, fn, arg) {
  let last
  for (let i = 0; i < 60; i++) {
    try {
      const w = await windowByUrl(part)
      await w.waitForLoadState('domcontentloaded')
      return await w.evaluate(fn, arg)
    } catch (e) {
      if (!/context was destroyed|navigat|Target .*closed/i.test(String(e?.message))) throw e
      last = e
      await sleep(250)
    }
  }
  throw last
}

try {
  const op = await windowByUrl('index.html')
  watch(op, 'operator')
  const out = await windowByUrl('output.html')
  watch(out, 'output')
  await op.setViewportSize({ width: 1600, height: 950 }).catch(() => {})
  await op.waitForSelector('.modal', { timeout: 15000 })
  await sleep(600)
  await op.screenshot({ path: join(shots, '01-welcome.png') })

  // welcome → church name → start
  await op.fill('.modal input.input.big', 'Iglesia Cristiana de Prueba')
  await op.click('.modal-foot .btn.primary')
  await sleep(800)
  await op.screenshot({ path: join(shots, '02-live-empty.png') })

  // go live on the first song (3rd item in the sample plan)
  const items = op.locator('.plan-item')
  console.log('plan items:', await items.count())
  await items.nth(2).dblclick()
  await sleep(900)
  await op.screenshot({ path: join(shots, '03-live-song.png') })
  await outShot(join(shots, '04-projector-song-both.png'))

  // next slide, then Spanish only
  await op.keyboard.press('Space')
  await op.keyboard.press('2')
  await sleep(500)
  await outShot(join(shots, '05-projector-spanish.png'))
  await op.keyboard.press('3')

  // nursery message
  await op.fill('.controls input[placeholder="#"]', '12')
  await op.locator('.controls .btn.sm').first().click()
  await sleep(700)
  await outShot(join(shots, '06-projector-message.png'))

  // scripture from the Bible page
  await op.click('.nav button:nth-child(4)')
  await sleep(300)
  await op.fill('input.input.big', 'Juan 3:16-18')
  await sleep(800)
  await op.screenshot({ path: join(shots, '07-bible.png') })
  await op.locator('.btn.live').first().click()
  await sleep(700)
  await outShot(join(shots, '08-projector-scripture.png'))

  // LBLA paste-in setup
  await op.click('.tabs button:nth-child(3)')
  await sleep(300)
  await op.locator('.btn.primary.lg').click()
  await sleep(500)
  await op.fill('input.input.big', 'Juan 3:16-18')
  await op.fill('textarea.textarea', readFileSync(join(root, 'tests', 'fixtures', 'lbla-juan-3-16-18.txt'), 'utf8'))
  await op.locator('button:has-text("✨")').click()
  await sleep(500)
  await op.screenshot({ path: join(shots, '09-lbla-detect.png') })
  await op.locator('button:has-text("💾")').first().click()
  await sleep(600)
  await op.screenshot({ path: join(shots, '10-lbla-saved.png') })

  // ---- media, PowerPoint & PDF (file dialogs are stubbed to return test files) ----
  const pickFiles = (paths) =>
    app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: p })
    }, paths)
  const mp4 = process.env.SMOKE_MP4 || join(root, 'tests', 'fixtures', 'sample.mp4') // a 5-second clip
  // default: a scanned-style PDF whose only content is a JPEG 2000 image (needs pdf.js's wasm decoder)
  const pdf = process.env.SMOKE_PDF || join(root, 'tests', 'fixtures', 'sample-jpx.pdf')
  const pptx = process.env.SMOKE_PPTX || join(root, 'tests', 'fixtures', 'sample.pptx')
  await op.click('.nav button:nth-child(5)')
  await sleep(400)
  if (mp4) {
    await pickFiles([mp4])
    await op.locator('.page-head .btn').nth(0).click()
    await op.waitForSelector('.media-card', { timeout: 20000 })
    await sleep(800)
    await op.screenshot({ path: join(shots, '20-media-library.png') })
    await op.locator('.media-card').first().dblclick()
    await sleep(2500)
    await outShot(join(shots, '21-projector-video.png'))
    const st = await op.evaluate(() => window.api.live.get())
    console.log('video:', JSON.stringify({ playing: st.video?.playing, progress: st.videoProgress }))

    // The projector page crashes in the middle of the video: it must come back by itself, showing what is live
    // and continuing the video where it was (not from the start, with sound, mid-service).
    const before = (await op.evaluate(() => window.api.live.get())).videoProgress?.current || 0
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('output.html'))
        ?.webContents.forcefullyCrashRenderer()
    )
    // ask the window itself (Playwright's handle for the crashed page stays dead)
    let resumedAt = -1
    for (let i = 0; i < 40 && resumedAt <= 0; i++) {
      await sleep(250)
      resumedAt = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('output.html'))
        return w ? w.webContents.executeJavaScript("document.querySelector('video')?.currentTime ?? -1").catch(() => -1) : -1
      })
    }
    const logText = readFileSync(join(data, '.userdata', 'logs', 'main.log'), 'utf8')
    const recovered = before > 0.5 && resumedAt >= before - 0.3 && /output window crashed/.test(logText)
    console.log('projector restarted after a crash, video resumed:', recovered ? '✓' : '✗', JSON.stringify({ before, resumedAt }))
    if (!recovered) errors.push(`projector did not recover from a crash mid-video (before ${before}, after ${resumedAt})`)
    await op.click('.nav button:nth-child(1)')
    await sleep(600)
    await op.screenshot({ path: join(shots, '22-live-video-controls.png') })
    await op.click('.nav button:nth-child(5)')
    await sleep(400)
  }
  await pickFiles([pptx])
  await op.locator('.page-head .btn.primary').click()
  await op.waitForSelector('.tabs button.on:has-text("(1)")', { timeout: 90000 })
  await sleep(800)
  await op.screenshot({ path: join(shots, '23-pptx-imported.png') })
  if (pdf) {
    await pickFiles([pdf])
    await op.locator('.page-head .btn.primary').click()
    await op.waitForSelector('.tabs button.on:has-text("(2)")', { timeout: 90000 })
    await sleep(600)
  }
  const pres = await op.evaluate(() => window.api.db.list('presentations'))
  console.log(
    'presentations:',
    JSON.stringify(pres.map((p) => ({ name: p.name, method: p.method, slides: p.slides.length, notes: p.slides.map((s) => s.notes) })))
  )
  await op.locator('.media-card').first().click()
  await sleep(600)
  await op.screenshot({ path: join(shots, '24-pptx-modal.png') })
  await op.locator('.modal-foot .btn.live').click()
  await sleep(900)
  await outShot(join(shots, '25-projector-pptx.png'))
  if (pdf) {
    await op.locator('.media-card').nth(1).click()
    await sleep(500)
    await op.locator('.modal-foot .btn.live').click()
    await sleep(900)
    await outShot(join(shots, '26-projector-pdf.png'))
  }

  // the JPEG 2000 image must be decoded (it rendered blank before pdf.js got its wasm decoders)
  if (!process.env.SMOKE_PDF) {
    const jpx = pres.find((p) => p.method === 'pdf')
    const px = jpx
      ? await op.evaluate(async (url) => {
          const bmp = await createImageBitmap(await (await fetch(url)).blob())
          const c = new OffscreenCanvas(bmp.width, bmp.height)
          const g = c.getContext('2d')
          g.drawImage(bmp, 0, 0)
          return [...g.getImageData(Math.floor(bmp.width / 4), Math.floor(bmp.height / 4), 1, 1).data]
        }, jpx.slides[0].image)
      : null
    const red = !!px && px[0] > 150 && px[1] < 100 && px[2] < 100
    console.log('JPEG 2000 PDF decoded:', red ? '✓' : `✗ ${JSON.stringify(px)}`)
    if (!red) errors.push('JPEG 2000 image in a PDF was not decoded')
  }

  // media:// must answer bad requests instead of failing, and serve only media files
  expectingFailures = true
  const mediaChecks = await op.evaluate(
    async (sample) => {
      const url = 'media://local/' + encodeURIComponent(sample)
      const badRange = (await fetch(url, { headers: { Range: 'bytes=500-10' } })).status
      const notMedia = (await fetch('media://local/' + encodeURIComponent('C:\\Windows\\win.ini'))).status
      return { badRange, notMedia }
    },
    join(root, 'tests', 'fixtures', 'sample.jpg')
  )
  await sleep(300)
  expectingFailures = false
  console.log(
    'media:// bad range → 416, non-media → 404:',
    JSON.stringify(mediaChecks),
    mediaChecks.badRange === 416 && mediaChecks.notMedia === 404 ? '✓' : '✗'
  )
  if (mediaChecks.badRange !== 416 || mediaChecks.notMedia !== 404) errors.push('media:// protocol checks failed')

  // the LAN server serves the slide image on screen through an opaque token; a bad Range must not crash it
  {
    const { port } = await op.evaluate(() => window.api.server.info())
    const pin = (await op.evaluate(() => window.api.settings.get())).remotePin
    const r = await wsConnect(port, pin)
    const slide = r.state?.slides?.[r.state.slideIndex]
    const json = JSON.stringify(r.state || {})
    const noPaths = !!r.state && !/[A-Za-z]:\\\\|media:\/\//.test(json)
    console.log('LAN state has no local paths:', noPaths ? '✓' : '✗')
    if (!noPaths) errors.push('LAN state leaks local file paths')
    if (slide?.media?.startsWith('/file/')) {
      const ok = await httpGet(port, slide.media)
      const bad = await httpGet(port, slide.media, { Range: 'bytes=500-10' })
      const good = ok.status === 200 && ok.headers['x-content-type-options'] === 'nosniff' && bad.status === 416
      console.log('LAN /file token → 200 nosniff, bad Range → 416:', good ? '✓' : `✗ ${ok.status} ${bad.status}`)
      if (!good) errors.push('LAN /file checks failed')
    } else errors.push('no image slide on screen for the LAN /file check: ' + JSON.stringify(slide))
  }

  // other pages
  const pages = ['plans', 'songs', 'media', 'themes', 'people', 'reports']
  const idx = { plans: 2, songs: 3, media: 5, themes: 6, people: 7, reports: 8 }
  for (const p of pages) {
    await op.click(`.nav button:nth-child(${idx[p]})`)
    await sleep(600)
    await op.screenshot({ path: join(shots, `11-${p}.png`) })
  }
  await op.click('.nav button:last-child')
  await sleep(1200)
  await op.screenshot({ path: join(shots, '12-settings.png') })

  // light theme + English UI
  await op.click('.topbar .seg >> nth=1 >> button:has-text("English")')
  await op.click('.nav button:nth-child(1)')
  await sleep(600)
  await op.screenshot({ path: join(shots, '13-live-english.png') })

  // stage window
  await op.evaluate(() => window.api.stage.open())
  const stage = await windowByUrl('stage.html')
  watch(stage, 'stage')
  await sleep(1200)
  await stage.screenshot({ path: join(shots, '14-stage.png') })

  const info = await op.evaluate(() => window.api.server.info())
  console.log('server:', JSON.stringify({ running: info.running, port: info.port, urls: info.urls }))

  // ---- phone remote over HTTP + WebSocket (opened in a phone-sized window) ----
  await op.click('.nav button:nth-child(1)')
  await op.locator('.plan-item').nth(3).dblclick()
  await sleep(600)
  const before = (await op.evaluate(() => window.api.live.get())).slideIndex
  const pin = (await op.evaluate(() => window.api.settings.get())).remotePin
  await app.evaluate(({ BrowserWindow }, url) => {
    const w = new BrowserWindow({ width: 390, height: 844, title: 'phone' })
    void w.loadURL(url)
  }, `http://127.0.0.1:${info.port}/remote#pin=${pin}`)
  const phone = await windowByUrl('/remote')
  watch(phone, 'remote')
  await phone.waitForSelector('.r-nav', { timeout: 15000 })
  await phone.locator('.r-nav .r-btn.primary').click()
  await sleep(700)
  const after = (await op.evaluate(() => window.api.live.get())).slideIndex
  console.log('remote next:', before, '→', after, after === before + 1 ? '✓' : '✗')
  if (after !== before + 1) errors.push('remote Next did not advance the slide')
  await phone.screenshot({ path: join(shots, '15-phone-remote.png') })
  // wrong PIN must be rejected
  await app.evaluate(({ BrowserWindow }, url) => {
    const w = new BrowserWindow({ width: 390, height: 600, title: 'badpin' })
    void w.loadURL(url)
  }, `http://127.0.0.1:${info.port}/remote#pin=0000`)
  await sleep(1500)
  const bad = app
    .windows()
    .filter((w) => w.url().includes('/remote'))
    .pop()
  const rejected = await bad.locator('.r-err').count()
  console.log('wrong PIN rejected:', rejected ? '✓' : '✗')
  if (!rejected && pin !== '0000') errors.push('wrong PIN was accepted')

  // ---- LAN hardening ----
  // a page on another site (DNS rebinding / a foreign Origin) must be refused
  const evilHost = await httpGet(info.port, '/remote', { Host: 'evil.example' })
  const evilOrigin = await wsConnect(info.port, pin, { headers: { Origin: 'http://evil.example' } })
  const lanRefused = evilHost.status === 403 && evilOrigin.status === 401
  console.log('foreign Host / Origin refused:', lanRefused ? '✓' : `✗ ${evilHost.status} ${JSON.stringify(evilOrigin)}`)
  if (!lanRefused) errors.push('LAN server accepted a foreign Host or Origin')
  // malformed and oversized WebSocket frames used to be uncaught exceptions in main (the app would stop)
  await wsConnect(info.port, pin, {}, (ws) => ws.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false }))
  await wsConnect(info.port, pin, {}, (ws) => ws.send('x'.repeat(70 * 1024)))
  await sleep(500)
  const alive = await op.evaluate(() => window.api.server.info()).catch(() => null)
  console.log('bad WebSocket frames survived:', alive?.running ? '✓' : '✗')
  if (!alive?.running) errors.push('the app or LAN server did not survive bad WebSocket frames')
  // the stage display needs the PIN in a browser (other origin than the phone above, so no remembered PIN)
  await app.evaluate(({ BrowserWindow }, url) => {
    const w = new BrowserWindow({ width: 900, height: 600, title: 'lan-stage' })
    void w.loadURL(url)
  }, `http://localhost:${info.port}/stage`)
  const lanStage = await windowByUrl(`localhost:${info.port}/stage`)
  watch(lanStage, 'lan-stage')
  const askedPin = await lanStage
    .waitForSelector('.pin-screen', { timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  await lanStage.fill('.pin-screen input', pin)
  await lanStage.click('.pin-screen .pin-btn')
  const shown = await lanStage
    .waitForSelector('.stage', { timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  // reloading a page must still work although navigation away from it is blocked; the PIN is remembered
  await lanStage.evaluate(() => location.reload())
  await sleep(500)
  const reloaded = await lanStage
    .waitForSelector('.stage', { timeout: 10000 })
    .then(() => true)
    .catch(() => false)
  console.log('page reload works, PIN remembered:', reloaded ? '✓' : '✗')
  if (!reloaded) errors.push('reloading the stage page failed')
  // …but going anywhere else is not (e.g. a file dropped outside a drop zone would replace the page)
  const stageUrl = lanStage.url()
  await lanStage.evaluate((u) => (location.href = u), `http://localhost:${info.port}/remote`).catch(() => {})
  await sleep(800)
  const stayed = lanStage.url() === stageUrl && (await lanStage.locator('.stage').count()) > 0
  console.log('navigating away is blocked:', stayed ? '✓' : `✗ ${lanStage.url()}`)
  if (!stayed) errors.push('a page navigated away (will-navigate guard)')
  console.log('stage asks for the PIN, then shows:', askedPin && shown ? '✓' : `✗ ${askedPin} ${shown}`)
  if (!askedPin || !shown) errors.push('stage display PIN flow failed')
  // ---- backup → change data → restore round trip ----
  const backupPath = join(data, 'smoke-backup.zip')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, backupPath)
  const made = await op.evaluate(() => window.api.backup.create())
  const songsBefore = (await op.evaluate(() => window.api.db.list('songs'))).length
  await op.evaluate(() =>
    window.api.db.upsert('songs', { id: 'temp-song', title: 'Temp', tags: [], sections: [], arrangement: [], linesPerSlide: 4, createdAt: 0, updatedAt: 0 })
  )
  await sleep(400)
  const restored = await op.evaluate((p) => window.api.backup.restore(p), backupPath)
  // restore reloads the operator window: wait for the reloaded page instead of guessing how long that takes
  const songsAfter = (await evaluateWhenReady('index.html', () => window.api.db.list('songs'))).length
  console.log('backup/restore:', JSON.stringify({ files: made?.files, ok: restored?.ok, songsBefore, songsAfter }), songsAfter === songsBefore ? '✓' : '✗')
  if (songsAfter !== songsBefore) errors.push('restore did not bring back the backed-up data')

  // the log exists and holds the startup line (Help → Open logs folder / Export diagnostics)
  const logOk = /ICCWorship .* starting/.test(readFileSync(join(data, '.userdata', 'logs', 'main.log'), 'utf8'))
  console.log('log file written:', logOk ? '✓' : '✗')
  if (!logOk) errors.push('no log file')

  // operator page must never be served over the network
  const opPage = await fetch(`http://127.0.0.1:${info.port}/index.html`).then((r) => r.status)
  console.log('operator page over LAN blocked:', opPage === 404 ? '✓' : `✗ (${opPage})`)
  if (opPage !== 404) errors.push('operator page exposed over the network')
} catch (e) {
  errors.push('SMOKE FAILURE: ' + (e?.stack || e))
} finally {
  await app.close().catch(() => {})
  rmSync(data, { recursive: true, force: true })
}

console.log('screenshots in', shots)
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'))
  process.exitCode = 1
} else console.log('no console errors ✓')
