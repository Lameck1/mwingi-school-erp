declare global {
  interface Window {
    electronAPI: import('./electron-api').ElectronAPI
  }

  var electronAPI: import('./electron-api').ElectronAPI
}

export {}
