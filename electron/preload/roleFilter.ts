/**
 * Runtime role-aware API filtering for preload.
 *
 * NOTE:
 * - Main-process authorization is the real security boundary.
 * - This runtime filter reduces accidental access from the renderer by
 *   denying methods outside the active role's permissions.
 */

export type UserRole =
  | 'ADMIN'
  | 'ACCOUNTS_CLERK'
  | 'AUDITOR'
  | 'PRINCIPAL'
  | 'DEPUTY_PRINCIPAL'
  | 'TEACHER'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type APIMethod = (...args: any[]) => any
type APISlice = Record<string, APIMethod>

interface APIFactories {
  createAuthAPI: () => APISlice
  createSettingsAPI: () => APISlice
  createAcademicAPI: () => APISlice
  createFinanceAPI: () => APISlice
  createStudentAPI: () => APISlice
  createStaffAPI: () => APISlice
  createOperationsAPI: () => APISlice
  createReportsAPI: () => APISlice
  createCommunicationsAPI: () => APISlice
  createSystemAPI: () => APISlice
  createMenuEventAPI: () => APISlice
}

interface RolePermissions {
  finance: string[]
  academic: string[]
  students: string[]
  staff: string[]
  reports: string[]
  settings: string[]
  operations: string[]
  communications: string[]
  system: string[]
}

export interface RoleAwareAPI {
  auth: APISlice
  settings: APISlice
  academic: APISlice
  finance: APISlice
  students: APISlice
  staff: APISlice
  operations: APISlice
  reports: APISlice
  communications: APISlice
  system: APISlice
  menuEvents: APISlice
}

const READ_ONLY_SENTINEL = ':read'
const READ_ONLY_METHOD_PREFIXES = ['get', 'list', 'has', 'on', 'validate', 'calculate']
const VALID_ROLES: readonly UserRole[] = ['ADMIN', 'ACCOUNTS_CLERK', 'AUDITOR', 'PRINCIPAL', 'DEPUTY_PRINCIPAL', 'TEACHER']

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  ADMIN: {
    finance: ['*'],
    academic: ['*'],
    students: ['*'],
    staff: ['*'],
    reports: ['*'],
    settings: ['*'],
    operations: ['*'],
    communications: ['*'],
    system: ['*']
  },
  ACCOUNTS_CLERK: {
    finance: ['*'],
    academic: [READ_ONLY_SENTINEL],
    students: [READ_ONLY_SENTINEL],
    staff: [READ_ONLY_SENTINEL],
    reports: ['*'],
    settings: ['getSettings', 'get'],
    operations: [READ_ONLY_SENTINEL],
    communications: ['sendSMS'],
    system: ['createBackup', 'createBackupTo', 'getBackupList', 'openBackupFolder']
  },
  AUDITOR: {
    finance: [READ_ONLY_SENTINEL],
    academic: [READ_ONLY_SENTINEL],
    students: [READ_ONLY_SENTINEL],
    staff: [READ_ONLY_SENTINEL],
    reports: ['*'],
    settings: ['getSettings', 'get'],
    operations: [READ_ONLY_SENTINEL],
    communications: [],
    system: ['getBackupList']
  },
  PRINCIPAL: {
    finance: [READ_ONLY_SENTINEL],
    academic: ['*'],
    students: ['*'],
    staff: ['*'],
    reports: ['*'],
    settings: ['*'],
    operations: ['*'],
    communications: ['*'],
    system: ['*']
  },
  DEPUTY_PRINCIPAL: {
    finance: [READ_ONLY_SENTINEL],
    academic: ['*'],
    students: ['*'],
    staff: [READ_ONLY_SENTINEL],
    reports: ['*'],
    settings: ['getSettings', 'get'],
    operations: ['*'],
    communications: ['*'],
    system: ['createBackup', 'createBackupTo', 'getBackupList', 'openBackupFolder']
  },
  TEACHER: {
    finance: [],
    academic: [READ_ONLY_SENTINEL, 'markAttendance', 'saveAcademicResults'],
    students: [READ_ONLY_SENTINEL],
    staff: [READ_ONLY_SENTINEL],
    reports: [READ_ONLY_SENTINEL],
    settings: ['getSettings', 'get'],
    operations: [READ_ONLY_SENTINEL],
    communications: ['sendSMS'],
    system: []
  }
}

let factories: APIFactories | null = null
let currentRole: UserRole = 'AUDITOR'

