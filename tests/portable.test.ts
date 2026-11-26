import { describe, expect, it } from 'vite-plus/test'
import { join } from 'node:path'
import { dataLocation, PORTABLE_FOLDER } from '../src/main/portable'

const usb = join('E:', 'ICCWorship')
const writable = () => true

describe('dataLocation (portable mode)', () => {
  it('the portable exe keeps its data in a folder beside it', () => {
    expect(dataLocation({ env: { PORTABLE_EXECUTABLE_DIR: usb }, isPackaged: true, canWrite: writable })).toEqual({
      mode: 'portable',
      root: join(usb, PORTABLE_FOLDER)
    })
  })
  it('falls back to Documents when it cannot write there (locked stick, Program Files)', () => {
    expect(dataLocation({ env: { PORTABLE_EXECUTABLE_DIR: usb }, isPackaged: true, canWrite: () => false })).toEqual({
      mode: 'portable-fallback',
      tried: join(usb, PORTABLE_FOLDER)
    })
  })
  it('the installed app, a developer run and ICCWORSHIP_DATA are never portable', () => {
    expect(dataLocation({ env: {}, isPackaged: true, canWrite: writable })).toEqual({ mode: 'standard' })
    expect(dataLocation({ env: { PORTABLE_EXECUTABLE_DIR: usb }, isPackaged: false, canWrite: writable })).toEqual({ mode: 'standard' })
    expect(dataLocation({ env: { PORTABLE_EXECUTABLE_DIR: usb, ICCWORSHIP_DATA: 'D:\\data' }, isPackaged: true, canWrite: writable })).toEqual({
      mode: 'standard'
    })
  })
})
