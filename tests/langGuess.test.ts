import { describe, expect, it } from 'vite-plus/test'
import { guessLang } from '@shared/langGuess'

describe('guessLang (English or Spanish, for imported text that does not say)', () => {
  it('recognises Spanish lyrics and slide text', () => {
    expect(guessLang('Cuán grande es Él\nMi corazón entona la canción')).toBe('es')
    expect(guessLang('Bienvenidos a la iglesia. ¡Gracias por estar aquí!')).toBe('es')
  })
  it('recognises English', () => {
    expect(guessLang('How great is our God\nSing with me how great is our God')).toBe('en')
    expect(guessLang('Welcome to the church. Thank you for being here!')).toBe('en')
  })
  it("doesn't guess from too little text or a bilingual mix (the caller keeps English)", () => {
    expect(guessLang('Amen')).toBeUndefined()
    expect(guessLang('')).toBeUndefined()
    expect(guessLang('Holy, holy, holy is the Lord\nSanto, santo, santo es el Señor')).toBeUndefined()
  })
})
