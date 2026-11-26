# 17 · Security & privacy (local network)

The phone/stage server listens on the church Wi-Fi, where anyone (guests, kids) may be connected.
These cases check that nothing beyond the stage/remote pages leaks, that typed text can't run
code on other devices, and that private data stays private.

### TC-SEC-01 · Church name with HTML on the phone landing page  `P0`
**Steps**
1. Settings → Church name `<img src=x onerror="document.title='HACKED'">Iglesia`.
2. Phone → `http://localhost:7272/` ; also `curl -s http://localhost:7272/`.
**Expected**
- The page shows the text literally (`<img …>Iglesia`); page title is **not** `HACKED`; the curl output contains `&lt;img`.
- Same name on projector logo screen and stage: shown as text.

### TC-SEC-02 · Text with HTML on stage, remote and projector  `P0`
**Steps**
1. Song title `<img src=x onerror=alert(1)>T` with lyrics `<script>alert(2)</script>`; plan item title `<b>bold</b>`;
   screen message `<u>msg</u>`; stage message `<i>stage</i>`; prayer request (public) `<img src=x onerror=alert(3)>`.
2. Show each; watch projector, stage window, phone `/stage` and `/remote`.
**Expected**
- Everything shown as literal text; no alert dialogs (`browser_handle_dialog` never needed); no console errors.

### TC-SEC-03 · Only stage/remote files are served  `P0`
**Steps** — `curl -s -o /dev/null -w "%{http_code}\n"` each URL:
```
http://localhost:7272/index.html
http://localhost:7272/output.html
http://localhost:7272/..%2f..%2fpackage.json
http://localhost:7272/assets/..%2f..%2f..%2fpackage.json
http://localhost:7272/assets/%2e%2e/%2e%2e/%2e%2e/package.json
http://localhost:7272/%5c..%5c..%5cpackage.json
http://localhost:7272/file?p=C:%5CWindows%5Cwin.ini
http://localhost:7272/file/0123456789abcdef0123456789abcdef
http://localhost:7272/file/<token of a library image that is NOT live right now>
```
To get an image's token, show it (Media → ● Show now) and read the `<img>` src on the phone's `/stage#pin=<PIN>` page
(`browser_evaluate` → `document.querySelector('.stage-img')?.src`).
**Expected**
- All return 403 or 404 — never 200. (`/file/<token>` only serves slide images that are on screen right now; the
  old `/file?p=<path>` form no longer exists.)
- While that image **is** live, its `/file/<token>` URL returns 200 with `X-Content-Type-Options: nosniff`.
- After `Esc` it **still returns 200**: Esc keeps the cleared slide so `Space` can put it back (TC-CONF-16), and
  the stage display previews it as "Next" (`refreshAllowList` in `src/main/server.ts`). Only that one slide stays
  allowed — the item's other image slides return 403 after Esc.
