# 02 · Live presentation

Default start: welcome finished (English), Live page, sample plan selected.

### TC-LIVE-01 · Go live on a song  `P0` 📸
**Steps**
1. Double-click **Holy, Holy, Holy** in the plan list.
**Expected**
- The item row shows a red **ON AIR** pill; top bar shows "ON AIR" and the item name.
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

### TC-LIVE-12 · Preview of a selected item follows a default-theme change  `P1`
**Pre:** default. Doxology uses the default theme (its ⚙ editor shows "Default theme"); Doxology is not live.
**Steps**
1. Live → single-click **Doxology** (do not double-click). Note the thumbnails' background.
2. Themes → **Make default** on a theme with a clearly different background (e.g. "Sunrise / Amanecer").
3. Go back to Live without clicking any item.
4. Afterwards, make the original theme the default again.
**Expected**
- After step 3 Doxology is still selected and its thumbnails already use the new default theme's background;
  no need to click another item and back.
- The projector did not change.

### TC-LIVE-13 · Switching items never shows the previous item's slides  `P1`
**Pre:** default; Holy, Holy, Holy and John 3:16-17 are not live.
**Steps**
1. Single-click **Holy, Holy, Holy** and wait for its verse thumbnails.
2. Single-click **John 3:16-17**, and take a snapshot straight away.
3. Click John 3:16-17's first thumbnail.
**Expected**
- At every moment after step 2 the middle column shows either "⏳ Working…" or John 3:16-17's verse slides,
  never Holy, Holy, Holy's verses under the John 3:16-17 title.
- Step 3 puts **John 3:16-17** live at slide 1.

### TC-LIVE-14 · Screen language keys don't rebuild a previewed item  `P2`
**Pre:** Plans → ⚙ on the Countdown item → "Count down for (minutes)" = 5 → Save (the sample plan counts down
to a time of day, which would hide a rebuild). Welcome is live.
**Steps**
1. Single-click **Countdown** (do not double-click). Wait ~10 s and note the preview clock (about 4:50).
2. Press `2`, then `3`.
**Expected**
- The preview clock keeps counting down from where it was. It never jumps back to 5:00, and the thumbnails don't
  flicker or reload.
- The projector switches language as in TC-LIVE-03.

