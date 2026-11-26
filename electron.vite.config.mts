import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const shared = resolve(import.meta.dirname, 'src/shared')

/**
 * Production pages allow no inline scripts. The dev server needs them (React Fast Refresh injects one), so the
 * HTML files keep 'unsafe-inline' and the build removes it.
 */
function productionCsp(): Plugin {
  return {
    name: 'iccworship:production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const out = html.replace("script-src 'self' 'unsafe-inline'", "script-src 'self'")
      if (out === html) throw new Error('production-csp: script-src not found in ' + html.slice(0, 80))
      return out
    }
  }
}

/**
 * pdf.js decodes JPEG 2000 / JBIG2 images and ICC colours (common in scanned PDFs) with WebAssembly files that
 * it loads at run time from `wasmUrl`. Ship them as renderer/pdfjs-wasm/ (with their licences); serve them in dev.
 * The QuickJS files are left out: they only run JavaScript embedded in PDFs, which we never do.
 */
const PDFJS_WASM_DIR = resolve(import.meta.dirname, 'node_modules/pdfjs-dist/wasm')
const pdfjsWasmFiles = () => readdirSync(PDFJS_WASM_DIR).filter((f) => !/quickjs/i.test(f))
function pdfjsWasm(): Plugin {
  return {
    name: 'iccworship:pdfjs-wasm',
    configureServer(server) {
      server.middlewares.use('/pdfjs-wasm/', (req, res, next) => {
        const name = (req.url || '').replace(/^\//, '').split('?')[0]
        if (!pdfjsWasmFiles().includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : name.endsWith('.js') ? 'text/javascript' : 'text/plain')
        res.end(readFileSync(resolve(PDFJS_WASM_DIR, name)))
      })
    },
    generateBundle() {
      for (const f of pdfjsWasmFiles()) this.emitFile({ type: 'asset', fileName: `pdfjs-wasm/${f}`, source: readFileSync(resolve(PDFJS_WASM_DIR, f)) })
    }
  }
}

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].js' }
      }
    }
  },
  renderer: {
    root: resolve(import.meta.dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@shared': shared,
        '@renderer': resolve(import.meta.dirname, 'src/renderer')
      },
      dedupe: ['react', 'react-dom']
    },
    plugins: [react(), productionCsp(), pdfjsWasm()],
    // Dev server: pre-bundle every React entry point together, as one copy. Without this, Vite 8's dependency
    // optimizer put two copies of React into separate chunks (react-dom/client used one, components the other), so
    // every hook failed with "Invalid hook call" and `pnpm dev` showed blank windows.
    optimizeDeps: {
      include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-i18next', 'i18next', 'zustand']
    },
    build: {
      // Licence report of every bundled package, merged into THIRD_PARTY_NOTICES.md by scripts/licenses.mjs
      license: { fileName: '.vite/license.json' },
      rollupOptions: {
        input: {
          index: resolve(import.meta.dirname, 'src/renderer/index.html'),
          output: resolve(import.meta.dirname, 'src/renderer/output.html'),
          stage: resolve(import.meta.dirname, 'src/renderer/stage.html'),
          remote: resolve(import.meta.dirname, 'src/renderer/remote.html')
        }
      }
    }
  }
})
