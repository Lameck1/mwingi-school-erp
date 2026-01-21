import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { initializeDatabase } from './database.js'
import { registerIpcHandlers } from './ipc-handlers.js'
import { BackupService } from './backup-service.js'

// ESM __dirname polyfill
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        icon: path.join(__dirname, '../../resources/icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
        titleBarStyle: 'default',
    })

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
    })

    // Load the app
    if (VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL)
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

// App lifecycle
app.whenReady().then(async () => {
    // Initialize database
    try {
        await initializeDatabase()
        console.log('Database initialized successfully')
    } catch (error) {
        console.error('Failed to initialize database:', error)
    }

    // Register IPC handlers
    registerIpcHandlers()

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
(process as any).on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error)
});

// Handle unhandled promise rejections
(process as any).on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason)
});


