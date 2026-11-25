# Changelog

All notable changes to ICCWorship are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Release notes on GitHub are taken from this file.

## [Unreleased]

### Security
- **The phone/stage server can no longer be crashed from the Wi-Fi.** Before, a malformed video range request
  or WebSocket message from any device could stop ICCWorship mid-service.
- **An empty remote PIN no longer lets anyone in.** ICCWorship now always makes sure a PIN exists.
- **The stage display in a browser now needs the PIN**, like the phone remote. It shows notes and the service plan.
  *Upgrading:* open the new 🎤 QR code in Settings once on each stage screen (or type the PIN); it is remembered.
- New PINs have 6 digits and come from a secure random generator. Existing PINs keep working until you press ↻.
- Other websites can no longer reach the phone/stage server through a visitor's phone (DNS rebinding and
  cross-site connections are refused). The remote pages can't be framed by other sites.
- Phones and stage screens no longer receive file paths from the PC (which included the Windows user name).
  Slide images are served through opaque links, and only while they are on screen.
- The app's internal `media://` file access now serves only media files, and the app's windows now:
  - run sandboxed;
  - can't navigate away;
  - accept main-process calls only from the app's own pages.
- Ids and paths coming from the app's pages are checked before any file is written or deleted.
- The installed app has hardened Electron fuses and checks its own files for tampering.
- Developer and test switches (environment variables) are ignored by the installed app.

### Added
- **The projector and stage windows recover by themselves.** If their page crashes or freezes, it restarts in a
  second or two and shows what is live again — a playing video continues where it was. If it keeps failing, the
  projector shows black instead of looping, and **Settings → Screens → 🔄 Restart projector** brings it back.
- If the main window crashes it reloads once by itself; the projector keeps showing what was live.
- A problem on one page of the main window no longer blanks the whole window: that page shows "Try again" while
  the top bar, shortcuts and phone remote keep working.
- **Help → Export diagnostics** (also in Settings → About): a .zip to attach to a bug report — logs, PC details,
  settings without the PIN. Plus Copy system info, Open logs folder, Report a problem and the open-source licences.
- **Optional update check** (Settings → About, off by default): at most once a day and never during a service.
- **Turn off graphics acceleration** (Settings → About) for PCs whose graphics driver makes the projector black,
  flicker or freeze.
- Logs for troubleshooting in `%APPDATA%\ICCWorship\logs` (no lyrics, people, prayer requests or PIN).
- A menu bar (press Alt): reload, zoom, full screen, website, report a problem.
- A QR code for the stage display in Settings, next to the phone remote's.
- Security policy, privacy statement, code of conduct, support guide, issue and pull-request templates.
- Continuous integration on Windows (type check, unit tests, build, smoke test) for every pull request.
- ESLint and Prettier, checked in CI, so every contributor's code looks the same.
- Releases are built by GitHub Actions, with SHA-256 checksums and signed build provenance; see "Verify your
  download" in the README.
- The app now includes the licences of the open-source software it is built with (`THIRD_PARTY_NOTICES.md`
  in the install folder).

### Removed
- The untested macOS and Linux build targets. ICCWorship is a Windows app.

### Fixed
- Changes made just before Windows shuts down, restarts or goes to sleep are saved (they could be lost before).
- Restoring a backup no longer occasionally reported an error although it had worked.
- PDFs with JPEG 2000 or JBIG2 images (most scanned PDFs) imported with blank pages; they now show the images.
- `npm run dev` showed blank windows ("Invalid hook call"): Vite loaded two copies of React in development.
- Typing a new port in Settings → Remote no longer restarts the server on every keystroke; it applies on Enter.
- Creating a pasted Bible version whose abbreviation has no letters or digits no longer writes a file named ".json".
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
