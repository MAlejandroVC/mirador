import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Packages the server must never import: it has no keys and no business logic.
// See "Dependency direction" in CONTRIBUTING.md.
const serverForbidden = ['core', 'db', 'import', 'archive', 'crypto']

// SEC-13: all cryptography goes through @repo/crypto.
const cryptoOutsideCryptoPackage = {
  'no-restricted-properties': [
    'error',
    ...['crypto', 'window', 'globalThis', 'self'].map((object) => ({
      object,
      property: object === 'crypto' ? 'subtle' : 'crypto',
      message: 'All cryptography goes through @repo/crypto (SEC-13).',
    })),
  ],
}

const restrictedImports = (patterns, paths = []) => ({
  'no-restricted-imports': ['error', { patterns, paths }],
})

const hashWasm = {
  group: ['hash-wasm', 'node:crypto', 'crypto'],
  message: 'All cryptography goes through @repo/crypto (SEC-13).',
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/',
      '**/dist/',
      '**/coverage/',
      '**/.turbo/',
      '**/*.gen.ts',
      'playwright-report/',
      'test-results/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', 'packages/config/*.js'],
        },
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/src/routes/**/*.tsx'],
    // TanStack Router route files export a Route object next to the component.
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      ...cryptoOutsideCryptoPackage,
      ...restrictedImports(
        [
          {
            group: serverForbidden.flatMap((name) => [`@repo/${name}`, `@repo/${name}/*`]),
            message: 'The server may import only @repo/api, @repo/sync/protocol and @repo/i18n.',
          },
          {
            group: ['@repo/sync/*', '!@repo/sync/protocol'],
            message: 'The server may use only the sync protocol types: @repo/sync/protocol.',
          },
          hashWasm,
        ],
        [
          {
            name: '@repo/sync',
            message: 'The server may use only the sync protocol types: @repo/sync/protocol.',
          },
        ],
      ),
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      ...cryptoOutsideCryptoPackage,
      ...restrictedImports([
        {
          group: ['@repo/*', 'react', 'react-dom'],
          message: '@repo/core is pure logic: no other packages, no React, no network, no storage.',
        },
        hashWasm,
      ]),
    },
  },
  {
    files: ['packages/crypto/**/*.ts'],
    rules: restrictedImports([
      {
        group: ['@repo/*', 'react', 'react-dom'],
        message: '@repo/crypto depends on nothing but small pure libraries.',
      },
    ]),
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/!(crypto|core)/**/*.ts'],
    rules: {
      ...cryptoOutsideCryptoPackage,
      ...restrictedImports([hashWasm]),
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      // Assertions often read values a previous expect already proved present.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
)
