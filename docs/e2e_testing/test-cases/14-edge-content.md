# 14 · Edge content: odd text, odd files, odd references

Content real churches will throw at the app: one-language songs, accents and emoji, long lines,
file names with symbols, unusual Bible references. Helper files are created at test time in
`<repo>/.e2e-data/tmp/` (see each case) so the repo needs no extra fixtures.

### TC-EDGE-01 · English-only song in ES and ES+EN screen modes  `P0`
**Steps**
1. Live → screen **ES + EN** → Songs → **Amazing Grace** (English only) → **Show now**.
2. Press `2` (Spanish only). 3. Press `1` (English only).
**Expected**
- Step 1: English lines shown, with **no** empty Spanish block or stray divider line above them.
- Step 2: the projector is **not blank** — it falls back to the English text (a song is never invisible because one language is missing).
- Step 3: English shown normally. The same holds on the stage display.

### TC-EDGE-02 · Spanish-only song in EN mode  `P1`
**Steps**
1. Songs → New song → Title (Spanish) `Solo Español`, leave Title (English) empty, Verse 1 ESPAÑOL `Sólo en español` (ENGLISH empty).
2. Show now; press `1`, `2`, `3`.
**Expected**
- List shows the Spanish title (not "New song" / blank) with only the **ES** pill.
- Projector shows `Sólo en español` in every mode (EN falls back to Spanish); footer has no empty " / " part.

### TC-EDGE-03 · Accents, quotes, emoji and markup are shown literally  `P0` 📸
**Steps**
1. New song: Title (English) `Señor 🙏 "Quoted" & <b>bold</b> — ñandú's`, Verse 1 ENGLISH `Line with <i>tags</i> & emoji 🎶`, ESPAÑOL `¿Dónde está? ¡Aquí! «comillas»`.
2. Show now. Check operator list, preview, projector, stage window and phone remote.
3. Songs search `nandu`, then `"quoted"`.
**Expected**
- Everywhere the text appears exactly as typed: `<b>`/`<i>` are visible characters, not bold/italic; emoji render; «» ¿¡ intact.
- No dialog/alert opens; console has no errors.
- Both searches find the song (accent- and case-insensitive).

### TC-EDGE-04 · Very long line and very long verse  `P1` 📸
**Steps**
1. New song, Verse 1 ENGLISH: one line of ~400 characters (no line breaks). Verse 2 ENGLISH: 20 short lines. ESPAÑOL similar.
2. Show now, step through all slides on ES + EN.
**Expected**
- No text is cut off at the projector edges (it wraps / shrinks to fit); nothing overlaps the footer.
- Verse 2 is split into several slides according to Lines / slide; slide count in the preview matches the live grid.

### TC-EDGE-05 · Song with no lyrics  `P1`
**Steps**
1. New song `Empty Song` (no section text). 2. Show now. 3. Add it to the plan and go live on it, then press `Space`.
**Expected**
- No crash or blank operator window. Either a clear "no slides" state or a title-only slide.
- `Space` moves on to the next plan item; projector does not freeze on stale content.

