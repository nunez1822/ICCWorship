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
- Every user-visible string goes through i18n in **both** English and Spanish (`pnpm test` checks this).
- Keep the operator UI simple enough for a volunteer who has never used it. A failure during a service must
  never be silent: show a message, never a crash or a frozen screen.

## Development setup
Requirements: Windows 10/11, **Node.js 22.22.1 or newer** (see `.node-version`), **pnpm** and Git. The easiest way to get
the right Node and pnpm is the [Vite+ CLI](https://viteplus.dev/guide/) (`vp`): it reads `.node-version` and
`package.json#packageManager`. Or install pnpm with `corepack enable pnpm`.

```bash
pnpm install       # dependencies; also turns on the pre-commit hook
pnpm dev           # hot-reload development
pnpm test          # unit tests: must pass
pnpm check         # format + lint + type check in one pass: must pass (pnpm check --fix fixes what it can)
pnpm build && pnpm smoke   # end-to-end check with screenshots (smoke-shots/)
```

**Toolchain.** Tests, lint, formatting and type checks all come from [Vite+](https://viteplus.dev) (`vp`), configured
in `vite.config.ts`: Vitest for tests, Oxlint (type-aware) for lint, Oxfmt (Prettier-compatible) for formatting, and
tsrs (TypeScript 7) for type checks. The app is built by electron-vite (`electron.vite.config.mts`), which runs on
Vite+'s Vite core; don't use `vp dev` / `vp build`, they run plain Vite. `tsconfig.json` must not use `baseUrl`.
In VS Code, install the Oxc extension (`oxc.oxc-vscode`) for lint and format on save, and
`TypeScriptTeam.native-preview` for TypeScript 7.

**Pre-commit hook.** `pnpm install` turns on a Git hook that runs `vp check --fix` on staged files, so formatting
and simple lint fixes happen on commit. Skip it once with `VP_GIT_HOOKS=0 git commit …`.

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
Every PR gets, from CI:
- `ci` (required): `vp check` (format, lint, types), unit tests and a build.
- `smoke` and `packaged`: the built app driven end to end, and the installed-style build started with its fuses
  checked. `packaged` uploads an **ICCWorship-test-build** artifact (the unpacked app, unsigned, kept a week):
  reviewers and testers can run a PR without building it.
- `changelog`: a PR that changes the app must add a line under `[Unreleased]` in `CHANGELOG.md`, or carry the
  `no-changelog` label.
- `dependency-review`: no new dependency with a known vulnerability or a licence outside the allowed list.
- CodeQL and OpenSSF Scorecard (on `main`) report under Security → Code scanning.

1. Fork, then create a branch from `main` (`fix/…`, `feat/…`, `docs/…`, `chore/…`).
2. One topic per PR, with a short description and, for UI changes, a screenshot.
3. Add a line to `CHANGELOG.md` under **[Unreleased]** for anything a user would notice.
4. CI (`vp check`: format, lint, type check; tests; build) must be green. The smoke test on Windows also runs but isn't
   required yet. `main` is protected: every change lands through a pull request and is **squash-merged**, so the
   PR title becomes the commit message. Write it as a clear sentence.

Commit messages and PRs can be in English or Spanish; both are fine.

## Releasing (maintainers)
1. On an up-to-date `main`: `pnpm release:prepare <patch|minor|major>` (or an exact `X.Y.Z`; add `--dry-run` to
   preview). It bumps `package.json`, moves the `[Unreleased]` notes in `CHANGELOG.md` under `[X.Y.Z] - date`, and
   opens a **Release X.Y.Z** pull request.
2. Merge that PR (squash) once CI is green. The release workflow sees the new version on `main`, **tags it
   `vX.Y.Z` itself**, builds the installers on GitHub's servers, checks the packaged app starts, and creates a
   **draft** release with: both exes, `SHA256SUMS.txt`, build provenance, an SBOM (`.sbom.cdx.json`, attested too)
   and the self-update files (`latest.yml`, `.blockmap`). If a run fails, fix it and use **Run workflow** on the
   Release workflow: it rebuilds the existing tag.
3. **Download and install the draft's files and try them** (the P0 e2e cases; `/e2e-test packaged`) before you press
   Publish. Releases are immutable: published files can never be replaced, and the version number can't be reused.
   **Publishing is what ships it:** installed copies with automatic updates on download it within a day.
4. Publish, then announce it in Discussions.

Which version number? **patch** (1.0.1) for fixes only, **minor** (1.1.0) for new features, **major** (2.0.0) when
data written by the new version can't be opened by older ones in the usual way (a `SCHEMA_VERSION` bump is
normally a minor: older versions open newer data read-only).
