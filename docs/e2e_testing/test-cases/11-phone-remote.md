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
1. Phone → Plan tab → tap "Doxology". 2. Slides tab → tap slide 1.
**Expected**
- Doxology goes live; the tapped slide is highlighted on phone and projector.

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
