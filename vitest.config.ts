/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['electron/main/**/*.{test,spec}.ts'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['electron/main/services/**/*.ts', 'electron/main/database/**/*.ts'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/types/**',
                '**/electron-env.ts'
            ],
            thresholds: {
                lines: 80,
                functions: 80,
                branches: 75,
                statements: 80
            },
            all: true,
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
