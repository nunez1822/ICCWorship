# ICCWorship

Free, open-source, **bilingual (English / Español)** church presentation and service-planning app for
Windows, built with Electron + React + TypeScript. It replaces paid tools (EasyWorship, ProPresenter,
Planning Center) for small, often bilingual congregations: songs, scripture, video, PowerPoint/PDF, themes,
service plans, people/teams, a phone remote and a stage display. It runs **fully offline** on a church laptop,
usually operated by a volunteer during a live service, so reliability and simplicity matter more than features.

## Ground rules
- **Never commit copyrighted lyrics or Bible text** (LBLA, NVI, RVR1960, CCLI songs…). Only public-domain content
  ships; users paste/import the rest on their own machine. Test fixtures use placeholder text.
- **Offline-first**: nothing needed to run a service may require the internet.
- **Every user-visible string goes through i18n in both languages**: `src/renderer/i18n/en.json` and `es.json`
  (same keys; `pnpm test` checks parity).
- Keep the operator UI simple enough for a first-time volunteer. A failure during a service must never be silent:
  show a toast or message, never a crash or a frozen screen.
- Any user text shown on phones, stage or projector must render as text, never as HTML (see `escapeHtml` in
  `src/main/server.ts`). The phone/stage server is reachable by anyone on the church Wi-Fi.
- **Trust boundaries** (see `src/shared/security.ts`, unit tested in `tests/security.test.ts`):
  - IPC channels live in `src/main/ipc/handlers.ts` (invoke) and `listeners.ts` (send). `registerIpc` only accepts
    the app's own pages. These objects are the IPC contract: the preload is typed from them, so add a channel there
    and call it from `src/preload/index.ts` with `invoke()` / `send()` (main → page messages: `MainEvents` in
    `src/shared/ipcEvents.ts`, sent with `send()` from `src/main/appState.ts`).
  - An id that becomes a file name must pass `isSafeId`; deletes and writes use `within()` (`src/main/pathGuard.ts`).
  - New settings must be added to `SETTING_CHECKS` or they can't be saved; the renderer can never set `remotePin`.
  - LAN input goes through `validateCommand` / `parseRange`, and phones only receive `pickPublicState`.
  - Nothing a LAN request sends may throw in main: every socket and stream needs an `'error'` handler.
- **Crash recovery** (`src/shared/recovery.ts`, wired in `src/main/windowGuards.ts` → `guardWindow` / `guardOperator`): projector
  and stage pages send `win.alive()` every second and are restarted when they crash or stop beating; repeated
  failures put the projector in `#safe` (black). Pages are wrapped in `ErrorBoundary`. Keep new windows/pages
  inside this net.
- **Data format changes need a migration** (`src/shared/migrations.ts`): bump `SCHEMA_VERSION` and add an
  idempotent migration. Data from a newer schema opens read-only (`JsonStore.readOnly`); any main-side file write
  outside the store must call `assertWritable()` first. Write files with `writeFileAtomic` (`src/main/atomicWrite.ts`).
  Media inside the data folder is referenced data-relative (`dataMediaUrl`) and resolved with `mediaFile()`. Added
  pictures/videos/sound and the logo are copied into `<data>/media/` (`src/shared/mediaLibrary.ts`, `media:copyIn`);
  `MediaItem.path` is then `media/<id>.<ext>`, so never treat it as an absolute path (use `toMediaUrl` + `mediaStatus`).
- **Logging:** use `log` from `src/main/log.ts` (`%APPDATA%\ICCWorship\logs`; test runs: `<ICCWORSHIP_DATA>/.userdata/logs`). Log ids, counts, error codes and short messages, **never** lyrics,
  people, prayer requests, request URLs or payloads. Logs are attached to public bug reports.

## Layout
- `src/main/`: Electron main process.
  - `index.ts`: startup, lifecycle and last-resort error handling only. `windows.ts` (windows), `windowGuards.ts`
    (crash/freeze recovery), `ipc/` (every IPC channel), `pages.ts` (loading our pages, trusted senders),
    `hardening.ts`, `mediaProtocol.ts`, `dialogs.ts`, `menu.ts`, `help.ts`, `appState.ts` (window refs, `notify`).
  - `live.ts`: live state, the single source of truth for what's on screen.
  - `server.ts`: HTTP + WebSocket server on :7272 for `/remote` and `/stage`, PIN-protected.
  - `jsonStore.ts` / `db.ts`: JSON files with `.bak`, atomic writes and recovery of damaged files.
  - `backup.ts` / `restorePath.ts`, `bible.ts`, `presentations.ts`.
- `src/preload/index.ts`: the typed `window.api` bridge. Every main-process feature is exposed here.
- `src/renderer/`: one entry per window.
  - `operator/`: the main window. Pages live in `operator/pages/`; `liveControl.ts` builds slides and pushes
    live state, and runs every action through an action queue.
  - `output/`: the projector window.
  - `stage/`: the stage display, served both as an Electron window and over HTTP.
  - `remote/`: the phone remote.
  - `lib/`, `components/`: shared UI code.
