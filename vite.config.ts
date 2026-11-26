// Vite+ toolchain config: unit tests (`vp test`), lint (`vp lint`, Oxlint), format (`vp fmt`, Oxfmt), type checks
// (`vp check` runs all three) and the pre-commit hook (`vp staged`).
// The app itself is built by electron-vite (electron.vite.config.mts), not by `vp build` / `vp dev`.
import { resolve } from 'node:path'
import { defineConfig } from 'vite-plus'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(import.meta.dirname, 'src/shared'),
      '@renderer': resolve(import.meta.dirname, 'src/renderer')
    }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  },
  // Lint catches real bugs (hooks rules, unused code, TS mistakes, and with type info: type errors) without
  // restyling the codebase. Formatting is the `fmt` block's job. Migrated from the ESLint recommended +
  // typescript-eslint recommended config.
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn'],
    categories: {
      correctness: 'warn'
    },
    env: {
      builtin: true
    },
    ignorePatterns: ['out/**', 'dist/**', 'node_modules/**', 'resources/**', 'smoke-shots/**', '.e2e-data/**', 'docs/e2e_testing/results/**'],
    rules: {
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-case-declarations': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-const-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-constant-condition': 'error',
      'no-control-regex': 'error',
      'no-debugger': 'error',
      'no-delete-var': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-empty-character-class': 'error',
      'no-empty-pattern': 'error',
      'no-empty-static-block': 'error',
      'no-ex-assign': 'error',
      'no-extra-boolean-cast': 'error',
      'no-fallthrough': 'error',
      'no-func-assign': 'error',
      'no-global-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-loss-of-precision': 'error',
      'no-misleading-character-class': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-nonoctal-decimal-escape': 'error',
      'no-obj-calls': 'error',
      'no-prototype-builtins': 'error',
      'no-redeclare': 'error',
      'no-regex-spaces': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-shadow-restricted-names': 'error',
      'no-sparse-arrays': 'error',
      'no-this-before-super': 'error',
      'no-unassigned-vars': 'error',
      'no-undef': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unused-labels': 'error',
      'no-unused-private-class-members': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-useless-assignment': 'error',
      'no-useless-backreference': 'error',
      'no-useless-catch': 'error',
      'no-useless-escape': 'error',
      'no-with': 'error',
      'preserve-caught-error': 'error',
      'require-yield': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-array-constructor': 'error',
      'no-unused-expressions': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/no-duplicate-enum-values': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-extra-non-null-assertion': 'error',
      'typescript/no-misused-new': 'error',
      'typescript/no-namespace': 'error',
      'typescript/no-non-null-asserted-optional-chain': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-this-alias': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-unsafe-declaration-merging': 'error',
      'typescript/no-unsafe-function-type': 'error',
      'typescript/no-wrapper-object-types': 'error',
      'typescript/prefer-as-const': 'error',
      'typescript/prefer-namespace-keyword': 'error',
      'typescript/triple-slash-reference': 'error',
      'vite-plus/prefer-vite-plus-imports': 'error'
    },
    overrides: [
      {
        files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
        rules: {
          'constructor-super': 'off',
          'getter-return': 'off',
          'no-class-assign': 'off',
          'no-const-assign': 'off',
          'no-dupe-class-members': 'off',
          'no-dupe-keys': 'off',
          'no-func-assign': 'off',
          'no-import-assign': 'off',
          'no-new-native-nonconstructor': 'off',
          'no-obj-calls': 'off',
          'no-redeclare': 'off',
          'no-setter-return': 'off',
          'no-this-before-super': 'off',
          'no-undef': 'off',
          'no-unreachable': 'off',
          'no-unsafe-negation': 'off',
          'no-var': 'error',
          'no-with': 'off',
          'prefer-const': 'error',
          'prefer-rest-params': 'error',
          'prefer-spread': 'error'
        }
      },
      {
        files: ['src/renderer/**/*.{ts,tsx}'],
        // The two classic hooks rules. The React Compiler rules (which the correctness category turns on) are off:
        // they would demand rewriting working effects in a live-service app.
        rules: {
          'react/rules-of-hooks': 'error',
          'react/exhaustive-deps': 'warn',
          'react/purity': 'off',
          'react/refs': 'off',
          'react/set-state-in-effect': 'off',
          'react/static-components': 'off',
          'react/immutability': 'off'
        },
        plugins: ['react'],
        env: {
          browser: true
        }
      },
      {
        files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'tests/**/*.ts', '*.config.{ts,mts,mjs}', 'scripts/**/*.{mjs,js}'],
        env: {
          node: true
        }
      },
      {
        files: ['scripts/smoke.mjs', 'scripts/e2e-launch.mjs', 'scripts/packaged-check.mjs'],
        // Playwright scripts pass callbacks that run inside the app's pages
        env: {
          browser: true,
          node: true
        }
      },
      {
        files: ['**/*.cjs'],
        rules: {
          'typescript/no-require-imports': 'off'
        },
        env: {
          node: true
        }
      }
    ],
    options: {
      typeAware: true,
      typeCheck: true
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin'
      }
    ]
  },
  fmt: {
    semi: false,
    singleQuote: true,
    trailingComma: 'none',
    printWidth: 160,
    sortPackageJson: false,
    ignorePatterns: ['out/', 'dist/', 'node_modules/', 'resources/', 'tests/fixtures/', 'docs/', 'smoke-shots/', '.e2e-data/', 'pnpm-lock.yaml', '*.md']
  },
  staged: {
    '*': 'vp check --fix'
  }
})
