# End-to-end testing (AI-driven, with Playwright MCP)

ICCWorship's end-to-end tests are written as **plain-language test cases** in this folder and are
executed by an AI agent (Claude Code) that drives the real app through **Playwright MCP**.
While the app is a prototype this is much faster to maintain than coded specs, and every case
is written so it can later be turned 1-to-1 into a Playwright test file.

> Unit tests (`pnpm test`) and the scripted smoke run (`pnpm smoke`) still exist — these
> markdown cases cover the *user journeys* that are slow to code by hand.

## Is this normal for open-source projects?

Yes. Most established projects keep both:

| What | Where it usually lives | Examples |
|---|---|---|
| Automated E2E specs | `tests/e2e/`, `e2e/`, run in CI | Playwright/Cypress suites in VS Code, Mattermost, Grafana |
| Manual test plans / QA checklists | `docs/testing/`, `TESTING.md`, release-checklist issue templates | VS Code's monthly "test plan item" issues, Thunderbird/Firefox QA test cases, release checklists in many Electron apps |

Keeping written test cases in the repo is welcome: contributors know what "working" means, reviewers can ask
"which TC covers this?", and volunteers without coding skills can run them before a release.
This folder is the manual-test-plan half; the IDs make it easy to grow the automated half later.

## Folder layout

```
docs/e2e_testing/
  README.md            ← you are here (setup, conventions)
  test-cases/          ← one file per area, each case has an ID like TC-LIVE-03
                         01–13: one feature each (happy paths + common errors)
                         14 edge content · 15 conflicts · 16 resilience · 17 security · 18 full Sunday
  results/             ← run reports + screenshots (git-ignored except README/TEMPLATE)
.claude/skills/e2e-test/SKILL.md   ← the /e2e-test skill that runs these cases
.mcp.json                          ← Playwright MCP servers for the app and a "phone"
scripts/e2e-launch.mjs             ← starts the app for testing
tests/fixtures/                    ← sample pptx, pdf, mp4, mp3 (mono), sample-stereo.mp3, flac, opus, jpg, OpenLyrics, ChordPro, pasted text
```

## One-time setup

1. `pnpm install`
2. Open this folder in Claude Code. It will ask to approve the two project MCP servers from `.mcp.json`
   (`iccworship-app` and `iccworship-phone`) — approve both. Restart the session if they don't appear.
3. Microsoft Edge must be installed (it is on every Windows 10/11 PC) — it plays the phone.

## Running

Easiest — in Claude Code:

```
/e2e-test            → P0 cases only (≈15 min, run before every release)
/e2e-test all        → every case
/e2e-test live bible → only those areas (file names in test-cases/)
/e2e-test security   → 17-security.md (also: edge, conflicts, resilience, day)
/e2e-test TC-LBLA-02 → a single case
```

Manually:

```powershell
pnpm build
pnpm e2e:launch             # fresh test data each time; add --keep to reuse it
```

To test **the installed-style build** (asar packaging, Electron fuses) instead of the dev build, run
`pnpm build:dir` and then `pnpm e2e:launch --packaged`. A packaged app ignores `ICCWORSHIP_E2E` (a
security measure), so the `window.api.e2e` dialog hooks don't exist there and only cases without native file
dialogs can run against it. Stop it with Ctrl+C (the launcher ends the whole
process tree) or `taskkill /F /T /IM ICCWorship.exe`. For a quick automated check that the packaged app starts, its
windows render and its fuses are set, run `pnpm packaged-check` (CI runs it too).

Then ask Claude to "use the iccworship-app tools to run TC-LIVE-01 … ". Stop the app with Ctrl+C.

### How the pieces connect

```
 Claude Code ──MCP──► iccworship-app  ──CDP :9222──► ICCWorship (Electron)
                                                     ├─ index.html   operator window
                                                     ├─ output.html  projector window
                                                     └─ stage.html   stage window (when opened)
 Claude Code ──MCP──► iccworship-phone (Edge, iPhone size) ──HTTP/WS :7272──► /remote, /stage
```

