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

### TC-SET-09 · A port that can't be used is explained  `P2`
**Steps**
1. Settings → Phone remote & stage display → port field: type `80` → Enter. 2. Type `70000` → leave the field.
**Expected**
- Each time: error toast "Port 80 can't be used. Use a number from 1024 to 65535; the port stays 7272." /
  "No se puede usar el puerto 80…"; the field shows 7272 again and phones stay connected.

### TC-SET-10 · Text settings stop at their limit  `P2`
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

### TC-BAK-02 · Restore brings data back  `P0`
**Pre:** TC-BAK-01
**Steps**
1. Delete a song. 2. **Restore…** → accept confirm → `queueOpenFiles([backup.zip])` must be queued **before** clicking.
**Expected**
- Operator reloads; the deleted song is back. A safety zip "before-restore-…" appears in the backups list.

### TC-BAK-03 · Automatic daily backup  `P2`
**Expected**
- Backups list shows "auto-YYYY-MM-DD.zip" for today after launch.

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
