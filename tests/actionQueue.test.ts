import { describe, expect, it } from 'vite-plus/test'
import { createActionQueue } from '@renderer/lib/actionQueue'

describe('live action queue', () => {
  it('runs actions in order, one at a time', async () => {
    const q = createActionQueue(() => {})
    const log: string[] = []
    const slow = (name: string, ms: number) => () => new Promise<void>((r) => setTimeout(() => (log.push(name), r()), ms))
    await Promise.all([q(slow('a', 20)), q(slow('b', 0)), q(slow('c', 5))])
    expect(log).toEqual(['a', 'b', 'c'])
  })

  it('reports a failed action and keeps running the next ones', async () => {
    const errors: unknown[] = []
    const q = createActionQueue((e) => errors.push(e))
    const ran: string[] = []
    await Promise.all([
      q(() => ran.push('before')),
      q(async () => {
        throw new Error('IPC failed')
      }),
      q(() => {
        throw new Error('sync failure')
      }),
      q(() => ran.push('after'))
    ])
    expect(errors.map((e) => (e as Error).message)).toEqual(['IPC failed', 'sync failure'])
    expect(ran).toEqual(['before', 'after'])
  })
})