- After moving to another item (`Ctrl+→`), the image's URL returns 403.
- `http://localhost:7272/favicon.ico` → 204 (no 404 error in the phone's console).

### TC-SEC-04 · PIN guessing is slowed down  `P1`
**Run this case last, or relaunch the app after it:** the lockout applies to every connection from that device
(remote **and** stage), for up to 10 minutes, so later phone cases from the same machine would be refused.
**Steps** — operator tab `browser_evaluate` (or a node script) tries 50 wrong PINs:
```js
let n = 0; for (let i = 0; i < 50; i++) { await new Promise(r => { const w = new WebSocket(`ws://localhost:7272/ws?role=remote&pin=${String(i).padStart(6,'0')}`); w.onmessage = e => { if (JSON.parse(e.data).authed) n++; }; w.onclose = r; }) } n
```
**Expected**
- After a handful of wrong attempts, further attempts from that device are delayed or refused for a while (a PIN must not be guessable in seconds by anyone on the Wi-Fi).
- A phone on another device that already knows the PIN can still connect.

### TC-SEC-05 · Stage connections can't control the screen  `P0`
**Steps**
1. With the **right** PIN as stage: `const w = new WebSocket('ws://localhost:7272/ws?role=stage&pin=<PIN>')`; on open send `{"type":"command","cmd":{"type":"next"}}` and `{"type":"command","cmd":{"type":"black"}}`.
2. Without a PIN as stage, and with a wrong PIN as remote: send the same commands immediately after open (before it closes).
3. With the right PIN as remote, send commands that aren't real: `{"type":"command","cmd":{"type":"videoEnded","src":"x"}}`,
   `{"type":"command","cmd":{"type":"gotoSlide","index":-5}}`, `{"type":"command","cmd":{"type":"message","text":"<500+ characters>"}}`.
**Expected**
- Projector unchanged in steps 1 and 2. Step 2's connections get `"authed":false` and close; no live state is ever sent to them.
- Step 3: projector unchanged, no error toast, app keeps working.

### TC-SEC-06 · Private prayer requests never leave the operator  `P0`
**Steps**
1. Add a private request `Juan — SECRET-PRIVATE-TEXT` and a public one. Show now (prayer slide).
2. Phone `/stage#pin=<PIN>` and `/remote#pin=<PIN>`: collect every WebSocket message (e.g. `browser_evaluate` wrapping `WebSocket.prototype.onmessage`, or open a raw socket and log for 10 s).
3. Export the run sheet PDF and print preview of a plan containing the Prayer item.
**Expected**
- `SECRET-PRIVATE-TEXT` appears in **no** network message, stage, phone, projector, PDF or printout.
- No network message contains a local file path (`C:\…`, the Windows user name) or a `media://` URL — also
  while a video plays (the `progress` messages).

### TC-SEC-07 · Malicious backup can't write outside the data folder  `P0`
**Setup (node, from repo root):**
```js
const JSZip = require('jszip'); const fs = require('fs'); const z = new JSZip();
z.file('iccworship-backup.json', '{"app":"ICCWorship","version":1}');
// a real data file, so the zip passes the backup check and the path guard is what gets tested
z.file('data/zz-e2e-marker.json', '[]');
z.file('../../ZIPSLIP-EVIL.txt', 'x'); z.file('data/../../ZIPSLIP-EVIL2.txt', 'x');
z.file('data/../ZIPSLIP-ROOT.json', 'x');
z.generateAsync({ type: 'nodebuffer' }).then(b => fs.writeFileSync('.e2e-data/tmp/evil.zip', b))
```
**Steps**
1. Restore… → `evil.zip` (accept the confirm).
**Expected**
- The restore **runs** (app reloads, a `before-restore-…` safety zip appears) — the zip must get past the backup
  check, otherwise the path guard is never exercised.
- `.e2e-data/data/zz-e2e-marker.json` exists (the legitimate entry was restored).
- No `ZIPSLIP-EVIL*.txt` appears anywhere outside `.e2e-data/` (check repo root and its parent), and no
  `ZIPSLIP-ROOT.json` appears directly in `.e2e-data/` (only `data/` and `cache/presentations/` are restored into).

### TC-SEC-08 · CCLI CSV is safe to open in Excel  `P2`
**Steps**
1. Song titled `=HYPERLINK("http://example.com","Click")` and another `+SUM(1,1)`; show both; export the CCLI CSV.
**Expected**
- In the CSV these cells are neutralised (e.g. prefixed with `'`) so Excel shows text instead of evaluating a formula.

### TC-SEC-09 · Server off means port closed  `P1`
**Steps**
1. Settings → disable the phone/stage server. `curl http://localhost:7272/` and `Test-NetConnection -ComputerName localhost -Port 7272`.
**Expected**
- Connection refused; nothing listening on 7272.

### TC-SEC-10 · New PIN locks out a shared phone  `P1`
**Steps**
1. Phone connected. Settings → ↻ new PIN. 2. On the phone, reload; also try the old PIN in a fresh tab.
**Expected**
- Old PIN rejected everywhere; the phone's saved PIN (localStorage) no longer works.

### TC-SEC-11 · Malformed requests can't stop the app  `P0`
Anyone on the Wi-Fi can send these; each used to be an uncaught error in the main process.
**Steps** (Bash / node, app running, an image slide live so it has a `/file/<token>` URL — see TC-SEC-03)
1. `curl -s -o /dev/null -w "%{http_code}\n" -H "Range: bytes=500-10" http://localhost:7272/file/<token>`
2. node, from the repo root (uses the app's own `ws` package):
```js
const { WebSocket } = require('ws'); const pin = '<PIN>'
const bad = new WebSocket(`ws://localhost:7272/ws?role=remote&pin=${pin}`)
bad.on('open', () => bad.send(Buffer.from([0xff, 0xfe]), { binary: false })) // invalid UTF-8 text frame
const big = new WebSocket(`ws://localhost:7272/ws?role=remote&pin=${pin}`)
big.on('open', () => big.send('x'.repeat(70 * 1024))) // over the 64 KB limit
```
3. After both, connect the phone remote and press ▶.
**Expected**
- Step 1 returns **416**. The sockets in step 2 are closed by the server.
- The app keeps running: operator, projector and the phone remote all still work in step 3.

### TC-SEC-12 · Other websites can't use the phone server  `P0`
A web page a phone opens could point its own domain at the church PC (DNS rebinding) or connect from its own origin.
**Steps**
1. `curl -s -o /dev/null -w "%{http_code}\n" -H "Host: evil.example" http://localhost:7272/remote`
2. `curl -s -o /dev/null -w "%{http_code}\n" -H "Host: <this PC's name>.local:7272" http://localhost:7272/remote`
3. node: `new (require('ws').WebSocket)('ws://localhost:7272/ws?role=stage&pin=<PIN>', { headers: { Origin: 'http://evil.example' } })` — log `unexpected-response` status.
4. `curl -sI http://localhost:7272/remote` and look at the headers.
**Expected**
- Step 1: **403**. Step 2: **200** (the PC's own name still works). Step 3: refused (HTTP 401), no live data.
- A browser sent to a name the server doesn't answer (e.g. `<PC name>.fritz.box`) shows a plain-text bilingual hint:
  "Forbidden: open the address or QR code shown in ICCWorship → Settings → Phone remote & stage display." /
  "Prohibido: abra la dirección o el código QR…" — nothing from the request is echoed back.
- Step 4: `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` (other sites can't frame the remote).

### TC-SEC-13 · An empty PIN never lets anyone in  `P0`
**Steps**
1. Quit the app. In `.e2e-data/data/settings.json` set `"remotePin": ""`. Relaunch with `--keep`.
2. Settings → note the PIN. node: connect `ws://localhost:7272/ws?role=remote&pin=` (empty).
3. operator `browser_evaluate` → `await window.api.settings.set({ remotePin: '' })`, then `(await window.api.settings.get()).remotePin`.
**Expected**
- Step 1: the app made a new 6-digit PIN at startup (Settings shows it).
- Step 2: `"authed":false`.
- Step 3: the PIN is unchanged — the operator page can't set the PIN (only ↻ in Settings makes a new one).

### TC-SEC-14 · The app's pages can't read or serve other files  `P0`
**Steps** (operator tab, `browser_evaluate`)
1. `(await fetch('media://local/' + encodeURIComponent('C:\\Windows\\win.ini'))).status`
2. `(await fetch('media://local/' + encodeURIComponent('<abs path of .e2e-data/data/settings.json>'))).status`
3. `await window.api.files.readText('C:\\Windows\\win.ini').catch(e => 'refused: ' + e.message)`
4. `await window.api.db.remove('presentations', '..\\..').then(() => 'done')`, then check `.e2e-data/cache/` and
   `.e2e-data/data/` still exist.
**Expected**
- Steps 1–2: **404** (media:// serves only video, audio, image and PDF files).
- Step 3: refused (only a file picked in a dialog can be read).
- Step 4: nothing outside one presentation's own cache folder is deleted.

### TC-SEC-15 · Dropping a file outside a drop zone doesn't replace the page  `P1`
**Steps**
1. Live page: drag `tests/fixtures/sample.pdf` from Explorer onto the slide grid (not a drop zone).
   With Playwright: `browser_drop` the file onto `.slides-grid`, or on the projector window.
**Expected**
- The operator page (and projector) stay as they are — the window does not navigate to the PDF or show a file.

### TC-SEC-16 · Logs never quote a file's text or name  `P0`
Logs are attached to public bug reports.
**Steps**
1. Write `.e2e-data/broken-bible.json` containing `{"books":[[["PLACEHOLDER-VERSE-TEXT` (cut short on purpose).
   Bible → import with abbreviation `BRK` → `queueOpenFiles([<that file>])` first.
2. Copy `tests/fixtures/sample.mp3` to `.e2e-data/Private Person Name.pptx` and import it as a presentation.
3. Open the log: `.e2e-data/.userdata/logs/main.log` (test runs keep their own logs).
**Expected**
- Both imports show an error toast; the app keeps running.
- `main.log` has lines "bible import failed: SyntaxError" and "presentation import via … failed: …" with only a
  short code (`exit 1`, `ENOENT`, `no-slides`, an error kind…).
- `main.log` contains neither `PLACEHOLDER-VERSE-TEXT` nor `Private Person Name`.
- After a phone and a stage screen have connected (and one wrong PIN was tried), `main.log` has lines like
  "LAN remote connected (1 devices)" and "LAN stage connection refused (wrong PIN)" but **no IP addresses**.

### TC-SEC-17 · A custom data folder doesn't move the app's profile  `P2`
`ICCWORSHIP_DATA` is a user setting (data on another drive); only test runs get a separate profile.
**Steps**
1. Quit every ICCWorship. In PowerShell: `$env:ICCWORSHIP_DATA = "$env:TEMP\icc-data"; npx electron .` (after `npm run build`).
2. Quit it, then look inside `%TEMP%\icc-data`.
**Expected**
- The data (`data\`, `backups\`…) is in `%TEMP%\icc-data`, but there is **no** `.userdata` folder there: logs stay in
  `%APPDATA%\ICCWorship\logs`.
- Starting ICCWorship normally while that copy runs just brings the running window forward (one instance only).

### TC-SEC-18 · Page errors in the log never quote their text  `P1`
An error's message can quote what a page was reading (a SyntaxError quotes the JSON: a song, a Bible).
**Steps**
1. Operator tab: `browser_evaluate` →
   `setTimeout(() => Promise.reject(new SyntaxError('Unexpected token PLACEHOLDER-LYRIC-TEXT is not valid JSON')))`.
2. Open `.e2e-data/.userdata/logs/main.log`.
**Expected**
- The operator shows an error toast (the failure isn't silent).
- `main.log` has `[index.html] unhandled rejection: SyntaxError` and does **not** contain `PLACEHOLDER-LYRIC-TEXT`.
