import { describe, expect, it } from 'vite-plus/test'
import { join } from 'node:path'
import { appFile, APP_ORIGIN } from '../src/main/appUrl'

describe('appFile (app://iccworship → built pages)', () => {
  const root = join('C:', 'Program Files', 'ICCWorship', 'resources', 'app.asar', 'out', 'renderer')
  it('maps page, script, style and wasm URLs into the pages folder', () => {
    expect(appFile(`${APP_ORIGIN}/index.html?load=3#safe`, root)).toBe(join(root, 'index.html'))
    expect(appFile(`${APP_ORIGIN}/assets/index-abc.js`, root)).toBe(join(root, 'assets', 'index-abc.js'))
    expect(appFile(`${APP_ORIGIN}/assets/pdf.worker.min-x.mjs`, root)).toBe(join(root, 'assets', 'pdf.worker.min-x.mjs'))
    expect(appFile(`${APP_ORIGIN}/pdfjs-wasm/openjpeg.wasm`, root)).toBe(join(root, 'pdfjs-wasm', 'openjpeg.wasm'))
    expect(appFile(`${APP_ORIGIN}/assets/a%20b.css`, root)).toBe(join(root, 'assets', 'a b.css'))
  })
  it('never leaves the pages folder', () => {
    expect(appFile(`${APP_ORIGIN}/../../data/settings.json`, root)).toBeNull()
    // the URL parser resolves (encoded) dot segments first: what is left still names a file inside the folder
    expect(appFile(`${APP_ORIGIN}/%2e%2e/%2e%2e/main/index.js`, root)).toBe(join(root, 'main', 'index.js'))
    expect(appFile(`${APP_ORIGIN}/..%5c..%5cmain%5cindex.js`, root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/`, root)).toBeNull()
  })
  it('serves only page file types, only for our host and scheme', () => {
    expect(appFile(`${APP_ORIGIN}/pdfjs-wasm/LICENSE_QCMS`, root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/.vite/license.json`, root)).toBeNull()
    expect(appFile('app://evil/index.html', root)).toBeNull()
    expect(appFile('file:///C:/index.html', root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/%E0%A4%A.html`, root)).toBeNull() // malformed escape
    expect(appFile('not a url', root)).toBeNull()
  })
})
