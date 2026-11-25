import { describe, expect, it } from 'vitest'
import { isAllowedHost, isSafeId, isSameOrigin, parseRange, pickPublicState, sanitizeSettingsPatch, validateCommand } from '@shared/security'
import { DEFAULT_THEMES } from '@shared/defaults'
import type { LiveState } from '@shared/types'

describe('isSafeId', () => {
  it('accepts generated ids', () => {
    for (const id of ['abc', 'a1B2-c_3', 'lbla', 'x'.repeat(64)]) expect(isSafeId(id)).toBe(true)
  })
  it('rejects anything that could leave its folder', () => {
    for (const id of ['', '.', '..', '../x', 'a/b', 'a\\b', 'C:x', 'a.json', 'x'.repeat(65), ' a', 7, null, undefined]) expect(isSafeId(id)).toBe(false)
  })
})

describe('parseRange', () => {
  it('serves the whole file without a usable Range header', () => {
    for (const h of [undefined, null, '', 'items=0-1', 'bytes=-', 'bytes=0-1,4-5', 'garbage']) expect(parseRange(h, 100)).toEqual({ kind: 'full' })
  })
  it('handles normal, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ kind: 'partial', start: 0, end: 9 })
    expect(parseRange('bytes=90-', 100)).toEqual({ kind: 'partial', start: 90, end: 99 })
    expect(parseRange('bytes=-10', 100)).toEqual({ kind: 'partial', start: 90, end: 99 })
    expect(parseRange('bytes=-500', 100)).toEqual({ kind: 'partial', start: 0, end: 99 })
  })
  it('clamps the end to the file size', () => {
    expect(parseRange('bytes=50-5000', 100)).toEqual({ kind: 'partial', start: 50, end: 99 })
  })
  it('reports ranges that cannot be served instead of crashing', () => {
    // bytes=500-10 used to reach createReadStream({start:500,end:10}), which throws inside the request handler
    expect(parseRange('bytes=500-10', 1000)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=100-', 100)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=-0', 100)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=0-0', 0)).toEqual({ kind: 'unsatisfiable' })
    expect(parseRange('bytes=99999999999999999999-', 100)).toEqual({ kind: 'unsatisfiable' })
  })
})

describe('isAllowedHost', () => {
  const pc = 'CHURCH-PC'
  it('accepts IP addresses, localhost and this computer’s name', () => {
    for (const h of [
      '192.168.1.20:7272',
      '10.0.0.5',
      '127.0.0.1:7272',
      '[::1]:7272',
      '[fe80::1]',
      'localhost:7272',
      'church-pc:7272',
      'CHURCH-PC',
      'church-pc.local:7272',
      'church-pc.home.arpa',
      'church-pc.lan'
    ])
      expect(isAllowedHost(h, pc)).toBe(true)
  })
  it('rejects other names (DNS rebinding) and empty hosts', () => {
    for (const h of [
      undefined,
      '',
      'evil.example',
      'evil.example:7272',
      'church-pc.evil.example',
      'church-pc.local.evil.example',
      'xchurch-pc.local',
      'localhost.evil.example'
    ])
      expect(isAllowedHost(h, pc)).toBe(false)
  })
})

describe('isSameOrigin', () => {
  it('allows clients without an Origin and our own pages', () => {
    expect(isSameOrigin(undefined, '192.168.1.20:7272')).toBe(true)
    expect(isSameOrigin('http://192.168.1.20:7272', '192.168.1.20:7272')).toBe(true)
  })
  it('rejects other websites and opaque origins', () => {
    expect(isSameOrigin('http://evil.example', '192.168.1.20:7272')).toBe(false)
    expect(isSameOrigin('http://192.168.1.20:8080', '192.168.1.20:7272')).toBe(false)
    expect(isSameOrigin('null', '192.168.1.20:7272')).toBe(false)
    expect(isSameOrigin('file://', '192.168.1.20:7272')).toBe(false)
    expect(isSameOrigin('http://192.168.1.20:7272', undefined)).toBe(false)
  })
})

