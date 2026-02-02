/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['electron/main/**/*.{test,spec}.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
        },
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@main': path.resolve(__dirname, './electron/main'),
        },
        server: {
            deps: {
                external: ['better-sqlite3-multiple-ciphers', 'electron', 'bcryptjs']
            }
        }
    },
})
