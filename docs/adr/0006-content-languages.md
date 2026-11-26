# 0006 · Song and Bible content stays English + Spanish

**Status:** Accepted (2026-11), revisit before 2.0

## Context
The data model is bilingual by construction: `BiText { en, es }`, song sections with `en` / `es` lyrics,
`displayLang: 'en' | 'es' | 'both'`, `bibleEn` / `bibleEs`. Many immigrant churches are bilingual in other pairs
(Korean–English, Portuguese–English, French–Haitian Creole…). With no users yet, generalising now would be cheap in
data migrations, but it touches nearly every part of the app (slides, songs, Bible, stage, remote, themes, import).

## Decision
Keep English + Spanish for content in 1.x. The **interface** language list stays open to more translations, but
projector content keeps the two fixed slots. A new interface language needs more than a new
`src/renderer/i18n/<lang>.json`: `Settings.uiLang` shares the content type `Lang = 'en' | 'es'` (checked by
`SETTING_CHECKS` with `oneOf(LANGS)`), and `src/main/i18n.ts` and `src/renderer/i18n/index.ts` list `{ en, es }`. So
`uiLang` must first get its own type and list.

## Consequences
- A church with another pair can type its languages into the `en` / `es` slots today; labels will say
  English/Spanish.
- The generalisation is planned for 2.0 (see `docs/ROADMAP.md`): `primary` / `secondary` language codes in settings,
  `BiText` → `{ [lang]: string }` with a migration, and the importers taught to fill the chosen pair.

## Alternatives considered
- **Generalise now:** the largest change in the codebase for no current user; it would delay everything else in
  this round. Rejected for now, explicitly scheduled.
