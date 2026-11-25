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
- Phones and stage screens only load slide images from the app's own links, and imported song and Bible text
  is cleaned of markup more thoroughly (findings of GitHub's CodeQL scan).

### Added
- **Data versions.** ICCWorship now records which version wrote the data. Data from 1.0 is upgraded
  automatically after a safety backup (`before-migrate-….zip`). Data written by a **newer** version opens
  **read-only**: an older copy (say, a portable one on a USB stick) can still run the service, but changes are not
  saved — a red bar says so.
- Automatic backups also run **every hour** while the app is open (only if something changed, never while
  something is on screen, never when the disk is nearly full). Kept: the newest of each of the last 14 days the app was used, plus the last 6.
- **The projector and stage windows recover by themselves.** If their page crashes or freezes, it restarts in a
  second or two and shows what is live again — a playing video continues where it was. If it keeps failing, the
  projector shows black instead of looping, and **Settings → Screens → 🔄 Restart projector** brings it back.
- If the main window crashes it reloads once by itself; the projector keeps showing what was live.
- Clear error messages when a backup can't be restored (newer version, damaged file…).
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
- **Restoring a backup now replaces the data** instead of mixing it with the current data (songs added after the
  backup no longer survived a restore). The backup is fully checked before anything is touched, a damaged
  backup changes nothing, and if replacing fails half-way the previous data is put back.
- A restore (maybe of another computer's backup) keeps **this** computer's screen, phone-remote and PIN settings.
- PowerPoint/PDF slides restored on another computer (another user name or drive) showed as missing. Converted
  slides are now stored relative to the data folder, and slides from 1.0 backups are found too.
- Bible files and backups are written safely (a power cut can't leave half a file); data files are flushed to
  disk before they replace the old version.
- Safety backups (`before-restore-…`) piled up forever; the newest 5 of each kind are kept.
- Backups are smaller: they no longer include the `.bak` copies of files that are already in the backup.
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
