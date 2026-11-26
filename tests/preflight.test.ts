import { describe, expect, it } from 'vite-plus/test'
import { preflight, verdict, type PreflightInput } from '@shared/preflight'

const NOW = Date.parse('2026-11-29T09:00:00')
const DAY = 24 * 60 * 60 * 1000
const ready: PreflightInput = {
  now: NOW,
  today: '2026-11-29',
  plan: { title: 'Domingo', date: '2026-11-29', items: 8 },
  itemProblems: [],
  outputOpen: true,
  displays: 2,
  outputOnMainScreen: false,
  sound: { chosen: '', connected: true },
  planHasSound: false,
  server: { enabled: true, running: true, clients: 1 },
  lastBackupAt: NOW - 2 * DAY,
  readOnly: false
}
const byId = (i: PreflightInput, id: string) => preflight(i).find((c) => c.id === id)

describe('preflight', () => {
  it('a ready Sunday is all green', () => {
    const checks = preflight(ready)
    expect(verdict(checks)).toBe('ok')
    expect(checks.map((c) => c.id)).toEqual(['plan', 'items', 'output', 'phone', 'backup'])
  })
  it('the plan: none, empty, or from a past date', () => {
    expect(byId({ ...ready, plan: undefined }, 'plan')).toMatchObject({ level: 'warn', key: 'noPlan', action: 'plans' })
    expect(byId({ ...ready, plan: { ...ready.plan!, items: 0 } }, 'plan')?.key).toBe('emptyPlan')
    expect(byId({ ...ready, plan: { ...ready.plan!, date: '2026-11-22' } }, 'plan')).toMatchObject({ level: 'warn', key: 'oldPlan' })
    expect(byId({ ...ready, plan: { ...ready.plan!, date: '' } }, 'plan')?.level).toBe('ok') // an undated plan is fine
  })
  it('items that would fail on screen are errors, with their names', () => {
    const r = preflight({
      ...ready,
      itemProblems: [
        { title: 'Cuán grande', kind: 'missing' },
        { title: 'Video', kind: 'file' },
        { title: 'Juan 3:16', kind: 'warning' }
      ]
    })
    expect(r.find((c) => c.id === 'missing')).toMatchObject({ level: 'error', params: { count: 1, names: 'Cuán grande' } })
    expect(r.find((c) => c.id === 'files')?.level).toBe('error')
    expect(r.find((c) => c.id === 'warnings')?.level).toBe('warn')
    expect(r.some((c) => c.id === 'items')).toBe(false)
    expect(verdict(r)).toBe('error')
  })
  it('screens: projector closed, one screen, or the projector on the main screen', () => {
    expect(byId({ ...ready, outputOpen: false }, 'output')).toMatchObject({ level: 'error', action: 'openOutput' })
    expect(byId({ ...ready, displays: 1 }, 'output')).toMatchObject({ level: 'warn', key: 'oneScreen' })
    expect(byId({ ...ready, outputOnMainScreen: true }, 'output')?.key).toBe('outputOnMain')
  })
  it('sound: only reported when the plan plays something, or the chosen output is gone', () => {
    expect(byId(ready, 'sound')).toBeUndefined()
    expect(byId({ ...ready, planHasSound: true }, 'sound')).toMatchObject({ level: 'ok', key: 'soundDefault' })
    expect(byId({ ...ready, sound: { chosen: 'USB Audio', connected: false } }, 'sound')?.level).toBe('warn')
    expect(byId({ ...ready, planHasSound: true, sound: { chosen: 'USB Audio', connected: false } }, 'sound')?.level).toBe('error')
  })
  it('phone remote and backups', () => {
    expect(byId({ ...ready, server: { enabled: true, running: false, error: 'EADDRINUSE', clients: 0 } }, 'phone')?.level).toBe('warn')
    expect(byId({ ...ready, server: { enabled: false, running: false, clients: 0 } }, 'phone')).toBeUndefined()
    expect(byId({ ...ready, lastBackupAt: undefined }, 'backup')?.key).toBe('noBackup')
    expect(byId({ ...ready, lastBackupAt: NOW - 9 * DAY }, 'backup')).toMatchObject({ level: 'warn', params: { days: 9 } })
  })
  it('read-only data comes first; a downloaded update is mentioned', () => {
    const r = preflight({ ...ready, readOnly: true, update: { version: '1.2.0' } })
    expect(r[0]).toMatchObject({ id: 'data', level: 'error' })
    expect(r.find((c) => c.id === 'update')).toMatchObject({ level: 'ok', params: { version: '1.2.0' } })
  })
})
