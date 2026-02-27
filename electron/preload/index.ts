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
const runtimeAuthAPI = runtimeRoleAPI.auth as Record<string, (...args: unknown[]) => unknown>

const authAPI = {
  ...runtimeRoleAPI.auth,
  login: async (username: string, password: string) => {
    const login = runtimeAuthAPI['login']
    if (!login) {
      throw new Error('Auth API login handler is not available')
    }
    const result = await login(username, password) as { success?: boolean; user?: { role?: string } }
    if (result.success && result.user?.role) {
      setCurrentRole(result.user.role)
    }
    return result
  },
  getSession: async () => {
    const getSession = runtimeAuthAPI['getSession']
    if (!getSession) {
      throw new Error('Auth API session handler is not available')
    }
    const session = await getSession() as { user?: { role?: string } } | null
    setCurrentRole(session?.user?.role)
    return session
  },
  setSession: async (session: { user?: { role?: string } }) => {
    const setSession = runtimeAuthAPI['setSession']
    if (!setSession) {
      throw new Error('Auth API setSession handler is not available')
    }
    const result = await setSession(session) as { success?: boolean }
    if (result.success !== false) {
      setCurrentRole(session.user?.role)
    }
    return result
  },
  clearSession: async () => {
    const clearSession = runtimeAuthAPI['clearSession']
    if (!clearSession) {
      throw new Error('Auth API clearSession handler is not available')
    }
    const result = await clearSession() as { success?: boolean }
    if (result.success !== false) {
      setCurrentRole('AUDITOR')
    }
    return result
  }
}

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
