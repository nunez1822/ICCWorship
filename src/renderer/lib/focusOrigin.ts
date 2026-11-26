/**
 * Was this element focused with the mouse / touch, or with the keyboard (Tab)? Remembered when focus ARRIVES.
 *
 * `:focus-visible` can't answer it inside a keydown handler: pressing a key IS keyboard interaction, so Chromium turns
 * it on for the focused element at that very moment. Same rule as the WICG focus-visible polyfill: focus that arrives
 * while the last input was a pointer came from the pointer; after a key (Tab), from the keyboard.
 */
const byPointer = new WeakSet<Element>()
let lastInput: 'pointer' | 'keyboard' = 'keyboard'

window.addEventListener('pointerdown', () => (lastInput = 'pointer'), true)
window.addEventListener('keydown', () => (lastInput = 'keyboard'), true)
window.addEventListener(
  'focusin',
  (e) => {
    const el = e.target as Element | null
    if (!el) return
    if (lastInput === 'pointer') byPointer.add(el)
    else byPointer.delete(el)
  },
  true
)

/** focused with the keyboard (Tab) rather than clicked or tapped */
export const focusedByKeyboard = (el: Element): boolean => !byPointer.has(el)
