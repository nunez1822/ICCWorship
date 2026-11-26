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

### TC-BAK-02 · Restore replaces data with the backup  `P0`
**Pre:** TC-BAK-01
**Steps**
1. Delete a song **and** add a new song "Después de la copia". Note the PIN (Settings).
2. **Restore…** → accept confirm → `queueOpenFiles([backup.zip])` must be queued **before** clicking.
**Expected**
- The confirm says the restore **replaces** all data (pasted Bible verses and anything imported after the backup too)
  and that this computer's screen, remote and PIN settings are kept.
- Operator reloads; the deleted song is back and "Después de la copia" is **gone** (replace, not merge).
- The PIN is unchanged. A safety zip "before-restore-…" appears in the backups list.
- The projector and stage windows were not reloaded (what was live stays on screen).

### TC-BAK-03 · Automatic backups  `P2`
**Expected**
- Backups list shows "auto-YYYY-MM-DD-HHmm.zip" for today after launch (older "auto-YYYY-MM-DD.zip" files from
  1.0 are still listed and restorable).
- With the app left open, a new one appears about every hour **only if something was saved** since the last one,
  and never while something is live. Old ones are pruned: the newest per day for the last 14 days that have a backup (not calendar days) plus the last 6.

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
- With the daily check on and a newer release out, the automatic message "ICCWorship x.y.z is available" has a
  **Download page** button that opens the GitHub releases page.

### TC-SET-10 · Graphics acceleration switch  `P2`
**Steps**
1. Settings → About → tick "Turn off graphics acceleration". Quit and relaunch (`--keep`). Show a video and a song.
**Expected**
- The setting is kept; the app starts and shows slides and video normally (the "graphics" line in
  `system.json` of a diagnostics export says features are software/disabled). Untick it afterwards.

### TC-SET-11 · Help buttons that can't open something say so  `P2`
`npm run build` doesn't create the licences file (only `npm run build:win` / `build:dir` do), so a test run has none.
**Steps**
1. Check `out/THIRD_PARTY_NOTICES.md` does **not** exist (rename it away if it does).
2. Settings → About → 📜 Open-source licences. 3. Help menu (press Alt) → Open-source licences.
**Expected**
- Each time a red toast: "The open-source licences file is missing from this copy of ICCWorship…" /
  "Falta el archivo de licencias de código abierto…" — never a click that does nothing.
- `main.log` has `open-source notices file missing`. Rename the file back if you moved it.
- (Same rule, not driven in tests because it opens Explorer: 📂 Open logs folder and 📂 Open data folder show
  "Could not open the logs/data folder." if Windows can't open it.)

### TC-BAK-04 · Restoring a backup without a PIN keeps the phones working  `P1`
**Pre:** TC-BAK-01; phone connected to `/remote` (TC-REM-02)
**Steps**
1. Copy `backup.zip` and, in the copy's `data/settings.json`, delete `"remotePin"` (an old backup from before PINs).
2. **Restore…** → accept confirm → `queueOpenFiles([<the copy>])` queued before clicking.
3. Settings → note the PIN. Phone → open `/remote#pin=<that PIN>`.
**Expected**
- Step 2: the phone connected with the old PIN is disconnected (it asks for the PIN again on reload).
- Step 3: Settings shows a new 6-digit PIN (never an empty one) and the phone connects with it.

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

### TC-BAK-08 · Data from a newer version opens read-only  `P0`
**Steps**
1. Quit. Set `.e2e-data/data/meta.json` to `{"seeded":1,"schemaVersion":99}`. Launch `--keep`.
2. Show a song (a CCLI usage entry would normally be saved); edit a song title; quit; open `songs.json` and `usage.json`.
**Expected**
- A red bar at the bottom says the data was saved by a newer ICCWorship and changes are **not** saved, with "Open backups folder".
- The service runs normally (projector, remote). Trying to delete a presentation or save a pasted Bible verse
  says "Not saved: this data is open read-only".
- After quitting, `songs.json`, `usage.json` and `meta.json` are byte-for-byte unchanged; no automatic backup was added.

### TC-BAK-09 · Data from 1.0 is upgraded safely  `P1`
**Steps**
1. Quit. Remove `schemaVersion` from `.e2e-data/data/meta.json` (as 1.0 wrote it). Launch `--keep`.
**Expected**
- A `before-migrate-….zip` appears in the backups folder; `meta.json` now has `"schemaVersion": 1`; everything works as before.
- The log has `data upgraded: 1: …`.

### TC-BAK-10 · Automatic backup when the disk is nearly full  `P2` (manual)
**Steps**
1. Run from a small USB stick or a nearly full drive (less than 300 MB free) with `ICCWORSHIP_DATA` pointing there.
**Expected**
- No automatic backup is written; the log says "automatic backup skipped: the disk is nearly full"; saving songs still works.