- Each Electron window is a **tab** in `iccworship-app`. Use `browser_tabs` to list/select them:
  `index.html` = operator, `output.html` = projector, `stage.html` = stage display.
  The MCP often starts on the projector tab — select the operator tab before the first click.
- Left-nav buttons have an emoji in their accessible name ("🎬 Media"), so match them by contained text.
- Test data lives in `.e2e-data/` — your real `Documents\ICCWorship` is never touched.
  The launch scripts also set `ICCWORSHIP_TEST_PROFILE=1`, so the test app keeps its own Chromium profile, logs
  (`.e2e-data/.userdata/logs/main.log`) and single-instance lock and can run next to the church's copy.
  `ICCWORSHIP_DATA` alone (a user's custom data folder) does not do that.
- The projector stays a small window unless you launch with `-- --fullscreen`.

## Conventions for the tester (human or AI)

- **Start state.** Unless a case says otherwise, start from a *fresh* launch and finish the welcome
  dialog with church name **"E2E Test Church"** and language **English** (button inside the dialog).
  Cases marked **Pre: fresh** need a restart (`pnpm e2e:launch`).
- **Labels.** UI text is given as `English / Español`. Prefer accessible names (`browser_snapshot`) over CSS.
- **Projector checks.** Verify the projector by switching to the `output.html` tab and taking a snapshot
  or screenshot — never trust the operator's preview alone.
- **Native file dialogs** cannot be clicked. Before pressing a button that opens one, queue the answer
  with `browser_evaluate` on the operator tab:
  ```js
  await window.api.e2e.queueOpenFiles(['C:/path/to/ICCWorship/tests/fixtures/sample.mp4'])   // open dialog
  await window.api.e2e.queueSaveFile('C:/path/to/ICCWorship/.e2e-data/out.zip')             // save dialog
  await window.api.e2e.queueMessageBox(0)                                                   // next message box: button 0
  ```
  (only available when started with `pnpm e2e:launch`). Use absolute paths.
- **Confirm boxes** (`window.confirm`): the MCP cancels them when the tool call ends, so accept them by stubbing
  `window.confirm = () => true` in the same `browser_run_code_unsafe` call that clicks the button.
- **Print**: don't click 🖨️ Print in automated runs — the native print dialog hangs the MCP. Check the 📄 PDF
  (same content) instead.
- **Fixtures** are in `tests/fixtures/` (see the table in each case). Odd files (broken XML, names with
  `#`/`%`/accents, huge images…) are generated by a case's **Setup** block into `.e2e-data/tmp/` — run it
  *after* launching, since a fresh launch wipes `.e2e-data/`.
- **Manual cases** *(manual)* need hardware or a person (second monitor, laptop sleep): AI runs mark them ⚠️ Blocked.
- **"Record …"** bullets have no single right answer — note what happened; fail only on crash or data loss.
- **Evidence.** Take a screenshot for every failed expectation and for cases marked 📸.
- **Don't fix while testing.** Record the failure; fixes are a separate step.

## Writing a new test case

Add it to the matching file in `test-cases/` using this shape (copy an existing one):

```md
### TC-AREA-NN · Short title  `P0|P1|P2`
**Pre:** what must be true first (or "default")
**Steps**
1. …
**Expected**
- … (observable: text on screen, window, file on disk)
```

Priority: **P0** = Sunday is broken without it · **P1** = important · **P2** = nice to have.
Keep steps observable and in user language; one behaviour per case.

## Reports

Each run writes `results/YYYY-MM-DD-HHmm.md` from [results/TEMPLATE.md](results/TEMPLATE.md), with
screenshots next to it. Reports are git-ignored by default; attach the relevant one to an issue or PR.

## From markdown to code (later)

When a flow stabilizes, convert it: each `TC-…` becomes one `test('TC-…')` in a Playwright
spec using `_electron.launch()` (see `scripts/smoke.mjs` for a working example). Keep the ID in the
test name so the markdown and the code stay linked.
