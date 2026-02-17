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
import { setAPIFactories, createRuntimeRoleAwareAPI, getCurrentRole, setCurrentRole } from './roleFilter'

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

const runtimeRoleAPI = createRuntimeRoleAwareAPI(getCurrentRole)

const authAPI = {
  ...runtimeRoleAPI.auth,
  login: async (username: string, password: string) => {
    const result = await runtimeRoleAPI.auth['login']!(username, password) as { success?: boolean; user?: { role?: string } }
    if (result.success && result.user?.role) {
      setCurrentRole(result.user.role)
    }
    return result
  },
  getSession: async () => {
    const session = await runtimeRoleAPI.auth['getSession']!() as { user?: { role?: string } } | null
    setCurrentRole(session?.user?.role)
    return session
  },
  setSession: async (session: { user?: { role?: string } }) => {
    const result = await runtimeRoleAPI.auth['setSession']!(session) as { success?: boolean }
    if (result.success !== false) {
      setCurrentRole(session.user?.role)
    }
    return result
  },
  clearSession: async () => {
    const result = await runtimeRoleAPI.auth['clearSession']!() as { success?: boolean }
    if (result.success !== false) {
      setCurrentRole('AUDITOR')
    }
    return result
  }
}

// Hydrate runtime role as soon as preload starts. If it fails we keep
// least-privilege default ('AUDITOR').
void authAPI.getSession().catch(() => {})

const namespacedAPI = {
  ...runtimeRoleAPI,
  auth: authAPI
}

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
