/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['electron/main/**/*.{test,spec}.ts', 'electron/preload/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
            include: [
                'electron/main/ipc/**/*.ts',
                'electron/main/services/**/*.ts',
                'electron/main/database/**/*.ts',
                'electron/main/utils/**/*.ts',
                'electron/main/security/**/*.ts',
                'src/utils/**/*.ts',
                'src/hooks/**/*.ts',
                'src/hooks/**/*.tsx',
                'src/stores/**/*.ts',
                'src/contexts/**/*.ts',
                'src/contexts/**/*.tsx',
                'src/pages/Finance/finance.validation.ts',
                'src/pages/Finance/Reconciliation/reconcile.logic.ts',
                'src/pages/Finance/FixedAssets/depreciation.logic.ts',
                'src/pages/Finance/Settings/openingBalanceImport.helpers.ts',
                'src/pages/Students/promotion-feedback.logic.ts',
                'src/pages/Payroll/payrollStatus.ts',
                'src/components/layout/nav-utils.ts',
                'src/pages/**/use*.ts'
            ],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/dist-electron/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/types/**',
                '**/electron-env.ts',
                '**/migrations/archive/**',
                'electron/main/ipc/**/types.ts',
                'electron/main/services/**/*.types.ts',
                'electron/main/services/**/notification-types.ts',
                'electron/main/services/base/interfaces/IService.ts',
                'src/utils/exporters/index.ts'
            ],
            thresholds: {
                lines: 99,
                functions: 98,
                branches: 95,
                statements: 98
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
