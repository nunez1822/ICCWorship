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
- **Nothing starts while a service may be running** (something on screen, or a screen cleared mid-item with Esc):
  no automatic check, no download start, no "Restart now" (`src/shared/updatePolicy.ts`). A manual "Check now" still
  asks, and says the download waits. A download running when a service starts is cancelled; the next check resumes.
- **The install at quit is decided at quit** (`beforeQuit()` in `src/main/updates.ts`; electron-updater reads
  `autoInstallOnAppQuit` then): only if both settings are still on and nothing is on screen. Closing the app mid-song
  (or answering Quit to "the window crashed") never installs; a service usually ends with Esc and then closing the
  app, which does. Turning either setting off cancels a download too.
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
- Staged rollouts and a beta channel are possible later (`allowPrerelease`, a `beta` channel file).

## Alternatives considered
- **Notify only** (what 1.0 did): safe but most churches would stay on old versions with known bugs.
- **Silent auto-update by default:** industry norm, wrong for an offline-first app run during live services.
- **Squirrel.Windows:** electron-builder recommends NSIS; its Squirrel target is legacy and needs a separate update
  path (Electron's built-in `autoUpdater`) instead of `electron-updater`.
