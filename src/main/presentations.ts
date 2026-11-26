import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { promisify } from 'node:util'
import type { Presentation, PresentationSlide } from '@shared/types'
import { readPptxText } from '@shared/pptxText'
import { uid } from '@shared/slides'
import { cacheDir } from './paths'
import { isSafeId } from '@shared/security'
import { loggableError } from '@shared/loggableError'
import { within } from './pathGuard'
import { log } from './log'
import { db } from './db'
import { toMediaUrl } from './server'

const run = promisify(execFile)

/**
 * PowerPoint import, best path first:
 *  1. Microsoft PowerPoint installed → export every slide as a PNG through PowerPoint itself (exact look)
 *  2. LibreOffice installed           → convert to PDF, the renderer then draws each page (pdf.js)
 *  3. neither                         → read the text out of the .pptx (editable slides)
 */
export interface ImportOutcome {
  presentation?: Presentation
  /** LibreOffice / PDF route: renderer must rasterize this PDF and call savePdfPages */
  pdfToRender?: { id: string; pdfPath: string; name: string; sourcePath: string; method: 'libreoffice' | 'pdf' }
  error?: string
}

let detectCache: { powerpoint: boolean; libreoffice: string | null } | null = null

export async function detectConverters(): Promise<{ powerpoint: boolean; libreoffice: string | null }> {
  if (detectCache) return detectCache
  let powerpoint = false
  if (process.platform === 'win32') {
    try {
      await run('reg', ['query', 'HKCR\\PowerPoint.Application\\CurVer'], { windowsHide: true })
      powerpoint = true
    } catch {
      powerpoint = false
    }
  }
  const candidates = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'
  ]
  const libreoffice = candidates.find((p) => existsSync(p)) || null
  detectCache = { powerpoint, libreoffice }
  return detectCache
}

const PS_SCRIPT = `
param([string]$src, [string]$out)
$ErrorActionPreference = 'Stop'
$app = New-Object -ComObject PowerPoint.Application
$pres = $app.Presentations.Open($src, -1, 0, 0)
try {
  # NB: PowerShell variable names are case-insensitive — keep these names distinct.
  $slideW = $pres.PageSetup.SlideWidth
  $slideH = $pres.PageSetup.SlideHeight
  $outH = 1080
  $outW = [int]([math]::Round($outH * $slideW / $slideH))
  $notes = New-Object System.Collections.ArrayList
  $i = 0
  foreach ($s in $pres.Slides) {
    $i++
    $file = Join-Path $out ("slide{0:D3}.png" -f $i)
    $s.Export($file, 'PNG', $outW, $outH)
    $n = ''
    try {
      foreach ($shape in $s.NotesPage.Shapes) {
        if ($shape.PlaceholderFormat.Type -eq 2 -and $shape.HasTextFrame) { $n = $shape.TextFrame.TextRange.Text }
      }
    } catch {}
    [void]$notes.Add($n)
  }
  $json = ConvertTo-Json -InputObject @($notes) -Compress
  [System.IO.File]::WriteAllText((Join-Path $out 'notes.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
} finally {
  $pres.Close()
  if ($app.Presentations.Count -eq 0) { $app.Quit() }
  [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($app)
}
`

async function viaPowerPoint(src: string, out: string): Promise<PresentationSlide[]> {
  const script = join(cacheDir('scripts'), 'ppt-export.ps1')
  // UTF-8 with BOM so Windows PowerShell 5.1 reads accented paths correctly
  writeFileSync(script, '\uFEFF' + PS_SCRIPT, 'utf8')
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-src', src, '-out', out], {
    windowsHide: true,
    timeout: 10 * 60_000
  })
  const files = readdirSync(out)
    .filter((f) => /^slide\d+\.png$/i.test(f))
    .sort()
  let notes: string[] = []
  try {
    const raw = JSON.parse(readFileSync(join(out, 'notes.json'), 'utf8').replace(/^\uFEFF/, ''))
    notes = Array.isArray(raw) ? raw : [raw]
  } catch {
    /* no notes */
  }
  if (!files.length) throw new Error('no-slides')
  return files.map((f, i) => ({ image: toMediaUrl(join(out, f)), notes: notes[i]?.trim() || undefined }))
}

