# 05 · La Biblia de las Américas (paste-in versions)

> Use only the placeholder fixture text in tests — never commit real LBLA wording.

### TC-LBLA-01 · Set up LBLA  `P0`
**Pre:** fresh
**Steps**
1. Bible → "My Bible verses (LBLA)" → **Set up La Biblia de las Américas (LBLA)**.
**Expected**
- Toast "“La Biblia de las Américas” is ready". Right panel: "LBLA · saved verses", meter 0 of 500,
  and the Lockman credit line "Scripture taken from La Biblia de las Américas® (LBLA®)…".

### TC-LBLA-02 · Paste, detect and save verses  `P0` 📸
**Fixture:** contents of `tests/fixtures/lbla-juan-3-16-18.txt`
**Steps**
1. Reference `Juan 3:16-18`, paste the fixture text, **Detect verses**.
2. Check the 3 boxes, then **Save verses**.
**Expected**
- Detect shows boxes 3:16, 3:17, 3:18; the heading lines ("Juan 3:16-18", "La Biblia de las Américas") and markers `[a]`, `(A)` are removed.
- After save: toast "3 verses saved", meter "3 of 500", list shows "Juan 3 (16, 17, 18)".

### TC-LBLA-03 · Missing verse numbers can be typed in  `P1`
**Steps**
1. Reference `Juan 3:16-18`, paste only `16 Uno. 17 Dos.` → Detect.
**Expected**
- Warning "Could not find verse number(s): 18"; an empty 3:18 box is shown to type into.

### TC-LBLA-04 · Use LBLA with KJV on screen  `P0` 📸
**Pre:** TC-LBLA-02
**Steps**
1. Look up → main version **LBLA**, second **KJV** → `Juan 3:16-18` → **Show now**.
**Expected**
- Projector shows the pasted Spanish text on top and KJV English below; footer includes "(LBLA)".

### TC-LBLA-05 · Missing LBLA verses warn and offer paste  `P1`
**Steps**
1. Look up with LBLA → `Juan 3:16-20`.
**Expected**
- Yellow card "2 verse(s) are not saved in LBLA yet" with **Paste them now**, which opens the paste tab with the reference filled in.
- Show now still works (shows what exists).

### TC-LBLA-06 · LBLA in a plan item, missing verses fallback  `P1`
**Steps**
1. Plans → add Scripture `Salmos 23` with main **LBLA**, second **KJV**. Go live on it.
**Expected**
- Error toast explains verses are not saved; projector shows the KJV text instead of a blank screen.

### TC-LBLA-07 · Delete a stored verse  `P2`
**Steps**
1. Expand "Juan 3", click ✕ on verse 18.
**Expected**
- Meter decreases by 1; verse 18 disappears from the list.

### TC-LBLA-08 · Limit warning  `P2`
**Steps**
1. "+ Add version" → Name `Test Limit`, abbreviation `TL`, verse limit **2** → Create.
2. Paste & save `Juan 3:16-18` (3 verses) into TL.
**Expected**
- Error toast "Careful: more than 2 verses are stored…"; meter turns orange/red.

### TC-LBLA-09 · Licensed full import replaces the paste-in  `P2`
**Steps**
1. Versions → import a full Bible file (e.g. an OSIS/USFX public-domain file) with abbreviation `TL`.
**Expected**
- `TL` now shows "Imported", no verse counter/limit.
