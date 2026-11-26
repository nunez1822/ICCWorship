# 03 · Songs

Backing-track fixture: `tests/fixtures/sample-stereo.mp3` — 12 s, 1 kHz tone in the center (both channels) plus a
440 Hz tone on the left only, placeholder audio made with
`ffmpeg -f lavfi -i "sine=frequency=1000:duration=12" -f lavfi -i "sine=frequency=440:duration=12" -filter_complex
"[0:a]volume=0.35[c];[1:a]volume=0.35[l];[c][l]amerge=inputs=2,pan=stereo|c0=c0+c1|c1=c0[out]" -map "[out]"
-c:a libmp3lame -b:a 192k -joint_stereo 0 sample-stereo.mp3`. `sample.mp3` is mono.

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

### TC-SONG-12 · Add a backing track that already has no singing ("Use as is")  `P1`
**Setup** (once; the "Track Test" song used by the backing-track cases — placeholder lyrics):
```js
await window.api.db.upsert('songs', { id: 'track-test', title: 'Track Test', titleEs: 'Prueba de pista', tags: [], linesPerSlide: 2,
  arrangement: [], createdAt: Date.now(), updatedAt: Date.now(),
  sections: [{ id: 'v1', type: 'verse', label: 'Verse 1', en: 'Line one\nLine two\n\nLine three\nLine four\n\nLine five\nLine six', es: '' }] })
await window.api.e2e.queueOpenFiles(['<repo>/tests/fixtures/sample-stereo.mp3'])
```
Reload the operator (`location.reload()`), then do TC-SONG-12.
**Steps**
1. Songs → "Track Test" → under the arrangement, **🎵 Backing track** → **＋ Add backing track…**.
2. **📂 Choose a file…** (the queued `sample-stereo.mp3`). 3. **✓ Yes — use it as is**.
**Expected**
- The window shows a progress bar, then the toast "🎵 Backing track ready." and closes. A click beside the window
  while it works does not close it.
- The card shows "▶ Listen · sample-stereo.mp3 · ⏱ Record timing · Replace… · Remove"; **🎵 Show with track** appears next to Show now.
- `(await window.api.db.list('songs')).find(s => s.id === 'track-test').track` →
  `{ url: 'media://local/tracks%2Ftrack-test-<digits>.ogg', sourceName: 'sample-stereo.mp3', vocalsRemoved: false }`,
  and the file is in `.e2e-data/tracks/` (about 240 KB).
- The file plays properly: `const a = new Audio(url)` → `a.duration` ≈ 12 (within 0.05 s); setting `a.currentTime = 7`
  plays from there; `decodeAudioData` of it gives 576000 samples per channel (12 s × 48 kHz).

### TC-SONG-13 · Remove a backing track  `P2`
**Pre:** TC-SONG-12
**Steps**
1. Songs → "Track Test" → **Remove** → accept the confirm (stub `window.confirm = () => true` in the same call).
**Expected**
- Toast "Backing track removed."; the card says "No backing track…"; **Show with track** is gone.
- The `.ogg` file is gone from `.e2e-data/tracks/` (unless the song is the live item: then it goes once another item
  goes live — Esc then `Space` can still bring the music back, so the file stays until then).
- If **▶ Listen** was playing when the track was removed or replaced, the button says **▶ Listen** again, not Stop.

### TC-SONG-14 · Deleting a song deletes its backing track  `P2`
**Pre:** TC-SONG-12 (a song with a track that is not on screen)
**Steps**
1. Delete "Track Test" (stub the confirm; read the text it was given).
**Expected**
- The confirm says "Delete “Track Test”?" and "🎵 Its backing track is deleted too." (a song without a track: no
  such line).
- The song is gone and so is its `.ogg` in `.e2e-data/tracks/`. Other songs' tracks are untouched.

### TC-SONG-15 · Remove the voice from a stereo recording (no AI)  `P1`
**Pre:** TC-SONG-12's setup (a song, `sample-stereo.mp3` queued)
**Steps**
1. **Add backing track…** → choose `sample-stereo.mp3` → **No — remove the voice**.
2. Leave **Normal**; **▶ Listen to a 20-second sample**, switch **Original ⇄ Without voice**, **⏹ Stop**.
3. **✓ Save the track**.
**Expected**
- Step 1: "How much: Less · Normal · More", the sample button and the limits note ("Works best on studio recordings…").
- Step 2: the sample plays on this PC (A/B switch at the same moment of the song).
- Step 3: progress "Removing the voice… %", then "🎵 Backing track ready."; the card shows the badge **voice removed**;
  the song's `track` has `vocalsRemoved: true, preset: 'normal'`.
- The voice is really gone (gain-independent check, in `browser_evaluate`): decode the saved track and the source
  with `OfflineAudioContext(2,1,48000).decodeAudioData`, measure 1000 Hz and 440 Hz (Goertzel over the middle) in the
  left channel: `level(1000)/level(440)` drops by **≥ 15 dB** compared with the source (measured: −26 dB). Same length.
