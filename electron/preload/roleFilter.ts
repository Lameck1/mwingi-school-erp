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
export function filterAPIByRole<T extends Record<string, any>>(
  api: T,
  userRole: UserRole,
  domain: keyof RolePermissions
): Partial<T> {
  const permissions = ROLE_PERMISSIONS[userRole]?.[domain] || []
  
  if (permissions.includes('*')) {
    return api // Full access
  }
  
  const filtered: Partial<T> = {}
  for (const [key, value] of Object.entries(api)) {
    if (permissions.includes(key)) {
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
let createAuthAPI: any, createSettingsAPI: any, createAcademicAPI: any
let createFinanceAPI: any, createStudentAPI: any, createStaffAPI: any
let createOperationsAPI: any, createReportsAPI: any, createCommunicationsAPI: any
let createSystemAPI: any, createMenuEventAPI: any

export function setAPIFactories(factories: {
  createAuthAPI: any
  createSettingsAPI: any
  createAcademicAPI: any
  createFinanceAPI: any
  createStudentAPI: any
  createStaffAPI: any
  createOperationsAPI: any
  createReportsAPI: any
  createCommunicationsAPI: any
  createSystemAPI: any
  createMenuEventAPI: any
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