function isReadOnlyMethod(methodName: string): boolean {
  const normalized = methodName.trim().toLowerCase()
  return READ_ONLY_METHOD_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function isUserRole(value: string): value is UserRole {
  return (VALID_ROLES as readonly string[]).includes(value)
}

export function normalizeUserRole(rawRole: unknown): UserRole {
  if (typeof rawRole !== 'string') {
    return 'AUDITOR'
  }
  const normalized = rawRole.trim().toUpperCase()
  return isUserRole(normalized) ? normalized : 'AUDITOR'
}

export function setCurrentRole(role: unknown): void {
  currentRole = normalizeUserRole(role)
}

export function getCurrentRole(): UserRole {
  return currentRole
}

function getPermissions(role: UserRole, domain: keyof RolePermissions): string[] {
  return ROLE_PERMISSIONS[role][domain]
}

function isMethodAllowed(role: UserRole, domain: keyof RolePermissions, methodName: string): boolean {
  const permissions = getPermissions(role, domain)
  if (permissions.includes('*')) {
    return true
  }
  if (permissions.includes(READ_ONLY_SENTINEL) && isReadOnlyMethod(methodName)) {
    return true
  }
  return permissions.includes(methodName)
}

export function filterAPIByRole<T extends APISlice>(
  api: T,
  userRole: UserRole,
  domain: keyof RolePermissions
): Partial<T> {
  const filtered: Partial<T> = {}
  for (const methodName of Object.keys(api) as Array<keyof T>) {
    if (isMethodAllowed(userRole, domain, String(methodName))) {
      filtered[methodName] = api[methodName]
    }
  }
  return filtered
}

function requireFactories(): APIFactories {
  if (!factories) {
    throw new Error('Preload API factories are not initialized')
  }
  return factories
}

function createDomainGuard<T extends APISlice>(
  api: T,
  domain: keyof RolePermissions,
  getRole: () => UserRole
): T {
  const guarded: Partial<T> = {}
  for (const methodName of Object.keys(api) as Array<keyof T>) {
    const originalMethod = api[methodName]
    guarded[methodName] = ((...args: unknown[]) => {
      const role = getRole()
      const allowed = isMethodAllowed(role, domain, String(methodName))
      if (!allowed) {
        return Promise.reject(
          new Error(`Renderer role '${role}' cannot invoke '${String(methodName)}' in '${domain}' domain`)
        )
      }
      if (!originalMethod) {
        return Promise.reject(new Error(`Method '${String(methodName)}' not found in '${domain}' domain`))
      }
      return originalMethod(...args)
    }) as T[keyof T]
  }
  return guarded as T
}

export function createRoleAwareAPI(userRole: UserRole): RoleAwareAPI {
  const f = requireFactories()
  return {
    auth: f.createAuthAPI(),
    settings: filterAPIByRole(f.createSettingsAPI(), userRole, 'settings') as APISlice,
    academic: filterAPIByRole(f.createAcademicAPI(), userRole, 'academic') as APISlice,
    finance: filterAPIByRole(f.createFinanceAPI(), userRole, 'finance') as APISlice,
    students: filterAPIByRole(f.createStudentAPI(), userRole, 'students') as APISlice,
    staff: filterAPIByRole(f.createStaffAPI(), userRole, 'staff') as APISlice,
    operations: filterAPIByRole(f.createOperationsAPI(), userRole, 'operations') as APISlice,
    reports: filterAPIByRole(f.createReportsAPI(), userRole, 'reports') as APISlice,
    communications: filterAPIByRole(f.createCommunicationsAPI(), userRole, 'communications') as APISlice,
    system: filterAPIByRole(f.createSystemAPI(), userRole, 'system') as APISlice,
    menuEvents: f.createMenuEventAPI()
  }
}

export function createRuntimeRoleAwareAPI(getRole: () => UserRole): RoleAwareAPI {
  const full = createRoleAwareAPI('ADMIN')
  return {
    auth: full.auth,
    settings: createDomainGuard(full.settings, 'settings', getRole),
    academic: createDomainGuard(full.academic, 'academic', getRole),
    finance: createDomainGuard(full.finance, 'finance', getRole),
    students: createDomainGuard(full.students, 'students', getRole),
    staff: createDomainGuard(full.staff, 'staff', getRole),
    operations: createDomainGuard(full.operations, 'operations', getRole),
    reports: createDomainGuard(full.reports, 'reports', getRole),
    communications: createDomainGuard(full.communications, 'communications', getRole),
    system: createDomainGuard(full.system, 'system', getRole),
    menuEvents: full.menuEvents
  }
}

export function setAPIFactories(nextFactories: APIFactories): void {
  factories = nextFactories
}
