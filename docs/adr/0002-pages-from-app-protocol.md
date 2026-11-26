# 0002 · Serve the app's pages from `app://iccworship`, not `file://`

**Status:** Accepted (2026-11)

## Context
The windows used `loadFile()` (`file://`). Pages loaded that way need Electron's `GrantFileProtocolExtraPrivileges`
fuse, and to Chromium every `file://` URL is the "same origin", so any page loaded from `file://` could read any
local file through `fetch`. The IPC sender check had to compare file paths.

## Decision
Register a standard, secure custom scheme, `app://iccworship/`, served by `protocol.handle` from `out/renderer` only
(`src/main/appUrl.ts`, `appProtocol.ts`):
- only the built pages' own file types, only inside that folder (traversal → 404), with `nosniff` and `no-store`;
- the IPC sender check compares scheme and host (`URL.origin` is `"null"` for custom schemes in Node);
- the `GrantFileProtocolExtraPrivileges` fuse is **off**, checked by `scripts/packaged-check.mjs`.

This is what Electron's security checklist recommends and what VS Code does (`vscode-file://`).

## Consequences
- CSP `'self'`, `localStorage` and cookies belong to one real origin, `app://iccworship`.
- `media://` stays a separate origin, so it keeps `Access-Control-Allow-Origin: *` (PDF import fetches from it).
- Development is unchanged (`ELECTRON_RENDERER_URL`, the Vite dev server).
- A new kind of built asset (e.g. `.json`, fonts) must be added to `APP_TYPES` in `appUrl.ts`.

## Alternatives considered
- **Keep `file://` with the fuse on:** simpler, but leaves the extra privilege for no benefit.
- **A local HTTP server for the pages:** another port to secure, visible to other local processes. Rejected.
