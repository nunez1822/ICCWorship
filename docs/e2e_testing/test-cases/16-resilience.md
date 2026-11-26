# 16 · Resilience: crashes, bad files, missing things

Sunday morning failures: the laptop crashes, a data file is damaged, a USB stick with media is
gone, the port is busy, Wi-Fi drops. The app must keep data safe and let the team recover fast.

Stop the app: `taskkill /F /IM electron.exe`. Relaunch keeping data: `pnpm e2e:launch --keep`.

### TC-RES-01 · Hard crash mid-service, relaunch  `P0`
**Steps**
1. Sample plan live on the Sermon item. Songs → change a song title to `Crash Test`; ~1 s later kill the app (`taskkill /F`).
2. Relaunch with `--keep`.
**Expected**
- No welcome dialog; `Crash Test` title was saved; plans, themes and settings intact.
- Live page opens with the same plan selected; the operator can be back on the Sermon item in ≤ 2 actions.
- Projector window opens (off air), phone remote reconnects with the same PIN.

### TC-RES-02 · Kill right after an edit  `P2`
**Steps**
1. Type a new verse line and kill the app **immediately** (< 0.2 s).
**Expected**
- Record whether the last keystrokes survive (writes are debounced 250 ms). Older data must never be lost or corrupted; the file must parse on relaunch.

### TC-RES-03 · Damaged data file is recovered from its backup copy  `P0`
**Steps**
1. Close the app. Overwrite `.e2e-data/data/songs.json` with `{"broken` (keep `songs.json.bak`).
2. Relaunch `--keep`.
**Expected**
- App starts normally with the songs from `songs.json.bak` (only the very last change may be missing).
- Other collections (plans, themes) unaffected. Next save writes a valid `songs.json` again.

### TC-RES-04 · Damaged file **and** damaged backup  `P1`
**Steps**
1. Close the app. Overwrite both `songs.json` and `songs.json.bak` with garbage. Relaunch `--keep`. Make one edit.
**Expected**
- App starts (no crash, no white screen) and tells the user the song library could not be read (and how to restore a backup).
- The damaged file is **kept** somewhere (e.g. renamed `songs.json.corrupt-…`) — the first edit must not silently overwrite the only copy of the user's data.

### TC-RES-05 · Remote port already in use  `P1`
**Setup:** before launching, occupy the port:
`node -e "require('http').createServer((q,s)=>s.end('busy')).listen(7272)"` (run in background)
**Steps**
1. Launch the app. Settings → phone/stage section.
2. Change the port to `7373` and press **Enter** (the port applies on Enter or when leaving the field); phone → `http://localhost:7373/remote#pin=<PIN>`.
**Expected**
- App works normally otherwise; Settings shows a clear "port in use" message (not a silent failure).
- After changing the port the phone connects; the QR/URL shows the new port.

### TC-RES-06 · Starting the app twice  `P1`
**Steps**
1. App running. In a second terminal: `E2E_CDP_PORT=9223 pnpm e2e:launch --keep`.
**Expected**
- No second set of windows; the existing operator window comes to the front; data untouched.

### TC-RES-07 · Media missing when it goes live  `P0`
**Steps**
1. Copy sample.mp4 to `.e2e-data/tmp/gone.mp4`, add it to the library and to the plan, with another item after it.
2. Delete `gone.mp4` from disk (simulates a USB stick that was removed). Go live on the item.
**Expected**
- Operator shows a clear "file missing" message (toast "⚠ File not found: …"); the projector shows the theme background or black — not a frozen frame or an error page.
- While the item stays live, the video panel keeps a red "The projector can't play this video…" line (it does not disappear with the toast).
- Double-click the same item again while it is live: the message appears **again** (not only the first time). If
  the first message is still showing, it is not doubled but stays up for its full time again (it doesn't vanish a
  second later).
- `Space` moves on to the next item normally.

### TC-RES-08 · Restore a backup made on another computer  `P1`
**Steps**
1. Add `.e2e-data/tmp/other.jpg` to the library and a plan; import `tests/fixtures/sample.pdf` (Media → PowerPoint & PDF); **Back up now**.
2. Delete `other.jpg` from disk; restore the backup **into a different data folder**: quit, copy the zip, launch with
   `ICCWORSHIP_DATA=<another folder>` (a "different PC"), finish the welcome, Restore… the zip.
**Expected**
- Restore succeeds; the image item is marked missing (not a crash); everything else is back.
- The imported PDF's slides **show** on the projector (converted slides are found in the new data folder — also
  for backups made by 1.0, whose slides held the old PC's full path).
- This "PC"'s PIN and screen choice are kept, not the backup's.

