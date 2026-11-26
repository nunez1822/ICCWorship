import { describe, expect, it } from 'vite-plus/test'
import { cutChangelog, nextVersion, setPackageVersion } from '../scripts/lib/release.mjs'

describe('nextVersion', () => {
  it('bumps patch, minor and major', () => {
    expect(nextVersion('1.0.0', 'patch')).toBe('1.0.1')
    expect(nextVersion('1.0.3', 'minor')).toBe('1.1.0')
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0')
  })
  it('accepts an explicit higher version only', () => {
    expect(nextVersion('1.0.0', '1.2.0')).toBe('1.2.0')
    expect(() => nextVersion('1.2.0', '1.1.9')).toThrow(/not higher/)
    expect(() => nextVersion('1.2.0', '1.2.0')).toThrow(/not higher/)
    expect(() => nextVersion('1.2.0', 'big')).toThrow(/patch, minor, major/)
    expect(() => nextVersion('1.2', 'patch')).toThrow(/x\.y\.z/)
  })
  it('refuses leading zeros (not semver: 1.01.0 would compare wrongly)', () => {
    expect(() => nextVersion('1.0.0', '1.01.0')).toThrow(/patch, minor, major/)
    expect(nextVersion('1.0.9', '1.0.10')).toBe('1.0.10')
  })
})

const CHANGELOG = `# Changelog

## [Unreleased]

### Added
- A thing.

## [1.0.0] - 2026-11-24

### Added
- First release.

[Unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/o/r/releases/tag/v1.0.0
`

describe('cutChangelog', () => {
  it('moves the unreleased notes under the new version and fixes the links', () => {
    const { text, notes } = cutChangelog(CHANGELOG, '1.1.0', '2026-12-01')
    expect(notes).toBe('### Added\n- A thing.')
    expect(text).toContain('## [Unreleased]\n\n## [1.1.0] - 2026-12-01\n\n### Added\n- A thing.\n\n## [1.0.0] - 2026-11-24')
    expect(text).toContain('[Unreleased]: https://github.com/o/r/compare/v1.1.0...HEAD\n[1.1.0]: https://github.com/o/r/compare/v1.0.0...v1.1.0\n[1.0.0]:')
  })
  it('refuses an empty release or a version already there', () => {
    const empty = CHANGELOG.replace('### Added\n- A thing.\n\n', '')
    expect(() => cutChangelog(empty, '1.1.0', '2026-12-01')).toThrow(/empty/)
    expect(() => cutChangelog(CHANGELOG, '1.0.0', '2026-12-01')).toThrow(/already/)
    expect(() => cutChangelog('# nothing', '1.1.0', 'x')).toThrow(/no "## \[Unreleased\]"/)
  })
})

describe('setPackageVersion', () => {
  it('changes only the version', () => {
    const pkg = '{\n  "name": "iccworship",\n  "version": "1.0.0",\n  "dependencies": { "x": "1.0.0" }\n}\n'
    expect(setPackageVersion(pkg, '1.1.0')).toBe(pkg.replace('"version": "1.0.0"', '"version": "1.1.0"'))
  })
})
