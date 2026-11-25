# 02 · Live presentation

Default start: welcome finished (English), Live page, sample plan selected.

### TC-LIVE-01 · Go live on a song  `P0` 📸
**Steps**
1. Double-click **Holy, Holy, Holy** in the plan list.
**Expected**
- The item row shows a red **LIVE** pill; top bar shows "ON AIR" and the item name.
- Centre grid shows 4 slides (Verse 1–4); slide 1 has a red border.
- Projector tab: Spanish lines on top ("¡Santo! ¡Santo! ¡Santo! Señor omnipotente,"), a thin divider,
  English below in italic gold ("Holy, holy, holy! Lord God Almighty!").
- Footer on the projector reads "Santo, Santo, Santo / Holy, Holy, Holy — Reginald Heber …" **once** (not duplicated).

### TC-LIVE-02 · Next / previous and rolling into the next item  `P0`
**Pre:** TC-LIVE-01
**Steps**
1. Press `Space` 3 times. 2. Press `Space` once more. 3. Press `←`.
**Expected**
- After step 1 the projector shows Verse 4. After step 2 **A Mighty Fortress** is live at slide 1.
- After step 3 Holy, Holy, Holy is live again at its **last** slide (Verse 4).

### TC-LIVE-03 · Screen language keys  `P0` 📸
**Pre:** a song is live
**Steps**
1. Press `1`, check projector. 2. Press `2`, check. 3. Press `3`, check.
**Expected**
- `1` → English only; `2` → Spanish only; `3` → both stacked (Spanish on top).
- The ES / EN / ES + EN switch in the top bar follows the key presses.

### TC-LIVE-04 · Black, clear text, logo, clear all  `P0`
**Pre:** a song is live
**Steps**
1. `B` → check projector → `B`.  2. `C` → check → `C`.  3. `L` → check → `L`.  4. `Esc`.
**Expected**
- B: projector fully black; Live monitor shows "Black" pill and the top bar "⬛ Screen is black". Pressing again restores the slide.
- C: background stays, lyrics disappear. L: black screen with church name "E2E Test Church" in gold.
- Esc: no slide live (background only), top bar shows "Off air".

### TC-LIVE-05 · Click a thumbnail of a non-live item  `P1`
**Steps**
1. Single-click **Doxology** (do not double-click). 2. Click its slide thumbnail.
**Expected**
- Step 1 shows Doxology's slides in the grid without changing the projector.
- Step 2 puts Doxology live at that slide.

### TC-LIVE-06 · Countdown item  `P1`
**Steps**
1. Plans → edit the Countdown item (⚙) → "Count down for (minutes)" = 2 → Save.
2. Live → double-click **Countdown**.
**Expected**
- Projector shows "El servicio comienza en / Service begins in" and a clock near 2:00 that decreases every second.

### TC-LIVE-07 · Sermon notes fill-in-the-blank  `P1`
**Steps**
1. Double-click **Sermon / Prédica**. 2. Press `Space` twice.
**Expected**
- Slide 1: "El amor de Dios es ____ y ____" (two runs of underscores instead of the words).
- After 1st Space "personal" appears; after 2nd Space "sacrificial" appears.

### TC-LIVE-08 · Next item / previous item shortcuts  `P1`
**Steps**
1. Go live on Welcome. 2. `Ctrl+→`. 3. `Ctrl+←`.
**Expected**
- Step 2 jumps to Holy, Holy, Holy slide 1 (skips remaining slides). Step 3 returns to Welcome.

### TC-LIVE-09 · Item and service timers  `P2`
**Steps**
1. Go live on Doxology (planned 2 min). Wait ~10 s.
**Expected**
- "Item / 2m" timer counts up from 0:00; "Service" timer is running. Double-clicking the Service timer resets it to 0:00.

### TC-LIVE-10 · Announcement auto-advance loop  `P2`
**Steps**
1. Plans → edit Announcements → "Auto-advance every N seconds" = 3 → Save.
2. Live → double-click Announcements, wait 8 s.
**Expected**
- The projector alternates between "Reunión de Oración" and "Despensa de Alimentos" every ~3 s and loops.

### TC-LIVE-11 · Plan switcher and empty state  `P2`
**Steps**
1. Plans → create a **Blank plan** for a date. 2. Live → choose it in the plan dropdown.
**Expected**
- Plan list is empty with a helpful message; choosing the original plan restores its items.
