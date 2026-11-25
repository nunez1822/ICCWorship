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
1. Phone browser (`iccworship-phone`) → `http://localhost:7272/stage`.
**Expected**
- Same content as the stage window, updating live as slides change (no PIN needed).
