# Contributing to ICCWorship / Cómo contribuir

Thank you for helping churches! · ¡Gracias por ayudar a las iglesias!

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Questions go to [Discussions](https://github.com/nunez1822/ICCWorship/discussions); security problems are
reported privately (see [SECURITY.md](SECURITY.md)).

## Ways to help
- **Report bugs**: use the bug-report form. Say what you did, what you expected, what happened, and your
  Windows version. Never include names, phone numbers or prayer requests; issues are public.
- **Translate**: all UI text is in `src/renderer/i18n/en.json` and `es.json`. To add a language, add a new JSON
  file with the same keys and register it in `src/renderer/i18n/index.ts`.
- **Public-domain songs**: bilingual hymns are especially welcome. Only add lyrics that are in the public domain.
- **Code**: fix a bug or build a feature from the issues. Issues labelled `good first issue` are a good start.

## Ground rules
- **Never commit copyrighted lyrics or Bible texts.** Users paste or import those on their own computer. Test
  fixtures use placeholder text.
- Keep it **offline-first**: no feature may require the internet to run a service.
- Every user-visible string goes through i18n in **both** English and Spanish (`npm test` checks this).
- Keep the operator UI simple enough for a volunteer who has never used it. A failure during a service must
  never be silent: show a message, never a crash or a frozen screen.

## Development setup
Requirements: Windows 10/11, **Node.js 22.12 or newer** (see `.nvmrc`) and Git.

```bash
npm install
npm run dev        # hot-reload development
npm test           # unit tests: must pass
npm run typecheck  # must pass
npm run lint       # must pass
npm run format     # Prettier formats the code; CI checks it
npm run build && npm run smoke   # end-to-end check with screenshots (smoke-shots/)
```

The whole codebase was reformatted with Prettier once. To keep `git blame` useful, run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once in your clone.

Changing how data is stored? Bump `SCHEMA_VERSION` and add a migration in `src/shared/migrations.ts` (with a
test) so existing churches' data is upgraded safely — see CLAUDE.md.

Pure logic belongs in `src/shared/` with a unit test in `tests/`. UI goes in `src/renderer/`.
Main-process features expose a typed method in `src/preload/index.ts`. See [CLAUDE.md](CLAUDE.md) for a map of
the code and the end-to-end test conventions.

### End-to-end tests
`docs/e2e_testing/test-cases/` holds plain-language test cases that define "working". When you change
behaviour, update or add the matching cases (see `docs/e2e_testing/README.md`). Maintainers using Claude Code
can run them with the `/e2e-test` skill (`.claude/skills/e2e-test/`), which drives the real app through the
Playwright MCP servers in `.mcp.json`.

## Pull requests
1. Fork, then create a branch from `main` (`fix/…`, `feat/…`, `docs/…`, `chore/…`).
2. One topic per PR, with a short description and, for UI changes, a screenshot.
3. Add a line to `CHANGELOG.md` under **[Unreleased]** for anything a user would notice.
4. CI (type check, lint, format check, tests, build, smoke test on Windows) must be green. `main` is protected: every change lands
   through a pull request and is **squash-merged**, so the PR title becomes the commit message. Write it as a
   clear sentence.

Commit messages and PRs can be in English or Spanish; both are fine.

## Releasing (maintainers)
1. Open a release PR: bump `version` in `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`),
   and move the `[Unreleased]` notes in `CHANGELOG.md` under a new `[X.Y.Z] - YYYY-MM-DD` heading. Merge it.
2. Create the tag on GitHub, from the merged commit on `main`:
   `gh api repos/nunez1822/ICCWorship/git/refs -f ref=refs/tags/vX.Y.Z -f sha=<main sha>`.
   The release workflow builds the installers on GitHub's servers and creates a **draft** release with checksums
   and build provenance.
3. **Download and install the draft's files and try them** before you press Publish. Releases are immutable:
   published files can never be replaced, and the version number can't be reused.
4. Publish, then announce it in Discussions.