### TC-EDGE-06 · Media file names with symbols  `P0`
**Setup (Bash):** copy fixtures to names with spaces, `#`, `%`, `&`, brackets and accents:
`mkdir -p .e2e-data/tmp && cp tests/fixtures/sample.mp4 ".e2e-data/tmp/Canción #1 100% [final] & ñ.mp4" && cp tests/fixtures/sample.jpg ".e2e-data/tmp/Imagen é ü (copia).jpg"`
**Steps**
1. Media → `queueOpenFiles` both files → Add files. 2. Show now on each.
3. Phone → `http://localhost:7272/stage#pin=<PIN>` while each is live.
**Expected**
- Thumbnails generated; names shown correctly.
- Video plays on the projector; image displays — no "missing" badge, no black screen.
- Stage page on the phone loads the image (its `/file/<token>` URL returns 200; the URL never contains the file's path).

### TC-EDGE-07 · Media in a non-Latin folder  `P2`
**Setup (Bash):** `mkdir -p ".e2e-data/tmp/презентация 视频" && cp tests/fixtures/sample.mp4 ".e2e-data/tmp/презентация 视频/видео.mp4"`
**Steps**
1. Add the file, Show now, then use it as a theme **Motion video** background.
**Expected**
- Plays as an item and as a background; survives an app restart (`--keep`) without a missing badge.

### TC-EDGE-08 · Unusual Bible references  `P0`
**Steps** — Bible → Look up, type each and check:
| Input | Expected |
|---|---|
| `San Juan 3:16` | Juan 3:16 (common way to say it in Spanish) |
| `Juan 3:36-4:2` | spans two chapters: 3:36, 4:1, 4:2 (3 rows) |
| `Judas 3` / `Jude 3` | single-chapter book: verse 3, not chapter 3 |
| `Cantares 2:1` / `Song of Solomon 2:1` / `Song of Songs 2:1` | same verse |
| `Salmo 23` (singular) | Salmos 23 |
| `1Jn 4:8` and `1 jn 4:8` | 1 Juan 4:8 |
| `Genesis 1:1` and `Génesis 1:1` | same verse |
| `Juan 3:99` | red message (verse doesn't exist), no empty slide |
| `Salmos 119` | 176 verses; **Show now** produces many slides and stepping to the last works |
**Expected**
- As in the table; nothing crashes; no blank heading.

### TC-EDGE-09 · Paste import where languages don't line up  `P1`
**Steps**
1. Songs → Import → Paste. English: `Verse 1\nA\n\nChorus\nB\n\nVerse 2\nC`. Spanish: `Verso 1\nUno\n\nCoro\nDos` (no Verso 2). Create.
2. Repeat with English only (Spanish box empty), then Spanish only.
**Expected**
- Step 1: Verse 2 has English `C` and empty Spanish — Spanish text is **not** shifted into the wrong section.
- Step 2: songs created with one language; correct **EN** / **ES** pills.

### TC-EDGE-10 · Broken and foreign import files  `P1`
**Setup (Bash):**
```
printf '<?xml version="1.0"?><song><properties><titles><title>Broken' > .e2e-data/tmp/broken.xml
printf '' > .e2e-data/tmp/empty.xml
printf '<?xml version="1.0"?><html><body>not a song</body></html>' > .e2e-data/tmp/notasong.xml
```
**Steps**
1. Songs → Import → From files → queue `[broken.xml, empty.xml, notasong.xml, tests/fixtures/sample-openlyrics.xml]` → Choose files.
**Expected**
- The valid file imports ("1 song imported"); the others produce a clear error naming the file(s).
- No half-empty "Untitled" songs are created for the bad files. App stays usable.

### TC-EDGE-11 · Text encodings (Windows-1252 / UTF-16)  `P2`
**Setup (PowerShell):**
```
$t = "{title: Señor Jesús}`n[G]Canción de alabanza, ¡Señor!"
[IO.File]::WriteAllText("$PWD\.e2e-data\tmp\ansi.chordpro", $t, [Text.Encoding]::GetEncoding(1252))
[IO.File]::WriteAllText("$PWD\.e2e-data\tmp\utf16.chordpro", $t, [Text.Encoding]::Unicode)
```
**Steps**
1. Import both files.
**Expected**
- Titles and lyrics read `Señor Jesús` / `¡Señor!` — no mojibake like `SeÃ±or` or `Se�or`.

### TC-EDGE-12 · Importing the same song twice  `P1`
**Steps**
1. Import `sample-openlyrics.xml`. Change its Author to `EDITED`.
2. Import the same file again → choose **Skip them**. 3. Again → **Replace**. 4. Again → **Keep both**.
5. Media → Import PowerPoint / PDF `sample.pdf` twice; then add `sample.jpg` to the library twice.
**Expected**
- Step 2–4: a panel "1 song is already in your library" (matched by CCLI number, or title + first line) with Skip / Replace / Keep both.
  Skip: nothing changes ("1 song skipped"). Replace: same library entry (plans keep it), author back to the file's. Keep both: a second song "E2E Test Hymn (2)".
- Step 5: the PDF asks "Already imported" — Update (same presentation) / Keep both / Cancel; the image says "1 file was already in the library".
- The same picture under another file name (copy `sample.jpg` to `.e2e-data/tmp/otra.jpg`, add it): no second copy
  in `.e2e-data/media/` (the library spots the same content and reuses the copy already there).

### TC-EDGE-13 · Long and emoji screen messages  `P1` 📸
**Steps**
1. A song is live (ES + EN). Message on screen: a 250-character sentence with emoji → Show.
2. Press `B` (black), then `L` (logo) while the message is up.
**Expected**
- Banner wraps inside the screen width and stays readable (not cut off, not covering the whole slide).
- Record whether the banner stays visible over Black and Logo. Recommended: **visible** — urgent nursery calls must reach the room even when the screen is black.

### TC-EDGE-14 · Countdown to a time that has passed  `P1`
**Steps**
1. Plan → Countdown item → ⚙ → count down to a time 5 minutes **ago** → Save → go live.
2. Change it to a time just after midnight tonight.
**Expected**
- Step 1 shows `0:00` (or a "starting now" state) — never negative numbers or `NaN`.
- Step 2 counts down the correct hours/minutes across midnight.

### TC-EDGE-15 · Late service crossing midnight  `P2`
**Steps**
1. Plan start time `23:30` (watch-night service). Durations as in the sample plan.
2. Export the run sheet PDF.
**Expected**
- Times column rolls over correctly: `23:30 … 00:15 …` — never `24:15` or negative.
- Run sheet shows the same times.

### TC-EDGE-16 · Empty plan  `P1`
**Steps**
1. Create a plan, remove every item. Select it on the Live page. Press `Space`, `Ctrl+→`, `B`.
2. Phone remote → Plan tab.
**Expected**
- Clear empty state; keys do nothing harmful (B still toggles black); no console errors.
- Phone shows an empty plan gracefully: the Plan tab says "No items in this plan." (not a blank area).

### TC-EDGE-17 · Scripture with no second language  `P1`
**Steps**
1. Bible → Main RV1909, Second **— none —** → `Juan 3:16` → Show now. Press `1` (English).
**Expected**
- Projector still shows the Spanish verse (falls back rather than going blank); footer shows only `Juan 3:16 (RV1909)`.

### TC-EDGE-18 · Large library stays fast  `P2`
**Setup (operator tab `browser_evaluate`):**
```js
for (let i = 0; i < 300; i++) await window.api.db.upsert('songs', { id: 'bulk-' + i, title: 'Bulk Song ' + i, titleEs: 'Canto ' + i, sections: [{ id: 's1', type: 'verse', label: 'Verse 1', en: 'Line ' + i + '\nGrace and peace', es: 'Línea ' + i + '\nGracia y paz' }], arrangement: ['s1'], linesPerSlide: 4 })
location.reload()
```
**Expected**
- Songs page lists 300+ songs; typing in search filters within ~0.5 s per keystroke; scrolling is smooth.
- App relaunch (`--keep`) time is not noticeably slower.

### TC-EDGE-19 · Extreme image sizes  `P2`
**Setup (PowerShell):**
```
Add-Type -AssemblyName System.Drawing
foreach ($s in @(@(16,16,'tiny'), @(1080,4000,'tall'), @(6000,400,'wide'))) { $b = New-Object Drawing.Bitmap $s[0],$s[1]; $g=[Drawing.Graphics]::FromImage($b); $g.Clear([Drawing.Color]::SteelBlue); $b.Save("$PWD\.e2e-data\tmp\$($s[2]).png"); $g.Dispose(); $b.Dispose() }
```
**Steps**
1. Add the three images; Show now each; use `tall.png` as a theme Image background behind a song.
**Expected**
- Items are letterboxed (aspect kept, not stretched); background covers the screen without distortion; lyrics readable.

### TC-EDGE-20 · A damaged audio file makes no track and says why  `P1`
**Setup:** `node -e "require('fs').writeFileSync('.e2e-data/tmp/broken.mp3', Buffer.alloc(5000, 7))"`
**Steps**
1. Songs → a song → **Add backing track…** → choose `broken.mp3` → **Use it as is**.
**Expected**
- An error toast "⚠ This file can't be opened (damaged, or a format such as WMA, ALAC or AIFF)…"; the window stays
  open to choose another file; the song has no track.

### TC-EDGE-21 · A 2-second file works  `P2`
**Setup:** `ffmpeg -f lavfi -i "sine=frequency=440:duration=2" -ac 2 .e2e-data/tmp/short.wav` (or any 2 s stereo WAV)
**Steps**
1. Make it the backing track of "Track Test" (**Use it as is**), then **Show with track**.
**Expected**
- The track is made; it plays and ends after ~2 s; the lyrics stay up when it ends.

### TC-EDGE-22 · No new track while the data is read-only  `P1`
**Pre:** data opened read-only (TC-BAK-08)
**Steps**
1. Click **＋ Add backing track…** (or **Replace…**) on a song. 2. On a song with a track, **⏱ Record timing**.
**Expected**
- At once, before any file is chosen or read: the read-only message "Not saved: this data is open read-only (see
  the red bar at the bottom)" — not "The backing track could not be made". No window opens, no file appears in
  `.e2e-data/tracks/`.
- (If the data becomes read-only while a track is being made, the same message appears and the window closes.)

### TC-EDGE-23 · "Remove the voice" on a file whose channels are the same  `P2`
**Setup:** `ffmpeg -i tests/fixtures/sample.mp3 -ac 2 .e2e-data/tmp/fake-stereo.mp3` (two identical channels)
**Steps**
1. **Add backing track…** → `fake-stereo.mp3` → **No — remove the voice**.
**Expected**
- "⚠ Both channels of this file are (almost) the same: removing the center would remove nearly everything…" and no
  **Save the track** button.

### TC-EDGE-24 · A song changed after its timing was recorded  `P1`
**Pre:** TC-SONG-17
**Steps**
1. "Track Test" → **＋ Chorus** and type one line in it (4 slides now). 2. **🎵 Show with track**.
3. Remove that chorus (✕); then fix a word in a line (a typo, no line added); Show with track again.
**Expected**
- Step 1: the card's badge becomes "⚠ timing out of date".
- Step 2: the lyrics start on slide 1 (no intro), nothing moves by itself, and one message says the timing no longer
  fits ("…advance by hand, or record the timing again").
- Step 3: the badge is "⏱ timing" again and the lyrics follow (a typo doesn't break the timing).

### TC-EDGE-25 · A huge file from the media library says it is too large  `P1`
**Setup:** add a WAV over 200 MB to the media library (e.g. a long silent recording).
**Steps**
1. Songs → a song → **Add backing track…** → pick that file in the "— or from the media library —" list →
   **Use it as is**.
**Expected**
- The toast "⚠ The file is larger than 200 MB."; the operator window stays responsive (it doesn't read the whole
  file first); the song has no track.
