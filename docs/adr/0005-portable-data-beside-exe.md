# 0005 · The portable exe keeps its data beside it

**Status:** Accepted (2026-11)

## Context
`ICCWorship-Portable-x.y.z.exe` stored its data in `Documents\ICCWorship` on whichever PC it ran on, so "run it from a
USB stick" moved the program but not the church's songs and plans, and left data behind on borrowed computers.

## Decision
When started by electron-builder's portable launcher (`PORTABLE_EXECUTABLE_DIR`), the app keeps the data **and** the
Chromium profile, logs and crash dumps in an `ICCWorship Data` folder beside the exe (`src/main/portable.ts`,
`bootstrap.ts`). If that folder can't be written (a locked stick, a read-only folder), it uses `Documents` for that
session and says so. `ICCWORSHIP_DATA` still wins; the installed app is unchanged.

## Consequences
- A copy of the portable exe on the Desktop creates `Desktop\ICCWorship Data`: visible, and easy to explain.
- The portable copy has its own profile and single-instance lock, so it can run next to an installed copy (they would
  compete for the phone remote's port; the second one reports it).
- The portable exe can't update itself (ADR 0003).

## Alternatives considered
- **A `portable.txt` marker file to opt in:** one more thing for a volunteer to get right.
- **Keep Documents:** what 1.0 did; it isn't what "portable" means to users.
