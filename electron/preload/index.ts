/**
 * Preload Bridge — Electron ↔ Renderer IPC contract
 *
 * Organized by domain. Each domain module exports a factory that returns
 * its slice of the API.
 *
 * Access via namespaced sub-objects:
 *   electronAPI.auth.login(...)
 *   electronAPI.finance.getFeeCategories(...)
 *
 * Domain modules live in ./api/ — add new IPC methods there, not here.
 */

import { contextBridge, ipcRenderer } from 'electron'

import { createAcademicAPI } from './api/academic'
import { createAuthAPI } from './api/auth'
import { createCommunicationsAPI } from './api/communications'
import { createMenuEventAPI } from './api/events'
import { createFinanceAPI } from './api/finance'
import { createOperationsAPI } from './api/operations'
import { createReportsAPI } from './api/reports'
import { createSettingsAPI } from './api/settings'
import { createStaffAPI } from './api/staff'
import { createStudentAPI } from './api/students'
import { createSystemAPI } from './api/system'
import { setAPIFactories, createRoleAwareAPI, type UserRole } from './roleFilter'

// Set API factories for role filter
setAPIFactories({
  createAuthAPI,
  createSettingsAPI,
  createAcademicAPI,
  createFinanceAPI,
  createStudentAPI,
  createStaffAPI,
  createOperationsAPI,
  createReportsAPI,
  createCommunicationsAPI,
  createSystemAPI,
  createMenuEventAPI
})

// Get user session to determine role
async function getUserRole(): Promise<UserRole> {
  try {
    const session = await ipcRenderer.invoke('auth:getSession')
    return (session?.user?.role as UserRole) || 'STAFF'
  } catch {
    return 'STAFF' // Default role on error
  }
}

// Create role-aware API surface
const roleAwareAPI = createRoleAwareAPI('STAFF') // Default, will be updated

// Update API based on actual user role
getUserRole().then(role => {
  const updatedAPI = createRoleAwareAPI(role)
  Object.assign(roleAwareAPI, updatedAPI)
}).catch(() => {
  // Keep default role if session fetch fails
})

contextBridge.exposeInMainWorld('electronAPI', {
  // Role-filtered access
  ...roleAwareAPI,
  // Namespaced access (for future structured usage)
  ...roleAwareAPI
})
