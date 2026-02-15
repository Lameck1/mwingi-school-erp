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

import { contextBridge } from 'electron'

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
import { setAPIFactories, createRoleAwareAPI } from './roleFilter'

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

// Expose the full API surface unconditionally.
// Security enforcement happens server-side via safeHandleRawWithRole in the
// main process IPC handlers (see ipc-result.ts). The preload layer is NOT a
// security boundary — contextBridge freezes the object synchronously, making
// any async role-based filtering unreliable (the previous Object.assign race).
const namespacedAPI = createRoleAwareAPI('ADMIN')

// Compatibility bridge:
// renderer code relies on both flat and namespaced API shapes.
const flatAPI = {
  ...namespacedAPI.auth,
  ...namespacedAPI.settings,
  ...namespacedAPI.academic,
  ...namespacedAPI.finance,
  ...namespacedAPI.students,
  ...namespacedAPI.staff,
  ...namespacedAPI.operations,
  ...namespacedAPI.reports,
  ...namespacedAPI.communications,
  ...namespacedAPI.system,
  ...namespacedAPI.menuEvents
}

contextBridge.exposeInMainWorld('electronAPI', {
  ...flatAPI,
  ...namespacedAPI
})