- `src/shared/`: pure logic (types, slides, scripture references, song import, dates). **Pure logic goes here, with
  a unit test in `tests/`.**
- Data lives in `Documents\ICCWorship` (`ICCWORSHIP_DATA` overrides it; e2e runs use `.e2e-data/`).
- Node.js 22.22.1+ is required (Electron 45, Vitest 5 and the `vp staged` hook); see `.node-version` (Vite+ reads it first; it must stay on 22, the range in `engines` alone would pick a newer major). pnpm is the package manager
  (version pinned in `package.json#packageManager`).

## Commands
```bash
pnpm install         # dependencies; also turns on the pre-commit hook (vp staged → vp check --fix)
pnpm dev             # hot-reload development (electron-vite)
pnpm test            # unit tests. Use this, not `vp test` / `npx vitest` (see scripts/test.mjs: Windows drive-letter case issue)
pnpm check           # vp check: format (Oxfmt) + lint (Oxlint, type-aware) + type check (tsrs). Must pass
pnpm check --fix     # …and fix what it can (pnpm format = formatting only)
pnpm build           # needed before e2e:launch / smoke (electron-vite, not `vp build`)
pnpm e2e:launch      # app with fresh test data + CDP on :9222 for Playwright MCP (add --keep to reuse data)
pnpm smoke           # scripted end-to-end check with screenshots
pnpm release:prepare minor  # maintainers: open the release PR (merging it tags, builds and drafts the release)
```
The toolchain is Vite+ (`vp`), configured in `vite.config.ts` (tests, lint, format, hook). The app is still built by
electron-vite (`electron.vite.config.mts`): `vp dev` / `vp build` would run plain Vite and are not used.
`pnpm check` and `pnpm test` must pass before any commit.
Contributor workflow (branches, squash-merged PRs, CHANGELOG, releases) is in [CONTRIBUTING.md](CONTRIBUTING.md):
`main` is protected, so every change goes through a pull request with green CI, and anything a user would notice
gets a line under `[Unreleased]` in `CHANGELOG.md`.

## Keep the e2e docs in step with every change
`docs/e2e_testing/` holds the plain-language end-to-end test cases that the `/e2e-test` skill
(`.claude/skills/e2e-test/SKILL.md`) runs against the real app. They are the definition of "working",
so they must never fall behind the code. **For every change that affects behaviour, UI text, flows, shortcuts,
file formats, the phone/stage server or data handling**, before you consider the work done:

1. Find the cases that cover the area in `docs/e2e_testing/test-cases/`. Files are numbered by area:
   01 first run, 02 live, 03 songs, 04 bible, 05 lbla, 06 plans, 07 media, 08 presentations, 09 themes,
   10 messages/stage, 11 phone remote, 12 people/reports, 13 settings/backup, 14 edge content, 15 conflicts,
   16 resilience, 17 security, 18 service day.
2. **Update** any step or expected result the change makes wrong: labels, button names, messages, counts,
   intentional behaviour changes. A case that fails only because the docs are stale is a bug in the docs.
3. **Add** a case for new behaviour or a fixed bug. Use the next free ID in that file and the format in
   `docs/e2e_testing/README.md` ("Writing a new test case"). Pick the priority: P0 means Sunday is broken
   without it.
4. If the change affects how the app is driven in tests (e2e hooks, launch script, dialogs, ports), update
   `docs/e2e_testing/README.md` and the e2e skill too.
5. In your summary, say which test cases you added or changed, or that none were affected and why.

Run reports go in `docs/e2e_testing/results/` (git-ignored); don't commit them.

## E2E testing gotchas (Playwright MCP)
- The MCP often starts on the projector tab; select the `index.html` (operator) tab first.
- Native file dialogs: queue the answer with `window.api.e2e.queueOpenFiles([...])` / `queueSaveFile(...)`;
  native message boxes (e.g. "the window crashed again — reload?") with `queueMessageBox(<button index>)`
  before clicking.
- `confirm()` dialogs are cancelled when the tool call ends. Stub `window.confirm = () => true` in the same
  `browser_run_code_unsafe` call that clicks the button.
- Never click **🖨️ Print**: the native print dialog hangs the MCP. Check the **📄 PDF** instead (same HTML).
- Freezing or crashing the operator page: queue the answer first (`queueMessageBox(0)` = "Restart the window"),
  start an endless loop from a `setTimeout` so the call returns (a frozen page never answers the MCP again), and
  crash it with CDP `Page.crash` from a plain Node script, not through the MCP (it may close the crashed page, which
  quits the app). The operator page stopped for 10 s (a debugger breakpoint too) gets a "not responding" question.
