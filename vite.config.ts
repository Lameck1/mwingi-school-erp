import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'path'

export default defineConfig({
    plugins: [
        react(),
        electron({
            main: {
                entry: 'electron/main/index.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron/main',
                        rollupOptions: {
                            external: ['electron', 'better-sqlite3', 'bcryptjs'],
                        },
                        commonjsOptions: {
                            ignoreDynamicRequires: true,
                        },
                    },
                },
            },
            preload: {
                input: 'electron/preload/index.ts',
                vite: {
                    build: {
                        outDir: 'dist-electron/preload',
                        rollupOptions: {
                            output: {
                                entryFileNames: '[name].cjs',
                                format: 'cjs',
                            },
                        },
                    },
                },
            },
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            },
        },
    },
})
