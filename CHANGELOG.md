# Changelog

All notable changes to ICCWorship are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/). Release notes on GitHub are taken from this file.

## [Unreleased]

### Security
- The app's windows no longer learn the names of the computer's microphones and cameras (they never could use
  them). Listing and choosing the sound output works as before.
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
- The app's windows load their pages from the app's own `app://iccworship` address instead of `file://`, which serves
  only the app's built pages. The last Electron fuse (extra `file://` privileges) is now off too.
  *Upgrading from 1.0:* the stage window's **Chords** toggle starts off once (it was remembered under the old
  address); turn it on again if the band uses it.
- Developer and test switches (environment variables) are ignored by the installed app.
- Phones and stage screens only load slide images from the app's own links, and imported song and Bible text
  is cleaned of markup more thoroughly (findings of GitHub's CodeQL scan).
- Logs no longer copy error messages that can contain a file's text or name (a damaged Bible file, a
  presentation that failed to convert, a media file): they record only short error codes.
- Logs no longer record the IP addresses of phones and stage screens that connect.
- `pnpm dev` (contributors only): the phone/stage server forwards only the stage and remote pages' own files to
  the development server, so other files in the project folder (including test data) can't be read from the Wi-Fi.
- At most 32 phones and stage screens can be connected at once. One more is told so, instead of "Wrong PIN",
  and connects by itself as soon as a place is free.