### TC-LIVE-15 · A song's backing track plays under all its lyric slides  `P0`
**Pre:** TC-SONG-12; projector on
**Steps**
1. Songs → "Track Test" → **🎵 Show with track**. 2. Go to Live; press `Space` twice.
**Expected**
- The music plays from the projector: `window.api.live.get()` → `video.track === true`, `video.playing === true`, and
  `videoProgress.current` grows between two reads 1 s apart — on every slide (it doesn't stop when the slide changes).
- The Live page media bar says "🎵 Backing track" and has no Loop box.

### TC-LIVE-16 · Esc stops the music; Space brings the lyrics and the music back  `P1`
**Pre:** TC-LIVE-15, music at about 0:04
**Steps**
1. `Esc`. 2. `Space`.
**Expected**
- Step 1: the projector fades the music out within about a second (no hard cut); `video` is gone from the live state.
- Step 2: the same slide comes back and the music continues near where it was (`video.seekTo` ≈ the position at Esc).

### TC-LIVE-17 · A song started under the Logo stays silent until the cover lifts  `P1`
**Pre:** "Track Test" in the active plan with "Play the backing track" on (TC-PLAN-13 steps 1–2)
**Steps**
1. Press `L` (logo). 2. Double-click the "Track Test" plan item. 3. Press `L` again.
**Expected**
- Step 2: `video.playing === false` (nothing heard while the audience sees the logo). Step 3: the music starts.

### TC-LIVE-18 · "Go to the next item when finished"  `P1`
**Pre:** TC-PLAN-13 steps 1–2, with **Go to the next item when finished** ticked in the item's options
**Steps**
1. Double-click the "Track Test" item and let the 12 s track play to its end.
**Expected**
- The next plan item goes live by itself. Without the box ticked, the music just stops and the lyrics stay.

### TC-LIVE-19 · Space on the last slide lets the music finish (outro)  `P1`
**Pre:** TC-LIVE-15
**Steps**
1. Press `Space` until the last lyric slide, then once more. 2. `←`. 3. `Space`, `Space`.
**Expected**
- Step 1: the text goes off but the music keeps playing; the top bar shows "🎵 Music playing" (not "Off air") and the
  media bar "🎵 Music still playing — Space = next item". `live.get().outro === true`.
- Step 2: the last slide comes back. Step 3: the outro again, then the next plan item.

### TC-LIVE-20 · Entering a song part-way waits for P  `P2`
**Pre:** TC-PLAN-13 steps 1–2 (the track plays in the plan); the track has **no** recorded timing (run before
TC-SONG-17, or use another song — a timed track entered part-way starts at that slide's own start and plays, see
TC-LIVE-27); another item, not "Track Test", was live last (right after `Esc` on "Track Test" itself, bringing it back
resumes its music where it was, as in TC-LIVE-16)
**Steps**
1. Click the "Track Test" item, then double-click its 3rd thumbnail (not the first).
**Expected**
- The 3rd slide is on screen, the music is paused at 0:00 and the media bar says "⏸ Music paused — press P to play".
  `P` starts it.

### TC-LIVE-21 · Clicking another slide of the live song keeps the music going  `P2`
**Pre:** "Track Test" live from its plan item, music at about 0:05
**Steps**
1. Double-click the live "Track Test" plan item again, then click its 2nd thumbnail.
**Expected**
- The slides change but the music doesn't restart (`videoProgress.current` keeps growing from ~5).

### TC-LIVE-22 · The lyrics follow the music (recorded timing)  `P1`
**Pre:** TC-SONG-17 (timings 2 / 5 / 8)
**Steps**
1. Songs → "Track Test" → **🎵 Show with track**. Read `window.api.live.get()` every 0.5 s for 10 s.
**Expected**
- Until ~2 s: no text (`slideIndex −1`, `intro.firstAt === 2`); the top bar says "🎵 Intro — first line in 0:0x" and
  the media bar "🎵 Intro — first line in … (Space shows it now)".
- Then slide 1 at ~2 s, slide 2 at ~5 s, slide 3 at ~8 s (each up to 0.25 s early), with no key pressed.
- The Live page media bar has **⏱ Follow the timing** ticked.

### TC-LIVE-23 · Moving by hand while it follows  `P1`
**Pre:** TC-LIVE-22 running, before 5 s
**Steps**
1. At ~3 s press `Space` (slide 2 early). 2. At ~6 s press `←` (back to slide 1).
**Expected**
- Step 1: slide 2 shows at once; when the music reaches 5 s nothing changes (it's already there).
- Step 2: slide 1 stays up (the music never pulls the lyrics backwards or forwards to an old start); at 8 s slide 3
  comes up by itself.

### TC-LIVE-24 · Seeking moves the lyrics with the music  `P1`
**Pre:** TC-LIVE-22 running, after 8 s
**Steps**
1. Click the media bar's progress line at about 50% (≈ 6 s). 2. Click near the start (≈ 1 s).
**Expected**
- Step 1: slide 2 shows. Step 2: back to the intro (no text, "first line in …").

### TC-LIVE-25 · The intro and the choir's countdown  `P1`
**Pre:** TC-SONG-17; stage display open
**Steps**
1. **🎵 Show with track**. 2. `←` during the intro. 3. `Space` during the intro.
**Expected**
- The projector shows no text during the intro; the stage display shows "🎵 First line in 0:0x" counting down.
- Step 2: still the intro (Show with track has no plan item before it; see TC-LIVE-32). Step 3: slide 1 shows at once.

### TC-LIVE-26 · Follow the timing off  `P2`
**Pre:** TC-LIVE-22 running
**Steps**
1. Untick **⏱ Follow the timing** before 5 s. 2. Wait until 9 s. 3. Tick it again.
**Expected**
- Step 2: nothing moves by itself (`live.get().followOff === true`); `Space` still works.
- Step 3: it follows again from the next start in the music (no jump to "where the music is now").

### TC-LIVE-27 · Going from one track song to another: the old track only fades out  `P1`
**Pre:** two songs with backing tracks ("Track Test" and a second one made the same way, TC-SONG-12), both in the
active plan with "Play the backing track" on
**Steps**
1. Double-click "Track Test" and let its track play to the end (or press `P` to pause it). 2. Double-click the
second song's item (if its timing is recorded, enter it part-way so it starts with a seek).
**Expected**
- Only the second song's track is heard; the first one never starts again from 0:00, and never jumps to the second
  song's start point, while it fades. `videoProgress.src` is the second track's url.

### TC-LIVE-28 · The top bar says "Off air" once the outro's music has finished  `P2`
**Pre:** TC-LIVE-19 step 1 (the outro playing), the item without "Go to the next item when finished"
**Steps**
1. Let the track play to its end.
**Expected**
- While it plays: "🎵 Music playing". After it ends (`live.get().video.playing === false`): the top bar says
  "Off air", not the gold Music pill.

### TC-LIVE-29 · Starting a song again right after Esc starts its music from the top  `P1`
**Pre:** "Track Test" live from its plan item, music at about 0:08
**Steps**
1. `Esc`, then within a second double-click the "Track Test" plan item again.
**Expected**
- The music starts again from 0:00 (`videoProgress.current` < 2 shortly after), under slide 1 or the intro — it
  doesn't carry on from about 0:08. (Esc, then `Space` instead still continues near 0:08, as in TC-LIVE-16.)

### TC-LIVE-30 · The "Music still playing" hint goes away when the outro's music ends  `P2`
**Pre:** TC-LIVE-19 step 1 (the outro playing), the item without "Go to the next item when finished"
**Steps**
1. Let the track play to its end (or press `P` to pause it).
**Expected**
- While it plays, the Live page says "🎵 Music still playing — Space = next item". Once
  `live.get().video.playing === false`, that line is gone (the room is silent), as the top bar goes back to "Off air".

### TC-LIVE-31 · Esc then Space keeps a waiting or paused track paused  `P1`
**Pre:** TC-LIVE-20 step 1 (3rd slide live, the music waiting at 0:00 — so a track without recorded timing)
**Steps**
1. `Esc`, then `Space`. 2. Start the music with `P`, press `P` again to pause it at about 0:05, then `Esc`, `Space`.
**Expected**
- Step 1: the 3rd slide comes back and the music is **still** paused at 0:00 ("⏸ Music paused — press P to play") —
  the intro never starts under the verse.
- Step 2: the slide comes back with the music paused at about 0:05 (it doesn't start again over the band).
  (A track that was playing when Esc was pressed still continues, as in TC-LIVE-16.)

### TC-LIVE-32 · ← during a song's intro goes back to the previous plan item  `P2`
**Pre:** a plan whose 2nd item is a song with recorded timing (an intro before the first line)
**Steps**
1. Put item 1 live, press `→` until item 2's intro starts. 2. Press `←` during the intro.
**Expected**
- Step 2: item 1 comes back on its last slide; the intro's music fades out. The phone remote's Prev does the same.

### TC-LIVE-33 · "Ready for Sunday?" checks the plan, screens, sound, phone remote and backups  `P1`
**Pre:** a plan with a song, a video media item and a header (section label, no slides) as the active plan
**Steps**
1. Live page → ✅ (next to ✏️). Read the list; close it.
2. Break things: delete a song the active plan uses; rename the video file a media item in the plan points to (its
   library copy `media/<id>.<ext>` in the data folder; the original file only when "copy into the library" is off);
   close the projector window (Settings → Screens); in Settings choose a sound output, then unplug that device.
3. ✅ again. Click each row's button.
4. Close the checklist, Settings → Backup → **Back up now**, then ✅ again.
5. Make the projector give up (crash its page repeatedly, TC-RES-*), so it shows black (safe mode) or nothing; ✅.
6. Put the files renamed in step 2 back. Give the header (section label) its own picture background in the plan
   editor, then rename that picture's file (its library copy in `media/`); ✅.
7. With the checklist open, press Tab repeatedly, then Shift+Tab; press **F1** (Shortcuts) over it, then Esc once;
   then Esc again.
8. Date the active plan a few days ago (Spanish UI once, English once); ✅.
**Expected**
- 1: "Everything is ready" or warnings only, e.g. "Only one screen is connected…" on a laptop alone, "No “Back up
  now” copy yet…" until **Back up now** has been used on this computer (automatic backups don't count: they stay on
  the same disk). The plan line names the active plan and its item count.
- 2→3: errors, each naming the items: "1 item points to something that was deleted: <song>", "1 item needs a file
  that isn't on this computer…: <media item>", "The projector window is closed…", "The chosen sound output … is not
  connected" (an **error** when the plan plays a video or backing track).
- A scripture item whose Bible version isn't on this computer is an **error** ("1 item would show nothing…"), not a
  warning; a picture behind an announcement slide's text that moved counts as a missing file; a logo file that
  moved says the Logo button would show nothing. A header row with slides of its own (a welcome video) is checked
  like any item; a header without slides (a section label) isn't counted, but its own background file is checked.
- 6: "1 item needs a file that isn't on this computer…: <header title>" (the section label shows a title card on that
  picture when it comes up).
- 4: the backup line is ✅ right away (a backup from Settings counts too, without restarting).
- 5: "The projector window stopped after failing again and again…" (an error) with **Restart projector**, which
  restarts it and re-checks. If opening or restarting the projector fails: "That didn't work. Try again, or open
  Settings → Screens." (a toast, never nothing).
- **Open projector** opens it and the list re-checks itself; **Open plan** opens the plan editor; **Back up now** asks
  where to save, shows the same message as Settings → Backup (also "saved WITHOUT the media library…" when it had
  to leave it out), and the backup line turns ✅; **Settings** opens Settings at the section that fixes it: **Screens**
  for the screens, the sound output and the logo, **Phone remote & stage display** for the phone line.
- 7: Tab and Shift+Tab move only between the checklist's own buttons (never the plan or the buttons behind it). The
  first Esc closes only Shortcuts (the checklist stays); the second closes the checklist, and the focus is back on ✅.
- With the checklist open while a video plays, it doesn't re-check by itself (the buttons stay enabled).
- 8: A plan dated before today says it is for a day that has passed, with the date written out in the app's language
  ("The plan “…” is for Sunday, November 22, 2026, a day that has passed…" / "…es para el domingo, 22 de noviembre de
  2026…"), not `2026-11-22`. Running the check never changes anything on screen.
