# 0003 · Updates: opt-in, never during a service, installed on quit

**Status:** Accepted (2026-11)

## Context
ICCWorship is offline-first and runs live services. Most Electron apps (VS Code, Slack, Discord, Obsidian) update
themselves silently. A church laptop is different: the internet may be the livestream's, the app must never restart
mid-service, and many churches don't want software changing under them on a Sunday morning.

## Decision
- The update check is **off by default** (Settings → About → "Check for new versions once a day").
- With it on, the **installed** app (NSIS) also downloads the new version with `electron-updater` (on by default under
  the check, can be unticked) and **installs it when ICCWorship closes**, or on "Restart now".
- **Nothing starts while a service may be running** (something on screen, or a screen cleared mid-item with Esc
  less than 2 hours after something was last on screen, timed on the monotonic clock so Windows correcting the time
  doesn't end it; a timed message counts until it ran out): no automatic check, no download start
  (`src/shared/updatePolicy.ts`). Esc keeps its place until something else goes live, hence the time limit: a
  service ended with Esc on a laptop left open must not block updates until a restart. A manual "Check now" still
  asks, and says the download waits. A download that waited, or was cancelled because a service started, is tried
  again at the next automatic check after the service (6-hourly), not a day later; electron-updater starts a
  cancelled download from the beginning.
- **"Restart now"** is an explicit click: it installs unless something is on screen right now (a screen cleared with
  Esc doesn't stop it), checked again just before the installer starts. If the installer doesn't start, the operator
  is told and the app keeps running. A second click while it starts does nothing more; with updates turned off it
  says so.
- **The install at quit is decided at quit** (`beforeQuit()` in `src/main/updates.ts`; electron-updater reads
  `autoInstallOnAppQuit` then): only if both settings are still on and nothing is on screen. Closing the app mid-song
  never installs, nor does answering Quit to "the window crashed" mid-service, even with the screen cleared by Esc (the
  volunteer reopens the app at once, and the silent install doesn't reopen it); a service usually ends with Esc and
  then closing the app, which does. Turning either setting off cancels a download too, and hides a downloaded one ("is ready",
  "Restart now") until updates are on again.
- **No tracking id:** electron-updater sends a random per-install id (kept in `userData/.updaterId`) with every
  request, for staged rollouts. We send zeros instead (`requestHeaders`), so GitHub can't link one computer's checks.
- The download is the installer named in the release's `latest.yml`; `electron-updater` refuses it unless its
  SHA-512 matches. Releases are built by CI with provenance and are immutable once published.
- The **portable** exe can't replace itself: it only checks (GitHub API) and links to the release page.
- Development runs can point the updater at a local feed (`ICCWORSHIP_TEST_UPDATE_CONFIG`, ignored when packaged) so
  `pnpm smoke` exercises check → download → SHA-512 → "ready" for real.

## Consequences
- Until builds are code-signed (ADR 0007), an update is only as trustworthy as the maintainer's GitHub account. With
  signing, `publisherName` (in `win.signtoolOptions` or `win.azureSignOptions`) adds a publisher check.
- An update downloaded but never installed (every quit happens with something on screen) waits for the next quit
  with nothing on screen; the next day's check finds it already downloaded.
- Publishing a draft release is what ships it: installed copies with updates on download it within a day. Test the
  draft first (CONTRIBUTING → Releasing).
- A beta channel is possible later (`allowPrerelease`, a `beta` channel file). Staged rollouts
  (`stagingPercentage`) would need a real per-install id, which we chose not to send.

## Alternatives considered
- **Notify only** (what the update check did before this change; 1.0 had none): safe but most churches would stay
  on old versions with known bugs.
- **Silent auto-update by default:** industry norm, wrong for an offline-first app run during live services.
- **Squirrel.Windows:** electron-builder recommends NSIS; its Squirrel target is legacy and needs a separate update
  path (Electron's built-in `autoUpdater`) instead of `electron-updater`.
