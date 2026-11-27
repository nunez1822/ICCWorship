# 18 · A real Sunday: full-service scenarios

End-to-end journeys that combine many features the way a church uses them. Each one is long;
run them before a release. Check the projector, stage and phone at every marked step.

### TC-DAY-01 · Whole service from the keyboard  `P0` 📸
**Pre:** fresh, welcome done; stage window open (Settings); phone `/stage#pin=<PIN>` open.
**Steps**
1. Live → double-click **Countdown**. Let it run 10 s.
2. Use only `Ctrl+→` to move item to item and `Space` within items, through to **Closing prayer**.
3. On the Sermon item press `B`, wait, `B`. On John 3:16-17 press `2` then `3`.
**Expected**
- Every item reaches the projector with the right content; the stage "Now / Next" is always correct.
- Item timer resets at each item; service timer keeps counting.
- After the last slide: "End of plan"; extra `Space` does nothing.
- Reports (To = plan date): Holy, Holy, Holy, A Mighty Fortress, Doxology each Times = 1.

### TC-DAY-02 · Volunteer runs everything from the phone  `P1`
**Steps**
1. Phone remote only (don't touch the operator): Plan tab → Countdown; ▶ through the whole plan; send "Slow down" to stage; screen message `Bienvenidos`; Black/Black; ES/EN/ES+EN.
**Expected**
- Every action reaches projector/stage within ~1 s; the operator window mirrors it; no reload of the phone page needed.

### TC-DAY-03 · Last-minute changes during the countdown  `P0`
**Steps**
1. Countdown live. Without leaving it:
   a. Change the Scripture item from John 3:16-17 to `Romanos 8:28`.
   b. Add a new song after the Sermon (Amazing Grace).
   c. Change the announcement's text.
   d. Switch the plan's Doxology item to the Sunrise theme.
2. Continue the service to the end.
**Expected**
- Countdown never interrupted (projector keeps counting).
- Each changed item goes live with its **new** content/theme; Amazing Grace appears after the Sermon.

### TC-DAY-04 · English-speaking guest preacher  `P1`
**Steps**
1. Before the sermon press `1` (English only). Sermon notes with a `[[blank]]`: reveal it.
2. Send stage message "Please wrap up" at the end. Press `3` for the closing song.
**Expected**
- Sermon in English only; the blank reveals on the projector, not before.
- Stage shows the message (projector doesn't); closing song back in both languages.

### TC-DAY-05 · English-first youth service  `P1`
**Steps**
1. Settings → bilingual order English first. Go live on a song, a scripture, a nursery message and the announcements.
2. Check projector, stage and phone preview.
**Expected**
- English on top everywhere (lyrics, verses, message banner, footer order); Spanish below in the second-language style.
- Switch back to Spanish-first: all update, including a nursery message already on the projector (it reorders at
  once). Pressing `1` / `2` shows that message in one language only, like the slides.

### TC-DAY-06 · Saturday rehearsal doesn't double-count CCLI  `P1`
**Steps**
1. Go live on the plan's three songs (rehearsal, any day before the plan's date).
2. Go live on them again (the "service").
3. Reports, To = plan date.
**Expected**
- Each song Times = 1 for that service date (rehearsal + service = one use).
- A song shown ad hoc from the Songs page on another day is logged separately under that day.

### TC-DAY-07 · Two services the same day  `P1`
**Steps**
1. Duplicate the plan, rename it "Servicio 2", same date, start 13:00.
2. Run a song in each plan.
**Expected**
- Live page dropdown distinguishes both plans (title/time); switching between them works.
- Record how Reports counts a song used in both services the same day (expected per CCLI: 2 uses).

### TC-DAY-08 · Wedding / special event from a blank plan  `P2`
**Steps**
1. New plan from **Blank**, type Special event: Section header "Ceremonia", Scripture `1 Corintios 13:4-7`, Image (sample.jpg), Song, Prayer, Countdown to a time 2 minutes ahead.
2. Present it.
**Expected**
- Everything works without the sample template; countdown reaches 0:00 cleanly.

### TC-DAY-09 · Bilingual operator team  `P1`
**Steps**
1. Operator A uses the app in Español (App → Español); prepare a plan and go live.
2. Switch the app to English mid-service (operator B takes over).
**Expected**
- Switching the **app** language never changes the **screen** language or the live slide.
- Toasts, confirm dialogs and error messages appear in the current app language (check: delete a song → confirm text; import a broken file → error).

### TC-DAY-10 · After the service  `P1`
**Steps**
1. Plan → Attendance & notes: attendance `120`, offering `1,234.56` (try typing with a comma).
2. Reports → set **From** / **To** to this year (the default range ends today, and next Sunday's service is after
   it); export CCLI CSV; Settings → Back up now.
3. Close the app with the window ✕ and relaunch `--keep`.
**Expected**
- Offering stored as 1234.56 (or a clear validation message — never silently 1 or 0).
- Reports show the service; CSV has the songs; backup zip created; everything still there after relaunch.

### TC-DAY-11 · The choir sings with a backing track  `P1`
**Pre:** "Track Test" with a backing track in today's plan (TC-PLAN-13 steps 1–2), Sound output chosen (TC-SET-13)
**Steps**
1. Go live with the song from the plan. 2. Advance the lyrics with `Space` while the music plays.
3. Past the last slide, let the outro play; press `Space` to go on.
**Expected**
- The music starts with the first slide, plays under every slide, keeps going after the last slide (outro), and the
  next item comes up on the next `Space`. No silence, no restart, no toast.

### TC-DAY-12 · The choir sings with a timed backing track  `P1`
**Pre:** "Track Test" with recorded timing (TC-SONG-17), in today's plan with the track on (TC-PLAN-13 steps 1–2)
**Steps**
1. Go live with the song from the plan; the volunteer presses nothing during the song. 2. After the last line, while
   the music still plays: `Space` (the outro: text off, music finishing), then `Space` again (the next item).
**Expected**
- Intro without text, every slide on time by itself; the first `Space` after the last line gives the outro, the
  second the next item (by design: one press never skips the outro). The stage display counted the choir in.
- During the outro the stage's **Next** shows "⏭ <next item>", not the last lyric slide.
