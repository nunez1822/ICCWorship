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
- **Nothing happens while something is on screen**: no check, no download start, no install
  (`src/shared/updatePolicy.ts`).
- The download is the installer named in the release's `latest.yml`; `electron-updater` refuses it unless its
  SHA-512 matches. Releases are built by CI with provenance and are immutable once published.
- The **portable** exe can't replace itself: it only checks (GitHub API) and links to the release page.
- Development runs can point the updater at a local feed (`ICCWORSHIP_TEST_UPDATE_CONFIG`, ignored when packaged) so
  `pnpm smoke` exercises check → download → SHA-512 → "ready" for real.

## Consequences
- Until builds are code-signed (ADR 0007), an update is only as trustworthy as the maintainer's GitHub account. With
  signing, `publisherName` in `electron-builder.yml` adds a publisher check.
- Publishing a draft release is what ships it: installed copies with updates on download it within a day. Test the
  draft first (CONTRIBUTING → Releasing).
- Staged rollouts and a beta channel are possible later (`allowPrerelease`, a `beta` channel file).

## Alternatives considered
- **Notify only** (what 1.0 did): safe but most churches would stay on old versions with known bugs.
- **Silent auto-update by default:** industry norm, wrong for an offline-first app run during live services.
- **Squirrel.Windows:** per-user installs only and no differential updates in electron-builder's setup; NSIS +
  `electron-updater` is electron-builder's supported path.
