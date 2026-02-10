import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
    plugins: [
        react(),
        electron({
            main: {
                entry: 'electron/main/index.ts',
                vite: {
                    esbuild: {
                        target: 'esnext',
                    },
                    build: {
                        target: 'esnext',
                        outDir: 'dist-electron/main',
                        rollupOptions: {
                            external: ['electron', 'better-sqlite3-multiple-ciphers', 'better-sqlite3', 'bcryptjs', 'nodemailer', 'keytar'],
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
                    esbuild: {
                        target: 'esnext',
                    },
                    build: {
                        target: 'esnext',
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
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext',
        },
    },
    build: {
        target: 'esnext',
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
            },
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) { return undefined }
                    
                    // Map module patterns to chunk names for code splitting
                    const chunkPatterns: Array<[string[], string]> = [
                        [['react-dom', '/react/', '\\react\\', 'scheduler', 'use-sync-external-store', 'react-is'], 'react'],
                        [['react-router'], 'router'],
                        [['date-fns'], 'date-fns'],
                        [['cmdk'], 'cmdk'],
                        [['zustand'], 'zustand'],
                        [['lucide-react'], 'icons'],
                        [['@tanstack'], 'table'],
                        [['recharts'], 'recharts'],
                        [['jspdf', 'pdf-lib'], 'pdf'],
                        [['html2canvas'], 'html2canvas'],
                    ]
                    
                    for (const [patterns, chunkName] of chunkPatterns) {
                        if (patterns.some(pattern => id.includes(pattern))) {
                            return chunkName
                        }
                    }
                    return 'vendor'
                },
            },
        },
    },
})
