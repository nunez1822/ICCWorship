import JSZip from 'jszip'

/**
 * Built-in PowerPoint reader used when neither PowerPoint nor LibreOffice is installed.
 * A .pptx is a zip of XML files; we pull the text of every slide (in presentation order)
 * plus the speaker notes. Layout, pictures and animations are not kept.
 */
export interface PptxTextSlide {
  title?: string
  body: string
  notes?: string
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

function paragraphsOf(xml: string): string[] {
  const out: string[] = []
  const paras = xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || []
  for (const p of paras) {
    const runs = [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)].map((m) => (m[1] !== undefined ? decode(m[1]) : '\n'))
    const t = runs.join('').trim()
    if (t) out.push(t)
  }
  return out
}

function shapes(xml: string): { type?: string; text: string[] }[] {
  const out: { type?: string; text: string[] }[] = []
  for (const sp of xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || []) {
    const type = (/<p:ph\b[^>]*type="([^"]+)"/.exec(sp) || [])[1]
    out.push({ type, text: paragraphsOf(sp) })
  }
  return out
}

function relTargets(relsXml: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?>/g)) m.set(r[1], r[2])
  // attribute order may vary
  for (const r of relsXml.matchAll(/<Relationship\b[^>]*Target="([^"]+)"[^>]*Id="([^"]+)"[^>]*\/?>/g)) if (!m.has(r[2])) m.set(r[2], r[1])
  return m
}

const resolvePath = (base: string, target: string) => {
  const parts = (base + '/' + target).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p && p !== '.') out.push(p)
  }
  return out.join('/')
}

export async function readPptxText(data: ArrayBuffer | Uint8Array | Buffer): Promise<PptxTextSlide[]> {
  const zip = await JSZip.loadAsync(data)
  const presXml = (await zip.file('ppt/presentation.xml')?.async('string')) || ''
  const presRels = relTargets((await zip.file('ppt/_rels/presentation.xml.rels')?.async('string')) || '')
  let slidePaths = [...presXml.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => presRels.get(m[1])).filter((x): x is string => !!x).map((t) => resolvePath('ppt', t))
  if (!slidePaths.length) {
    slidePaths = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))
  }
  const slides: PptxTextSlide[] = []
  for (const sp of slidePaths) {
    const xml = (await zip.file(sp)?.async('string')) || ''
    const sh = shapes(xml)
    const titleShape = sh.find((s) => s.type === 'title' || s.type === 'ctrTitle')
    const title = titleShape?.text.join(' ')
    const body = sh
      .filter((s) => s !== titleShape && s.type !== 'sldNum' && s.type !== 'dt' && s.type !== 'ftr')
      .flatMap((s) => s.text)
      .join('\n')
    // notes
    const dir = sp.substring(0, sp.lastIndexOf('/'))
    const name = sp.substring(sp.lastIndexOf('/') + 1)
    const rels = relTargets((await zip.file(`${dir}/_rels/${name}.rels`)?.async('string')) || '')
    let notes: string | undefined
    for (const t of rels.values()) {
      if (/notesSlide/.test(t)) {
        const nx = (await zip.file(resolvePath(dir, t))?.async('string')) || ''
        notes = shapes(nx)
          .filter((s) => s.type === 'body')
          .flatMap((s) => s.text)
          .join('\n') || undefined
      }
    }
    slides.push({ title: title || undefined, body, notes })
  }
  return slides
}
