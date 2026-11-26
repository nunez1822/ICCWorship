# 0008 · The IPC contract is main's handler objects

**Status:** Accepted (2026-11)

## Context
About 90 IPC channels were string names typed by hand on both sides (`ipcMain.handle('x', …)` in a 1,155-line
`index.ts`, `invoke('x')` in the preload). A renamed channel or a changed argument compiled fine and failed at run
time.

## Decision
- Every `invoke` channel is a property of the object returned by `createHandlers()` (`src/main/ipc/handlers.ts`),
  every `send` channel one of `createListeners()` (`listeners.ts`). `registerIpc()` registers them all behind the
  sender check (only the app's own pages).
- The preload derives each call's arguments and result from those objects' types (`IpcHandlers`, `IpcListeners`);
  main → page messages are typed by `MainEvents` (`src/shared/ipcEvents.ts`) on both sides.
- `index.ts` keeps startup and lifecycle only; windows, crash recovery, dialogs, menu, protocols and hardening each
  have their own module.

## Consequences
- Adding a channel: one property in `handlers.ts` (or `listeners.ts`), one line in the preload. A mismatch is a type
  error.
- Arguments typed from our own pages are still validated where they become paths, ids or files (CLAUDE.md → Trust
  boundaries): the types describe our pages, not an attacker.

## Alternatives considered
- **electron-trpc / a schema library (zod):** more machinery and a runtime dependency for the same compile-time
  guarantee; runtime validation stays explicit where it matters.
