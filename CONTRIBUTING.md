# Contributing to ICCWorship / Cómo contribuir

Thank you for helping churches! · ¡Gracias por ayudar a las iglesias!

## Ways to help
- **Report bugs** – what you did, what you expected, what happened, and your Windows version.
- **Translate** – all UI text is in `src/renderer/i18n/en.json` and `es.json`. To add a language, add a new JSON file with the same keys and register it in `src/renderer/i18n/index.ts`.
- **Public-domain songs** – bilingual hymns are especially welcome. Only add lyrics that are in the public domain.
- **Code** – fix a bug or build a feature from the issues.

## Ground rules
- **Never commit copyrighted lyrics or Bible texts.** Users paste/import those themselves on their own computer.
- Keep it **offline-first** – no feature may require the internet to run a service.
- Every user-visible string goes through i18n in **both** English and Spanish (`npm test` checks this).
- Keep the operator UI simple enough for a volunteer who has never used it.

## Development workflow
```bash
npm install
npm run dev        # hot-reload development
npm test           # must pass
npm run typecheck  # must pass
npm run build && npm run smoke   # end-to-end check with screenshots (smoke-shots/)
```

Pure logic belongs in `src/shared/` with a unit test in `tests/`. UI goes in `src/renderer/`.
Main-process features expose a typed method in `src/preload/index.ts`.

## Pull requests
- One topic per PR, with a short description and (for UI changes) a screenshot.
- Write commit messages in English or Spanish — both are fine.
