# 06 · Service plans & team

### TC-PLAN-01 · New plan from template  `P0`
**Steps**
1. Plans → **New plan** → start from "Sunday Service / Servicio Dominical" template, pick a date → Create.
**Expected**
- New plan appears under Upcoming with 9 items and that date; it is independent from the template (editing one doesn't change the other).

### TC-PLAN-02 · Start times follow durations  `P0`
**Steps**
1. Start time `10:30`. Change Countdown duration 5 → 10.
**Expected**
- Times column: 10:30, 10:40, 10:43… and the total pill increases by 5 minutes.

### TC-PLAN-03 · Drag to reorder  `P1`
**Steps**
1. Drag "Doxology" above "Holy, Holy, Holy" by its ⋮⋮ handle.
**Expected**
- Order changes and persists after visiting another page. If this plan is live, the Live page list reflects it.

### TC-PLAN-04 · Add every item type  `P0`
**Steps** — use the "Add to the service" buttons:
1. Song (pick from list) 2. Scripture (`Salmos 23:1`) 3. Announcements (fill a title/text in ES+EN) 4. Video / Image
   (needs media, see 07-media) 5. PowerPoint / PDF (needs a presentation) 6. Countdown 7. Sermon notes 8. Prayer
   9. Section header 10. Blank.
**Expected**
- Each item appears with the right icon; the ⚙ editor preview on the right shows sensible slides.
- On a plan dated in a later week, the Countdown preview counts down to **that** date (e.g. "3d 21:37:49"), not to
  tomorrow's time of day.

### TC-PLAN-05 · Item editor  `P1`
**Steps**
1. ⚙ on an Announcement: add a 2nd slide, set theme "Sunrise / Amanecer", notes "Ushers ready" → Save.
2. Go live on it.
**Expected**
- 2 slides with the Sunrise gradient; item notes appear under the Live controls and on the stage display.

### TC-PLAN-06 · Duplicate & save as template  `P1`
**Steps**
1. **Duplicate**. 2. On the copy, **Save as template**.
**Expected**
- A copy (next Sunday) appears; a new entry appears under Templates.

### TC-PLAN-07 · Run sheet PDF  `P1`
**Steps**
1. `queueSaveFile('<repo>/.e2e-data/runsheet.pdf')` → **PDF**.
**Expected**
- File exists and is a non-empty PDF (check with a file tool). Contains times, titles, and footer "Printed with ICCWorship…".

### TC-PLAN-08 · Team assignment & conflict warning  `P1`
**Pre:** add a person "Ana Test" (People page)
**Steps**
1. Plan A → Team → Worship → Leader → **Assign** → Ana Test → Confirmed.
2. Create plan B with the **same date**, assign Ana Test anywhere.
**Expected**
- Plan B shows a yellow "⚠ Busy" pill next to Ana Test (hover = Plan A's title).

### TC-PLAN-09 · Attendance & offering  `P1`
**Steps**
1. "Attendance & notes" → attendance `85`, offering `412.50`.
**Expected**
- Values persist; Reports page shows them (see TC-REP-01).

### TC-PLAN-10 · Present from Plans  `P0`
**Steps**
1. On a plan click **Present**.
**Expected**
- Live page opens with that plan selected in the dropdown.

### TC-PLAN-11 · Delete plan  `P2`
**Steps**
1. 🗑️ on a test plan, accept confirm.
**Expected**
- Plan disappears from the list.

### TC-PLAN-12 · Item editor preview ignores screen-language changes  `P2`
**Pre:** the phone remote is connected (TC-REM-02); the Countdown item is set to "Count down for (minutes)" = 5
(the sample plan counts down to a time of day, which would hide a rebuild).
**Steps**
1. Plans → ⚙ on **Countdown**. Wait ~10 s and note the clock in the editor's Preview (about 4:50).
2. On the phone tap **EN**, then **ES+EN**.
**Expected**
- The editor's Preview clock keeps counting down from where it was. It never jumps back to 5:00.
- The projector switches language as in TC-REM-04.

### TC-PLAN-13 · A song item can play its backing track — or not  `P1`
**Pre:** TC-SONG-12
**Steps**
1. Songs → "Track Test" → **＋ Add to plan**. 2. Plans → open the new item's options.
3. Untick **🎧 Play the backing track**, Save; double-click it on the Live page.
**Expected**
- Step 1: the plan row shows 🎵🎧 (tooltip "Plays the backing track"), also in the Live page's plan list and the run
  sheet PDF ("🎧 backing track").
- Step 2: the options show **Play the backing track** (ticked), **Go to the next item when finished** and a volume.
- Step 3: the 🎧 is gone and the song goes live with lyrics only (`video` undefined).

### TC-PLAN-14 · Adding a track to a song never changes existing plans  `P0`
**Pre:** "Holy, Holy, Holy" is in the sample plan (added before it had a track)
**Steps**
1. Give "Holy, Holy, Holy" a backing track (TC-SONG-12 steps). 2. Double-click its item in the sample plan.
**Expected**
- No 🎧 on that plan row; the song goes live with lyrics only — a Sunday with a live band is not surprised by music.
- Adding the song to a plan **now** gives an item that does play it (TC-PLAN-13).
