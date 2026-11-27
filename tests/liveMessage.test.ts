import { describe, expect, it } from 'vite-plus/test'
import { messageText } from '@shared/liveMessage'

describe('messageText (a screen message as shown now)', () => {
  const quick = { text: 'Cuna 12\nNursery 12', bi: { en: 'Nursery 12', es: 'Cuna 12' }, seq: 1 }
  it('orders a quick message as the screen is now, not as it was when sent', () => {
    expect(messageText(quick, 'both', 'es-first')).toBe('Cuna 12\nNursery 12')
    expect(messageText(quick, 'both', 'en-first')).toBe('Nursery 12\nCuna 12')
    expect(messageText(quick, 'en', 'es-first')).toBe('Nursery 12')
    expect(messageText(quick, 'es', 'en-first')).toBe('Cuna 12')
  })
  it('shows a typed message (or one from the phone) as typed', () => {
    expect(messageText({ text: 'Welcome', seq: 1 }, 'en', 'en-first')).toBe('Welcome')
  })
})
