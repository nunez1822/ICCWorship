import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readPptxText } from '@shared/pptxText'

describe('built-in PowerPoint text reader (no Office installed)', () => {
  it('reads titles, body text and speaker notes in slide order', async () => {
    const slides = await readPptxText(readFileSync(join(__dirname, 'fixtures', 'sample.pptx')))
    expect(slides.length).toBe(2)
    expect(slides[0].title).toBe('Bienvenidos / Welcome')
    expect(slides[0].body).toBe('Iglesia de Prueba')
    expect(slides[0].notes).toBe('Saludar a las visitas')
    expect(slides[1].title).toBe('Tres puntos')
    expect(slides[1].body.split('\n')).toEqual(['Fe', 'Esperanza', 'Amor'])
    expect(slides[1].notes).toBe('Leer 1 Corintios 13:13')
  })
})
