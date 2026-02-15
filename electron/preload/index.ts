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

const auth = createAuthAPI()
const settings = createSettingsAPI()
const academic = createAcademicAPI()
const finance = createFinanceAPI()
const students = createStudentAPI()
const staff = createStaffAPI()
const operations = createOperationsAPI()
const reports = createReportsAPI()
const communications = createCommunicationsAPI()
const system = createSystemAPI()
const menuEvents = createMenuEventAPI()

contextBridge.exposeInMainWorld('electronAPI', {
  // Flat access (used by all existing pages)
  ...auth,
  ...settings,
  ...academic,
  ...finance,
  ...students,
  ...staff,
  ...operations,
  ...reports,
  ...communications,
  ...system,
  ...menuEvents,
  // Namespaced access (for future structured usage)
  auth,
  settings,
  academic,
  finance,
  students,
  staff,
  operations,
  reports,
  communications,
  system,
  menuEvents,
})
