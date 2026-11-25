import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { toMediaUrl } from './media'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Render every page of a PDF to a 1080p PNG (used for PDF import and the LibreOffice route) */
export async function renderPdfPages(path: string, onProgress?: (done: number, total: number) => void): Promise<Uint8Array[]> {
  const data = new Uint8Array(await (await fetch(toMediaUrl(path))).arrayBuffer())
  // wasm decoders for JPEG 2000 / JBIG2 images (scanned PDFs) — shipped next to the page (see electron.vite.config.mts)
  const task = pdfjs.getDocument({ data, wasmUrl: new URL('pdfjs-wasm/', location.href).href })
  const doc = await task.promise
  const out: Uint8Array[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const scale = 1080 / base.height
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport, background: '#ffffff' }).promise
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'))
    out.push(new Uint8Array(await blob.arrayBuffer()))
    page.cleanup()
    onProgress?.(i, doc.numPages)
  }
  await task.destroy()
  return out
}
