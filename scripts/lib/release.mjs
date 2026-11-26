// Pure helpers for `pnpm release:prepare` (scripts/release-prepare.mjs). Unit tested in tests/release.test.ts.

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/

/** the next version: 'patch' | 'minor' | 'major', or an explicit x.y.z that must be higher than the current one */
export function nextVersion(current, kind) {
  const m = VERSION.exec(current)
  if (!m) throw new Error(`package.json version "${current}" is not x.y.z`)
  const [maj, min, pat] = m.slice(1).map(Number)
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`
  if (kind === 'minor') return `${maj}.${min + 1}.0`
  if (kind === 'major') return `${maj + 1}.0.0`
  const e = VERSION.exec(kind || '')
  if (!e) throw new Error(`say patch, minor, major or a version like 1.2.0 (got "${kind}")`)
  const want = e.slice(1).map(Number)
  const higher = want[0] - maj || want[1] - min || want[2] - pat
  if (higher <= 0) throw new Error(`${kind} is not higher than the current version ${current}`)
  return kind
}

/**
 * Move the [Unreleased] notes under a new "## [x.y.z] - date" heading (Keep a Changelog) and update the compare
 * links at the bottom. Returns the new text and the release's notes. Refuses an empty [Unreleased].
 */
export function cutChangelog(text, version, date) {
  const head = '## [Unreleased]'
  const start = text.indexOf(head)
  if (start < 0) throw new Error('CHANGELOG.md has no "## [Unreleased]" section')
  const bodyStart = start + head.length
  const next = text.indexOf('\n## [', bodyStart)
  const body = text.slice(bodyStart, next < 0 ? text.length : next)
  const notes = body.trim()
  if (!notes) throw new Error('CHANGELOG.md: [Unreleased] is empty — nothing to release')
  if (text.includes(`## [${version}]`)) throw new Error(`CHANGELOG.md already has a section for ${version}`)
  let out = `${text.slice(0, bodyStart)}\n\n## [${version}] - ${date}${body}${next < 0 ? '' : text.slice(next)}`
  // links: [Unreleased]: …/compare/vOLD...HEAD  →  …/compare/vNEW...HEAD  +  [NEW]: …/compare/vOLD...vNEW
  const link = /^\[Unreleased\]: (\S+)\/compare\/v([^.\s]+\.[^.\s]+\.[^.\s]+)\.\.\.HEAD$/m.exec(out)
  if (link) {
    const [line, base, prev] = link
    out = out.replace(line, `[Unreleased]: ${base}/compare/v${version}...HEAD\n[${version}]: ${base}/compare/v${prev}...v${version}`)
  }
  return { text: out, notes }
}

/** package.json with only its "version" changed (keeps the file's formatting) */
export function setPackageVersion(json, version) {
  let done = false
  const out = json.replace(/^(\s*"version":\s*")([^"]+)(")/m, (_m, a, _v, c) => {
    done = true
    return `${a}${version}${c}`
  })
  if (!done) throw new Error('package.json has no "version" field')
  return out
}
