#!/usr/bin/env node
/**
 * End-to-end smoke test: launches the built app (npm run build first) with a
 * throw-away data folder, walks through a mini service and saves screenshots.
 *
 *   node scripts/smoke.mjs [screenshotDir]
 */
import { _electron as electron } from 'playwright-core'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const shots = resolve(process.argv[2] || join(root, 'smoke-shots'))
mkdirSync(shots, { recursive: true })
const data = mkdtempSync(join(tmpdir(), 'iccworship-smoke-'))
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const app = await electron.launch({
  args: [root],
  cwd: root,
  env: { ...process.env, ICCWORSHIP_DATA: data, ICCWORSHIP_WINDOWED: '1', ELECTRON_RENDERER_URL: '' }
})

function watch(page, name) {
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${name}] ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`))
}

async function windowByUrl(part) {
  for (let i = 0; i < 60; i++) {
    const w = app.windows().find((p) => p.url().includes(part))
    if (w) return w
    await sleep(250)
  }
  throw new Error('window not found: ' + part)
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
  await out.screenshot({ path: join(shots, '04-projector-song-both.png') })

  // next slide, then Spanish only
  await op.keyboard.press('Space')
  await op.keyboard.press('2')
  await sleep(500)
  await out.screenshot({ path: join(shots, '05-projector-spanish.png') })
  await op.keyboard.press('3')

  // nursery message
  await op.fill('.controls input[placeholder="#"]', '12')
  await op.locator('.controls .btn.sm').first().click()
  await sleep(700)
  await out.screenshot({ path: join(shots, '06-projector-message.png') })

  // scripture from the Bible page
  await op.click('.nav button:nth-child(4)')
  await sleep(300)
  await op.fill('input.input.big', 'Juan 3:16-18')
  await sleep(800)
  await op.screenshot({ path: join(shots, '07-bible.png') })
  await op.locator('.btn.live').first().click()
  await sleep(700)
  await out.screenshot({ path: join(shots, '08-projector-scripture.png') })

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
  const mp4 = process.env.SMOKE_MP4
  const pdf = process.env.SMOKE_PDF
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
    await out.screenshot({ path: join(shots, '21-projector-video.png') })
    const st = await op.evaluate(() => window.api.live.get())
    console.log('video:', JSON.stringify({ playing: st.video?.playing, progress: st.videoProgress }))
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
  console.log('presentations:', JSON.stringify(pres.map((p) => ({ name: p.name, method: p.method, slides: p.slides.length, notes: p.slides.map((s) => s.notes) }))))
  await op.locator('.media-card').first().click()
  await sleep(600)
  await op.screenshot({ path: join(shots, '24-pptx-modal.png') })
  await op.locator('.modal-foot .btn.live').click()
  await sleep(900)
  await out.screenshot({ path: join(shots, '25-projector-pptx.png') })
  if (pdf) {
    await op.locator('.media-card').nth(1).click()
    await sleep(500)
    await op.locator('.modal-foot .btn.live').click()
    await sleep(900)
    await out.screenshot({ path: join(shots, '26-projector-pdf.png') })
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
  const bad = app.windows().filter((w) => w.url().includes('/remote')).pop()
  const rejected = await bad.locator('.r-err').count()
  console.log('wrong PIN rejected:', rejected ? '✓' : '✗')
  if (!rejected && pin !== '0000') errors.push('wrong PIN was accepted')
  // ---- backup → change data → restore round trip ----
  const backupPath = join(data, 'smoke-backup.zip')
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })
  }, backupPath)
  const made = await op.evaluate(() => window.api.backup.create())
  const songsBefore = (await op.evaluate(() => window.api.db.list('songs'))).length
  await op.evaluate(() => window.api.db.upsert('songs', { id: 'temp-song', title: 'Temp', tags: [], sections: [], arrangement: [], linesPerSlide: 4, createdAt: 0, updatedAt: 0 }))
  await sleep(400)
  const restored = await op.evaluate((p) => window.api.backup.restore(p), backupPath)
  await sleep(2500)
  const op2 = await windowByUrl('index.html')
  const songsAfter = (await op2.evaluate(() => window.api.db.list('songs'))).length
  console.log('backup/restore:', JSON.stringify({ files: made?.files, ok: restored?.ok, songsBefore, songsAfter }), songsAfter === songsBefore ? '✓' : '✗')
  if (songsAfter !== songsBefore) errors.push('restore did not bring back the backed-up data')

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
