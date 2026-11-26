# 03 · Songs

### TC-SONG-01 · Create a bilingual song  `P0` 📸
**Steps**
1. Songs → **New song**. Title (English) `E2E Song`, Title (Spanish) `Canto E2E`.
2. Verse 1 → ENGLISH: `Line one\nLine two`, ESPAÑOL: `Línea uno\nLínea dos`.
3. Click **+ Chorus**; ENGLISH `Chorus here`, ESPAÑOL `Coro aquí`.
**Expected**
- The list shows "E2E Song" with **ES** and **EN** pills. Preview shows 2 slides with both languages.
- Navigating away and back keeps everything (autosave).

### TC-SONG-02 · Arrangement repeats  `P1`
**Pre:** TC-SONG-01
**Steps**
1. In Arrangement click `+ Verse 1`, `+ Chorus`, `+ Chorus` (after the default order) — or use **Repeat** on Chorus.
**Expected**
- Arrangement chips read in the chosen order; preview slide count increases accordingly.
- Clicking a chip removes it; **Reset** returns to written order.

### TC-SONG-03 · Lines per slide  `P1`
**Steps**
1. Open **A Mighty Fortress Is Our God** (9 lines per verse). Change Lines / slide 3 → 9.
**Expected**
- Preview drops from 6 slides to 2. Spanish and English stay aligned line-for-line.

### TC-SONG-04 · Accent-insensitive search  `P0`
**Steps**
1. Search `senor omnipotente`. 2. Search `fortress`. 3. Search `xyz123`.
**Expected**
- 1 finds Holy, Holy, Holy (lyrics match without accents). 2 finds A Mighty Fortress. 3 shows no songs.

### TC-SONG-05 · Paste import (EN + ES with headers)  `P0`
**Steps**
1. Songs → **Import** → "Paste lyrics". Title `Pasted Song`.
2. English: `Verse 1\nHello\n\nChorus\nPraise\n\nVerse 2\nWorld\n\nChorus\nPraise`
3. Spanish: `Verso 1\nHola\n\nCoro\nAlabanza\n\nVerso 2\nMundo\n\nCoro\nAlabanza` → **Create**.
**Expected**
- Song has 3 sections (Verse 1, Chorus, Verse 2) and arrangement V1 C V2 C. Preview: 4 slides, each bilingual.

### TC-SONG-06 · Import OpenLyrics file (bilingual)  `P0`
**Fixture:** `tests/fixtures/sample-openlyrics.xml`
**Steps**
1. `queueOpenFiles([<abs path to fixture>])`. 2. Songs → Import → "From files" → **Choose files**.
**Expected**
- Toast "1 song imported". New song "E2E Test Hymn" / "Himno de Prueba E2E", CCLI 1234567.
- Arrangement v1 c1 v2 c1; verse 1 has English and Spanish text.

### TC-SONG-07 · Import ChordPro and chords on stage only  `P1`
**Fixture:** `tests/fixtures/sample.chordpro`
**Steps**
1. Import the file as in TC-SONG-06. 2. **Show now**. 3. Settings → **Open stage display window**; in the stage tab click 🎸.
**Expected**
- Song "E2E Chord Song", key G, CCLI 7654321. Projector shows lyrics **without** `[G]` brackets.
- Stage shows chord names above the lyrics when 🎸 is on.

### TC-SONG-08 · Export OpenLyrics round trip  `P2`
**Steps**
1. Open "E2E Test Hymn" → `queueSaveFile('<repo>/.e2e-data/export.xml')` → **Export**.
2. Delete the song (confirm). 3. Re-import `.e2e-data/export.xml`.
**Expected**
- File exists; re-imported song has the same titles, sections and both languages.

### TC-SONG-09 · Show now & add to plan  `P1`
**Steps**
1. On a song click **Show now**. 2. Click **Add to plan**.
**Expected**
- Projector shows slide 1 immediately (no plan item highlighted as LIVE).
- Toast "Added to …"; the plan now ends with that song.

### TC-SONG-10 · Delete song  `P2`
**Steps**
1. Delete "Pasted Song", accept the confirm dialog.
**Expected**
- Song disappears from the list and search.

### TC-SONG-11 · Text dragged into the lyrics box is inserted  `P2` (manual)
**Steps**
1. Songs → open a song. In Notepad, select two lines of placeholder text and drag them into the lyrics box.
**Expected**
- The text is inserted where it was dropped (dropping text into a text box works as in any program). The page
  does not navigate anywhere.
