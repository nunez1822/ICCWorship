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
  (same keys; `npm test` checks parity).
- Keep the operator UI simple enough for a first-time volunteer. A failure during a service must never be silent:
  show a toast or message, never a crash or a frozen screen.
- Any user text shown on phones, stage or projector must render as text, never as HTML (see `escapeHtml` in
  `src/main/server.ts`). The phone/stage server is reachable by anyone on the church Wi-Fi.

## Layout
- `src/main/`: Electron main process.
  - `index.ts`: windows and IPC handlers.
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
- Node.js 22.12+ is required (Electron 45 and Vitest 5); see `.nvmrc`.

## Commands
```bash
npm run dev          # hot-reload development
npm test             # unit tests. Use this, not `npx vitest` (see scripts/test.mjs: Windows drive-letter case issue)
npm run typecheck    # must pass
npm run lint         # ESLint: must pass (no errors)
npm run format       # Prettier: format everything (CI runs format:check)
npm run build        # needed before e2e:launch / smoke
npm run e2e:launch   # app with fresh test data + CDP on :9222 for Playwright MCP (add -- --keep to reuse data)
npm run smoke        # scripted end-to-end check with screenshots
```
`npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` must pass before any commit.
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
- Native file dialogs: queue the answer with `window.api.e2e.queueOpenFiles([...])` / `queueSaveFile(...)`
  before clicking.
- `confirm()` dialogs are cancelled when the tool call ends. Stub `window.confirm = () => true` in the same
  `browser_run_code_unsafe` call that clicks the button.
- Never click **🖨️ Print**: the native print dialog hangs the MCP. Check the **📄 PDF** instead (same HTML).
