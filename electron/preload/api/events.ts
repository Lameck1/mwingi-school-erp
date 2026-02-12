import { ipcRenderer } from 'electron'

import type { IpcRendererEvent } from 'electron'

/**
 * Menu and system event listeners.
 * Each returns an unsubscribe function for cleanup.
 */
export function createMenuEventAPI() {
  return {
    onNavigate: (callback: (path: string) => void) => {
      const listener = (_event: IpcRendererEvent, path: string) => callback(path)
      ipcRenderer.on('navigate', listener)
      return () => ipcRenderer.removeListener('navigate', listener)
    },
    onOpenImportDialog: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('open-import-dialog', listener)
      return () => ipcRenderer.removeListener('open-import-dialog', listener)
    },
    onTriggerPrint: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('trigger-print', listener)
      return () => ipcRenderer.removeListener('trigger-print', listener)
    },
    onBackupDatabase: (callback: (path: string) => void) => {
      const listener = (_event: IpcRendererEvent, path: string) => callback(path)
      ipcRenderer.on('backup-database', listener)
      return () => ipcRenderer.removeListener('backup-database', listener)
    },
    onOpenCommandPalette: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('open-command-palette', listener)
      return () => ipcRenderer.removeListener('open-command-palette', listener)
    },
    onCheckForUpdates: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('check-for-updates', listener)
      return () => ipcRenderer.removeListener('check-for-updates', listener)
    },
    onUpdateStatus: (callback: (data: unknown) => void) => {
      const listener = (_event: IpcRendererEvent, data: unknown) => callback(data)
      ipcRenderer.on('update-status', listener)
      return () => ipcRenderer.removeListener('update-status', listener)
    },
    onDatabaseError: (callback: (message: string) => void) => {
      const listener = (_event: IpcRendererEvent, message: string) => callback(message)
      ipcRenderer.on('db-error', listener)
      return () => ipcRenderer.removeListener('db-error', listener)
    },
  }
}
