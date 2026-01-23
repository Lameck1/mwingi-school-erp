import type { AuthAPI } from './AuthAPI'
import type { SettingsAPI } from './SettingsAPI'
import type { AcademicAPI } from './AcademicAPI'
import type { FinanceAPI } from './FinanceAPI'
import type { StudentAPI } from './StudentAPI'
import type { StaffAPI } from './StaffAPI'
import type { PayrollAPI } from './PayrollAPI'
import type { InventoryAPI } from './InventoryAPI'
import type { ReportsAPI } from './ReportsAPI'
import type { BackupAPI } from './BackupAPI'
import type { UserAPI } from './UserAPI'
import type { AuditAPI } from './AuditAPI'

export * from './AuthAPI'
export * from './SettingsAPI'
export * from './AcademicAPI'
export * from './FinanceAPI'
export * from './StudentAPI'
export * from './StaffAPI'
export * from './PayrollAPI'
export * from './InventoryAPI'
export * from './BackupAPI'
// Export specific types to avoid conflicts
export type { User, CreateUserData, UpdateUserData } from './UserAPI'
export type { AuditLogEntry } from './AuditAPI'
export type { FeeCollectionItem } from './ReportsAPI'

// Combined interface for backward compatibility
export interface ElectronAPI 
  extends AuthAPI, 
          SettingsAPI, 
          AcademicAPI, 
          FinanceAPI, 
          StudentAPI, 
          StaffAPI, 
          PayrollAPI, 
          InventoryAPI, 
          ReportsAPI, 
          BackupAPI, 
          UserAPI, 
          AuditAPI {}