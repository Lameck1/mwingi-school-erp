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
                    if (id.includes('node_modules')) {
                        if (id.includes('react-dom')) {return 'react'}
                        if (id.includes('/react/') || id.includes('\\react\\')) {return 'react'}
                        if (id.includes('scheduler')) {return 'react'}
                        if (id.includes('use-sync-external-store')) {return 'react'}
                        if (id.includes('react-is')) {return 'react'}
                        if (id.includes('react-router')) {return 'router'}
                        if (id.includes('date-fns')) {return 'date-fns'}
                        if (id.includes('cmdk')) {return 'cmdk'}
                        if (id.includes('zustand')) {return 'zustand'}
                        if (id.includes('lucide-react')) {return 'icons'}
                        if (id.includes('@tanstack')) {return 'table'}
                        if (id.includes('recharts')) {return 'recharts'}
                        if (id.includes('jspdf') || id.includes('pdf-lib')) {return 'pdf'}
                        if (id.includes('html2canvas')) {return 'html2canvas'}
                        return 'vendor'
                    }
                },
            },
        },
    },
})
