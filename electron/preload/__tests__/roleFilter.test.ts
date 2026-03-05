/**
 * Tests for electron/preload/roleFilter.ts
 *
 * Security-critical: validates that role-based API filtering works correctly.
 * Covers every role, admin full access, restricted roles denied privileged ops,
 * unknown/empty roles, and the runtime guarded API.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  normalizeUserRole,
  setCurrentRole,
  getCurrentRole,
  filterAPIByRole,
  setAPIFactories,
  createRoleAwareAPI,
  createRuntimeRoleAwareAPI,
  type UserRole,
  type RoleAwareAPI,
} from '../roleFilter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a mock APISlice with named no-op functions */
function mockSlice(...methods: string[]): Record<string, (...args: never[]) => unknown> {
  const slice: Record<string, (...args: never[]) => unknown> = {}
  for (const m of methods) {
    slice[m] = vi.fn().mockResolvedValue(`${m}-result`)
  }
  return slice
}

/** Installs mock API factories on the roleFilter module. */
function installMockFactories() {
  const financeSlice = mockSlice(
    'getFeeCategories', 'getTransactions', 'createTransaction', 'saveFeeStructure', 'listPayments',
    'recordPayment', 'voidPayment', 'hasInvoice', 'validatePayment', 'calculateTotal',
    'onPaymentReceived',
  )
  const academicSlice = mockSlice(
    'getSubjects', 'listExams', 'createExam', 'deleteExam', 'markAttendance', 'saveAcademicResults',
  )
  const studentsSlice = mockSlice('getStudents', 'listEnrollments', 'createStudent', 'updateStudent')
  const staffSlice = mockSlice('getStaff', 'listStaff', 'createStaff', 'updateStaff')
  const reportsSlice = mockSlice('getDashboard', 'getFeeReport', 'getAuditLog', 'createReport')
  const settingsSlice = mockSlice('getSettings', 'get', 'updateSettings', 'resetAndSeedDatabase')
  const operationsSlice = mockSlice('getInventory', 'listRoutes', 'createRoute')
  const communicationsSlice = mockSlice('sendSMS', 'sendEmail', 'getTemplates')
  const systemSlice = mockSlice('createBackup', 'createBackupTo', 'getBackupList', 'openBackupFolder', 'getUsers', 'restoreBackup', 'logError')
  const authSlice = mockSlice('login', 'getSession', 'clearSession')
  const menuSlice = mockSlice('onNavigate', 'onOpenImportDialog')

  setAPIFactories({
    createAuthAPI: () => authSlice,
    createSettingsAPI: () => settingsSlice,
    createAcademicAPI: () => academicSlice,
    createFinanceAPI: () => financeSlice,
    createStudentAPI: () => studentsSlice,
    createStaffAPI: () => staffSlice,
    createOperationsAPI: () => operationsSlice,
    createReportsAPI: () => reportsSlice,
    createCommunicationsAPI: () => communicationsSlice,
    createSystemAPI: () => systemSlice,
    createMenuEventAPI: () => menuSlice,
  })

  return {
    financeSlice, academicSlice, studentsSlice, staffSlice, reportsSlice,
    settingsSlice, operationsSlice, communicationsSlice, systemSlice, authSlice, menuSlice,
  }
}

// ---------------------------------------------------------------------------
// normalizeUserRole
// ---------------------------------------------------------------------------
describe('normalizeUserRole', () => {
  it.each<[unknown, UserRole]>([
    ['ADMIN', 'ADMIN'],
    ['admin', 'ADMIN'],
    [' Admin ', 'ADMIN'],
    ['ACCOUNTS_CLERK', 'ACCOUNTS_CLERK'],
    ['AUDITOR', 'AUDITOR'],
    ['PRINCIPAL', 'PRINCIPAL'],
    ['DEPUTY_PRINCIPAL', 'DEPUTY_PRINCIPAL'],
    ['TEACHER', 'TEACHER'],
  ])('normalizes %j → %s', (input, expected) => {
    expect(normalizeUserRole(input)).toBe(expected)
  })

  it('returns AUDITOR for unknown string role', () => {
    expect(normalizeUserRole('SUPERUSER')).toBe('AUDITOR')
  })

  it('returns AUDITOR for empty string', () => {
    expect(normalizeUserRole('')).toBe('AUDITOR')
  })

  it('returns AUDITOR for whitespace-only string', () => {
    expect(normalizeUserRole('   ')).toBe('AUDITOR')
  })

  it('returns AUDITOR for non-string input (number)', () => {
    expect(normalizeUserRole(42)).toBe('AUDITOR')
  })

  it('returns AUDITOR for null', () => {
    expect(normalizeUserRole(null)).toBe('AUDITOR')
  })

  it('returns AUDITOR for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(normalizeUserRole(undefined)).toBe('AUDITOR')
  })

  it('returns AUDITOR for object', () => {
    expect(normalizeUserRole({ role: 'ADMIN' })).toBe('AUDITOR')
  })
})

