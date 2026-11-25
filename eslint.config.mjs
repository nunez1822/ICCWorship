// ESLint flat config. Deliberately small: catch real bugs (hooks rules, unused code, TS mistakes)
// without restyling the codebase. Formatting is Prettier's job (see .prettierrc.json).
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**', 'resources/**', 'smoke-shots/**', '.e2e-data/**', 'docs/e2e_testing/results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Only the two classic rules: the v7 "recommended" preset adds React Compiler rules that would
      // demand rewriting working effects in a live-service app.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn'
    }
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'tests/**/*.ts', '*.config.{mts,mjs}', 'scripts/**/*.{mjs,js}'],
    languageOptions: { globals: globals.node }
  },
  {
    // Playwright scripts pass callbacks that run inside the app's pages
    files: ['scripts/smoke.mjs', 'scripts/e2e-launch.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
)
