# 07 · Media: video, images, audio

Fixtures: `sample.mp4` (5 s color bars + tone), `sample.jpg`, `sample.mp3` (4 s tone, mono), `sample.flac` and `sample.opus`
(3 s 440 Hz tone, mono; `ffmpeg -f lavfi -i "sine=frequency=440:duration=3:sample_rate=22050" -ac 1 sample.flac`, and the same at
48000 Hz with `-c:a libopus -b:a 24k sample.opus`).

### TC-MED-01 · Add files to the library  `P0`
**Steps**
1. Media → `queueOpenFiles([mp4, jpg, mp3])` → **Add files**.
**Expected**
- Toast "3 files added". Cards: video with thumbnail and ▶ badge, image thumbnail, audio 🎧. Filters Images/Videos/Audio work.

### TC-MED-02 · Play an MP4 on the projector  `P0` 📸
**Steps**
1. Double-click the video card. 2. Go to Live.
**Expected**
- Projector shows moving color bars (screenshot twice ~1 s apart: frames differ).
- Live page shows a video panel: Pause button, progress bar advancing, "−0:0x" remaining.
- `window.api.live.get()` → `video.playing === true`, `videoProgress.duration ≈ 5`.

### TC-MED-03 · Video controls  `P0`
**Pre:** TC-MED-02
**Steps**
1. Press `P` (pause), then `P`. 2. Click the start of the progress bar. 3. Volume slider to 0. 4. Tick **Loop**, wait 7 s.
**Expected**
- Pause/resume works; seeking jumps to ~0:00; with Loop the video restarts instead of stopping.

### TC-MED-04 · Video item auto-next  `P1`
**Steps**
1. Plans → Video / Image → pick sample → ⚙ → "Go to next item when finished" → Save. Put an item after it.
2. Go live on the video and wait 6 s.
**Expected**
- When the video ends, the next item goes live automatically.

### TC-MED-05 · Video as motion background behind lyrics  `P0` 📸
**Steps**
1. Themes → duplicate "Classic Night" → Background **Motion video** → select sample → Dim 40%.
2. Make default. Go live on a song.
**Expected**
- Projector shows lyrics over the moving, darkened video, muted.

### TC-MED-06 · Image item  `P1`
**Steps**
1. Show now on the image.
**Expected**
- Image fills the projector (letterboxed, not stretched).

### TC-MED-07 · Use as background now  `P2`
**Steps**
1. Select the image → **Use as background now** while a song is live.
**Expected**
- Projector background changes immediately; text unchanged.

### TC-MED-08 · Missing file warning  `P1`
**Steps**
1. Copy `sample.jpg` to `.e2e-data/temp.jpg`, add it, then delete/rename that copy on disk. Reopen Media.
**Expected**
- Card shows "⚠ Missing"; selecting it shows "This file was moved or the USB drive is not connected." No crash.

### TC-MED-09 · Remove from library  `P2`
**Steps**
1. Select a card → Remove from library → confirm.
**Expected**
- Card disappears; the file on disk still exists.

### TC-MED-10 · FLAC and Opus audio files play  `P2`
**Steps**
1. Media → `queueOpenFiles([sample.flac, sample.opus])` → **Add files**. 2. Show now on the FLAC card, then on the Opus card.
**Expected**
- Both are accepted as audio (🎧 cards). Each plays on the projector: `window.api.live.get()` → `video.playing === true`
  and `videoProgress.duration ≈ 3`, with no "can't be played" toast.

### TC-MED-11 · Audio item plays with sound  `P0`
**Pre:** projector on
**Steps**
1. Show now on the audio card (`sample.mp3`).
**Expected**
- Audio plays (progress advances on the Live page media bar) with the theme background visible on the projector.
- `window.api.live.get()` → `video.playing === true`; `videoProgress.current` increases between two reads ~1 s apart.
