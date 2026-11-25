# Changelog

All notable changes to ICCWorship are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Release notes on GitHub are taken from this file.

## [Unreleased]

### Added
- Security policy, privacy statement, code of conduct, support guide, issue and pull-request templates.
- Continuous integration on Windows (type check, unit tests, build, smoke test) for every pull request.
- ESLint and Prettier, checked in CI, so every contributor's code looks the same.
- Releases are built by GitHub Actions, with SHA-256 checksums and signed build provenance; see "Verify your
  download" in the README.
- The app now includes the licences of the open-source software it is built with (`THIRD_PARTY_NOTICES.md`
  in the install folder, next to `ICCWorship.exe`).
- The installed app is hardened with Electron fuses: it only loads its own integrity-checked `app.asar` and ignores
  `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect`.

### Removed
- The untested macOS and Linux build targets. ICCWorship is a Windows app.

### Fixed
- The Live page's preview of a selected item that isn't live yet now updates when the default theme or the CCLI
  license number changes, and the plan editor's item preview updates when songs, media, themes, Bible versions,
  the default theme or the CCLI license number change.
  Switching the screen language (EN / ES / Both) no longer rebuilds either preview, so a previewed countdown
  keeps its time.
- Selecting another item on the Live page no longer shows the previous item's slides under the new title while
  the new preview is being prepared. Clicking one of those thumbnails could send the new item live at the
  wrong slide.
- If a preview can't be prepared, the operator now sees a message instead of a stale or empty preview.
- The README now says Node.js 22.12 or newer is needed to build (Electron 45 requires it).
- The README now explains that the portable version keeps its data in the PC's `Documents\ICCWorship` folder.

## [1.0.0] - 2026-11-24

First public release: bilingual (Spanish/English) songs, Bible (KJV and Reina-Valera 1909 built in, paste-in
LBLA and other copyrighted versions), video, PowerPoint/PDF, themes, service plans, people and teams, phone
remote, stage display, backups.

[Unreleased]: https://github.com/nunez1822/ICCWorship/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nunez1822/ICCWorship/releases/tag/v1.0.0
