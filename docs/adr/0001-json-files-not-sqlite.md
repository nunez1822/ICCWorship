# 0001 · Keep the data in JSON files, not SQLite

**Status:** Accepted (2026-11)

## Context
The church's data (songs, plans, people, settings…) lives in one JSON file per collection in
`Documents\ICCWorship\data`, written by `JsonStore`: debounced, atomic (temp file + flush + rename), a `.bak` of the
previous version, damaged files set aside, retries when antivirus or OneDrive holds a file. Comparable apps
(OpenLP, EasyWorship) use SQLite; with no users yet, switching now would cost nothing in migrations.

## Decision
Stay on JSON files.

- **OneDrive and sync tools.** `Documents` is very often synced by OneDrive on church laptops. SQLite's own guidance
  is not to put a live database (and its `-wal` / `-journal` files) in a folder a sync tool copies on its own
  schedule: a sync of half a transaction is a known corruption source. A JSON file replaced by an atomic rename is
  always either the old or the new version.
- **Scale.** A small church has hundreds of songs, at most a few thousand: `songs.json` stays a few MB, and saving
  it takes milliseconds. Search runs in memory.
- **Recoverability and transparency.** Backups are plain zips of readable files; a volunteer (or a maintainer helping
  over email) can open them. The e2e test cases set up and check state by editing these files.
- **No native module.** SQLite would mean `better-sqlite3` (rebuilt for every Electron version) or Node's still
  experimental `node:sqlite`.

## Consequences
- Every save rewrites the whole collection file. Fine at this scale; watch `songs.json` size if libraries grow.
- No multi-PC editing of the same data folder (also true with SQLite on a synced folder).
- `SCHEMA_VERSION` + migrations (`src/shared/migrations.ts`) make a later move possible as one more migration.

## Alternatives considered
- **SQLite (better-sqlite3 / node:sqlite):** transactions, incremental writes, FTS5 search. Rejected for now for the
  reasons above. Revisit if libraries reach tens of thousands of items or we need full-text search across
  everything, and then keep the database outside synced folders (e.g. `%LOCALAPPDATA%`) with exports into
  `Documents`.
- **IndexedDB in the renderer:** ties the data to a Chromium profile, invisible to backups and users. Rejected.
