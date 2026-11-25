# 08 · PowerPoint & PDF

Fixtures: `sample.pptx` (2 slides: "Bienvenidos / Welcome", "Tres puntos"; notes "Saludar a las visitas",
"Leer 1 Corintios 13:13"), `sample.pdf` (same deck as PDF).

### TC-PRES-01 · Converter detection  `P1`
**Steps**
1. Media → Presentations tab.
**Expected**
- Shows ✓/✗ for Microsoft PowerPoint and LibreOffice, ✓ PDF and ✓ built-in reader, matching what is installed on the PC,
  and the matching explanation sentence ("slides will look exactly like the original" when PowerPoint is installed).

### TC-PRES-02 · Import PowerPoint  `P0` 📸
**Steps**
1. `queueOpenFiles([sample.pptx])` → **Import PowerPoint / PDF**. Wait up to 60 s.
**Expected**
- Toast "“sample” imported — 2 slides". Card badge says **PowerPoint** if installed (else LibreOffice / Text).
- Opening the card shows 2 slide pictures and the speaker notes 📝.

### TC-PRES-03 · Present PowerPoint with notes on stage  `P0`
**Steps**
1. Open the card → **Show now**. 2. Settings → Open stage display window. 3. Space.
**Expected**
- Projector shows "Bienvenidos / Welcome" slide image (letterboxed if 4:3).
- Stage shows note "Saludar a las visitas", then "Leer 1 Corintios 13:13" after Space.

### TC-PRES-04 · Import PDF  `P0`
**Steps**
1. `queueOpenFiles([sample.pdf])` → Import PowerPoint / PDF.
**Expected**
- Progress pill "Rendering page 1 of 2…", then toast with 2 slides; badge **PDF**; Show now works.

### TC-PRES-05 · Text-only fallback with translation  `P1`
**Steps**
1. Operator tab `browser_evaluate`: `await window.api.pres.import('<abs>/tests/fixtures/sample.pptx', 'text')`, then reload the page.
2. Open the new "Text" card, type Spanish/English translations for slide 2, Show now, press `3`.
**Expected**
- Text slides use the church theme; slide 2 shows the original text and the typed translation stacked.

### TC-PRES-06 · Re-import  `P2`
**Steps**
1. Open a PowerPoint card → **Re-import**.
**Expected**
- Same card is updated (no duplicate), toast shows slide count.

### TC-PRES-07 · Images as slides  `P2`
**Steps**
1. `queueOpenFiles([sample.jpg])` → **Images as slides**.
**Expected**
- A presentation with 1 slide, badge "Images".

### TC-PRES-08 · Unsupported file  `P2`
**Steps**
1. `queueOpenFiles([sample.mp3])` → Import PowerPoint / PDF.
**Expected**
- Error toast "That file type is not supported." — nothing created.