- A 6-minute song takes well under 30 s and the operator window keeps responding.

### TC-SONG-16 · A mono file is explained  `P1`
**Steps**
1. **Add backing track…** → choose `sample.mp3` (mono) → **No — remove the voice**.
**Expected**
- "⚠ This file is mono (one channel): the voice can't be separated…"; there is no **Save the track** button.
  **← Back** and **Yes — use it as is** still work (a mono instrumental is fine to play).

### TC-SONG-17 · Record the timing, then fine-tune it  `P1`
**Pre:** TC-SONG-12 ("Track Test", 3 slides, with its track)
**Steps**
1. "Track Test" → **⏱ Record timing** → **⏺ Start**. Press `Space` about 1 s, 3 s and 6 s into the music.
2. **⏹ Stop**. 3. Change the three times to `2`, `5`, `8` (type, or −½ / +½); **▶** next to a time plays from 2 s
   before it. 4. **✓ Save**.
**Expected**
- While recording: "On screen now: 🎵 Intro (no text)" before the first press, then the slide each press started, and
  "Next press (n of 3)". `←` / `Backspace` takes the last press back.
- After Stop: three increasing times (about 1, 3, 6). Save is disabled until every slide has a time.
- A time that isn't after the one before it (press −½ on slide 2 until it is below slide 1): Save is disabled, that
  time is red, and the message says "Each slide must start after the one before it…" (not "3 of 3 slides have a
  time").
- Step 4: "⏱ Timing saved…"; the card shows **⏱ timing** and **Edit timing**;
  `track.timings` = `[2, 5, 8]` and `track.timingsKey` is set.
- **Edit timing** opens the list directly (no recording); **Remove the timing** removes it.
- The −½ / +½ buttons are read out as "Half a second earlier" / "Half a second later" ("Medio segundo antes" /
  "Medio segundo después" in Spanish) and have the same tooltip.

### TC-SONG-18 · Cancel while the file is still being read makes no track  `P1`
**Pre:** TC-SONG-12's setup, "Track Test" without a backing track; a large audio file queued
(`window.api.e2e.queueOpenFiles([...])`, a few minutes long so reading takes a moment)
**Steps**
1. **＋ Add backing track…** → **📂 Choose a file…** → **✓ Yes — use it as is**.
2. While it says "Reading…", **Cancel** and accept the confirm (stub `window.confirm = () => true` in the same call).
3. Wait 15 s. 4. Repeat with **No — remove the voice** and cancel while it reads.
**Expected**
- The window closes at once. No "🎵 Backing track ready." toast ever appears, and no error toast.
- The song still has no `track` (`db.list('songs')`), and no new `.ogg` for it is left in `.e2e-data/tracks/`.

### TC-SONG-19 · Closing the window after the A/B preview leaves no sound device open  `P2`
**Pre:** TC-SONG-15 step 2 done (the sample played)
**Steps**
1. Close the window (✕). 2. Open **Add backing track…** again, choose the file, **No — remove the voice**, play
the sample again. Repeat 3 times.
**Expected**
- The sample plays every time, and closing the window stops it at once (no sound left playing).

### TC-SONG-20 · Replacing the live song's track mid-song: Esc then Space still plays  `P1`
**Pre:** "Track Test" live with its music; a second file queued (`window.api.e2e.queueOpenFiles([...])`)
**Steps**
1. Songs → "Track Test" → **Replace…** → choose the file → **Use it as is**. 2. `Esc`. 3. `Space`.
4. Double-click another plan item.
**Expected**
- Steps 2–3: the music fades out and comes back where it was (no "can't be played" toast): the old `.ogg` is still
  in `.e2e-data/tracks/`.
- Step 4: the old `.ogg` is deleted; the new one stays.

### TC-SONG-21 · A whole-service recording is turned away before it is decoded  `P1`
**Pre:** TC-SONG-12's setup, "Track Test" without a backing track. Make a 40-minute silent WAV (8 kHz mono 8-bit,
about 19 MB: under the 200 MB size limit) and queue it:
```bash
node -e "const n=8000*2400,b=Buffer.alloc(44+n,128);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(8000,28);b.writeUInt16LE(1,32);b.writeUInt16LE(8,34);b.write('data',36);b.writeUInt32LE(n,40);require('fs').writeFileSync('.e2e-data/long.wav',b)"
```
`window.api.e2e.queueOpenFiles(['<repo>/.e2e-data/long.wav'])`
**Steps**
1. **＋ Add backing track…** → **📂 Choose a file…** → **✓ Yes — use it as is**.
**Expected**
- Within a few seconds the toast "⚠ The file is longer than 20 minutes." ("⚠ El archivo dura más de 20 minutos.")
  appears and the window is back at the file choice. The operator window stays responsive throughout.
- The song still has no `track`, and no new `.ogg` is in `.e2e-data/tracks/`. The log says
  `backing track not made: too-long`.
