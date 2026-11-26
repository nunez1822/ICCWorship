---
name: e2e-test
description: Run ICCWorship's end-to-end test cases (docs/e2e_testing/test-cases) against the real Electron app using the Playwright MCP servers, and write a pass/fail report. Use when the user asks to run e2e / end-to-end / QA / release tests, or to verify a feature end to end. Arguments - none (P0 only), "all", area names (live, songs, bible, lbla, plans, media, presentations, themes, messages, remote, people, settings, edge, conflicts, resilience, security, day) or test IDs like TC-LIVE-03. Add "packaged" to run against the installed-style build (dist/win-unpacked).
---

# ICCWorship end-to-end test run

You are the tester. Execute the markdown test cases against the running app, faithfully, and report.
Do **not** fix bugs during the run — record them. Read `docs/e2e_testing/README.md` once for conventions.

## 1. Check the tools
- You need the MCP tools from `.mcp.json`: `mcp__iccworship-app__*` (the app, via CDP) and
  `mcp__iccworship-phone__*` (a phone-sized Edge for /remote and /stage).
- If they are missing, stop and tell the user: approve the project MCP servers in `.mcp.json` and restart the session.

## 2. Pick the cases
- Argument empty → every case tagged `P0` in `docs/e2e_testing/test-cases/*.md`.
- `all` → every case. Area words → matching files (`live` → 02-live.md, `lbla` → 05-lbla.md, `edge` → 14-edge-content.md,
  `conflicts` → 15, `resilience` → 16, `security` → 17, `day` → 18-service-day.md, …). IDs → those cases.
- List the selected IDs to the user in one line before starting.

## 3. Start the app (fresh data)
1. If `out/` is missing or any file in `src/` is newer than `out/main/index.js`, run `npm run build`.
2. Run `npm run e2e:launch` **in the background** (it keeps running). Then wait until
   `curl -s http://localhost:9222/json/version` succeeds (poll with an until-loop, max ~30 s).
3. `browser_tabs` action `list` (iccworship-app) → identify tabs by URL: `index.html` operator, `output.html` projector.
   The MCP often starts on the **projector** tab — `browser_tabs` action `select` the operator tab's index before
   the first click, and re-check the index whenever windows open/close (order can change).
4. Default start state: in the welcome dialog click **English** *inside the dialog*, church name `E2E Test Church`, **Start**.
5. Cases marked **Pre: fresh** need a restart: stop the app (kill the background task / `taskkill /F /IM electron.exe`)
   and launch again.
6. Argument `packaged` (can be combined with the others, e.g. `packaged live`) tests the installed-style build
   instead: in step 1 run `npm run build:dir` (if `dist/win-unpacked/ICCWorship.exe` is missing or older than
   `src/`), in step 2 run `npm run e2e:launch -- --packaged`, and stop it with `taskkill /F /T /IM ICCWorship.exe`.
   A packaged app ignores `ICCWORSHIP_E2E`, so the `window.api.e2e` dialog hooks don't exist there: mark cases
   that need a native file dialog ⚠️ Blocked — packaged instead of running them. Say in the report that the run
   used the packaged build.

## 4. Run each case
- Follow the steps literally. Prefer `browser_snapshot` + accessible names over guessing coordinates.
  Left-nav buttons include an emoji in their name ("🎬 Media", "📖 Bible") — match by contained text, not exact name.
- Verify projector expectations on the `output.html` tab, stage on `stage.html`, phone on iccworship-phone.
- Native file dialogs: first `browser_evaluate` on the operator tab
  `await window.api.e2e.queueOpenFiles(['<absolute path>'])` or `await window.api.e2e.queueSaveFile('<absolute path>')`,
  then click the button. Fixtures: `<repo>/tests/fixtures/`. Write outputs to `<repo>/.e2e-data/`.
- `window.confirm` prompts: the Playwright MCP dismisses (= cancels) a dialog when the tool call that opened it
  ends, so `browser_handle_dialog` usually comes too late. To accept, stub it in the **same** `browser_run_code_unsafe`
  call before clicking: `await page.evaluate(() => { window.confirm = () => true })` (restore it afterwards). Don't
  also add a `page.on('dialog')` handler — two handlers race ("dialog already handled").
- Never click **🖨️ Print**: it opens the native Windows print dialog, which blocks the page and hangs the MCP
  connection (~30 min timeout). Print and **📄 PDF** use the same `runSheetHtml`, so check the PDF instead.
- App log (attach the relevant lines to failure reports): `.e2e-data/.userdata/logs/main.log`.
- Remote PIN: `browser_evaluate` → `(await window.api.settings.get()).remotePin`. The phone `/stage` page needs it
  too: open `/stage#pin=<PIN>`. TC-SEC-04 locks out the whole device for minutes — run it last.
- Screenshot every failure and every case marked 📸; save into `docs/e2e_testing/results/`
  with names like `<runstamp>-TC-LIVE-01.png`.
- **Setup** blocks create helper files in `<repo>/.e2e-data/tmp/` — run them *after* launching (a fresh launch wipes `.e2e-data/`).
- Cases marked *(manual)* need hardware or a human (second monitor, laptop lid): mark them ⚠️ Blocked — manual.
- Cases that say "Record …" have no single right answer: write what happened in Notes; fail only on a crash or data loss.
- A case passes only if **every** expected bullet holds. If a step can't be done (missing feature, tool limit),
  mark it ⚠️ Blocked with the reason — never silently skip.
- Keep the user posted in one short line per area (e.g. "02-live: 9/10 pass, TC-LIVE-06 fails").

## 5. Report
- Copy `docs/e2e_testing/results/TEMPLATE.md` to `docs/e2e_testing/results/YYYY-MM-DD-HHmm.md` and fill it in
  (commit hash, scope, machine notes such as "PowerPoint installed: yes", every case's result, failures with
  expected vs actual and screenshot names, observations).
- Stop the app.
- Finish with: totals, the list of failures (ID + one line each), and the report path. Offer to fix the failures
  as a separate step.
