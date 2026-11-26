import { describe, expect, it } from 'vitest'
import { isDevProxyPath } from '@shared/security'

describe('isDevProxyPath (npm run dev: what the LAN server forwards to Vite)', () => {
  it('forwards the stage/remote pages, their code and Vite client', () => {
    for (const p of [
      '/stage.html',
      '/remote.html',
      '/stage/main.tsx',
      '/remote/remote.css',
      '/lib/liveFeed.ts',
      '/i18n/index.ts',
      '/@vite/client',
      '/@react-refresh',
      '/@id/__x00__react',
      '/node_modules/.vite/deps/react.js',
      '/@fs/C:/Users/x/GitHub/ICCWorship/src/shared/slides.ts',
      '/@fs/C:/Users/x/GitHub/ICCWorship/node_modules/.vite/deps/chunk.js'
    ])
      expect(isDevProxyPath(p), p).toBe(true)
  })

  it('refuses the operator pages, workspace files and escapes', () => {
    for (const p of [
      '/',
      '/index.html',
      '/Index.html',
      '/output.html',
      '/operator/main.tsx',
      '/OPERATOR/main.tsx',
      '/STAGE/main.tsx',
      '/@fs/C:/Users/x/GitHub/ICCWorship/.e2e-data/data/settings.json',
      '/@fs/C:/Users/x/GitHub/ICCWorship/.e2e-data/node_modules/x.js',
      '/@fs/C:/Users/x/GitHub/ICCWorship/src/main/index.ts',
      '/@fs/C:/Users/x/GitHub/ICCWorship/src/shared/../../package.json',
      '/@fs/C:/Windows/win.ini',
      '/stage/..%2foperator/main.tsx',
      '/stage/%2e%2e/operator/main.tsx',
      '/lib/..\\operator\\main.tsx',
      '/stage/../index.html',
      '/stage.html.bak',
      '/@react-refresh-evil'
    ])
      expect(isDevProxyPath(p), p).toBe(false)
  })
})
