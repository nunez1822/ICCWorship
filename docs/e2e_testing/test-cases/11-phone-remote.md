# 11 · Phone remote (use the `iccworship-phone` MCP server)

Get the PIN: operator tab → `browser_evaluate` → `(await window.api.settings.get()).remotePin`.
New installs get a 6-digit PIN; an older 4-digit PIN keeps working until ↻ makes a new one. The stage display in a
browser (`/stage`) uses the same PIN.

### TC-REM-01 · Wrong PIN is rejected  `P0`
**Steps**
1. Phone → `http://localhost:7272/remote#pin=0000` (if the real PIN is 0000 use 1111).
**Expected**
- "Wrong PIN" message; no controls shown.

### TC-REM-02 · Connect with PIN (like the QR code)  `P0` 📸
**Steps**
1. Phone → `http://localhost:7272/remote#pin=<PIN>`.
**Expected**
- Green dot, plan title, current item, preview card with the live slide text, big ◀ ▶ buttons.
- The URL no longer shows the PIN (it is removed from the address bar). Operator top bar 📱 count goes up by 1 within ~5 s (it counts every phone and browser stage page; the app's own stage window isn't counted).
- With Settings open, its "N connected" goes up at once when the phone connects, and down when the phone tab is closed (no need to leave and reopen Settings).

### TC-REM-03 · Next / previous from the phone  `P0`
**Steps**
1. Go live on a song (operator). 2. Phone ▶ twice, ◀ once.
**Expected**
- Slide goes 1 → 2 → 3 → 2: operator and projector end on slide 2 and the phone preview shows "2/N".

### TC-REM-04 · Black / clear / logo / language from phone  `P1`
**Steps**
1. Phone: Black, Black. 2. ES. 3. EN. 4. ES+EN.
**Expected**
- Projector goes black and back; screen language changes and the operator's top-bar switch follows.

### TC-REM-05 · Jump to plan item / slide  `P1`
**Steps**
1. Phone → Plan tab → tap "Doxology". 2. Plan tab → tap a song with several slides (e.g. "A Mighty Fortress"), then
   Slides tab → tap slide 4.
**Expected**
- Doxology goes live; then that song goes live on slide 4, and the tapped slide is highlighted on phone and projector.

### TC-REM-06 · Messages from the phone  `P1`
**Steps**
1. Messages tab → screen message `Test` → Show. 2. Stage message quick "Slow down".
**Expected**
- Projector banner "Test"; stage shows "Slow down".

### TC-REM-07 · New PIN disconnects old phones and stage screens  `P2`
**Steps**
1. Settings → ↻ next to PIN. 2. Reload phone page.
**Expected**
- Phone asks for the PIN again (old one is rejected); a phone `/stage` page asks too.
- The new PIN has 6 digits.

### TC-REM-08 · Operator page is not exposed  `P0`
**Steps**
1. Phone → `http://localhost:7272/index.html`.
**Expected**
- 404 "Not found" — only `/`, `/remote` and `/stage` are served.

### TC-REM-09 · Too many devices is not a wrong PIN  `P2`
The server allows 32 phones and stage screens at once.
**Pre:** close every other remote and stage page first (the phone's own remote/stage tabs, the stage window), or the
script gets fewer than 32 places and the phone simply reconnects in the one it freed.
**Steps**
1. node, from the repo root, keep it running:
```js
const { WebSocket } = require('ws'); const pin = '<PIN>'
const socks = Array.from({ length: 32 }, () => new WebSocket(`ws://localhost:7272/ws?role=stage&pin=${pin}`))
setTimeout(() => socks.forEach((s) => s.close()), 30_000) // free the places after 30 s
```
2. Within those 30 s, phone → `http://localhost:7272/remote#pin=<PIN>`. 3. Wait until the 30 s have passed.
**Expected**
- Step 2: "Too many phones and screens are connected. Close ICCWorship on another device; this one will connect by
  itself." / "Hay demasiados teléfonos y pantallas conectados…" — **not** "Wrong PIN", and no PIN screen.
- Step 3: within about 10 s after the node sockets close, the phone connects on its own and shows the controls.

### TC-REM-10 · A long message from the phone stops at 500 characters  `P2`
**Steps**
1. Messages tab → paste 600 characters into the screen message box → Show.
2. Paste 600 characters into the stage message box → Send.
**Expected**
- Each box holds only the first 500 characters (typing stops there).
- The projector shows the screen message and the stage shows the stage message — nothing vanishes silently.

### TC-REM-11 · Pause and play the backing track from the phone  `P1`
**Pre:** TC-LIVE-15 (music playing), phone connected
**Steps**
1. On the phone tap the play/pause button twice.
**Expected**
- The button reads "⏸ 🎵 Music" while it plays (not "Video"); each tap pauses / resumes the music on the projector.
- The stage display shows "🎵 Time left" with the music's remaining time.
