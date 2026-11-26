# 13 · Settings, logo & backup

### TC-SET-01 · Church name everywhere  `P1`
**Steps**
1. Settings → Church name `Iglesia E2E`. Press `L` on the Live page.
**Expected**
- Top-left subtitle and the logo screen (no logo set) show "Iglesia E2E".

### TC-SET-02 · Logo image  `P1`
**Steps**
1. `queueOpenFiles([sample.jpg])` → Logo → **Choose**. Press `L`.
**Expected**
- Projector shows the image centered on black. ✕ removes it (back to church name).

### TC-SET-03 · Screens list  `P2`
**Expected**
- Every connected monitor is listed with resolution; the main one marked "main screen". Selecting one moves the projector there
  (only verify visually if launched with `--fullscreen`).

### TC-SET-04 · Bilingual order  `P1`
**Steps**
1. "When showing both languages" → **English on top**; go live on a song with ES + EN.
**Expected**
- English is now the large top text, Spanish the italic secondary.

### TC-SET-05 · Message templates editable  `P2`
**Steps**
1. Add template ES `Prueba {n}` / EN `Test {n}`. Live → number 5 → click it.
**Expected**
- Banner "Prueba 5 / Test 5" (two lines in ES + EN mode).

### TC-SET-06 · A port that can't be used is explained  `P2`
**Steps**
1. Settings → Phone remote & stage display → port field: type `80` → Enter. 2. Type `70000` → leave the field.
**Expected**
- Each time: error toast "Port 80 can't be used. Use a number from 1024 to 65535; the port stays 7272." /
  "No se puede usar el puerto 80…"; the field shows 7272 again and phones stay connected.

### TC-SET-07 · Text settings stop at their limit  `P2`
**Steps**
1. Paste 250 characters into the church name. 2. Paste 600 characters into a message template's English box.
**Expected**
- The church name holds 200 characters and is saved (still there after a reload); the template holds 500.
  Typing past the limit just stops — the field never silently ignores a change.

### TC-BAK-01 · Backup now  `P0`
**Steps**
1. `queueSaveFile('<repo>/.e2e-data/backup.zip')` → **Back up now**.
**Expected**
- Toast "Backup saved (N files, x MB)"; the zip exists and contains `iccworship-backup.json` and `data/songs.json`.
- `iccworship-backup.json` has `"schemaVersion": 2` and `"hasTracks": true` (a manual backup carries the backing tracks).

### TC-BAK-02 · Restore replaces data with the backup  `P0`
**Pre:** TC-BAK-01
**Steps**
1. Delete a song **and** add a new song "Después de la copia". Note the PIN (Settings).
2. **Restore…** → accept confirm → `queueOpenFiles([backup.zip])` must be queued **before** clicking.
**Expected**
- The confirm says the restore **replaces** all data (pasted Bible verses and anything imported after the backup too)
  and that this computer's screen, sound output, remote and PIN settings are kept.
- Operator reloads; the deleted song is back and "Después de la copia" is **gone** (replace, not merge).
- The PIN is unchanged, and a phone on `/remote` before the restore stays connected (the server is not restarted).
  The sound output chosen in Settings → Screens is unchanged too.
  A safety zip "before-restore-…" appears in the backups list ("before-restore-tracks-…" when the backup holds
  backing tracks: then the safety copy holds the current tracks too).
- The projector and stage windows were not reloaded (what was live stays on screen).

### TC-BAK-03 · Automatic backups  `P2`
**Expected**
- Backups list shows "auto-YYYY-MM-DD-HHmm.zip" for today after launch (older "auto-YYYY-MM-DD.zip" files from
  1.0 are still listed and restorable).
- With the app left open, a new one appears about every hour **only if something was saved** since the last one,
  and never while something is live. Old ones are pruned: the newest per day for the last 14 days that have a backup (not calendar days) plus the last 6.
- Pasting, importing or deleting a Bible counts as "something was saved" (it leads to the next hourly backup). Left
  open past midnight with nothing changed, no extra backup is made just because the day changed.
- An `auto-….zip.tmp` older than an hour in `.e2e-data/backups/` (left by a backup that was cut off) is gone after
  the next automatic backup check.

