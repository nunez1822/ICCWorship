# 12 · People, prayer & reports

### TC-PPL-01 · Add a person with teams  `P1`
**Steps**
1. People → Directory → **Add person** → First `Ana`, Last `Test`, phone `555-0100`, language Español, teams Worship + Kids.
**Expected**
- Row shows Ana Test, phone, "Worship, Kids & Nursery", ES. Search `ana` finds her.

### TC-PPL-02 · Teams & positions  `P2`
**Steps**
1. Teams → Worship → add position `Violin` (Enter); remove it by clicking the chip.
**Expected**
- Position appears/disappears; member count shows people in that team.

### TC-PRY-01 · Private requests never go on screen  `P0`
**Steps**
1. Prayer → add "Maria" / "Por su salud" (public) and "Juan" / "Private matter" with 🔒 Private.
2. **Show now**.
**Expected**
- Text says "1 open, non-private request can be shown on screen."; projector shows only Maria's request.

### TC-PRY-02 · Mark answered  `P2`
**Steps**
1. Mark Maria's request answered; switch to "Answered".
**Expected**
- Moves to Answered; Reopen brings it back.

### TC-REP-01 · Attendance & offering summary  `P1`
**Pre:** TC-PLAN-09 on a plan dated within the current year
**Steps**
1. Reports (range = this year).
**Expected**
- Services count ≥ 1, average attendance 85, offerings $412.50, a bar for that date and a row for that month.

### TC-REP-02 · CCLI song usage  `P0`
**Steps**
1. Live page → double-click **Holy, Holy, Holy** (from the plan). 2. Songs → imported "E2E Test Hymn" (CCLI 1234567) → **Show now**.
3. Reports → set **To** = the plan's date (plan songs are logged under the service date; Show now under today).
**Expected**
- Both songs listed with their CCLI # (— when none) and "Times" = 1.
- With **To** = today (on a weekday before the service) only E2E Test Hymn is listed.
- `queueSaveFile('<repo>/.e2e-data/ccli.csv')` → **CSV** creates a file with header `Date,Title,CCLI Song #`.
