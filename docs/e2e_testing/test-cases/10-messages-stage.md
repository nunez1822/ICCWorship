# 10 · Screen messages & stage display

### TC-MSG-01 · Nursery message in both languages  `P0` 📸
**Pre:** a song is live, screen language ES + EN
**Steps**
1. Messages "#" box → `12` → click "Parent of child" / "Padre/madre del niño".
**Expected**
- Red banner slides up on the projector with two lines:
  "Padre/madre del niño #12, favor de pasar a la guardería" / "Parent of child #12, please come to the nursery".
- Template buttons never show the raw `{n}` placeholder.

### TC-MSG-02 · Message follows screen language  `P1`
**Steps**
1. Press `1` (English), send the nursery template again.
**Expected**
- Banner shows the English sentence only.

### TC-MSG-03 · Custom message & clear  `P1`
**Steps**
1. Type `Bienvenidos visitantes` → Enter. 2. Click the red ✕.
**Expected**
- Banner appears then disappears immediately on ✕.

### TC-MSG-04 · Auto-hide  `P2`
**Steps**
1. Settings → Seconds on screen = 5. Send a message; wait 7 s.
2. Set Seconds on screen back to 30 (later message cases expect the default).
**Expected**
- Banner disappears by itself.

### TC-STG-01 · Stage window content  `P0` 📸
**Steps**
1. Settings → **Open stage display window** (new `stage.html` tab). 2. Go live on a song.
**Expected**
- Clock, "Now: <song>", item and service timers; big current slide; right column "Next" with the next slide's text.

### TC-STG-02 · Message to the stage  `P0`
**Steps**
1. Live → Message to the stage → quick button "Please wrap up".
**Expected**
- Stage shows a red flashing bar "Please wrap up"; projector does **not** show it. ✕ clears it.

### TC-STG-03 · Overtime warning  `P2`
**Steps**
1. Set an item's duration to 1 min, go live, wait > 60 s.
**Expected**
- Stage item timer turns red and blinks; operator's Item timer turns red.

### TC-STG-04 · Stage in a browser on the network  `P1`
**Steps**
1. Phone browser (`iccworship-phone`) → `http://localhost:7272/stage#pin=<PIN>` (the 🎤 QR code in Settings opens this link).
**Expected**
- Same content as the stage window, updating live as slides change.
- The PIN disappears from the address bar and is remembered: reloading `/stage` connects without asking again.

### TC-STG-05 · Stage in a browser asks for the PIN  `P0`
**Steps**
1. In a fresh browser tab (no remembered PIN): phone → `http://localhost:7272/stage`.
2. Type a wrong PIN → Connect. 3. Type the right PIN → Connect.
**Expected**
- Step 1 shows the "Enter the PIN shown in ICCWorship → Settings" screen — **no slides, notes or plan are shown before the PIN**.
- Step 2: "Wrong PIN". Step 3: the stage display appears and updates live.
- The app's own stage window (Settings → open stage) never asks for a PIN.

### TC-STG-06 · Video slide on a stage screen in a browser  `P1`
**Pre:** a video in Media (`tests/fixtures/sample.mp4`); phone on `http://localhost:7272/stage#pin=<PIN>` (TC-STG-04)
**Steps**
1. Put the video live (Media → the video → Show now). 2. Look at the phone's stage page, then the app's stage window.
**Expected**
- Both show "🎬 <video title>" in the current-slide box — never an empty box.
- Next column: a video is always its own plan item, so after a song the stage's Next shows "⏭ <item title>". To see a
  video *slide* as the next slide, push one from the operator tab's console:
  `await window.api.live.update({ slides: [{ id: 'a', kind: 'text', text: { en: 'Line', es: 'Línea' } }, { id: 'b', kind: 'video', media: '<the video’s media:// url>', group: 'sample' }], slideIndex: 0 })`
  — both stages show "🎬 sample" under Next.

### TC-STG-07 · A slide the stage can't draw doesn't blank the stage  `P1`
**Pre:** stage window open (Settings → Screens → 🎤 Open stage display).
**Steps**
1. Operator tab `browser_evaluate` → push a slide that can't be drawn:
   `await window.api.live.update({ slides: [{ id: 'bad-e2e', kind: 'song', text: { en: {}, es: {} } }], slideIndex: 0, displayLang: 'en' })`
2. Put a normal song live (Songs → Show now).
**Expected**
- Step 1: the stage keeps its clock and timers and shows "—" where the slide would be; the operator gets a red
  "The stage display could not show this slide…" message (the projector shows black and its own message).
  `main.log` has `stage could not draw a slide: Error (slide song)`.
- Step 2: the stage shows the new song normally — no click on the stage and no restart needed.
