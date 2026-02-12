import { ipcRenderer } from 'electron'

export function createAuthAPI() {
  return {
    login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
    changePassword: (userId: number, oldPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', userId, oldPassword, newPassword),
    hasUsers: () => ipcRenderer.invoke('auth:hasUsers'),
    setupAdmin: (data: { username: string; password: string; full_name: string; email: string }) =>
      ipcRenderer.invoke('auth:setupAdmin', data),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    setSession: (session: { user: unknown; lastActivity: number }) => ipcRenderer.invoke('auth:setSession', session),
    clearSession: () => ipcRenderer.invoke('auth:clearSession'),
  }
}