### TC-SET-08 · Export diagnostics  `P1`
**Steps**
1. Settings → About → 📦 Export diagnostics… (queue a save path `.e2e-data/tmp/diag.zip` first). Leave "Include crash dumps" off.
2. Unzip it (Bash: `unzip -l` / `unzip -p`).
**Expected**
- Contains `logs/main.log`, `system.json`, `settings.json`, `data-summary.json`, `README.txt` — no `crash-dumps/`.
- `settings.json` has **no** `remotePin` and no church name; logo/CCLI show only `(set)`.
- `system.json` has `"dataFolder"` showing where the data lives with the user folder written as `%USERPROFILE%`
  (in a test run: the `.e2e-data` path) — not just `<data>` — and `"customDataFolder": true` (false on a normal install).
- No file contains the Windows user name, a song lyric, a person's name or a prayer request (grep for a few you added).
- Help menu (press Alt) has the same Export diagnostics, plus Open logs folder, Report a problem, Keyboard shortcuts.

### TC-SET-09 · Update check is off until turned on  `P1`
**Steps**
1. Fresh install: Settings → About → Updates. 2. Click 🔎 Check now (with internet). 3. Disconnect the network, Check now.
**Expected**
- "Check for new versions once a day" is **unticked** by default; nothing contacts the internet until Check now or the box.
- Step 2 shows "You have the latest version" or an "ICCWorship x.y.z is available" button that opens the GitHub releases page.
- Step 3 shows "Could not check (no internet?)" — no error dialog. `main.log` has `update check failed:` with only a
  short code (`timeout`, a network error code, `http-404`…) — never the text of a web page.
- With the daily check on and a newer release out, the **portable** version shows "ICCWorship x.y.z is available"
  with a **Download page** button that opens the GitHub releases page (the installed version downloads it: TC-SET-15).
- In a dev build (`pnpm e2e:launch`) there is no "Download new versions…" box (only the installed app can update itself).

### TC-SET-10 · Graphics acceleration switch  `P2`
**Steps**
1. Settings → About → tick "Turn off graphics acceleration". Quit and relaunch (`--keep`). Show a video and a song.
**Expected**
- The setting is kept; the app starts and shows slides and video normally (the "graphics" line in
  `system.json` of a diagnostics export says features are software/disabled). Untick it afterwards.

### TC-SET-11 · Help buttons that can't open something say so  `P2`
`pnpm build` doesn't create the licences file (only `pnpm build:win` / `build:dir` do), so a test run has none.
**Steps**
1. Check `out/THIRD_PARTY_NOTICES.md` does **not** exist (rename it away if it does).
2. Settings → About → 📜 Open-source licences. 3. Help menu (press Alt) → Open-source licences.
**Expected**
- Each time a red toast: "The open-source licences file is missing from this copy of ICCWorship…" /
  "Falta el archivo de licencias de código abierto…" — never a click that does nothing.
