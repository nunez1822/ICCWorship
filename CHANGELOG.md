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
- Logs no longer copy error messages that can contain a file's text or name (a damaged Bible file, a
  presentation that failed to convert, a media file): they record only short error codes.
- Logs no longer record the IP addresses of phones and stage screens that connect.
- `npm run dev` (contributors only): the phone/stage server forwards only the stage and remote pages' own files to
  the development server, so other files in the project folder (including test data) can't be read from the Wi-Fi.
- At most 32 phones and stage screens can be connected at once. One more is told so, instead of "Wrong PIN",
  and connects by itself as soon as a place is free.

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
  in the install folder, next to `ICCWorship.exe`).

### Removed
- The untested macOS and Linux build targets. ICCWorship is a Windows app.

### Fixed
- Changes made just before Windows shuts down, restarts or goes to sleep are saved (they could be lost before).
- Restoring a backup no longer occasionally reported an error although it had worked.
- PDFs with JPEG 2000 or JBIG2 images (most scanned PDFs) imported with blank pages; they now show the images.
- `npm run dev` showed blank windows ("Invalid hook call"): Vite loaded two copies of React in development.
- Typing a new port in Settings → Remote no longer restarts the server on every keystroke; it applies on Enter.
- Creating or importing a Bible version whose abbreviation can't be used (no letters or digits, or too long) no
  longer writes a file named ".json"; it now says why instead.
- After restoring a backup, phones and stage screens use the restored PIN right away (phones still connected with
  the old PIN are disconnected). A backup made before PINs existed gets a new PIN, and the menu bar follows the
  restored language.
- A phone that opens the PC by a name the server doesn't answer (for example with a router's own suffix such as
  `.fritz.box`) now sees a hint in English and Spanish to use the address or QR code from Settings, instead of a
  bare "Forbidden".
- A port outside 1024–65535 in Settings now shows a message instead of silently snapping back. The church name,
  CCLI number and message templates stop at their maximum length instead of ignoring longer text, and a failed
  settings change or new PIN now shows an error.
- Slide images that phones stop downloading half-way (a new slide, a reload, weak Wi-Fi) no longer leave a file
  open in the app each time, which over a long service could make media stop loading.
- The phone remote's message boxes stop at 500 characters, the most a message can have. A longer message used
  to disappear without reaching the screen.
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
