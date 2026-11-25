# 04 · Bible (built-in versions)

### TC-BIB-01 · Spanish reference, parallel display  `P0` 📸
**Steps**
1. Bible → Look up. Type `Juan 3:16-18`.
**Expected**
- Heading "Juan 3:16-18" with columns RV1909 and KJV, 3 verse rows.
- Verse 16 (RV1909) starts "Porque de tal manera amó Dios al mundo"; KJV starts "For God so loved the world".

### TC-BIB-02 · Reference formats  `P0`
**Steps** — type each and check the heading (it also shows the second version's name after " · ", e.g. "Juan 3:16 · John 3:16"; check the part before it):
| Input | Expected heading |
|---|---|
| `Jn 3:16` | Juan 3:16 |
| `john 3.16` | Juan 3:16 |
| `1 Cor 13:4-7` | 1 Corintios 13:4-7 |
| `Salmos 23` | Salmos 23 (6 verses) |
| `Rom 8:28, 31-32` | Romanos 8:28, 31-32 |
| `Apocalipsis 22:21` | Apocalipsis 22:21 |

### TC-BIB-03 · Invalid references  `P1`
**Steps**
1. Type `Blah 3:16`. 2. Type `Juan 3:18-16`.
**Expected**
- 1: red "Book not recognized…" message. 2: red "Chapter/verse numbers not recognized…". No crash.

### TC-BIB-04 · Book suggestions  `P2`
**Steps**
1. Type `Fil`, then clear and type `Phil`.
**Expected**
- Both show chips for Philippians/Filipenses and Philemon/Filemón (either UI language); clicking one fills the box.

### TC-BIB-05 · Show now (bilingual slides)  `P0` 📸
**Steps**
1. `Juan 3:16-18` → **Show now**. 2. Press `Space` twice.
**Expected**
- Projector: Spanish verse on top with superscript ¹⁶, English below; footer "Juan 3:16-18 (RV1909) · John 3:16-18 (KJV)".
- Each Space shows the next verse.

### TC-BIB-06 · Long passages split  `P1`
**Steps**
1. Show `Salmos 119:1-8`.
**Expected**
- Several slides; text is never cut off at the bottom of the projector; languages stay on the same verses.

### TC-BIB-07 · Add to plan  `P1`
**Steps**
1. `Romanos 8:28` → **Add to plan**. Go to Plans.
**Expected**
- Plan ends with a 📖 item "Romans 8:28" (or "Romanos 8:28" in Spanish UI); its ⚙ editor shows reference and versions.

### TC-BIB-08 · Word search  `P1`
**Steps**
1. Search tab → version RV1909 → `jehova es mi pastor` → Search. 2. Click the result.
**Expected**
- Result "Salmos 23:1" listed; clicking opens Look up with that reference.

### TC-BIB-09 · Default versions  `P2`
**Steps**
1. Versions tab → Default Spanish = RV1909, Default English = KJV. Swap primary to KJV in Look up.
**Expected**
- Table lists KJV and RV1909 as "Built-in". With KJV as main version, English is shown first/primary.
