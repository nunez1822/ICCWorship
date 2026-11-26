# 0005 · The portable exe keeps its data beside it

**Status:** Accepted (2026-11)

## Context
`ICCWorship-Portable-x.y.z.exe` stored its data in `Documents\ICCWorship` on whichever PC it ran on, so "run it from a
USB stick" moved the program but not the church's songs and plans, and left data behind on borrowed computers.

## Decision
When started by ICCWorship's own portable launcher (electron-builder sets `PORTABLE_EXECUTABLE_DIR`, and
`PORTABLE_EXECUTABLE_APP_FILENAME` naming the app it unpacked: only our own name counts, because every program started
from any electron-builder portable app inherits the first), the app keeps the data **and** the Chromium profile, logs
and crash dumps in an `ICCWorship Data` folder beside the exe (`src/main/portable.ts`, `bootstrap.ts`).
`ICCWORSHIP_DATA` still wins; the installed app is unchanged. An existing `ICCWorship Data` folder always wins:
- writable → portable. If this PC also has data in `Documents\ICCWorship` (the installed app's, or portable 1.0's),
  a notice says so once, so a church never thinks its songs are gone;
- write-protected but holding data (a locked stick) → that data, **read-only** (a red bar says nothing is saved; the
  profile and logs go to this PC's `%APPDATA%`), never another computer's library on a Sunday;
- neither → `Documents` for that session, with a notice.

With no such folder yet:
- data already in `Documents\ICCWorship` — portable 1.0's, **or the installed app's** — is used, with a notice on how
  to move it beside the exe (only when the exe's folder can be written; otherwise the "can't write there" notice);
  creating the folder makes the exe portable from then on;
- otherwise the folder is created, or, where it can't be (a CD, `Program Files`), `Documents` is used with a notice.

## Consequences
- On a PC without ICCWorship data in `Documents`, a copy of the portable exe on the Desktop creates
  `Desktop\ICCWorship Data`: visible, and easy to explain. On a PC with the installed app, a new portable copy opens
  the installed app's library until an `ICCWorship Data` folder is created beside it.
- In `portable` mode the copy has its own profile, so Electron's single-instance lock no longer covers it. A named
  pipe per Windows user (`src/main/machineLock.ts`, named from a hash of the user name) keeps a second copy —
  installed or portable — from starting a second projector window over the live one; it says the other copy is open.
  A portable copy in the other modes shares the installed app's profile, so Electron's own lock brings the open
  window to the front instead.
- Upgrading from portable 1.0 needs no step: the data stays in `Documents` until the church moves it.
- The portable exe can't update itself (ADR 0003).

## Alternatives considered
- **A `portable.txt` marker file to opt in:** one more thing for a volunteer to get right.
- **Keep Documents:** what 1.0 did; it isn't what "portable" means to users.
