import { describe, expect, it } from 'vitest'
import { redact } from '../src/main/log'

// The diagnostics zip is posted publicly: its building blocks must never carry identifying data.
describe('diagnostics privacy', () => {
  it('an error about a file in the data folder loses the path and the user name', () => {
    const roots = { data: 'C:\\Users\\Pastor Juan\\Documents\\ICCWorship', home: 'C:\\Users\\Pastor Juan' }
    const line = redact('could not save people EPERM C:\\Users\\Pastor Juan\\Documents\\ICCWorship\\data\\people.json', roots)
    expect(line).not.toMatch(/Pastor|Juan/)
    expect(line).toContain('<data>/data/people.json')
  })
  it('a file outside the data folder keeps only the part after the home folder', () => {
    const roots = { data: 'C:\\Users\\Pastor Juan\\Documents\\ICCWorship', home: 'C:\\Users\\Pastor Juan' }
    expect(redact('missing C:\\Users\\Pastor Juan\\Videos\\intro.mp4', roots)).toBe('missing %USERPROFILE%/Videos/intro.mp4')
  })
  it("system.json's data folder says where the data lives, without the user name", () => {
    // as systemInfo() builds it: only the home folder is redacted, not the data folder itself
    const home = { home: 'C:\\Users\\Pastor Juan' }
    expect(redact('C:\\Users\\Pastor Juan\\OneDrive\\Documents\\ICCWorship', home)).toBe('%USERPROFILE%/OneDrive/Documents/ICCWorship')
    expect(redact('D:\\ICCWorship', home)).toBe('D:/ICCWorship')
  })
})
