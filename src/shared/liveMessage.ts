import type { LiveState } from './types'

type Message = NonNullable<LiveState['message']>

/**
 * The text of a screen message as the projector should show it now. A quick message (a template, e.g. the nursery
 * number) keeps both languages and follows the screen language and the bilingual order AT DISPLAY TIME: switching to
 * English on top after it went up reorders it too, like the slides. A typed message is shown as typed.
 */
export function messageText(m: Message, displayLang: LiveState['displayLang'], order: LiveState['bilingualOrder']): string {
  if (!m.bi) return m.text
  if (displayLang === 'en') return m.bi.en
  if (displayLang === 'es') return m.bi.es
  return order === 'en-first' ? `${m.bi.en}\n${m.bi.es}` : `${m.bi.es}\n${m.bi.en}`
}
