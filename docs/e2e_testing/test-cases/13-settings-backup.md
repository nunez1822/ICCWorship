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
  and never while something is live. Old ones are pruned: the newest per day for 14 days plus the last 6.

### TC-SET-06 · Export diagnostics  `P1`
**Steps**
1. Settings → About → 📦 Export diagnostics… (queue a save path `.e2e-data/tmp/diag.zip` first). Leave "Include crash dumps" off.
2. Unzip it (Bash: `unzip -l` / `unzip -p`).
**Expected**
- Contains `logs/main.log`, `system.json`, `settings.json`, `data-summary.json`, `README.txt` — no `crash-dumps/`.
- `settings.json` has **no** `remotePin` and no church name; logo/CCLI show only `(set)`.
- No file contains the Windows user name, a song lyric, a person's name or a prayer request (grep for a few you added).
- Help menu (press Alt) has the same Export diagnostics, plus Open logs folder, Report a problem, Keyboard shortcuts.

### TC-SET-07 · Update check is off until turned on  `P1`
**Steps**
1. Fresh install: Settings → About → Updates. 2. Click 🔎 Check now (with internet). 3. Disconnect the network, Check now.
**Expected**
- "Check for new versions once a day" is **unticked** by default; nothing contacts the internet until Check now or the box.
- Step 2 shows "You have the latest version" or an "ICCWorship x.y.z is available" button that opens the GitHub releases page.
- Step 3 shows "Could not check (no internet?)" — no error dialog.

### TC-SET-08 · Graphics acceleration switch  `P2`
**Steps**
1. Settings → About → tick "Turn off graphics acceleration". Quit and relaunch (`--keep`). Show a video and a song.
**Expected**
- The setting is kept; the app starts and shows slides and video normally (the "graphics" line in
  `system.json` of a diagnostics export says features are software/disabled). Untick it afterwards.

### TC-BAK-04 · A backup from a newer version is refused  `P1`
**Setup (node):** take a backup zip and change its `iccworship-backup.json` to `{"app":"ICCWorship","format":1,"schemaVersion":99}`
(or `"format": 99`). **Steps** — Restore… that zip.
**Expected**
- "That backup was made by a newer ICCWorship. Install the latest version…" — nothing changed, no reload.

### TC-BAK-05 · Damaged backup changes nothing  `P1`
**Setup (node):** a backup zip whose `data/songs.json` is `[{"id":` (truncated). **Steps** — Restore… it.
**Expected**
- "That backup is damaged… Nothing was changed." Songs are as before; no `restore-staging-*` folder is left in `.e2e-data/`.

### TC-BAK-06 · Data from a newer version opens read-only  `P0`
**Steps**
1. Quit. Set `.e2e-data/data/meta.json` to `{"seeded":1,"schemaVersion":99}`. Launch `--keep`.
2. Show a song (a CCLI usage entry would normally be saved); edit a song title; quit; open `songs.json` and `usage.json`.
**Expected**
- A red bar at the bottom says the data was saved by a newer ICCWorship and changes are **not** saved, with "Open backups folder".
- The service runs normally (projector, remote). Trying to delete a presentation or save a pasted Bible verse
  says "Not saved: this data is open read-only".
- After quitting, `songs.json`, `usage.json` and `meta.json` are byte-for-byte unchanged; no automatic backup was added.

### TC-BAK-07 · Data from 1.0 is upgraded safely  `P1`
**Steps**
1. Quit. Remove `schemaVersion` from `.e2e-data/data/meta.json` (as 1.0 wrote it). Launch `--keep`.
**Expected**
- A `before-migrate-….zip` appears in the backups folder; `meta.json` now has `"schemaVersion": 1`; everything works as before.
- The log has `data upgraded: 1: …`.

### TC-BAK-08 · Automatic backup when the disk is nearly full  `P2` (manual)
**Steps**
1. Run from a small USB stick or a nearly full drive (less than 300 MB free) with `ICCWORSHIP_DATA` pointing there.
**Expected**
- No automatic backup is written; the log says "automatic backup skipped: the disk is nearly full"; saving songs still works.
