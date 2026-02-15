/**
 * Role-based API filtering for preload layer
 * Implements principle of least privilege
 */

export type UserRole = 'ADMIN' | 'MANAGEMENT' | 'FINANCE' | 'ACADEMIC' | 'STAFF' | 'TEACHER'

export interface RolePermissions {
  finance: string[]
  academic: string[]
  staff: string[]
  reports: string[]
  settings: string[]
  operations: string[]
  communications: string[]
}

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  ADMIN: {
    finance: ['*'], // Full access
    academic: ['*'],
    staff: ['*'],
    reports: ['*'],
    settings: ['*'],
    operations: ['*'],
    communications: ['*']
  },
  MANAGEMENT: {
    finance: ['getFeeCategories', 'getFeeStructure', 'getInvoices', 'getTransactions', 'getCashFlowStatement', 'getForecast'],
    academic: ['*'], // Full academic access
    staff: ['getStaff', 'getStaffById'],
    reports: ['getBalanceSheet', 'getProfitAndLoss', 'getTrialBalance', 'getComparativeProfitAndLoss'],
    settings: ['getSettings'],
    operations: ['*'],
    communications: ['*']
  },
  FINANCE: {
    finance: ['*'], // Full finance access
    academic: ['getStudents', 'getStudentById'],
    staff: ['getStaff', 'getStaffById'],
    reports: ['getBalanceSheet', 'getProfitAndLoss', 'getTrialBalance', 'getComparativeProfitAndLoss'],
    settings: ['getSettings'],
    operations: [],
    communications: ['sendSMS']
  },
  ACADEMIC: {
    finance: ['getFeeCategories', 'getFeeStructure', 'getInvoicesByStudent'],
    academic: ['*'], // Full academic access
    staff: ['getStaff', 'getStaffById'],
    reports: ['getReportCards', 'getExamAnalytics'],
    settings: ['getSettings'],
    operations: ['*'],
    communications: ['sendSMS']
  },
  STAFF: {
    finance: [], // No finance access
    academic: ['getStudents', 'getStudentById'],
    staff: ['getStaff', 'getStaffById'],
    reports: ['getReportCards'],
    settings: ['getSettings'],
    operations: [],
    communications: []
  },
  TEACHER: {
    finance: [],
    academic: ['getStudents', 'getStudentById', 'getSubjects', 'getExams'],
    staff: ['getStaff', 'getStaffById'],
    reports: ['getReportCards', 'getExamAnalytics'],
    settings: ['getSettings'],
    operations: [],
    communications: ['sendSMS']
  }
}

/**
 * Filters API methods based on user role
 */
export function filterAPIByRole<T extends Record<string, unknown>>(
  api: T,
  userRole: UserRole,
  domain: keyof RolePermissions
): Partial<T> {
  const roleConfig = ROLE_PERMISSIONS[userRole]
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!roleConfig) {
    console.warn(`Unknown role encountered: ${userRole}`)
    return {}
  }

  const permissions = roleConfig[domain]
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!permissions) {
    return {}
  }
  
  if (permissions.includes('*')) {
    return api // Full access
  }
  
  const filtered: Partial<T> = {}
  for (const [key, value] of Object.entries(api)) {
    if (permissions.includes(key)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (filtered as any)[key] = value
    }
  }
  
  return filtered
}

/**
 * Creates a role-aware API surface
 */
export function createRoleAwareAPI(userRole: UserRole) {
  return {
    auth: createAuthAPI(), // Auth always available
    settings: filterAPIByRole(createSettingsAPI(), userRole, 'settings'),
    academic: filterAPIByRole(createAcademicAPI(), userRole, 'academic'),
    finance: filterAPIByRole(createFinanceAPI(), userRole, 'finance'),
    students: filterAPIByRole(createStudentAPI(), userRole, 'academic'),
    staff: filterAPIByRole(createStaffAPI(), userRole, 'staff'),
    operations: filterAPIByRole(createOperationsAPI(), userRole, 'operations'),
    reports: filterAPIByRole(createReportsAPI(), userRole, 'reports'),
    communications: filterAPIByRole(createCommunicationsAPI(), userRole, 'communications'),
    system: createSystemAPI(), // System always available
    menuEvents: createMenuEventAPI() // Menu events always available
  }
}

// Import dependencies (avoid circular dependency)
type ApiFactory = () => Record<string, unknown>
let createAuthAPI: ApiFactory, createSettingsAPI: ApiFactory, createAcademicAPI: ApiFactory
let createFinanceAPI: ApiFactory, createStudentAPI: ApiFactory, createStaffAPI: ApiFactory
let createOperationsAPI: ApiFactory, createReportsAPI: ApiFactory, createCommunicationsAPI: ApiFactory
let createSystemAPI: ApiFactory, createMenuEventAPI: ApiFactory

export function setAPIFactories(factories: {
  createAuthAPI: ApiFactory
  createSettingsAPI: ApiFactory
  createAcademicAPI: ApiFactory
  createFinanceAPI: ApiFactory
  createStudentAPI: ApiFactory
  createStaffAPI: ApiFactory
  createOperationsAPI: ApiFactory
  createReportsAPI: ApiFactory
  createCommunicationsAPI: ApiFactory
  createSystemAPI: ApiFactory
  createMenuEventAPI: ApiFactory
}) {
  ({
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
  } = factories)
}
