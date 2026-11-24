// Renders resources/icon.svg → resources/icon.png (512px) using Electron.  Usage: npx electron scripts/render-icon.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, '..', 'resources', 'icon.svg'), 'utf8')
  const win = new BrowserWindow({ width: 512, height: 512, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,' + encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`))
  await new Promise((r) => setTimeout(r, 400))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  writeFileSync(join(__dirname, '..', 'resources', 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG())
  app.quit()
})
