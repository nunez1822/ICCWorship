# Changelog

All notable changes to ICCWorship are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Release notes on GitHub are taken from this file.

## [Unreleased]

### Added
- Security policy, privacy statement, code of conduct, support guide, issue and pull-request templates.
- Continuous integration on Windows (type check, unit tests, build, smoke test) for every pull request.
- ESLint and Prettier, checked in CI, so every contributor's code looks the same.

### Fixed
- The "next item" preview on the Live page and the item preview in the plan editor now update when settings,
  songs, themes or media change, instead of showing the old version until another item is picked.
- The README now says Node.js 22.12 or newer is needed to build (Electron 45 requires it).
- The README now explains that the portable version keeps its data in the PC's `Documents\ICCWorship` folder.

## [1.0.0] - 2026-11-24

First public release: bilingual (Spanish/English) songs, Bible (KJV and Reina-Valera 1909 built in, paste-in
LBLA and other copyrighted versions), video, PowerPoint/PDF, themes, service plans, people and teams, phone
remote, stage display, backups.

[Unreleased]: https://github.com/nunez1822/ICCWorship/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nunez1822/ICCWorship/releases/tag/v1.0.0
