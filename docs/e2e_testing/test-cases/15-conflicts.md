# 15 · Conflicts: things happening at the same time

What volunteers actually do mid-service: type while a song is live, fix a typo in the live song,
delete things that are in use, change the plan while it runs, and use the phone and the
keyboard together.

### TC-CONF-01 · Typing never triggers screen shortcuts  `P0`
**Pre:** a song is live on ES + EN
**Steps** — type `b c l p 1 2 3 . ?` and press `Space`, `←`, `Esc` inside each of:
1. Songs search box. 2. A song's lyrics box. 3. Message on screen box. 4. Message to the stage box.
5. Bible reference box. 6. A plan item title. 7. A `<select>` (e.g. Service type) focused with the keyboard.
**Expected**
- The projector never goes black, logo, clear-text or changes language/slide; the help dialog doesn't open.
- Characters appear in the field as typed.

### TC-CONF-02 · Esc in a dialog doesn't clear the live screen  `P0`
**Pre:** a song is live
**Steps**
1. Songs → **Import** (dialog opens; click on the dialog background area so no text box has focus) → press `Esc`.
2. Plans → ⚙ on an item → press `Esc`. 3. Press `?` → `Esc`.
**Expected**
- Each `Esc` closes (or leaves) the dialog **only**; the projector still shows the song and the top bar still says ON AIR.

### TC-CONF-03 · Space after clicking a button advances once  `P1`
**Pre:** a song is live on slide 1
**Steps**
1. Click the **Next ▶** button with the mouse (slide 2). 2. Press `Space` once.
**Expected**
- Slide 3 — not slide 4 (the focused button must not be "clicked" again by Space in addition to the shortcut).
- Same check with **◀ Back** and `Space`/`←`.

