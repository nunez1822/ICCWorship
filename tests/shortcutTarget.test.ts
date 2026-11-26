import { describe, expect, it } from 'vite-plus/test'
import { keyBelongsToControl } from '../src/shared/shortcutTarget'

describe('keyBelongsToControl (do the live shortcuts leave this key alone?)', () => {
  it('every key belongs to a field the volunteer types in', () => {
    for (const key of [' ', 'b', '1', 'ArrowRight', 'Escape'])
      for (const t of [
        { tag: 'INPUT', type: 'text' },
        { tag: 'INPUT', type: 'number' },
        { tag: 'INPUT' },
        { tag: 'TEXTAREA' },
        { tag: 'DIV', editable: true },
        { tag: 'INPUT', type: 'date' }
      ])
        expect(keyBelongsToControl(t, key)).toBe(true)
  })

  it('a checkbox, slider or dropdown clicked with the mouse never swallows the shortcuts', () => {
    for (const key of [' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'b', 'l', '2'])
      for (const t of [
        { tag: 'INPUT', type: 'checkbox' },
        { tag: 'INPUT', type: 'range' },
        { tag: 'SELECT' },
        { tag: 'INPUT', type: 'radio' },
        { tag: 'BUTTON' }
      ])
        expect(keyBelongsToControl({ ...t, keyboardFocused: false }, key)).toBe(false)
  })

  it('a control reached with Tab keeps the keys it uses itself, and only those', () => {
    const kb = (t: { tag: string; type?: string }) => ({ ...t, keyboardFocused: true })
    expect(keyBelongsToControl(kb({ tag: 'INPUT', type: 'checkbox' }), ' ')).toBe(true)
    expect(keyBelongsToControl(kb({ tag: 'INPUT', type: 'checkbox' }), 'ArrowRight')).toBe(false)
    expect(keyBelongsToControl(kb({ tag: 'INPUT', type: 'range' }), 'ArrowRight')).toBe(true)
    expect(keyBelongsToControl(kb({ tag: 'INPUT', type: 'range' }), ' ')).toBe(false)
    expect(keyBelongsToControl(kb({ tag: 'SELECT' }), 'ArrowDown')).toBe(true)
    expect(keyBelongsToControl(kb({ tag: 'SELECT' }), 'b')).toBe(false)
    expect(keyBelongsToControl(kb({ tag: 'BUTTON' }), ' ')).toBe(false) // Space on a button: the shortcut (as before)
  })

  it('nothing focused', () => {
    expect(keyBelongsToControl(null, ' ')).toBe(false)
    expect(keyBelongsToControl({ tag: 'BODY' }, ' ')).toBe(false)
  })
})
