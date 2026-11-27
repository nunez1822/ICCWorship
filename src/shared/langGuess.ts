/**
 * English or Spanish? A small guess for imported text that doesn't say (ChordPro lyrics, a PowerPoint's slide text),
 * so a Spanish song lands in the Español box instead of the English one. Common words and Spanish letters only:
 * no dictionary, offline, and "don't know" (undefined) when the text is short or mixed — callers then keep their
 * old default (English). Unit tested (tests/langGuess.test.ts).
 */
import type { Lang } from './types'

// frequent words that are unlikely in the other language (no shared words such as "a", "me", "no")
const ES = new Set(
  'el la los las del que y de por para con como pero porque cuando donde está estás eres soy somos tu tus su sus mi mis nuestro nuestra señor dios jesús cristo santo gloria aleluya amor gracia vida corazón cielo tierra alabanza adoración siempre nunca todo todos solo sólo aquí hay ser es una uno muy más yo él ella nos te le lo'.split(
    ' '
  )
)
const EN = new Set(
  'the and of you your to is are am be my our his her their with for from this that what when where who why how lord god jesus christ holy glory hallelujah love grace life heart heaven earth praise worship always never all only here there was were will shall can it we he she they them us'.split(
    ' '
  )
)

export function guessLang(text: string): Lang | undefined {
  const words = text.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? []
  let es = (text.match(/[áéíóúñ¿¡]/gi) ?? []).length
  let en = 0
  for (const w of words) {
    if (ES.has(w)) es++
    if (EN.has(w)) en++
  }
  if (es + en < 3) return undefined // too little to tell
  if (es >= en * 2) return 'es'
  if (en >= es * 2) return 'en'
  return undefined // mixed (a bilingual slide): keep the default
}
