/// <reference types="vitest" />
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['electron/main/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: [
                'electron/main/ipc/**/*.ts',
                'electron/main/services/**/*.ts',
                'electron/main/database/**/*.ts',
                'src/pages/Finance/finance.validation.ts',
                'src/pages/Finance/Reconciliation/reconcile.logic.ts',
                'src/pages/Finance/FixedAssets/depreciation.logic.ts',
                'src/pages/Students/promotion-feedback.logic.ts',
                'src/pages/Payroll/payrollStatus.ts',
                'src/components/layout/nav-utils.ts'
            ],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/dist-electron/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/types/**',
                '**/electron-env.ts',
                '**/migrations/archive/**'
            ],
            thresholds: {
                lines: 25,
                functions: 20,
                branches: 15,
                statements: 25
            },
            reportsDirectory: './coverage'
        },
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@main': path.resolve(__dirname, './electron/main'),
        },
        server: {
            deps: {
                external: ['better-sqlite3-multiple-ciphers', 'electron', 'bcryptjs']
            }
        },
        setupFiles: [],
        testTimeout: 10000,
        hookTimeout: 10000
    },
})
