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

/** today on this computer (the release date in CHANGELOG.md and the release notes, never tomorrow's UTC date) */
function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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
  cut = cutChangelog(readFileSync(logFile, 'utf8'), version, localToday())
} catch (e) {
  fail(e.message)
}
if (run('git', 'tag', '--list', `v${version}`)) fail(`tag v${version} already exists`)
const branch = `release/v${version}`
if (run('git', 'branch', '--list', branch)) fail(`a local branch ${branch} already exists: delete it first (git branch -D ${branch})`)
if (run('git', 'ls-remote', '--heads', 'origin', branch))
  fail(`origin already has ${branch}: open its PR, or delete it first (git push origin --delete ${branch})`)

console.log(`Release ${current} → ${version}\n\n${cut.notes}\n`)
if (dry) {
  console.log('(dry run: nothing changed)')
  process.exit(0)
}

// gh opens the PR at the end: check it can before changing anything
try {
  run('gh', 'auth', 'status')
} catch {
  fail('the GitHub CLI is not signed in: run `gh auth login` first')
}

let branched = false
/** does origin have the release branch? (asked, not assumed: a push can reach origin and still fail on the way back) */
function onOrigin() {
  try {
    return !!run('git', 'ls-remote', '--heads', 'origin', branch)
  } catch {
    return undefined // can't tell
  }
}
/** something failed half-way: back to main, without the half-made release branch */
function undo(e) {
  console.error(`✗ ${e instanceof Error ? e.message.split('\n')[0] : e}`)
  // why it failed (a rejected push, credentials, the pre-commit hook): the command's own output
  const why = String(e?.stderr || e?.stdout || '').trim()
  if (why) console.error(why.replace(/^/gm, '  '))
  try {
    run('git', 'reset', '--hard') // the tree was clean when this started (checked above): only our two edits go
    run('git', 'switch', 'main')
    if (branched) run('git', 'branch', '-D', branch)
  } catch {
    console.error(`  could not switch back to main by itself: run git switch main${branched ? ` && git branch -D ${branch}` : ''}`)
  }
  const remote = onOrigin()
  if (remote) console.error(`  ${branch} is on origin: open its PR on GitHub, or delete it (git push origin --delete ${branch})`)
  else if (remote === undefined) console.error(`  check whether origin has ${branch} (git ls-remote --heads origin ${branch}) and delete it if so`)
  process.exit(1)
}

try {
  run('git', 'switch', '-c', branch)
  branched = true
  writeFileSync(pkgFile, setPackageVersion(pkgText, version))
  writeFileSync(logFile, cut.text)
  run('git', 'add', 'package.json', 'CHANGELOG.md')
  run('git', 'commit', '-m', `Release ${version}`)
  run('git', 'push', '-u', 'origin', branch)
} catch (e) {
  undo(e)
}
const body = `Release **${version}**. Merging this (squash) makes the release workflow tag \`v${version}\` on main, build the
installers on GitHub's servers and create a **draft** release with checksums, provenance and the update files.

Before publishing the draft: install its Setup and Portable exes on a test PC and run the P0 e2e cases
(see CONTRIBUTING.md → Releasing). Published releases are immutable, and installed copies with automatic updates on
will download it.

## Notes

${cut.notes}
`
try {
  const url = execFileSync('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Release ${version}`, '--body-file', '-'], {
    cwd: root,
    input: body,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'] // gh's error is printed once, by undo()
  }).trim()
  console.log(`✓ release PR: ${url}`)
} catch (e) {
  undo(e)
}
