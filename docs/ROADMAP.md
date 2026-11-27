# Roadmap

Where ICCWorship is going, and why in this order. Decisions with lasting consequences are recorded in
[docs/adr/](adr/README.md). Anything a user would notice also gets a line in [CHANGELOG.md](../CHANGELOG.md) when it
lands.

The guiding rule hasn't changed: a volunteer runs a live service on an offline church laptop, so **reliability and
simplicity come before features**.

## Done in this round (before 1.1, while there are no users yet)
Changes that would have been breaking or hard to migrate once churches depend on the app:

| Area | What | Why now |
|---|---|---|
| Architecture | `src/main/index.ts` split into modules; typed IPC contract ([ADR 0008](adr/0008-typed-ipc-contract.md)) | Every later change touches IPC |
| Security | Pages served from `app://iccworship`, last Electron fuse off ([ADR 0002](adr/0002-pages-from-app-protocol.md)) | Changes the pages' origin (and their `localStorage`) |
| Reliability | "Put it back" after a crash, power cut or forced restart; window size and place remembered | — |
| Distribution | Portable exe keeps its data beside it ([ADR 0005](adr/0005-portable-data-beside-exe.md)) | Moves where data lives |
| Distribution | The installed app updates itself, opt-in, installed on quit ([ADR 0003](adr/0003-updates-opt-in-install-on-quit.md)) | Must ship in the first release users install, or they never get it |
| Delivery | `pnpm release:prepare` → merging the release PR tags, builds and drafts the release; SBOM; PR test builds; changelog check; OpenSSF Scorecard | — |
| Service day | "Ready for Sunday?" pre-service checklist | — |
| Data | The media library keeps its own copies, and "Back up now" includes them ([ADR 0004](adr/0004-media-library-copies.md)) | Changes what `MediaItem.path` means |
| Data | Stay on JSON files, not SQLite ([ADR 0001](adr/0001-json-files-not-sqlite.md)) | Decided while switching was still free |

## Next (1.1 → 1.2)
1. **Release 1.1.0** with the above: `pnpm release:prepare minor`, test the draft on a clean PC (P0 e2e cases plus
   `/e2e-test packaged`), publish, publish the drafted security advisories.
2. **Code signing** ([ADR 0007](adr/0007-code-signing.md)): apply to the SignPath Foundation, add the
   `win.signtoolOptions.sign` hook, set `publisherName`. Then **winget** (`winget-pkgs` manifest, updated by a
   workflow on each release).
3. **Required checks:** make `smoke` and `packaged` required once they have been green for ~10 runs on `main`.
4. **Beta channel:** pre-releases for volunteers who test before Sunday (`allowPrerelease` as a setting, a `beta`
   channel file from the release workflow).
5. **Tidy the media library:** list copies nothing uses (after a restore, or an item removed while it was on screen)
   and offer to remove them; "Copy into library" for items added while copying was off.

## Later (2.0 candidates)
- **Any two languages, not only English + Spanish** ([ADR 0006](adr/0006-content-languages.md)): `primary` /
  `secondary` language codes, `BiText` → `{ [lang]: string }` with a migration, importers and the stage/remote
  pages following. The biggest change on the list; it opens the app to Korean, Portuguese, French, Haitian Creole…
  congregations.
- **More interface languages** through a translation platform (Weblate hosts OSS for free) once strings settle.
- **Accessibility pass** of the operator UI: keyboard-only operation, screen-reader names, contrast in the light theme.
- **A user guide** (GitHub Pages, bilingual, screenshots from `pnpm smoke`), linked from Help.
- **Install updates side by side**, as Squirrel (Slack, Teams) and VS Code do: today the NSIS installer replaces the
  app in place after it closes, so opening ICCWorship again during those seconds can find it half replaced (or be
  closed by the installer). An install into a new folder with an atomic switch, or at least a "finishing an update"
  check at start-up (the installer holds a mutex named after the app's GUID), would close that window.
  [ADR 0003](adr/0003-updates-opt-in-install-on-quit.md) would be superseded.
- **Fuzz tests** for the importers that read files from strangers (OpenLyrics, ChordPro, OSIS/USFX, PowerPoint text,
  backup zips).
- **Planning features** churches ask for once they use it: rehearsal mode (a second PC following the plan without
  the projector), shared plans between two laptops (export/import of a plan with its media).

## Not planned
- Telemetry or crash uploads (see [PRIVACY.md](../PRIVACY.md)): diagnostics stay something the user exports.
- A cloud account or sync service: the app must run a service with no internet.
- macOS / Linux builds: no maintainer can test them on real church hardware yet (the code is portable; contributions
  with a tester welcome).
