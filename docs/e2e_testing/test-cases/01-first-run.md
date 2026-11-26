# 01 · First run & app shell

### TC-FR-01 · Welcome dialog appears on first launch  `P0`
**Pre:** fresh
**Steps**
1. Switch to the operator tab (`index.html`).
**Expected**
- A dialog titled "Bienvenido a ICCWorship" is shown in **Spanish** (default language). 📸
- Six feature tiles and a "Church name / Nombre de la iglesia" field are visible.
- The projector tab (`output.html`) exists and is black/empty.

### TC-FR-02 · Finish welcome creates this Sunday's plan  `P0`
**Pre:** fresh
**Steps**
1. In the dialog click **English**, type `E2E Test Church`, click **Start**.
**Expected**
- Dialog closes; top-left shows "ICCWorship" and "E2E Test Church".
- Live page shows a plan named "Sunday Service / Servicio Dominical" dated next Sunday with 9 items
  (Countdown, Welcome, Holy Holy Holy, A Mighty Fortress, Announcements, Doxology, John 3:16-17, Sermon, Closing prayer).
- Relaunching with `--keep` does **not** show the welcome again.

### TC-FR-03 · App language switch is complete  `P0`
**Steps**
1. Top bar → **Español**. Visit every left-nav page.
2. Top bar → **English**. Visit every page again.
**Expected**
- All navigation labels, buttons and headings change language; no raw keys such as `live.goLive` or `nav.plans` anywhere.

### TC-FR-04 · Keyboard shortcut help  `P2`
**Steps**
1. Click on an empty area of the Live page, press `?`.
**Expected**
- "Keyboard shortcuts" dialog lists Space, arrows, Ctrl+→, B, C, L, Esc, P ("Play / pause video or music"), 1, 2, 3.
  Esc closes it.

### TC-FR-05 · Projector window toggle  `P1`
**Steps**
1. Top bar → "Projector on". 2. Click it again.
**Expected**
- First click closes the `output.html` tab and the button reads "Projector off"; second click reopens it.

### TC-FR-06 · Light / dark appearance  `P2`
**Steps**
1. Settings → Appearance → **Light**, then **Dark**.
**Expected**
- Operator UI switches to a light background and back. The projector is unaffected.