- `main.log` has `open-source notices file missing`. Rename the file back if you moved it.
- (Same rule, not driven in tests because it opens Explorer: 📂 Open logs folder and 📂 Open data folder show
  "Could not open the logs/data folder." if Windows can't open it.)

### TC-SET-12 · Copy system info  `P2`
**Pre:** default
**Steps**
1. Settings → About → 📋 Copy system info.
2. Paste (Ctrl+V) into any text box, e.g. the song search box; clear it afterwards.
**Expected**
- Green toast "Copied — paste it into your report." / "Copiado — péguelo en su reporte." only **after** the copy is done.
- The pasted text starts `app: ICCWorship x.y.z`, has one `key: value` line per item (`packaged: false`,
  `memoryGB: <number>`, `displays: [...]` as JSON, `dataFolder:` without the Windows user name) and **no** `gpu` line.
- (Not driven in tests: if Windows can't copy, a red toast "Could not copy the system info." — never "Copied".)

### TC-BAK-04 · Restoring a backup without a PIN or settings keeps the phones working  `P1`
**Pre:** TC-BAK-01; phone connected to `/remote` (TC-REM-02). Note the PIN and port (Settings).
**Steps**
1. Copy `backup.zip` and, in the copy's `data/settings.json`, delete `"remotePin"` (an old backup from before PINs).
2. **Restore…** → accept confirm → `queueOpenFiles([<the copy>])` queued before clicking.
3. Make a second copy with `data/settings.json` removed entirely; restore it the same way.
**Expected**
- After each restore Settings shows the same 6-digit PIN and port as before (this PC's PIN is kept, never emptied),
  and the phone stays connected without asking for the PIN again.
- After step 3 the church settings (name, languages…) are back to their defaults, so the welcome dialog shows again
  (no sample songs or plans are added), but the screen, remote and PIN settings are still this PC's.

### TC-BAK-05 · Restore follows the backup's language in the menu  `P2`
**Steps**
1. App in English: Back up now. 2. Settings → language Español. 3. Restore the backup from step 1.
**Expected**
- After the operator reloads, the app and the menu bar (press Alt: "View", "Help"…) are in English again.

### TC-BAK-06 · A backup from a newer version is refused  `P1`
**Setup (node):** make three copies of a backup zip: (1) `iccworship-backup.json` → `{"app":"ICCWorship","format":99}`;
(2) `iccworship-backup.json` → `{"app":"ICCWorship","format":1,"schemaVersion":99}`; (3) `data/meta.json` →
`{"seeded":1,"schemaVersion":99}` (what a real newer version writes). **Steps** — Restore… each.
**Expected**
- All three: "That backup was made by a newer ICCWorship. Install the latest version…" — nothing changed, no
  reload, no new `before-restore-…` zip.

### TC-BAK-07 · Damaged backup changes nothing  `P1`
**Setup (node):** a backup zip whose `data/songs.json` is `[{"id":` (truncated). **Steps** — Restore… it.
**Expected**
- "That backup is damaged… Nothing was changed." Songs are as before; no `restore-staging-*` folder is left in `.e2e-data/`.
- Same result for a backup whose only damaged file is a Bible (`data/bibles/<abbr>.json` truncated to `{"verses":`):
  the Bible pasted on this PC still opens and shows its verses afterwards.

### TC-BAK-08 · Data from a newer version opens read-only  `P0`
**Steps**
1. Quit. Set `.e2e-data/data/meta.json` to `{"seeded":1,"schemaVersion":99}`. Launch `--keep`.
2. Show a song (a CCLI usage entry would normally be saved); edit a song title; quit; open `songs.json` and `usage.json`.
**Expected**
- A red bar at the bottom says the data was saved by a newer ICCWorship and changes are **not** saved, with "Open backups folder".
- The service runs normally (projector, remote). Trying to delete a presentation or save a pasted Bible verse
  says "Not saved: this data is open read-only (see the red bar at the bottom)" — the bar really is at the bottom.
- After quitting, `songs.json`, `usage.json` and `meta.json` are byte-for-byte unchanged; no automatic backup was added.
- Restoring is refused while read-only: see TC-BAK-13.

### TC-BAK-09 · Data from 1.0 is upgraded safely  `P1`
**Steps**
1. Quit. Remove `schemaVersion` from `.e2e-data/data/meta.json` (as 1.0 wrote it). Launch `--keep`.
**Expected**
- A `before-migrate-….zip` appears in the backups folder; `meta.json` now has `"schemaVersion": 2`; everything works as before.
- The log has `data upgraded: 1: …; 2: …` (from 1.1 data — `"schemaVersion": 1` — only `2: …`).

### TC-BAK-10 · Automatic backup when the disk is nearly full  `P2` (manual)
**Steps**
1. Run from a small USB stick or a nearly full drive (less than 300 MB free) with `ICCWORSHIP_DATA` pointing there.
**Expected**
- No automatic backup is written; the log says "automatic backup skipped: the disk is nearly full"; saving songs still works.
- With backing tracks not yet copied beside the backups: none are copied into `backups/tracks/` either (the log says
  "backing tracks not copied beside the backups: the disk is nearly full"); they are copied on a later run once
  there is space.

### TC-BAK-11 · Restore doesn't bring back data from leftover .bak copies  `P1`
**Pre:** a fresh data folder (`pnpm e2e:launch`) where no song has been shown live yet, so there is no `usage.json`.
**Steps**
1. `queueSaveFile('<repo>/.e2e-data/early.zip')` → **Back up now** (the zip has no `data/usage.json`).
2. Show two different songs live (each logs CCLI usage, so `usage.json` and `usage.json.bak` now exist).
3. Restore `early.zip`.
**Expected**
- In `.e2e-data/data/` neither `usage.json` nor `usage.json.bak` exists, and no `.bak` is left for any file the backup
  doesn't have. Reports → CCLI shows no usage.
- Any `*.corrupt-*` copies that were in the folder are still there.

### TC-BAK-12 · A backup without meta.json keeps the church's themes  `P1`
**Pre:** a custom theme "Tema propio" exists (Themes page) and was saved before TC-BAK-01's backup.
**Steps**
1. Copy `backup.zip`; in the copy remove `data/meta.json` and set `data/songs.json` to `[]`.
2. Restore the copy.
**Expected**
- "Tema propio" is still on the Themes page next to the built-in themes; no sample songs or sample plan appear.
- `.e2e-data/data/meta.json` exists with a `seeded` time and `"schemaVersion": 2`.

### TC-BAK-13 · No restore while the data is read-only  `P1`
**Pre:** TC-BAK-08 step 1 (data from a newer version, red bar showing).
**Steps**
1. Settings → Backup → **Restore…** any backup (or one from the backups list).
**Expected**
- Red toast "This data is open read-only because a newer ICCWorship wrote it, so no backup can be restored here…"
  ("Estos datos están abiertos en solo lectura…" in Spanish). No reload, no new `before-restore-…` zip, and every
  file in `.e2e-data/data/` is byte-for-byte unchanged.
- (Not driven in tests: data read-only because it could not be *prepared* — no room for the safety backup, or a
  failed upgrade — answers "Your data is open read-only (see the red bar at the bottom)… restart ICCWorship", not
  the "newer ICCWorship" text.)

### TC-BAK-14 · A backup made while a data file is damaged keeps the good data  `P1`
**Steps**
1. `pnpm e2e:launch`, finish the welcome, quit. Copy `.e2e-data/data/songs.json` to `songs.json.bak`, then
   truncate `songs.json` to `[{"id":` (damaged). Launch `--keep`.
2. Songs page: the songs are there (recovered from the `.bak`). **Back up now** to `.e2e-data/tmp/recovered.zip`.
3. Restore `recovered.zip`.
**Expected**
- `unzip -p recovered.zip data/songs.json` is the full, valid song list (not the damaged file).
- The restore succeeds (no "damaged" message); afterwards the songs are all there, `songs.json` is valid, and a
  `songs.json.corrupt-…` copy of the damaged file is still in `.e2e-data/data/`.

### TC-SET-13 · Choose the sound output and test it  `P1`
**Pre:** projector on
**Steps**
1. Settings → Screens → **🔊 Sound output**: open the list. 2. Pick an output other than "Default (Windows)".
3. **🔊 Test sound**. 4. Turn the projector off, **Test sound** again. 5. Pick **Default (Windows)** again.
**Expected**
- The list shows this PC's sound outputs by name (not only "Default"); Windows' "Default -" / "Communications -"
  aliases are not listed twice.
- Step 2: `window.api.live.get().audioOutput.label` is the chosen name (the projector plays through it).
- Step 3: a short beep plays and the toast "🔊 Sound sent to: <name>". Step 4: "Open the projector first…".
- Step 5: `audioOutput` is gone from the live state.
- Choosing an output that isn't connected (`window.api.settings.set({ audioOutputId: 'x', audioOutputLabel: 'Gone' })`,
  then Test sound): the beep still plays (default speakers) and the toast says “Gone” isn't connected; after
  reloading the operator (`location.reload()`: a direct `settings.set` doesn't update the page's copy) the Settings
  list shows "Gone (not connected)" with a warning under it.
- Two outputs with the same name (e.g. two identical USB interfaces): picking the second one saves **its** id
  (`(await window.api.settings.get()).audioOutputId` is the second device's id, not the first's), and the list
  shows the second one as chosen.

### TC-SET-14 · Losing the sound output a second time is told again  `P1` (manual)
**Pre:** a USB sound output chosen in Settings, projector on, a video or backing track playing
**Steps**
1. Unplug the USB output, start the video again. 2. Plug it back in. 3. Unplug it again, start the video again.
**Expected**
- Steps 1 and 3 each show the toast "⚠ The sound output chosen in Settings (“<name>”) isn't connected…" — the
  second loss is never silent. The sound plays through the default speakers both times.


### TC-SET-15 · The installed app downloads an update and installs it only when closed  `P0`
**Automated:** `pnpm smoke` runs the download part against a local test feed ("update found, downloaded and checked
(SHA-512)…", "update never installs while something is on screen"). **Manual** for a real release:
**Steps**
1. Install an older release (`ICCWorship-Setup-<old>.exe`) while a newer one is published. Settings → About →
   tick "Check for new versions once a day"; leave "Download new versions and install them when ICCWorship closes" ticked.
2. Put a song live; click 🔎 Check now. Clear the screen (Esc — the item is still live, paused) and **Clear all**
   so nothing is live; Check now again; wait.
3. Put a song live and click **Restart now** on the toast; clear the screen and click it again.
4. With an update downloaded again (reinstall the old release, steps 1–2): put a song live and **close the window**
   (or Quit in the "window crashed" question); relaunch.
5. With an update downloaded: untick "Download new versions…", then quit with nothing on screen.
6. Untick it while "Downloading… n%" shows; separately, put a song live while it downloads.
**Expected**
- 2: while live, Check now says "ICCWorship x.y.z is available. It downloads when nothing is on screen." and
  nothing downloads; once nothing is live, "Downloading ICCWorship x.y.z… n%", then a toast
  "ICCWorship x.y.z is ready. It installs when you close ICCWorship with nothing on screen." with **Restart now**.
- 3: while live, "Not while something is on screen…"; otherwise the app closes, installs silently and opens the new
  version with all data. Quitting normally with nothing on screen installs it too.
- 4: **nothing installs**: the old version starts again at once (`main.log`: `update x.y.z not installed at this
  quit`). It installs at a later quit with nothing on screen.
- 5: nothing installs; the old version is still there.
- 6: the download stops (`update download stopped: updates turned off` / `something went live`); with updates still
  on, the next check (or Check now with nothing live) starts it again.
- Unticking "Download new versions…" makes Check now show the "is available" button (download page) instead.
- `main.log` has `update check: latest x.y.z (newer)`, `downloading update x.y.z`, `update x.y.z downloaded…` and no
  web page text or URLs (updater errors are logged as short `ERR_UPDATER_…` codes).
### TC-BAK-15 · A manual backup carries the backing tracks; restoring it brings them back  `P1`
**Pre:** a song with a backing track (TC-SONG-12)
**Steps**
1. **Back up now** to `.e2e-data/backup-tracks.zip`. 2. Settings → song → **Remove** the backing track.
3. Restore `backup-tracks.zip`.
**Expected**
- Step 1: the zip has `tracks/<songId>-<digits>.ogg`, stored uncompressed (same size as the file in `.e2e-data/tracks/`).
- Step 3: the song has its backing track again and it plays (Show with track → `videoProgress.current` advances).

### TC-BAK-16 · Automatic backups leave the tracks out but keep one copy beside them  `P1`
**Pre:** a song with a backing track
**Steps**
1. Quit and relaunch with `--keep` (an automatic backup runs at start-up if today has none — delete today's
   `auto-….zip` first). 2. Look in `.e2e-data/backups/`.
3. Remove the song's track (song editor → ⋯ → Remove), restore the newest `auto-….zip`.
**Expected**
- The `auto-….zip` has **no** `tracks/` entries and its manifest says `"hasTracks": false`.
- `.e2e-data/backups/tracks/` holds a copy of the track file (copied once, not again on the next backup).
- Step 3: the restored song points to its track again, and the file is back in `.e2e-data/tracks/` (taken from
  `backups/tracks/`). The log says `backing tracks brought back from backups/tracks: 1`.
- Restoring an automatic backup never deletes tracks that exist now (tracks/ is left as it is).
- The copies never freeze the app: during the hourly backup slides, the phone remote and the projector keep
  responding. A copy that is cut off leaves only a `….ogg.tmp` (never a half `….ogg`) in `backups/tracks/` or `tracks/`.

### TC-BAK-17 · A track a song still uses is never thrown away from backups/tracks  `P1`
**Pre:** TC-BAK-16 (the track has a copy in `.e2e-data/backups/tracks/`)
**Steps**
1. Quit. Move the song's track file out of `.e2e-data/tracks/` (as antivirus or a sync tool might).
2. Relaunch with `--keep` (delete today's `auto-….zip` first so the start-up backup runs).
**Expected**
- The track file is back in `.e2e-data/tracks/`, the song plays its track, and the log says
  `backing tracks brought back from backups/tracks: 1`.
- The copy stays in `.e2e-data/backups/tracks/` (never moved to a `gone-<day>` folder while a song uses it).
- (Manual) On a disk with less than the app's minimum free space left after the copy, the track is **not** brought
  back: the log says `backing tracks not brought back from backups/tracks: the disk is nearly full`, and songs and
  plans can still be saved.

### TC-BAK-18 · Sample songs seeded into an empty data folder never cost the church its tracks  `P0`
**Pre:** a song with a backing track whose file is more than 7 days old (set its modified date back), with a copy in
`.e2e-data/backups/tracks/`
**Steps**
1. Quit. Delete `.e2e-data/data/` (as if it were lost or only partly synced), keep `tracks/` and `backups/`.
2. Relaunch with `--keep`. 3. Quit and relaunch with `--keep` again (delete today's `auto-….zip` first).
**Expected**
- The sample songs appear (a first run); the log says "sample songs added while tracks/ already holds backing
  tracks: they are kept" and `data/meta.json` lists the file under `keepTracks`.
- After **both** launches the track file is still in `.e2e-data/tracks/` (the log has no "removed unused backing
  tracks"), and its copy is still directly in `.e2e-data/backups/tracks/` (not in `gone-…`).
- After restoring the newest backup, the song plays its track again (and `keepTracks` is gone from `meta.json`).

### TC-BAK-19 · Back up now says when it can't save  `P1`
**Steps**
1. `queueSaveFile` a path on a drive with less free space than the data and tracks (a nearly full USB stick), or a
   folder that can't be written → **Back up now**.
**Expected**
- A red toast: "Not enough free space on that drive for the backup. Nothing was saved…" (or "The backup could not be
  saved. Check the drive…" for a write error). No `.zip` and no `.zip.tmp` is left at that path. Never silent.

### TC-BAK-20 · A big track library backs up and restores without freezing  `P2` (manual)
**Pre:** 100+ songs with backing tracks (≈ 600 MB in `tracks/`)
**Steps**
1. **Back up now**, then restore that backup. Watch the memory of ICCWorship in Task Manager.
**Expected**
- Both finish; the app's memory doesn't grow by the size of the library (the files are streamed, never all in memory).
  Slides, the phone remote and the projector keep responding.
- A restore when the disk doesn't have room to unpack the backup and keep a safety copy says "There isn't enough
  free disk space to restore this backup safely… Nothing was changed." and changes nothing.
- At most 2 `before-restore-tracks-…` safety zips are kept in the backups list; they don't push out the 5
  data-only `before-restore-…` ones.
- With thousands of slide images in `cache/presentations/` the backup still works (files are opened one at a time).

### TC-BAK-21 · A track library over 4 GB still gets a backup  `P2` (manual)
**Pre:** backing tracks totalling more than 4 GB in `tracks/`
**Steps**
1. **Back up now**. 2. Restore a manual backup that holds tracks.
**Expected**
- Step 1: a blue toast "Backup saved WITHOUT the backing tracks (…): together they are over 4 GB… Copy the folder
  Documents\ICCWorship\tracks to the same drive too." The zip's manifest says `"hasTracks": false`.
- Step 2: the restore works; its safety copy is a data-only `before-restore-…` zip, the backup's tracks are added
  and none of the current tracks are removed.
- If that restore fails while replacing files (hold a data file open in another program so it can't be replaced):
  "your previous data was put back", and the backup's tracks it had added are taken out of `tracks/` again (the log
  says `tracks the failed restore added were taken out again: <n>`); the tracks that were there before all stay.

### TC-BAK-22 · A songs list recovered from an older .bak never costs the church its tracks  `P0`
**Pre:** "Track Test" with a backing track whose file is more than 7 days old (set its modified date back), with a copy
in `.e2e-data/backups/tracks/`; at least one other song
**Steps**
1. Quit. Write `.e2e-data/data/songs.json.bak` as the songs list **without** "Track Test" (an older list), and
   truncate `songs.json` to `[{"id":` (damaged). Launch `--keep`.
2. Edit another song (fix a typo) and save, so `songs.json` is a good file again. Wait for the hourly backup, or
   quit and relaunch with `--keep` after deleting today's `auto-….zip`.
3. Quit and relaunch with `--keep` twice more.
4. Restore the newest backup made **before** step 1.
5. Repeat steps 1–3 with `songs.json` deleted and no `.bak` at all, then one new song added in step 2.
**Expected**
- Step 1: the log says `songs list degraded: every backing track there is now is kept`, and `data/meta.json` lists
  the track file under `keepTracks`.
- After steps 2–3: the track file is still in `.e2e-data/tracks/` (the log never says "removed unused backing
  tracks"), and its copy is still directly in `.e2e-data/backups/tracks/` (not in `gone-…`).
- Step 4: "Track Test" is back and plays its track.
- Step 5: the same, with the log saying `songs list missing: …`.

### TC-BAK-23 · A backup with more than 65,535 files restores every one of them  `P2` (manual)
**Pre:** more than 65,535 files in `data/`, `cache/presentations/` and `tracks/` together (e.g. many imported
presentations)
**Steps**
1. **Back up now**. 2. Restore that backup.
**Expected**
- The restore says it worked, and afterwards the number of files in `cache/presentations/` (and `tracks/`) is the
  same as before: no slide images or tracks are missing. (JSZip writes only the low 16 bits of the file count; the
  restore reads the whole list anyway.)

### TC-BAK-24 · The portable version keeps everything beside its exe  `P1` (packaged)
**Steps**
1. `pnpm build:win`. Copy `dist/ICCWorship-Portable-<version>.exe` into an empty folder (or a USB stick) and run it.
2. Add a song; Settings → About; quit.
3. On a write-protected stick holding that folder (or deny yourself **Write** on the folder in Properties → Security
   → Advanced: the Read-only checkbox on a folder doesn't stop writing), run the exe again.
4. Copy the exe alone to a new folder you can't write to (e.g. a folder under `C:\Program Files` as a standard
   user), with no `ICCWorship Data` beside it, and run it.
5. Copy the exe alone to an empty folder on a PC that already has data in `Documents\ICCWorship` (e.g. from the
   installed app or portable 1.0), and run it.
6. With the installed ICCWorship open, run the portable exe (and the other way round).
**Expected**
- An `ICCWorship Data` folder appears beside the exe with `data\`, `backups\` and `.app\logs\main.log`; nothing new in
  `Documents\ICCWorship` or `%APPDATA%\ICCWorship`.
- About shows that folder as the data folder, marked "portable".
- 3: the song from step 2 is there; a red bar says the folder is write-protected and nothing is saved; About says
  "portable, read-only…". Nothing is written to the stick.
- 4: a toast says the portable ICCWorship can't write to its folder and uses `Documents\ICCWorship` this time;
  About says so too ("portable, but the folder beside the exe can't be written…"), and no empty `ICCWorship Data`
  folder is left behind.
- 5: it opens the data in `Documents\ICCWorship` (no sample songs, the same PIN); a toast says how to move it beside
  the exe; About says "portable, using Documents\ICCWorship…". Creating `ICCWorship Data` beside the exe makes the
  next start portable.
- 6: a message "ICCWorship is already running" / "ICCWorship ya está abierto"; the second copy doesn't start (no
  second projector window).
- `pnpm packaged-check` covers the first expectation automatically ("portable: data, settings and logs are kept
  beside the exe").

### TC-BAK-25 · The media library is in "Back up now" and comes back on another computer  `P0`
**Steps**
1. Add `sample.mp4` and `sample.jpg` to Media (copied into `.e2e-data/media/`); choose `sample.png` as the logo.
   **Back up now**.
2. Delete everything in `.e2e-data/media/`. **Restore** that backup.
3. Make the media folder over 4 GB (manual: big videos), **Back up now**.
4. Back up to a stick smaller than the media library.
**Expected**
- `pnpm smoke` covers 1–2 ("the media library is in the backup and comes back on restore").
- 1: the .zip holds `media/<id>.mp4`, `media/<id>.jpg`, `media/<id>.png` (stored, not recompressed) and its
  `iccworship-backup.json` says `"hasMedia": true`.
- 2: the files are back; the video plays, the image shows, the logo shows. A restore never deletes files from
  `media/` that the backup doesn't have.
- Automatic backups (`auto-…zip`) never contain `media/`.
- 3: "Backup saved WITHOUT the media library…" (the tracks are still in it, unless they are too big too).
- 4 (manual): **Back up now** to a USB stick with less room than the media library but enough for the data → the
  same "saved WITHOUT the media library…" message (never "Nothing was saved"). Too small even for the data and
  tracks → saved without them too; only a stick too small for the data itself fails.
- Restoring a backup on the same PC (media already in `media/`) needs no room for the media again, and doesn't
  touch those files (a video playing meanwhile keeps playing).

