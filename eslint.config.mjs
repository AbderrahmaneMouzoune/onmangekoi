import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import i18next from 'eslint-plugin-i18next'
import importX from 'eslint-plugin-import-x'

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
   * Tout `src/` est concerné, en `error`. Restent dehors : les tests, qui
   * cherchent justement des textes, et le contenu éditorial des notes de
   * version (`src/content/`, rédigé en français — il n'a pas de JSX, mais
   * l'exclusion le dit). Un littéral technique qui passerait pour du texte
   * (le glyphe d'une icône, un identifiant de version) s'isole dans une
   * constante nommée plutôt que d'être exempté ici.
   */
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', 'src/test/**', 'src/content/**'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
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
              'autoCorrect',
              'inputMode',
              // Élément rendu par un composant polymorphe (`<Skeleton as="span">`).
              'as',
              'aria-hidden',
              'aria-busy',
              'aria-keyshortcuts',
              'aria-live',
              'aria-current',
              'action',
              '.*Widths?$',
              // Attributs techniques : chargement d'image, valeur de champ
              // caché, nom d'input transmis, contexte passé à un composant.
              'loading',
              'sizes',
              'value',
              '.*Name$',
              'context',
              'widths',
              'data-.*',
              'on[A-Z].*',
              // Réglages de `next-themes` (`components/theme-provider.tsx`).
              'attribute',
              'defaultTheme',
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
              // Événements de mesure : des identifiants, jamais affichés.
              'captureEvent',
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
