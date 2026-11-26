# 0006 · Song and Bible content stays English + Spanish

**Status:** Accepted (2026-11), revisit before 2.0

## Context
The data model is bilingual by construction: `BiText { en, es }`, song sections with `en` / `es` lyrics,
`displayLang: 'en' | 'es' | 'both'`, `bibleEn` / `bibleEs`. Many immigrant churches are bilingual in other pairs
(Korean–English, Portuguese–English, French–Haitian Creole…). With no users yet, generalising now would be cheap in
data migrations, but it touches nearly every part of the app (slides, songs, Bible, stage, remote, themes, import).

## Decision
Keep English + Spanish for content in 1.x. The **interface** language list stays open to more translations (a new
`src/renderer/i18n/<lang>.json`), but projector content keeps the two fixed slots.

## Consequences
- A church with another pair can type its languages into the `en` / `es` slots today; labels will say
  English/Spanish.
- The generalisation is planned for 2.0 (see `docs/ROADMAP.md`): `primary` / `secondary` language codes in settings,
  `BiText` → `{ [lang]: string }` with a migration, and the importers taught to fill the chosen pair.

## Alternatives considered
- **Generalise now:** the largest change in the codebase for no current user; it would delay everything else in
  this round. Rejected for now, explicitly scheduled.
