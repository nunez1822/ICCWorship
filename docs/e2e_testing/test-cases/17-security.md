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
http://localhost:7272/file?p=<abs path of .e2e-data/data/settings.json>
http://localhost:7272/file?p=<abs path of a library image that is NOT live right now>
```
**Expected**
- All return 403 or 404 — never 200. (`/file` only serves media that is on screen right now.)
- While that image **is** live, its `/file?p=` URL returns 200.
- After `Esc` it **still returns 200**: Esc keeps the cleared slide so `Space` can put it back (TC-CONF-16), and
  the stage display previews it as "Next" (`refreshAllowList` in `src/main/server.ts`). Only that one slide stays
  allowed — the item's other image slides return 403 after Esc.
- After moving to another item (`Ctrl+→`), the image's URL returns 403.
- `http://localhost:7272/favicon.ico` → 204 (no 404 error in the phone's console).

### TC-SEC-04 · PIN guessing is slowed down  `P1`
**Steps** — operator tab `browser_evaluate` (or a node script) tries 50 wrong PINs:
```js
let n = 0; for (let i = 0; i < 50; i++) { await new Promise(r => { const w = new WebSocket(`ws://localhost:7272/ws?role=remote&pin=${String(i).padStart(4,'0')}`); w.onmessage = e => { if (JSON.parse(e.data).authed) n++; }; w.onclose = r; }) } n
```
**Expected**
- After a handful of wrong attempts, further attempts from that device are delayed or refused for a while (a 4-digit PIN must not be guessable in seconds by anyone on the Wi-Fi).
- A phone that already knows the PIN can still connect.
- *Note:* if no limiting exists, record it as a finding with how long a full 0000–9999 scan takes.

### TC-SEC-05 · Stage connections can't control the screen  `P0`
**Steps**
1. Without a PIN: `const w = new WebSocket('ws://localhost:7272/ws?role=stage')`; on open send `{"type":"command","cmd":{"type":"next"}}` and `{"type":"command","cmd":{"type":"black"}}`.
2. With a wrong PIN as remote: send the same commands immediately after open (before it closes).
**Expected**
- Projector unchanged in both cases.

### TC-SEC-06 · Private prayer requests never leave the operator  `P0`
**Steps**
1. Add a private request `Juan — SECRET-PRIVATE-TEXT` and a public one. Show now (prayer slide).
2. Phone `/stage` and `/remote`: collect every WebSocket message (e.g. `browser_evaluate` wrapping `WebSocket.prototype.onmessage`, or open a raw socket and log for 10 s).
3. Export the run sheet PDF and print preview of a plan containing the Prayer item.
**Expected**
- `SECRET-PRIVATE-TEXT` appears in **no** network message, stage, phone, projector, PDF or printout.

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
