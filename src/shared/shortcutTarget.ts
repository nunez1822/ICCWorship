/**
 * Should the operator's live shortcuts (Space = next slide, B, L, 1/2/3…) leave this key to the focused control?
 *
 * Only while the volunteer is TYPING (a text box, a number, a date, the lyrics). A checkbox, slider or dropdown they
 * just clicked with the mouse keeps focus, and before this every shortcut was dead until they clicked elsewhere —
 * Space even ticked "Follow the timing" back on, and ↓ on the plan dropdown switched to another plan mid-service.
 * Like Google Slides and VS Code, a control reached with the KEYBOARD (Tab — see lib/focusOrigin) keeps the keys it uses
 * itself (Space ticks a checkbox, arrows move a slider or a dropdown), so the app still works without a mouse. A
 * dropdown reached with the keyboard also keeps typed letters and digits (they jump to the option that starts with
 * them) and Esc (it closes the list): typing "b" to pick an option must never black out the projector.
 */
export interface ShortcutTarget {
  /** element tag name, upper case (INPUT, TEXTAREA, SELECT, BUTTON…) */
  tag: string
  /** an <input>'s type */
  type?: string
  /** contentEditable */
  editable?: boolean
  /** focused with the keyboard rather than clicked (renderer/lib/focusOrigin) */
  keyboardFocused?: boolean
}

/** input types where the volunteer types text (every key belongs to the field) */
const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date', 'time', 'datetime-local', 'month', 'week'])
const ARROWS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']

/** the keys a non-text control uses itself when it was reached with the keyboard */
function ownKeys(t: ShortcutTarget): readonly string[] {
  if (t.tag === 'SELECT') return [...ARROWS, ' ', 'Enter', 'Home', 'End', 'PageUp', 'PageDown']
  if (t.tag !== 'INPUT') return []
  if (t.type === 'range') return [...ARROWS, 'Home', 'End', 'PageUp', 'PageDown']
  if (t.type === 'radio') return [...ARROWS, ' ']
  if (t.type === 'checkbox') return [' ']
  return []
}

export function keyBelongsToControl(t: ShortcutTarget | null, key: string): boolean {
  if (!t) return false
  if (t.editable || t.tag === 'TEXTAREA') return true
  if (t.tag === 'INPUT' && TEXT_TYPES.has((t.type || 'text').toLowerCase())) return true
  if (!t.keyboardFocused) return false
  if (t.tag === 'SELECT' && (key.length === 1 || key === 'Escape')) return true
  return ownKeys(t).includes(key)
}
