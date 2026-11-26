import { describe, expect, it } from 'vite-plus/test'
import { join } from 'node:path'
import { dataLocation, PORTABLE_FOLDER } from '../src/main/portable'

const usb = join('E:', 'ICCWorship')
const root = join(usb, PORTABLE_FOLDER)
const env = { PORTABLE_EXECUTABLE_DIR: usb }

/** a computer: which folders exist, which can be written, and whether Documents\ICCWorship has data */
function pc(o: { exists?: string[]; writable?: boolean; documents?: boolean } = {}) {
  return {
    exists: (d: string) => (o.exists ?? []).includes(d),
    canWrite: () => o.writable ?? true,
    documentsHasData: () => !!o.documents
  }
}

describe('dataLocation (portable mode)', () => {
  it('the portable exe keeps its data in a folder beside it', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc() })).toEqual({ mode: 'portable', root })
    expect(dataLocation({ env, isPackaged: true, ...pc({ exists: [root], documents: true }) })).toEqual({ mode: 'portable', root })
  })
  it('upgrading from portable 1.0 (data in Documents, no folder beside the exe yet) keeps using Documents', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc({ documents: true }) })).toEqual({ mode: 'portable-documents', tried: root })
  })
  it('a write-protected stick with the data on it opens that data read-only, never another library', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc({ exists: [root, join(root, 'data')], writable: false, documents: true }) })).toEqual({
      mode: 'portable-readonly',
      root
    })
  })
  it('falls back to Documents when it cannot write there and there is no data (a CD, Program Files)', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc({ writable: false }) })).toEqual({ mode: 'portable-fallback', tried: root })
    expect(dataLocation({ env, isPackaged: true, ...pc({ exists: [root], writable: false }) })).toEqual({ mode: 'portable-fallback', tried: root })
  })
  it('the installed app, a developer run and ICCWORSHIP_DATA are never portable', () => {
    expect(dataLocation({ env: {}, isPackaged: true, ...pc() })).toEqual({ mode: 'standard' })
    expect(dataLocation({ env, isPackaged: false, ...pc() })).toEqual({ mode: 'standard' })
    expect(dataLocation({ env: { ...env, ICCWORSHIP_DATA: 'D:\\data' }, isPackaged: true, ...pc() })).toEqual({ mode: 'standard' })
  })
})
