import { ipcRenderer } from 'electron'

import type { SettingsData } from '../types'

export function createSettingsAPI() {
  return {
    getSettings: () => ipcRenderer.invoke('settings:get'),
    getSchoolSettings: () => ipcRenderer.invoke('settings:get'),
    updateSettings: (data: SettingsData) => ipcRenderer.invoke('settings:update', data),
    getAllConfigs: () => ipcRenderer.invoke('settings:getAllConfigs'),
    saveSecureConfig: (key: string, value: string) => ipcRenderer.invoke('settings:saveSecure', key, value),
    resetAndSeedDatabase: (userId: number) => ipcRenderer.invoke('system:resetAndSeed', userId),
    normalizeCurrencyScale: (userId: number) => ipcRenderer.invoke('system:normalizeCurrencyScale', userId),
  }
}
