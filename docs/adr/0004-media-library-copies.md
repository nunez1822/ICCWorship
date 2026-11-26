# 0004 · The media library keeps its own copies

**Status:** Accepted (2026-11)

## Context
Media items stored the absolute path of the file the church picked. Moving the file, renaming a folder, an
unplugged USB drive or a new computer broke slides, backgrounds and the logo, and backups could not include them
(the README told churches to recreate the same folder paths by hand).

## Decision
Like EasyWorship and ProPresenter, the library copies what is added (pictures, videos, sound, the logo) into
`<data>/media/<id>.<ext>`, stored data-relative (`media/<id>.<ext>`) and resolved by `mediaFile()`, the same way as
converted slides (`src/shared/mediaLibrary.ts`, `src/main/mediaLibrary.ts`).

- On by default; Settings → Backup can turn it off for very large libraries on another drive (items then link to the
  original, as before). An item whose copy doesn't fit on the disk links too, and says so.
- **"Back up now" includes `media/`** (stored, not recompressed). Too big for one .zip (over 4 GB) or for the target
  disk (a small USB stick), it drops the media first, then the tracks instead, then both, and says which folders to
  copy and where (the same drive for a file over 4 GB, a drive with more room when the stick is full). Automatic
  backups and safety copies never include media.
- **A restore only adds to `media/`**: files are named by unique ids, and the church's library can be far bigger
  than any safety copy. A file already there with the same size is the same file and is skipped. A failed restore
  removes what it added.
- Deleting an item (or replacing the logo) removes its copy unless another item, the logo, a plan slide (announcement
  pictures keep the file's URL), a presentation, or what is on the projector right now still uses it (also by its
  full path, if someone linked to the file inside the data folder) — after any running backup. Removing the
  picture that is the background on screen switches the screen to the theme's background first, so its copy goes
  too. A copy whose item (or logo) then couldn't be saved is removed again. A
  theme whose background item was removed shows the built-in gradient, so it doesn't keep the copy. Linked files
  (the church's own folders) are never deleted.

## Consequences
- Adding a large video takes as long as copying it, and uses that much disk space in `Documents`.
- Orphan copies can remain after a restore, or when a removed item's copy was on screen at that moment (harmless;
  a future "tidy the library" could remove them). Copies cut off by a crash (`*.tmp`) are removed a day later (a
  copy is dated when it is made, and one still being written is never removed).
- If `Documents` is synced by OneDrive, the copies are synced too (that may be large).

## Alternatives considered
- **Keep linking and copy only at backup time:** backups grow with every video ever referenced, and a moved file is
  still broken during the service.
- **Mirror media beside the automatic backups (like tracks):** doubles the disk space of every video. Rejected.
