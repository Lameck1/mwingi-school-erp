import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

// Base configuration for all files
const baseConfig = {
  languageOptions: {
    parser: typescriptParser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true
      },
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    globals: {
      ...globals.browser,
      ...globals.node,
      ...globals.es2021,
      ...globals.jest
    }
  },
  plugins: {
    '@typescript-eslint': typescriptEslint,
    'react': reactPlugin,
    'react-hooks': reactHooks,
    'jsx-a11y': jsxA11y
  },
  rules: {
    // TypeScript rules
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      args: 'after-used',
      ignoreRestSiblings: true
    }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    
    // React rules
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    
    // General rules
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    
    // Accessibility
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/interactive-supports-focus': 'warn'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};

export default [
  {
    // Global ignore patterns for all configurations
    ignores: ['dist/**/*', 'dist-electron/**/*', 'node_modules/**/*', '**/*.min.js', '**/assets/*.js']
  },
  js.configs.recommended,
  {
    // Apply to all TypeScript files except config files
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.config.ts', 'vite.config.ts'],
    ...baseConfig
  },
  {
    // Configuration files - no project reference
    files: ['**/*.config.ts', 'vite.config.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: null
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        ...globals.jest
      }
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'react': reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y
    },
    rules: {
      ...baseConfig.rules,
      '@typescript-eslint/no-explicit-any': 'off'
    },
    settings: baseConfig.settings
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: baseConfig.languageOptions,
    plugins: baseConfig.plugins,
    rules: {
      ...baseConfig.rules,
      '@typescript-eslint/no-explicit-any': 'off'
    },
    settings: baseConfig.settings
  },
  {
    files: ['electron/**/*.ts'],
    languageOptions: baseConfig.languageOptions,
    plugins: baseConfig.plugins,
    rules: {
      ...baseConfig.rules,
      '@typescript-eslint/no-var-requires': 'off'
    },
    settings: baseConfig.settings
  },
  {
    // Interface definitions - disable unused vars for interface parameters
    files: ['**/types/**/*.ts', '**/*.d.ts', '**/stores/**/*.ts', '**/contexts/**/*.ts'],
    languageOptions: baseConfig.languageOptions,
    plugins: baseConfig.plugins,
    rules: {
      ...baseConfig.rules,
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off'
    },
    settings: baseConfig.settings
  },
  {
    // Context files - disable unused vars for interface parameters
    files: ['**/contexts/**/*.ts', '**/contexts/**/*.tsx'],
    languageOptions: baseConfig.languageOptions,
    plugins: baseConfig.plugins,
    rules: {
      ...baseConfig.rules,
      'no-unused-vars': 'off'
    },
    settings: baseConfig.settings
  },
  {
    // Scripts - allow console and require
    files: ['scripts/**/*.cjs', 'scripts/**/*.js'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script'
      },
      globals: {
        ...globals.node,
        console: 'readonly',
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': typescriptEslint
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off'
    }
  }
];