### TC-RES-09 · Restoring something that isn't a backup  `P0`
**Setup (Bash):** `echo hello > .e2e-data/tmp/fake.zip`; `cp tests/fixtures/sample.pptx .e2e-data/tmp/realzip.zip` (a zip, but not a backup).
**Steps**
1. Restore… → queue `fake.zip`. 2. Restore… → queue `realzip.zip`.
**Expected**
- Each shows a clear error ("not an ICCWorship backup" or similar); current data unchanged; the app does not reload.

### TC-RES-10 · PowerPoint already open with the user's work  `P1` (needs PowerPoint)
**Steps**
1. Open PowerPoint yourself with a **new blank presentation** and type a word on slide 1 (don't save).
2. In ICCWorship import `sample.pptx`.
**Expected**
- Import succeeds. The user's PowerPoint window stays open and the unsaved presentation is untouched (the converter must not quit PowerPoint when other presentations are open).

### TC-RES-11 · Presentation that can't be converted  `P2`
**Setup (Bash):** `echo notapptx > .e2e-data/tmp/broken.pptx`; `echo notapdf > .e2e-data/tmp/broken.pdf`
**Steps**
1. Import each.
**Expected**
- A clear error within ~60 s (no endless "Converting…" pill); no PowerPoint process left running (`tasklist | findstr POWERPNT`).

### TC-RES-12 · Corrupt video file  `P1`
**Setup (Bash):** `head -c 20000 tests/fixtures/sample.mp4 > .e2e-data/tmp/truncated.mp4`; `echo notavideo > .e2e-data/tmp/fake.mp4`
**Steps**
1. Add both; Show now on each.
**Expected**
- Operator shows an error/can't-play message; projector doesn't stay on a black frame indefinitely; `Space` moves on.

### TC-RES-13 · Phone loses Wi-Fi and comes back  `P0`
**Steps**
1. Phone remote connected. `browser_run_code_unsafe` on the phone: `await page.context().setOffline(true)`; wait 5 s.
2. `setOffline(false)`; wait 10 s. Tap ▶.
**Expected**
- While offline the phone clearly shows "offline / reconnecting" (buttons disabled or greyed), not a frozen UI that silently ignores taps.
- It reconnects by itself **without asking for the PIN again**; ▶ works.

### TC-RES-14 · App restarts while phones are connected  `P1`
**Steps**
1. Phone remote and phone stage (`/stage#pin=<PIN>` in a second tab) connected. Kill and relaunch the app `--keep`.
**Expected**
- Both pages reconnect on their own within ~10 s; neither needs the PIN re-typed.

### TC-RES-15 · Server turned off  `P2`
**Steps**
1. Settings → turn off phone/stage server. `curl http://localhost:7272/`. Turn it on again.
**Expected**
- Port closed while off (curl fails); connected phones show offline; after turning on, phones reconnect.

### TC-RES-16 · Read-only data file  `P2`
**Steps**
1. Close the app; `attrib +R .e2e-data\data\songs.json`; relaunch; edit a song.
2. Afterwards: `attrib -R .e2e-data\data\songs.json`.
**Expected**
- A visible error that changes can't be saved (not silent data loss on next launch).

### TC-RES-17 · Projector monitor unplugged mid-service  `P1` (manual — needs 2 screens)
**Steps**
1. Launch with `--fullscreen` on a second monitor, go live. Unplug the second monitor; plug it back.
**Expected**
- Unplugged: projector window moves/closes without crashing; the operator keeps working.
- Plugged back: projector returns full-screen on that monitor showing the current slide.

### TC-RES-18 · Laptop sleep and resume  `P2` (manual)
**Steps**
1. Live with phone connected and the projector open; close the laptop lid 1 minute; open.
**Expected**
- Clock and timers correct after resume; phone reconnects; video background resumes.
- Waking up does **not** restart the projector: no "The projector window had a problem and was restarted"
  message, and `main.log` has `system suspending` / `system resumed` but no `output window stopped responding`.

### TC-RES-19 · Two-hour soak  `P2` (long)
**Steps**
1. Theme with Motion video default; a song live; phone + stage connected; leave 2 hours. Note operator memory in Task Manager at start/end.
**Expected**
- Still responsive; memory doesn't grow without bound (e.g. < 2× start); video still smooth.

### TC-RES-20 · Projector crashes mid-video  `P0`
**Steps**
1. Media → show `tests/fixtures/sample.mp4`; wait ~2 s while it plays.
2. Crash the projector page: `browser_run_code_unsafe` on the projector tab:
   `const s = await page.context().newCDPSession(page); await s.send('Page.crash').catch(() => {})`
**Expected**
- Within ~3 s the projector shows the video again and it **continues from about the same second** (not from 0).
- Operator shows "The projector window had a problem and was restarted". `.e2e-data/.userdata/logs/main.log` has
  `output window crashed`.

### TC-RES-21 · Projector keeps crashing → black, then Restart projector  `P1`
**Steps**
**Pre:** wait 60 s after any earlier projector crash (e.g. TC-RES-20), or press Settings → Screens → 🔄 Restart
projector first — earlier crashes in the last minute count toward the limit.
1. A song live. Crash the projector page (as in TC-RES-20) **4 times within a minute**, waiting for it to come back each time.
2. Settings → Screens → 🔄 Restart projector.
**Expected**
- After the 4th crash the projector shows plain black (URL ends in `#safe`) and the operator gets a red message
  pointing to Restart projector — it does not keep reloading.
- Step 2: the projector shows the live song again.

### TC-RES-22 · Frozen projector is restarted  `P1`
**Steps**
1. A song live. Projector tab `browser_evaluate` → `setTimeout(() => { for (;;) {} }, 100)` (freezes the page).
**Expected**
- Within ~10 s the projector is restarted (log: `output window stopped responding`) and shows the song again.
- It is restarted **once**: one "restarted" message, and no second black flash a few seconds later.

### TC-RES-23 · Main window crash  `P1`
**Steps**
1. A song live. Crash the operator page (CDP `Page.crash` on the operator tab), then re-select the tab when it returns.
2. Crash it again within a minute; before that, `browser_evaluate` → `window.api.e2e.queueMessageBox(0)` (Reload).
**Expected**
- Step 1: the window reloads by itself; the projector kept showing the song the whole time; a red message says the
  window was restarted (an announcement loop would need Space).
- Step 2: the "crashed again — reload?" box is answered Reload; the window comes back.

### TC-RES-24 · A page error doesn't blank the window  `P2`
**Steps**
1. Operator tab: `browser_evaluate` → find a page that renders a list and make one record unrenderable, e.g.
   `await window.api.db.upsert('songs', { id: 'broken-e2e', title: 5, sections: null })`, then open Songs.
**Expected**
- At worst the Songs page shows "This page had a problem — Try again / Reload window"; the top bar, the other
  pages, the keyboard shortcuts and the phone remote keep working. Remove the record afterwards.

### TC-RES-25 · A main window crash long after a "crashed again" prompt reloads by itself  `P2` (long)
**Pre:** TC-RES-23 just done (the "crashed again" box was answered Reload).
**Steps**
1. Wait at least 70 s with the window working. 2. Crash the operator page again (CDP `Page.crash`).
**Expected**
- The window reloads by itself with the red "restarted" message — **no** "crashed again — reload?" box (don't
  queue a message box answer; if the box appears, the test fails).

### TC-RES-26 · Restart projector twice quickly  `P1`
**Steps**
1. A song live. Settings → Screens → click 🔄 Restart projector twice in quick succession (one `browser_run_code_unsafe`
   that clicks it twice).
**Expected**
- The projector shows the song again. No red "Something went wrong inside ICCWorship" message (the first reload
  being replaced by the second is not an error); `main.log` has no `unhandled rejection in main`.

### TC-RES-27 · A page that breaks without crashing is really reloaded  `P1`
**Steps**
1. A song live; stage window open. On the stage tab `browser_evaluate` → `window.api.win.fatal('e2e test')` (what the
   page sends when React gives up on it; the renderer stays alive).
2. Same on the projector tab.
**Expected**
- Each window really reloads (its URL's `?load=` number goes up, the page starts again) and shows what is live;
  the operator gets the "…was restarted" message. `main.log` has `stage page failed: e2e test` /
  `output page failed: e2e test`.

### TC-RES-28 · Stage display that gave up can be opened again  `P2`
**Steps**
1. Stage window open. Crash its page (CDP `Page.crash` on the stage tab) **4 times within a minute**, waiting for
   it to come back each time, until the operator shows "The stage window keeps failing…".
2. Without closing it, Settings → Screens → 🎤 Open stage display.
**Expected**
- Step 2 starts the stage page again: it shows what is live (not a dead window that only gets focus).
  `main.log` has `stage window started again after it failed`.

### TC-RES-29 · An error outside a page offers a reload instead of a blank window  `P2` (manual, dev build)
**Steps**
1. Temporarily add `throw new Error('e2e')` at the top of the `App` component's render in
   `src/renderer/operator/App.tsx`; `pnpm dev`. Remove it afterwards.
**Expected**
- The window shows "This window had a problem" with ↻ Reload window / Try again — never a blank window.
- The projector and phone remote keep working; `main.log` has one `operator: Error` line (not two).

### TC-RES-30 · An unexpected error that isn't an error message shows the generic message  `P2`
**Steps**
1. Operator tab: `browser_evaluate` → `setTimeout(() => Promise.reject({ code: 42 }))` (an action failing with
   something that isn't an `Error`, left unhandled).
2. Repeat with `setTimeout(() => Promise.reject(new Error('e2e-visible')))`.
**Expected**
- Step 1: a red toast "⚠ Something went wrong." / "⚠ Algo salió mal." — never "⚠ [object Object]".
- Step 2: a red toast "⚠ e2e-visible" (a real error message is still shown).
- The app keeps working; `main.log` has a `unhandled rejection:` line for each.

### TC-RES-31 · The projector crashes mid-song: the music continues where it was  `P0`
**Pre:** TC-LIVE-15, music at about 0:03
**Steps**
1. Crash the projector page (`browser_tabs` on output.html → `browser_evaluate(() => { while (true) {} })`, or
   Settings → 🔄 Restart projector).
**Expected**
- After the restart the projector plays the music again from about where it was (not from 0:00), and the lyrics
  slide is back.

### TC-RES-32 · A backup restored on another computer keeps the backing tracks  `P1`
**Pre:** TC-SONG-12
**Steps**
1. **Back up now**. 2. Restore it into a different data folder (as TC-RES-08). 3. Show "Track Test" with its track.
**Expected**
- The track file is in the new folder's `tracks/`, and the music plays (the song stores the track relative to the
  data folder).

### TC-RES-33 · The operator window freezes or crashes mid-song: the music and following go on  `P1`
**Pre:** TC-LIVE-22 running at ~3 s
**Steps**
1. Freeze the operator page: `browser_evaluate` on index.html →
   `await window.api.e2e.queueMessageBox(0); setTimeout(() => { while (true) {} }, 50)` (queue the answer **first**,
   and start the loop from a timer so the call returns — a frozen page never answers the MCP again).
2. Wait 15 s.
3. Crash it instead: from a plain Node script, CDP `Page.crash` on the index.html target (not through the Playwright
   MCP: it may close the crashed page, which quits the app).
**Expected**
- Step 1–2: within ~10 s main asks "The ICCWorship window is not responding." with **Restart the window** / **Keep
  waiting** (the queued answer 0 restarts it); `main.log` says `operator window stopped responding: asking` then
  `…: restarting it`. Without a queued answer, choosing **Keep waiting** asks again 10 s later if it's still frozen,
  and the question closes by itself if the window starts answering.
- Steps 1–3: the projector keeps the music playing and the lyrics on screen; after the operator reloads, the toast
  says the window restarted and that the lyrics keep following the music. The lyrics **catch up** with the music at
  once (frozen during the intro and restarted at ~10 s: slide 3 straight away), forward only — and then follow as
  usual (a crash reloads within a second: slide 3 still comes up at ~8 s). While the window is frozen the lyrics
  don't move (the window that drives them is stuck); the music never stops.
- A confirm box left open in the operator (e.g. Delete a song, then wait 30 s before answering) is **not** taken for a
  freeze: no question appears.

### TC-RES-34 · ICCWorship closes unexpectedly mid-service: the item is offered back  `P0`
**Pre:** an active plan with at least two items, the second with two slides or more
**Steps**
1. Go live on the 2nd item of the active plan and move to its 2nd slide. Wait 2 s.
2. Kill the app (no normal quit): from a Node script, `taskkill /T /F /PID <main pid>` (or end it in Task Manager).
3. `pnpm e2e:launch --keep`.
**Expected**
- The projector starts black (nothing goes on screen by itself).
- A toast says ICCWorship closed unexpectedly during "<item>" (<plan>), with **▶ Put it back (slide 2)**.
- Clicking it puts that item live on slide 2 and selects that plan, and the toast goes away at once (it can't be
  clicked a second time: a later click would put the old slide back over whatever is live then).
- Quit normally. Before launching again, `.e2e-data/.userdata/session.json` has `"clean":true` (the next launch
  rewrites it to `false` while it runs). Launch again: no such toast.
- Esc variant: go live, press **Esc** (Clear all), then kill the app → the toast is offered too (Space would have
  brought that slide back), and **Put it back** shows the slide Esc cleared.
- Second-crash variant: after the toast appears, kill the app again without answering → the next launch offers it
  again.
- Went live by hand variant: while the toast is up, go live on another item, then click **Put it back** → "Something
  else is on screen now, so nothing was changed." and nothing changes. The same while only a song's backing-track
  intro plays (no text yet), while the **Logo** is up, or while a projector message shows.
- Variants: a Show-now item (from Bible/Songs), or nothing live and nothing cleared mid-item → no toast. An offer more
  than 6 hours old → no toast. The item was deleted from the plan in between → clicking says it is no longer in the
  plan.
- Windows shutting down (Electron's `session-end`) with nothing on screen counts as a normal quit (no toast next
  time); with a slide on screen, or a slide cleared with **Esc** less than 2 hours ago (a forced restart during the
  sermon), the item is offered back. A screen cleared more than 2 hours before the shutdown counts as a normal quit.

### TC-RES-35 · The operator window opens where it was left  `P2`
**Pre:** default (steps 4–5: two screens)
**Steps**
1. Un-maximize the operator window, move and resize it. Quit normally; launch with `--keep`.
2. Maximize it; quit; launch again.
3. Edit `.e2e-data/.userdata/window-state.json` so `bounds.x` is far off any screen (e.g. `9000`); launch again.
4. (Two screens, `pnpm e2e:launch --keep -- --fullscreen`, so the projector really goes full screen.) With the
   projector off, move the operator window onto the second screen and quit. Turn the projector on in Settings (it
   uses that second screen), quit, launch again.
5. (Two screens, the same launch.) In Windows' display settings make the projector the **main display**, choose it as
   the projector in Settings, delete `.e2e-data/.userdata/window-state.json`, and launch again.
**Expected**
- 1: it opens at the same size and place. 2: it opens maximized.
- 3: it opens on a visible screen (never off-screen or on an unplugged projector).
- 4: it opens on the main screen, never under the full-screen projector window on the projector's screen.
- 5: it opens on the other screen (centred there, nothing saved), not on Windows' main screen under the projector.
  With only one screen, shared by both, it opens on that screen.
- The first run ever (no `window-state.json`) opens maximized, as before.

### TC-RES-36 · The offer is kept or replaced correctly after a crash  `P1`
**Pre:** an active plan with items
**Steps**
1. Go live on a plan item, kill the app, launch with `--keep`. Ignore the "closed unexpectedly" toast.
2. From Bible, **Show now** a verse (a Show-now item, not in the plan). Wait 2 s. Kill the app; launch again.
3. Go live on a plan item. Make the operator window crash twice in a row (CDP `Page.crash` from a Node script, see
   the gotchas in CLAUDE.md), so the "the window crashed again" box appears; queue `queueMessageBox(1)` (**Quit**)
   before the second crash. Launch again.
4. With nothing on screen, change the display language (Live page) only, then kill the app; launch again.
5. Go live on a plan item, kill the app. Launch again with the operator page set to crash twice before it has
   loaded (CDP `Page.crash` as soon as the page target appears, twice), with `queueMessageBox(1)` (**Quit**) queued:
   the "closed unexpectedly" toast never had time to appear. Launch again.
6. Go live on a plan item, kill the app. Launch again, and before the operator page shows the toast, emit Electron's
   `session-end` on the operator window (Windows shutting down). Launch again.
7. Go live on a plan item, kill the app. Launch again, let the toast appear and ignore it (nothing goes live), then
   emit `session-end`. Launch again.
**Expected**
- 2: no toast. The verse on screen replaced the old offer, so the item from step 1 is not offered hours later.
- 3: the toast offers the item that was on screen: quitting after the operator window crashed mid-service is still an
  interrupted service.
- 4 (after an offer is showing): the offer survives (a change that shows nothing doesn't replace it).
- 5: the toast offers the item from step 5's first run: Quit after a crash, before the offer was answered, keeps it.
- 6: the toast offers it: a shutdown before the offer was even seen keeps it for the next start.
- 7: no toast: an offer that was shown and left alone is not kept after a shutdown with nothing on screen.

### TC-RES-37 · A damaged built-in Bible doesn't hide the other Bibles  `P1`
**Pre:** an imported Bible in `.e2e-data/data/bibles/` (TC-BIB-*); a copy of `resources/bibles/rv1909.json` kept aside
**Steps**
1. Quit. Cut `resources/bibles/rv1909.json` short (delete its second half, so it is no longer valid JSON).
2. `pnpm e2e:launch --keep`. Bible → look up John 3:16 in KJV, then in the imported version, then in RV1909.
3. Put the original `rv1909.json` back.
**Expected**
- 2: KJV and the imported Bible show the verse; RV1909 is simply not available (no crash, no frozen page, every other
  lookup that session still works).
- `main.log` has `unreadable built-in bible skipped: rv1909 SyntaxError` and no verse text.
