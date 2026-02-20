import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import promisePlugin from 'eslint-plugin-promise';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';
import globals from 'globals';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ignorePatterns = [
  'dist/**/*',
  'dist-electron/**/*',
  'release/**/*',
  'coverage/**/*',
  'node_modules/**/*',
  'electron/main/database/migrations/archive/**/*',
  'electron/main/database/migrations/legacy/**/*',
  'electron/main/database/migrations/v2/**/*',
  '**/*.min.js',
  '**/assets/*.js',
];

const importSettings = {
  'import/parsers': {
    '@typescript-eslint/parser': ['.ts', '.tsx'],
  },
  'import/resolver': {
    typescript: {
      project: path.join(__dirname, 'tsconfig.eslint.json'),
      alwaysTryTypes: true,
    },
    node: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
    },
  },
  react: {
    version: 'detect',
  },
  'jsx-a11y': {
    components: {
      Input: 'input',
      Select: 'select',
      Textarea: 'textarea',
      Modal: 'dialog',
    },
  },
};

const baseRules = {
  ...js.configs.recommended.rules,
  ...jsxA11yPlugin.flatConfigs.recommended.rules,
  ...importPlugin.flatConfigs.recommended.rules,
  ...importPlugin.flatConfigs.typescript.rules,
  ...promisePlugin.configs['flat/recommended'].rules,
  ...securityPlugin.configs.recommended.rules,
  ...sonarjsPlugin.configs.recommended.rules,
  'no-unused-vars': 'off',
  'no-undef': 'off',
  'react/react-in-jsx-scope': 'off',
  'react/prop-types': 'off',
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      ignoreRestSiblings: true,
      caughtErrorsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': [
    'warn',
    {
      prefer: 'type-imports',
      fixStyle: 'inline-type-imports',
    },
  ],
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': [
    'error',
    {
      checksVoidReturn: {
        attributes: false,
      },
    },
  ],
  '@typescript-eslint/switch-exhaustiveness-check': 'warn',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
  '@typescript-eslint/no-unnecessary-condition': 'warn',
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'eqeqeq': ['error', 'always', { null: 'ignore' }],
  'curly': ['error', 'all'],
  'prefer-const': 'error',
  'no-var': 'error',
  'object-shorthand': 'warn',
  'max-lines': [
    'warn',
    {
      max: 500,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  'max-lines-per-function': [
    'warn',
    {
      max: 80,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
  'max-params': ['warn', 5],
  'max-depth': ['warn', 4],
  'max-statements': ['warn', 30],
  'complexity': ['warn', 12],
  'import/no-cycle': ['error', { maxDepth: 1 }],
  'import/no-self-import': 'error',
  'import/no-duplicates': 'error',
  'import/no-named-as-default': 'off',
  'import/no-named-as-default-member': 'off',
  'import/no-mutable-exports': 'off',
  'import/newline-after-import': ['warn', { count: 1 }],
  'import/order': [
    'warn',
    {
      groups: [['builtin', 'external'], ['internal'], ['parent', 'sibling', 'index'], ['object', 'type']],
      'newlines-between': 'always',
      alphabetize: { order: 'asc', caseInsensitive: true },
    },
  ],
  'jsx-a11y/click-events-have-key-events': 'error',
  'jsx-a11y/interactive-supports-focus': 'error',
  'jsx-a11y/control-has-associated-label': [
      'warn',
      {
      ignoreElements: ['audio', 'canvas', 'embed', 'input', 'textarea', 'tr', 'td', 'th', 'video'],
      controlComponents: ['Select'],
      labelAttributes: ['label', 'aria-label', 'aria-labelledby', 'title'],
      },
    ],
  'jsx-a11y/label-has-associated-control': [
    'warn',
    {
      assert: 'either',
      depth: 4,
      controlComponents: ['Input', 'Select', 'Textarea'],
    },
  ],
  'security/detect-object-injection': 'off',
  'security/detect-non-literal-fs-filename': 'off',
  'promise/always-return': 'warn',
  'promise/catch-or-return': 'warn',
  'sonarjs/cognitive-complexity': ['warn', 18],
  'sonarjs/no-duplicate-string': 'warn',
  'sonarjs/unused-import': 'off',
  'sonarjs/no-unused-vars': 'off',
  'sonarjs/no-dead-store': 'off',
  'sonarjs/no-nested-conditional': 'warn',
  'sonarjs/no-nested-functions': 'warn',
  'sonarjs/different-types-comparison': 'warn',
  'sonarjs/pseudo-random': 'warn',
  'sonarjs/use-type-alias': 'warn',
  'sonarjs/no-identical-functions': 'warn',
  'sonarjs/prefer-read-only-props': 'warn',
  'sonarjs/no-misleading-array-reverse': 'warn',
  'sonarjs/todo-tag': 'warn',
  'sonarjs/no-small-switch': 'warn',
  'sonarjs/redundant-type-aliases': 'warn',
  'sonarjs/deprecation': 'warn',
  'sonarjs/no-duplicated-branches': 'warn',
  'sonarjs/function-return-type': 'warn',
  'sonarjs/prefer-regexp-exec': 'warn',
  'sonarjs/prefer-single-boolean-return': 'warn',
  'sonarjs/constructor-for-side-effects': 'warn',
  'sonarjs/arguments-order': 'warn',
  'sonarjs/void-use': 'warn',
  'sonarjs/no-hardcoded-passwords': 'warn',
  'unicorn/consistent-function-scoping': 'warn',
  'unicorn/no-array-for-each': 'off',
  'unicorn/no-array-callback-reference': 'error',
  'unicorn/no-useless-undefined': 'warn',
  'unicorn/prefer-optional-catch-binding': 'warn',
  'unicorn/throw-new-error': 'error',
};

export default [
  {
    ignores: ignorePatterns,
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: path.join(__dirname, 'tsconfig.eslint.json'),
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      import: importPlugin,
      promise: promisePlugin,
      security: securityPlugin,
      sonarjs: sonarjsPlugin,
      unicorn: unicornPlugin,
    },
    settings: importSettings,
    rules: baseRules,
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-statements': ['warn', 40],
      'complexity': ['warn', 20],
      'sonarjs/no-duplicate-string': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'unicorn/consistent-function-scoping': 'off',
    },
  },
  {
    files: ['electron/main/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'max-lines': ['warn', { max: 750, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 8],
      'max-statements': ['warn', 40],
      'complexity': ['warn', 30],
      'sonarjs/deprecation': 'off',
      'sonarjs/todo-tag': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/function-return-type': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/no-identical-functions': 'off',
      'unicorn/consistent-function-scoping': 'off',
    },
  },
  {
    files: ['electron/preload/**/*.{ts,tsx}'],
    rules: {
      'unicorn/consistent-function-scoping': 'off',
    },
  },
  {
    files: ['src/types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['src/types/electron-api/**/*.ts'],
    rules: {
      'max-params': 'off',
      'import/order': 'off',
    },
  },
  {
    files: ['src/pages/**/*.{ts,tsx}'],
    rules: {
      'max-lines-per-function': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-lines': ['warn', { max: 800, skipBlankLines: true, skipComments: true }],
      'max-statements': ['warn', 100],
      'complexity': ['warn', 50],
    },
  },
  {
    files: ['src/utils/__tests__/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      'sonarjs/no-duplicate-string': 'off',
      'unicorn/consistent-function-scoping': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: false,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      'max-statements': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-hardcoded-passwords': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', '*.config.ts', '*.config.js', 'tailwind.config.js', 'vite.config.ts', 'vitest.config.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: false,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      'complexity': 'off',
      'sonarjs/cognitive-complexity': 'off',
    },
  },
  {
    files: ['src/utils/**/*.{ts,tsx}'],
    rules: {
      'max-lines-per-function': 'off',
      'max-statements': 'off',
      'complexity': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-conditional': 'off',
    },
  },
  {
    files: ['scripts/**/*.cjs', 'scripts/**/*.js', '*.cjs', '*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.ts', '*.config.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: false,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
    },
  },
];
