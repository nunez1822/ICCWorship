import { describe, expect, it } from 'vite-plus/test'
import { join } from 'node:path'
import { appFile, APP_ORIGIN, isAppPageUrl } from '../src/main/appUrl'

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
    // encoded slashes survive the URL parser and decode to a real climb out of the folder
    expect(appFile(`${APP_ORIGIN}/..%2fmain%2findex.js`, root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/..%2f..%2f..%2fdata%2fsettings.json`, root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/`, root)).toBeNull()
  })
  it('refuses a NUL byte or a colon (drive letters, alternate data streams)', () => {
    expect(appFile(`${APP_ORIGIN}/index.html%00.js`, root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/C:%5cWindows%5cwin.ini`, root)).toBeNull()
    expect(appFile(`${APP_ORIGIN}/index.html:stream.js`, root)).toBeNull()
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

describe('isAppPageUrl (the IPC trust boundary)', () => {
  it('accepts exactly our three pages, with any query or hash', () => {
    expect(isAppPageUrl(`${APP_ORIGIN}/index.html`)).toBe(true)
    expect(isAppPageUrl(`${APP_ORIGIN}/output.html?load=2#safe`)).toBe(true)
    expect(isAppPageUrl(`${APP_ORIGIN}/stage.html#x`)).toBe(true)
  })
  it('refuses other files, other hosts and schemes, and nested copies', () => {
    expect(isAppPageUrl(`${APP_ORIGIN}/x/index.html`)).toBe(false)
    expect(isAppPageUrl(`${APP_ORIGIN}/remote.html`)).toBe(false)
    expect(isAppPageUrl(`${APP_ORIGIN}/icon.svg`)).toBe(false)
    expect(isAppPageUrl('app://evil/index.html')).toBe(false)
    expect(isAppPageUrl('file:///C:/app/out/renderer/index.html')).toBe(false)
    expect(isAppPageUrl('http://192.168.1.5:7272/index.html')).toBe(false)
    expect(isAppPageUrl('not a url')).toBe(false)
  })
  it('in development, the same pages from the dev server only', () => {
    const dev = 'http://localhost:5173'
    expect(isAppPageUrl('http://localhost:5173/index.html', dev)).toBe(true)
    expect(isAppPageUrl('http://localhost:5174/index.html', dev)).toBe(false)
    expect(isAppPageUrl(`${APP_ORIGIN}/index.html`, dev)).toBe(false)
  })
})
