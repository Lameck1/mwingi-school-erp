import { app, BrowserWindow, dialog } from './electron-env'
import type { BrowserWindow as BrowserWindowType } from 'electron'

import path from 'path'
import { fileURLToPath } from 'url'
import { initializeDatabase } from './database/index'
import { registerAllIpcHandlers } from './ipc/index'
import { BackupService } from './backup-service'

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration()

let mainWindow: BrowserWindowType | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        icon: path.join(__dirname, '../../resources/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
        show: false,
        titleBarStyle: 'default',
    })

    // Show window when ready
    mainWindow!.once('ready-to-show', () => {
        mainWindow?.show()
    })

    // Pipe renderer logs to main process
    mainWindow!.webContents.on('console-message', (_event, _level, message) => {
        console.log(`[Renderer] ${message}`)
    })

    // Load the app
    if (VITE_DEV_SERVER_URL) {
        mainWindow!.loadURL(VITE_DEV_SERVER_URL)
        mainWindow!.webContents.openDevTools()
    } else {
        mainWindow!.loadFile(path.join(__dirname, '../../dist/index.html'))
    }

    mainWindow!.on('closed', () => {
        mainWindow = null
    })
}

// App lifecycle
app.whenReady().then(async () => {
    // Initialize database
    try {
        await initializeDatabase()
        // console.log('Database initialized successfully')
    } catch (error) {
        console.error('Failed to initialize database:', error)
        dialog.showErrorBox('Database Error', 'Failed to initialize database. Application will exit.')
        app.quit()
        return
    }

    // Register IPC handlers
    registerAllIpcHandlers()

    // Initialize Auto Backup Service
    BackupService.init()

    // Create window
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
});

// Handle uncaught exceptions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error)
    // In production, you might want to gracefully exit or restart
});

// Handle unhandled promise rejections
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    // In production, you might want to gracefully exit or restart
});