### Added
- **The media library keeps its own copy** of the pictures, videos and sound you add, and of the logo, in
  `Documents\ICCWorship\media` (like EasyWorship and ProPresenter). Moving or deleting the original file no longer
  breaks a slide or a background, and **Back up now** includes them, so a restore on a new computer brings them
  back. Deleting an item from the library removes its copy, unless a plan slide, the logo or a slide on screen still
  uses it
  (replacing the logo removes the old one's copy the same way). Turn it off in
  Settings → Backup for a very large video library on another drive (items then link to the original file, as
  before). A backup too big for one file, or for the USB stick (also one that fills up while it is written), leaves
  the media out (then the tracks) and says which folders to copy, and where.
  Restoring a backup on the same computer doesn't unpack media files that are already there.
- **"Ready for Sunday?"** (Live page → ✅): one click before the service checks the plan (deleted songs or media,
  video and picture files that moved, Bible versions), the projector window and second screen, the sound output,
  the phone remote and stage display, the logo file, and how recent the last **Back up now** copy is (the automatic
  backups stay on the same computer) — each problem with a button to fix it (the Settings buttons open the section
  that fixes it). A section header's own picture or video is checked too. A projector window that gave up after
  repeated crashes (or shows only black) is caught too, with **Restart projector**.
- Each release also includes a **software bill of materials** (`ICCWorship-x.y.z.sbom.cdx.json`, CycloneDX) listing
  every third-party package inside the app, with a GitHub attestation like the installers'.
- **Automatic updates for the installed version.** With "Check for new versions" on (Settings → About), the
  installed ICCWorship also downloads a new version by itself — it never starts while a service may be running, and
  a download running when one starts is stopped (it is tried again after the service) — and installs it when you
  close the app with nothing on screen, or right away with **Restart now** when nothing is on screen. Closing it
  mid-song, or choosing Quit after the window crashed mid-service, never installs. Untick "Download new versions…" (or the check) to only be told: that also stops a
  download and keeps a downloaded one from installing. The download is checked against the release's SHA-512, and
  no id for your computer is sent. The portable version only tells you.
- **Put it back after a crash.** If ICCWorship closes unexpectedly (a crash, a power cut, Windows restarting for an
  update) during a plan item, the next start offers it back: one click on **▶ Put it back** shows that item again on
  the slide it was on (or the one Esc cleared). Nothing goes on screen by itself, it is put back once, it waits
  while something else is live by then (a slide, a song's intro: Esc, then click again; the logo or black stay up
  over it), and a normal quit — or
  shutting Windows down with no service running — leaves nothing to offer. Choosing Quit after the window crashed
  mid-service offers it back too, and an offer not answered yet is kept through another crash (or a shutdown before
  it was shown).
- **The portable version is truly portable now.** `ICCWorship-Portable-x.y.z.exe` keeps the data, settings,
  backups and logs in an `ICCWorship Data` folder beside the exe, so it runs from a USB stick and leaves nothing on
  the computer. (Before, it used `Documents\ICCWorship` on whichever PC it ran on.)
  *Already have data in `Documents\ICCWorship`* (the installed app, or portable 1.0)? Until there is an
  `ICCWorship Data` folder beside the exe, the portable copy keeps using that data and says how to move it. On a
  write-protected stick it opens the stick's data read-only (a red bar says nothing is saved); with no data and
  nowhere to write, it uses Documents and says so. When a computer also has data in Documents that the portable copy
  doesn't show, it says so once on that computer.
- **Only one ICCWorship runs at a time**, also across the installed and a portable copy: opening a second one says
  the other is already open, instead of starting a second projector window over the live one.
- The main window opens at the size and place it had last time (maximized the first time), never on a screen that
  is no longer connected, nor on the projector's screen.
- **Backing tracks.** No musicians? Give a song an instrumental (Songs → 🎵 Backing track): the music plays through the
  projector window under the lyrics while you advance them. Space on the last slide takes the text off and lets the
  music finish (the outro); the next Space moves on. Esc fades the music out, Space brings lyrics and music back where
  they were; a song started under the Logo stays silent until the cover lifts; a projector restart picks the music up
  where it was. **Show with track** on the Songs page, and per plan item: play it or not, its volume, and "go to the
  next item when finished". Adding a track to a song never turns it on in plans that already have the song. The plan,
  the Live page and the printed run sheet mark songs that play a track (🎧). Tracks are stored small (Opus,
  ~1.2 MB per minute) in `Documents\ICCWorship\tracks`. Songs up to 20 minutes; a longer recording (a whole
  service) is turned away at once, before it is decoded.
- **Lyrics that follow the music** (recorded timing, like ProPresenter's Timeline): Songs → ⏱ Record timing, play
  the track and press Space as each slide should appear, then fine-tune any time. Live, the intro shows no text
  ("first line in 0:08" on the top bar and the stage display, for the choir), each slide comes up with the music, a
  seek moves the lyrics with it, and the volunteer can still move by hand (the music never pulls them backwards). A
  song changed since (another order, more lines) stops following with a message; a typo fix doesn't. "Follow the
  timing" can be switched off on the Live page. While recording, no key moves the live screen.
- **Remove the voice** from a stereo recording to make a backing track — classic center-channel removal (like
  Audacity's "Vocal Reduction" or Audition's "Center Channel Extractor"), **no AI, offline**. Choose Less / Normal /
  More and compare a 20-second sample (Original ⇄ Without voice) before saving. It takes out what is in the center
  (usually the lead voice) between 150 Hz and 8 kHz, so bass and kick stay; backing vocals, reverb and wide voices
  stay too. Mono files and files whose two channels are the same are explained instead of processed. A 6-minute song
  takes a few seconds; the operator window keeps responding.
- **"No sound" is never silent any more.** All sound (videos, audio files) plays through the projector window. If a
  video or audio item goes live while the projector window is off, a message says so with an **Open projector**
  button, and closing the projector while something plays says that the sound stopped.
- FLAC and Opus audio files can be added to the media library and played.
- **Choose the sound output** (Settings → Screens → 🔊 Sound output), e.g. the cable to the sound desk instead of the
  projector's own speakers, with a **Test sound** button. The projector switches to it before anything plays; if that
  output is unplugged, sound plays through the Windows default and a message says so. A restore keeps this
  computer's choice. The app still can't use the microphone or camera.
- **Data versions.** ICCWorship now records which version wrote the data. Data from 1.0 is upgraded
  automatically after a safety backup (`before-migrate-….zip`). Data written by a **newer** version opens
  **read-only**: an older copy (say, a portable one on a USB stick) can still run the service, but changes are not
  saved — a red bar says so. If an upgrade ever fails, the app still opens (read-only, with a message) instead of
  not starting.
- Automatic backups also run **every hour** while the app is open (only if something changed, never while
  something is on screen, never when the disk is nearly full). Kept: the newest of each of the last 14 days the app was used, plus the last 6.
  Pasted or imported Bible verses count as a change, a change saved while a backup is being written is picked
  up by the next one, and half-written backup files left by a power cut are cleaned up.
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
- Formatting and lint checks in CI, so every contributor's code looks the same (now Oxfmt and Oxlint, see Changed).
- Releases are built by GitHub Actions, with SHA-256 checksums and signed build provenance; see "Verify your
  download" in the README.
- The app now includes the licences of the open-source software it is built with (`THIRD_PARTY_NOTICES.md`
  in the install folder, next to `ICCWorship.exe`).

### Changed
- **Data version 2** (backing tracks). Data is upgraded automatically after a safety backup. An older copy of
  ICCWorship (e.g. a portable one) then opens this data **read-only**: it can still run a service but can't save
  changes or make backups that would lose the tracks.
- Backups and backing tracks: **Back up now** includes the backing tracks (take it to another PC). Automatic backups
  leave them out — each track is kept once in `backups\tracks\` instead of in every hourly copy — and restoring an
  automatic backup never deletes tracks (missing ones come back from `backups\tracks\`).
  A track that disappears from `tracks\` while a song still uses it (antivirus, a sync problem, tidying folders)
  comes back from `backups\tracks\` at the next start or hourly backup, and its copy there is never thrown away.
  Unused tracks are only cleaned up when the song list is known to be complete. Tracks found when the sample songs
  are added to an empty data folder (data lost or half synced), or when the song list had to be recovered from an
  older copy or was missing, are never cleaned up until a backup is restored, even after the list is saved again.
  Backups and restores stream the files, so a large track library never has to fit in memory; they check the free
  disk space first, and **Back up now** says when the drive is full instead of failing silently. Too big for one
  backup file (over 4 GB) or for the drive, Back up now leaves the media library out first, then the tracks, and says
  which folders to copy (see Added). Only the newest 2 safety copies that hold all the tracks are kept.
- Contributors: development now uses **pnpm** and **Vite+** (`vp`): one `pnpm check` runs formatting (Oxfmt), lint
  (Oxlint, type-aware) and type checks, replacing npm, ESLint, Prettier and `tsc`. A pre-commit hook fixes formatting.
  See CONTRIBUTING.md.

### Removed
- The untested macOS and Linux build targets. ICCWorship is a Windows app.

### Fixed
- **Data opened read-only (saved by a newer version) no longer pretends to save.** Adding media, editing or deleting
  now says the data is read-only instead of "added", and nothing disappears after a restart.
- **Typing in a dropdown no longer works the projector.** Letters, numbers and Esc typed in a list chosen with Tab
  (to jump to an option) used to turn on Black or the Logo, change the screen language or clear the screen.
- **Space after a song or verse shown with Show now** continues with the plan item after the last one shown, instead
  of starting the plan again at its first item (the countdown).
- The live plan row's **ON AIR** label is translated, and turns grey ("Off air") while the screen is cleared.
- A quick message (nursery, parking…) follows the language order when it is changed while the message is up.
- Double-clicking the item that is already live follows the backing track's timing (or restarts a track that ended)
  instead of jumping to slide 1 while the music plays on.
- The stage's **Next** during a song's instrumental ending shows the next item, and the stage shows both titles of a
  bilingual announcement.
- The red "the projector kept failing" message goes away once the projector is back.
- The plan chosen on the Live page stays chosen if the window reloads.
- A scripture item whose main Bible version is missing shows its second version instead of nothing (with a warning).
- The chosen sound output is found again after a restart, instead of falling back to the default speakers.
- Blank lines in a one-language song section start a new slide, as the editor says.
- Spanish lyrics imported from ChordPro, and Spanish slides from a text-only PowerPoint import, go in the Spanish box.
- Pictures for **Images as slides** are copied into the ICCWorship folder (backups carry them), like PDF pages.
- The same picture or video added under another file name is recognised as already in the library.
- Removing a picture used as a theme's background resets that theme to the default background.
- A missing songs or plans file is reported on screen, not only in the log.
- Backups no longer include the phone remote's PIN. **Back up now** and diagnostics are logged, and **Export
  diagnostics** creates its folder.
- The log's "(last message repeated N times)" line keeps the level of the repeated message.
- Settings: the number of connected phones updates live, and the logo shows its picture instead of an internal path.
- Presentations no longer says PowerPoint isn't installed while it is still looking for it.
- The red read-only bar no longer covers the bottom of the page.
- Plans: a duplicated plan is named "(copy)", a blank plan gets a dated name, deleting the plan on the Live page says
  so, and the run sheet marks deleted items and open team slots.
- Themes: deleting the theme on screen switches to the default at once; long theme names wrap.
- People: the notes field says who reads it; the Team tab counts filled places.
- Reports cover the whole year by default, so the coming Sunday's numbers show.
- LBLA verses: deleting a saved verse asks first; the chosen versions stay when switching tabs; saving over the limit
  still says the verses were saved; an abbreviation of symbols only is refused; a file with too few verses says so.
- The phone remote says when the plan is empty. The media bar can be used from the keyboard.
- **Dialogs take the keyboard focus**, so Enter or Space no longer also presses a button behind them. Tab stays inside
  the dialog, closing it puts the focus back on the button that opened it, Esc closes only the top one of two, and the
  close button is read out in the app's language.
- **A frozen ICCWorship window now says so.** If the main window stops responding (it hangs rather than crashes), a
  message asks **Restart the window** or **Keep waiting** — the projector, the music and the phone remote keep
  running, and the question goes away by itself if the window recovers. Before, it stayed frozen with no way out.
- **The live keys work right after clicking a checkbox, slider or dropdown.** Before, Space ticked the box again
  (e.g. "Loop") instead of moving to the next slide, and ↓ on the Live page's plan list could switch to another plan.
  Controls reached with Tab keep their own keys, for keyboard users.
- **Copy system info** (Settings → About) now waits for the copy to finish and shows an error if it fails, instead of
  always saying "copied".
- An unexpected error now shows the generic error message instead of "[object Object]".
- Importing a damaged JSON Bible now says the file is damaged or incomplete, instead of a technical parser message.
- **Restoring a backup now replaces the data** instead of mixing it with the current data (songs added after the
  backup no longer survived a restore). The backup is fully checked before anything is touched (Bible files
  included), a damaged backup changes nothing, and if replacing fails half-way the previous data is put back.
  Leftover `.bak` copies can no longer bring back data the backup doesn't have, and a backup without its
  `meta.json` no longer replaces the church's custom themes with the built-in ones.
- Data opened read-only (written by a newer version) can't be replaced by restoring a backup; the app says to
  restore it with the newer version.
- A restore (maybe of another computer's backup) keeps **this** computer's screen, phone-remote and PIN settings.
- PowerPoint/PDF slides restored on another computer (another user name or drive) showed as missing. Converted
  slides are now stored relative to the data folder, and slides from 1.0 backups are found too.
- Bible files and backups are written safely (a power cut can't leave half a file); data files are flushed to
  disk before they replace the old version.
- Safety backups (`before-restore-…`) piled up forever; the newest 5 of each kind are kept.
- Backups are smaller: they no longer include the `.bak` copies of files that are already in the backup.
- Changes made just before Windows shuts down, restarts or goes to sleep are saved (they could be lost before).
- Restoring a backup no longer occasionally reported an error although it had worked (also when antivirus or
  OneDrive briefly holds its temporary folder). If a restore fails and the previous data can't be fully put back,
  the message now says so and names the safety backup to restore.
- A backup made while a damaged data file is being read from its `.bak` copy now holds the good data, not the
  damaged file (such a backup could not be restored before).
- The "Not saved: read-only" message pointed to a message "at the top"; the red bar is at the bottom.
- PDFs with JPEG 2000 or JBIG2 images (most scanned PDFs) imported with blank pages; they now show the images.
- `npm run dev` showed blank windows ("Invalid hook call"): Vite loaded two copies of React in development.
- Typing a new port in Settings → Remote no longer restarts the server on every keystroke; it applies on Enter.
- Creating or importing a Bible version whose abbreviation can't be used (no letters or digits, or too long) no
  longer writes a file named ".json"; it now says why instead.
- Restoring a backup keeps this computer's PIN, so phones and stage screens stay connected (even when the backup has
  no PIN or no settings at all), and the menu bar follows the restored language.
- A repeated error message now stays up for its full time instead of disappearing almost at once.
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
- The README now says Node.js 22.22.1 or newer (on Node 22) is needed to build.
- The README now explains where the portable version keeps its data (see Added).

## [1.0.0] - 2026-11-24

First public release: bilingual (Spanish/English) songs, Bible (KJV and Reina-Valera 1909 built in, paste-in
LBLA and other copyrighted versions), video, PowerPoint/PDF, themes, service plans, people and teams, phone
remote, stage display, backups.

[Unreleased]: https://github.com/nunez1822/ICCWorship/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/nunez1822/ICCWorship/releases/tag/v1.0.0
