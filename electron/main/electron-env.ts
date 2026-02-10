import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electron = require('electron')

export const app = electron.app
export const BrowserWindow = electron.BrowserWindow
export const dialog = electron.dialog
export const ipcMain = electron.ipcMain
export const safeStorage = electron.safeStorage
export const shell = electron.shell
export const screen = electron.screen
export const Menu = electron.Menu
// bcrypt is loaded where needed (auth handlers) rather than in the Electron env shim
