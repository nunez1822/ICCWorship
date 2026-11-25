#!/usr/bin/env node
/**
 * Builds out/THIRD_PARTY_NOTICES.md: the licences of every third-party package shipped inside the app.
 * Run after `electron-vite build` and before `electron-builder` (build:win / build:dir / release.yml do).
 *
 * Sources:
 *  1. Renderer bundle: Vite's own licence report (renderer.build.license in electron.vite.config.mts).
 *  2. Main-process runtime dependencies (ws, qrcode, jszip and their trees). They are not bundled but copied
 *     into app.asar from node_modules: every non-dev package in package-lock.json.
 *  3. Extra shipped files with their own licences (pdf.js wasm decoders, if present in the build).
 *  4. NOTICE.md (public-domain Bible texts).
 * Electron and Chromium licences are shipped by electron-builder itself (LICENSE.electron.txt, LICENSES.chromium.html).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'out')
const viteReport = join(out, 'renderer', '.vite', 'license.json')
if (!existsSync(viteReport)) {
  console.error(`Missing ${viteReport}: run "npm run build" first.`)
  process.exit(1)
}

/** @type {Map<string, {name: string, version: string, identifier?: string, text?: string}>} */
const entries = new Map()
const add = (e) => entries.has(`${e.name}@${e.version}`) || entries.set(`${e.name}@${e.version}`, e)

for (const e of JSON.parse(readFileSync(viteReport, 'utf8'))) add(e)

const LICENSE_FILE = /^(licen[cs]e|copying)([-.][\w.-]+)?$/i // LICENSE, LICENSE.md, LICENSE-MIT.txt…
function licenseText(dir) {
  if (!existsSync(dir)) return undefined
  const f = readdirSync(dir).find((n) => LICENSE_FILE.test(n))
  return f ? readFileSync(join(dir, f), 'utf8').trim() : undefined
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path || pkg.dev || pkg.devOptional || pkg.link) continue
  const name = pkg.name || path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
  add({ name, version: pkg.version || '0.0.0', identifier: pkg.license, text: licenseText(join(root, path)) })
}

const missing = [...entries.values()].filter((e) => !e.text)
const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))

let md = `# Third-party notices

ICCWorship is MIT-licensed (see LICENSE). It includes the following third-party software and content,
used under their own licences. Electron and Chromium licences are in LICENSE.electron.txt and
LICENSES.chromium.html next to the program.

`
const notice = join(root, 'NOTICE.md')
if (existsSync(notice)) md += readFileSync(notice, 'utf8').replace(/^#\s+/m, '## ') + '\n'

const wasmDir = join(out, 'renderer', 'pdfjs-wasm')
if (existsSync(wasmDir)) {
  for (const f of readdirSync(wasmDir)
    .filter((n) => n.startsWith('LICENSE_'))
    .sort()) {
    md += `\n## pdf.js decoder: ${f.replace(/^LICENSE_/, '')}\n\n${readFileSync(join(wasmDir, f), 'utf8').trim()}\n`
  }
}

for (const e of sorted) {
  md += `\n## ${e.name} ${e.version}${e.identifier ? ` (${e.identifier})` : ''}\n`
  if (e.text) md += `\n${e.text}\n`
}

writeFileSync(join(out, 'THIRD_PARTY_NOTICES.md'), md)
console.log(
  `THIRD_PARTY_NOTICES.md: ${sorted.length} packages${missing.length ? `, ${missing.length} without a licence file (identifier only): ${missing.map((e) => e.name).join(', ')}` : ''}`
)
