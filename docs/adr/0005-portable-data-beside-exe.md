# 0005 · The portable exe keeps its data beside it

**Status:** Accepted (2026-11)

## Context
`ICCWorship-Portable-x.y.z.exe` stored its data in `Documents\ICCWorship` on whichever PC it ran on, so "run it from a
USB stick" moved the program but not the church's songs and plans, and left data behind on borrowed computers.

## Decision
When started by electron-builder's portable launcher (`PORTABLE_EXECUTABLE_DIR`), the app keeps the data **and** the
Chromium profile, logs and crash dumps in an `ICCWorship Data` folder beside the exe (`src/main/portable.ts`,
`bootstrap.ts`). `ICCWORSHIP_DATA` still wins; the installed app is unchanged. An existing `ICCWorship Data` folder
always wins:
- writable → portable;
- write-protected but holding data (a locked stick) → that data, **read-only** (a red bar says nothing is saved; the
  profile and logs go to this PC's `%APPDATA%`), never another computer's library on a Sunday;
- neither → `Documents` for that session, with a notice.

With no such folder yet, data already in `Documents\ICCWorship` (where portable 1.0 kept it) is kept, with a notice
on how to move it beside the exe; creating the folder makes the exe portable from then on. Otherwise the folder is
created.

## Consequences
- A copy of the portable exe on the Desktop creates `Desktop\ICCWorship Data`: visible, and easy to explain.
- In `portable` mode the copy has its own profile, so Electron's single-instance lock no longer covers it. A named
  pipe per Windows user (`src/main/machineLock.ts`) keeps a second copy — installed or portable — from starting a
  second projector window over the live one; it says the other copy is open.
- Upgrading from portable 1.0 needs no step: the data stays in `Documents` until the church moves it.
- The portable exe can't update itself (ADR 0003).

## Alternatives considered
- **A `portable.txt` marker file to opt in:** one more thing for a volunteer to get right.
- **Keep Documents:** what 1.0 did; it isn't what "portable" means to users.
