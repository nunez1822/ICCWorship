#!/usr/bin/env node
/**
 * pnpm release:prepare <patch|minor|major|x.y.z> [--dry-run]
 *
 * Opens the release pull request: bumps package.json, moves CHANGELOG.md's [Unreleased] notes under the new
 * version, commits that on a release/vX.Y.Z branch and opens the PR. Merging it (squash, green CI) is the release:
 * .github/workflows/release.yml sees the new version on main, tags it, builds the installers on GitHub's servers
 * and creates a DRAFT release to try before publishing. See CONTRIBUTING.md → Releasing.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cutChangelog, nextVersion, setPackageVersion } from './lib/release.mjs'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const kind = args.find((a) => !a.startsWith('--'))
const run = (cmd, ...a) => execFileSync(cmd, a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const fail = (m) => {
  console.error(`✗ ${m}`)
  process.exit(1)
}

if (!kind) fail('usage: pnpm release:prepare <patch|minor|major|x.y.z> [--dry-run]')

// start from an up-to-date, clean main: the release is exactly what is on main
if (run('git', 'status', '--porcelain')) fail('the working tree has changes: commit or stash them first')
if (run('git', 'rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('switch to main first (git switch main)')
run('git', 'fetch', 'origin', 'main', '--tags')
if (run('git', 'rev-parse', 'HEAD') !== run('git', 'rev-parse', 'origin/main')) fail('main is not the same as origin/main: git pull first')

const pkgFile = join(root, 'package.json')
const logFile = join(root, 'CHANGELOG.md')
const pkgText = readFileSync(pkgFile, 'utf8')
const current = JSON.parse(pkgText).version
let version
let cut
try {
  version = nextVersion(current, kind)
  cut = cutChangelog(readFileSync(logFile, 'utf8'), version, new Date().toISOString().slice(0, 10))
} catch (e) {
  fail(e.message)
}
if (run('git', 'tag', '--list', `v${version}`)) fail(`tag v${version} already exists`)

console.log(`Release ${current} → ${version}\n\n${cut.notes}\n`)
if (dry) {
  console.log('(dry run: nothing changed)')
  process.exit(0)
}

const branch = `release/v${version}`
run('git', 'switch', '-c', branch)
writeFileSync(pkgFile, setPackageVersion(pkgText, version))
writeFileSync(logFile, cut.text)
run('git', 'add', 'package.json', 'CHANGELOG.md')
run('git', 'commit', '-m', `Release ${version}`)
run('git', 'push', '-u', 'origin', branch)
const body = `Release **${version}**. Merging this (squash) makes the release workflow tag \`v${version}\` on main, build the
installers on GitHub's servers and create a **draft** release with checksums, provenance and the update files.

Before publishing the draft: install its Setup and Portable exes on a test PC and run the P0 e2e cases
(see CONTRIBUTING.md → Releasing). Published releases are immutable, and installed copies with automatic updates on
will download it.

## Notes

${cut.notes}
`
const url = execFileSync('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Release ${version}`, '--body-file', '-'], {
  cwd: root,
  input: body,
  encoding: 'utf8'
}).trim()
console.log(`✓ release PR: ${url}`)