async function viaLibreOffice(soffice: string, src: string, out: string): Promise<string> {
  await run(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', out, src], { windowsHide: true, timeout: 10 * 60_000 })
  const pdf = join(out, basename(src, extname(src)) + '.pdf')
  if (!existsSync(pdf)) throw new Error('libreoffice-failed')
  return pdf
}

export async function importPresentation(src: string, prefer?: 'powerpoint' | 'libreoffice' | 'text', reuseId?: string): Promise<ImportOutcome> {
  const ext = extname(src).toLowerCase()
  // reuseId comes from the renderer and becomes a folder name that gets deleted: it must be a plain id
  if (reuseId !== undefined && !isSafeId(reuseId)) throw new Error('bad-id')
  const id = reuseId || uid()
  const out = join(cacheDir('presentations'), id)
  if (existsSync(out)) rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  const name = basename(src, ext)

  if (ext === '.pdf') {
    return { pdfToRender: { id, pdfPath: src, name, sourcePath: src, method: 'pdf' } }
  }
  if (!['.pptx', '.ppt', '.pps', '.ppsx', '.odp', '.key'].includes(ext)) return { error: 'unsupported' }

  const tools = await detectConverters()
  const order: ('powerpoint' | 'libreoffice' | 'text')[] = prefer ? [prefer, 'powerpoint', 'libreoffice', 'text'] : ['powerpoint', 'libreoffice', 'text']
  let lastError = ''
  for (const method of order) {
    try {
      if (method === 'powerpoint' && tools.powerpoint && ext !== '.odp' && ext !== '.key') {
        const slides = await viaPowerPoint(src, out)
        return { presentation: save({ id, name, sourcePath: src, method: 'powerpoint', slides, importedAt: Date.now() }) }
      }
      if (method === 'libreoffice' && tools.libreoffice) {
        const pdfPath = await viaLibreOffice(tools.libreoffice, src, out)
        return { pdfToRender: { id, pdfPath, name, sourcePath: src, method: 'libreoffice' } }
      }
      if (method === 'text' && (ext === '.pptx' || ext === '.ppsx')) {
        const txt = await readPptxText(readFileSync(src))
        const slides: PresentationSlide[] = txt.map((s) => ({
          text: { en: [s.title, s.body].filter(Boolean).join('\n'), es: undefined },
          notes: s.notes
        }))
        if (!slides.length) throw new Error('no-slides')
        return { presentation: save({ id, name, sourcePath: src, method: 'text', slides, importedAt: Date.now() }) }
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
      log.warn('presentation import via', method, 'failed:', loggableError(e))
    }
  }
  return { error: ext === '.ppt' ? 'ppt-needs-office' : lastError || 'failed' }
}

/** Renderer finished drawing PDF pages to PNG; store them. */
export function savePdfPages(args: { id: string; name: string; sourcePath: string; method: 'libreoffice' | 'pdf'; pages: Uint8Array[] }): Presentation {
  if (!isSafeId(args?.id)) throw new Error('bad-id') // checked before cacheDir() creates the folder
  const out = cacheDir('presentations', args.id)
  const slides: PresentationSlide[] = args.pages.map((buf, i) => {
    const f = join(out, `page${String(i + 1).padStart(3, '0')}.png`)
    writeFileSync(f, Buffer.from(buf))
    return { image: toMediaUrl(f) }
  })
  return save({ id: args.id, name: args.name, sourcePath: args.sourcePath, method: args.method, slides, importedAt: Date.now() })
}

/** A folder of images (e.g. PowerPoint "Save as PNG") */
export function importImages(paths: string[], name: string): Presentation {
  const slides = paths
    .filter((p) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(p))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((p) => ({ image: toMediaUrl(p) }))
  return save({ id: uid(), name, sourcePath: paths[0] || '', method: 'images', slides, importedAt: Date.now() })
}

function save(p: Presentation): Presentation {
  const existing = db().get<Presentation>('presentations', p.id)
  // keep any translations typed for text slides when re-importing
  if (existing && existing.method === 'text' && p.method === 'text') {
    p.slides = p.slides.map((s, i) => ({ ...s, text: { ...s.text, es: existing.slides[i]?.text?.es } }))
  }
  db().upsert('presentations', p)
  return p
}

export function deletePresentation(id: string): void {
  db().remove('presentations', id)
  // never delete outside (or all of) the presentations cache, whatever id the renderer sends
  const root = cacheDir('presentations')
  const out = join(root, String(id))
  if (within(root, out) && existsSync(out)) rmSync(out, { recursive: true, force: true })
}