describe('validateCommand', () => {
  it('accepts every command the remote and stage pages send', () => {
    for (const t of ['next', 'prev', 'nextItem', 'prevItem', 'black', 'clearText', 'logo', 'clearAll', 'clearMessage', 'videoToggle'])
      expect(validateCommand({ type: t })).toEqual({ type: t })
    expect(validateCommand({ type: 'gotoItem', index: 3 })).toEqual({ type: 'gotoItem', index: 3 })
    expect(validateCommand({ type: 'gotoSlide', index: 0 })).toEqual({ type: 'gotoSlide', index: 0 })
    expect(validateCommand({ type: 'displayLang', value: 'both' })).toEqual({ type: 'displayLang', value: 'both' })
    expect(validateCommand({ type: 'message', text: 'Hola' })).toEqual({ type: 'message', text: 'Hola' })
    expect(validateCommand({ type: 'stageMessage', text: '' })).toEqual({ type: 'stageMessage', text: '' })
  })
  it('drops extra fields', () => {
    expect(validateCommand({ type: 'next', evil: 1 })).toEqual({ type: 'next' })
  })
  it('rejects unknown, malformed and projector-only commands', () => {
    for (const c of [
      null,
      'next',
      {},
      { type: 'videoEnded', src: 'x' },
      { type: 'nope' },
      { type: 'gotoSlide', index: -1 },
      { type: 'gotoSlide', index: 1.5 },
      { type: 'gotoItem', index: '2' },
      { type: 'displayLang', value: 'fr' },
      { type: 'message', text: '' },
      { type: 'message', text: 'x'.repeat(501) },
      { type: 'stageMessage', text: 5 }
    ])
      expect(validateCommand(c)).toBeNull()
  })
})

describe('pickPublicState', () => {
  const state: LiveState = {
    planTitle: 'Domingo',
    planItems: [{ id: 'i1', type: 'song', title: 'Song', durationMin: 4, person: 'Ana' }],
    itemIndex: 0,
    itemId: 'i1',
    itemNotes: 'notes',
    slides: [
      { id: 's1', kind: 'text', text: { es: 'Hola', en: 'Hi' }, notes: 'n' },
      { id: 's2', kind: 'image', media: 'media://local/C%3A%5CUsers%5Cpastor%5Cslide.png' },
      { id: 's3', kind: 'video', media: 'media://local/C%3A%5CUsers%5Cpastor%5Cv.mp4' }
    ],
    slideIndex: 1,
    clearedFrom: undefined,
    theme: DEFAULT_THEMES[0],
    background: { type: 'image', value: 'media://local/C%3A%5CUsers%5Cpastor%5Cbg.jpg' },
    displayLang: 'both',
    bilingualOrder: 'es-first',
    layers: { black: false, clearText: false, clearBackground: false, logo: false },
    video: { src: 'media://local/C%3A%5CUsers%5Cpastor%5Cv.mp4', playing: true, loop: false, volume: 1, seekSeq: 0, seekTo: 0 },
    logoPath: 'C:\\Users\\pastor\\logo.png',
    churchName: 'ICC',
    seq: 4
  }
  const out = pickPublicState(state, (u) => (u ? '/file/token' : undefined))
  it('keeps what the stage and remote pages read', () => {
    expect(out.slides[0].text).toEqual({ es: 'Hola', en: 'Hi' })
    expect(out.slides[1].media).toBe('/file/token')
    expect(out.planItems[0]).toEqual({ id: 'i1', type: 'song', title: 'Song', durationMin: 4, person: 'Ana' })
    expect(out.video).toEqual({ playing: true })
    expect(out.slideIndex).toBe(1)
  })
  it('never sends local file paths or anything not on the list', () => {
    const json = JSON.stringify(out)
    expect(json).not.toMatch(/pastor|Users|media:\/\//)
    expect(out.slides[2].media).toBeUndefined() // video files are never fetched by phones
    for (const k of ['theme', 'background', 'logoPath', 'churchName', 'seq', 'message', 'videoProgress']) expect(out).not.toHaveProperty(k)
  })
})

describe('sanitizeSettingsPatch', () => {
  it('keeps valid settings', () => {
    expect(sanitizeSettingsPatch({ uiLang: 'en', serverPort: 8080, churchName: 'ICC', logoPath: '', serverEnabled: false })).toEqual({
      uiLang: 'en',
      serverPort: 8080,
      churchName: 'ICC',
      logoPath: '',
      serverEnabled: false
    })
  })
  it('drops invalid values instead of throwing (a half-typed port must not break the field)', () => {
    expect(sanitizeSettingsPatch({ serverPort: 8 })).toEqual({})
    expect(sanitizeSettingsPatch({ serverPort: 70000 })).toEqual({})
    expect(sanitizeSettingsPatch({ serverPort: '8080' })).toEqual({})
    expect(sanitizeSettingsPatch({ messageSeconds: NaN })).toEqual({})
    expect(sanitizeSettingsPatch({ uiLang: 'fr' })).toEqual({})
    expect(sanitizeSettingsPatch(null)).toEqual({})
  })
  it('clamps message seconds', () => {
    expect(sanitizeSettingsPatch({ messageSeconds: 1 })).toEqual({ messageSeconds: 5 })
  })
  it('never lets the renderer set the PIN or unknown keys', () => {
    expect(sanitizeSettingsPatch({ remotePin: '' })).toEqual({})
    expect(sanitizeSettingsPatch({ __proto__: { x: 1 }, nope: 1 })).toEqual({})
  })
})