### TC-CONF-04 · Fix a typo in the song that is live  `P0`
**Pre:** Holy, Holy, Holy is live on Verse 2
**Steps**
1. Songs → Holy, Holy, Holy → change a word in Verse 2 (ESPAÑOL) → wait 1 s.
2. Live page → look at the projector, then press `Space`, `←`.
**Expected**
- The corrected word reaches the projector at the latest after the next slide change — and the live position stays on Verse 2 (it doesn't jump to slide 1).
- No duplicate/missing slides in the live grid.

### TC-CONF-05 · Delete a song that is live and in the plan  `P1`
**Steps**
1. Go live on a plan song. Songs → that song → **Delete** → accept.
2. Live page: look at the plan item; double-click it; press `Space`.
**Expected**
- The confirm text warns that the song is used in a plan (or the plan item is clearly marked missing afterwards).
- Projector keeps showing the current slide until the operator moves on; no crash; the missing item can be skipped.

### TC-CONF-06 · Delete the default theme  `P1`
**Steps**
1. Duplicate Classic Night → **Make default** → give one plan item that theme (⚙ → Theme) → go live on a song.
2. Delete that theme.
**Expected**
- Projector falls back to a built-in theme (no white/blank background, no crash). Settings' default becomes a built-in theme.
- The plan item that referenced it still opens and goes live.

### TC-CONF-07 · Delete media that is used as a background  `P1`
**Steps**
1. Theme with **Motion video** = sample.mp4 is default; a song is live over it.
2. Media → sample.mp4 → remove from library.
**Expected**
- The song stays readable; background falls back (theme colour/gradient) — no frozen frame, no endless console errors.
- A plan item that used that video shows as missing instead of crashing.

### TC-CONF-08 · Delete the plan that is on the Live page  `P1`
**Steps**
1. Create plan B, select it on the Live page, go live on one of its items.
2. Plans → plan B → 🗑️ → accept.
**Expected**
- Live page switches to another plan (or the empty state); projector keeps the current slide; no crash or blank operator window.

### TC-CONF-09 · Delete a person who is on a team  `P2`
**Steps**
1. Assign "Ana Test" as Worship Leader in a plan. People → delete Ana Test.
**Expected**
- The plan's Team tab shows the slot as unassigned (no "undefined", no crash). Run sheet PDF still exports.

### TC-CONF-10 · Change the plan while it runs  `P0`
**Pre:** sample plan live on item 3 (Holy, Holy, Holy)
**Steps**
1. Plans → add a Song at the end; drag **Doxology** above **A Mighty Fortress**; change Sermon minutes 35 → 40.
2. Back to Live: press `Ctrl+→` repeatedly to the end. Watch the phone remote's Plan tab too.
**Expected**
- The live item is unchanged by the edits.
- `Ctrl+→` follows the **new** order (Doxology before A Mighty Fortress) and reaches the added song.
- Phone plan list and stage "Next" reflect the new order within a few seconds.

### TC-CONF-11 · Phone and keyboard at the same time  `P1`
**Pre:** phone remote connected; a 6-slide song is live on slide 1
**Steps**
1. Tap phone ▶ 3 times quickly while pressing `Space` twice on the operator (≈ same second).
2. Then tap phone ▶ 20 times as fast as possible.
**Expected**
- Step 1 ends on slide 6 (5 moves), or at worst rolls into the next item — but operator, projector, stage and phone all show the **same** slide.
- Step 2 never skips back, never shows two different slides on two screens; no errors.

### TC-CONF-12 · Two phones  `P2`
**Steps**
1. Open the remote on the phone and in a second tab (`browser_tabs new`) with the PIN.
2. Phone 1: ES. Phone 2: ▶. Close tab 2.
**Expected**
- Both phones update from each other's actions; top-bar 📱 count goes 2 → 1 after closing.

### TC-CONF-13 · Hammering buttons at the edges  `P1`
**Steps**
1. Go live on the **last** plan item's last slide; press `Space` 30 times. 2. On the first item's first slide press `←` 30 times.
3. Double-click **Show now** on a song very quickly (4 clicks).
**Expected**
- Stays on the last / first slide; "End of plan" shown; no errors.
- Step 3 shows the song once (no flicker loop, no duplicate usage rows in Reports).

### TC-CONF-14 · Black/logo survive language and video changes  `P1`
**Steps**
1. Video live and playing → press `B` → press `2`, then `3` → press `B` again.
2. Song live → `L` → `Space` → `Ctrl+→` → `L`. 3. Same with `B` instead of `L`.
**Expected**
- Video keeps its play state; language change applies when Black is turned off.
- Black and Logo are screen covers (as in EasyWorship / ProPresenter): while one is up, `Space` / `Ctrl+→` move the
  live slide underneath — the projector keeps showing the cover; the Live grid, stage and phone follow the hidden slide.
- The top bar shows "⬛ Screen is black" / "✝ Logo is showing" while a cover is up; the stage shows the same flag.
- Turning the cover off (`L` / `B`) reveals the slide the operator moved to.

### TC-CONF-15 · Projector window closed while live  `P1`
**Steps**
1. Song live on slide 2. Top bar → **Projector on** (turns off). 2. Press `Space`. 3. Turn projector on again.
4. Close the projector window directly (`browser_tabs close` on output.html).
**Expected**
- Step 3: the projector reopens showing slide 3 immediately (not blank, not slide 1).
- Step 4: the top-bar button switches to **Projector off**; turning it on again works.

### TC-CONF-16 · Recover from an accidental Esc  `P0`
**Pre:** Sermon notes live on its 3rd slide
**Steps**
1. Press `Esc` (clear all). 2. Recover.
**Expected**
- The operator can put the **same** slide (3rd) back on screen in one or two actions (e.g. clicking its thumbnail); the live item is still highlighted so they know where they were.
- Item and service timers are not reset by the Esc.

### TC-CONF-17 · Settings changed during the service  `P2`
**Steps**
1. Logo screen showing (`L`). Settings → change church name, then pick a logo image.
2. Settings → screen language default / bilingual order while a song is live.
**Expected**
- Logo screen updates immediately with the new name, then the image.
- Bilingual order flip updates the live slide immediately.

### TC-CONF-18 · Video or audio goes live with the projector off  `P1`
**Pre:** `sample.mp3` in the library
**Steps**
1. Top bar → **Projector on** (turns it off). 2. Media → Show now on the audio card.
3. Click **Open projector** on the toast.
**Expected**
- Step 2: an error toast "⚠ No sound or picture: the projector window is off…" with an **Open projector** button (not silence).
- Step 3: the projector window opens and the audio plays (`videoProgress.current` advances).

### TC-CONF-19 · Closing the projector while sound plays says so  `P1`
**Pre:** `sample.mp4` playing on the projector (TC-MED-02)
**Steps**
1. Top bar → **Projector on** (turns it off) while the video plays.
**Expected**
- An error toast "⚠ The projector window was closed: the sound stopped…". Turning the projector on again resumes the video.

