import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const _electron = require('electron')
export const app = _electron.app
export const BrowserWindow = _electron.BrowserWindow
export const dialog = _electron.dialog
export const ipcMain = _electron.ipcMain
// bcrypt is loaded where needed (auth handlers) rather than in the Electron env shim
