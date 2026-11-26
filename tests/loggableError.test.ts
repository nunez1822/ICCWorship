import { describe, expect, it } from 'vitest'
import { loggableError } from '../src/shared/loggableError'

describe('loggableError', () => {
  it('never returns the text a parser quotes from its input', () => {
    let err: unknown
    try {
      JSON.parse('{"books":[[["In the beginning placeholder text')
    } catch (e) {
      err = e
    }
    expect(loggableError(err)).toBe('SyntaxError')
  })

  it('drops a failed process command line, keeping only its exit code or signal', () => {
    const exit = Object.assign(new Error('Command failed: powershell.exe -src C:/Users/x/Desktop/Memorial - Someone.pptx'), { code: 1 })
    expect(loggableError(exit)).toBe('exit 1')
    const killed = Object.assign(new Error('Command failed: soffice --convert-to pdf secret.pptx'), { killed: true, signal: 'SIGTERM' })
    expect(loggableError(killed)).toBe('killed (SIGTERM)')
    const timeout = Object.assign(new Error('Command failed: x'), { killed: true, signal: null })
    expect(loggableError(timeout)).toBe('killed')
  })

  it('keeps Node error codes and our own short codes', () => {
    expect(loggableError(Object.assign(new Error('spawn C:/Users/x/soffice.exe ENOENT'), { code: 'ENOENT' }))).toBe('ENOENT')
    expect(loggableError(new Error('no-slides'))).toBe('no-slides')
    expect(loggableError(new Error('bad-id'))).toBe('bad-id')
  })

  it('keeps the message of a programming error, which a bug report needs', () => {
    expect(loggableError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
      "TypeError: Cannot read properties of undefined (reading 'x')"
    )
    expect(loggableError(new RangeError('y'.repeat(500))).length).toBeLessThan(200)
  })

  it('falls back to the kind for anything else', () => {
    expect(loggableError(new Error('Something about Maria Lopez'))).toBe('Error')
    expect(loggableError(new SyntaxError('Unexpected token'))).toBe('SyntaxError')
    expect(loggableError('a string')).toBe('unknown')
    expect(loggableError(Object.assign(new Error('x y'), { code: 'not a code with spaces' }))).toBe('Error')
  })
})