// ---------------------------------------------------------------------------
// setCurrentRole / getCurrentRole
// ---------------------------------------------------------------------------
describe('setCurrentRole / getCurrentRole', () => {
  it('stores a valid role', () => {
    setCurrentRole('ADMIN')
    expect(getCurrentRole()).toBe('ADMIN')
  })

  it('normalizes invalid role to AUDITOR', () => {
    setCurrentRole('HACKER')
    expect(getCurrentRole()).toBe('AUDITOR')
  })

  it('handles null input', () => {
    setCurrentRole(null)
    expect(getCurrentRole()).toBe('AUDITOR')
  })
})

// ---------------------------------------------------------------------------
// filterAPIByRole
// ---------------------------------------------------------------------------
describe('filterAPIByRole', () => {
  const fullSlice = mockSlice(
    'getItems', 'listItems', 'createItem', 'deleteItem', 'hasPermission',
    'onEvent', 'validateData', 'calculateTotal',
  )

  describe('wildcard (*) grants all methods', () => {
    it('ADMIN gets finance wildcard', () => {
      const filtered = filterAPIByRole(fullSlice, 'ADMIN', 'finance')
      expect(Object.keys(filtered)).toEqual(Object.keys(fullSlice))
    })
  })

  describe(':read sentinel allows only read-only prefixed methods', () => {
    // AUDITOR has finance: [':read']
    it('AUDITOR can only call read-prefixed finance methods', () => {
      const filtered = filterAPIByRole(fullSlice, 'AUDITOR', 'finance')
      const allowed = Object.keys(filtered)
      expect(allowed).toContain('getItems')
      expect(allowed).toContain('listItems')
      expect(allowed).toContain('hasPermission')
      expect(allowed).toContain('onEvent')
      expect(allowed).toContain('validateData')
      expect(allowed).toContain('calculateTotal')
      expect(allowed).not.toContain('createItem')
      expect(allowed).not.toContain('deleteItem')
    })
  })

  describe('explicit method names', () => {
    // TEACHER academic: [':read', 'markAttendance', 'saveAcademicResults']
    const academicSlice = mockSlice(
      'getSubjects', 'createExam', 'markAttendance', 'saveAcademicResults', 'deleteExam',
    )
    it('TEACHER gets read methods + explicitly listed', () => {
      const filtered = filterAPIByRole(academicSlice, 'TEACHER', 'academic')
      expect(Object.keys(filtered)).toContain('getSubjects')
      expect(Object.keys(filtered)).toContain('markAttendance')
      expect(Object.keys(filtered)).toContain('saveAcademicResults')
      expect(Object.keys(filtered)).not.toContain('createExam')
      expect(Object.keys(filtered)).not.toContain('deleteExam')
    })
  })

  describe('empty permissions array blocks everything', () => {
    // TEACHER finance: []
    it('TEACHER gets no finance methods', () => {
      const filtered = filterAPIByRole(fullSlice, 'TEACHER', 'finance')
      expect(Object.keys(filtered)).toHaveLength(0)
    })

    // TEACHER system: []
    it('TEACHER gets no system methods', () => {
      const systemSlice = mockSlice('createBackup', 'getBackupList', 'restoreBackup')
      const filtered = filterAPIByRole(systemSlice, 'TEACHER', 'system')
      expect(Object.keys(filtered)).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------
// createRoleAwareAPI — per-role integration
// ---------------------------------------------------------------------------
describe('createRoleAwareAPI', () => {
  beforeEach(() => {
    installMockFactories()
  })

  it('ADMIN gets every method in every domain', () => {
    const api = createRoleAwareAPI('ADMIN')
    // Finance should have all methods
    expect(Object.keys(api.finance)).toContain('createTransaction')
    expect(Object.keys(api.finance)).toContain('voidPayment')
    // System full access
    expect(Object.keys(api.system)).toContain('restoreBackup')
    expect(Object.keys(api.system)).toContain('getUsers')
  })

  it('auth and menuEvents are always unfiltered', () => {
    const api = createRoleAwareAPI('TEACHER')
    expect(Object.keys(api.auth)).toContain('login')
    expect(Object.keys(api.menuEvents)).toContain('onNavigate')
  })

  describe('ACCOUNTS_CLERK permissions', () => {
    let api: RoleAwareAPI

    beforeEach(() => {
      api = createRoleAwareAPI('ACCOUNTS_CLERK')
    })

    it('gets full finance access', () => {
      expect(Object.keys(api.finance)).toContain('createTransaction')
      expect(Object.keys(api.finance)).toContain('voidPayment')
    })

    it('academic is read-only', () => {
      expect(Object.keys(api.academic)).toContain('getSubjects')
      expect(Object.keys(api.academic)).toContain('listExams')
      expect(Object.keys(api.academic)).not.toContain('createExam')
      expect(Object.keys(api.academic)).not.toContain('deleteExam')
    })

    it('communications only sendSMS', () => {
      expect(Object.keys(api.communications)).toContain('sendSMS')
      expect(Object.keys(api.communications)).not.toContain('sendEmail')
    })

    it('settings only getSettings and get', () => {
      expect(Object.keys(api.settings)).toContain('getSettings')
      expect(Object.keys(api.settings)).toContain('get')
      expect(Object.keys(api.settings)).not.toContain('updateSettings')
      expect(Object.keys(api.settings)).not.toContain('resetAndSeedDatabase')
    })

    it('system has backup methods only', () => {
      expect(Object.keys(api.system)).toContain('createBackup')
      expect(Object.keys(api.system)).toContain('createBackupTo')
      expect(Object.keys(api.system)).toContain('getBackupList')
      expect(Object.keys(api.system)).toContain('openBackupFolder')
      expect(Object.keys(api.system)).not.toContain('getUsers')
      expect(Object.keys(api.system)).not.toContain('restoreBackup')
    })
  })

  describe('AUDITOR permissions', () => {
    let api: RoleAwareAPI

    beforeEach(() => {
      api = createRoleAwareAPI('AUDITOR')
    })

    it('finance is read-only', () => {
      expect(Object.keys(api.finance)).toContain('getFeeCategories')
      expect(Object.keys(api.finance)).toContain('getTransactions')
      expect(Object.keys(api.finance)).not.toContain('createTransaction')
      expect(Object.keys(api.finance)).not.toContain('recordPayment')
      expect(Object.keys(api.finance)).not.toContain('voidPayment')
      expect(Object.keys(api.finance)).not.toContain('saveFeeStructure')
    })

    it('reports full access', () => {
      expect(Object.keys(api.reports)).toContain('getDashboard')
      expect(Object.keys(api.reports)).toContain('createReport')
    })

    it('communications is empty', () => {
      expect(Object.keys(api.communications)).toHaveLength(0)
    })

    it('system only getBackupList', () => {
      expect(Object.keys(api.system)).toContain('getBackupList')
      expect(Object.keys(api.system)).not.toContain('createBackup')
      expect(Object.keys(api.system)).not.toContain('restoreBackup')
    })
  })

  describe('PRINCIPAL permissions', () => {
    let api: RoleAwareAPI

    beforeEach(() => {
      api = createRoleAwareAPI('PRINCIPAL')
    })

    it('finance is read-only', () => {
      expect(Object.keys(api.finance)).toContain('getFeeCategories')
      expect(Object.keys(api.finance)).not.toContain('createTransaction')
    })

    it('academic/students/staff/operations full access', () => {
      expect(Object.keys(api.academic)).toContain('createExam')
      expect(Object.keys(api.students)).toContain('createStudent')
      expect(Object.keys(api.staff)).toContain('createStaff')
      expect(Object.keys(api.operations)).toContain('createRoute')
    })

    it('settings/system/communications full access', () => {
      expect(Object.keys(api.settings)).toContain('updateSettings')
      expect(Object.keys(api.system)).toContain('restoreBackup')
      expect(Object.keys(api.communications)).toContain('sendEmail')
    })
  })

  describe('DEPUTY_PRINCIPAL permissions', () => {
    let api: RoleAwareAPI

    beforeEach(() => {
      api = createRoleAwareAPI('DEPUTY_PRINCIPAL')
    })

    it('finance is read-only', () => {
      expect(Object.keys(api.finance)).not.toContain('createTransaction')
    })

    it('staff is read-only', () => {
      expect(Object.keys(api.staff)).toContain('getStaff')
      expect(Object.keys(api.staff)).not.toContain('createStaff')
    })

    it('settings only getSettings and get', () => {
      expect(Object.keys(api.settings)).toContain('getSettings')
      expect(Object.keys(api.settings)).not.toContain('updateSettings')
    })

    it('system has backup methods only', () => {
      expect(Object.keys(api.system)).toContain('createBackup')
      expect(Object.keys(api.system)).not.toContain('getUsers')
    })
  })

  describe('TEACHER permissions', () => {
    let api: RoleAwareAPI

    beforeEach(() => {
      api = createRoleAwareAPI('TEACHER')
    })

    it('finance is completely empty', () => {
      expect(Object.keys(api.finance)).toHaveLength(0)
    })

    it('academic allows read + markAttendance + saveAcademicResults', () => {
      expect(Object.keys(api.academic)).toContain('getSubjects')
      expect(Object.keys(api.academic)).toContain('listExams')
      expect(Object.keys(api.academic)).toContain('markAttendance')
      expect(Object.keys(api.academic)).toContain('saveAcademicResults')
      expect(Object.keys(api.academic)).not.toContain('createExam')
      expect(Object.keys(api.academic)).not.toContain('deleteExam')
    })

    it('students/staff/reports/operations are read-only', () => {
      expect(Object.keys(api.students)).toContain('getStudents')
      expect(Object.keys(api.students)).not.toContain('createStudent')
      expect(Object.keys(api.staff)).toContain('getStaff')
      expect(Object.keys(api.staff)).not.toContain('createStaff')
    })

    it('communications only sendSMS', () => {
      expect(Object.keys(api.communications)).toContain('sendSMS')
      expect(Object.keys(api.communications)).not.toContain('sendEmail')
    })

    it('system is completely empty', () => {
      expect(Object.keys(api.system)).toHaveLength(0)
    })
  })
})

// ---------------------------------------------------------------------------
// createRuntimeRoleAwareAPI — guarded methods
// ---------------------------------------------------------------------------
describe('createRuntimeRoleAwareAPI', () => {
  beforeEach(() => {
    installMockFactories()
  })

  it('allows method call when role permits', async () => {
    const api = createRuntimeRoleAwareAPI(() => 'ADMIN')
    const result = await api.finance['createTransaction']()
    expect(result).toBe('createTransaction-result')
  })

  it('rejects method call when role denies', async () => {
    const api = createRuntimeRoleAwareAPI(() => 'TEACHER')
    await expect(api.finance['createTransaction']()).rejects.toThrow(
      /role 'TEACHER' cannot invoke 'createTransaction' in 'finance'/,
    )
  })

  it('allows read-only methods for AUDITOR in finance', async () => {
    const api = createRuntimeRoleAwareAPI(() => 'AUDITOR')
    const result = await api.finance['getFeeCategories']()
    expect(result).toBe('getFeeCategories-result')
  })

  it('denies write methods for AUDITOR in finance', async () => {
    const api = createRuntimeRoleAwareAPI(() => 'AUDITOR')
    await expect(api.finance['saveFeeStructure']()).rejects.toThrow(/role 'AUDITOR'/)
  })

  it('dynamically switches when role getter changes', async () => {
    let role: UserRole = 'ADMIN'
    const api = createRuntimeRoleAwareAPI(() => role)

    // Initially allowed
    await expect(api.finance['createTransaction']()).resolves.toBeDefined()

    // Switch to TEACHER — now denied
    role = 'TEACHER'
    await expect(api.finance['createTransaction']()).rejects.toThrow(/role 'TEACHER'/)
  })

  it('auth and menuEvents bypass role guard', async () => {
    const api = createRuntimeRoleAwareAPI(() => 'TEACHER')
    // Auth and menuEvents are returned unfiltered
    const loginResult = await api.auth['login']()
    expect(loginResult).toBe('login-result')

    const navResult = await api.menuEvents['onNavigate']()
    expect(navResult).toBe('onNavigate-result')
  })
})

// ---------------------------------------------------------------------------
// Error: factories not initialized
// ---------------------------------------------------------------------------
describe('createRoleAwareAPI without factories', () => {
  it('throws when factories are not set', () => {
    // Reset factories
    setAPIFactories(null as never)
    expect(() => createRoleAwareAPI('ADMIN')).toThrow('Preload API factories are not initialized')
  })
})
