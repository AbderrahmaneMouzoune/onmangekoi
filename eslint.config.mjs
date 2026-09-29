import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import i18next from 'eslint-plugin-i18next'
import importX from 'eslint-plugin-import-x'

/** Dossiers et fichiers dont les textes sont déjà dans les messages (issue #14). */
const I18N_EXTRACTED = [
  'src/app/[[]locale]/layout.tsx',
  'src/app/[[]locale]/page.tsx',
  'src/app/[[]locale]/not-found.tsx',
  'src/app/[[]locale]/error.tsx',
  'src/app/[[]locale]/opengraph-image.tsx',
  'src/app/[[]locale]/setup/**',
  'src/app/[[]locale]/login/**',
  'src/app/[[]locale]/offline/**',
  'src/app/global-error.tsx',
  'src/app/global-not-found.tsx',
  'src/components/layout/**',
  'src/components/onboarding/**',
  'src/components/home/**',
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ alwaysTryTypes: true })],
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling'], 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/no-duplicates': 'error',
      'import-x/no-cycle': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Avec le segment caché `app/[locale]`, toute URL interne est une page
      // aux yeux de la règle : les `<a>` factices des tests la déclenchent.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  /**
   * Internationalisation (issue #14) : aucun texte affiché ne s'écrit en dur,
   * il vient des messages (`messages/<langue>/*.json`, voir `docs/i18n.md`).
   *
   * La règle ne s'applique qu'aux dossiers déjà extraits (phase A) ; les
   * phases B et C allongent `I18N_EXTRACTED`, puis la phase C l'étend à tout
   * `src/` et la passe en `error`. En `warn`, elle reste bloquante :
   * `bun run lint` tourne avec `--max-warnings 0`.
   */
  {
    files: I18N_EXTRACTED,
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'warn',
        {
          // Texte des balises *et* valeurs d'attributs (aria-label, title,
          // placeholder…) : les deux s'affichent ou se lisent à voix haute.
          mode: 'jsx-only',
          'jsx-attributes': {
            exclude: [
              'className',
              'style',
              'type',
              'key',
              'id',
              'href',
              'rel',
              'target',
              'name',
              'role',
              'lang',
              'htmlFor',
              'variant',
              'size',
              'tone',
              'orientation',
              'autoComplete',
              'autoCapitalize',
              'aria-hidden',
              'aria-keyshortcuts',
              'aria-live',
              'aria-current',
              'action',
              '.*Width$',
            ],
          },
          // Les traducteurs s'appellent `t` ou `t<Espace>` (`tCommon`), voir
          // `docs/i18n.md`. Le reste reprend la liste par défaut du plugin.
          callees: {
            exclude: [
              't[A-Za-z]*',
              't[A-Za-z]*\\.(rich|markup|raw|has)',
              'setTheme',
              'i18n(ext)?',
              'require',
              'addEventListener',
              'removeEventListener',
              'postMessage',
              'getElementById',
              'dispatch',
              'commit',
              'includes',
              'indexOf',
              'endsWith',
              'startsWith',
            ],
          },
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    'node_modules/**',
    '.next/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    '.turbo/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    '.agents/**',
    'marketing/**',
  ]),
])

export default eslintConfig
