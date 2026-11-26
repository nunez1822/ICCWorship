import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataLocation, PORTABLE_FOLDER, portableExeDir } from '../src/main/portable'

const usb = join('E:', 'ICCWorship')
const root = join(usb, PORTABLE_FOLDER)
// what electron-builder's portable launcher sets for the app it unpacked (and runs from a temporary folder): the
// sanitized npm package name ("iccworship"), while the unpacked exe is named after productName ("ICCWorship.exe")
const env = { PORTABLE_EXECUTABLE_DIR: usb, PORTABLE_EXECUTABLE_APP_FILENAME: 'iccworship' }
const execPath = join('C:', 'Users', 'x', 'AppData', 'Local', 'Temp', '2abc', 'ICCWorship.exe')

/** a computer: which folders exist, which can be written, and whether Documents\ICCWorship has data */
function pc(o: { exists?: string[]; writable?: boolean | ((dir: string) => boolean); documents?: boolean } = {}) {
  return {
    execPath,
    exists: (d: string) => (o.exists ?? []).includes(d),
    canWrite: (d: string) => (typeof o.writable === 'function' ? o.writable(d) : (o.writable ?? true)),
    documentsHasData: () => !!o.documents
  }
}

describe('dataLocation (portable mode)', () => {
  it('the portable exe keeps its data in a folder beside it', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc() })).toEqual({ mode: 'portable', root })
    expect(dataLocation({ env, isPackaged: true, ...pc({ exists: [root] }) })).toEqual({ mode: 'portable', root })
  })
  it('data also in Documents on this computer is pointed out, never silently hidden (the stick was used elsewhere)', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc({ exists: [root], documents: true }) })).toEqual({ mode: 'portable', root, documentsAlso: true })
  })
  it('upgrading from portable 1.0 (data in Documents, no folder beside the exe yet) keeps using Documents', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc({ documents: true }) })).toEqual({ mode: 'portable-documents', tried: root })
  })
  it('…and only probes the exe’s folder to decide: nothing is created beside the exe just to look', () => {
    const probed: string[] = []
    const writable = (d: string) => (probed.push(d), true)
    expect(dataLocation({ env, isPackaged: true, ...pc({ documents: true, writable }) })).toEqual({ mode: 'portable-documents', tried: root })
    expect(probed).toEqual([usb])
  })
  it('…but never suggests creating a folder where the exe is if that folder cannot be written', () => {
    expect(dataLocation({ env, isPackaged: true, ...pc({ documents: true, writable: false }) })).toEqual({ mode: 'portable-fallback', tried: root })
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

describe('portableExeDir', () => {
  it("is ICCWorship's own portable launcher's folder", () => {
    expect(portableExeDir(env, execPath)).toBe(usb)
    expect(portableExeDir({ ...env, PORTABLE_EXECUTABLE_APP_FILENAME: 'ICCWorship' }, execPath)).toBe(usb)
  })
  it('matches only while the package name and the product name agree (a rename would silently end portable mode)', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { name: string; productName: string }
    expect(pkg.name.toLowerCase()).toBe(pkg.productName.toLowerCase())
  })
  it('ignores the variables the installed app inherited from another portable program', () => {
    expect(portableExeDir({ PORTABLE_EXECUTABLE_DIR: 'D:\\Tools', PORTABLE_EXECUTABLE_APP_FILENAME: 'OtherTool' }, execPath)).toBeUndefined()
    expect(portableExeDir({ PORTABLE_EXECUTABLE_DIR: 'D:\\Tools' }, execPath)).toBeUndefined()
    expect(portableExeDir({}, execPath)).toBeUndefined()
  })
})
