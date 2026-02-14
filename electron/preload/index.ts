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

contextBridge.exposeInMainWorld('electronAPI', {
  auth: createAuthAPI(),
  settings: createSettingsAPI(),
  academic: createAcademicAPI(),
  finance: createFinanceAPI(),
  students: createStudentAPI(),
  staff: createStaffAPI(),
  operations: createOperationsAPI(),
  reports: createReportsAPI(),
  communications: createCommunicationsAPI(),
  system: createSystemAPI(),
  menuEvents: createMenuEventAPI(),
})
