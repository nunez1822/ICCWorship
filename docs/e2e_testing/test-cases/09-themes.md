# 09 · Themes

### TC-THM-01 · Built-in themes are read-only  `P1`
**Steps**
1. Themes → Classic Night.
**Expected**
- Lock message "Built-in themes can't be changed…" and controls disabled; **Duplicate** available.

### TC-THM-02 · Edit a custom theme with live preview  `P0` 📸
**Steps**
1. Duplicate Classic Night. Size 72 → 100, main color red, position **Bottom**, toggle UPPERCASE.
**Expected**
- Preview updates instantly for each change; ES/EN/ES+EN switch in the preview works.

### TC-THM-03 · Make default / apply now  `P0`
**Steps**
1. **Make default**. Go live on a song. 2. On another theme click **Apply to screen now**.
**Expected**
- Song uses the new default theme. "Apply" changes the projector immediately.

### TC-THM-04 · Lower third (green screen)  `P2`
**Steps**
1. Apply "Lower Third / Tercio Inferior", go live on a song.
**Expected**
- Bright green background, smaller text at the bottom (for chroma key in OBS).

### TC-THM-05 · Per-item theme override  `P1`
**Steps**
1. Plans → ⚙ on a song → Theme "Midnight Gold". Go live.
**Expected**
- Only that item uses Midnight Gold (black background, gold Georgia text).

### TC-THM-06 · Long text auto-fits  `P1`
**Steps**
1. Song with lines-per-slide 12 and long lines, go live.
**Expected**
- Text shrinks to fit; nothing is cut off at the bottom of the projector.
